-- Existing NULL professionals remain a shared legacy slot; no historical assignment is guessed.
ALTER TABLE public.appointment_availability ADD COLUMN professional text CHECK (professional IN ('raquel','iarytsa'));
ALTER TABLE public.appointments ADD COLUMN professional text CHECK (professional IN ('raquel','iarytsa'));
ALTER TABLE public.appointment_availability DROP CONSTRAINT appointment_availability_available_date_available_time_key;
CREATE UNIQUE INDEX availability_professional_slot_uidx ON public.appointment_availability(available_date,available_time,coalesce(professional,'legacy'));
DROP INDEX public.appointments_active_slot_uidx;
CREATE UNIQUE INDEX appointments_active_professional_slot_uidx ON public.appointments(appointment_at,coalesce(professional,'legacy')) WHERE status <> 'cancelado' AND coalesce(request_status,'') <> 'recusado';

CREATE FUNCTION private.guard_professional_booking() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.appointment_at IS NOT DISTINCT FROM OLD.appointment_at AND NEW.professional IS NOT DISTINCT FROM OLD.professional AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.request_status IS NOT DISTINCT FROM OLD.request_status THEN RETURN NEW; END IF;
 IF NEW.status='cancelado' OR coalesce(NEW.request_status,'')='recusado' THEN RETURN NEW; END IF;
 -- Serialize the whole date, including NULL legacy slots that conflict with either professional.
 PERFORM pg_advisory_xact_lock(hashtextextended((NEW.appointment_at AT TIME ZONE 'America/Sao_Paulo')::date::text,27191));
 IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.id<>NEW.id AND a.appointment_at=NEW.appointment_at AND a.status<>'cancelado' AND coalesce(a.request_status,'')<>'recusado' AND (a.professional IS NULL OR NEW.professional IS NULL OR a.professional=NEW.professional)) THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_professional_booking() FROM PUBLIC;
CREATE TRIGGER guard_professional_booking BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION private.guard_professional_booking();

-- Intentionally public, narrow read API; excludes all customer data.
CREATE FUNCTION public.get_professional_available_slots(p_from_date date) RETURNS TABLE(id uuid,available_date date,available_time time,professional text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT DISTINCT ON(aa.available_date,aa.available_time,p.professional) aa.id,aa.available_date,aa.available_time,p.professional
 FROM public.appointment_availability aa CROSS JOIN (VALUES('raquel'::text),('iarytsa'::text)) p(professional)
 WHERE aa.active AND (aa.professional IS NULL OR aa.professional=p.professional)
 AND aa.available_date BETWEEN greatest(coalesce(p_from_date,timezone('America/Sao_Paulo',now())::date),timezone('America/Sao_Paulo',now())::date) AND timezone('America/Sao_Paulo',now())::date+180
 AND aa.available_date::timestamp+aa.available_time>timezone('America/Sao_Paulo',now())
 AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.appointment_at=(aa.available_date::timestamp+aa.available_time) AT TIME ZONE 'America/Sao_Paulo' AND a.status<>'cancelado' AND coalesce(a.request_status,'')<>'recusado' AND (a.professional IS NULL OR a.professional=p.professional))
 ORDER BY aa.available_date,aa.available_time,p.professional,aa.professional NULLS LAST LIMIT 4000;
$$;
REVOKE ALL ON FUNCTION public.get_professional_available_slots(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_available_slots(date) TO anon,authenticated;

-- Public booking entrypoint: validates professionals, live slots, quantities and official prices.
CREATE FUNCTION public.create_professional_appointment_request(p_client_name text,p_client_phone text,p_items jsonb,p_professional text,p_available_date date,p_available_time time,p_notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;v_name text:=btrim(coalesce(p_client_name,''));v_phone text:=regexp_replace(coalesce(p_client_phone,''),'[^0-9]','','g');v_now timestamp:=timezone('America/Sao_Paulo',now());v_slot timestamp;v_total numeric:=0;v_service public.services%rowtype;v_item jsonb;v_quantity int;v_first uuid;v_names text:='';v_seen uuid[]:='{}';
BEGIN
 IF p_professional IS NULL OR p_professional NOT IN ('raquel','iarytsa') THEN RAISE EXCEPTION 'PROFISSIONAL_INVALIDA' USING ERRCODE='22023'; END IF;
 IF char_length(v_name)<2 OR char_length(v_name)>80 THEN RAISE EXCEPTION 'DADOS_INVALIDOS' USING ERRCODE='22023'; END IF;
 IF char_length(v_phone) IN(10,11) THEN v_phone:='55'||v_phone; END IF;
 IF v_phone!~'^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'TELEFONE_INVALIDO' USING ERRCODE='22023'; END IF;
 IF p_available_date IS NULL OR p_available_time IS NULL THEN RAISE EXCEPTION 'HORARIO_INVALIDO' USING ERRCODE='22023'; END IF;
 v_slot:=p_available_date::timestamp+p_available_time;
 IF v_slot<=v_now OR p_available_date>v_now::date+180 THEN RAISE EXCEPTION 'HORARIO_INVALIDO' USING ERRCODE='22023'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>20 THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF coalesce(v_item->>'quantity','')!~'^[0-9]{1,2}$' OR coalesce(v_item->>'service_id','')!~'^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
  v_quantity:=(v_item->>'quantity')::int;
  IF v_quantity<1 OR v_quantity>20 THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_service FROM public.services WHERE id=(v_item->>'service_id')::uuid AND active;
  IF NOT FOUND OR v_service.id=ANY(v_seen) THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_service.id);v_first:=coalesce(v_first,v_service.id);v_total:=v_total+v_service.price*v_quantity;
  v_names:=v_names||CASE WHEN v_names='' THEN '' ELSE ', ' END||v_quantity::text||'x '||v_service.name;
 END LOOP;
 -- Serialize the rate limit for the submitted telephone as well as the slot date.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_phone,27192));
 IF (SELECT count(*) FROM public.appointments WHERE client_phone=v_phone AND created_at>=now()-interval '30 minutes')>=3 THEN RAISE EXCEPTION 'LIMITE_SOLICITACOES' USING ERRCODE='P0001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_available_date::text,27191));
 PERFORM aa.id FROM public.appointment_availability aa WHERE aa.available_date=p_available_date AND aa.available_time=p_available_time AND aa.active AND (aa.professional=p_professional OR aa.professional IS NULL) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.appointments(client_name,client_phone,service_id,service_name,amount,appointment_at,status,request_status,professional,notes,counted_as_revenue)
 VALUES(v_name,v_phone,v_first,v_names,v_total,v_slot AT TIME ZONE 'America/Sao_Paulo','agendado','pendente',p_professional,'Profissional: '||CASE p_professional WHEN 'raquel' THEN 'Raquel' ELSE 'Iarytsa' END||'. Serviços: '||v_names||'. Aguardando confirmação do Studio.'||CASE WHEN nullif(btrim(p_notes),'') IS NOT NULL THEN E'\nObservação da cliente: '||left(p_notes,500) ELSE '' END,false) RETURNING id INTO v_id;
 RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION public.create_professional_appointment_request(text,text,jsonb,text,date,time,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_professional_appointment_request(text,text,jsonb,text,date,time,text) TO anon,authenticated;

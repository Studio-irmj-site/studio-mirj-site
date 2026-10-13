alter table public.appointments drop constraint appointments_professional_check;
alter table public.appointments add constraint appointments_professional_check check(professional in ('raquel','iarytsa','both'));

CREATE OR REPLACE FUNCTION public.create_professional_appointment_request(p_client_name text, p_client_phone text, p_items jsonb, p_professional text, p_available_date date, p_available_time time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_id uuid;v_name text:=btrim(coalesce(p_client_name,''));v_phone text:=regexp_replace(coalesce(p_client_phone,''),'[^0-9]','','g');v_now timestamp:=timezone('America/Sao_Paulo',now());v_slot timestamp;v_total numeric:=0;v_service public.services%rowtype;v_item jsonb;v_quantity int;v_first uuid;v_names text:='';v_seen uuid[]:='{}';v_price numeric;v_promo_title text;v_price_notes text:='';v_joint boolean:=false;v_foot boolean:=false;v_hand boolean:=false;v_normal_name text;v_prof text;
BEGIN
 IF p_professional IS NULL OR p_professional NOT IN ('raquel','iarytsa','both') THEN RAISE EXCEPTION 'PROFISSIONAL_INVALIDA' USING ERRCODE='22023'; END IF;
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
  SELECT * INTO v_service FROM public.services WHERE id=(v_item->>'service_id')::uuid AND active FOR SHARE;
  IF NOT FOUND OR v_service.id=ANY(v_seen) THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
  v_normal_name:=regexp_replace(translate(lower(v_service.name),'éãáàâêíóôõúç','eaaaaeiooouc'),'[^a-z0-9]','','g');
  v_joint:=v_joint OR v_normal_name IN ('peemao','pemao');v_foot:=v_foot OR v_normal_name='pe';v_hand:=v_hand OR v_normal_name='mao';
  v_price:=v_service.price;v_promo_title:=null;
  SELECT sp.price,sp.title INTO v_price,v_promo_title FROM public.service_promotions sp
  WHERE sp.active AND sp.service_id=v_service.id AND sp.start_date<=p_available_date AND sp.end_date>=p_available_date
   AND (sp.professional IS NULL OR sp.professional=p_professional) AND sp.price<v_service.price
  ORDER BY sp.price,sp.id LIMIT 1 FOR SHARE;
  v_price:=coalesce(v_price,v_service.price);
  IF v_item ? 'unit_price' THEN
   IF coalesce(v_item->>'unit_price','')!~'^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'PRECO_INVALIDO' USING ERRCODE='22023'; END IF;
   IF (v_item->>'unit_price')::numeric<>v_price THEN RAISE EXCEPTION 'PROMOCAO_ALTERADA' USING ERRCODE='P0001'; END IF;
  END IF;
  v_price_notes:=v_price_notes||CASE WHEN v_price_notes='' THEN '' ELSE '; ' END||v_service.name||': R$ '||v_price::text||
   CASE WHEN v_promo_title IS NOT NULL THEN ' (Promoção: '||v_promo_title||')' ELSE '' END;
  v_seen:=array_append(v_seen,v_service.id);v_first:=coalesce(v_first,v_service.id);v_total:=v_total+v_price*v_quantity;
  v_names:=v_names||CASE WHEN v_names='' THEN '' ELSE ', ' END||v_quantity::text||'x '||v_service.name;
 END LOOP;
 IF (v_joint OR (v_foot AND v_hand)) AND p_professional<>'both' THEN RAISE EXCEPTION 'PE_MAO_EXIGE_DUAS_PROFISSIONAIS' USING ERRCODE='22023';END IF;
 IF p_professional='both' AND NOT(v_joint OR (v_foot AND v_hand)) THEN RAISE EXCEPTION 'PROFISSIONAL_INVALIDA' USING ERRCODE='22023';END IF;
 -- Serialize the rate limit for the submitted telephone as well as the slot date.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_phone,27192));
 IF (SELECT count(*) FROM public.appointments WHERE client_phone=v_phone AND created_at>=now()-interval '30 minutes')>=3 THEN RAISE EXCEPTION 'LIMITE_SOLICITACOES' USING ERRCODE='P0001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_available_date::text,27191));
 FOR v_prof IN SELECT x FROM unnest(CASE WHEN p_professional='both' THEN ARRAY['raquel','iarytsa'] ELSE ARRAY[p_professional] END) x LOOP
  PERFORM aa.id FROM public.appointment_availability aa WHERE aa.available_date=p_available_date AND aa.available_time=p_available_time AND aa.active AND (aa.professional=v_prof OR aa.professional IS NULL) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
 END LOOP;
 INSERT INTO public.appointments(client_name,client_phone,service_id,service_name,amount,appointment_at,status,request_status,professional,notes,counted_as_revenue)
 VALUES(v_name,v_phone,v_first,v_names,v_total,v_slot AT TIME ZONE 'America/Sao_Paulo','agendado','pendente',p_professional,'Profissional: '||CASE p_professional WHEN 'raquel' THEN 'Raquel' WHEN 'both' THEN 'Raquel e Iarytsa juntas' ELSE 'Iarytsa' END||'. Serviços: '||v_names||'. Valores aplicados: '||v_price_notes||'. Aguardando confirmação do Studio.'||CASE WHEN nullif(btrim(p_notes),'') IS NOT NULL THEN E'\nObservação da cliente: '||left(p_notes,500) ELSE '' END,false) RETURNING id INTO v_id;
 RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001';
END $function$;

CREATE OR REPLACE FUNCTION private.guard_professional_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.appointment_at IS NOT DISTINCT FROM OLD.appointment_at AND NEW.professional IS NOT DISTINCT FROM OLD.professional AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.request_status IS NOT DISTINCT FROM OLD.request_status THEN RETURN NEW; END IF;
 IF NEW.status='cancelado' OR coalesce(NEW.request_status,'')='recusado' THEN RETURN NEW; END IF;
 -- Serialize the whole date, including NULL legacy slots that conflict with either professional.
 PERFORM pg_advisory_xact_lock(hashtextextended((NEW.appointment_at AT TIME ZONE 'America/Sao_Paulo')::date::text,27191));
 IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.id<>NEW.id AND a.appointment_at=NEW.appointment_at AND a.status<>'cancelado' AND coalesce(a.request_status,'')<>'recusado' AND (a.professional IS NULL OR NEW.professional IS NULL OR a.professional='both' OR NEW.professional='both' OR a.professional=NEW.professional)) THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_professional_available_slots(p_from_date date)
 RETURNS TABLE(id uuid, available_date date, available_time time without time zone, professional text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT DISTINCT ON(aa.available_date,aa.available_time,p.professional) aa.id,aa.available_date,aa.available_time,p.professional
 FROM public.appointment_availability aa CROSS JOIN (VALUES('raquel'::text),('iarytsa'::text)) p(professional)
 WHERE aa.active AND (aa.professional IS NULL OR aa.professional=p.professional)
 AND aa.available_date BETWEEN greatest(coalesce(p_from_date,timezone('America/Sao_Paulo',now())::date),timezone('America/Sao_Paulo',now())::date) AND timezone('America/Sao_Paulo',now())::date+180
 AND aa.available_date::timestamp+aa.available_time>timezone('America/Sao_Paulo',now())
 AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.appointment_at=(aa.available_date::timestamp+aa.available_time) AT TIME ZONE 'America/Sao_Paulo' AND a.status<>'cancelado' AND coalesce(a.request_status,'')<>'recusado' AND (a.professional IS NULL OR a.professional='both' OR a.professional=p.professional))
 ORDER BY aa.available_date,aa.available_time,p.professional,aa.professional NULLS LAST LIMIT 4000;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reschedule_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_date date, p_time time without time zone, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare a public.appointments%rowtype;v_at timestamptz;v_now timestamp:=timezone('America/Sao_Paulo',now());v_old_date date;v_amount numeric;v_prof text;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found then raise exception 'AGENDAMENTO_NAO_ENCONTRADO' using errcode='P0001';end if;
 if p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at then raise exception 'AGENDAMENTO_ALTERADO' using errcode='P0001';end if;
 if a.status not in ('agendado','confirmado') or coalesce(a.request_status,'')='recusado' or a.counted_as_revenue then raise exception 'AGENDAMENTO_ENCERRADO' using errcode='P0001';end if;
 if a.professional is null or a.professional not in ('raquel','iarytsa','both') then raise exception 'PROFISSIONAL_NAO_DEFINIDA' using errcode='22023';end if;
 if p_date is null or p_time is null or p_date::timestamp+p_time<=v_now or p_date>v_now::date+180 then raise exception 'HORARIO_INVALIDO' using errcode='22023';end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 or p_amount<>round(p_amount,2) then raise exception 'VALOR_INVALIDO' using errcode='22023';end if;
 v_at:=(p_date::timestamp+p_time) at time zone 'America/Sao_Paulo';v_amount:=p_amount;
 if v_at=a.appointment_at then raise exception 'ESCOLHA_NOVO_HORARIO' using errcode='22023';end if;
 v_old_date:=(a.appointment_at at time zone 'America/Sao_Paulo')::date;
 -- Same locks used by public booking and the conflict trigger, in stable order.
 perform pg_advisory_xact_lock(hashtextextended(least(v_old_date,p_date)::text,27191));
 if v_old_date<>p_date then perform pg_advisory_xact_lock(hashtextextended(greatest(v_old_date,p_date)::text,27191));end if;
 for v_prof in select x from unnest(case when a.professional='both' then array['raquel','iarytsa'] else array[a.professional] end) x loop
  perform aa.id from public.appointment_availability aa where aa.active and aa.available_date=p_date and aa.available_time=p_time and (aa.professional=v_prof or aa.professional is null) for share;
  if not found then raise exception 'HORARIO_INDISPONIVEL' using errcode='P0001';end if;
 end loop;
 if exists(select 1 from public.appointments other where other.id<>a.id and other.appointment_at between v_at-interval '29 minutes' and v_at+interval '29 minutes' and other.status<>'cancelado' and coalesce(other.request_status,'')<>'recusado' and (other.professional is null or other.professional='both' or a.professional='both' or other.professional=a.professional)) then raise exception 'HORARIO_INDISPONIVEL' using errcode='P0001';end if;
 update public.appointments set appointment_at=v_at,amount=v_amount,updated_at=clock_timestamp(),notes=coalesce(a.notes,'')||E'\nAlteração de horário pelo painel: '||to_char(a.appointment_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' → '||to_char(v_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'. Valor: R$ '||a.amount::text||' → R$ '||v_amount::text||'.' where id=a.id;
 return jsonb_build_object('id',a.id,'old_at',a.appointment_at,'appointment_at',v_at,'amount',v_amount,'professional',a.professional,'status',a.status);
end;
$function$;

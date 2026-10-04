-- Customer accounts have no bearer links and never claim reservations by phone.
-- Existing reservations remain admin-managed; only bookings created while signed
-- in are linked to the authenticated account, inside the booking transaction.
CREATE SCHEMA customer_private;
REVOKE ALL ON SCHEMA customer_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA customer_private TO authenticated;
CREATE TABLE customer_private.appointment_owners (
 appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE INDEX customer_appointment_owner_idx ON customer_private.appointment_owners(user_id);
ALTER TABLE customer_private.appointment_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_private.appointment_owners FROM PUBLIC,anon,authenticated;

CREATE FUNCTION customer_private.require_customer() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=auth.uid();v_session text:=auth.jwt()->>'session_id';
BEGIN
 IF v_user IS NULL OR v_session IS NULL OR NOT EXISTS(
 SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
 WHERE u.id=v_user AND s.id::text=v_session AND (s.not_after IS NULL OR s.not_after>now())
 AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
 RAISE EXCEPTION 'LOGIN_NECESSARIO' USING ERRCODE='42501'; END IF;
 RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION customer_private.require_customer() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION customer_private.require_customer() TO authenticated;

CREATE TABLE public.customer_profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name text NOT NULL CHECK(char_length(btrim(full_name)) BETWEEN 2 AND 80),
 phone text NOT NULL CHECK(phone ~ '^55[0-9]{10,11}$')
);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_profiles FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.customer_profiles TO authenticated;
CREATE POLICY customer_profile_read ON public.customer_profiles FOR SELECT TO authenticated USING(user_id=(SELECT customer_private.require_customer()));
CREATE POLICY customer_profile_insert ON public.customer_profiles FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT customer_private.require_customer()));
CREATE POLICY customer_profile_update ON public.customer_profiles FOR UPDATE TO authenticated USING(user_id=(SELECT customer_private.require_customer())) WITH CHECK(user_id=(SELECT customer_private.require_customer()));

-- Legacy permissive policies predate customer signups. Restrictive boundaries
-- preserve staff access and deny customers direct access to business data.
CREATE POLICY customer_account_boundary ON public.appointments AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.is_admin())) WITH CHECK((SELECT private.is_admin()));
CREATE POLICY customer_account_boundary ON public.clients AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.is_admin())) WITH CHECK((SELECT private.is_admin()));
CREATE POLICY customer_account_boundary ON public.expenses AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.is_admin())) WITH CHECK((SELECT private.is_admin()));

CREATE FUNCTION customer_private.create_request(p_client_name text,p_client_phone text,p_items jsonb,p_professional text,p_available_date date,p_available_time time,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=customer_private.require_customer();v_id uuid;
BEGIN
 v_id:=public.create_professional_appointment_request(p_client_name,p_client_phone,p_items,p_professional,p_available_date,p_available_time,p_notes);
 INSERT INTO customer_private.appointment_owners(appointment_id,user_id) VALUES(v_id,v_user);
 INSERT INTO public.customer_profiles(user_id,full_name,phone) VALUES(v_user,btrim(p_client_name),CASE WHEN char_length(regexp_replace(p_client_phone,'[^0-9]','','g')) IN(10,11) THEN '55'||regexp_replace(p_client_phone,'[^0-9]','','g') ELSE regexp_replace(p_client_phone,'[^0-9]','','g') END) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,phone=excluded.phone;
 RETURN v_id;
END $$;

CREATE FUNCTION customer_private.get_appointment(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=customer_private.require_customer();v_result jsonb;
BEGIN
 SELECT jsonb_build_object('id',a.id,'service_name',a.service_name,'professional',a.professional,'appointment_at',a.appointment_at,'status',a.status,'request_status',a.request_status,'updated_at',a.updated_at,
 'can_manage',a.appointment_at>now() AND a.status IN ('agendado','confirmado') AND coalesce(a.request_status,'')<>'recusado' AND NOT coalesce(a.counted_as_revenue,false))
 INTO v_result FROM customer_private.appointment_owners o JOIN public.appointments a ON a.id=o.appointment_id WHERE a.id=p_id AND o.user_id=v_user;
 IF v_result IS NULL THEN RAISE EXCEPTION 'AGENDAMENTO_INDISPONIVEL' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;

CREATE FUNCTION customer_private.list_appointments() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=customer_private.require_customer();v_result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(customer_private.get_appointment(a.id) ORDER BY a.appointment_at DESC),'[]'::jsonb) INTO v_result FROM
 (SELECT appointments.id,appointment_at FROM customer_private.appointment_owners o JOIN public.appointments ON appointments.id=o.appointment_id WHERE o.user_id=v_user ORDER BY appointment_at DESC LIMIT 100) a;
 RETURN v_result;
END $$;

CREATE FUNCTION customer_private.change_appointment(p_id uuid,p_action text,p_expected_updated_at timestamptz,p_available_date date,p_available_time time)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=customer_private.require_customer();v_a public.appointments%rowtype;v_slot timestamptz;v_now timestamp:=timezone('America/Sao_Paulo',now());
BEGIN
 IF NOT EXISTS(SELECT 1 FROM customer_private.appointment_owners WHERE appointment_id=p_id AND user_id=v_user) THEN RAISE EXCEPTION 'AGENDAMENTO_INDISPONIVEL' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('cancel','reschedule') THEN RAISE EXCEPTION 'ACAO_INVALIDA' USING ERRCODE='22023'; END IF;
 IF p_action='reschedule' THEN
  IF p_available_date IS NULL OR p_available_time IS NULL OR p_available_date::timestamp+p_available_time<=v_now OR p_available_date>v_now::date+180 THEN RAISE EXCEPTION 'HORARIO_INVALIDO' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_available_date::text,27191));
  v_slot:=(p_available_date::timestamp+p_available_time) AT TIME ZONE 'America/Sao_Paulo';
 END IF;
 SELECT * INTO v_a FROM public.appointments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AGENDAMENTO_INDISPONIVEL' USING ERRCODE='42501'; END IF;
 IF p_action='cancel' AND v_a.status='cancelado' THEN RETURN customer_private.get_appointment(p_id); END IF;
 IF v_a.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'AGENDAMENTO_ATUALIZADO' USING ERRCODE='P0001'; END IF;
 IF v_a.appointment_at<=now() OR v_a.status NOT IN ('agendado','confirmado') OR coalesce(v_a.request_status,'')='recusado' OR coalesce(v_a.counted_as_revenue,false) THEN RAISE EXCEPTION 'AGENDAMENTO_NAO_EDITAVEL' USING ERRCODE='P0001'; END IF;
 IF p_action='cancel' THEN
  UPDATE public.appointments SET status='cancelado',request_status='recusado',updated_at=clock_timestamp(),notes=coalesce(notes,'')||E'\nCancelado pela cliente pelo site.' WHERE id=p_id;
 ELSE
  IF v_a.professional IS NULL OR v_a.professional NOT IN ('raquel','iarytsa') THEN RAISE EXCEPTION 'AGENDAMENTO_NAO_EDITAVEL' USING ERRCODE='P0001'; END IF;
  IF v_a.appointment_at=v_slot THEN RETURN customer_private.get_appointment(p_id); END IF;
  PERFORM aa.id FROM public.appointment_availability aa WHERE aa.active AND aa.available_date=p_available_date AND aa.available_time=p_available_time AND (aa.professional=v_a.professional OR aa.professional IS NULL) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
  UPDATE public.appointments SET appointment_at=v_slot,status='agendado',request_status='pendente',updated_at=clock_timestamp(),notes=coalesce(notes,'')||E'\nHorário alterado pela cliente de '||to_char(v_a.appointment_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' para '||to_char(v_slot AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'. Aguardando nova confirmação.' WHERE id=p_id;
 END IF;
 RETURN customer_private.get_appointment(p_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION customer_private.create_request(text,text,jsonb,text,date,time,text),customer_private.get_appointment(uuid),customer_private.list_appointments(),customer_private.change_appointment(uuid,text,timestamptz,date,time) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION customer_private.create_request(text,text,jsonb,text,date,time,text),customer_private.get_appointment(uuid),customer_private.list_appointments(),customer_private.change_appointment(uuid,text,timestamptz,date,time) TO authenticated;

CREATE FUNCTION public.create_account_appointment_request(p_client_name text,p_client_phone text,p_items jsonb,p_professional text,p_available_date date,p_available_time time,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT customer_private.create_request(p_client_name,p_client_phone,p_items,p_professional,p_available_date,p_available_time,p_notes); $$;
CREATE FUNCTION public.get_account_appointment(p_appointment_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT customer_private.get_appointment(p_appointment_id); $$;
CREATE FUNCTION public.get_account_appointments()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT customer_private.list_appointments(); $$;
CREATE FUNCTION public.change_account_appointment(p_appointment_id uuid,p_action text,p_expected_updated_at timestamptz,p_available_date date DEFAULT NULL,p_available_time time DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT customer_private.change_appointment(p_appointment_id,p_action,p_expected_updated_at,p_available_date,p_available_time); $$;
REVOKE ALL ON FUNCTION public.create_account_appointment_request(text,text,jsonb,text,date,time,text),public.get_account_appointment(uuid),public.get_account_appointments(),public.change_account_appointment(uuid,text,timestamptz,date,time) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_account_appointment_request(text,text,jsonb,text,date,time,text),public.get_account_appointment(uuid),public.get_account_appointments(),public.change_account_appointment(uuid,text,timestamptz,date,time) TO authenticated;
NOTIFY pgrst,'reload schema';


CREATE TABLE private.service_review_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 appointment_id uuid UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
 attendance_id uuid UNIQUE REFERENCES public.attendances(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
 CHECK ((appointment_id IS NOT NULL)::int+(attendance_id IS NOT NULL)::int=1)
);
ALTER TABLE private.service_review_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_review_invites FROM PUBLIC,anon,authenticated;
CREATE TABLE private.service_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invite_id uuid NOT NULL UNIQUE REFERENCES private.service_review_invites(id) ON DELETE CASCADE,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment text NOT NULL DEFAULT '' CHECK(char_length(comment)<=1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.service_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_reviews FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.issue_service_review_link(p_source text,p_source_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_token uuid;v_appointment uuid;v_notes text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_admin() THEN RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE='42501'; END IF;
 IF p_source='appointment' THEN
  IF NOT EXISTS(SELECT 1 FROM public.appointments WHERE id=p_source_id AND status='concluido' AND appointment_at<=now()) THEN RAISE EXCEPTION 'ATENDIMENTO_NAO_CONCLUIDO'; END IF;
  INSERT INTO private.service_review_invites(appointment_id) VALUES(p_source_id) ON CONFLICT(appointment_id) DO NOTHING;
  UPDATE private.service_review_invites i SET expires_at=now()+interval '90 days'
   WHERE i.appointment_id=p_source_id AND i.expires_at<now() AND NOT EXISTS(SELECT 1 FROM private.service_reviews r WHERE r.invite_id=i.id);
  SELECT token INTO v_token FROM private.service_review_invites WHERE appointment_id=p_source_id;
 ELSIF p_source='attendance' THEN
  SELECT notes INTO v_notes FROM public.attendances WHERE id=p_source_id AND attended_at<=now();
  IF NOT FOUND THEN RAISE EXCEPTION 'ATENDIMENTO_NAO_CONCLUIDO'; END IF;
  v_appointment:=substring(v_notes from 'appointment_id:([0-9a-fA-F-]{36})')::uuid;
  IF v_appointment IS NOT NULL THEN RETURN private.issue_service_review_link('appointment',v_appointment); END IF;
  INSERT INTO private.service_review_invites(attendance_id) VALUES(p_source_id) ON CONFLICT(attendance_id) DO NOTHING;
  UPDATE private.service_review_invites i SET expires_at=now()+interval '90 days'
   WHERE i.attendance_id=p_source_id AND i.expires_at<now() AND NOT EXISTS(SELECT 1 FROM private.service_reviews r WHERE r.invite_id=i.id);
  SELECT token INTO v_token FROM private.service_review_invites WHERE attendance_id=p_source_id;
 ELSE RAISE EXCEPTION 'ATENDIMENTO_INVALIDO'; END IF;
 RETURN v_token;
END $$;

-- A random bearer token authorizes only this completed service, never a client-data listing.
CREATE FUNCTION private.get_service_review_context(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
 SELECT jsonb_build_object('service',coalesce(a.service_name,t.service_name,'Atendimento'),
  'professional',a.professional,'date',coalesce(a.appointment_at,t.attended_at),
  'submitted',EXISTS(SELECT 1 FROM private.service_reviews r WHERE r.invite_id=i.id))
 INTO v FROM private.service_review_invites i
 LEFT JOIN public.appointments a ON a.id=i.appointment_id
 LEFT JOIN public.attendances t ON t.id=i.attendance_id
 WHERE i.token=p_token AND i.expires_at>now()
 AND ((a.status='concluido' AND a.appointment_at<=now()) OR (i.attendance_id IS NOT NULL AND t.attended_at<=now()));
 IF v IS NULL THEN RAISE EXCEPTION 'LINK_INVALIDO_OU_EXPIRADO'; END IF;
 RETURN v;
END $$;

CREATE FUNCTION private.submit_service_review(p_token uuid,p_rating integer,p_comment text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_invite uuid;v_id uuid;
BEGIN
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR char_length(coalesce(p_comment,''))>1000 THEN RAISE EXCEPTION 'AVALIACAO_INVALIDA'; END IF;
 PERFORM private.get_service_review_context(p_token);
 SELECT id INTO v_invite FROM private.service_review_invites WHERE token=p_token FOR UPDATE;
 IF EXISTS(SELECT 1 FROM private.service_reviews WHERE invite_id=v_invite) THEN RAISE EXCEPTION 'AVALIACAO_JA_ENVIADA'; END IF;
 INSERT INTO private.service_reviews(invite_id,rating,comment) VALUES(v_invite,p_rating,btrim(coalesce(p_comment,''))) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION private.list_service_review_records(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_admin() THEN RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v FROM (
 SELECT c.*,i.token,r.rating,r.comment,r.created_at AS reviewed_at
 FROM (
  SELECT 'appointment'::text AS source,a.id AS source_id,a.client_name,a.client_phone,a.service_name,a.professional,a.appointment_at AS service_date
  FROM public.appointments a WHERE a.status='concluido' AND a.appointment_at<=now()
  UNION ALL
  SELECT 'attendance',t.id,t.client_name,NULL::text,t.service_name,NULL::text,t.attended_at
  FROM public.attendances t WHERE t.attended_at<=now() AND coalesce(t.notes,'') !~ 'appointment_id:[0-9a-fA-F-]{36}'
 ) c LEFT JOIN private.service_review_invites i ON (c.source='appointment' AND i.appointment_id=c.source_id) OR (c.source='attendance' AND i.attendance_id=c.source_id)
 LEFT JOIN private.service_reviews r ON r.invite_id=i.id
 ORDER BY c.service_date DESC,c.source,c.source_id LIMIT 100 OFFSET greatest(0,least(coalesce(p_offset,0),100000))
 ) x;
 RETURN v;
END $$;

REVOKE ALL ON FUNCTION private.issue_service_review_link(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.get_service_review_context(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.submit_service_review(uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.list_service_review_records(integer) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION private.issue_service_review_link(text,uuid),private.list_service_review_records(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_service_review_context(uuid),private.submit_service_review(uuid,integer,text) TO anon,authenticated;
CREATE FUNCTION public.issue_service_review_link(p_source text,p_source_id uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.issue_service_review_link(p_source,p_source_id); $$;
CREATE FUNCTION public.get_service_review_context(p_token uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.get_service_review_context(p_token); $$;
CREATE FUNCTION public.submit_service_review(p_token uuid,p_rating integer,p_comment text DEFAULT '') RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.submit_service_review(p_token,p_rating,p_comment); $$;
CREATE FUNCTION public.list_service_review_records(p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.list_service_review_records(p_offset); $$;
REVOKE ALL ON FUNCTION public.issue_service_review_link(text,uuid),public.list_service_review_records(integer),public.get_service_review_context(uuid),public.submit_service_review(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_service_review_link(text,uuid),public.list_service_review_records(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_review_context(uuid),public.submit_service_review(uuid,integer,text) TO anon,authenticated;

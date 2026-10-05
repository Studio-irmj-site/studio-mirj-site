-- Public review excerpts are opt-in; older reviews stay private.
ALTER TABLE private.service_reviews ADD COLUMN public_visible boolean NOT NULL DEFAULT false;
CREATE INDEX service_reviews_public_date_idx ON private.service_reviews(created_at DESC,id DESC) WHERE public_visible;

CREATE FUNCTION private.submit_service_review_with_visibility(p_token uuid,p_rating integer,p_comment text,p_public_visible boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
 v_id := private.submit_service_review(p_token,p_rating,p_comment);
 UPDATE private.service_reviews SET public_visible=coalesce(p_public_visible,false) WHERE id=v_id;
 RETURN v_id;
END $$;
-- Intentional public API: returns only consented ratings/comments, never client or invitation data.
CREATE FUNCTION private.list_public_service_reviews(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM private.service_reviews WHERE public_visible),
  'average',(SELECT round(avg(rating),1) FROM private.service_reviews WHERE public_visible),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT rating,comment,created_at AS reviewed_at FROM private.service_reviews
    WHERE public_visible ORDER BY created_at DESC,id DESC
    LIMIT 6 OFFSET greatest(0,least(coalesce(p_offset,0),100000))
  ) x),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.submit_service_review_with_visibility(uuid,integer,text,boolean),private.list_public_service_reviews(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.submit_service_review_with_visibility(uuid,integer,text,boolean),private.list_public_service_reviews(integer) TO anon,authenticated;
CREATE FUNCTION public.submit_service_review_with_visibility(p_token uuid,p_rating integer,p_comment text,p_public_visible boolean) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.submit_service_review_with_visibility(p_token,p_rating,p_comment,p_public_visible); $$;
CREATE FUNCTION public.list_public_service_reviews(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT private.list_public_service_reviews(p_offset); $$;
REVOKE ALL ON FUNCTION public.submit_service_review_with_visibility(uuid,integer,text,boolean),public.list_public_service_reviews(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_service_review_with_visibility(uuid,integer,text,boolean),public.list_public_service_reviews(integer) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

create table public.service_promotions (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 1 and 80),
 service_id uuid not null references public.services(id) on delete restrict,
 price numeric(12,2) not null check(price>0 and price<=1000000),
 start_date date not null,
 end_date date not null check(end_date>=start_date),
 professional text check(professional in ('raquel','iarytsa')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index service_promotions_lookup on public.service_promotions(service_id,start_date,end_date) where active;
alter table public.service_promotions enable row level security;
revoke all on public.service_promotions from public,anon,authenticated;
grant select on public.service_promotions to anon;
grant select,insert,update on public.service_promotions to authenticated;
create policy "visitors read upcoming promotions" on public.service_promotions for select to anon,authenticated using (
 active and end_date>=timezone('America/Sao_Paulo',now())::date and
 exists(select 1 from public.services s where s.id=service_promotions.service_id and s.active and service_promotions.price<s.price)
);
create policy "admins read promotions" on public.service_promotions for select to authenticated using((select private.is_admin()));
create policy "admins insert promotions" on public.service_promotions for insert to authenticated with check((select private.is_admin()));
create policy "admins update promotions" on public.service_promotions for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
-- Validation runs with the writer's own privileges; no privileged endpoint is added.
create function public.validate_service_promotion() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.services s where s.id=new.service_id and new.price<s.price) then
  raise exception 'O valor promocional deve ser menor que o preço normal.' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function public.validate_service_promotion() from public,anon,authenticated;
create trigger validate_service_promotion before insert or update on public.service_promotions for each row execute function public.validate_service_promotion();
CREATE OR REPLACE FUNCTION public.create_professional_appointment_request(p_client_name text, p_client_phone text, p_items jsonb, p_professional text, p_available_date date, p_available_time time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_id uuid;v_name text:=btrim(coalesce(p_client_name,''));v_phone text:=regexp_replace(coalesce(p_client_phone,''),'[^0-9]','','g');v_now timestamp:=timezone('America/Sao_Paulo',now());v_slot timestamp;v_total numeric:=0;v_service public.services%rowtype;v_item jsonb;v_quantity int;v_first uuid;v_names text:='';v_seen uuid[]:='{}';v_price numeric;v_promo_title text;v_price_notes text:='';
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
  SELECT * INTO v_service FROM public.services WHERE id=(v_item->>'service_id')::uuid AND active FOR SHARE;
  IF NOT FOUND OR v_service.id=ANY(v_seen) THEN RAISE EXCEPTION 'SERVICO_INVALIDO' USING ERRCODE='22023'; END IF;
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
 -- Serialize the rate limit for the submitted telephone as well as the slot date.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_phone,27192));
 IF (SELECT count(*) FROM public.appointments WHERE client_phone=v_phone AND created_at>=now()-interval '30 minutes')>=3 THEN RAISE EXCEPTION 'LIMITE_SOLICITACOES' USING ERRCODE='P0001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_available_date::text,27191));
 PERFORM aa.id FROM public.appointment_availability aa WHERE aa.available_date=p_available_date AND aa.available_time=p_available_time AND aa.active AND (aa.professional=p_professional OR aa.professional IS NULL) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.appointments(client_name,client_phone,service_id,service_name,amount,appointment_at,status,request_status,professional,notes,counted_as_revenue)
 VALUES(v_name,v_phone,v_first,v_names,v_total,v_slot AT TIME ZONE 'America/Sao_Paulo','agendado','pendente',p_professional,'Profissional: '||CASE p_professional WHEN 'raquel' THEN 'Raquel' ELSE 'Iarytsa' END||'. Serviços: '||v_names||'. Valores aplicados: '||v_price_notes||'. Aguardando confirmação do Studio.'||CASE WHEN nullif(btrim(p_notes),'') IS NOT NULL THEN E'\nObservação da cliente: '||left(p_notes,500) ELSE '' END,false) RETURNING id INTO v_id;
 RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'HORARIO_INDISPONIVEL' USING ERRCODE='P0001';
END $function$;

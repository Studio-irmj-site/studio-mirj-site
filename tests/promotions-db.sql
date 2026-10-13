-- Run after the migration inside a transaction; all fixtures are rolled back.
select set_config('test.promo_service',gen_random_uuid()::text,true);
select set_config('test.promo_date',(timezone('America/Sao_Paulo',now())::date+70)::text,true);
insert into public.services(id,name,category,price,active) values(current_setting('test.promo_service')::uuid,'TEST PROMOTIONS ROLLBACK','Test',100,true);
insert into public.service_promotions(title,service_id,price,start_date,end_date,professional,active) values
 ('Shared test',current_setting('test.promo_service')::uuid,80,current_setting('test.promo_date')::date,current_setting('test.promo_date')::date,null,true),
 ('Raquel test',current_setting('test.promo_service')::uuid,70,current_setting('test.promo_date')::date,current_setting('test.promo_date')::date,'raquel',true),
 ('Hidden test',current_setting('test.promo_service')::uuid,30,current_setting('test.promo_date')::date,current_setting('test.promo_date')::date,null,false),
 ('Expired test',current_setting('test.promo_service')::uuid,20,'2000-01-01','2000-01-01',null,true);
insert into public.appointment_availability(available_date,available_time,professional,active) values
 (current_setting('test.promo_date')::date,'23:41','raquel',true),
 (current_setting('test.promo_date')::date,'23:42','iarytsa',true),
 (current_setting('test.promo_date')::date+1,'23:43','raquel',true);
set local role anon;
do $$begin
 if (select count(*) from public.service_promotions where service_id=current_setting('test.promo_service')::uuid)<>2 then raise exception 'public visibility failed';end if;
 begin
  insert into public.service_promotions(title,service_id,price,start_date,end_date) values('Forbidden',current_setting('test.promo_service')::uuid,1,current_date,current_date);
  raise exception 'anon write succeeded';
 exception when insufficient_privilege then null;end;
 begin
  perform public.create_professional_appointment_request('Teste promoção','11988887777',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.promo_service'),'quantity',1,'unit_price','100.00')),'raquel',current_setting('test.promo_date')::date,'23:41');
  raise exception 'stale price accepted';
 exception when sqlstate 'P0001' then if sqlerrm<>'PROMOCAO_ALTERADA' then raise;end if;end;
 perform set_config('test.promo_booking',public.create_professional_appointment_request('Teste promoção','11988887777',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.promo_service'),'quantity',2,'unit_price','70.00')),'raquel',current_setting('test.promo_date')::date,'23:41')::text,true);
 perform set_config('test.shared_booking',public.create_professional_appointment_request('Teste promoção','11988886666',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.promo_service'),'quantity',1,'unit_price','80.00')),'iarytsa',current_setting('test.promo_date')::date,'23:42')::text,true);
 perform set_config('test.normal_booking',public.create_professional_appointment_request('Teste promoção','11988885555',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.promo_service'),'quantity',1,'unit_price','100.00')),'raquel',current_setting('test.promo_date')::date+1,'23:43')::text,true);
end;$$;
reset role;
do $$begin
 if (select amount from public.appointments where id=current_setting('test.promo_booking')::uuid)<>140 then raise exception 'quantity or lowest price failed';end if;
 if (select amount from public.appointments where id=current_setting('test.shared_booking')::uuid)<>80 then raise exception 'professional scope failed';end if;
 if (select amount from public.appointments where id=current_setting('test.normal_booking')::uuid)<>100 then raise exception 'date scope failed';end if;
 if not (select notes like '%Raquel test%' from public.appointments where id=current_setting('test.promo_booking')::uuid) then raise exception 'discount audit missing';end if;
 begin
  insert into public.service_promotions(title,service_id,price,start_date,end_date) values('Invalid price',current_setting('test.promo_service')::uuid,110,current_date,current_date);
  raise exception 'invalid price accepted';
 exception when invalid_parameter_value then null;end;
end;$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$declare n integer;begin
 update public.service_promotions set price=10 where service_id=current_setting('test.promo_service')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'non-admin updated promotion';end if;
 begin
  insert into public.service_promotions(title,service_id,price,start_date,end_date) values('Forbidden',current_setting('test.promo_service')::uuid,1,current_date,current_date);
  raise exception 'non-admin insert succeeded';
 exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.admins limit 1),true);
set local role authenticated;
do $$declare n integer;begin
 update public.service_promotions set active=false where service_id=current_setting('test.promo_service')::uuid;
 get diagnostics n=row_count;if n<>4 then raise exception 'admin cannot pause promotions';end if;
end;$$;
reset role;
set local role anon;
do $$begin if exists(select 1 from public.service_promotions where service_id=current_setting('test.promo_service')::uuid)then raise exception 'paused still publicly visible';end if;end;$$;
reset role;
select 'Promotion visibility, roles, dates, professionals, prices and stale quotes passed' as verification;

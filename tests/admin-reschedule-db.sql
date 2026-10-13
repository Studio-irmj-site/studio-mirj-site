-- Transaction-only fixtures; callers must wrap this script in BEGIN/ROLLBACK.
select set_config('test.rs_service',gen_random_uuid()::text,true);
select set_config('test.rs_booking',gen_random_uuid()::text,true);
select set_config('test.rs_blocker',gen_random_uuid()::text,true);
select set_config('test.rs_date',(timezone('America/Sao_Paulo',now())::date+70)::text,true);
insert into public.services(id,name,category,price,active) values(current_setting('test.rs_service')::uuid,'RESCHEDULE ROLLBACK TEST','Test',120,true);
insert into public.appointment_availability(available_date,available_time,professional,active) values
 (current_setting('test.rs_date')::date,'09:01','raquel',true),(current_setting('test.rs_date')::date,'14:01','raquel',true),(current_setting('test.rs_date')::date,'15:01','raquel',true),(current_setting('test.rs_date')::date,'16:01','raquel',false);
insert into public.appointments(id,client_name,service_id,service_name,amount,appointment_at,status,request_status,professional,counted_as_revenue) values
 (current_setting('test.rs_booking')::uuid,'TEST RESCHEDULE',current_setting('test.rs_service')::uuid,'Test',120,(current_setting('test.rs_date')::date+'09:01'::time) at time zone 'America/Sao_Paulo','confirmado','confirmado','raquel',false),
 (current_setting('test.rs_blocker')::uuid,'TEST BLOCKER',current_setting('test.rs_service')::uuid,'Test',120,(current_setting('test.rs_date')::date+'14:01'::time) at time zone 'America/Sao_Paulo','confirmado','confirmado','raquel',false);
select set_config('test.rs_version',(select updated_at::text from public.appointments where id=current_setting('test.rs_booking')::uuid),true);
set local role anon;
do $$begin
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'15:01',120);raise exception 'anon moved booking';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$begin
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'15:01',120);raise exception 'non-admin moved booking';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.admins limit 1),true);
set local role authenticated;
do $$begin
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'14:01',120);raise exception 'conflict accepted';exception when sqlstate 'P0001' then if sqlerrm<>'HORARIO_INDISPONIVEL' then raise;end if;end;
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'16:01',120);raise exception 'blocked availability accepted';exception when sqlstate 'P0001' then if sqlerrm<>'HORARIO_INDISPONIVEL' then raise;end if;end;
 if (select appointment_at at time zone 'America/Sao_Paulo' from public.appointments where id=current_setting('test.rs_booking')::uuid)<>current_setting('test.rs_date')::date+'09:01'::time then raise exception 'failed move changed original';end if;
 perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'15:01',100);
 if not exists(select 1 from public.appointments where id=current_setting('test.rs_booking')::uuid and status='confirmado' and request_status='confirmado' and professional='raquel' and amount=100 and notes like '%Alteração de horário%') then raise exception 'confirmation, price or audit not retained';end if;
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'09:01',100);raise exception 'stale revision accepted';exception when sqlstate 'P0001' then if sqlerrm<>'AGENDAMENTO_ALTERADO' then raise;end if;end;
end;$$;
reset role;
set local role anon;
do $$begin
 if not exists(select 1 from public.get_professional_available_slots(current_setting('test.rs_date')::date) where available_date=current_setting('test.rs_date')::date and available_time='09:01' and professional='raquel') then raise exception 'old slot not released';end if;
 if exists(select 1 from public.get_professional_available_slots(current_setting('test.rs_date')::date) where available_date=current_setting('test.rs_date')::date and available_time='15:01' and professional='raquel') then raise exception 'new slot still exposed';end if;
end;$$;
reset role;
select set_config('test.rs_version',(select updated_at::text from public.appointments where id=current_setting('test.rs_booking')::uuid),true);
update public.appointments set status='concluido',counted_as_revenue=true where id=current_setting('test.rs_booking')::uuid;
set local role authenticated;
do $$begin
 begin perform public.admin_reschedule_appointment(current_setting('test.rs_booking')::uuid,current_setting('test.rs_version')::timestamptz,current_setting('test.rs_date')::date,'09:01',100);raise exception 'completed moved';exception when sqlstate 'P0001' then if sqlerrm<>'AGENDAMENTO_ENCERRADO' then raise;end if;end;
end;$$;
reset role;
select 'Admin-only reschedule, conflict rollback, published availability, stale revisions, preserved confirmation, price review, history and slot release passed' as verification;

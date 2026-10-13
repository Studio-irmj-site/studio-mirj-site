-- Synthetic fixtures must be rolled back by the caller.
select set_config('test.joint_combo',gen_random_uuid()::text,true);
select set_config('test.joint_foot',gen_random_uuid()::text,true);
select set_config('test.joint_hand',gen_random_uuid()::text,true);
select set_config('test.joint_date',(timezone('America/Sao_Paulo',now())::date+65)::text,true);
insert into public.services(id,name,category,price,active) values
 (current_setting('test.joint_combo')::uuid,'Pé e Mão','Test',80,true),
 (current_setting('test.joint_foot')::uuid,'Pé','Test',40,true),
 (current_setting('test.joint_hand')::uuid,'Mão','Test',40,true);
insert into public.appointment_availability(available_date,available_time,professional,active) values
 (current_setting('test.joint_date')::date,'09:02','raquel',true),(current_setting('test.joint_date')::date,'09:02','iarytsa',true),
 (current_setting('test.joint_date')::date,'14:02','raquel',true),(current_setting('test.joint_date')::date,'14:02','iarytsa',true),
 (current_setting('test.joint_date')::date,'15:02','raquel',true),
 (current_setting('test.joint_date')::date,'16:02','raquel',true),(current_setting('test.joint_date')::date,'16:02','iarytsa',true);
set local role anon;
do $$declare items jsonb:=jsonb_build_array(jsonb_build_object('service_id',current_setting('test.joint_combo'),'quantity',1,'unit_price','80.00'));begin
 begin perform public.create_professional_appointment_request('TEST JOINT','11977776666',items,'raquel',current_setting('test.joint_date')::date,'09:02');raise exception 'joint accepted one professional';exception when invalid_parameter_value then if sqlerrm<>'PE_MAO_EXIGE_DUAS_PROFISSIONAIS' then raise;end if;end;
 begin perform public.create_professional_appointment_request('TEST JOINT','11977776666',items,'both',current_setting('test.joint_date')::date,'15:02');raise exception 'missing second availability accepted';exception when sqlstate 'P0001' then if sqlerrm<>'HORARIO_INDISPONIVEL' then raise;end if;end;
 perform set_config('test.joint_booking',public.create_professional_appointment_request('TEST JOINT','11977776666',items,'both',current_setting('test.joint_date')::date,'09:02')::text,true);
 if exists(select 1 from public.get_professional_available_slots(current_setting('test.joint_date')::date) where available_date=current_setting('test.joint_date')::date and available_time='09:02')then raise exception 'joint did not occupy both agendas';end if;
 begin perform public.create_professional_appointment_request('TEST CONFLICT','11977775555',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.joint_hand'),'quantity',1)),'iarytsa',current_setting('test.joint_date')::date,'09:02');raise exception 'individual overlaps joint';exception when sqlstate 'P0001' then if sqlerrm<>'HORARIO_INDISPONIVEL' then raise;end if;end;
 perform public.create_professional_appointment_request('TEST SEPARATE','11977774444',jsonb_build_array(jsonb_build_object('service_id',current_setting('test.joint_foot'),'quantity',1),jsonb_build_object('service_id',current_setting('test.joint_hand'),'quantity',1)),'both',current_setting('test.joint_date')::date,'16:02');
end;$$;
reset role;
do $$begin if not exists(select 1 from public.appointments where id=current_setting('test.joint_booking')::uuid and professional='both' and amount=80 and notes like '%Raquel e Iarytsa juntas%')then raise exception 'joint assignment or total incorrect';end if;end;$$;
select set_config('test.joint_version',(select updated_at::text from public.appointments where id=current_setting('test.joint_booking')::uuid),true);
select set_config('request.jwt.claim.sub',(select user_id::text from public.admins limit 1),true);
set local role authenticated;
do $$begin
 begin perform public.admin_reschedule_appointment(current_setting('test.joint_booking')::uuid,current_setting('test.joint_version')::timestamptz,current_setting('test.joint_date')::date,'15:02',80);raise exception 'joint moved to single availability';exception when sqlstate 'P0001' then if sqlerrm<>'HORARIO_INDISPONIVEL' then raise;end if;end;
 perform public.admin_reschedule_appointment(current_setting('test.joint_booking')::uuid,current_setting('test.joint_version')::timestamptz,current_setting('test.joint_date')::date,'14:02',80);
end;$$;
reset role;
set local role anon;
do $$begin
 if (select count(*) from public.get_professional_available_slots(current_setting('test.joint_date')::date) where available_date=current_setting('test.joint_date')::date and available_time='09:02')<>2 then raise exception 'moving joint did not free both old slots';end if;
 if exists(select 1 from public.get_professional_available_slots(current_setting('test.joint_date')::date) where available_date=current_setting('test.joint_date')::date and available_time='14:02')then raise exception 'new joint slot not blocked for both';end if;
end;$$;
reset role;
update public.appointments set status='cancelado',request_status='recusado' where id=current_setting('test.joint_booking')::uuid;
set local role anon;
do $$begin if (select count(*) from public.get_professional_available_slots(current_setting('test.joint_date')::date) where available_date=current_setting('test.joint_date')::date and available_time='14:02')<>2 then raise exception 'cancelling joint did not free both slots';end if;end;$$;
reset role;
select 'Joint requirement, simultaneous availability, double-resource blocking, single amount, separate foot+hand selection, reschedule and cancellation passed' as verification;

-- Admin-only operation. Runs with the administrator's existing table privileges.
create function public.admin_reschedule_appointment(
 p_appointment_id uuid,p_expected_updated_at timestamptz,p_date date,p_time time,p_amount numeric
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare a public.appointments%rowtype;v_at timestamptz;v_now timestamp:=timezone('America/Sao_Paulo',now());v_old_date date;v_amount numeric;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found then raise exception 'AGENDAMENTO_NAO_ENCONTRADO' using errcode='P0001';end if;
 if p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at then raise exception 'AGENDAMENTO_ALTERADO' using errcode='P0001';end if;
 if a.status not in ('agendado','confirmado') or coalesce(a.request_status,'')='recusado' or a.counted_as_revenue then raise exception 'AGENDAMENTO_ENCERRADO' using errcode='P0001';end if;
 if a.professional is null or a.professional not in ('raquel','iarytsa') then raise exception 'PROFISSIONAL_NAO_DEFINIDA' using errcode='22023';end if;
 if p_date is null or p_time is null or p_date::timestamp+p_time<=v_now or p_date>v_now::date+180 then raise exception 'HORARIO_INVALIDO' using errcode='22023';end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 or p_amount<>round(p_amount,2) then raise exception 'VALOR_INVALIDO' using errcode='22023';end if;
 v_at:=(p_date::timestamp+p_time) at time zone 'America/Sao_Paulo';v_amount:=p_amount;
 if v_at=a.appointment_at then raise exception 'ESCOLHA_NOVO_HORARIO' using errcode='22023';end if;
 v_old_date:=(a.appointment_at at time zone 'America/Sao_Paulo')::date;
 -- Same locks used by public booking and the conflict trigger, in stable order.
 perform pg_advisory_xact_lock(hashtextextended(least(v_old_date,p_date)::text,27191));
 if v_old_date<>p_date then perform pg_advisory_xact_lock(hashtextextended(greatest(v_old_date,p_date)::text,27191));end if;
 perform aa.id from public.appointment_availability aa where aa.active and aa.available_date=p_date and aa.available_time=p_time and (aa.professional=a.professional or aa.professional is null) for share;
 if not found then raise exception 'HORARIO_INDISPONIVEL' using errcode='P0001';end if;
 if exists(select 1 from public.appointments other where other.id<>a.id and other.appointment_at between v_at-interval '29 minutes' and v_at+interval '29 minutes' and other.status<>'cancelado' and coalesce(other.request_status,'')<>'recusado' and (other.professional is null or other.professional=a.professional)) then raise exception 'HORARIO_INDISPONIVEL' using errcode='P0001';end if;
 update public.appointments set appointment_at=v_at,amount=v_amount,updated_at=clock_timestamp(),notes=coalesce(a.notes,'')||E'\nAlteração de horário pelo painel: '||to_char(a.appointment_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' → '||to_char(v_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'. Valor: R$ '||a.amount::text||' → R$ '||v_amount::text||'.' where id=a.id;
 return jsonb_build_object('id',a.id,'old_at',a.appointment_at,'appointment_at',v_at,'amount',v_amount,'professional',a.professional,'status',a.status);
end;
$$;
revoke all on function public.admin_reschedule_appointment(uuid,timestamptz,date,time,numeric) from public,anon,authenticated;
grant execute on function public.admin_reschedule_appointment(uuid,timestamptz,date,time,numeric) to authenticated;

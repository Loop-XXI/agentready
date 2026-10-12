begin;
create table public.agentready_redemptions (
  payment_hash text primary key check (payment_hash ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  owner uuid not null,
  state text not null check (state in ('reserved','retryable','uncertain','completed')),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((state = 'completed') = (result is not null))
);
alter table public.agentready_redemptions enable row level security;
revoke all on public.agentready_redemptions from public, anon, authenticated;
grant select, insert, update on public.agentready_redemptions to service_role;
create policy agentready_server_only on public.agentready_redemptions to service_role using (true) with check (true);

create function public.agentready_claim_v1(p_hash text, p_fingerprint text, p_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.agentready_redemptions%rowtype; inserted boolean;
begin
  insert into public.agentready_redemptions(payment_hash,request_fingerprint,owner,state)
  values(p_hash,p_fingerprint,p_owner,'reserved') on conflict(payment_hash) do nothing;
  inserted := found;
  select * into r from public.agentready_redemptions where payment_hash=p_hash for update;
  if inserted then return jsonb_build_object('status','claimed'); end if;
  if r.request_fingerprint <> p_fingerprint then return jsonb_build_object('status','conflict'); end if;
  if r.state='completed' then return jsonb_build_object('status','completed','result',r.result); end if;
  if r.state='retryable' then
    update public.agentready_redemptions set state='reserved',owner=p_owner,updated_at=clock_timestamp() where payment_hash=p_hash;
    return jsonb_build_object('status','claimed');
  end if;
  return jsonb_build_object('status',case when r.state='uncertain' then 'uncertain' else 'pending' end);
end $$;

create function public.agentready_complete_v1(p_hash text, p_owner uuid, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.agentready_redemptions%rowtype;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or
    p_result->>'paid' is distinct from 'true' or p_result->>'tier' is distinct from 'ai' or
    jsonb_typeof(p_result->'fixes') is distinct from 'object' or octet_length(p_result::text)>20000 then
    raise exception 'invalid_result';
  end if;
  select * into r from public.agentready_redemptions where payment_hash=p_hash for update;
  if not found or r.owner <> p_owner then return jsonb_build_object('status','conflict'); end if;
  if r.state='completed' then return jsonb_build_object('status','completed','result',r.result); end if;
  if r.state <> 'reserved' then return jsonb_build_object('status','conflict'); end if;
  update public.agentready_redemptions set state='completed',result=p_result,updated_at=clock_timestamp() where payment_hash=p_hash;
  return jsonb_build_object('status','completed','result',p_result);
end $$;

create function public.agentready_fail_v1(p_hash text,p_owner uuid,p_retryable boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  update public.agentready_redemptions set state=case when p_retryable is true then 'retryable' else 'uncertain' end,
    updated_at=clock_timestamp() where payment_hash=p_hash and owner=p_owner and state='reserved';
  return jsonb_build_object('changed',found);
end $$;

create function public.agentready_ready_v1() returns boolean language sql security invoker set search_path='' as $$
  select exists(select 1 from pg_catalog.pg_tables where schemaname='public' and tablename='agentready_redemptions');
$$;
revoke all on function public.agentready_claim_v1(text,text,uuid),public.agentready_complete_v1(text,uuid,jsonb),public.agentready_fail_v1(text,uuid,boolean),public.agentready_ready_v1() from public,anon,authenticated;
grant execute on function public.agentready_claim_v1(text,text,uuid),public.agentready_complete_v1(text,uuid,jsonb),public.agentready_fail_v1(text,uuid,boolean),public.agentready_ready_v1() to service_role;
-- Carry forward the previously fulfilled SELF-PAY TEST. Never reopen it.
insert into public.agentready_redemptions(payment_hash,request_fingerprint,owner,state)
values ('529b9e2de9bc696d5b204a7ae6a321b7bee2eb5436e0285f4dac04c5ee34739e',
repeat('0',64),'00000000-0000-4000-8000-000000000001','uncertain');

commit;

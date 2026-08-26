-- V2: banco para o painel administrativo
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  price numeric(10,2) not null default 0,
  unit text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services enable row level security;

-- Leitura pública: o site poderá mostrar apenas serviços ativos.
create policy "public can read active services"
on public.services for select
using (active = true);

-- A escrita será liberada somente para usuários autenticados
-- depois que configurarmos a conta ADM.

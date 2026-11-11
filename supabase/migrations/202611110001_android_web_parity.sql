-- SECURCONTROL: ampliar el esquema para reflejar la ficha y los flujos del Android 1.2.3.
-- Ejecutar en Supabase SQL Editor. Mantiene RLS habilitado; no concede acceso público.

alter table public.employees
  add column if not exists dni text,
  add column if not exists tip text,
  add column if not exists tip_expiry date,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists post text,
  add column if not exists category text,
  add column if not exists service text,
  add column if not exists username text,
  add column if not exists blocked boolean not null default false;

create unique index if not exists employees_dni_unique
  on public.employees (lower(dni)) where dni is not null and btrim(dni) <> '';
create unique index if not exists employees_username_unique
  on public.employees (lower(username)) where username is not null and btrim(username) <> '';

alter table public.shifts
  add column if not exists service text,
  add column if not exists hours numeric(6,2),
  add column if not exists holiday boolean not null default false;

-- Asignación de cobertura mensual: una plaza/turno sólo puede tener una persona asignada por día.
create table if not exists public.coverage_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null,
  post text not null,
  shift_name text not null,
  service text,
  hours numeric(6,2) not null,
  holiday boolean not null default false,
  created_at timestamptz not null default now(),
  unique (work_date, post, shift_name)
);

-- Completa los fichajes para reflejar el modelo de entrada/salida del Android.
alter table public.time_punches
  add column if not exists notes text;

-- Policies de cobertura: sólo administradores pueden gestionar asignaciones.
alter table public.coverage_assignments enable row level security;
drop policy if exists coverage_admin_all on public.coverage_assignments;
create policy coverage_admin_all on public.coverage_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists coverage_read_own on public.coverage_assignments;
create policy coverage_read_own on public.coverage_assignments
  for select to authenticated
  using (exists (
    select 1 from public.employees e
    where e.id = coverage_assignments.employee_id
      and e.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.coverage_assignments to authenticated;

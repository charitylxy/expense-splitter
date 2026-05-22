-- Run this in Supabase SQL Editor for existing projects
-- Adds settlements support for manual settle-up tracking

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  from_member uuid references members(id) on delete cascade not null,
  to_member uuid references members(id) on delete cascade not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  exchange_rate numeric(12,6) not null default 1,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now(),
  constraint settlements_from_to_check check (from_member <> to_member)
);

alter table settlements enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'settlements'
      and policyname = 'Public read/write settlements'
  ) then
    create policy "Public read/write settlements"
      on settlements for all using (true) with check (true);
  end if;
end $$;

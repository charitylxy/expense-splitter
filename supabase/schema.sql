-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Groups (trips)
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_currency text not null default 'USD',
  created_at timestamptz default now()
);

-- Members of each group
create table members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- Expense categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Seed default categories
insert into categories (name) values
  ('Food & Drinks'),
  ('Transport'),
  ('Accommodation'),
  ('Activities'),
  ('Shopping'),
  ('Utilities'),
  ('Other');

-- Expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  title text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  exchange_rate numeric(12,6) not null default 1,  -- rate to convert to group default_currency
  category_id uuid references categories(id),
  paid_by uuid references members(id) not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- How each expense is split among members
create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references expenses(id) on delete cascade not null,
  member_id uuid references members(id) on delete cascade not null,
  amount numeric(12,2) not null   -- amount this person owes (in expense currency)
);

-- Settlement payments between members
create table settlements (
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

-- Enable Row Level Security (open access — no auth required)
alter table groups enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;

create policy "Public read/write groups" on groups for all using (true) with check (true);
create policy "Public read/write members" on members for all using (true) with check (true);
create policy "Public read categories" on categories for select using (true);
create policy "Public read/write expenses" on expenses for all using (true) with check (true);
create policy "Public read/write splits" on expense_splits for all using (true) with check (true);
create policy "Public read/write settlements" on settlements for all using (true) with check (true);

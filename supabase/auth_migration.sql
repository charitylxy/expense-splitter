-- Auth Migration for Multi-User Support
-- Run this in your Supabase SQL Editor after enabling Supabase Auth

-- 1. Add created_by (owner) to groups table
-- First drop old public policy if it exists
drop policy if exists "Public read/write groups" on groups;

-- Add created_by column (allow NULL temporarily for migration)
alter table groups
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

-- 2. Create group_members table for sharing groups with other users
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_members enable row level security;

-- Helper functions to avoid recursive RLS checks between groups and group_members
create or replace function public.is_group_owner(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = target_group_id
      and g.created_by = auth.uid()
  );
$$;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_owner(uuid) to anon, authenticated;
grant execute on function public.is_group_member(uuid) to anon, authenticated;

-- 2b. Public profile table for looking up users by email when sharing groups
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
where u.email is not null
on conflict (id) do update set email = excluded.email;

drop policy if exists "Authenticated users can read profiles" on profiles;
drop policy if exists "Users can update own profile" on profiles;

create policy "Authenticated users can read profiles"
  on profiles
  for select
  using (auth.uid() is not null);

create policy "Users can update own profile"
  on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users can read their memberships" on group_members;
drop policy if exists "Owners can add shared users" on group_members;
drop policy if exists "Owners can update shared users" on group_members;
drop policy if exists "Owners can remove shared users" on group_members;

create policy "Users can read their memberships"
  on group_members
  for select
  using (user_id = auth.uid() or public.is_group_owner(group_id));

create policy "Owners can add shared users"
  on group_members
  for insert
  with check (public.is_group_owner(group_id));

create policy "Owners can update shared users"
  on group_members
  for update
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy "Owners can remove shared users"
  on group_members
  for delete
  using (public.is_group_owner(group_id));

-- 3. Update RLS policies for groups (owner or group member)
drop policy if exists "Users can view their own groups and shared groups" on groups;
drop policy if exists "Users can create groups" on groups;
drop policy if exists "Users can update their own groups" on groups;
drop policy if exists "Users can delete their own groups" on groups;

create policy "Users can view their own groups and shared groups"
  on groups
  for select
  using (auth.uid() = created_by or public.is_group_member(id));

create policy "Users can create groups"
  on groups
  for insert
  with check (auth.uid() = created_by);

create policy "Users can update their own groups"
  on groups
  for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Users can delete their own groups"
  on groups
  for delete
  using (auth.uid() = created_by);

-- 4. Update RLS policies for members (via group access)
drop policy if exists "Public read/write members" on members;
drop policy if exists "Users can manage members in accessible groups" on members;

create policy "Users can manage members in accessible groups"
  on members
  for all
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));

-- 5. Update RLS policies for expenses
drop policy if exists "Public read/write expenses" on expenses;
drop policy if exists "Users can manage expenses in accessible groups" on expenses;

create policy "Users can manage expenses in accessible groups"
  on expenses
  for all
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));

-- 6. Update RLS policies for splits
drop policy if exists "Public read/write splits" on expense_splits;
drop policy if exists "Users can manage splits in accessible groups" on expense_splits;

create policy "Users can manage splits in accessible groups"
  on expense_splits
  for all
  using (
    exists (
      select 1 from expenses
      where expenses.id = expense_splits.expense_id
      and (
        public.is_group_owner(expenses.group_id)
        or public.is_group_member(expenses.group_id)
      )
    )
  );

-- 7. Update RLS policies for settlements
drop policy if exists "Public read/write settlements" on settlements;
drop policy if exists "Users can manage settlements in accessible groups" on settlements;

create policy "Users can manage settlements in accessible groups"
  on settlements
  for all
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));

-- 8. Keep public read on categories (for dropdowns)
drop policy if exists "Public read categories" on categories;
create policy "Public read categories" on categories for select using (true);

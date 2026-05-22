-- Auth Migration for Multi-User Support
-- Run this in your Supabase SQL Editor after enabling Supabase Auth

-- 1. Add created_by (owner) to groups table
-- First drop old public policy if it exists
drop policy if exists "Public read/write groups" on groups;

-- Add created_by column (allow NULL temporarily for migration)
alter table groups add column created_by uuid references auth.users(id) on delete cascade;

-- 2. Create group_members table for sharing groups with other users
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

enable row level security on group_members;

-- 3. Update RLS policies for groups (owner or group member)
create policy "Users can view their own groups and shared groups"
  on groups
  for select
  using (
    auth.uid() = created_by
    or exists (
      select 1 from group_members
      where group_members.group_id = groups.id
      and group_members.user_id = auth.uid()
    )
  );

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

create policy "Users can manage members in accessible groups"
  on members
  for all
  using (
    exists (
      select 1 from groups
      where groups.id = members.group_id
      and (
        auth.uid() = groups.created_by
        or exists (
          select 1 from group_members
          where group_members.group_id = groups.id
          and group_members.user_id = auth.uid()
        )
      )
    )
  );

-- 5. Update RLS policies for expenses
drop policy if exists "Public read/write expenses" on expenses;

create policy "Users can manage expenses in accessible groups"
  on expenses
  for all
  using (
    exists (
      select 1 from groups
      where groups.id = expenses.group_id
      and (
        auth.uid() = groups.created_by
        or exists (
          select 1 from group_members
          where group_members.group_id = groups.id
          and group_members.user_id = auth.uid()
        )
      )
    )
  );

-- 6. Update RLS policies for splits
drop policy if exists "Public read/write splits" on expense_splits;

create policy "Users can manage splits in accessible groups"
  on expense_splits
  for all
  using (
    exists (
      select 1 from expenses
      join groups on groups.id = expenses.group_id
      where expenses.id = expense_splits.expense_id
      and (
        auth.uid() = groups.created_by
        or exists (
          select 1 from group_members
          where group_members.group_id = groups.id
          and group_members.user_id = auth.uid()
        )
      )
    )
  );

-- 7. Update RLS policies for settlements
drop policy if exists "Public read/write settlements" on settlements;

create policy "Users can manage settlements in accessible groups"
  on settlements
  for all
  using (
    exists (
      select 1 from groups
      where groups.id = settlements.group_id
      and (
        auth.uid() = groups.created_by
        or exists (
          select 1 from group_members
          where group_members.group_id = groups.id
          and group_members.user_id = auth.uid()
        )
      )
    )
  );

-- 8. Keep public read on categories (for dropdowns)
drop policy if exists "Public read categories" on categories;
create policy "Public read categories" on categories for select using (true);

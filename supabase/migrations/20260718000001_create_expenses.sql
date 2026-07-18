-- Create categories table if not exists (referenced by expenses)
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  icon_name text not null,
  color_code text not null,
  is_system boolean default true not null,
  created_by uuid references public.profiles(id) on delete set null
);

-- Enable RLS on categories
alter table public.categories enable row level security;
create policy "Categories are viewable by everyone." on public.categories for select using (true);

-- Insert system categories
insert into public.categories (name, icon_name, color_code, is_system)
values 
  ('Food', 'utensils', '#FF9F1C', true),
  ('Rent', 'home', '#4EA8DE', true),
  ('Utilities', 'zap', '#FFD166', true),
  ('Travel', 'plane', '#06D6A0', true),
  ('Groceries', 'shopping-cart', '#EF476F', true),
  ('Tiffin', 'package', '#118AB2', true),
  ('Water Jar', 'droplet', '#073B4C', true),
  ('Other', 'file-text', '#00F5D4', true)
on conflict (name) do nothing;

-- Create expenses table
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  paid_by uuid references public.profiles(id) on delete restrict not null,
  amount decimal(12,2) check (amount > 0) not null,
  description text not null,
  category_id uuid references public.categories(id) on delete restrict not null,
  receipt_url text,
  expense_date timestamp with time zone default timezone('utc'::text, now()) not null,
  is_settlement boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create expense splits table
create table if not exists public.expense_splits (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  debtor_id uuid references public.profiles(id) on delete restrict not null,
  amount decimal(12,2) check (amount >= 0) not null,
  share_ratio numeric,
  unique (expense_id, debtor_id)
);

-- Create cached peer balances table
create table if not exists public.peer_balances (
  group_id uuid references public.groups(id) on delete cascade not null,
  user_a_id uuid references public.profiles(id) on delete restrict not null,
  user_b_id uuid references public.profiles(id) on delete restrict not null,
  net_balance decimal(12,2) default 0.00 not null,
  primary key (group_id, user_a_id, user_b_id),
  -- Integrity rule: sort user_a_id < user_b_id to prevent double entries
  constraint user_sorting check (user_a_id < user_b_id)
);

-- Enable RLS on expenses, splits and peer balances
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.peer_balances enable row level security;

-- RLS policies
create policy "Members can view expenses in their groups"
  on public.expenses for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = group_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Members can create expenses in their groups"
  on public.expenses for insert
  with check (
    exists (
      select 1 from public.group_members
      where group_members.group_id = group_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Payer can update expense details"
  on public.expenses for update
  using (auth.uid() = paid_by);

create policy "Payer can delete expenses"
  on public.expenses for delete
  using (auth.uid() = paid_by);

-- Expense splits policies
create policy "Members can view splits in their groups"
  on public.expense_splits for select
  using (
    exists (
      select 1 from public.expenses
      join public.group_members on group_members.group_id = expenses.group_id
      where expenses.id = expense_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Members can create splits in their groups"
  on public.expense_splits for insert
  with check (
    exists (
      select 1 from public.expenses
      join public.group_members on group_members.group_id = expenses.group_id
      where expenses.id = expense_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Payer can edit splits"
  on public.expense_splits for update
  using (
    exists (
      select 1 from public.expenses
      where expenses.id = expense_id
      and expenses.paid_by = auth.uid()
    )
  );

create policy "Payer can delete splits"
  on public.expense_splits for delete
  using (
    exists (
      select 1 from public.expenses
      where expenses.id = expense_id
      and expenses.paid_by = auth.uid()
    )
  );

-- Peer Balances policies
create policy "Members can select peer balances"
  on public.peer_balances for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = group_id
      and group_members.profile_id = auth.uid()
    )
  );

-- Trigger to sync peer balances incrementally on split mutations
create or replace function public.adjust_peer_balances()
returns trigger as $$
declare
  v_group_id uuid;
  v_paid_by uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_multiplier integer;
  v_amount decimal(12,2);
begin
  -- Identify the corresponding expense
  if TG_OP = 'DELETE' then
    select group_id, paid_by into v_group_id, v_paid_by
    from public.expenses where id = old.expense_id;
    v_amount := old.amount;
    v_user_a := old.debtor_id;
  else
    select group_id, paid_by into v_group_id, v_paid_by
    from public.expenses where id = new.expense_id;
    v_amount := new.amount;
    v_user_a := new.debtor_id;
  end if;

  -- If debtor is the payer, no peer debt is generated
  if v_paid_by = v_user_a then
    return null;
  end if;

  -- Arrange user_a and user_b alphabetically (P < D check)
  if v_paid_by < v_user_a then
    v_user_a := v_paid_by;
    v_user_b := case when TG_OP = 'DELETE' then old.debtor_id else new.debtor_id end;
    v_multiplier := 1; -- Payer (A) lent to Debtor (B) -> B owes A -> Net balance goes up
  else
    v_user_b := v_paid_by;
    v_multiplier := -1; -- Payer (B) lent to Debtor (A) -> A owes B -> Net balance goes down
  end if;

  -- Set operations based on action type
  if TG_OP = 'INSERT' then
    insert into public.peer_balances (group_id, user_a_id, user_b_id, net_balance)
    values (v_group_id, v_user_a, v_user_b, v_amount * v_multiplier)
    on conflict (group_id, user_a_id, user_b_id) do update
    set net_balance = public.peer_balances.net_balance + (v_amount * v_multiplier);
  
  elsif TG_OP = 'DELETE' then
    update public.peer_balances
    set net_balance = public.peer_balances.net_balance - (v_amount * v_multiplier)
    where group_id = v_group_id and user_a_id = v_user_a and user_b_id = v_user_b;

  elsif TG_OP = 'UPDATE' then
    -- Subtract old split amount, add new split amount
    update public.peer_balances
    set net_balance = public.peer_balances.net_balance - (old.amount * v_multiplier) + (new.amount * v_multiplier)
    where group_id = v_group_id and user_a_id = v_user_a and user_b_id = v_user_b;
  end if;

  return null;
end;
$$ language plpgsql security definer;

-- Apply trigger to expense_splits
create trigger on_split_changed
  after insert or update or delete on public.expense_splits
  for each row execute procedure public.adjust_peer_balances();

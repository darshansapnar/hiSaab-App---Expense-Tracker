-- Add is_confirmed column to expenses table, default true
alter table public.expenses
  add column if not exists is_confirmed boolean default true not null;

-- Set default is_confirmed to false for settlements
alter table public.expenses 
  alter column is_confirmed set default true;

-- Update trigger function to check is_confirmed state
create or replace function public.adjust_peer_balances()
returns trigger as $$
declare
  v_group_id uuid;
  v_paid_by uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_multiplier integer;
  v_amount decimal(12,2);
  v_is_confirmed boolean;
begin
  -- Identify the corresponding expense and confirmation status
  if TG_OP = 'DELETE' then
    select group_id, paid_by, is_confirmed into v_group_id, v_paid_by, v_is_confirmed
    from public.expenses where id = old.expense_id;
    v_amount := old.amount;
    v_user_a := old.debtor_id;
  else
    select group_id, paid_by, is_confirmed into v_group_id, v_paid_by, v_is_confirmed
    from public.expenses where id = new.expense_id;
    v_amount := new.amount;
    v_user_a := new.debtor_id;
  end if;

  -- If debtor is the payer, or the expense is not confirmed, skip balance adjustment
  if v_paid_by = v_user_a or v_is_confirmed = false then
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
    update public.peer_balances
    set net_balance = public.peer_balances.net_balance - (old.amount * v_multiplier) + (new.amount * v_multiplier)
    where group_id = v_group_id and user_a_id = v_user_a and user_b_id = v_user_b;
  end if;

  return null;
end;
$$ language plpgsql security definer;

-- Trigger to recalculate balances when expense confirmation changes (e.g. false -> true)
create or replace function public.handle_expense_confirmation()
returns trigger as $$
declare
  r_split record;
  v_multiplier integer;
  v_user_a uuid;
  v_user_b uuid;
begin
  -- Case 1: Expense confirmed (is_confirmed becomes true)
  if old.is_confirmed = false and new.is_confirmed = true then
    for r_split in select debtor_id, amount from public.expense_splits where expense_id = new.id loop
      if new.paid_by <> r_split.debtor_id then
        if new.paid_by < r_split.debtor_id then
          v_user_a := new.paid_by;
          v_user_b := r_split.debtor_id;
          v_multiplier := 1;
        else
          v_user_a := r_split.debtor_id;
          v_user_b := new.paid_by;
          v_multiplier := -1;
        end if;
        
        insert into public.peer_balances (group_id, user_a_id, user_b_id, net_balance)
        values (new.group_id, v_user_a, v_user_b, r_split.amount * v_multiplier)
        on conflict (group_id, user_a_id, user_b_id) do update
        set net_balance = public.peer_balances.net_balance + (r_split.amount * v_multiplier);
      end if;
    end loop;
  
  -- Case 2: Expense unconfirmed (is_confirmed becomes false, e.g. if rolled back)
  elsif old.is_confirmed = true and new.is_confirmed = false then
    for r_split in select debtor_id, amount from public.expense_splits where expense_id = new.id loop
      if new.paid_by <> r_split.debtor_id then
        if new.paid_by < r_split.debtor_id then
          v_user_a := new.paid_by;
          v_user_b := r_split.debtor_id;
          v_multiplier := 1;
        else
          v_user_a := r_split.debtor_id;
          v_user_b := new.paid_by;
          v_multiplier := -1;
        end if;
        
        update public.peer_balances
        set net_balance = public.peer_balances.net_balance - (r_split.amount * v_multiplier)
        where group_id = new.group_id and user_a_id = v_user_a and user_b_id = v_user_b;
      end if;
    end loop;
  end if;
  
  return null;
end;
$$ language plpgsql security definer;

-- Apply confirmation trigger to expenses
drop trigger if exists on_expense_confirmed on public.expenses;
create trigger on_expense_confirmed
  after update on public.expenses
  for each row execute procedure public.handle_expense_confirmation();

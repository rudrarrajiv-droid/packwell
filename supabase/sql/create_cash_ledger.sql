-- Cash Ledger Table
create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  voucher_no text,
  expense_head text not null,
  narration text,
  payment_mode text not null check (payment_mode in ('CASH', 'BANK')),
  dr numeric default 0,
  cr numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

create index if not exists idx_cash_ledger_date on public.cash_ledger(date);
create index if not exists idx_cash_ledger_expense_head on public.cash_ledger(expense_head);

-- Master Expense Categories Table
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by text
);

create index if not exists idx_expense_categories_name on public.expense_categories(name);

-- Row Level Security (RLS) Configuration
alter table public.cash_ledger enable row level security;
alter table public.expense_categories enable row level security;

grant select, insert, update, delete on table public.cash_ledger to anon, authenticated;
grant select, insert, update, delete on table public.expense_categories to anon, authenticated;

drop policy if exists cash_ledger_select on public.cash_ledger;
create policy cash_ledger_select on public.cash_ledger for select to anon, authenticated using (true);

drop policy if exists cash_ledger_insert on public.cash_ledger;
create policy cash_ledger_insert on public.cash_ledger for insert to anon, authenticated with check (true);

drop policy if exists cash_ledger_update on public.cash_ledger;
create policy cash_ledger_update on public.cash_ledger for update to anon, authenticated using (true) with check (true);

drop policy if exists cash_ledger_delete on public.cash_ledger;
create policy cash_ledger_delete on public.cash_ledger for delete to anon, authenticated using (true);

drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select to anon, authenticated using (true);

drop policy if exists expense_categories_insert on public.expense_categories;
create policy expense_categories_insert on public.expense_categories for insert to anon, authenticated with check (true);

drop policy if exists expense_categories_update on public.expense_categories;
create policy expense_categories_update on public.expense_categories for update to anon, authenticated using (true) with check (true);

drop policy if exists expense_categories_delete on public.expense_categories;
create policy expense_categories_delete on public.expense_categories for delete to anon, authenticated using (true);

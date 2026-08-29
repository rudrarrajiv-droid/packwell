-- Raw Material Schema
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opening_qty numeric default 0,
  in_qty numeric default 0,
  out_qty numeric default 0,
  closing_balance numeric default 0,
  rate numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

create table if not exists public.raw_material_transactions (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid references public.raw_materials(id),
  type text check (type in ('IN', 'OUT')),
  quantity numeric default 0,
  remaining_balance numeric default 0,
  date date not null,
  reference_no text,
  performed_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

-- Scrap Schema
create table if not exists public.scrap_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text,
  weight numeric default 0,
  rate numeric default 0,
  total_value numeric default 0,
  payment_type text check (payment_type in ('CASH', 'BILLING')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

-- MR Schema (Monthly Reports)
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  month text not null, -- Format: YYYY-MM
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

create table if not exists public.monthly_expenses (
  id uuid primary key default gen_random_uuid(),
  monthly_report_id uuid references public.monthly_reports(id),
  name text not null,
  amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,
  updated_by text,
  is_archived boolean default false
);

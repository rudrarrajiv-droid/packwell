-- Migration: Add father_name, address, status, left_date, rejoin_date to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS left_date date,
  ADD COLUMN IF NOT EXISTS rejoin_date date;

-- Update existing rows where status is null
UPDATE public.employees
SET status = 'ACTIVE'
WHERE status IS NULL;

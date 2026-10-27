-- Migration: create_plant_daily_mis.sql
-- Description: Creates isolated tables for Plant Daily MIS (Daily Production & Revenue Report)
-- Zero impact on existing tables.

CREATE TABLE IF NOT EXISTS public.daily_plant_mis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  self_sale_excl_gst NUMERIC(14,2) DEFAULT 0,
  self_sale_incl_gst NUMERIC(14,2) DEFAULT 0,
  outsource_sale_excl_gst NUMERIC(14,2) DEFAULT 0,
  outsource_sale_incl_gst NUMERIC(14,2) DEFAULT 0,
  total_sale_excl_gst NUMERIC(14,2) DEFAULT 0,
  total_sale_incl_gst NUMERIC(14,2) DEFAULT 0,
  mtd_self_sale_excl_gst NUMERIC(14,2) DEFAULT NULL,
  mtd_self_sale_incl_gst NUMERIC(14,2) DEFAULT NULL,
  mtd_outsource_sale_excl_gst NUMERIC(14,2) DEFAULT NULL,
  mtd_outsource_sale_incl_gst NUMERIC(14,2) DEFAULT NULL,
  mtd_total_sale_excl_gst NUMERIC(14,2) DEFAULT NULL,
  mtd_total_sale_incl_gst NUMERIC(14,2) DEFAULT NULL,
  show_revenue BOOLEAN DEFAULT true,
  show_stock_valuation BOOLEAN DEFAULT true,
  show_fg_produced BOOLEAN DEFAULT true,
  show_machines BOOLEAN DEFAULT true,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS public.daily_plant_mis_fg_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL REFERENCES public.daily_plant_mis_reports(report_date) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty_box NUMERIC(10,2) DEFAULT 0,
  scrap_box NUMERIC(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_plant_mis_machine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL REFERENCES public.daily_plant_mis_reports(report_date) ON DELETE CASCADE,
  machine_name TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT 'Day',
  shift_hours NUMERIC(5,2) DEFAULT 12,
  shift_timing TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  running_sq_mtr NUMERIC(12,2) DEFAULT 0,
  running_kg NUMERIC(12,2) DEFAULT 0,
  total_ply NUMERIC(12,2) DEFAULT 0,
  total_paper NUMERIC(12,2) DEFAULT 0,
  scrap_kg NUMERIC(12,2) DEFAULT 0,
  scrap_sheet NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  cut_size_breakdown JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.daily_plant_mis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plant_mis_fg_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plant_mis_machine_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies for full access (matching internal app pattern)
DROP POLICY IF EXISTS "Allow full access to daily_plant_mis_reports" ON public.daily_plant_mis_reports;
CREATE POLICY "Allow full access to daily_plant_mis_reports" ON public.daily_plant_mis_reports
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to daily_plant_mis_fg_items" ON public.daily_plant_mis_fg_items;
CREATE POLICY "Allow full access to daily_plant_mis_fg_items" ON public.daily_plant_mis_fg_items
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to daily_plant_mis_machine_logs" ON public.daily_plant_mis_machine_logs;
CREATE POLICY "Allow full access to daily_plant_mis_machine_logs" ON public.daily_plant_mis_machine_logs
  FOR ALL USING (true) WITH CHECK (true);

import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Adding section toggle columns to daily_plant_mis_reports...');
  await client.query(`
    ALTER TABLE public.daily_plant_mis_reports
    ADD COLUMN IF NOT EXISTS show_revenue boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_stock_valuation boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_fg_produced boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_machines boolean DEFAULT true;
  `);
  console.log('Columns added successfully.');
  await client.end();
}

run().catch(console.error);

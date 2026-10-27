import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Adding MTD columns to daily_plant_mis_reports if not exist...');
  await client.query(`
    ALTER TABLE public.daily_plant_mis_reports
    ADD COLUMN IF NOT EXISTS mtd_self_sale_excl_gst numeric(14,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mtd_self_sale_incl_gst numeric(14,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mtd_outsource_sale_excl_gst numeric(14,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mtd_outsource_sale_incl_gst numeric(14,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mtd_total_sale_excl_gst numeric(14,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mtd_total_sale_incl_gst numeric(14,2) DEFAULT NULL;
  `);
  console.log('Columns added successfully.');
  await client.end();
}

run().catch(console.error);

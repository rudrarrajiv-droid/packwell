const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(`
    SELECT job_card_no, product_snapshot, raw_data 
    FROM public.job_cards 
    WHERE job_card_no IN ('1021126', '3031126', '2021126')
  `);
  for (const r of res.rows) {
    console.log(`\n================== JC ${r.job_card_no} ==================`);
    console.log('product_snapshot.layers:', JSON.stringify(r.product_snapshot.layers, null, 2));
    if (r.raw_data && r.raw_data.costingData) {
      console.log('raw_data.costingData:', JSON.stringify(r.raw_data.costingData, null, 2));
    }
  }
  await client.end();
}
run().catch(console.error);

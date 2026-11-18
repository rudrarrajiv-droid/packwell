const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function checkRawKeys() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query("SELECT job_card_no, raw_data FROM public.job_cards WHERE job_card_no = '4031126'");
  const raw = res.rows[0].raw_data;
  console.log('Keys in raw_data:', Object.keys(raw));
  if (raw.allocations) {
    console.log('raw.allocations:', JSON.stringify(raw.allocations, null, 2));
  }
  await client.end();
}
checkRawKeys().catch(console.error);

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT job_card_no FROM public.job_cards WHERE raw_data::text ILIKE '%183.47%' OR product_snapshot::text ILIKE '%183.47%'");
  console.log('Found jobs containing 183.47:', res.rows.map(r => r.job_card_no));

  const res2 = await client.query("SELECT job_card_no, product_snapshot, raw_data FROM public.job_cards WHERE job_card_no = '4031126'");
  const jc = res2.rows[0];
  console.log('4031126 in raw_data.productSnapshot has 183.47?:', JSON.stringify(jc.raw_data).includes('183.47'));
  console.log('4031126 in product_snapshot has 183.47?:', JSON.stringify(jc.product_snapshot).includes('183.47'));

  await client.end();
}
run().catch(console.error);

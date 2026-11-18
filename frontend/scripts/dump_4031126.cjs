const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function dump() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT *
    FROM public.job_cards
    WHERE job_card_no = '4031126'
  `);

  console.log('Row count:', res.rows.length);
  const row = res.rows[0];
  console.log('job_card_no:', row.job_card_no);
  console.log('product_name:', row.product_name);
  console.log('order_qty:', row.order_qty);
  console.log('total_weight:', row.total_weight);
  console.log('one_box_weight:', row.one_box_weight);
  console.log('product_snapshot:', JSON.stringify(row.product_snapshot, null, 2));
  console.log('raw_data:', JSON.stringify(row.raw_data, null, 2));

  await client.end();
}

dump().catch(console.error);

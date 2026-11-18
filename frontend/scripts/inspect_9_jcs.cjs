const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const jcList = ['1021126', '2021126', '4031126', '10031126', '12031126', '13031126', '14031126', '15031126', '18051126'];

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT firestore_document_id, job_card_no, total_weight, one_box_weight, product_snapshot, raw_data 
    FROM public.job_cards 
    WHERE job_card_no = ANY($1::text[])
    ORDER BY created_at ASC
  `, [jcList]);

  for (const r of res.rows) {
    const layers = r.product_snapshot?.layers || [];
    const sumReq = layers.reduce((s, l) => s + (Number(l.requiredWeight) || 0), 0);
    const sumCalc = layers.reduce((s, l) => s + (Number(l.calculatedWeight) || 0), 0);
    const sumAlloc = layers.reduce((s, l) => s + ((l.allocatedReels || []).reduce((as, a) => as + Number(a.allocatedWeight || 0), 0)), 0);
    console.log(`JC: ${r.job_card_no} | SavedTotal: ${r.total_weight} | SumReq: ${Math.round(sumReq * 100) / 100} | SumCalc: ${Math.round(sumCalc * 100) / 100} | SumAlloc: ${Math.round(sumAlloc * 100) / 100}`);
    if (r.raw_data && r.raw_data.costingData) {
      console.log(`   CostingData totalAllocatedWeight: ${r.raw_data.costingData.totalAllocatedWeight}, totalAllocatedValue: ${r.raw_data.costingData.totalAllocatedValue}, paperVariancePL: ${r.raw_data.costingData.paperVariancePL}`);
    }
  }
  await client.end();
}

run().catch(console.error);

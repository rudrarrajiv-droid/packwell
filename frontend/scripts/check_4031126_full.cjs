const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT firestore_document_id, job_card_no, product_snapshot, raw_data
    FROM public.job_cards
    WHERE job_card_no = '4031126'
  `);

  const r = res.rows[0];
  console.log('=== PRODUCT_SNAPSHOT LAYERS ===');
  r.product_snapshot.layers.forEach((l, i) => {
    console.log(`Layer ${i} [${l.layerName}]: GSM=${l.gsm}, Req=${l.requiredWeight}, Calc=${l.calculatedWeight}, AllocReels=${JSON.stringify(l.allocatedReels)}`);
  });

  console.log('\n=== RAW_DATA.PRODUCT_SNAPSHOT LAYERS ===');
  if (r.raw_data.productSnapshot) {
    r.raw_data.productSnapshot.layers.forEach((l, i) => {
      console.log(`Layer ${i} [${l.layerName}]: GSM=${l.gsm}, Req=${l.requiredWeight}, Calc=${l.calculatedWeight}, AllocReels=${JSON.stringify(l.allocatedReels)}`);
    });
  }

  console.log('\n=== RAW_DATA.COSTINGDATA ===');
  if (r.raw_data.costingData) {
    console.log(JSON.stringify(r.raw_data.costingData, null, 2));
  } else {
    console.log('No costingData in raw_data!');
  }

  await client.end();
}
check().catch(console.error);

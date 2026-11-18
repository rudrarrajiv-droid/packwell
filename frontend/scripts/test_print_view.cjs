const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { calculateLayerWeight } = require('../src/lib/corrugationUtils.ts'); // Wait, cjs can't require ts directly

async function checkPrintable() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query("SELECT * FROM public.job_cards WHERE job_card_no = '4031126'");
  const jc = res.rows[0];
  const product = jc.product_snapshot;

  console.log('JC:', jc.job_card_no, 'Item:', product.itemName);
  console.log('ReelSize:', product.reelSize, 'CutSize:', product.cutSize, 'OrderQty:', jc.order_qty, 'Ups:', product.ups);

  (product.layers || []).forEach((layer, idx) => {
    console.log(`\nLayer ${idx}: ${layer.layerName} | Paper: ${layer.paperType} | BF: ${layer.bf} | GSM: ${layer.gsm}`);
    console.log(`   Req in DB: ${layer.requiredWeight} | Calc in DB: ${layer.calculatedWeight}`);
    console.log(`   Allocated Reels in DB:`, JSON.stringify(layer.allocatedReels));
  });

  await client.end();
}
checkPrintable().catch(console.error);

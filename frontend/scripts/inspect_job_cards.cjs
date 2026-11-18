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
    SELECT firestore_document_id, job_card_no, created_at, target_date, order_qty, total_weight, one_box_weight, status, product_snapshot, raw_data
    FROM public.job_cards
    WHERE created_at >= '2026-11-01' OR target_date >= '2026-11-01'
    ORDER BY created_at ASC
  `);

  console.log('Total job cards found >= 2026-11-01:', res.rows.length);
  for (const r of res.rows) {
    const snap = r.product_snapshot || {};
    const layers = snap.layers || [];
    console.log(`\n=== JC: ${r.job_card_no} (Status: ${r.status}) Created: ${r.created_at} Target: ${r.target_date} ===`);
    console.log(`Product: ${snap.itemName || r.product_name} | ReelSize: ${snap.reelSize} | CutSize: ${snap.cutSize} | Ups: ${snap.ups} | OrderQty: ${r.order_qty} | TotalWt: ${r.total_weight}`);
    layers.forEach((l, idx) => {
      const allocWeight = (l.allocatedReels || []).reduce((s, x) => s + (Number(x.allocatedWeight) || 0), 0);
      console.log(`  Layer ${idx} [${l.layerName || l.name || 'unnamed'}]: GSM=${l.gsm}, ReqWt=${l.requiredWeight}, CalcWt=${l.calculatedWeight}, AllocReelWt=${allocWeight}, Reels=${(l.allocatedReels || []).map(x => x.reelNumber + ':' + x.allocatedWeight).join(', ')}`);
    });
  }
  await client.end();
}
check().catch(console.error);

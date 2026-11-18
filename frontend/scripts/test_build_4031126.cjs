const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function isFluteLayer(layer, index) {
  if (typeof index === 'number' && [1, 3, 5].includes(index)) return true;
  const lName = (layer?.layerName || layer?.name || layer?.standDescription || '').toLowerCase().trim();
  if (
    lName.includes('flut') ||
    lName.includes('medium') ||
    ['p2', 'p4', 'p6', 'l2', 'l4', 'l6', 'f1', 'f2', 'f3'].includes(lName) ||
    lName.startsWith('layer 2') ||
    lName.startsWith('layer 4') ||
    lName.startsWith('layer 6') ||
    lName === '2' || lName === '4' || lName === '6'
  ) return true;
  return false;
}

async function testBuild() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query("SELECT * FROM public.job_cards WHERE job_card_no = '4031126'");
  const r = res.rows[0];
  const snap = r.product_snapshot;
  const rawData = r.raw_data;
  const costing = rawData.costingData;

  console.log('=== PRODUCT_SNAPSHOT LAYERS ===');
  snap.layers.forEach((l, i) => {
    const isFlute = isFluteLayer(l, i);
    const alloc = (l.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
    console.log(`Layer ${i} [${l.layerName}]: isFlute=${isFlute}, GSM=${l.gsm}, allocWeight=${alloc}, reqWeight=${l.requiredWeight}`);
  });

  console.log('\n=== RAW_DATA.PRODUCT_SNAPSHOT LAYERS ===');
  rawData.productSnapshot.layers.forEach((l, i) => {
    const isFlute = isFluteLayer(l, i);
    const alloc = (l.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
    console.log(`Layer ${i} [${l.layerName}]: isFlute=${isFlute}, GSM=${l.gsm}, allocWeight=${alloc}, reqWeight=${l.requiredWeight}`);
  });

  console.log('\n=== RAW_DATA.COSTINGDATA LAYERS ===');
  costing.layers.forEach((l, i) => {
    console.log(`Layer ${i} [${l.layerName}]: allocWeight=${l.allocatedWeight}, paperWeightPerBox=${l.paperWeightPerBox}, lessBoxWeightLoss=${l.lessBoxWeightLoss}`);
  });

  await client.end();
}

testBuild().catch(console.error);

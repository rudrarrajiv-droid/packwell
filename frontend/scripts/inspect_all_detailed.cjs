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

function calculateLayerWeight(reelSize, cutSize, gsm, noOfPaper, layer, index) {
  if (reelSize <= 0 || cutSize <= 0 || gsm <= 0 || noOfPaper <= 0) return 0;
  const effGsm = isFluteLayer(layer, index) ? gsm * 1.4 : gsm;
  const weight = (reelSize * cutSize * effGsm) / 3100 / 500 * noOfPaper;
  return Math.round(weight * 100) / 100;
}

async function inspectAllDetailed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT firestore_document_id, job_card_no, created_at, target_date, order_qty, total_weight, one_box_weight, status, product_snapshot, raw_data
    FROM public.job_cards
    WHERE created_at >= '2026-11-01' OR target_date >= '2026-11-01'
    ORDER BY created_at ASC
  `);

  console.log(`Checking ${res.rows.length} Job Cards...\n`);

  for (const r of res.rows) {
    const snap = r.product_snapshot || {};
    const rawData = r.raw_data || {};
    const rawSnap = rawData.productSnapshot || {};
    const costing = rawData.costingData || null;

    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(r.order_qty || snap.orderQty || 0);
    const noOfPaper = Math.ceil(orderQty / ups);

    const layers = snap.layers || [];
    let hasFluteMismatch = false;
    let mismatchInfo = [];

    layers.forEach((l, idx) => {
      const isFlute = isFluteLayer(l, idx);
      if (!isFlute) return;

      const gsm = Number(l.gsm) || 0;
      const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, l, idx);
      
      const snapAlloc = (l.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      const rawAlloc = (rawSnap.layers?.[idx]?.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      const costingAlloc = costing?.layers?.[idx]?.allocatedWeight ?? null;

      if (Math.abs(snapAlloc - expectedFluteWeight) > 2 || Math.abs(rawAlloc - expectedFluteWeight) > 2 || (costingAlloc !== null && Math.abs(costingAlloc - expectedFluteWeight) > 2)) {
        hasFluteMismatch = true;
        mismatchInfo.push({
          idx,
          name: l.layerName,
          gsm,
          expectedFluteWeight,
          snapAlloc,
          rawAlloc,
          costingAlloc
        });
      }
    });

    if (hasFluteMismatch) {
      console.log(`JC ${r.job_card_no} [${snap.itemName || r.product_name}] (OrderQty: ${orderQty}, TotalWt: ${r.total_weight}):`);
      mismatchInfo.forEach(m => {
        console.log(`   Layer ${m.idx} (${m.name}, GSM ${m.gsm}): Expected=${m.expectedFluteWeight} | snapAlloc=${m.snapAlloc} | rawAlloc=${m.rawAlloc} | costingAlloc=${m.costingAlloc}`);
      });
    }
  }

  await client.end();
}

inspectAllDetailed().catch(console.error);

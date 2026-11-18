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

function calculateRawWeight(reelSize, cutSize, gsm, noOfPaper) {
  if (reelSize <= 0 || cutSize <= 0 || gsm <= 0 || noOfPaper <= 0) return 0;
  const weight = (reelSize * cutSize * gsm) / 3100 / 500 * noOfPaper;
  return Math.round(weight * 100) / 100;
}

async function deepAudit() {
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

  console.log(`Auditing ${res.rows.length} Job Cards from 2026-11-01 to today...\n`);

  let problemCount = 0;

  for (const r of res.rows) {
    const snap = r.product_snapshot || {};
    const rawData = r.raw_data || {};
    const rawSnap = rawData.productSnapshot || {};
    const costing = rawData.costingData || null;

    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(r.order_qty || snap.orderQty || 0);
    const noOfPaper = Math.ceil(orderQty / ups);

    const layers = snap.layers || [];
    const rawLayers = rawSnap.layers || [];
    const costingLayers = costing?.layers || [];

    const issues = [];

    layers.forEach((l, idx) => {
      const isFlute = isFluteLayer(l, idx);
      const gsm = Number(l.gsm) || 0;
      const expectedWith40 = calculateLayerWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, l, idx);
      const rawWithout40 = calculateRawWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper);

      const allocWeightSnap = (l.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      const rawL = rawLayers[idx] || {};
      const allocWeightRaw = (rawL.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      const costingAlloc = costingLayers[idx]?.allocatedWeight ?? null;

      if (isFlute) {
        // Check if allocated weight in snap, rawSnap, or costing is without 40%
        if (allocWeightSnap > 0 && Math.abs(allocWeightSnap - rawWithout40) < 2 && Math.abs(allocWeightSnap - expectedWith40) > 3) {
          issues.push(`Layer ${idx} (${l.layerName}): snap.allocatedReels = ${allocWeightSnap} kg (MISSING 40%! expected=${expectedWith40})`);
        }
        if (allocWeightRaw > 0 && Math.abs(allocWeightRaw - rawWithout40) < 2 && Math.abs(allocWeightRaw - expectedWith40) > 3) {
          issues.push(`Layer ${idx} (${l.layerName}): raw_data.productSnapshot.allocatedReels = ${allocWeightRaw} kg (MISSING 40%! expected=${expectedWith40})`);
        }
        if (costingAlloc !== null && Math.abs(costingAlloc - rawWithout40) < 2 && Math.abs(costingAlloc - expectedWith40) > 3) {
          issues.push(`Layer ${idx} (${l.layerName}): raw_data.costingData.layers.allocatedWeight = ${costingAlloc} kg (MISSING 40%! expected=${expectedWith40})`);
        }
      }
    });

    if (issues.length > 0) {
      problemCount++;
      console.log(`JC: ${r.job_card_no} (${snap.itemName || r.product_name}) - Issues:`);
      issues.forEach(iss => console.log(`   * ${iss}`));
    }
  }

  console.log(`\n================================`);
  console.log(`Total Job Cards with Issues: ${problemCount}`);
  console.log(`================================`);

  await client.end();
}

deepAudit().catch(console.error);

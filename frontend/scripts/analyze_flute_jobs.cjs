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

function calculateLayerWeightNoFlute(reelSize, cutSize, gsm, noOfPaper) {
  if (reelSize <= 0 || cutSize <= 0 || gsm <= 0 || noOfPaper <= 0) return 0;
  const weight = (reelSize * cutSize * gsm) / 3100 / 500 * noOfPaper;
  return Math.round(weight * 100) / 100;
}

async function analyze() {
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

  console.log(`Analyzing ${res.rows.length} Job Cards...\n`);

  const affectedJobs = [];
  const normalJobs = [];

  for (const r of res.rows) {
    const snap = r.product_snapshot || {};
    const layers = snap.layers || [];
    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(r.order_qty) || 0;
    const noOfPaper = Math.ceil(orderQty / ups);

    let hasFluteMismatch = false;
    const layerAnalysis = [];

    let totalRecalcWeight = 0;

    layers.forEach((l, idx) => {
      const gsm = Number(l.gsm) || 0;
      const isFlute = isFluteLayer(l, idx);
      const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, l, idx);
      const rawNoFluteWeight = calculateLayerWeightNoFlute(snap.reelSize, snap.cutSize, gsm, noOfPaper);
      totalRecalcWeight += expectedFluteWeight;

      const allocWeight = (l.allocatedReels || []).reduce((s, x) => s + (Number(x.allocatedWeight) || 0), 0);
      const savedReq = Number(l.requiredWeight) || Number(l.calculatedWeight) || 0;

      // Check if allocated weight is close to rawNoFluteWeight instead of expectedFluteWeight
      if (isFlute && allocWeight > 0) {
        const diffFromNoFlute = Math.abs(allocWeight - rawNoFluteWeight);
        const diffFromFlute = Math.abs(allocWeight - expectedFluteWeight);
        if (diffFromNoFlute < 2 && diffFromFlute > 5) {
          hasFluteMismatch = true;
          layerAnalysis.push({
            layerIndex: idx,
            layerName: l.layerName || l.name,
            gsm,
            allocWeight,
            rawNoFluteWeight,
            expectedFluteWeight,
            deficit: Math.round((expectedFluteWeight - allocWeight) * 100) / 100
          });
        }
      }
    });

    if (hasFluteMismatch) {
      affectedJobs.push({
        jobCardNo: r.job_card_no,
        createdAt: r.created_at,
        status: r.status,
        productName: snap.itemName || r.product_name,
        orderQty,
        totalWeightSaved: r.total_weight,
        totalRecalcWeight: Math.round(totalRecalcWeight * 100) / 100,
        mismatchedLayers: layerAnalysis
      });
    } else {
      normalJobs.push(r.job_card_no);
    }
  }

  console.log(`========================================`);
  console.log(`AFFECTED JOB CARDS COUNT: ${affectedJobs.length}`);
  console.log(`NORMAL JOB CARDS COUNT: ${normalJobs.length}`);
  console.log(`========================================\n`);

  affectedJobs.forEach(j => {
    console.log(`JC: ${j.jobCardNo} | Date: ${j.createdAt} | Status: ${j.status} | Item: ${j.productName}`);
    console.log(`   Saved Total Wt: ${j.totalWeightSaved} kg | Recalculated Total Wt: ${j.totalRecalcWeight} kg`);
    j.mismatchedLayers.forEach(l => {
      console.log(`   -> Layer ${l.layerIndex} (${l.layerName}, ${l.gsm} GSM): Allocated = ${l.allocWeight} kg (WITHOUT 40%), Should be = ${l.expectedFluteWeight} kg (Deficit = ${l.deficit} kg)`);
    });
  });

  await client.end();
}
analyze().catch(console.error);

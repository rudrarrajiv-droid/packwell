const { Client } = require('pg');
const fs = require('fs');
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

async function fixAll() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT firestore_document_id, job_card_no, created_at, target_date, order_qty, total_weight, one_box_weight, status, product_snapshot, raw_data
    FROM public.job_cards
    WHERE created_at >= '2026-11-01' OR target_date >= '2026-11-01'
    ORDER BY created_at ASC
  `);

  console.log(`Inspecting ${res.rows.length} Job Cards from 2026-11-01 onwards...\n`);

  const updatedJcs = [];

  for (const r of res.rows) {
    let snap = JSON.parse(JSON.stringify(r.product_snapshot || {}));
    let rawData = JSON.parse(JSON.stringify(r.raw_data || {}));
    let rawSnap = rawData.productSnapshot ? JSON.parse(JSON.stringify(rawData.productSnapshot)) : null;
    let costing = rawData.costingData ? JSON.parse(JSON.stringify(rawData.costingData)) : null;

    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(r.order_qty || snap.orderQty || 0);
    const noOfPaper = Math.ceil(orderQty / ups);

    let jcChanged = false;

    // 1. Calculate proper theoretical layers
    let properLayers = (snap.layers || []).map((layer, idx) => {
      const isFlute = isFluteLayer(layer, idx);
      const gsm = Number(layer.gsm) || 0;
      const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, layer, idx);

      const allocReels = layer.allocatedReels || [];
      const currentAllocWeight = allocReels.reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);

      // Check if flute allocation needs 40% fix
      if (isFlute && currentAllocWeight > 0 && Math.abs(currentAllocWeight - expectedFluteWeight) > 1) {
        jcChanged = true;
        if (allocReels.length === 1) {
          allocReels[0].allocatedWeight = expectedFluteWeight;
        } else if (allocReels.length > 1) {
          const ratio = expectedFluteWeight / currentAllocWeight;
          let rem = expectedFluteWeight;
          allocReels.forEach((a, aIdx) => {
            if (aIdx === allocReels.length - 1) {
              a.allocatedWeight = Math.round(rem * 100) / 100;
            } else {
              const nw = Math.round(Number(a.allocatedWeight) * ratio * 100) / 100;
              a.allocatedWeight = nw;
              rem -= nw;
            }
          });
        }
        layer.allocatedReels = allocReels;
        layer.allocatedReelWeight = expectedFluteWeight;
      }

      layer.requiredWeight = expectedFluteWeight;
      layer.calculatedWeight = expectedFluteWeight;
      return layer;
    });

    snap.layers = properLayers;

    // Also check if raw_data.productSnapshot is different from snap
    const rawSnapStr = JSON.stringify(rawData.productSnapshot || {});
    const snapStr = JSON.stringify(snap);
    if (rawSnapStr !== snapStr) {
      jcChanged = true;
      rawData.productSnapshot = JSON.parse(snapStr);
    }

    // Costing update
    if (costing && costing.layers) {
      let costAllocVal = 0;
      let costAllocWt = 0;
      const manfBoxQty = costing.manfBoxQty !== null && costing.manfBoxQty !== undefined ? Number(costing.manfBoxQty) : null;
      const lessBoxQty = manfBoxQty !== null ? Math.max(0, orderQty - manfBoxQty) : 0;

      costing.layers = costing.layers.map((cl, idx) => {
        const snapLayer = snap.layers[idx];
        const isFlute = isFluteLayer(snapLayer, idx);
        const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, Number(snapLayer.gsm), noOfPaper, snapLayer, idx);

        let allocWt = cl.allocatedWeight;
        if (isFlute && Math.abs(allocWt - expectedFluteWeight) > 1) {
          allocWt = expectedFluteWeight;
          jcChanged = true;
        }

        const reelRate = Number(cl.reelRate) || 0;
        const allocVal = Math.round(allocWt * reelRate);
        const paperWeightPerBox = orderQty > 0 ? allocWt / orderQty : 0;
        const lessBoxWeightLoss = Math.round(lessBoxQty * paperWeightPerBox * 100) / 100;
        const lessBoxValueLoss = Math.round(lessBoxWeightLoss * reelRate);

        const dprWeight = cl.dprWeight !== null && cl.dprWeight !== undefined ? Number(cl.dprWeight) : null;
        const dprValue = dprWeight !== null ? Math.round(dprWeight * reelRate) : null;

        costAllocWt += allocWt;
        costAllocVal += allocVal;

        return {
          ...cl,
          allocatedWeight: allocWt,
          allocatedValue: allocVal,
          dprWeight,
          dprValue,
          paperWeightPerBox,
          lessBoxQty,
          lessBoxWeightLoss,
          lessBoxValueLoss
        };
      });

      costing.totalAllocatedWeight = Math.round(costAllocWt * 100) / 100;
      costing.totalAllocatedValue = costAllocVal;
      costing.totalLessBoxLoss = costing.layers.reduce((s, l) => s + (l.lessBoxValueLoss || 0), 0);
      
      const totalDprVal = costing.layers.reduce((s, l) => s + (l.dprValue || 0), 0);
      costing.totalDprValue = totalDprVal;
      costing.totalDprWeight = costing.layers.reduce((s, l) => s + (l.dprWeight || 0), 0);

      const hasDpr = costing.layers.some(l => l.dprWeight !== null);
      costing.paperVariancePL = hasDpr ? Math.round(costAllocVal - totalDprVal - costing.totalLessBoxLoss) : null;

      rawData.costingData = costing;
    }

    if (jcChanged) {
      updatedJcs.push({
        id: r.firestore_document_id,
        jobCardNo: r.job_card_no,
        itemName: snap.itemName,
        snap,
        rawData
      });
    }
  }

  console.log(`Job Cards requiring synchronization: ${updatedJcs.length}`);
  updatedJcs.forEach(u => {
    console.log(` * JC ${u.jobCardNo}: ${u.itemName}`);
  });

  if (updatedJcs.length > 0) {
    console.log('\nUpdating PostgreSQL job_cards table in a transaction...');
    await client.query('BEGIN');
    for (const u of updatedJcs) {
      await client.query(`
        UPDATE public.job_cards
        SET 
          product_snapshot = $1,
          raw_data = $2,
          updated_at = NOW(),
          updated_by = 'System (Comprehensive 40% Flute & Snapshot Sync)'
        WHERE firestore_document_id = $3
      `, [
        JSON.stringify(u.snap),
        JSON.stringify(u.rawData),
        u.id
      ]);
    }
    await client.query('COMMIT');
    console.log(`Successfully committed updates for all ${updatedJcs.length} Job Cards!`);
  }

  await client.end();
}

fixAll().catch(console.error);

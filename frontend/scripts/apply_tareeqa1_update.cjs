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

const jcList = ['1021126', '2021126', '4031126', '10031126', '12031126', '13031126', '14031126', '15031126', '18051126'];

async function applyUpdate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Connected to Database. Fetching target job cards...');

  const res = await client.query(`
    SELECT firestore_document_id, job_card_no, order_qty, total_weight, one_box_weight, product_snapshot, raw_data 
    FROM public.job_cards 
    WHERE job_card_no = ANY($1::text[])
    ORDER BY created_at ASC
  `, [jcList]);

  if (res.rows.length !== jcList.length) {
    console.warn(`Expected ${jcList.length} rows, found ${res.rows.length}`);
  }

  // 1. Save Backup
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `tareeqa1_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(res.rows, null, 2), 'utf8');
  console.log(`Backup saved to: ${backupFile}`);

  // 2. Start Transaction
  await client.query('BEGIN');
  console.log('Transaction started (BEGIN). Updating job cards...');

  for (const r of res.rows) {
    const snap = JSON.parse(JSON.stringify(r.product_snapshot || {}));
    const rawData = JSON.parse(JSON.stringify(r.raw_data || {}));
    const costing = rawData.costingData || null;

    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(snap.orderQty || snap.quantity || r.order_qty || 0);
    const noOfPaper = Math.ceil(orderQty / ups);

    let totalAllocAfter = 0;

    snap.layers = (snap.layers || []).map((layer, idx) => {
      const isFlute = isFluteLayer(layer, idx);
      const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, Number(layer.gsm), noOfPaper, layer, idx);

      const allocReels = layer.allocatedReels || [];
      const currentAllocWeight = allocReels.reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);

      if (isFlute && Math.abs(currentAllocWeight - expectedFluteWeight) > 2) {
        if (allocReels.length === 1) {
          allocReels[0].allocatedWeight = expectedFluteWeight;
        } else if (allocReels.length > 1) {
          const ratio = expectedFluteWeight / currentAllocWeight;
          let remaining = expectedFluteWeight;
          allocReels.forEach((a, aIdx) => {
            if (aIdx === allocReels.length - 1) {
              a.allocatedWeight = Math.round(remaining * 100) / 100;
            } else {
              const newW = Math.round(Number(a.allocatedWeight) * ratio * 100) / 100;
              a.allocatedWeight = newW;
              remaining -= newW;
            }
          });
        }
        layer.allocatedReels = allocReels;
        layer.requiredWeight = expectedFluteWeight;
        layer.calculatedWeight = expectedFluteWeight;
        if (layer.allocatedReelWeight !== undefined) layer.allocatedReelWeight = expectedFluteWeight;
        totalAllocAfter += expectedFluteWeight;
      } else {
        totalAllocAfter += currentAllocWeight;
      }
      return layer;
    });

    // Costing update if saved
    if (costing && costing.layers) {
      let costAllocValAfter = 0;
      costing.layers = costing.layers.map((cl, idx) => {
        const snapLayer = snap.layers[idx];
        const isFlute = isFluteLayer(snapLayer, idx);
        const expectedFluteWeight = calculateLayerWeight(snap.reelSize, snap.cutSize, Number(snapLayer.gsm), noOfPaper, snapLayer, idx);

        if (isFlute && Math.abs(cl.allocatedWeight - expectedFluteWeight) > 2) {
          const reelRate = Number(cl.reelRate) || 0;
          const newAllocVal = Math.round(expectedFluteWeight * reelRate);
          cl.allocatedWeight = expectedFluteWeight;
          cl.allocatedValue = newAllocVal;
        }
        costAllocValAfter += (cl.allocatedValue || 0);
        return cl;
      });

      costing.totalAllocatedWeight = Math.round(totalAllocAfter * 100) / 100;
      costing.totalAllocatedValue = costAllocValAfter;

      const totalDprVal = costing.totalDprValue || 0;
      const lessBoxLoss = costing.totalLessBoxLoss || 0;
      costing.paperVariancePL = costAllocValAfter - totalDprVal - lessBoxLoss;

      rawData.costingData = costing;
    }

    // Update in Postgres
    await client.query(`
      UPDATE public.job_cards
      SET 
        product_snapshot = $1,
        raw_data = $2,
        updated_at = NOW(),
        updated_by = $3
      WHERE firestore_document_id = $4
    `, [
      JSON.stringify(snap),
      JSON.stringify(rawData),
      'System (Tareeqa 1 Flute 40% Alignment)',
      r.firestore_document_id
    ]);

    console.log(`Updated JC: ${r.job_card_no} (DocId: ${r.firestore_document_id})`);
  }

  await client.query('COMMIT');
  console.log('Transaction COMMITTED successfully! All 9 Job Cards updated.');

  await client.end();
}

applyUpdate().catch(async (err) => {
  console.error('Update failed:', err);
  process.exit(1);
});

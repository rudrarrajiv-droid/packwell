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

function calcWeight(reelSize, cutSize, gsm, noOfPaper, effGsmMultiplier = 1) {
  if (reelSize <= 0 || cutSize <= 0 || gsm <= 0 || noOfPaper <= 0) return 0;
  const effGsm = gsm * effGsmMultiplier;
  const weight = (reelSize * cutSize * effGsm) / 3100 / 500 * noOfPaper;
  return Math.round(weight * 100) / 100;
}

async function verifyAll() {
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

  const suspected = [];

  for (const r of res.rows) {
    const snap = r.product_snapshot || {};
    const layers = snap.layers || [];
    const ups = Number(snap.ups) > 0 ? Number(snap.ups) : 1;
    const orderQty = Number(r.order_qty) || 0;
    const noOfPaper = Math.ceil(orderQty / ups);
    const costing = (r.raw_data && r.raw_data.costingData) || null;

    let hasMismatch = false;
    const details = [];

    layers.forEach((l, idx) => {
      const isFlute = isFluteLayer(l, idx);
      if (!isFlute) return;

      const gsm = Number(l.gsm) || 0;
      const expectedFlute = calcWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, 1.4);
      const rawNoFlute = calcWeight(snap.reelSize, snap.cutSize, gsm, noOfPaper, 1.0);

      const allocWeight = (l.allocatedReels || []).reduce((s, x) => s + (Number(x.allocatedWeight) || 0), 0);
      const costingAlloc = costing?.layers?.[idx]?.allocatedWeight ?? null;

      // Check if allocWeight or costingAlloc is closer to rawNoFlute than expectedFlute
      const currentAlloc = allocWeight > 0 ? allocWeight : costingAlloc;
      if (currentAlloc && Math.abs(currentAlloc - rawNoFlute) < Math.abs(currentAlloc - expectedFlute) && Math.abs(currentAlloc - expectedFlute) > 3) {
        hasMismatch = true;
        details.push({
          idx,
          name: l.layerName,
          gsm,
          currentAlloc,
          rawNoFlute,
          expectedFlute,
          diff: Math.round((expectedFlute - currentAlloc) * 100) / 100
        });
      }
    });

    if (hasMismatch) {
      suspected.push({
        jobCardNo: r.job_card_no,
        createdAt: r.created_at,
        details
      });
    }
  }

  console.log('Suspected Job Cards total:', suspected.length);
  suspected.forEach(s => {
    console.log(`JC: ${s.jobCardNo} (Created: ${s.createdAt})`);
    s.details.forEach(d => console.log(`   Layer ${d.idx} (${d.name}, ${d.gsm}gsm): curr=${d.currentAlloc}, noFlute=${d.rawNoFlute}, expected=${d.expectedFlute}, diff=+${d.diff}`));
  });

  await client.end();
}
verifyAll().catch(console.error);

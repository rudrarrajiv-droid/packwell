const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

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

async function verifyPrintView() {
  const { data, error } = await supabase
    .from('job_cards')
    .select('job_card_no, product_name, order_qty, product_snapshot, raw_data')
    .in('job_card_no', jcList)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  for (const jc of data) {
    const snap = jc.product_snapshot || {};
    const rawSnap = jc.raw_data?.productSnapshot || {};
    const ups = Number(snap.ups) || 1;
    const noOfPaper = Math.ceil(Number(jc.order_qty || 0) / ups);

    console.log(`\n======================================================`);
    console.log(`JC: ${jc.job_card_no} | Item: ${snap.itemName || jc.product_name} | OrderQty: ${jc.order_qty}`);
    console.log(`ReelSize: ${snap.reelSize}" | CutSize: ${snap.cutSize}" | UPS: ${ups} | NoOfPaper: ${noOfPaper}`);
    console.log(`------------------------------------------------------`);

    (snap.layers || []).forEach((layer, idx) => {
      const isFlute = isFluteLayer(layer, idx);
      const reqW = calculateLayerWeight(snap.reelSize, snap.cutSize, Number(layer.gsm), noOfPaper, layer, idx);
      const allocSnap = (layer.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      const allocRaw = (rawSnap.layers?.[idx]?.allocatedReels || []).reduce((s, a) => s + (Number(a.allocatedWeight) || 0), 0);
      
      const diffSnap = Math.round((reqW - allocSnap) * 100) / 100;
      const statusSnap = diffSnap <= 0.1 ? 'MATCHED' : `SHORT ${diffSnap} KG`;

      console.log(`Layer ${idx} [${layer.layerName} - GSM ${layer.gsm} ${isFlute ? '(FLUTE +40%)' : '(LINER)'}]: Req = ${reqW} kg | AllocSnap = ${allocSnap} kg | AllocRaw = ${allocRaw} kg | Status = ${statusSnap}`);
    });
  }
}

verifyPrintView();

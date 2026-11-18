const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const JOB_CARD_SELECT_COLUMNS = [
  'firestore_document_id',
  'job_card_no',
  'target_date_raw',
  'target_date',
  'po_id_raw',
  'po_no',
  'resolved_po_id',
  'customer_id_raw',
  'customer_name',
  'resolved_customer_id',
  'product_id_raw',
  'product_name',
  'resolved_product_id',
  'order_qty',
  'one_box_weight',
  'total_weight',
  'paper_quantity',
  'ply_quantity',
  'priority',
  'remarks',
  'product_snapshot',
  'reel_allocation_skipped',
  'approval_status',
  'approval_reason',
  'approval_requested_by',
  'approval_requested_at',
  'approval_expires_at',
  'status',
  'is_archived',
  'issued_by',
  'issued_at',
  'expected_delivery_at',
  'completed_at',
  'completed_by',
  'completion_status',
  'fg_qty',
  'produced_qty',
  'deleted_at',
  'deleted_by',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'raw_data',
].join(', ');

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapJobCardRow(row) {
  const rawData = row.raw_data ?? {};
  const orderQty = toNumber(row.order_qty ?? rawData.orderQty ?? rawData.quantity);
  const producedQty = toNumber(row.produced_qty ?? rawData.producedQty ?? rawData.producedQuantity);

  return {
    ...rawData,
    id: row.firestore_document_id,
    jobCardNo: row.job_card_no ?? rawData.jobCardNo ?? '',
    targetDate: row.target_date_raw ?? row.target_date ?? rawData.targetDate ?? null,
    poId: row.po_id_raw ?? rawData.poId ?? null,
    poNo: row.po_no ?? rawData.poNo ?? null,
    customerId: row.customer_id_raw ?? rawData.customerId ?? null,
    customerName: row.customer_name ?? rawData.customerName ?? null,
    productId: row.product_id_raw ?? row.resolved_product_id ?? rawData.productId ?? null,
    productName: row.product_name ?? rawData.productName ?? null,
    orderQty,
    quantity: orderQty,
    oneBoxWeight: toNumber(row.one_box_weight ?? rawData.oneBoxWeight),
    totalWeight: toNumber(row.total_weight ?? rawData.totalWeight),
    paperQuantity: toNumber(row.paper_quantity ?? rawData.paperQuantity),
    plyQuantity: toNumber(row.ply_quantity ?? rawData.plyQuantity),
    priority: row.priority ?? rawData.priority ?? null,
    remarks: row.remarks ?? rawData.remarks ?? '',
    productSnapshot: row.product_snapshot ?? rawData.productSnapshot ?? {},
  };
}

async function testFetch() {
  const { data, error } = await supabase
    .from('job_cards')
    .select(JOB_CARD_SELECT_COLUMNS)
    .eq('job_card_no', '4031126');

  if (error) {
    console.error('Error:', error);
    return;
  }
  const jc = mapJobCardRow(data[0]);
  console.log('Fetched JC:', jc.jobCardNo);
  console.log('jc.totalWeight:', jc.totalWeight);
  console.log('jc.productSnapshot.layers:');
  jc.productSnapshot.layers.forEach((l, i) => {
    console.log(`  Layer ${i} [${l.layerName}]: GSM=${l.gsm}, Req=${l.requiredWeight}, Calc=${l.calculatedWeight}, Alloc=${JSON.stringify(l.allocatedReels)}`);
  });
}

testFetch();

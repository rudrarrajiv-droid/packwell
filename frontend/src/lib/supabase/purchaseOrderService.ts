import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface PurchaseOrder {
  id?: string;
  poNo: string;
  poDate: string;
  deliveryDate: string;
  customerId: string;
  customerName: string;
  consignee: string;
  productId: string;
  productName: string;
  artworkNo: string;
  size: string;
  rate: number;
  orderQty: number;
  inQty: number;
  outQty: number;
  status: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
  history?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isArchived: boolean;
}

export const getPurchaseOrderBalance = (po: PurchaseOrder): number => {
  if (po.status === 'CLOSED' || po.status === 'CANCELLED') return 0;
  const bal = po.orderQty + (po.inQty || 0) - (po.outQty || 0);
  return bal < 0 ? 0 : bal;
};

export interface POTransaction {
  id?: string;
  poId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  date: string;
  remarks?: string;
  referenceId?: string;
  performedBy: string;
  createdAt?: string | null;
}

type PurchaseOrderRow = {
  firestore_document_id: string;
  po_no: string | null;
  po_date_raw: string | null;
  po_date: string | null;
  delivery_date_raw: string | null;
  customer_id_raw: string | null;
  customer_name: string | null;
  resolved_customer_id: string | null;
  consignee: string | null;
  artwork_no: string | null;
  size: string | null;
  product_id_raw: string | null;
  product_name: string | null;
  resolved_product_id: string | null;
  rate: number | string | null;
  order_qty: number | string | null;
  in_qty: number | string | null;
  out_qty: number | string | null;
  status: string | null;
  history: unknown;
  is_archived: boolean | null;
  import_run_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw_data: Record<string, any> | null;
};

type POTransactionRow = {
  firestore_document_id: string;
  po_id: string | null;
  type: string | null;
  quantity: number | string | null;
  transaction_date: string | null;
  remarks: string | null;
  reference_id: string | null;
  performed_by: string | null;
  created_at: string | null;
  raw_data?: Record<string, any> | null;
};

type CreatePurchaseOrderInput = Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;

const PURCHASE_ORDER_SELECT_COLUMNS = [
  'firestore_document_id',
  'po_no',
  'po_date_raw',
  'po_date',
  'delivery_date_raw',
  'customer_id_raw',
  'customer_name',
  'resolved_customer_id',
  'consignee',
  'artwork_no',
  'size',
  'product_id_raw',
  'product_name',
  'resolved_product_id',
  'rate',
  'order_qty',
  'in_qty',
  'out_qty',
  'status',
  'history',
  'is_archived',
  'import_run_id',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'raw_data',
].join(', ');

const PO_TRANSACTION_SELECT_COLUMNS = [
  'firestore_document_id',
  'po_id',
  'type',
  'quantity',
  'transaction_date',
  'remarks',
  'reference_id',
  'performed_by',
  'created_at',
  'raw_data',
].join(', ');

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parsePoDateToIsoDate(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serialDays = Math.floor(Number(trimmed));
    if (!Number.isFinite(serialDays)) {
      return null;
    }
    const excelEpochUtcMs = Date.UTC(1899, 11, 30);
    return new Date(excelEpochUtcMs + serialDays * 86400000).toISOString().slice(0, 10);
  }

  return null;
}

function mapPurchaseOrderRow(row: PurchaseOrderRow): PurchaseOrder {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    poNo: row.po_no ?? rawData.poNo ?? '',
    poDate: row.po_date_raw ?? row.po_date ?? rawData.poDate ?? '',
    deliveryDate: row.delivery_date_raw ?? rawData.deliveryDate ?? '',
    customerId: row.customer_id_raw ?? row.resolved_customer_id ?? rawData.customerId ?? '',
    customerName: row.customer_name ?? rawData.customerName ?? '',
    consignee: row.consignee ?? rawData.consignee ?? '',
    productId: row.product_id_raw ?? row.resolved_product_id ?? rawData.productId ?? '',
    productName: row.product_name ?? rawData.productName ?? '',
    artworkNo: row.artwork_no ?? rawData.artworkNo ?? '',
    size: row.size ?? rawData.size ?? '',
    rate: toNumber(row.rate),
    orderQty: toNumber(row.order_qty),
    inQty: toNumber(row.in_qty),
    outQty: toNumber(row.out_qty),
    status: (row.status as PurchaseOrder['status'] | null) ?? 'OPEN',
    history: row.history ?? rawData.history ?? [],
    isArchived: row.is_archived ?? false,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPOTransactionRow(row: POTransactionRow): POTransaction {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    poId: row.po_id ?? rawData.poId ?? '',
    type: (row.type as POTransaction['type'] | null) ?? 'IN',
    quantity: toNumber(row.quantity),
    date: row.transaction_date ?? rawData.date ?? '',
    remarks: row.remarks ?? rawData.remarks ?? '',
    referenceId: row.reference_id ?? rawData.referenceId ?? undefined,
    performedBy: row.performed_by ?? rawData.performedBy ?? 'System',
    createdAt: row.created_at ?? null,
  };
}

function buildPurchaseOrderInsertRow(
  purchaseOrder: CreatePurchaseOrderInput,
  user: string,
  options?: { id?: string; importRunId?: string | null }
) {
  const id = options?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const history = purchaseOrder.history ?? [];
  const normalizedStatus = purchaseOrder.status ?? 'OPEN';
  const row = {
    firestore_document_id: id,
    po_no: purchaseOrder.poNo,
    po_date_raw: purchaseOrder.poDate,
    po_date: parsePoDateToIsoDate(purchaseOrder.poDate),
    delivery_date_raw: purchaseOrder.deliveryDate,
    customer_id_raw: purchaseOrder.customerId,
    customer_name: purchaseOrder.customerName,
    resolved_customer_id: null,
    consignee: purchaseOrder.consignee,
    artwork_no: purchaseOrder.artworkNo,
    size: purchaseOrder.size,
    product_id_raw: purchaseOrder.productId,
    product_name: purchaseOrder.productName,
    resolved_product_id: null,
    rate: purchaseOrder.rate,
    order_qty: purchaseOrder.orderQty,
    in_qty: purchaseOrder.inQty,
    out_qty: purchaseOrder.outQty,
    status: normalizedStatus,
    history,
    is_archived: purchaseOrder.isArchived,
    import_run_id: options?.importRunId ?? null,
    created_by: user,
    updated_by: user,
    created_at: now,
    updated_at: now,
  };

  return {
    ...row,
    raw_data: {
      id,
      poNo: purchaseOrder.poNo,
      poDate: purchaseOrder.poDate,
      deliveryDate: purchaseOrder.deliveryDate,
      customerId: purchaseOrder.customerId,
      customerName: purchaseOrder.customerName,
      consignee: purchaseOrder.consignee,
      productId: purchaseOrder.productId,
      productName: purchaseOrder.productName,
      artworkNo: purchaseOrder.artworkNo,
      size: purchaseOrder.size,
      rate: purchaseOrder.rate,
      orderQty: purchaseOrder.orderQty,
      inQty: purchaseOrder.inQty,
      outQty: purchaseOrder.outQty,
      status: normalizedStatus,
      history,
      isArchived: purchaseOrder.isArchived,
      importRunId: options?.importRunId ?? null,
      createdBy: user,
      updatedBy: user,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function purchaseOrderCompositeKey(purchaseOrder: Pick<PurchaseOrder, 'poNo' | 'productName' | 'deliveryDate' | 'orderQty'>): string {
  return (
    purchaseOrder.poNo +
    '_' +
    purchaseOrder.productName +
    '_' +
    (purchaseOrder.deliveryDate || '') +
    '_' +
    (purchaseOrder.orderQty || '')
  ).toLowerCase();
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_SELECT_COLUMNS)
    .eq('is_archived', false);

  if (error) {
    console.error('Error fetching purchase orders:', error);
    throw error;
  }

  return (data || []).map((row) => mapPurchaseOrderRow(row as unknown as PurchaseOrderRow));
};

export const getAllPOTransactions = async (): Promise<POTransaction[]> => {
  const { data, error } = await supabase
    .from('po_transactions')
    .select(PO_TRANSACTION_SELECT_COLUMNS)
    .order('created_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching PO transactions:', error);
    throw error;
  }

  return (data || []).map((row) => mapPOTransactionRow(row as unknown as POTransactionRow));
};

export const getPOTransactionsByPOId = async (poId: string): Promise<POTransaction[]> => {
  const { data, error } = await supabase
    .from('po_transactions')
    .select(PO_TRANSACTION_SELECT_COLUMNS)
    .eq('po_id', poId)
    .order('created_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching PO history:', error);
    throw error;
  }

  return (data || []).map((row) => mapPOTransactionRow(row as unknown as POTransactionRow));
};

export const getPendingPOsForCustomerAndProducts = async (customerId: string, productIds: string[]): Promise<PurchaseOrder[]> => {
  if (!customerId || productIds.length === 0) return [];

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_SELECT_COLUMNS)
    .eq('is_archived', false)
    .eq('customer_id_raw', customerId)
    .in('product_id_raw', productIds)
    .in('status', ['OPEN', 'PARTIAL']);

  if (error) {
    console.error('Error fetching pending POs for items:', error);
    throw error;
  }

  return (data || []).map((row) => mapPurchaseOrderRow(row as unknown as PurchaseOrderRow));
};

export interface ExistingPOInfo {
  exists: boolean;
  poNo?: string;
  customerId?: string;
  customerName?: string;
  poDate?: string;
  consignee?: string;
  items: Array<{
    id?: string;
    productId: string;
    productName: string;
    orderQty: number;
    rate: number;
    deliveryDate: string;
  }>;
}

export const getExistingPOInfo = async (poNo: string): Promise<ExistingPOInfo | null> => {
  const normalizedPoNo = poNo.trim();
  if (!normalizedPoNo) return null;

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_SELECT_COLUMNS)
    .eq('po_no', normalizedPoNo)
    .eq('is_archived', false);

  if (error) {
    console.error('Error checking existing PO info:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return { exists: false, items: [] };
  }

  const mapped = data.map((row) => mapPurchaseOrderRow(row as unknown as PurchaseOrderRow));
  const first = mapped[0];

  return {
    exists: true,
    poNo: first.poNo,
    customerId: first.customerId,
    customerName: first.customerName,
    poDate: first.poDate,
    consignee: first.consignee,
    items: mapped.map(m => ({
      id: m.id,
      productId: m.productId,
      productName: m.productName,
      orderQty: m.orderQty,
      rate: m.rate,
      deliveryDate: m.deliveryDate
    }))
  };
};

export const purchaseOrderNumberExists = async (poNo: string): Promise<boolean> => {
  const normalizedPoNo = poNo.trim();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('firestore_document_id')
    .eq('po_no', normalizedPoNo)
    .eq('is_archived', false)
    .limit(1);

  if (error) {
    console.error('Error checking PO number:', error);
    throw error;
  }

  return (data || []).length > 0;
};

export const createPurchaseOrders = async (
  purchaseOrders: CreatePurchaseOrderInput[],
  user: string = 'System'
): Promise<{ successCount: number }> => {
  const rows = purchaseOrders.map((purchaseOrder) => buildPurchaseOrderInsertRow(purchaseOrder, user));

  const { error } = await supabase.from('purchase_orders').insert(rows);

  if (error) {
    console.error('Error creating purchase orders:', error);
    throw error;
  }

  // Auto-IN Transaction for each PO created
  const txRows = rows.map(r => ({
    firestore_document_id: crypto.randomUUID(),
    po_id: r.firestore_document_id,
    type: 'IN',
    quantity: r.order_qty,
    transaction_date: r.po_date_raw || r.po_date || new Date().toISOString(),
    remarks: 'Auto-IN on PO Creation',
    performed_by: user,
    created_at: new Date().toISOString(),
    raw_data: {}
  }));

  if (txRows.length > 0) {
    const { error: txError } = await supabase.from('po_transactions').insert(txRows);
    if (txError) console.error('Error creating auto-IN transactions:', txError);
  }

  if (rows.length > 0) {
    await logActivity({
      user,
      action: `Created Bulk PO ${purchaseOrders[0]?.poNo || ''} with ${rows.length} items`,
      entity: 'purchaseOrders',
      referenceId: purchaseOrders[0]?.poNo || undefined,
    });
  }

  return { successCount: rows.length };
};

export const executePOInTransaction = async (
  poId: string,
  quantity: number,
  date: string,
  remarks: string,
  user: string
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('execute_po_in_transaction', {
    p_po_id: poId,
    p_transaction_id: crypto.randomUUID(),
    p_quantity: quantity,
    p_date: date,
    p_remarks: remarks || '',
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error executing PO IN transaction:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('PO transaction RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'PO IN Transaction Recorded',
    entity: 'purchaseOrders',
    referenceId: poId,
  });

  return true;
};

export const importPurchaseOrdersBatch = async (
  purchaseOrdersToCreate: CreatePurchaseOrderInput[],
  runId: string,
  user: string = 'System'
): Promise<{ successCount: number; skippedCount: number; errors: string[] }> => {
  const existingPurchaseOrders = await getPurchaseOrders();
  const existingKeys = new Set(existingPurchaseOrders.map((purchaseOrder) => purchaseOrderCompositeKey(purchaseOrder)));
  const errors: string[] = [];
  let successCount = 0;
  let skippedCount = 0;

  const chunkSize = 500;
  for (let index = 0; index < purchaseOrdersToCreate.length; index += chunkSize) {
    const chunk = purchaseOrdersToCreate.slice(index, index + chunkSize);
    const rows = [];

    for (const purchaseOrder of chunk) {
      if (!purchaseOrder.poNo) {
        continue;
      }

      const uniqueKey = purchaseOrderCompositeKey(purchaseOrder);
      if (existingKeys.has(uniqueKey)) {
        skippedCount += 1;
        continue;
      }

      existingKeys.add(uniqueKey);
      rows.push(buildPurchaseOrderInsertRow(purchaseOrder, user, { importRunId: runId }));
    }

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase.from('purchase_orders').insert(rows);
    if (error) {
      console.error('Error importing purchase orders batch:', error);
      errors.push(error.message);
      throw new Error('Batch import failed: ' + error.message);
    }

    // Auto-IN Transaction for each imported PO
    const txRows = rows.map(r => ({
      firestore_document_id: crypto.randomUUID(),
      po_id: r.firestore_document_id,
      type: 'IN',
      quantity: r.order_qty,
      transaction_date: r.po_date_raw || r.po_date || new Date().toISOString(),
      remarks: 'Auto-IN on PO Import',
      performed_by: user,
      created_at: new Date().toISOString(),
      raw_data: {}
    }));

    if (txRows.length > 0) {
      const { error: txError } = await supabase.from('po_transactions').insert(txRows);
      if (txError) console.error('Error creating auto-IN transactions for import:', txError);
    }

    successCount += rows.length;
  }

  if (successCount > 0) {
    await logActivity({
      user,
      action: `Bulk Imported ${successCount} POs (Run: ${runId})`,
      entity: 'purchaseOrders',
      referenceId: runId,
    });
  }

  return { successCount, skippedCount, errors };
};

export const updatePurchaseOrder = async (
  id: string,
  updates: Partial<PurchaseOrder>,
  user: string
): Promise<boolean> => {
  const { data: existingRow, error: fetchError } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_SELECT_COLUMNS)
    .eq('firestore_document_id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('Error loading purchase order for update:', fetchError);
    throw fetchError;
  }

  if (!existingRow) {
    throw new Error('Purchase Order not found');
  }

  const existing = existingRow as unknown as PurchaseOrderRow;
  const now = new Date().toISOString();
  const currentPurchaseOrder = mapPurchaseOrderRow(existing);
  const nextPurchaseOrder: PurchaseOrder = {
    ...currentPurchaseOrder,
    ...updates,
    id,
    updatedAt: now,
    updatedBy: user,
  };

  const rawData = {
    ...(existing.raw_data ?? {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'poNo') ? { poNo: nextPurchaseOrder.poNo } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'poDate') ? { poDate: nextPurchaseOrder.poDate } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'deliveryDate') ? { deliveryDate: nextPurchaseOrder.deliveryDate } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'customerId') ? { customerId: nextPurchaseOrder.customerId } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'customerName') ? { customerName: nextPurchaseOrder.customerName } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'consignee') ? { consignee: nextPurchaseOrder.consignee } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'productId') ? { productId: nextPurchaseOrder.productId } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'productName') ? { productName: nextPurchaseOrder.productName } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'artworkNo') ? { artworkNo: nextPurchaseOrder.artworkNo } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'size') ? { size: nextPurchaseOrder.size } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'rate') ? { rate: nextPurchaseOrder.rate } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'orderQty') ? { orderQty: nextPurchaseOrder.orderQty } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'inQty') ? { inQty: nextPurchaseOrder.inQty } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'outQty') ? { outQty: nextPurchaseOrder.outQty } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'status') ? { status: nextPurchaseOrder.status } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'history') ? { history: nextPurchaseOrder.history ?? [] } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'isArchived') ? { isArchived: nextPurchaseOrder.isArchived } : {}),
    updatedAt: now,
    updatedBy: user,
  };

  const updatePayload: Record<string, any> = {
    updated_by: user,
    updated_at: now,
    raw_data: rawData,
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'poNo')) {
    updatePayload.po_no = nextPurchaseOrder.poNo;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'poDate')) {
    updatePayload.po_date_raw = nextPurchaseOrder.poDate;
    updatePayload.po_date = parsePoDateToIsoDate(nextPurchaseOrder.poDate);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'deliveryDate')) {
    updatePayload.delivery_date_raw = nextPurchaseOrder.deliveryDate;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'customerId')) {
    updatePayload.customer_id_raw = nextPurchaseOrder.customerId;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'customerName')) {
    updatePayload.customer_name = nextPurchaseOrder.customerName;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'consignee')) {
    updatePayload.consignee = nextPurchaseOrder.consignee;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'productId')) {
    updatePayload.product_id_raw = nextPurchaseOrder.productId;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'productName')) {
    updatePayload.product_name = nextPurchaseOrder.productName;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'artworkNo')) {
    updatePayload.artwork_no = nextPurchaseOrder.artworkNo;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'size')) {
    updatePayload.size = nextPurchaseOrder.size;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'rate')) {
    updatePayload.rate = nextPurchaseOrder.rate;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'orderQty')) {
    updatePayload.order_qty = nextPurchaseOrder.orderQty;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'inQty')) {
    updatePayload.in_qty = nextPurchaseOrder.inQty;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'outQty')) {
    updatePayload.out_qty = nextPurchaseOrder.outQty;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    updatePayload.status = nextPurchaseOrder.status;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'history')) {
    updatePayload.history = nextPurchaseOrder.history ?? [];
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'isArchived')) {
    updatePayload.is_archived = nextPurchaseOrder.isArchived;
  }

  const { error } = await supabase
    .from('purchase_orders')
    .update(updatePayload)
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error updating purchase order:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Updated Purchase Order: ${updates.poNo || currentPurchaseOrder.poNo || id}`,
    entity: 'purchaseOrders',
    referenceId: id,
  });

  return true;
};

export const deletePurchaseOrder = async (id: string, user: string): Promise<boolean> => {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error deleting purchase order:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Deleted Purchase Order (ID: ${id})`,
    entity: 'purchaseOrders',
    referenceId: id,
  });

  return true;
};

export const bulkCloseCustomerPOs = async (
  poIds: string[], 
  user: string,
  options?: { date?: string; remarks?: string }
): Promise<boolean> => {
  if (!poIds.length) return true;

  const now = new Date().toISOString();
  const txDate = options?.date || now.split('T')[0];
  const remarks = options?.remarks || 'NIL PO / Bulk Close Adjustment';

  // 1. Fetch current PO details to know pending balances
  const { data: pos, error: fetchErr } = await supabase
    .from('purchase_orders')
    .select('firestore_document_id, po_no, order_qty, in_qty, out_qty, status, raw_data')
    .in('firestore_document_id', poIds);

  if (fetchErr) {
    console.error('Error fetching POs for bulk closing:', fetchErr);
    throw fetchErr;
  }

  const txRows: any[] = [];

  for (const row of (pos || [])) {
    const orderQty = toNumber(row.order_qty);
    const inQty = toNumber(row.in_qty);
    const outQty = toNumber(row.out_qty);
    const pendingBal = orderQty + inQty - outQty;

    // If there is pending balance remaining, generate an OUT adjustment transaction to bring balance to 0!
    if (pendingBal > 0) {
      txRows.push({
        firestore_document_id: crypto.randomUUID(),
        po_id: row.firestore_document_id,
        type: 'OUT',
        quantity: pendingBal,
        transaction_date: txDate,
        remarks: remarks,
        performed_by: user,
        created_at: now,
        raw_data: {}
      });

      const newOut = outQty + pendingBal;
      const rawData = { 
        ...(row.raw_data || {}), 
        outQty: newOut, 
        status: 'CLOSED', 
        updatedAt: now, 
        updatedBy: user 
      };

      await supabase
        .from('purchase_orders')
        .update({
          out_qty: newOut,
          status: 'CLOSED',
          updated_at: now,
          updated_by: user,
          raw_data: rawData
        })
        .eq('firestore_document_id', row.firestore_document_id);
    } else {
      const rawData = { 
        ...(row.raw_data || {}), 
        status: 'CLOSED', 
        updatedAt: now, 
        updatedBy: user 
      };

      await supabase
        .from('purchase_orders')
        .update({
          status: 'CLOSED',
          updated_at: now,
          updated_by: user,
          raw_data: rawData
        })
        .eq('firestore_document_id', row.firestore_document_id);
    }
  }

  // Insert all OUT adjustment transaction records
  if (txRows.length > 0) {
    const { error: txError } = await supabase.from('po_transactions').insert(txRows);
    if (txError) {
      console.error('Error inserting NIL PO transactions:', txError);
    }
  }

  await logActivity({
    user,
    action: `Bulk Closed (NIL) ${poIds.length} POs with OUT adjustment transactions`,
    entity: 'purchaseOrders',
  });

  return true;
};

export const adjustPurchaseOrderStock = async ({
  poId,
  targetBalance,
  date,
  remarks,
  user
}: {
  poId: string;
  targetBalance: number;
  date: string;
  remarks?: string;
  user: string;
}): Promise<boolean> => {
  const { data: row, error: fetchErr } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_SELECT_COLUMNS)
    .eq('firestore_document_id', poId)
    .single();

  if (fetchErr) throw fetchErr;
  if (!row) throw new Error('Purchase Order not found');

  const po = mapPurchaseOrderRow(row as unknown as PurchaseOrderRow);
  const currentBal = po.orderQty + (po.inQty || 0) - (po.outQty || 0);
  const difference = targetBalance - currentBal;

  const now = new Date().toISOString();
  const txDate = date || now.split('T')[0];
  const auditRemarks = remarks || (targetBalance === 0 ? 'NIL PO Balance Adjustment' : `PO Balance Adjustment (Target: ${targetBalance})`);

  let newIn = po.inQty || 0;
  let newOut = po.outQty || 0;

  if (difference < 0) {
    // Need to reduce balance -> add to OUT
    const outDiff = Math.abs(difference);
    newOut += outDiff;

    const { error: txError } = await supabase.from('po_transactions').insert({
      firestore_document_id: crypto.randomUUID(),
      po_id: poId,
      type: 'OUT',
      quantity: outDiff,
      transaction_date: txDate,
      remarks: auditRemarks,
      performed_by: user,
      created_at: now,
      raw_data: {}
    });
    if (txError) throw txError;
  } else if (difference > 0) {
    // Need to increase balance -> add to IN
    newIn += difference;

    const { error: txError } = await supabase.from('po_transactions').insert({
      firestore_document_id: crypto.randomUUID(),
      po_id: poId,
      type: 'IN',
      quantity: difference,
      transaction_date: txDate,
      remarks: auditRemarks,
      performed_by: user,
      created_at: now,
      raw_data: {}
    });
    if (txError) throw txError;
  }

  const newStatus = targetBalance === 0 ? 'CLOSED' : (newOut > 0 ? 'PARTIAL' : 'OPEN');
  const rawData = {
    ...((row as any)?.raw_data || {}),
    inQty: newIn,
    outQty: newOut,
    status: newStatus,
    updatedAt: now,
    updatedBy: user
  };

  const { error: updateErr } = await supabase
    .from('purchase_orders')
    .update({
      in_qty: newIn,
      out_qty: newOut,
      status: newStatus,
      updated_at: now,
      updated_by: user,
      raw_data: rawData
    })
    .eq('firestore_document_id', poId);

  if (updateErr) throw updateErr;

  await logActivity({
    user,
    action: `Adjusted PO ${po.poNo} balance from ${currentBal} to ${targetBalance} (Diff: ${difference})`,
    entity: 'purchaseOrders',
    referenceId: poId
  });

  return true;
};
import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface FinishGood {
  id: string;
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingBalance: number;
  nonMovingBalance: number;
  rate: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isArchived?: boolean;
}

export interface FinishGoodTransaction {
  id: string;
  finishGoodId: string;
  type: 'IN' | 'OUT';
  category: 'REGULAR' | 'REJECTED' | 'DISPATCH' | 'NON-MOVING';
  quantity: number;
  remainingBalance?: number;
  rate?: number;
  date: string;
  referenceId?: string | null;
  referenceNo?: string | null;
  invoiceNo?: string | null;
  place?: string | null;
  transporterName?: string | null;
  vehicleNo?: string | null;
  vehicleSize?: string | null;
  freight?: number;
  holding?: number;
  point?: string | null;
  others?: string | null;
  receivingStatus?: 'PENDING' | 'RECEIVED' | null;
  receivingConfirmedAt?: string | null;
  receivingConfirmedBy?: string | null;
  performedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isArchived?: boolean;
}

export interface FinishGoodInwardPayload {
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  quantity: number;
  category: 'REGULAR' | 'REJECTED';
  date: string;
  rate: number;
  jobCardAllocations?: { jobCardId: string; quantity: number }[];
}

export interface FinishGoodOutwardPayload {
  productId: string;
  quantity: number;
  category: 'DISPATCH' | 'NON-MOVING';
  poId?: string;
}

export interface LogisticsPayload {
  date: string;
  invoiceNo: string;
  place: string;
  transporterName: string;
  vehicleNo: string;
  vehicleSize: string;
  freight: number;
  holding: number;
  point: string;
  others: string;
}

type FinishGoodRow = {
  firestore_document_id: string;
  product_id: string | null;
  product_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  opening_qty: number | string | null;
  in_qty: number | string | null;
  out_qty: number | string | null;
  closing_balance: number | string | null;
  non_moving_balance: number | string | null;
  rate: number | string | null;
  is_archived: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw_data: Record<string, any> | null;
};

type FinishGoodTransactionRow = {
  firestore_document_id: string;
  finish_good_id: string | null;
  type: string | null;
  category: string | null;
  quantity: number | string | null;
  remaining_balance: number | string | null;
  rate: number | string | null;
  transaction_date: string | null;
  reference_id: string | null;
  reference_no: string | null;
  invoice_no: string | null;
  place: string | null;
  transporter_name: string | null;
  vehicle_no: string | null;
  vehicle_size: string | null;
  freight: number | string | null;
  holding: number | string | null;
  point: string | null;
  others: string | null;
  receiving_status: string | null;
  receiving_confirmed_at: string | null;
  receiving_confirmed_by: string | null;
  performed_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_archived: boolean | null;
  raw_data: Record<string, any> | null;
};

const FINISH_GOOD_SELECT_COLUMNS = [
  'firestore_document_id',
  'product_id',
  'product_name',
  'customer_id',
  'customer_name',
  'opening_qty',
  'in_qty',
  'out_qty',
  'closing_balance',
  'non_moving_balance',
  'rate',
  'is_archived',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'raw_data',
].join(', ');

const FINISH_GOOD_TRANSACTION_SELECT_COLUMNS = [
  'firestore_document_id',
  'finish_good_id',
  'type',
  'category',
  'quantity',
  'remaining_balance',
  'rate',
  'transaction_date',
  'reference_id',
  'reference_no',
  'invoice_no',
  'place',
  'transporter_name',
  'vehicle_no',
  'vehicle_size',
  'freight',
  'holding',
  'point',
  'others',
  'receiving_status',
  'receiving_confirmed_at',
  'receiving_confirmed_by',
  'performed_by',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'is_archived',
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

function sanitizeForJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapFinishGoodRow(row: FinishGoodRow): FinishGood {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    productId: row.product_id ?? rawData.productId ?? row.firestore_document_id,
    productName: row.product_name ?? rawData.productName ?? '',
    customerId: row.customer_id ?? rawData.customerId ?? '',
    customerName: row.customer_name ?? rawData.customerName ?? '',
    openingQty: toNumber(row.opening_qty ?? rawData.openingQty),
    inQty: toNumber(row.in_qty ?? rawData.inQty),
    outQty: toNumber(row.out_qty ?? rawData.outQty),
    closingBalance: toNumber(row.closing_balance ?? rawData.closingBalance),
    nonMovingBalance: toNumber(row.non_moving_balance ?? rawData.nonMovingBalance),
    rate: toNumber(row.rate ?? rawData.rate),
    createdAt: row.created_at ?? rawData.createdAt ?? null,
    updatedAt: row.updated_at ?? rawData.updatedAt ?? null,
    createdBy: row.created_by ?? rawData.createdBy ?? null,
    updatedBy: row.updated_by ?? rawData.updatedBy ?? null,
    isArchived: row.is_archived ?? rawData.isArchived ?? false,
  };
}

function mapFinishGoodTransactionRow(row: FinishGoodTransactionRow): FinishGoodTransaction {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    finishGoodId: row.finish_good_id ?? rawData.finishGoodId ?? '',
    type: (row.type as FinishGoodTransaction['type'] | null) ?? 'IN',
    category: (row.category as FinishGoodTransaction['category'] | null) ?? 'REGULAR',
    quantity: toNumber(row.quantity ?? rawData.quantity),
    remainingBalance: row.remaining_balance == null && rawData.remainingBalance == null
      ? undefined
      : toNumber(row.remaining_balance ?? rawData.remainingBalance),
    rate: row.rate == null && rawData.rate == null ? undefined : toNumber(row.rate ?? rawData.rate),
    date: row.transaction_date ?? rawData.date ?? '',
    referenceId: row.reference_id ?? rawData.referenceId ?? null,
    referenceNo: row.reference_no ?? rawData.referenceNo ?? null,
    invoiceNo: row.invoice_no ?? rawData.invoiceNo ?? null,
    place: row.place ?? rawData.place ?? null,
    transporterName: row.transporter_name ?? rawData.transporterName ?? null,
    vehicleNo: row.vehicle_no ?? rawData.vehicleNo ?? null,
    vehicleSize: row.vehicle_size ?? rawData.vehicleSize ?? null,
    freight: row.freight == null && rawData.freight == null ? undefined : toNumber(row.freight ?? rawData.freight),
    holding: row.holding == null && rawData.holding == null ? undefined : toNumber(row.holding ?? rawData.holding),
    point: row.point ?? rawData.point ?? null,
    others: row.others ?? rawData.others ?? null,
    receivingStatus: (row.receiving_status as FinishGoodTransaction['receivingStatus'] | null) ?? rawData.receivingStatus ?? null,
    receivingConfirmedAt: row.receiving_confirmed_at ?? rawData.receivingConfirmedAt ?? null,
    receivingConfirmedBy: row.receiving_confirmed_by ?? rawData.receivingConfirmedBy ?? null,
    performedBy: row.performed_by ?? rawData.performedBy ?? null,
    createdAt: row.created_at ?? rawData.createdAt ?? null,
    updatedAt: row.updated_at ?? rawData.updatedAt ?? null,
    createdBy: row.created_by ?? rawData.createdBy ?? null,
    updatedBy: row.updated_by ?? rawData.updatedBy ?? null,
    isArchived: row.is_archived ?? rawData.isArchived ?? false,
  };
}

export const getFinishGoods = async (): Promise<FinishGood[]> => {
  const { data, error } = await supabase
    .from('finish_goods')
    .select(FINISH_GOOD_SELECT_COLUMNS)
    .eq('is_archived', false)
    .order('customer_name', { ascending: true, nullsFirst: false })
    .order('product_name', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Error fetching finish goods:', error);
    throw error;
  }

  return (data || []).map((row) => mapFinishGoodRow(row as unknown as FinishGoodRow));
};

export const getFinishGoodTransactions = async (): Promise<FinishGoodTransaction[]> => {
  const { data, error } = await supabase
    .from('finish_good_transactions')
    .select(FINISH_GOOD_TRANSACTION_SELECT_COLUMNS)
    .eq('is_archived', false);

  if (error) {
    console.error('Error fetching finish good transactions:', error);
    throw error;
  }

  return (data || []).map((row) => mapFinishGoodTransactionRow(row as unknown as FinishGoodTransactionRow));
};

export const executeFinishGoodInwardTransaction = async (
  payloads: FinishGoodInwardPayload[],
  user: string
) => {
  try {
    const rpcPayloads = sanitizeForJson(payloads.map((payload) => ({
      ...payload,
      transactionId: crypto.randomUUID(),
    })));

    const { data, error } = await supabase.rpc('execute_finish_good_inward_transaction', {
      p_payloads: rpcPayloads,
      p_user: user || 'System',
    });

    if (error) {
      console.error('Error executing Finish Goods Inward:', error);
      throw error;
    }

    if (data !== true) {
      throw new Error('Finish Goods inward RPC did not complete successfully.');
    }

    await logActivity({
      user,
      action: 'Finish Goods Bulk Inward',
      entity: 'finishGoods',
      referenceId: 'BULK',
    });

    return true;
  } catch (error) {
    console.error('Error executing Finish Goods Inward:', error);
    throw error;
  }
};

export const initializeOpeningBalances = async (
  payloads: FinishGoodInwardPayload[],
  user: string
) => {
  try {
    for (const payload of payloads) {
      // Get existing
      const { data: existing } = await supabase
        .from('finish_goods')
        .select('*')
        .eq('firestore_document_id', payload.productId)
        .maybeSingle();
      
      if (existing) {
        // Adjust opening qty and closing/non-moving balance
        const diff = payload.quantity - Number(existing.opening_qty || 0);
        
        let newClosing = Number(existing.closing_balance || 0);
        let newNonMoving = Number(existing.non_moving_balance || 0);

        if (payload.category === 'REJECTED') {
          newNonMoving += diff;
        } else {
          newClosing += diff;
        }
        
        await supabase.from('finish_goods').update({
          opening_qty: payload.quantity,
          closing_balance: newClosing,
          non_moving_balance: newNonMoving,
          updated_by: user,
          updated_at: new Date().toISOString()
        }).eq('firestore_document_id', payload.productId);
      } else {
        // Create new
        await supabase.from('finish_goods').insert({
          firestore_document_id: payload.productId,
          product_id: payload.productId,
          product_name: payload.productName,
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          opening_qty: payload.quantity,
          in_qty: 0,
          out_qty: 0,
          closing_balance: payload.category === 'REJECTED' ? 0 : payload.quantity,
          non_moving_balance: payload.category === 'REJECTED' ? payload.quantity : 0,
          rate: payload.rate,
          created_by: user,
          updated_by: user,
          raw_data: {},
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    await logActivity({
      user,
      action: `Set Opening Balances for ${payloads.length} items`,
      entity: 'finishGoods',
      referenceId: 'BULK_OPENING',
    });

    return true;
  } catch (error) {
    console.error('Error initializing opening balances:', error);
    throw error;
  }
};

export const executeFinishGoodOutwardTransaction = async (
  logistics: LogisticsPayload,
  payloads: FinishGoodOutwardPayload[],
  user: string
) => {
  try {
    const rpcPayloads = sanitizeForJson(payloads.map((payload) => ({
      ...payload,
      transactionId: crypto.randomUUID(),
    })));
    const rpcLogistics = sanitizeForJson(logistics);

    const { data, error } = await supabase.rpc('execute_finish_good_outward_transaction', {
      p_logistics: rpcLogistics,
      p_payloads: rpcPayloads,
      p_user: user || 'System',
    });

    if (error) {
      console.error('Error executing Finish Goods Outward:', error);
      throw error;
    }

    if (data !== true) {
      throw new Error('Finish Goods outward RPC did not complete successfully.');
    }

    for (const payload of payloads) {
      if (payload.category !== 'DISPATCH') continue;
      
      let qtyToDeduct = payload.quantity;
      if (qtyToDeduct <= 0) continue;

      let openPOs: any[] = [];

      if (payload.poId) {
        const { data: poRow } = await supabase.from('purchase_orders').select('*').eq('firestore_document_id', payload.poId).single();
        if (poRow) openPOs.push(poRow);
      } else {
        const { data: poRows } = await supabase
          .from('purchase_orders')
          .select('*')
          .eq('is_archived', false)
          .eq('product_id_raw', payload.productId)
          .in('status', ['OPEN', 'PARTIAL'])
          .order('po_date', { ascending: true });
        if (poRows) openPOs = poRows;
      }

      for (const po of openPOs) {
         if (qtyToDeduct <= 0) break;
         
         const orderQty = Number(po.order_qty) || 0;
         const inQty = Number(po.in_qty) || 0;
         const outQty = Number(po.out_qty) || 0;
         let currentBal = orderQty + inQty - outQty;
         if (currentBal < 0) currentBal = 0;
         
         if (currentBal === 0 && !payload.poId) continue; 
         
         let deduction = 0;
         if (payload.poId) {
            deduction = qtyToDeduct;
         } else {
            deduction = Math.min(qtyToDeduct, currentBal);
         }
         
         const newOutQty = outQty + deduction;
         const newBal = orderQty + inQty - newOutQty;
         const newStatus = (newBal <= 0 || po.status === 'CLOSED') ? 'CLOSED' : 'PARTIAL';
         
         await supabase.from('purchase_orders').update({
           out_qty: newOutQty,
           status: newStatus,
           updated_at: new Date().toISOString(),
           updated_by: user,
           raw_data: { ...(po.raw_data || {}), outQty: newOutQty, status: newStatus }
         }).eq('firestore_document_id', po.firestore_document_id);
         
         await supabase.from('po_transactions').insert({
            firestore_document_id: crypto.randomUUID(),
            po_id: po.firestore_document_id,
            type: 'OUT',
            quantity: deduction,
            transaction_date: logistics.date || new Date().toISOString(),
            remarks: `Auto-dispatch from Invoice ${logistics.invoiceNo || 'N/A'}`,
            reference_id: logistics.invoiceNo,
            performed_by: user,
            created_at: new Date().toISOString()
         });
         
         qtyToDeduct -= deduction;
      }
    }

    await logActivity({
      user,
      action: 'Finish Goods Bulk Outward',
      entity: 'finishGoods',
      referenceId: logistics.invoiceNo || 'BULK_OUT',
    });

    return true;
  } catch (error) {
    console.error('Error executing Finish Goods Outward:', error);
    throw error;
  }
};

export const deleteFinishGoodTransaction = async (
  transactionId: string,
  finishGoodId: string,
  type: 'IN' | 'OUT',
  category: string,
  quantity: number,
  user: string
) => {
  try {
    const { data, error } = await supabase.rpc('delete_finish_good_transaction', {
      p_transaction_id: transactionId,
      p_finish_good_id: finishGoodId || null,
      p_type: type,
      p_category: category,
      p_quantity: quantity,
      p_user: user || 'System',
    });

    if (error) {
      console.error('Error deleting Finish Good transaction:', error);
      throw error;
    }

    if (data !== true) {
      throw new Error('Finish Good transaction delete RPC did not complete successfully.');
    }

    await logActivity({
      user,
      action: 'Delete Finish Good Transaction',
      entity: 'finishGoodTransactions',
      referenceId: transactionId,
    });

    return true;
  } catch (error) {
    console.error('Error deleting Finish Good transaction:', error);
    throw error;
  }
};

// ── Reset ALL Finish Goods data (for fresh import) ───────────────────────────
// WARNING: This permanently deletes ALL finish_good_transactions and finish_goods.
// Use only before a fresh bulk import.
export const resetAllFinishGoods = async (user: string): Promise<{ deletedTransactions: number; deletedFGs: number }> => {
  // Step 1: Delete all transactions first (FK constraint)
  const { count: txCount, error: txError } = await supabase
    .from('finish_good_transactions')
    .delete({ count: 'exact' })
    .neq('firestore_document_id', '__NEVER_MATCH__'); // delete all

  if (txError) {
    console.error('Error resetting finish_good_transactions:', txError);
    throw txError;
  }

  // Step 2: Delete all finish_goods records
  const { count: fgCount, error: fgError } = await supabase
    .from('finish_goods')
    .delete({ count: 'exact' })
    .neq('firestore_document_id', '__NEVER_MATCH__'); // delete all

  if (fgError) {
    console.error('Error resetting finish_goods:', fgError);
    throw fgError;
  }

  await logActivity({
    user,
    action: `⚠️ RESET ALL Finish Goods — ${txCount ?? 0} transactions + ${fgCount ?? 0} FG records deleted before fresh import`,
    entity: 'finishGoods',
    referenceId: 'RESET_ALL',
  });

  return { deletedTransactions: txCount ?? 0, deletedFGs: fgCount ?? 0 };
};

export const markFreightReceived = async (invoiceNo: string, user: string) => {
  try {
    const { data, error } = await supabase.rpc('mark_finish_good_freight_received', {
      p_invoice_no: invoiceNo,
      p_user: user || 'System',
    });

    if (error) {
      console.error('Error marking freight as received:', error);
      throw error;
    }

    if ((data ?? 0) === 0) {
      return true;
    }

    await logActivity({
      user,
      action: 'Mark Freight Received',
      entity: 'finishGoodTransactions',
      referenceId: invoiceNo,
    });

    return true;
  } catch (error) {
    console.error('Error marking freight as received:', error);
    throw error;
  }
};

export const executeProductionCompletionTransaction = async (
  jobId: string,
  newJobCardPayload: Record<string, any>,
  _oldJobCard: any,
  fgPayload: FinishGoodInwardPayload,
  user: string
) => {
  try {
    const rpcFgPayload = sanitizeForJson({
      ...fgPayload,
      transactionId: crypto.randomUUID(),
    });
    const rpcJobPayload = sanitizeForJson(newJobCardPayload);

    const { data, error } = await supabase.rpc('execute_production_completion_transaction', {
      p_job_id: jobId,
      p_new_job_card_payload: rpcJobPayload,
      p_fg_payload: rpcFgPayload,
      p_user: user || 'System',
    });

    if (error) {
      console.error('Error executing atomic production completion:', error);
      throw error;
    }

    if (data !== true) {
      throw new Error('Production completion RPC did not complete successfully.');
    }

    await logActivity({
      user,
      action: 'Production Completed (Atomic)',
      entity: 'jobCards',
      referenceId: jobId,
    });

    return true;
  } catch (error) {
    console.error('Error executing atomic production completion:', error);
    throw error;
  }
};

export const createTradingFinishGood = async (
  customerName: string,
  productName: string,
  user: string
): Promise<FinishGood> => {
  const id = crypto.randomUUID();
  // Using pseudo IDs for trading goods as they might not exist in the regular product/customer tables.
  const customerId = `TRADING_CUST_${crypto.randomUUID()}`;
  const productId = `TRADING_PROD_${crypto.randomUUID()}`;
  
  const payload = {
    firestore_document_id: id,
    customer_id: customerId,
    customer_name: customerName,
    product_id: productId,
    product_name: productName,
    opening_qty: 0,
    in_qty: 0,
    out_qty: 0,
    closing_balance: 0,
    non_moving_balance: 0,
    rate: 0,
    is_archived: false,
    created_at: new Date().toISOString(),
    created_by: user,
    updated_at: new Date().toISOString(),
    updated_by: user,
    raw_data: {},
  };

  const { data, error } = await supabase
    .from('finish_goods')
    .insert(payload)
    .select(FINISH_GOOD_SELECT_COLUMNS)
    .single();

  if (error) {
    console.error('Error creating trading finish good:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Create Trading Finish Good',
    entity: 'finishGoods',
    referenceId: id,
  });

  return mapFinishGoodRow(data as any as FinishGoodRow);
};

export const updateFinishGoodTransactionDate = async (
  transactionId: string,
  newDate: string,
  user: string
) => {
  try {
    const { data, error } = await supabase.rpc('update_finish_good_transaction_date', {
      p_transaction_id: transactionId,
      p_new_date: newDate,
      p_user: user || 'System'
    });

    if (error) {
      console.error('Error updating transaction date:', error);
      throw error;
    }

    await logActivity({
      user,
      action: `Updated transaction date to ${newDate}`,
      entity: 'finishGoodTransactions',
      referenceId: transactionId,
    });

    return true;
  } catch (error) {
    console.error('Error updating transaction date:', error);
    throw error;
  }
};
import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface Reel {
  id?: string;
  reelNumber: string;
  supplierName: string;
  manufacturerName: string;
  weight: number;
  currentBalance: number;
  paperType: string;
  reelSize: number | string;
  bf: string;
  gsm: number | string;
  rate?: number;
  inwardDate: string;
  status?: string | null;
  reservedForJC?: string | null;
  activeReservedWeight?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isArchived: boolean;
}

export interface ReelTransaction {
  id?: string;
  reelId: string;
  reelNumber: string;
  type: 'INWARD' | 'OUTWARD' | 'ALLOCATION';
  quantity: number;
  remainingBalance: number;
  jobCardId?: string | null;
  performedBy: string;
  notes?: string;
  date: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isArchived: boolean;
}

export interface OutwardPayload {
  reelId: string;
  reelNumber: string;
  consumedWeight: number;
  jobCardId?: string;
  outwardDate?: string;
}

export interface AllocationPayload {
  reelId: string;
  reelNumber: string;
  allocatedWeight: number;
}

export interface BulkInwardReelInput {
  reelNo: string;
  paperType: string;
  size: number | '';
  bf: string;
  gsm: number | '';
  rate: number | '';
  weight: number | '';
}

type ReelRow = {
  firestore_document_id: string;
  reel_number: string | null;
  paper_type: string | null;
  reel_size: number | string | null;
  bf: string | null;
  gsm: number | string | null;
  weight: number | string | null;
  consumed_weight: number | string | null;
  current_balance: number | string | null;
  rate: number | string | null;
  supplier: string | null;
  supplier_name: string | null;
  manufacturer_name: string | null;
  status: string | null;
  inward_date: string | null;
  reserved_for_jc: string | null;
  active_reserved_weight: number | string | null;
  is_archived: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw_data: Record<string, any> | null;
};

type ReelTransactionRow = {
  firestore_document_id: string;
  reel_id: string | null;
  reel_number: string | null;
  type: string | null;
  quantity: number | string | null;
  remaining_balance: number | string | null;
  job_card_id: string | null;
  performed_by: string | null;
  notes: string | null;
  transaction_date: string | null;
  is_archived: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw_data: Record<string, any> | null;
};

const REEL_SELECT_COLUMNS = [
  'firestore_document_id',
  'reel_number',
  'paper_type',
  'reel_size',
  'bf',
  'gsm',
  'weight',
  'consumed_weight',
  'current_balance',
  'rate',
  'supplier',
  'supplier_name',
  'manufacturer_name',
  'status',
  'inward_date',
  'reserved_for_jc',
  'active_reserved_weight',
  'is_archived',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'raw_data',
].join(', ');

const REEL_TRANSACTION_SELECT_COLUMNS = [
  'firestore_document_id',
  'reel_id',
  'reel_number',
  'type',
  'quantity',
  'remaining_balance',
  'job_card_id',
  'performed_by',
  'notes',
  'transaction_date',
  'is_archived',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
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

function normalizeIsoDate(value?: string | null): string {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function mapReelRow(row: ReelRow): Reel {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    reelNumber: row.reel_number ?? rawData.reelNumber ?? '',
    supplierName: row.supplier_name ?? rawData.supplierName ?? '',
    manufacturerName: row.manufacturer_name ?? rawData.manufacturerName ?? '',
    weight: toNumber(row.weight ?? rawData.weight),
    currentBalance: toNumber(row.current_balance ?? rawData.currentBalance),
    paperType: row.paper_type ?? rawData.paperType ?? '',
    reelSize: row.reel_size ?? rawData.reelSize ?? '',
    bf: row.bf ?? rawData.bf ?? '',
    gsm: row.gsm ?? rawData.gsm ?? '',
    rate: toNumber(row.rate ?? rawData.rate),
    inwardDate: row.inward_date ?? rawData.inwardDate ?? '',
    status: row.status ?? rawData.status ?? null,
    reservedForJC: row.reserved_for_jc ?? rawData.reservedForJC ?? null,
    activeReservedWeight: toNumber(row.active_reserved_weight ?? rawData.activeReservedWeight),
    createdAt: row.created_at ?? rawData.createdAt ?? null,
    updatedAt: row.updated_at ?? rawData.updatedAt ?? null,
    createdBy: row.created_by ?? rawData.createdBy ?? null,
    updatedBy: row.updated_by ?? rawData.updatedBy ?? null,
    isArchived: row.is_archived ?? false,
  };
}

function mapReelTransactionRow(row: ReelTransactionRow): ReelTransaction {
  const rawData = row.raw_data ?? {};

  return {
    id: row.firestore_document_id,
    reelId: row.reel_id ?? rawData.reelId ?? '',
    reelNumber: row.reel_number ?? rawData.reelNumber ?? '',
    type: (row.type as ReelTransaction['type'] | null) ?? 'INWARD',
    quantity: toNumber(row.quantity ?? rawData.quantity),
    remainingBalance: toNumber(row.remaining_balance ?? rawData.remainingBalance),
    jobCardId: row.job_card_id ?? rawData.jobCardId ?? null,
    performedBy: row.performed_by ?? rawData.performedBy ?? 'System',
    notes: row.notes ?? rawData.notes ?? '',
    date: row.transaction_date ?? rawData.date ?? '',
    createdAt: row.created_at ?? rawData.createdAt ?? null,
    updatedAt: row.updated_at ?? rawData.updatedAt ?? null,
    createdBy: row.created_by ?? rawData.createdBy ?? null,
    updatedBy: row.updated_by ?? rawData.updatedBy ?? null,
    isArchived: row.is_archived ?? false,
  };
}

async function getRawReelRow(id: string): Promise<ReelRow> {
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_SELECT_COLUMNS)
    .eq('firestore_document_id', id)
    .maybeSingle();

  if (error) {
    console.error('Error loading reel:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Reel not found');
  }

  return data as unknown as ReelRow;
}

export const getReels = async (): Promise<Reel[]> => {
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_SELECT_COLUMNS)
    .eq('is_archived', false);

  if (error) {
    console.error('Error fetching reels:', error);
    throw error;
  }

  return (data || []).map((row) => mapReelRow(row as unknown as ReelRow));
};

// Maps whatever reel-shaped fields are present on the input object to the
// structured Postgres columns. Used by both createReel and updateReel below,
// which back the Settings "Data Backup & Export" / "Upload & Sync CSV"
// admin tool (generic raw field sync, no business-rule side effects -
// mirrors the previous generic Firestore createDocument/updateDocument
// behavior for the `reels` collection). Fields absent from `data` map to null.
const toReelColumns = (data: Record<string, any>) => ({
  reel_number: data.reelNumber ?? null,
  paper_type: data.paperType ?? null,
  reel_size: data.reelSize ?? null,
  bf: data.bf ?? null,
  gsm: data.gsm ?? null,
  weight: data.weight ?? null,
  current_balance: data.currentBalance ?? null,
  rate: data.rate ?? null,
  supplier_name: data.supplierName ?? null,
  manufacturer_name: data.manufacturerName ?? null,
  status: data.status ?? null,
  inward_date: data.inwardDate ?? null,
  reserved_for_jc: data.reservedForJC ?? null,
  active_reserved_weight: data.activeReservedWeight ?? null,
});

/**
 * Creates a new reel from raw (e.g. CSV-imported) field data. Mirrors the
 * previous generic `createDocument` behavior: audit fields are populated and
 * a 'Created' activity log entry is written. The primary key has no DB
 * default, so a UUID is generated client-side.
 */
export const createReel = async (data: Record<string, any>, user: string = 'System'): Promise<string> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const columns = toReelColumns(data);
  const row = {
    firestore_document_id: id,
    ...columns,
    is_archived: false,
    created_by: user,
    updated_by: user,
    created_at: now,
    updated_at: now,
  };

  const rawData = { ...data, ...columns, id, isArchived: false, createdBy: user, updatedBy: user, createdAt: now, updatedAt: now };

  const { error } = await supabase.from('reels').insert({ ...row, raw_data: rawData });

  if (error) {
    console.error('Error creating reel:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Created',
    entity: 'reels',
    referenceId: id,
  });

  return id;
};

/**
 * Updates a reel from raw (e.g. CSV-imported) field data. Mirrors the
 * previous generic `updateDocument` behavior: the structured columns are
 * refreshed from `data`, updatedBy/updatedAt are touched, and a 'Updated'
 * activity log entry is written.
 */
export const updateReel = async (id: string, data: Record<string, any>, user: string = 'System'): Promise<void> => {
  const now = new Date().toISOString();
  const columns = toReelColumns(data);
  const rawData = { ...data, ...columns, id, updatedBy: user, updatedAt: now };

  const { error } = await supabase
    .from('reels')
    .update({
      ...columns,
      updated_by: user,
      updated_at: now,
      raw_data: rawData,
    })
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error updating reel:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Updated',
    entity: 'reels',
    referenceId: id,
  });
};

export const getFrozenReels = async (): Promise<Reel[]> => {
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_SELECT_COLUMNS)
    .not('reserved_for_jc', 'is', null);

  if (error) {
    console.error('Error fetching frozen reels:', error);
    throw error;
  }

  return (data || []).map((row) => mapReelRow(row as unknown as ReelRow));
};

export const getReelTransactions = async (): Promise<ReelTransaction[]> => {
  const { data, error } = await supabase
    .from('reel_transactions')
    .select(REEL_TRANSACTION_SELECT_COLUMNS)
    .eq('is_archived', false);

  if (error) {
    console.error('Error fetching reel transactions:', error);
    throw error;
  }

  return (data || []).map((row) => mapReelTransactionRow(row as unknown as ReelTransactionRow));
};

export const getReelTransactionsByReelId = async (reelId: string): Promise<ReelTransaction[]> => {
  const { data, error } = await supabase
    .from('reel_transactions')
    .select(REEL_TRANSACTION_SELECT_COLUMNS)
    .eq('reel_id', reelId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching reel history:', error);
    throw error;
  }

  return (data || []).map((row) => mapReelTransactionRow(row as unknown as ReelTransactionRow));
};

export const getOutwardReelTransactionsByMonth = async (monthPrefix: string): Promise<ReelTransaction[]> => {
  const [yearPart, monthPart] = monthPrefix.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const nextMonthDate = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
  const startDate = `${monthPrefix}-01`;
  const nextMonthPrefix = nextMonthDate.toISOString().slice(0, 10);

  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('reel_transactions')
      .select(REEL_TRANSACTION_SELECT_COLUMNS)
      .eq('type', 'OUTWARD')
      .eq('is_archived', false)
      .gte('transaction_date', startDate)
      .lt('transaction_date', nextMonthPrefix)
      .range(from, from + step - 1);

    if (error) {
      console.error('Error fetching outward reel transactions:', error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
    }

    if (!data || data.length < step) {
      break;
    }
    from += step;
  }

  return allData.map((row) => mapReelTransactionRow(row as unknown as ReelTransactionRow));
};

export const getReelsByIds = async (reelIds: string[]): Promise<Record<string, Reel>> => {
  let query = supabase.from('reels').select(REEL_SELECT_COLUMNS);

  if (reelIds.length > 0) {
    query = query.in('firestore_document_id', reelIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching reels by ID:', error);
    throw error;
  }

  return (data || []).reduce<Record<string, Reel>>((accumulator, row) => {
    const reel = mapReelRow(row as unknown as ReelRow);
    if (reel.id) {
      accumulator[reel.id] = reel;
    }
    return accumulator;
  }, {});
};

export const createBulkInwardReels = async (
  rows: BulkInwardReelInput[],
  inwardDate: string,
  supplierName: string,
  manufacturerName: string,
  user: string = 'System'
): Promise<{ successCount: number }> => {
  const normalizedDate = normalizeIsoDate(inwardDate);
  const normalizedRows = rows
    .filter((row) => toNumber(row.weight) > 0)
    .map((row) => ({
      reelId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      reelNumber: row.reelNo.toUpperCase(),
      paperType: row.paperType,
      reelSize: Number(row.size),
      bf: row.bf,
      gsm: Number(row.gsm),
      rate: Number(row.rate) || 0,
      weight: Math.round(Number(row.weight)),
    }));

  if (normalizedRows.length === 0) {
    return { successCount: 0 };
  }

  const { data, error } = await supabase.rpc('execute_bulk_reel_inward', {
    p_rows: normalizedRows,
    p_inward_date: normalizedDate,
    p_supplier_name: supplierName || '',
    p_manufacturer_name: manufacturerName || '',
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error executing bulk reel inward:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Bulk reel inward RPC did not complete successfully.');
  }

  return { successCount: normalizedRows.length };
};

export const executeOutwardTransaction = async (
  payloads: OutwardPayload[],
  user: string = 'System'
): Promise<boolean> => {
  const normalizedPayloads = payloads.map((payload) => ({
    transactionId: crypto.randomUUID(),
    reelId: payload.reelId,
    reelNumber: payload.reelNumber,
    consumedWeight: Number(payload.consumedWeight),
    jobCardId: payload.jobCardId ?? null,
    outwardDate: normalizeIsoDate(payload.outwardDate),
  }));

  const { data, error } = await supabase.rpc('execute_reel_outward_transaction', {
    p_payloads: normalizedPayloads,
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error executing outward transaction:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Reel outward RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Batch Outward Issue',
    entity: 'reels',
    count: payloads.length,
  });

  return true;
};

export const executeReelAllocation = async (
  jobCardId: string,
  allocations: AllocationPayload[],
  user: string = 'System'
): Promise<boolean> => {
  const normalizedAllocations = allocations.map((allocation) => ({
    transactionId: crypto.randomUUID(),
    reelId: allocation.reelId,
    reelNumber: allocation.reelNumber,
    allocatedWeight: Number(allocation.allocatedWeight),
  }));

  const { data, error } = await supabase.rpc('execute_reel_allocation', {
    p_job_card_id: jobCardId,
    p_allocations: normalizedAllocations,
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error executing reel allocation:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Reel allocation RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Reel Allocation',
    entity: 'jobCards',
    referenceId: jobCardId,
  });

  return true;
};

export const deleteReelTransaction = async (
  transactionId: string,
  reelId: string,
  type: 'INWARD' | 'OUTWARD' | 'ALLOCATION',
  quantity: number,
  user: string = 'System'
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('delete_reel_transaction', {
    p_transaction_id: transactionId,
    p_reel_id: reelId,
    p_type: type,
    p_quantity: Number(quantity),
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error deleting reel transaction:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Delete reel transaction RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Delete Reel Transaction',
    entity: 'reelTransactions',
    referenceId: transactionId,
  });

  return true;
};

export const unfreezeReel = async (reelId: string, user: string = 'System'): Promise<boolean> => {
  const existing = await getRawReelRow(reelId);
  const now = new Date().toISOString();
  const rawData = {
    ...(existing.raw_data ?? {}),
    reservedForJC: null,
    updatedAt: now,
  };

  const { error } = await supabase
    .from('reels')
    .update({
      reserved_for_jc: null,
      updated_at: now,
      raw_data: rawData,
    })
    .eq('firestore_document_id', reelId);

  if (error) {
    console.error('Error unfreezing reel:', error);
    throw error;
  }

  return true;
};
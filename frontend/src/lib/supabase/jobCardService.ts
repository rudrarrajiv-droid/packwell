import { supabase } from './config';
import { logActivity } from './activityLogService';

type JobCardRow = {
  firestore_document_id: string;
  job_card_no: string | null;
  target_date_raw: string | null;
  target_date: string | null;
  po_id_raw: string | null;
  po_no: string | null;
  resolved_po_id: string | null;
  customer_id_raw: string | null;
  customer_name: string | null;
  resolved_customer_id: string | null;
  product_id_raw: string | null;
  product_name: string | null;
  resolved_product_id: string | null;
  order_qty: number | string | null;
  one_box_weight: number | string | null;
  total_weight: number | string | null;
  paper_quantity: number | string | null;
  ply_quantity: number | string | null;
  priority: string | null;
  remarks: unknown;
  product_snapshot: Record<string, any> | null;
  reel_allocation_skipped: boolean | null;
  approval_status: string | null;
  approval_reason: string | null;
  approval_requested_by: string | null;
  approval_requested_at: string | null;
  approval_expires_at: string | null;
  status: string | null;
  is_archived: boolean | null;
  issued_by: string | null;
  issued_at: string | null;
  expected_delivery_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_status: string | null;
  fg_qty: number | string | null;
  produced_qty: number | string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw_data: Record<string, any> | null;
};

export interface JobCardRecord {
  id: string;
  jobCardNo: string;
  targetDate?: string | null;
  poId?: string | null;
  poNo?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  productId?: string | null;
  productName?: string | null;
  orderQty?: number;
  quantity?: number;
  oneBoxWeight?: number;
  totalWeight?: number;
  paperQuantity?: number;
  plyQuantity?: number;
  priority?: string | null;
  remarks?: unknown;
  productSnapshot?: Record<string, any>;
  allocations?: unknown[];
  reelAllocationSkipped?: boolean;
  approvalStatus?: string | null;
  approvalReason?: string | null;
  approvalRequestedBy?: string | null;
  approvalRequestedAt?: string | null;
  approvalExpiresAt?: string | null;
  approvalReviewedAt?: string | null;
  status?: string | null;
  isArchived?: boolean;
  issuedBy?: string | null;
  issuedAt?: string | null;
  expectedDeliveryAt?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completionStatus?: string | null;
  fgQty?: number;
  producedQty?: number;
  producedQuantity?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: any;
}

interface GetJobCardsOptions {
  includeArchived?: boolean;
  statuses?: string[];
  poId?: string;
}

interface UpdateJobCardOptions {
  log?: boolean;
  touchUpdatedBy?: boolean;
  logAction?: string;
}

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

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDateOnlyOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function toIsoTimestampOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sanitizeUpdates(updates: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
}

function mapJobCardRow(row: JobCardRow): JobCardRecord {
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
    allocations: (rawData.allocations as unknown[]) ?? [],
    reelAllocationSkipped: row.reel_allocation_skipped ?? rawData.reelAllocationSkipped ?? false,
    approvalStatus: row.approval_status ?? rawData.approvalStatus ?? null,
    approvalReason: row.approval_reason ?? rawData.approvalReason ?? null,
    approvalRequestedBy: row.approval_requested_by ?? rawData.approvalRequestedBy ?? null,
    approvalRequestedAt: row.approval_requested_at ?? rawData.approvalRequestedAt ?? null,
    approvalExpiresAt: row.approval_expires_at ?? rawData.approvalExpiresAt ?? null,
    approvalReviewedAt: rawData.approvalReviewedAt ?? null,
    status: row.status ?? rawData.status ?? null,
    isArchived: row.is_archived ?? rawData.isArchived ?? false,
    issuedBy: row.issued_by ?? rawData.issuedBy ?? null,
    issuedAt: row.issued_at ?? rawData.issuedAt ?? null,
    expectedDeliveryAt: row.expected_delivery_at ?? rawData.expectedDeliveryAt ?? null,
    completedAt: row.completed_at ?? rawData.completedAt ?? null,
    completedBy: row.completed_by ?? rawData.completedBy ?? null,
    completionStatus: row.completion_status ?? rawData.completionStatus ?? null,
    fgQty: toNumber(row.fg_qty ?? rawData.fgQty),
    producedQty,
    producedQuantity: producedQty,
    deletedAt: row.deleted_at ?? rawData.deletedAt ?? null,
    deletedBy: row.deleted_by ?? rawData.deletedBy ?? null,
    createdBy: row.created_by ?? rawData.createdBy ?? null,
    updatedBy: row.updated_by ?? rawData.updatedBy ?? null,
    createdAt: row.created_at ?? rawData.createdAt ?? null,
    updatedAt: row.updated_at ?? rawData.updatedAt ?? null,
  };
}

async function getRawJobCardRow(id: string): Promise<JobCardRow> {
  const { data, error } = await supabase
    .from('job_cards')
    .select(JOB_CARD_SELECT_COLUMNS)
    .eq('firestore_document_id', id)
    .maybeSingle();

  if (error) {
    console.error('Error loading job card:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Job Card not found');
  }

  return data as unknown as JobCardRow;
}

function buildJobCardUpdatePayload(
  existing: JobCardRow,
  updates: Record<string, any>,
  user: string,
  options?: UpdateJobCardOptions
) {
  const sanitized = sanitizeUpdates(updates);
  const now = new Date().toISOString();
  const touchUpdatedBy = options?.touchUpdatedBy !== false;
  const rawData = {
    ...(existing.raw_data ?? {}),
    ...sanitized,
    updatedAt: now,
    ...(touchUpdatedBy ? { updatedBy: user } : {}),
  };

  const updatePayload: Record<string, any> = {
    updated_at: now,
    raw_data: rawData,
  };

  if (touchUpdatedBy) {
    updatePayload.updated_by = user;
  }

  if (Object.prototype.hasOwnProperty.call(sanitized, 'jobCardNo')) {
    updatePayload.job_card_no = sanitized.jobCardNo ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'targetDate')) {
    updatePayload.target_date_raw = sanitized.targetDate ?? null;
    updatePayload.target_date = toDateOnlyOrNull(sanitized.targetDate);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'poId')) {
    updatePayload.po_id_raw = sanitized.poId ?? null;
    updatePayload.resolved_po_id = null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'poNo')) {
    updatePayload.po_no = sanitized.poNo ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'customerId')) {
    updatePayload.customer_id_raw = sanitized.customerId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'customerName')) {
    updatePayload.customer_name = sanitized.customerName ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'productId')) {
    updatePayload.product_id_raw = sanitized.productId ?? null;
    updatePayload.resolved_product_id = sanitized.productId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'productName')) {
    updatePayload.product_name = sanitized.productName ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'orderQty')) {
    updatePayload.order_qty = toNullableNumber(sanitized.orderQty);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'oneBoxWeight')) {
    updatePayload.one_box_weight = toNullableNumber(sanitized.oneBoxWeight);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'totalWeight')) {
    updatePayload.total_weight = toNullableNumber(sanitized.totalWeight);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'paperQuantity')) {
    updatePayload.paper_quantity = toNullableNumber(sanitized.paperQuantity);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'plyQuantity')) {
    updatePayload.ply_quantity = toNullableNumber(sanitized.plyQuantity);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'priority')) {
    updatePayload.priority = sanitized.priority ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'remarks')) {
    updatePayload.remarks = sanitized.remarks ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'productSnapshot')) {
    updatePayload.product_snapshot = sanitized.productSnapshot ?? {};
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'reelAllocationSkipped')) {
    updatePayload.reel_allocation_skipped = sanitized.reelAllocationSkipped ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'approvalStatus')) {
    updatePayload.approval_status = sanitized.approvalStatus ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'approvalReason')) {
    updatePayload.approval_reason = sanitized.approvalReason ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'approvalRequestedBy')) {
    updatePayload.approval_requested_by = sanitized.approvalRequestedBy ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'approvalRequestedAt')) {
    updatePayload.approval_requested_at = toIsoTimestampOrNull(sanitized.approvalRequestedAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'approvalExpiresAt')) {
    updatePayload.approval_expires_at = toIsoTimestampOrNull(sanitized.approvalExpiresAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'status')) {
    updatePayload.status = sanitized.status ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'isArchived')) {
    updatePayload.is_archived = sanitized.isArchived ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'issuedBy')) {
    updatePayload.issued_by = sanitized.issuedBy ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'issuedAt')) {
    updatePayload.issued_at = toIsoTimestampOrNull(sanitized.issuedAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'expectedDeliveryAt')) {
    updatePayload.expected_delivery_at = toIsoTimestampOrNull(sanitized.expectedDeliveryAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'completedAt')) {
    updatePayload.completed_at = toIsoTimestampOrNull(sanitized.completedAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'completedBy')) {
    updatePayload.completed_by = sanitized.completedBy ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'completionStatus')) {
    updatePayload.completion_status = sanitized.completionStatus ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'fgQty')) {
    updatePayload.fg_qty = toNullableNumber(sanitized.fgQty);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'producedQty')) {
    updatePayload.produced_qty = toNullableNumber(sanitized.producedQty);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'deletedAt')) {
    updatePayload.deleted_at = toIsoTimestampOrNull(sanitized.deletedAt);
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'deletedBy')) {
    updatePayload.deleted_by = sanitized.deletedBy ?? null;
  }

  return { updatePayload, rawData };
}

export const getJobCards = async (options: GetJobCardsOptions = {}): Promise<JobCardRecord[]> => {
  let query = supabase.from('job_cards').select(JOB_CARD_SELECT_COLUMNS);

  if (!options.includeArchived) {
    query = query.eq('is_archived', false);
  }

  if (options.poId) {
    query = query.eq('po_id_raw', options.poId);
  }

  if (options.statuses && options.statuses.length === 1) {
    query = query.eq('status', options.statuses[0]);
  } else if (options.statuses && options.statuses.length > 1) {
    query = query.in('status', options.statuses);
  }

  const { data, error } = await query.order('created_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Error fetching job cards:', error);
    throw error;
  }

  return (data || []).map((row) => mapJobCardRow(row as unknown as JobCardRow));
};

export const getAllJobCards = async (): Promise<JobCardRecord[]> => {
  return getJobCards({ includeArchived: true });
};

export const getPendingApprovalJobCards = async (): Promise<JobCardRecord[]> => {
  return getJobCards({ includeArchived: true, statuses: ['PENDING APPROVAL'] });
};

export const formatJobCardDateSuffix = (date: Date = new Date()): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
};

export const parseJobCardSerial = (jcNo: string | null | undefined): number => {
  if (!jcNo) return 0;
  const str = String(jcNo).trim();
  // New format (started 1 Nov 2026): [Serial][DDMMYY] (min 7 numeric digits)
  if (/^\d{7,}$/.test(str)) {
    const serial = parseInt(str.slice(0, -6), 10);
    // Offset by 1,000,000 so all new-format job cards sort above legacy (PI/JC/1569) in descending order
    return Number.isFinite(serial) ? 1000000 + serial : 0;
  }
  // Legacy format: PI/JC/1569
  if (str.includes('/')) {
    const parts = str.split('/');
    const last = parts[parts.length - 1];
    const parsed = parseInt(last, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = parseInt(str, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getNextJobCardNumber = async (): Promise<string> => {
  const dateSuffix = formatJobCardDateSuffix();

  // Query job cards created on/after 1 Nov 2026 or non-legacy job card numbers
  const { data, error } = await supabase
    .from('job_cards')
    .select('job_card_no, created_at')
    .or('created_at.gte.2026-11-01T00:00:00+00:00,job_card_no.not.like.PI/JC/%')
    .order('created_at', { ascending: false, nullsFirst: false });

  let maxSerial = 0;

  if (!error && data && data.length > 0) {
    for (const row of data) {
      const jcNo = (row.job_card_no || '').trim();
      if (/^\d{7,}$/.test(jcNo)) {
        const serial = parseInt(jcNo.slice(0, -6), 10);
        if (Number.isFinite(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    }
  } else if (error) {
    console.error('Error fetching job cards for next sequence:', error);
    // Fallback: fetch recent rows
    const { data: fallbackData } = await supabase
      .from('job_cards')
      .select('job_card_no')
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(100);

    if (fallbackData) {
      for (const row of fallbackData) {
        const jcNo = (row.job_card_no || '').trim();
        if (/^\d{7,}$/.test(jcNo)) {
          const serial = parseInt(jcNo.slice(0, -6), 10);
          if (Number.isFinite(serial) && serial > maxSerial) {
            maxSerial = serial;
          }
        }
      }
    }
  }

  const nextSerial = maxSerial + 1;
  return `${nextSerial}${dateSuffix}`;
};

export const updateJobCard = async (
  id: string,
  updates: Record<string, any>,
  user: string = 'System',
  options?: UpdateJobCardOptions
): Promise<boolean> => {
  // If status or allocations are changing, use transactional RPC to maintain reel reservations correctly
  if (updates.status !== undefined || updates.productSnapshot !== undefined) {
    await executeJobCardTransaction(id, updates, null, user);
    return true;
  }

  const existing = await getRawJobCardRow(id);
  const { updatePayload } = buildJobCardUpdatePayload(existing, updates, user, options);

  const { error } = await supabase
    .from('job_cards')
    .update(updatePayload)
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error updating job card:', error);
    throw error;
  }

  if (options?.log !== false) {
    await logActivity({
      user,
      action: options?.logAction ?? 'Updated',
      entity: 'jobCards',
      referenceId: id,
    });
  }

  return true;
};

export const executeJobCardTransaction = async (
  jobId: string | null,
  newPayload: Record<string, any>,
  _oldJobCard: JobCardRecord | null,
  user: string = 'System'
): Promise<string> => {
  const targetJobId = jobId ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc('execute_job_card_transaction', {
    p_job_id: targetJobId,
    p_new_payload: sanitizeUpdates(newPayload),
    p_user: user || 'System',
    p_is_create: jobId === null,
  });

  if (error) {
    console.error('Error executing job card transaction:', error);
    throw error;
  }

  const resultingJobId = typeof data === 'string' && data.trim() !== '' ? data : targetJobId;

  await logActivity({
    user,
    action: jobId ? 'Updated Job Card with Reservation' : 'Created Job Card with Reservation',
    entity: 'jobCards',
    referenceId: resultingJobId,
  });

  return resultingJobId;
};

export const deleteJobCardSoft = async (id: string, user: string = 'System'): Promise<boolean> => {
  const existing = await getRawJobCardRow(id);
  const jobCardNo = existing.job_card_no ?? existing.raw_data?.jobCardNo ?? '';

  const { data, error } = await supabase.rpc('delete_job_card_soft', {
    p_job_id: id,
    p_user: user || 'System',
  });

  if (error) {
    console.error('Error soft-deleting job card:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Job card soft-delete RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Deleted (Soft)',
    entity: 'jobCards',
    referenceId: id,
    details: `Deleted job card ${jobCardNo} — number permanently retired`,
  });

  return true;
};
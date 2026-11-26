import { supabase } from './config';
import { logActivity } from './activityLogService';

// Supabase-backed replacement for the Firestore `customers` collection.
// Table: public.customers (RLS enabled, SELECT + INSERT + UPDATE only).
//
// Field mapping (Postgres column -> frontend shape):
//   firestore_document_id -> id
//   name                  -> name
//   is_archived           -> isArchived
//   created_by            -> createdBy
//   updated_by            -> updatedBy
//   created_at            -> createdAt
//   updated_at            -> updatedAt

export const MASTER_DATA_CUTOFF_DATE = '2026-11-26T00:00:00';

export const isLegacyMasterRecord = (row: { catalogVersion?: string; isLegacy?: boolean; createdAt?: string | null }): boolean => {
  if (row.catalogVersion === '2026_NEW') return false;
  if (row.isLegacy === true) return true;
  if (!row.createdAt) return true;
  try {
    const createdTime = new Date(row.createdAt).getTime();
    const cutoffTime = new Date('2026-11-26T00:00:00').getTime();
    return createdTime < cutoffTime;
  } catch {
    return true;
  }
};

export interface SupabaseCustomer {
  id: string;
  name: string;
  isArchived: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isLegacy?: boolean;
  catalogVersion?: string;
}

const SELECT_COLUMNS = 'firestore_document_id, name, is_archived, created_by, updated_by, created_at, updated_at, raw_data';

const mapRow = (row: any): SupabaseCustomer => {
  const isLegacy = isLegacyMasterRecord({
    catalogVersion: row.raw_data?.catalogVersion,
    isLegacy: row.raw_data?.isLegacy,
    createdAt: row.created_at,
  });
  return {
    id: row.firestore_document_id,
    name: row.name,
    isArchived: row.is_archived,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isLegacy,
    catalogVersion: row.raw_data?.catalogVersion ?? (isLegacy ? 'LEGACY' : '2026_NEW'),
  };
};

/**
 * Fetches all non-archived customers, preserving the current app behavior
 * of `queryDocuments('customers', [])` (which always filters isArchived == false).
 */
export const getCustomers = async (): Promise<SupabaseCustomer[]> => {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select(SELECT_COLUMNS)
      .eq('is_archived', false)
      .range(from, from + step - 1);

    if (error) {
      console.error('Error fetching customers:', error);
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

  return allData.map(mapRow);
};

/**
 * Fetches active customers (created on/after 2026-11-26 or tagged 2026_NEW).
 */
export const getActiveCustomers = async (): Promise<SupabaseCustomer[]> => {
  const all = await getCustomers();
  return all.filter(c => !c.isLegacy);
};

/**
 * Fetches legacy customers (created before 2026-11-26, preserved for historical viewing).
 */
export const getLegacyCustomers = async (): Promise<SupabaseCustomer[]> => {
  const all = await getCustomers();
  return all.filter(c => c.isLegacy);
};

/**
 * Creates a new customer. Mirrors the previous generic `createDocument`
 * behavior: audit fields (createdBy/updatedBy/createdAt/updatedAt/isArchived)
 * are populated, and the same 'Created' activity log entry is written.
 * The primary key (firestore_document_id) has no DB default, so a UUID is
 * generated client-side. `raw_data` is NOT NULL with no default, so it is
 * populated with the same record being written.
 */
export const createCustomer = async (name: string, user: string = 'System'): Promise<string> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    firestore_document_id: id,
    name,
    is_archived: false,
    created_by: user,
    updated_by: user,
    created_at: now,
    updated_at: now,
  };

  const rawData = {
    ...record,
    catalogVersion: '2026_NEW',
    isLegacy: false,
  };

  const { error } = await supabase.from('customers').insert({
    ...record,
    raw_data: rawData,
  });

  if (error) {
    console.error('Error creating customer:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Created',
    entity: 'customers',
    referenceId: id,
  });

  return id;
};

/**
 * Updates a customer's name. Mirrors the previous generic `updateDocument`
 * behavior: only updatedBy/updatedAt are touched alongside the changed
 * field(s), and the same 'Updated' activity log entry is written.
 */
export const updateCustomer = async (id: string, name: string, user: string = 'System'): Promise<void> => {
  const { error } = await supabase
    .from('customers')
    .update({
      name,
      updated_by: user,
      updated_at: new Date().toISOString(),
    })
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error updating customer:', error);
    throw error;
  }

  // Update denormalized customer names in related tables
  const { data: prods } = await supabase.from('products').select('*').eq('customer_id', id);
  if (prods) {
    for (const p of prods) {
      const raw = p.raw_data || {};
      raw.customerName = name;
      await supabase.from('products').update({ customer_name: name, raw_data: raw }).eq('firestore_document_id', p.firestore_document_id);
    }
  }

  const { data: pos } = await supabase.from('purchase_orders').select('*').or(`customer_id_raw.eq.${id},resolved_customer_id.eq.${id}`);
  if (pos) {
    for (const po of pos) {
      const raw = po.raw_data || {};
      raw.customerName = name;
      await supabase.from('purchase_orders').update({ customer_name: name, raw_data: raw }).eq('firestore_document_id', po.firestore_document_id);
    }
  }

  const { data: jcs } = await supabase.from('job_cards').select('*').or(`customer_id_raw.eq.${id},resolved_customer_id.eq.${id}`);
  if (jcs) {
    for (const jc of jcs) {
      const raw = jc.raw_data || {};
      raw.customerName = name;
      await supabase.from('job_cards').update({ customer_name: name, raw_data: raw }).eq('firestore_document_id', jc.firestore_document_id);
    }
  }

  await logActivity({
    user,
    action: 'Updated',
    entity: 'customers',
    referenceId: id,
  });
};

/**
 * Soft-deletes a customer by setting is_archived to true.
 */
export const deleteCustomer = async (id: string, user: string = 'System'): Promise<void> => {
  const { error } = await supabase
    .from('customers')
    .update({
      is_archived: true,
      updated_by: user,
      updated_at: new Date().toISOString(),
    })
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error deleting customer:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Deleted',
    entity: 'customers',
    referenceId: id,
  });
};

export interface CustomerUsage {
  products: number;
  purchaseOrders: number;
  jobCards: number;
  finishGoods: number;
  transactions: number;
  total: number;
}

export const checkCustomerUsage = async (customerId: string): Promise<CustomerUsage> => {
  const [{ count: pCount }, { count: poCount }, { count: jcCount }, { count: fgCount }, { count: fgtCount }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('customer_id', customerId),
    supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).or(`customer_id_raw.eq.${customerId},resolved_customer_id.eq.${customerId}`),
    supabase.from('job_cards').select('*', { count: 'exact', head: true }).or(`customer_id_raw.eq.${customerId},resolved_customer_id.eq.${customerId}`),
    supabase.from('finish_goods').select('*', { count: 'exact', head: true }).eq('customer_id', customerId),
    supabase.from('finish_good_transactions').select('*', { count: 'exact', head: true }).eq('customer_id', customerId),
  ]);

  return {
    products: pCount || 0,
    purchaseOrders: poCount || 0,
    jobCards: jcCount || 0,
    finishGoods: fgCount || 0,
    transactions: fgtCount || 0,
    total: (pCount || 0) + (poCount || 0) + (jcCount || 0) + (fgCount || 0) + (fgtCount || 0)
  };
};

export const migrateCustomer = async (oldCustomerId: string, newCustomer: SupabaseCustomer, user: string = 'System') => {
  const newId = newCustomer.id;
  const newName = newCustomer.name;

  const { data: prods } = await supabase.from('products').select('*').eq('customer_id', oldCustomerId);
  if (prods) {
    for (const p of prods) {
      const raw = p.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('products').update({ customer_id: newId, customer_name: newName, raw_data: raw }).eq('firestore_document_id', p.firestore_document_id);
    }
  }

  const { data: pos } = await supabase.from('purchase_orders').select('*').or(`customer_id_raw.eq.${oldCustomerId},resolved_customer_id.eq.${oldCustomerId}`);
  if (pos) {
    for (const po of pos) {
      const raw = po.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('purchase_orders').update({ customer_id_raw: newId, resolved_customer_id: newId, raw_data: raw }).eq('firestore_document_id', po.firestore_document_id);
    }
  }

  const { data: jcs } = await supabase.from('job_cards').select('*').or(`customer_id_raw.eq.${oldCustomerId},resolved_customer_id.eq.${oldCustomerId}`);
  if (jcs) {
    for (const jc of jcs) {
      const raw = jc.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('job_cards').update({ customer_id_raw: newId, resolved_customer_id: newId, raw_data: raw }).eq('firestore_document_id', jc.firestore_document_id);
    }
  }

  const { data: fgs } = await supabase.from('finish_goods').select('*').eq('customer_id', oldCustomerId);
  if (fgs) {
    for (const fg of fgs) {
      const raw = fg.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('finish_goods').update({ customer_id: newId, raw_data: raw }).eq('firestore_document_id', fg.firestore_document_id);
    }
  }

  const { data: fgts } = await supabase.from('finish_good_transactions').select('*').eq('customer_id', oldCustomerId);
  if (fgts) {
    for (const fgt of fgts) {
      const raw = fgt.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('finish_good_transactions').update({ customer_id: newId, raw_data: raw }).eq('firestore_document_id', fgt.firestore_document_id);
    }
  }

  await logActivity({
    user,
    action: 'Migrated',
    entity: 'customers',
    referenceId: oldCustomerId,
  });
};

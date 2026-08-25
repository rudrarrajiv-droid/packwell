import { supabase } from './config';
import { logActivity } from './activityLogService';

// Supabase-backed replacement for the Firestore `products` collection.
// Table: public.products (RLS enabled, SELECT + INSERT + UPDATE only).
//
// Field mapping (Postgres column -> frontend shape):
//   firestore_document_id -> id
//   customer_id           -> customerId   (legacy denormalized value - NOT a
//                                           reliable FK to customers, preserved as-is)
//   customer_name         -> customerName
//   item_name             -> itemName
//   artwork_no            -> artworkNo
//   length/width/height   -> length/width/height
//   color                 -> color
//   reel_size             -> reelSize
//   cut_size              -> cutSize
//   ply                   -> ply
//   flute                 -> flute
//   pin_pasting           -> pinPasting
//   pin_type              -> pinType
//   pin_qty               -> pinQty
//   creasing              -> creasing
//   ups                   -> ups
//   packing               -> packing
//   special_requirement   -> specialRequirement
//   layers                -> layers
//   is_archived           -> isArchived
//   created_by/updated_by -> createdBy/updatedBy
//   created_at/updated_at -> createdAt/updatedAt
//
// NOTE: `dieNumber` and `boxType` (present on the frontend Product type/form)
// have no dedicated columns in public.products - they are preserved inside
// `raw_data` only (same place the legacy Firestore documents kept them) and
// are read back from there in `mapRow` below, so nothing is lost.

export interface SupabaseProductLayer {
  layerName: string;
  paperType?: string;
  bf?: string;
  gsm?: number;
}

export interface SupabaseProduct {
  id: string;
  customerId: string;
  customerName: string;
  artworkNo: string;
  itemName: string;
  length: number;
  width: number;
  height: number;
  ply: number;
  flute?: string;
  reelSize: number;
  cutSize: number;
  pinQty?: number;
  pinPasting?: string;
  ups?: number;
  creasing?: string;
  dieNumber?: string;
  color?: string;
  packing?: string;
  pinType?: string;
  boxType?: string;
  specialRequirement?: string;
  actualCosting?: number;
  layers: SupabaseProductLayer[];
  isArchived: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const SELECT_COLUMNS = [
  'firestore_document_id',
  'customer_id',
  'customer_name',
  'item_name',
  'artwork_no',
  'length',
  'width',
  'height',
  'color',
  'reel_size',
  'cut_size',
  'ply',
  'flute',
  'pin_pasting',
  'pin_type',
  'pin_qty',
  'creasing',
  'ups',
  'packing',
  'special_requirement',
  'actual_costing',
  'layers',
  'is_archived',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'raw_data',
].join(', ');

const mapRow = (row: any): SupabaseProduct => ({
  id: row.firestore_document_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  artworkNo: row.artwork_no,
  itemName: row.item_name,
  length: row.length,
  width: row.width,
  height: row.height,
  ply: row.ply,
  flute: row.flute ?? undefined,
  reelSize: row.reel_size,
  cutSize: row.cut_size,
  pinQty: row.pin_qty ?? undefined,
  pinPasting: row.pin_pasting ?? undefined,
  ups: row.ups ?? undefined,
  creasing: row.creasing ?? undefined,
  dieNumber: row.raw_data?.dieNumber ?? undefined,
  color: row.color ?? undefined,
  packing: row.packing ?? undefined,
  pinType: row.pin_type ?? undefined,
  boxType: row.raw_data?.boxType ?? undefined,
  specialRequirement: row.special_requirement ?? undefined,
  actualCosting: row.actual_costing != null ? Number(row.actual_costing) : undefined,
  layers: row.layers ?? [],
  isArchived: row.is_archived,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Fetches all non-archived products, preserving the current app behavior
 * of `queryDocuments('products', [])` (which always filters isArchived == false).
 */
export const getProducts = async (): Promise<SupabaseProduct[]> => {
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false);

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  return (data || []).map(mapRow);
};

// Maps whatever product-shaped fields are present on the input object to the
// structured Postgres columns. Used by both create and update so partial
// inputs (e.g. the "quick add" flow in CompleteProductionModal, which only
// supplies itemName/customerName/customerId) and full inputs (the MasterData
// ProductModal form, which always supplies every field) are both handled
// the same way. Fields absent from `data` map to null.
const toColumns = (data: Record<string, any>) => ({
  customer_id: data.customerId ?? null,
  customer_name: data.customerName ?? null,
  item_name: data.itemName ?? null,
  artwork_no: data.artworkNo ?? null,
  length: data.length ?? null,
  width: data.width ?? null,
  height: data.height ?? null,
  color: data.color ?? null,
  reel_size: data.reelSize ?? null,
  cut_size: data.cutSize ?? null,
  ply: data.ply ?? null,
  flute: data.flute ?? null,
  pin_pasting: data.pinPasting ?? null,
  pin_type: data.pinType ?? null,
  pin_qty: data.pinQty ?? null,
  creasing: data.creasing ?? null,
  ups: data.ups ?? null,
  packing: data.packing ?? null,
  special_requirement: data.specialRequirement ?? null,
  actual_costing: data.actualCosting ?? null,
  layers: data.layers ?? [],
});

/**
 * Creates a new product. Mirrors the previous generic `createDocument`
 * behavior: audit fields (createdBy/updatedBy/createdAt/updatedAt/isArchived)
 * are populated, and the same 'Created' activity log entry is written.
 * The primary key (firestore_document_id) has no DB default, so a UUID is
 * generated client-side. `raw_data` is NOT NULL with no default, so it is
 * populated with the full input plus generated fields - this is also where
 * `dieNumber`/`boxType` (no dedicated columns) are preserved.
 */
export const createProduct = async (data: Record<string, any>, user: string = 'System'): Promise<string> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const columns = toColumns(data);
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

  const { error } = await supabase.from('products').insert({ ...row, raw_data: rawData });

  if (error) {
    console.error('Error creating product:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Created',
    entity: 'products',
    referenceId: id,
  });

  return id;
};

/**
 * Updates a product. Mirrors the previous generic `updateDocument` behavior:
 * the structured columns are refreshed from `data` (the MasterData
 * ProductModal always submits the full product shape, same as before),
 * updatedBy/updatedAt are touched, and the same 'Updated' activity log entry
 * is written. `raw_data` is refreshed too so `dieNumber`/`boxType` edits keep
 * round-tripping correctly.
 */
export const updateProduct = async (id: string, data: Record<string, any>, user: string = 'System'): Promise<void> => {
  const now = new Date().toISOString();
  const columns = toColumns(data);
  const rawData = { ...data, ...columns, id, updatedBy: user, updatedAt: now };

  const { error } = await supabase
    .from('products')
    .update({
      ...columns,
      updated_by: user,
      updated_at: now,
      raw_data: rawData,
    })
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error updating product:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Updated',
    entity: 'products',
    referenceId: id,
  });
};

/**
 * Soft-deletes a product by setting is_archived to true.
 */
export const deleteProduct = async (id: string, user: string = 'System'): Promise<void> => {
  const { error } = await supabase
    .from('products')
    .update({
      is_archived: true,
      updated_by: user,
      updated_at: new Date().toISOString(),
    })
    .eq('firestore_document_id', id);

  if (error) {
    console.error('Error deleting product:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'Deleted',
    entity: 'products',
    referenceId: id,
  });
};

export interface ProductUsage {
  purchaseOrders: number;
  jobCards: number;
  finishGoods: number;
  transactions: number;
  total: number;
}

export const checkProductUsage = async (productId: string): Promise<ProductUsage> => {
  const [{ count: poCount }, { count: jcCount }, { count: fgCount }, { count: fgtCount }] = await Promise.all([
    supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).or(`product_id_raw.eq.${productId},resolved_product_id.eq.${productId}`),
    supabase.from('job_cards').select('*', { count: 'exact', head: true }).or(`product_id_raw.eq.${productId},resolved_product_id.eq.${productId}`),
    supabase.from('finish_goods').select('*', { count: 'exact', head: true }).eq('product_id', productId),
    supabase.from('finish_good_transactions').select('*', { count: 'exact', head: true }).eq('product_id', productId),
  ]);

  return {
    purchaseOrders: poCount || 0,
    jobCards: jcCount || 0,
    finishGoods: fgCount || 0,
    transactions: fgtCount || 0,
    total: (poCount || 0) + (jcCount || 0) + (fgCount || 0) + (fgtCount || 0)
  };
};

export const migrateProduct = async (oldProductId: string, newProduct: SupabaseProduct, user: string = 'System') => {
  const newId = newProduct.id;
  const newName = newProduct.itemName;

  const { data: pos } = await supabase.from('purchase_orders').select('*').or(`product_id_raw.eq.${oldProductId},resolved_product_id.eq.${oldProductId}`);
  if (pos) {
    for (const po of pos) {
      const raw = po.raw_data || {};
      raw.productId = newId;
      raw.itemName = newName;
      await supabase.from('purchase_orders').update({ product_id_raw: newId, resolved_product_id: newId, raw_data: raw }).eq('firestore_document_id', po.firestore_document_id);
    }
  }

  const { data: jcs } = await supabase.from('job_cards').select('*').or(`product_id_raw.eq.${oldProductId},resolved_product_id.eq.${oldProductId}`);
  if (jcs) {
    for (const jc of jcs) {
      const raw = jc.raw_data || {};
      raw.productId = newId;
      raw.itemName = newName;
      await supabase.from('job_cards').update({ product_id_raw: newId, resolved_product_id: newId, raw_data: raw }).eq('firestore_document_id', jc.firestore_document_id);
    }
  }

  const { data: fgs } = await supabase.from('finish_goods').select('*').eq('product_id', oldProductId);
  if (fgs) {
    for (const fg of fgs) {
      const raw = fg.raw_data || {};
      raw.productId = newId;
      raw.productName = newName;
      await supabase.from('finish_goods').update({ product_id: newId, raw_data: raw }).eq('firestore_document_id', fg.firestore_document_id);
    }
  }

  const { data: fgts } = await supabase.from('finish_good_transactions').select('*').eq('product_id', oldProductId);
  if (fgts) {
    for (const fgt of fgts) {
      const raw = fgt.raw_data || {};
      raw.productId = newId;
      raw.productName = newName;
      await supabase.from('finish_good_transactions').update({ product_id: newId, raw_data: raw }).eq('firestore_document_id', fgt.firestore_document_id);
    }
  }

  await logActivity({
    user,
    action: 'Migrated',
    entity: 'products',
    referenceId: oldProductId,
  });
};

export const bulkUpdateProductCustomers = async (productIds: string[], newCustomer: { id: string, name: string }, user: string = 'System') => {
  const newId = newCustomer.id;
  const newName = newCustomer.name;
  
  // 1. Fetch current products to update raw_data
  const { data: products } = await supabase.from('products').select('*').in('firestore_document_id', productIds);
  if (products) {
    for (const p of products) {
      const raw = p.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('products').update({ 
        customer_id: newId, 
        customer_name: newName, 
        raw_data: raw 
      }).eq('firestore_document_id', p.firestore_document_id);
    }
  }

  // 2. Update Job Cards referencing these products
  const { data: jcs } = await supabase.from('job_cards').select('*').in('resolved_product_id', productIds);
  if (jcs) {
    for (const jc of jcs) {
      const raw = jc.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('job_cards').update({ 
        customer_id_raw: newId, 
        resolved_customer_id: newId, 
        customer_name: newName, 
        raw_data: raw 
      }).eq('firestore_document_id', jc.firestore_document_id);
    }
  }

  // 3. Update POs referencing these products
  const { data: pos } = await supabase.from('purchase_orders').select('*').in('resolved_product_id', productIds);
  if (pos) {
    for (const po of pos) {
      const raw = po.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('purchase_orders').update({ 
        customer_id_raw: newId, 
        resolved_customer_id: newId, 
        customer_name: newName, 
        raw_data: raw 
      }).eq('firestore_document_id', po.firestore_document_id);
    }
  }

  // 4. Update Finish Goods
  const { data: fgs } = await supabase.from('finish_goods').select('*').in('product_id', productIds);
  if (fgs) {
    for (const fg of fgs) {
      const raw = fg.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('finish_goods').update({ 
        customer_id: newId, 
        raw_data: raw 
      }).eq('firestore_document_id', fg.firestore_document_id);
    }
  }

  // 5. Update Finish Good Transactions
  const { data: fgts } = await supabase.from('finish_good_transactions').select('*').in('product_id', productIds);
  if (fgts) {
    for (const fgt of fgts) {
      const raw = fgt.raw_data || {};
      raw.customerId = newId;
      raw.customerName = newName;
      await supabase.from('finish_good_transactions').update({ 
        customer_id: newId, 
        raw_data: raw 
      }).eq('firestore_document_id', fgt.firestore_document_id);
    }
  }

  await logActivity({
    user,
    action: 'Updated',
    entity: 'products',
    referenceId: `Bulk(${productIds.length})`,
  });
};


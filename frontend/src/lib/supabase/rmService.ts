import { supabase } from './config';
import { logActivity } from './activityLogService';
import type { RawMaterial, RawMaterialTransaction } from '../types/models';

export const getRawMaterials = async (): Promise<RawMaterial[]> => {
  const { data, error } = await supabase
    .from('raw_materials')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching raw materials:', error);
    throw error;
  }

  return (data || []).map(mapRawMaterialRow);
};

export const getRawMaterialTransactions = async (rawMaterialId?: string): Promise<RawMaterialTransaction[]> => {
  let query = supabase.from('raw_material_transactions').select('*');
  
  if (rawMaterialId) {
    query = query.eq('raw_material_id', rawMaterialId);
  }

  const { data, error } = await query.order('date', { ascending: false }).order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching RM transactions:', error);
    throw error;
  }

  return (data || []).map(mapTransactionRow);
};

export const addRawMaterialTransaction = async (
  transaction: Omit<RawMaterialTransaction, 'id' | 'createdAt' | 'updatedAt' | 'remainingBalance'>,
  user: string
): Promise<void> => {
  // 1. Fetch current balance
  const { data: rmData, error: rmError } = await supabase
    .from('raw_materials')
    .select('closing_balance, in_qty, out_qty, rate')
    .eq('id', transaction.rawMaterialId)
    .single();

  if (rmError) throw rmError;

  const currentBal = Number(rmData.closing_balance) || 0;
  const currentIn = Number(rmData.in_qty) || 0;
  const currentOut = Number(rmData.out_qty) || 0;

  // 2. Calculate new balance
  const isOut = transaction.type === 'OUT';
  const remainingBalance = isOut 
    ? currentBal - transaction.quantity 
    : currentBal + transaction.quantity;

  const newIn = !isOut ? currentIn + transaction.quantity : currentIn;
  const newOut = isOut ? currentOut + transaction.quantity : currentOut;

  // Format reference with supplier & rate if provided
  let refText = transaction.referenceNo || '';
  if (transaction.supplierName) {
    refText = refText ? `${refText} | Supplier: ${transaction.supplierName}` : `Supplier: ${transaction.supplierName}`;
  }
  if (transaction.rate && transaction.rate > 0) {
    refText = refText ? `${refText} (Rate: ₹${transaction.rate})` : `Rate: ₹${transaction.rate}`;
  }
  if (transaction.remarks) {
    refText = refText ? `${refText} - ${transaction.remarks}` : transaction.remarks;
  }

  // 3. Insert Transaction (Use IN/OUT for safe DB check constraints, but tagged reference for adjustment)
  const dbType = transaction.type === 'OUT' ? 'OUT' : 'IN';

  const { error: txError } = await supabase.from('raw_material_transactions').insert({
    raw_material_id: transaction.rawMaterialId,
    type: dbType,
    quantity: transaction.quantity,
    remaining_balance: remainingBalance,
    date: transaction.date,
    reference_no: refText || undefined,
    performed_by: user,
    created_by: user,
    updated_by: user
  });

  if (txError) throw txError;

  // 4. Update Main Record (also update rate if new rate is provided in IN transaction)
  const updatePayload: any = { 
    closing_balance: remainingBalance,
    in_qty: newIn,
    out_qty: newOut,
    updated_by: user
  };

  if (transaction.type === 'IN' && transaction.rate && transaction.rate > 0) {
    updatePayload.rate = transaction.rate;
  }

  const { error: updateError } = await supabase
    .from('raw_materials')
    .update(updatePayload)
    .eq('id', transaction.rawMaterialId);

  if (updateError) throw updateError;

  await logActivity({
    user,
    action: `Added ${transaction.type} transaction for RM (${transaction.quantity})`,
    entity: 'raw_materials',
    referenceId: transaction.rawMaterialId,
  });
};

export const adjustRawMaterialStock = async ({
  rawMaterialId,
  auditedStock,
  reason,
  date,
  user
}: {
  rawMaterialId: string;
  auditedStock: number;
  reason?: string;
  date: string;
  user: string;
}): Promise<{ difference: number }> => {
  // 1. Fetch current balance
  const { data: rmData, error: rmError } = await supabase
    .from('raw_materials')
    .select('name, closing_balance, in_qty, out_qty')
    .eq('id', rawMaterialId)
    .single();

  if (rmError) throw rmError;

  const currentBal = Number(rmData.closing_balance) || 0;
  const currentIn = Number(rmData.in_qty) || 0;
  const currentOut = Number(rmData.out_qty) || 0;
  const difference = auditedStock - currentBal;

  const refNote = `[AUDIT ADJUSTMENT] ${reason || 'Physical Count Match'} (Diff: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)})`;

  // 2. Insert transaction
  const isSurplus = difference >= 0;
  const dbType = isSurplus ? 'IN' : 'OUT';
  const qty = Math.abs(difference);

  const { error: txError } = await supabase.from('raw_material_transactions').insert({
    raw_material_id: rawMaterialId,
    type: dbType,
    quantity: qty,
    remaining_balance: auditedStock,
    date,
    reference_no: refNote,
    performed_by: user,
    created_by: user,
    updated_by: user
  });

  if (txError) throw txError;

  // 3. Update raw materials table
  const updatePayload: any = {
    closing_balance: auditedStock,
    updated_by: user
  };
  if (isSurplus) {
    updatePayload.in_qty = currentIn + qty;
  } else {
    updatePayload.out_qty = currentOut + qty;
  }

  const { error: updateError } = await supabase
    .from('raw_materials')
    .update(updatePayload)
    .eq('id', rawMaterialId);

  if (updateError) throw updateError;

  await logActivity({
    user,
    action: `Audited stock adjustment for RM ${rmData.name}: Diff ${difference >= 0 ? '+' : ''}${difference} -> New Balance: ${auditedStock}`,
    entity: 'raw_materials',
    referenceId: rawMaterialId,
  });

  return { difference };
};

export const createRawMaterial = async (
  record: {
    name: string;
    openingQty?: number;
    rate?: number;
    unit?: string;
  },
  user: string
): Promise<string> => {
  const opening = Number(record.openingQty) || 0;
  const rate = Number(record.rate) || 0;

  const { data, error } = await supabase.from('raw_materials').insert({
    name: record.name.trim(),
    opening_qty: opening,
    closing_balance: opening,
    rate: rate,
    created_by: user,
    updated_by: user,
  }).select('id').single();

  if (error) {
    console.error('Error creating RM:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Created Raw Material: ${record.name} (Opening: ${opening}, Rate: ₹${rate})`,
    entity: 'raw_materials',
    referenceId: data.id,
  });

  return data.id;
};

export const bulkImportRawMaterials = async (
  items: Array<{
    name: string;
    openingQty?: number;
    rate?: number;
  }>,
  user: string
): Promise<{ createdCount: number; updatedCount: number }> => {
  // Fetch existing raw materials
  const { data: existing = [], error: fetchErr } = await supabase
    .from('raw_materials')
    .select('id, name, opening_qty, closing_balance, rate, in_qty, out_qty');

  if (fetchErr) throw fetchErr;

  const existingMap = new Map<string, any>();
  existing?.forEach((rm: any) => {
    existingMap.set(rm.name.trim().toLowerCase(), rm);
  });

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const trimmedName = item.name.trim();
    if (!trimmedName) continue;

    const key = trimmedName.toLowerCase();
    const opnQty = Number(item.openingQty) || 0;
    const rate = Number(item.rate) || 0;

    if (existingMap.has(key)) {
      // Update existing item opening/rate/balance
      const current = existingMap.get(key);
      const diff = opnQty - Number(current.opening_qty || 0);
      const newBal = Number(current.closing_balance || 0) + diff;

      await supabase
        .from('raw_materials')
        .update({
          opening_qty: opnQty,
          closing_balance: newBal >= 0 ? newBal : opnQty,
          rate: rate > 0 ? rate : current.rate,
          updated_by: user
        })
        .eq('id', current.id);

      updatedCount++;
    } else {
      // Create new
      const { data: newRow, error: insErr } = await supabase
        .from('raw_materials')
        .insert({
          name: trimmedName,
          opening_qty: opnQty,
          closing_balance: opnQty,
          in_qty: 0,
          out_qty: 0,
          rate: rate,
          created_by: user,
          updated_by: user
        })
        .select('id')
        .single();

      if (!insErr && newRow) {
        existingMap.set(key, { id: newRow.id, name: trimmedName });
        createdCount++;
      }
    }
  }

  await logActivity({
    user,
    action: `Bulk Imported Raw Materials: ${createdCount} created, ${updatedCount} updated`,
    entity: 'raw_materials',
    referenceId: 'bulk_import',
  });

  return { createdCount, updatedCount };
};

const mapRawMaterialRow = (row: any): RawMaterial => ({
  id: row.id,
  name: row.name,
  openingQty: Number(row.opening_qty) || 0,
  inQty: Number(row.in_qty) || 0,
  outQty: Number(row.out_qty) || 0,
  closingBalance: Number(row.closing_balance) || 0,
  rate: Number(row.rate) || 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  isArchived: row.is_archived || false,
});

const mapTransactionRow = (row: any): RawMaterialTransaction => {
  const ref = row.reference_no || '';
  const isAudit = ref.includes('[AUDIT ADJUSTMENT]');
  
  // Extract rate if present in reference (e.g., Rate: ₹45.5)
  let extractedRate: number | undefined;
  const rateMatch = ref.match(/Rate:\s*₹?([\d.]+)/i);
  if (rateMatch && rateMatch[1]) {
    extractedRate = parseFloat(rateMatch[1]);
  }

  // Extract supplier if present
  let extractedSupplier: string | undefined;
  const supplierMatch = ref.match(/Supplier:\s*([^|(-]+)/i);
  if (supplierMatch && supplierMatch[1]) {
    extractedSupplier = supplierMatch[1].trim();
  }

  return {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    type: isAudit ? 'ADJUSTMENT' : (row.type as 'IN' | 'OUT'),
    quantity: Number(row.quantity) || 0,
    rate: extractedRate,
    amount: extractedRate ? extractedRate * Number(row.quantity) : undefined,
    remainingBalance: Number(row.remaining_balance) || 0,
    date: row.date,
    referenceNo: row.reference_no,
    supplierName: extractedSupplier,
    performedBy: row.performed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    isArchived: row.is_archived || false,
  };
};

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
    .select('closing_balance, in_qty, out_qty')
    .eq('id', transaction.rawMaterialId)
    .single();

  if (rmError) throw rmError;

  const currentBal = Number(rmData.closing_balance) || 0;
  const currentIn = Number(rmData.in_qty) || 0;
  const currentOut = Number(rmData.out_qty) || 0;

  // 2. Calculate new balance
  const remainingBalance = transaction.type === 'IN' 
    ? currentBal + transaction.quantity 
    : currentBal - transaction.quantity;

  const newIn = transaction.type === 'IN' ? currentIn + transaction.quantity : currentIn;
  const newOut = transaction.type === 'OUT' ? currentOut + transaction.quantity : currentOut;

  // 3. Insert Transaction
  const { error: txError } = await supabase.from('raw_material_transactions').insert({
    raw_material_id: transaction.rawMaterialId,
    type: transaction.type,
    quantity: transaction.quantity,
    remaining_balance: remainingBalance,
    date: transaction.date,
    reference_no: transaction.referenceNo,
    performed_by: user,
    created_by: user,
    updated_by: user
  });

  if (txError) throw txError;

  // 4. Update Main Record
  const { error: updateError } = await supabase
    .from('raw_materials')
    .update({ 
      closing_balance: remainingBalance,
      in_qty: newIn,
      out_qty: newOut,
      updated_by: user
    })
    .eq('id', transaction.rawMaterialId);

  if (updateError) throw updateError;

  await logActivity({
    user,
    action: `Added ${transaction.type} transaction for RM`,
    entity: 'raw_materials',
    referenceId: transaction.rawMaterialId,
  });
};

export const createRawMaterial = async (
  record: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt' | 'inQty' | 'outQty' | 'closingBalance'>,
  user: string
): Promise<string> => {
  const { data, error } = await supabase.from('raw_materials').insert({
    name: record.name,
    opening_qty: record.openingQty,
    closing_balance: record.openingQty,
    rate: record.rate,
    created_by: user,
    updated_by: user,
  }).select('id').single();

  if (error) {
    console.error('Error creating RM:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Created Raw Material: ${record.name}`,
    entity: 'raw_materials',
    referenceId: data.id,
  });

  return data.id;
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

const mapTransactionRow = (row: any): RawMaterialTransaction => ({
  id: row.id,
  rawMaterialId: row.raw_material_id,
  type: row.type as 'IN' | 'OUT',
  quantity: Number(row.quantity) || 0,
  remainingBalance: Number(row.remaining_balance) || 0,
  date: row.date,
  referenceNo: row.reference_no,
  performedBy: row.performed_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  isArchived: row.is_archived || false,
});

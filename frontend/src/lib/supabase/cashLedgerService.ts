import { supabase } from './config';
import { logActivity } from './activityLogService';
import type { CashLedgerEntry, ExpenseCategory } from '../types/models';

export interface CashLedgerFilter {
  startDate?: string;
  endDate?: string;
  month?: string; // YYYY-MM
  expenseHead?: string;
  paymentMode?: 'CASH' | 'BANK' | 'ALL';
  searchQuery?: string;
}

export const getCashLedgerEntries = async (filter?: CashLedgerFilter): Promise<CashLedgerEntry[]> => {
  let query = supabase
    .from('cash_ledger')
    .select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (filter?.month) {
    const start = `${filter.month}-01`;
    // Month last day computation
    const [y, m] = filter.month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${filter.month}-${String(lastDay).padStart(2, '0')}`;
    query = query.gte('date', start).lte('date', end);
  } else {
    if (filter?.startDate) {
      query = query.gte('date', filter.startDate);
    }
    if (filter?.endDate) {
      query = query.lte('date', filter.endDate);
    }
  }

  if (filter?.expenseHead) {
    query = query.eq('expense_head', filter.expenseHead);
  }

  if (filter?.paymentMode && filter.paymentMode !== 'ALL') {
    query = query.eq('payment_mode', filter.paymentMode);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching cash ledger entries:', error);
    throw error;
  }

  let entries = (data || []).map(mapRowToEntry);

  if (filter?.searchQuery?.trim()) {
    const q = filter.searchQuery.toLowerCase().trim();
    entries = entries.filter(e => 
      e.expenseHead.toLowerCase().includes(q) ||
      (e.narration && e.narration.toLowerCase().includes(q)) ||
      (e.voucherNo && e.voucherNo.toLowerCase().includes(q))
    );
  }

  return entries;
};

// Head-wise total expenses for a specific month for Cash Profit & Loss (MR) integration
export const getMonthlyExpenseAggregates = async (month: string): Promise<Record<string, number>> => {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return {};

  const start = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('cash_ledger')
    .select('expense_head, dr, cr')
    .gte('date', start)
    .lte('date', end);

  if (error) {
    console.error('Error aggregating monthly expenses from cash ledger:', error);
    return {};
  }

  const aggregates: Record<string, number> = {};
  (data || []).forEach(row => {
    const head = (row.expense_head || '').trim();
    if (!head) return;
    const dr = Number(row.dr) || 0;
    const cr = Number(row.cr) || 0;
    // Net expense: Debit (outflow) minus Credit (refund/reversal)
    const net = dr - cr;
    aggregates[head] = (aggregates[head] || 0) + net;
  });

  return aggregates;
};

// Calculate Opening Balance (Balance B/F) prior to a specific date
export const getOpeningBalance = async (
  beforeDate: string,
  paymentMode?: 'CASH' | 'BANK' | 'ALL'
): Promise<number> => {
  if (!beforeDate) return 0;

  let query = supabase
    .from('cash_ledger')
    .select('dr, cr')
    .lt('date', beforeDate);

  if (paymentMode && paymentMode !== 'ALL') {
    query = query.eq('payment_mode', paymentMode);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error calculating cash ledger opening balance:', error);
    return 0;
  }

  return (data || []).reduce((acc, row) => {
    const cr = Number(row.cr) || 0;
    const dr = Number(row.dr) || 0;
    // Credit adds inflow, Debit subtracts outflow
    return acc + (cr - dr);
  }, 0);
};

export const batchCreateCashLedgerEntries = async (
  entries: Omit<CashLedgerEntry, 'id' | 'createdAt' | 'updatedAt'>[],
  user: string
): Promise<void> => {
  if (!entries || entries.length === 0) return;

  const rows = entries.map(e => ({
    date: e.date,
    voucher_no: e.voucherNo?.trim() || null,
    expense_head: e.expenseHead.trim(),
    narration: e.narration?.trim() || null,
    payment_mode: e.paymentMode || 'CASH',
    dr: Number(e.dr) || 0,
    cr: Number(e.cr) || 0,
    created_by: user,
    updated_by: user,
  }));

  const { error } = await supabase.from('cash_ledger').insert(rows);

  if (error) {
    console.error('Error creating cash ledger entries in batch:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Created ${entries.length} cash ledger entries`,
    entity: 'cash_ledger',
    referenceId: entries[0]?.date || 'batch',
  });
};

export const updateCashLedgerEntry = async (
  id: string,
  entry: Partial<Omit<CashLedgerEntry, 'id' | 'createdAt'>>,
  user: string
): Promise<void> => {
  const updatePayload: Record<string, any> = {
    updated_by: user,
    updated_at: new Date().toISOString(),
  };

  if (entry.date !== undefined) updatePayload.date = entry.date;
  if (entry.voucherNo !== undefined) updatePayload.voucher_no = entry.voucherNo.trim();
  if (entry.expenseHead !== undefined) updatePayload.expense_head = entry.expenseHead.trim();
  if (entry.narration !== undefined) updatePayload.narration = entry.narration.trim();
  if (entry.paymentMode !== undefined) updatePayload.payment_mode = entry.paymentMode;
  if (entry.dr !== undefined) updatePayload.dr = Number(entry.dr) || 0;
  if (entry.cr !== undefined) updatePayload.cr = Number(entry.cr) || 0;

  const { error } = await supabase
    .from('cash_ledger')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('Error updating cash ledger entry:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Updated cash ledger entry: ${entry.expenseHead || id} (Dr: ${entry.dr ?? '-'}, Cr: ${entry.cr ?? '-'})`,
    entity: 'cash_ledger',
    referenceId: id,
  });
};

export const deleteCashLedgerEntry = async (id: string, user: string): Promise<void> => {
  const { error } = await supabase.from('cash_ledger').delete().eq('id', id);

  if (error) {
    console.error('Error deleting cash ledger entry:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Deleted cash ledger entry`,
    entity: 'cash_ledger',
    referenceId: id,
  });
};

// Master Expense Categories API
export const getExpenseCategories = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.warn('Could not fetch custom expense categories from Supabase:', error);
    return [];
  }

  return (data || []).map(r => r.name);
};

export const createExpenseCategory = async (name: string, user: string): Promise<string> => {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Category name cannot be empty');

  const { data: existing } = await supabase
    .from('expense_categories')
    .select('name')
    .ilike('name', cleanName)
    .maybeSingle();

  if (existing) {
    return existing.name;
  }

  const { error } = await supabase.from('expense_categories').insert({
    name: cleanName,
    created_by: user,
  });

  if (error) {
    console.error('Error adding expense category:', error);
    // Ignore unique constraint conflict
    if (!error.message.includes('unique')) throw error;
  }

  await logActivity({
    user,
    action: `Added new expense category: ${cleanName}`,
    entity: 'expense_categories',
    referenceId: cleanName,
  });

  return cleanName;
};

const mapRowToEntry = (row: any): CashLedgerEntry => ({
  id: row.id,
  date: row.date,
  voucherNo: row.voucher_no || '',
  expenseHead: row.expense_head || '',
  narration: row.narration || '',
  paymentMode: (row.payment_mode || 'CASH') as 'CASH' | 'BANK',
  dr: Number(row.dr) || 0,
  cr: Number(row.cr) || 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  isArchived: row.is_archived || false,
});

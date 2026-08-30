import { supabase } from './config';
import { logActivity } from './activityLogService';
import type { MonthlyReport } from '../types/models';

export const getMonthlyReports = async (): Promise<MonthlyReport[]> => {
  const { data: reports, error: rError } = await supabase
    .from('monthly_reports')
    .select('*')
    .order('month', { ascending: false });

  if (rError) throw rError;

  const { data: expenses, error: eError } = await supabase
    .from('monthly_expenses')
    .select('*');

  if (eError) throw eError;

  return reports.map(r => ({
    id: r.id,
    month: r.month,
    expenses: expenses
      .filter(e => e.monthly_report_id === r.id)
      .map(e => ({ id: e.id, name: e.name, amount: Number(e.amount) || 0 })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
  }));
};

export const getOrCreateMonthlyReport = async (month: string, user: string): Promise<MonthlyReport> => {
  const reports = await getMonthlyReports();
  const existing = reports.find(r => r.month === month);
  
  if (existing) return existing;

  // Create new
  const { data, error } = await supabase.from('monthly_reports').insert({
    month,
    created_by: user,
    updated_by: user
  }).select('id').single();

  if (error) throw error;

  await logActivity({
    user,
    action: `Created P&L Report for ${month}`,
    entity: 'monthly_reports',
    referenceId: data.id,
  });

  return {
    id: data.id,
    month,
    expenses: []
  };
};

export const saveMonthlyExpense = async (
  reportId: string,
  name: string,
  amount: number,
  user: string
) => {
  // Check if exists
  const { data: existing } = await supabase
    .from('monthly_expenses')
    .select('id')
    .eq('monthly_report_id', reportId)
    .eq('name', name)
    .single();

  if (existing) {
    await supabase.from('monthly_expenses').update({ amount, updated_by: user }).eq('id', existing.id);
  } else {
    await supabase.from('monthly_expenses').insert({
      monthly_report_id: reportId,
      name,
      amount,
      created_by: user,
      updated_by: user
    });
  }
};

export const saveBatchMonthlyExpenses = async (
  reportId: string,
  dataMap: Record<string, number>,
  user: string
) => {
  const { data: existingList } = await supabase
    .from('monthly_expenses')
    .select('id, name')
    .eq('monthly_report_id', reportId);

  const existingMap = new Map<string, string>();
  (existingList || []).forEach(item => {
    existingMap.set(item.name, item.id);
  });

  const operations: Promise<any>[] = [];
  const inserts: any[] = [];

  Object.entries(dataMap).forEach(([name, amount]) => {
    if (existingMap.has(name)) {
      const id = existingMap.get(name)!;
      operations.push(
        Promise.resolve(
          supabase
            .from('monthly_expenses')
            .update({ amount, updated_by: user })
            .eq('id', id)
        )
      );
    } else {
      inserts.push({
        monthly_report_id: reportId,
        name,
        amount,
        created_by: user,
        updated_by: user,
      });
    }
  });

  if (inserts.length > 0) {
    operations.push(Promise.resolve(supabase.from('monthly_expenses').insert(inserts)));
  }

  await Promise.all(operations);
};


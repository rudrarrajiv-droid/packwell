import { supabase } from './config';
import { logActivity } from './activityLogService';
import type { ScrapEntry } from '../types/models';

export const getScrapEntries = async (): Promise<ScrapEntry[]> => {
  const { data, error } = await supabase
    .from('scrap_entries')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching scrap entries:', error);
    throw error;
  }

  return (data || []).map(mapScrapRow);
};

export const createScrapEntry = async (
  entry: Omit<ScrapEntry, 'id' | 'createdAt' | 'updatedAt'>,
  user: string
): Promise<string> => {
  const { error } = await supabase.from('scrap_entries').insert({
    date: entry.date,
    description: entry.description,
    weight: entry.weight,
    rate: entry.rate,
    total_value: entry.totalValue,
    payment_type: entry.paymentType,
    created_by: user,
    updated_by: user,
  });

  if (error) {
    console.error('Error creating scrap entry:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Created scrap entry for ${entry.date}`,
    entity: 'scrap_entries',
    referenceId: entry.date,
  });

  return 'success';
};

export const updateScrapEntry = async (
  id: string,
  entry: Partial<Omit<ScrapEntry, 'id' | 'createdAt'>>,
  user: string
): Promise<void> => {
  const updatePayload: Record<string, any> = {
    updated_by: user,
    updated_at: new Date().toISOString(),
  };

  if (entry.date !== undefined) updatePayload.date = entry.date;
  if (entry.description !== undefined) updatePayload.description = entry.description;
  if (entry.weight !== undefined) updatePayload.weight = entry.weight;
  if (entry.rate !== undefined) updatePayload.rate = entry.rate;
  if (entry.totalValue !== undefined) updatePayload.total_value = entry.totalValue;
  if (entry.paymentType !== undefined) updatePayload.payment_type = entry.paymentType;

  const { error } = await supabase
    .from('scrap_entries')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('Error updating scrap entry:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Updated scrap entry for ${entry.date || id}`,
    entity: 'scrap_entries',
    referenceId: id,
  });
};

export const deleteScrapEntry = async (id: string, user: string): Promise<void> => {
  const { error } = await supabase.from('scrap_entries').delete().eq('id', id);

  if (error) {
    console.error('Error deleting scrap entry:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Deleted scrap entry`,
    entity: 'scrap_entries',
    referenceId: id,
  });
};

const mapScrapRow = (row: any): ScrapEntry => ({
  id: row.id,
  date: row.date,
  description: row.description || '',
  weight: Number(row.weight) || 0,
  rate: Number(row.rate) || 0,
  totalValue: Number(row.total_value) || 0,
  paymentType: row.payment_type as 'CASH' | 'BILLING',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  isArchived: row.is_archived || false,
});

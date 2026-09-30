import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface FgAudit {
  id: string;
  audit_date: string;
  created_by: string;
  created_at: string;
}

export interface FgAuditItem {
  id: string;
  audit_id: string;
  finish_good_id: string;
  product_id: string;
  product_name: string;
  system_regular_balance: number;
  system_non_moving_balance: number;
  audited_regular_balance: number;
  audited_non_moving_balance: number;
  regular_difference: number;
  non_moving_difference: number;
  rate: number;
  created_at: string;
}

export const executeFgAudit = async (
  auditDate: string,
  items: any[],
  user: string = 'System'
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('execute_fg_audit', {
    p_audit_date: auditDate,
    p_items: items,
    p_user: user,
  });

  if (error) {
    console.error('Error executing fg audit:', error);
    throw error;
  }

  await logActivity({
    user,
    action: 'FG Audit Completed',
    entity: 'finish_goods',
    referenceId: data as string,
    details: `Performed FG audit for ${items.length} items on ${auditDate}`,
  });

  return true;
};

export const getFgAudits = async (): Promise<FgAudit[]> => {
  const { data, error } = await supabase
    .from('fg_audits')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching fg audits:', error);
    throw error;
  }

  return data as FgAudit[];
};

export const getFgAuditItems = async (auditId: string): Promise<FgAuditItem[]> => {
  const { data, error } = await supabase
    .from('fg_audit_items')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching fg audit items:', error);
    throw error;
  }

  return data as FgAuditItem[];
};

export const updateFgAuditItem = async (
  itemId: string,
  auditedRegular: number,
  auditedNonMoving: number,
  user: string = 'System'
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('update_fg_audit_item', {
    p_item_id: itemId,
    p_audited_regular: auditedRegular,
    p_audited_non_moving: auditedNonMoving,
    p_user: user,
  });

  if (error) {
    console.error('Error updating fg audit item:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Update FG audit item RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'FG Audit Item Corrected',
    entity: 'finish_goods',
    referenceId: itemId,
    details: `Updated audit item ${itemId} to regular: ${auditedRegular}, non-moving: ${auditedNonMoving}`,
  });

  return true;
};

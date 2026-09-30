import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface ReelAuditItemInput {
  reelId: string;
  reelNumber: string;
  systemWeight: number;
  systemBalance: number;
  auditedWeight: number;
  auditedIn: number;
  auditedOut: number;
  auditedBalance: number;
}

export interface ReelAudit {
  id: string;
  audit_date: string;
  created_by: string;
  created_at: string;
}

export interface ReelAuditItem {
  id: string;
  audit_id: string;
  reel_id: string;
  reel_number: string;
  system_weight: number;
  system_balance: number;
  audited_weight: number;
  audited_in: number;
  audited_out: number;
  audited_balance: number;
  difference: number;
}

export const executeReelAudit = async (
  auditDate: string,
  items: ReelAuditItemInput[],
  user: string = 'System'
): Promise<boolean> => {
  if (items.length === 0) return true;

  const { data, error } = await supabase.rpc('execute_reel_audit', {
    p_audit_date: auditDate,
    p_items: items,
    p_user: user,
  });

  if (error) {
    console.error('Error executing reel audit:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Execute reel audit RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Reel Audit Performed',
    entity: 'reels',
    count: items.length,
    details: `Audited ${items.length} reels on ${auditDate}`,
  });

  return true;
};

export const getReelAudits = async (): Promise<ReelAudit[]> => {
  const { data, error } = await supabase
    .from('reel_audits')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reel audits:', error);
    throw error;
  }

  return data as ReelAudit[];
};

export const getReelAuditItems = async (auditId: string): Promise<ReelAuditItem[]> => {
  const { data, error } = await supabase
    .from('reel_audit_items')
    .select('*')
    .eq('audit_id', auditId);

  if (error) {
    console.error('Error fetching reel audit items:', error);
    throw error;
  }

  return data as ReelAuditItem[];
};

export const updateReelAuditItem = async (
  itemId: string,
  auditedWeight: number,
  auditedIn: number,
  auditedOut: number,
  auditedBalance: number,
  user: string = 'System'
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('update_reel_audit_item', {
    p_item_id: itemId,
    p_audited_weight: auditedWeight,
    p_audited_in: auditedIn,
    p_audited_out: auditedOut,
    p_audited_balance: auditedBalance,
    p_user: user,
  });

  if (error) {
    console.error('Error updating reel audit item:', error);
    throw error;
  }

  if (data !== true) {
    throw new Error('Update reel audit item RPC did not complete successfully.');
  }

  await logActivity({
    user,
    action: 'Audit Item Corrected',
    entity: 'reels',
    referenceId: itemId,
    details: `Updated audit item ${itemId} to balance ${auditedBalance}`,
  });

  return true;
};


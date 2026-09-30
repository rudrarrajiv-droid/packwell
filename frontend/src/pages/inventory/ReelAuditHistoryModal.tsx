import React, { useState, useEffect } from 'react';
import { X, Calendar, ChevronRight, ArrowLeft, Edit2, Save, XCircle, Trash2 } from 'lucide-react';
import { type ReelAudit, type ReelAuditItem, getReelAudits, getReelAuditItems, updateReelAuditItem, deleteReelAudit } from '../../lib/supabase/reelAuditService';
import { useAuth } from '../../contexts/AuthContext';

interface ReelAuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReelAuditHistoryModal({ isOpen, onClose }: ReelAuditHistoryModalProps) {
  const { user } = useAuth();
  const [audits, setAudits] = useState<ReelAudit[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<ReelAudit | null>(null);
  const [auditItems, setAuditItems] = useState<ReelAuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{in: number, out: number, bal: number}>({in: 0, out: 0, bal: 0});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAudits();
      setSelectedAudit(null);
    }
  }, [isOpen]);

  const loadAudits = async () => {
    setIsLoading(true);
    try {
      const data = await getReelAudits();
      setAudits(data);
    } catch (err) {
      console.error('Failed to load audits', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuditClick = async (audit: ReelAudit) => {
    setIsLoading(true);
    setSelectedAudit(audit);
    setEditingItemId(null);
    try {
      const items = await getReelAuditItems(audit.id);
      setAuditItems(items);
    } catch (err) {
      console.error('Failed to load audit items', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (item: ReelAuditItem) => {
    setEditingItemId(item.id);
    setEditValues({
      in: item.audited_weight,
      out: item.audited_out,
      bal: item.audited_balance
    });
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  const updateEditValue = (field: 'in' | 'out' | 'bal', value: string) => {
    const numValue = Number(value) || 0;
    setEditValues((prev: { in: number, out: number, bal: number }) => {
      const newVals = { ...prev };
      if (field === 'in') {
        newVals.in = numValue;
        newVals.bal = Math.max(0, newVals.in - newVals.out);
      } else if (field === 'out') {
        newVals.out = numValue;
        newVals.bal = Math.max(0, newVals.in - newVals.out);
      } else if (field === 'bal') {
        newVals.bal = numValue;
        newVals.out = Math.max(0, newVals.in - newVals.bal);
      }
      return newVals;
    });
  };

  const saveEdit = async (item: ReelAuditItem) => {
    try {
      setIsSaving(true);
      await updateReelAuditItem(
        item.id,
        editValues.in,
        editValues.in,
        editValues.out,
        editValues.bal,
        user?.name || 'System'
      );
      // Reload items to show updated state
      const items = await getReelAuditItems(item.audit_id);
      setAuditItems(items);
      setEditingItemId(null);
    } catch (err) {
      console.error('Failed to update audit item:', err);
      alert('Failed to save correction.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAudit = async (e: React.MouseEvent, auditId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this audit? This will remove all audit history for this date, but will NOT revert the reel weights.')) {
      return;
    }
    try {
      setIsLoading(true);
      await deleteReelAudit(auditId);
      await loadAudits();
    } catch (err) {
      console.error('Failed to delete audit', err);
      alert('Failed to delete audit.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/30">
          <div className="flex items-center gap-3">
            {selectedAudit && (
              <button 
                onClick={() => setSelectedAudit(null)}
                className="p-1.5 hover:bg-secondary rounded-full transition-colors mr-1"
                title="Back to list"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {selectedAudit ? `Audit Details: ${selectedAudit.audit_date}` : 'Audit History'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedAudit ? `Performed by ${selectedAudit.created_by}` : 'View and analyze previous stock audits'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/10">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground font-medium">Loading...</div>
          ) : selectedAudit ? (
            <div className="p-6">
              {/* Summary Header */}
              <div className="mb-4 bg-background p-4 rounded-lg border border-border shadow-sm flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-xs uppercase text-muted-foreground font-semibold">Total Audited Balance</span>
                  <span className="text-lg font-bold text-foreground">
                    {auditItems.reduce((sum, i) => sum + (Number(i.audited_balance) || 0), 0)} kg
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase text-muted-foreground font-semibold">Total IN</span>
                  <span className="text-lg font-bold text-blue-600">
                    {selectedAudit.total_in || 0} kg
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase text-muted-foreground font-semibold">Total OUT</span>
                  <span className="text-lg font-bold text-orange-600">
                    {selectedAudit.total_out || 0} kg
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase text-muted-foreground font-semibold">Net Difference</span>
                  <span className={`text-lg font-bold ${selectedAudit.total_difference > 0 ? 'text-green-600' : selectedAudit.total_difference < 0 ? 'text-red-600' : 'text-foreground'}`}>
                    {selectedAudit.total_difference > 0 ? '+' : ''}{selectedAudit.total_difference || 0} kg
                  </span>
                </div>
              </div>

              <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-secondary/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-medium">Reel No</th>
                      <th className="px-4 py-3 font-medium text-blue-600 bg-blue-50/50" colSpan={2}>Weight (IN)</th>
                      <th className="px-4 py-3 font-medium text-red-600 bg-red-50/50" colSpan={2}>Consumed (OUT)</th>
                      <th className="px-4 py-3 font-medium text-green-600 bg-green-50/50" colSpan={2}>Balance</th>
                      <th className="px-4 py-3 font-medium text-center">Diff</th>
                      <th className="px-4 py-3 font-medium text-center">Action</th>
                    </tr>
                    <tr className="border-t border-border/50 text-[10px]">
                      <th className="px-4 py-1"></th>
                      <th className="px-4 py-1 bg-blue-50/50">System</th>
                      <th className="px-4 py-1 bg-blue-50/50">Audited</th>
                      <th className="px-4 py-1 bg-red-50/50">System</th>
                      <th className="px-4 py-1 bg-red-50/50">Audited</th>
                      <th className="px-4 py-1 bg-green-50/50">System</th>
                      <th className="px-4 py-1 bg-green-50/50">Audited</th>
                      <th className="px-4 py-1"></th>
                      <th className="px-4 py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditItems.map((item: ReelAuditItem) => {
                      const sysOut = item.system_weight - item.system_balance;
                      const isEditing = editingItemId === item.id;
                      
                      return (
                        <tr key={item.id} className={`transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                          <td className="px-4 py-3 font-mono font-bold">{item.reel_number}</td>
                          
                          <td className="px-4 py-3 text-muted-foreground">{item.system_weight}</td>
                          <td className={`px-4 py-3 font-bold ${item.audited_weight !== item.system_weight && !isEditing ? 'text-blue-600 bg-blue-50/30' : ''}`}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={editValues.in} 
                                onChange={(e) => updateEditValue('in', e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-blue-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            ) : (
                              item.audited_weight
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-muted-foreground">{sysOut}</td>
                          <td className={`px-4 py-3 font-bold ${item.audited_out !== sysOut && !isEditing ? 'text-red-600 bg-red-50/30' : ''}`}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={editValues.out} 
                                onChange={(e) => updateEditValue('out', e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-red-600 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            ) : (
                              item.audited_out
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-muted-foreground">{item.system_balance}</td>
                          <td className={`px-4 py-3 font-bold ${item.audited_balance !== item.system_balance && !isEditing ? 'text-green-600 bg-green-50/30' : ''}`}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={editValues.bal} 
                                onChange={(e) => updateEditValue('bal', e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-green-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            ) : (
                              item.audited_balance
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-center font-bold">
                            {item.difference !== 0 ? (
                              <span className={item.difference > 0 ? 'text-green-600' : 'text-red-600'}>
                                {item.difference > 0 ? '+' : ''}{item.difference}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => saveEdit(item)}
                                  disabled={isSaving}
                                  className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                                  title="Save Correction"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={cancelEdit}
                                  disabled={isSaving}
                                  className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                  title="Cancel"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => startEdit(item)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit/Correct this entry"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {auditItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                          No items found in this audit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {audits.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {audits.map((audit: ReelAudit) => (
                    <div 
                      key={audit.id}
                      onClick={() => handleAuditClick(audit)}
                      className="bg-background border border-border hover:border-primary/50 hover:shadow-md rounded-xl p-4 cursor-pointer transition-all group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{audit.audit_date}</div>
                          <div className="text-xs text-muted-foreground mt-1 font-medium">By {audit.created_by}</div>
                          <div className="flex gap-4 mt-2">
                            <div className="text-xs font-bold text-blue-600">IN: {audit.total_in || 0} kg</div>
                            <div className="text-xs font-bold text-orange-600">OUT: {audit.total_out || 0} kg</div>
                            <div className={`text-xs font-bold ${(audit.total_difference || 0) > 0 ? 'text-green-600' : (audit.total_difference || 0) < 0 ? 'text-red-600' : 'text-foreground'}`}>
                              Net: {(audit.total_difference || 0) > 0 ? '+' : ''}{audit.total_difference || 0} kg
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handleDeleteAudit(e, audit.id)}
                          className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-full transition-colors group-hover:opacity-100 opacity-50"
                          title="Delete Audit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                    <Calendar className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No Audits Found</h3>
                  <p className="mt-1">Perform a reel audit to see history here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

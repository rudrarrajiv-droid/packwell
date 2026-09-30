import React, { useState, useEffect } from 'react';
import { X, Calendar, ChevronRight, ArrowLeft, Edit2, Save, XCircle } from 'lucide-react';
import { type FgAudit, type FgAuditItem, getFgAudits, getFgAuditItems, updateFgAuditItem } from '../../lib/supabase/fgAuditService';
import { useAuth } from '../../contexts/AuthContext';

interface FgAuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FgAuditHistoryModal({ isOpen, onClose }: FgAuditHistoryModalProps) {
  const { user } = useAuth();
  const [audits, setAudits] = useState<FgAudit[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<FgAudit | null>(null);
  const [auditItems, setAuditItems] = useState<FgAuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{reg: number, nm: number}>({reg: 0, nm: 0});
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
      const data = await getFgAudits();
      setAudits(data);
    } catch (err) {
      console.error('Failed to load FG audits', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuditClick = async (audit: FgAudit) => {
    setIsLoading(true);
    setSelectedAudit(audit);
    setEditingItemId(null);
    try {
      const items = await getFgAuditItems(audit.id);
      setAuditItems(items);
    } catch (err) {
      console.error('Failed to load FG audit items', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (item: FgAuditItem) => {
    setEditingItemId(item.id);
    setEditValues({
      reg: item.audited_regular_balance,
      nm: item.audited_non_moving_balance
    });
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  const updateEditValue = (field: 'reg' | 'nm', value: string) => {
    const numValue = Number(value) || 0;
    setEditValues(prev => ({
      ...prev,
      [field]: numValue
    }));
  };

  const saveEdit = async (item: FgAuditItem) => {
    try {
      setIsSaving(true);
      await updateFgAuditItem(
        item.id,
        editValues.reg,
        editValues.nm,
        user?.name || 'System'
      );
      // Reload items to show updated state
      const items = await getFgAuditItems(item.audit_id);
      setAuditItems(items);
      setEditingItemId(null);
    } catch (err) {
      console.error('Failed to update FG audit item:', err);
      alert('Failed to save correction.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        
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
                {selectedAudit ? `FG Audit Details: ${selectedAudit.audit_date}` : 'FG Audit History'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedAudit ? `Performed by ${selectedAudit.created_by}` : 'View and analyze previous finished goods audits'}
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
              <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-secondary/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-medium">Item Name</th>
                      <th className="px-4 py-3 font-medium text-blue-600 bg-blue-50/50" colSpan={2}>Regular Bal</th>
                      <th className="px-4 py-3 font-medium text-center">Reg Diff</th>
                      <th className="px-4 py-3 font-medium text-orange-600 bg-orange-50/50" colSpan={2}>Non-Moving Bal</th>
                      <th className="px-4 py-3 font-medium text-center">NM Diff</th>
                      <th className="px-4 py-3 font-medium text-center">Action</th>
                    </tr>
                    <tr className="border-t border-border/50 text-[10px]">
                      <th className="px-4 py-1"></th>
                      <th className="px-4 py-1 bg-blue-50/50">System</th>
                      <th className="px-4 py-1 bg-blue-50/50">Audited</th>
                      <th className="px-4 py-1"></th>
                      <th className="px-4 py-1 bg-orange-50/50">System</th>
                      <th className="px-4 py-1 bg-orange-50/50">Audited</th>
                      <th className="px-4 py-1"></th>
                      <th className="px-4 py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditItems.map((item: FgAuditItem) => {
                      const isEditing = editingItemId === item.id;
                      
                      return (
                        <tr key={item.id} className={`transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                          <td className="px-4 py-3 font-medium">{item.product_name}</td>
                          
                          <td className="px-4 py-3 text-muted-foreground">{item.system_regular_balance}</td>
                          <td className={`px-4 py-3 font-bold ${item.audited_regular_balance !== item.system_regular_balance && !isEditing ? 'text-blue-600 bg-blue-50/30' : ''}`}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={editValues.reg} 
                                onChange={(e) => updateEditValue('reg', e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-blue-700"
                              />
                            ) : (
                              item.audited_regular_balance
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-center font-bold">
                            {item.regular_difference !== 0 ? (
                              <span className={item.regular_difference > 0 ? 'text-green-600' : 'text-red-600'}>
                                {item.regular_difference > 0 ? '+' : ''}{item.regular_difference}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-muted-foreground">{item.system_non_moving_balance}</td>
                          <td className={`px-4 py-3 font-bold ${item.audited_non_moving_balance !== item.system_non_moving_balance && !isEditing ? 'text-orange-600 bg-orange-50/30' : ''}`}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                value={editValues.nm} 
                                onChange={(e) => updateEditValue('nm', e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-orange-600"
                              />
                            ) : (
                              item.audited_non_moving_balance
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-center font-bold">
                            {item.non_moving_difference !== 0 ? (
                              <span className={item.non_moving_difference > 0 ? 'text-green-600' : 'text-red-600'}>
                                {item.non_moving_difference > 0 ? '+' : ''}{item.non_moving_difference}
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
                  {audits.map((audit: FgAudit) => (
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
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                    <Calendar className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No Audits Found</h3>
                  <p className="mt-1">Perform a FG audit to see history here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

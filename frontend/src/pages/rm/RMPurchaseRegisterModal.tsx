import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, Calendar, Filter, Edit, Trash2, Loader2, ArrowDownToLine, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getRawMaterialTransactions, deleteRawMaterialTransaction, updateRawMaterialTransaction } from '../../lib/supabase/rmService';
import type { RawMaterial, RawMaterialTransaction } from '../../lib/types/models';

export default function RMPurchaseRegisterModal({
  isOpen,
  onClose,
  allRMs,
  onUpdate
}: {
  isOpen: boolean;
  onClose: () => void;
  allRMs: RawMaterial[];
  onUpdate: () => void;
}) {
  const { user } = useAuth();
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');

  const [editingTx, setEditingTx] = useState<RawMaterialTransaction | null>(null);
  const [editQty, setEditQty] = useState<number | ''>('');
  const [editRate, setEditRate] = useState<number | ''>('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRef, setEditRef] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey: ['rmPurchaseTransactions'],
    queryFn: () => getRawMaterialTransactions(),
    enabled: isOpen
  });

  const inTransactions = useMemo(() => {
    return transactions.filter(tx => tx.type === 'IN');
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return inTransactions.filter(tx => {
      const rm = allRMs.find(r => r.id === tx.rawMaterialId);
      const rmName = rm ? rm.name.toLowerCase() : '';
      const supplier = tx.supplierName ? tx.supplierName.toLowerCase() : '';
      
      const dateStr = tx.date ? String(tx.date) : '';
      const matchDate = dateFilter ? dateStr === dateFilter : true;
      let matchMonth = true;
      if (monthFilter) {
        matchMonth = dateStr.startsWith(monthFilter);
        if (!matchMonth) {
          // Fallback if browser doesn't support type="month" and user types MM-YYYY
          const parts = monthFilter.split(/[-/]/);
          if (parts.length === 2 && parts[0].length === 2 && parts[1].length === 4) {
            matchMonth = dateStr.startsWith(`${parts[1]}-${parts[0]}`);
          } else {
            matchMonth = dateStr.includes(monthFilter);
          }
        }
      }
      
      const matchParty = partyFilter ? supplier.includes(partyFilter.toLowerCase()) : true;
      const matchItem = itemFilter ? rmName.includes(itemFilter.toLowerCase()) : true;
      
      return matchDate && matchMonth && matchParty && matchItem;
    });
  }, [inTransactions, allRMs, dateFilter, monthFilter, partyFilter, itemFilter]);

  const handleDelete = async (txId: string) => {
    if (window.confirm('Are you sure you want to delete this purchase entry? This will adjust the current stock balance.')) {
      try {
        await deleteRawMaterialTransaction(txId, user?.name || 'System');
        refetch();
        onUpdate();
      } catch (err: any) {
        console.error(err);
        alert(err.message || 'Failed to delete transaction');
      }
    }
  };

  const handleEdit = (tx: RawMaterialTransaction) => {
    setEditingTx(tx);
    setEditQty(tx.quantity);
    setEditRate(tx.rate || '');
    setEditSupplier(tx.supplierName || '');
    setEditDate(tx.date);
    setEditRef(tx.referenceNo || '');
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await updateRawMaterialTransaction(editingTx.id!, {
        quantity: Number(editQty) || 0,
        rate: Number(editRate) || undefined,
        supplierName: editSupplier.trim() || undefined,
        date: editDate,
        referenceNo: editRef.trim() || undefined
      }, user?.name || 'System');
      
      setEditingTx(null);
      refetch();
      onUpdate();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-background w-full max-w-6xl rounded-2xl shadow-2xl border border-border flex flex-col h-[90vh] overflow-hidden">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/10 text-green-600 rounded-xl">
              <ArrowDownToLine className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Purchase IN Register</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                View, filter, edit, and delete all Raw Material inward purchases
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 border-b border-border bg-secondary/20 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Item Wise</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search Item..."
                value={itemFilter}
                onChange={e => setItemFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm w-40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Party Wise</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search Party..."
                value={partyFilter}
                onChange={e => setPartyFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm w-40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Single Date</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={dateFilter}
                onChange={e => { setDateFilter(e.target.value); setMonthFilter(''); }}
                className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm w-40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Full Month</label>
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="month"
                value={monthFilter}
                onChange={e => { setMonthFilter(e.target.value); setDateFilter(''); }}
                className="pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm w-40"
              />
            </div>
          </div>
          {(itemFilter || partyFilter || dateFilter || monthFilter) && (
            <button
              onClick={() => { setItemFilter(''); setPartyFilter(''); setDateFilter(''); setMonthFilter(''); }}
              className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded-lg font-medium transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Material Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Supplier/Party</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Ref/Invoice</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTransactions.map(tx => {
                  const rm = allRMs.find(r => r.id === tx.rawMaterialId);
                  const isEditing = editingTx?.id === tx.id;
                  
                  if (isEditing) {
                    return (
                      <tr key={tx.id} className="bg-primary/5">
                        <td className="px-4 py-2">
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-2 py-1 text-sm bg-background border rounded" />
                        </td>
                        <td className="px-4 py-2 font-semibold">{rm?.name || 'Unknown'}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={editSupplier} onChange={e => setEditSupplier(e.target.value)} className="w-full px-2 py-1 text-sm bg-background border rounded" placeholder="Supplier" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" value={editQty} onChange={e => setEditQty(e.target.value ? Number(e.target.value) : '')} className="w-full px-2 py-1 text-sm bg-background border rounded text-right font-bold text-green-600" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" value={editRate} onChange={e => setEditRate(e.target.value ? Number(e.target.value) : '')} className="w-full px-2 py-1 text-sm bg-background border rounded text-right" />
                        </td>
                        <td className="px-4 py-2 text-right font-bold">
                          ₹ {((Number(editQty)||0) * (Number(editRate)||0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editRef} onChange={e => setEditRef(e.target.value)} className="w-full px-2 py-1 text-sm bg-background border rounded" placeholder="Ref" />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={handleSaveEdit} disabled={isSubmitting} className="p-1.5 text-green-600 hover:bg-green-500/20 rounded">
                              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingTx(null)} className="p-1.5 text-muted-foreground hover:bg-secondary rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">{tx.date}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{rm?.name || 'Unknown'}</td>
                      <td className="px-4 py-3">{tx.supplierName || '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600 font-mono">+{tx.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono">₹ {tx.rate || 0}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary font-mono">
                        ₹ {((tx.rate || 0) * tx.quantity).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{tx.referenceNo || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => handleEdit(tx)} className="p-1.5 text-blue-600 hover:bg-blue-500/15 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(tx.id!)} className="p-1.5 text-red-600 hover:bg-red-500/15 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No purchase transactions found matching the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        {error && (
          <div className="p-4 bg-red-500/10 text-red-500 text-sm border-t border-red-500/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

      </div>
    </div>
  );
}

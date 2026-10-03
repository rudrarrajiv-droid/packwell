import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle, Plus, Trash2, ArrowDownToLine, Search, Check, Sparkles, Copy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { addRawMaterialTransaction, createRawMaterial } from '../../lib/supabase/rmService';
import type { RawMaterial } from '../../lib/types/models';

interface BulkItem {
  id: string; // temp id for UI
  date: string;
  supplierName: string;
  referenceNo: string;
  materialQuery: string;
  selectedMaterialId: string | null;
  quantity: number | '';
  rate: number | '';
  isDropdownOpen: boolean;
}

export default function RMBulkPurchaseInModal({
  isOpen,
  onClose,
  onSuccess,
  allRMs = []
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  allRMs: RawMaterial[];
}) {
  const { user } = useAuth();
  
  const [items, setItems] = useState<BulkItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (isOpen) {
      setItems([{
        id: Math.random().toString(36).substr(2, 9),
        date: getTodayDate(),
        supplierName: '',
        referenceNo: '',
        materialQuery: '',
        selectedMaterialId: null,
        quantity: '',
        rate: '',
        isDropdownOpen: false
      }]);
      setError(null);
    }
  }, [isOpen]);

  const handleAddItem = () => {
    // get previous row's date and supplier to prefill
    const lastItem = items[items.length - 1];
    setItems([...items, {
      id: Math.random().toString(36).substr(2, 9),
      date: lastItem ? lastItem.date : getTodayDate(),
      supplierName: lastItem ? lastItem.supplierName : '',
      referenceNo: lastItem ? lastItem.referenceNo : '',
      materialQuery: '',
      selectedMaterialId: null,
      quantity: '',
      rate: '',
      isDropdownOpen: false
    }]);
  };

  const handleDuplicateRow = (index: number) => {
    const itemToClone = items[index];
    const newItems = [...items];
    newItems.splice(index + 1, 0, {
      ...itemToClone,
      id: Math.random().toString(36).substr(2, 9),
      quantity: '',
      isDropdownOpen: false
    });
    setItems(newItems);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof BulkItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (items.length === 0) {
      setError('Please add at least one item.');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.date) {
        setError(`Row ${i + 1}: Please enter a date.`);
        return;
      }
      if (!item.materialQuery.trim()) {
        setError(`Row ${i + 1}: Please enter or select a raw material name.`);
        return;
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        setError(`Row ${i + 1}: Please enter a valid purchase quantity (greater than 0).`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      for (const item of items) {
        let targetRMId = item.selectedMaterialId;
        const parsedRate = item.rate !== '' ? Number(item.rate) : 0;
        const parsedQty = Number(item.quantity);
        const queryTrimmed = item.materialQuery.trim();

        const exactMatch = allRMs.find(rm => rm.name.toLowerCase().trim() === queryTrimmed.toLowerCase());

        if (!targetRMId && exactMatch) {
          targetRMId = exactMatch.id || null;
        }

        if (!targetRMId) {
          const newRMId = await createRawMaterial({
            name: queryTrimmed,
            openingQty: 0,
            rate: parsedRate,
          }, user?.name || 'System');
          targetRMId = newRMId;
        }

        await addRawMaterialTransaction({
          rawMaterialId: targetRMId!,
          type: 'IN',
          quantity: parsedQty,
          date: item.date,
          referenceNo: item.referenceNo.trim() || undefined,
          rate: parsedRate > 0 ? parsedRate : undefined,
          supplierName: item.supplierName.trim() || undefined,
          performedBy: user?.name || 'System'
        }, user?.name || 'System');
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process bulk purchase IN');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-background w-full max-w-full md:max-w-7xl rounded-2xl shadow-2xl border border-border flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/10 text-green-600 rounded-xl">
              <ArrowDownToLine className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Advanced Bulk Purchase IN
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Record multiple purchases across different dates and suppliers at once
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-sm shrink-0">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <div className="flex-1 overflow-auto p-6">
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[130px]">Date <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[160px]">Supplier/Party</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[130px]">Invoice/Ref</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[200px]">Item Name <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Qty <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Rate (₹)</th>
                    <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Amount</th>
                    <th className="px-3 py-2 text-center font-semibold min-w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, index) => {
                    const matchedRMs = item.materialQuery.trim() 
                      ? allRMs.filter(rm => rm.name.toLowerCase().includes(item.materialQuery.toLowerCase().trim()))
                      : allRMs;
                    
                    const exactMatch = allRMs.find(rm => rm.name.toLowerCase().trim() === item.materialQuery.toLowerCase().trim());
                    const isNewMaterial = item.materialQuery.trim().length > 0 && !exactMatch && !item.selectedMaterialId;
                    
                    const rowAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);

                    return (
                      <tr key={item.id} className="group hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground font-mono">{index + 1}</td>
                        
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            required
                            value={item.date}
                            onChange={(e) => updateItem(item.id, 'date', e.target.value)}
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.supplierName}
                            onChange={(e) => updateItem(item.id, 'supplierName', e.target.value)}
                            placeholder="Supplier"
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.referenceNo}
                            onChange={(e) => updateItem(item.id, 'referenceNo', e.target.value)}
                            placeholder="Invoice/Bill"
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </td>

                        <td className="px-3 py-2 relative">
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={item.materialQuery}
                              onFocus={() => updateItem(item.id, 'isDropdownOpen', true)}
                              onBlur={() => setTimeout(() => updateItem(item.id, 'isDropdownOpen', false), 200)}
                              onChange={(e) => {
                                updateItem(item.id, 'materialQuery', e.target.value);
                                updateItem(item.id, 'selectedMaterialId', null);
                                updateItem(item.id, 'isDropdownOpen', true);
                              }}
                              placeholder="Search item..."
                              className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary pr-6"
                            />
                            <Search className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          
                          {item.isDropdownOpen && item.materialQuery.trim() && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-48 overflow-auto py-1">
                              {matchedRMs.map((rm) => (
                                <button
                                  key={rm.id}
                                  type="button"
                                  onMouseDown={() => {
                                    updateItem(item.id, 'selectedMaterialId', rm.id);
                                    updateItem(item.id, 'materialQuery', rm.name);
                                    if (rm.rate && !item.rate) {
                                      updateItem(item.id, 'rate', rm.rate);
                                    }
                                    updateItem(item.id, 'isDropdownOpen', false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between transition-colors"
                                >
                                  <div>
                                    <span className="font-semibold text-foreground">{rm.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">(Rate: ₹{rm.rate})</span>
                                  </div>
                                  {item.selectedMaterialId === rm.id && <Check className="w-4 h-4 text-primary" />}
                                </button>
                              ))}
                              {isNewMaterial && (
                                <div className="px-3 py-2 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2 border-t border-border">
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span>Auto-create: <b>"{item.materialQuery.trim()}"</b></span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0"
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-right font-bold text-green-600 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => updateItem(item.id, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-right focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </td>

                        <td className="px-3 py-2 text-right font-bold text-primary bg-secondary/10 text-xs">
                          ₹ {rowAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>

                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(index)}
                              title="Duplicate Row"
                              className="p-1 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 rounded transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={items.length === 1}
                              title="Remove Row"
                              className="p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 rounded transition-colors disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-3 bg-secondary/20 border-t border-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add New Row
                </button>

                <div className="text-sm font-bold text-foreground">
                  Total Grand Amount: <span className="text-primary text-lg ml-2">₹ {items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0) * (Number(curr.rate) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-card shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              Save All Purchase Entries
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

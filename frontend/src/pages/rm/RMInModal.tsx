import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle, Sparkles, ArrowDownToLine, Check, Search, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { addRawMaterialTransaction, createRawMaterial } from '../../lib/supabase/rmService';
import type { RawMaterial } from '../../lib/types/models';

export default function RMInModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  selectedRM,
  allRMs = []
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  selectedRM: RawMaterial | null;
  allRMs?: RawMaterial[];
}) {
  const { user } = useAuth();
  
  // Selection / Material Name State
  const [materialQuery, setMaterialQuery] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [remarks, setRemarks] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset when modal opens or selectedRM changes
  useEffect(() => {
    if (isOpen) {
      if (selectedRM) {
        setMaterialQuery(selectedRM.name);
        setSelectedMaterialId(selectedRM.id || null);
        setRate(selectedRM.rate || '');
      } else {
        setMaterialQuery('');
        setSelectedMaterialId(null);
        setRate('');
      }
      setQuantity('');
      setReferenceNo('');
      setSupplierName('');
      setRemarks('');
      setError(null);
      setIsDropdownOpen(false);
    }
  }, [isOpen, selectedRM]);

  const matchedRMs = useMemo(() => {
    if (!materialQuery.trim()) return allRMs;
    return allRMs.filter(rm => 
      rm.name.toLowerCase().includes(materialQuery.toLowerCase().trim())
    );
  }, [allRMs, materialQuery]);

  const exactMatch = useMemo(() => {
    return allRMs.find(rm => 
      rm.name.toLowerCase().trim() === materialQuery.toLowerCase().trim()
    );
  }, [allRMs, materialQuery]);

  const isNewMaterial = materialQuery.trim().length > 0 && !exactMatch && !selectedMaterialId;

  const handleSelectRM = (rm: RawMaterial) => {
    setSelectedMaterialId(rm.id || null);
    setMaterialQuery(rm.name);
    if (rm.rate && !rate) {
      setRate(rm.rate);
    }
    setIsDropdownOpen(false);
  };

  const totalValue = useMemo(() => {
    const q = Number(quantity) || 0;
    const r = Number(rate) || 0;
    return q * r;
  }, [quantity, rate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialQuery.trim()) {
      setError('Please enter or select a raw material name.');
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      setError('Please enter a valid purchase quantity (greater than 0).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let targetRMId = selectedMaterialId;
      const parsedRate = rate !== '' ? Number(rate) : 0;
      const parsedQty = Number(quantity);

      // If user typed an exact matching name or selected from dropdown
      if (!targetRMId && exactMatch) {
        targetRMId = exactMatch.id || null;
      }

      // If it's a completely NEW raw material, auto-create it first!
      if (!targetRMId) {
        const newRMId = await createRawMaterial({
          name: materialQuery.trim(),
          openingQty: 0,
          rate: parsedRate,
        }, user?.name || 'System');
        targetRMId = newRMId;
      }

      // Add the Inward Transaction
      await addRawMaterialTransaction({
        rawMaterialId: targetRMId!,
        type: 'IN',
        quantity: parsedQty,
        date,
        referenceNo: referenceNo.trim() || undefined,
        rate: parsedRate > 0 ? parsedRate : undefined,
        supplierName: supplierName.trim() || undefined,
        remarks: remarks.trim() || undefined,
        performedBy: user?.name || 'System'
      }, user?.name || 'System');
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to add purchase IN transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-background w-full max-w-lg rounded-2xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/10 text-green-600 rounded-xl">
              <ArrowDownToLine className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {selectedRM ? `Purchase IN: ${selectedRM.name}` : 'Purchase / Material IN Entry'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Record purchase stock inward with auto-search or auto-create new material
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Material Name with Autocomplete / Search / Auto-create */}
          <div className="relative">
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Raw Material Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={materialQuery}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setMaterialQuery(e.target.value);
                  setSelectedMaterialId(null);
                  setIsDropdownOpen(true);
                }}
                placeholder="Search existing or type new material name..."
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="w-4 h-4" />
              </div>
            </div>

            {/* Dropdown search results */}
            {isDropdownOpen && materialQuery.trim() && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-48 overflow-auto py-1">
                {matchedRMs.map((rm) => (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => handleSelectRM(rm)}
                    className="w-full text-left px-3.5 py-2 hover:bg-muted text-sm flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-foreground">{rm.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        (Stock: {rm.closingBalance} | Rate: ₹{rm.rate})
                      </span>
                    </div>
                    {selectedMaterialId === rm.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                ))}

                {isNewMaterial && (
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(false)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-primary/10 text-sm flex items-center gap-2 text-primary font-medium border-t border-border"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Create new raw material: <b>"{materialQuery.trim()}"</b></span>
                  </button>
                )}
              </div>
            )}

            {/* Auto Create Notice */}
            {isNewMaterial && (
              <div className="mt-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span><b>"{materialQuery.trim()}"</b> is a new material and will be auto-created automatically!</span>
              </div>
            )}
          </div>

          {/* Date & Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Purchase Qty (IN) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary/20 focus:border-primary text-green-600"
              />
            </div>
          </div>

          {/* Rate & Total Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Purchase Rate (₹ per unit)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-right focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Total Purchase Value
              </label>
              <div className="w-full px-3 py-2 bg-secondary/40 border border-border rounded-xl text-sm font-bold text-right text-primary">
                ₹ {totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Reference / Invoice / Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Invoice / Bill No.
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. INV-2026/089"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Supplier / Vendor Name
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. ABC Chemical Industries"
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Remarks / Notes (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Batch #45, Delivered at Main Warehouse"
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-3">
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
              Submit Purchase IN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

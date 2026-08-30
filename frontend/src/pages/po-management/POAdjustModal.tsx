import React, { useState, useMemo } from 'react';
import { X, Scale, AlertCircle, CheckCircle2, ArrowRight, Loader2, Info, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { adjustPurchaseOrderStock, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';

interface POAdjustModalProps {
  po: PurchaseOrder;
  onClose: () => void;
  onSuccess: () => void;
}

export default function POAdjustModal({ po, onClose, onSuccess }: POAdjustModalProps) {
  const { user } = useAuth();
  
  const currentBalance = useMemo(() => {
    return po.orderQty + (po.inQty || 0) - (po.outQty || 0);
  }, [po]);

  const [targetBalance, setTargetBalance] = useState<number | ''>(0); // Default to 0 / NIL
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('NIL PO / Customer Balance Closed');
  const [customRemarks, setCustomRemarks] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const numericTarget = targetBalance === '' ? 0 : Number(targetBalance);
  const difference = numericTarget - currentBalance;

  const quickReasons = [
    'NIL PO / Customer Balance Closed',
    'Customer Order Cancelled / NIL',
    'Short Closed by Customer',
    'Physical Stock Audit Count',
    'Wastage / Return Adjustment',
    'Quantity Revision'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetBalance === '' || isNaN(Number(targetBalance)) || Number(targetBalance) < 0) {
      setError('Please enter a valid non-negative target balance.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const fullRemarks = customRemarks.trim() 
        ? `${reason} (${customRemarks.trim()})` 
        : reason;

      await adjustPurchaseOrderStock({
        poId: po.id!,
        targetBalance: numericTarget,
        date,
        remarks: fullRemarks,
        user: user?.name || 'System',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error adjusting PO balance:', err);
      setError(err.message || 'Failed to adjust PO balance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-background w-full max-w-lg rounded-2xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Adjust PO Balance / Make NIL</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                PO No: <b>{po.poNo}</b> • {po.customerName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Current Master PO Stats */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Item Name</span>
                <span className="text-sm font-bold text-foreground truncate block max-w-[280px]" title={po.productName}>
                  {po.productName}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Rate</span>
                <span className="text-sm font-bold text-foreground">₹{po.rate.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/60 text-center">
              <div className="bg-background p-2 rounded-lg border border-border/50">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block">Opening</span>
                <span className="text-xs font-bold text-foreground">{po.orderQty}</span>
              </div>
              <div className="bg-green-500/5 p-2 rounded-lg border border-green-500/20">
                <span className="text-[9px] uppercase font-bold text-green-600 block">Total IN</span>
                <span className="text-xs font-bold text-green-600">+{po.inQty || 0}</span>
              </div>
              <div className="bg-blue-500/5 p-2 rounded-lg border border-blue-500/20">
                <span className="text-[9px] uppercase font-bold text-blue-600 block">Total OUT</span>
                <span className="text-xs font-bold text-blue-600">-{po.outQty || 0}</span>
              </div>
              <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/30">
                <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-300 block">Current Bal</span>
                <span className="text-xs font-black text-amber-800 dark:text-amber-200">{currentBalance}</span>
              </div>
            </div>
          </div>

          {/* Adjustment Inputs & Quick Buttons */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Target Closing Balance <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setTargetBalance(0);
                    setReason('NIL PO / Customer Balance Closed');
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-2xs flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Make NIL (0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetBalance(po.orderQty);
                    setReason('Quantity Revision / Reset');
                  }}
                  className="px-2.5 py-1 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg text-xs font-medium transition-colors border border-border"
                >
                  Reset ({po.orderQty})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                  Adjustment Date <span className="text-red-500">*</span>
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
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                  Target Balance
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={targetBalance}
                  onChange={(e) => setTargetBalance(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-background border-2 border-primary/40 rounded-xl text-sm font-black text-right focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Live Impact Preview */}
            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Current: <b>{currentBalance}</b></span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-bold text-foreground">Target: <b>{numericTarget}</b></span>
              </div>

              <div>
                {difference < 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-600 border border-red-500/20 rounded-full text-xs font-bold">
                    {difference} OUT Adjustment
                  </span>
                ) : difference > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-600 border border-green-500/20 rounded-full text-xs font-bold">
                    +{difference} IN Adjustment
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded-full text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> No Balance Change
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Reason / Remarks */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Adjustment Reason
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickReasons.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors font-medium ${
                    reason === r
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold'
                      : 'bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customRemarks}
              onChange={(e) => setCustomRemarks(e.target.value)}
              placeholder="Additional notes or reference (optional)..."
              className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              This will automatically log an <b>{difference < 0 ? 'OUT' : 'IN'} transaction</b> in the PO Ledger and set the PO closing balance to <b>{numericTarget}</b>.
            </p>
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
              disabled={isSubmitting || targetBalance === ''}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              Apply PO Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

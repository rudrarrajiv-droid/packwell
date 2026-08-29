import React, { useState, useEffect } from 'react';
import { X, Save, Sliders, DollarSign, Package, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { adjustFinishGoodStockAndRate, type FinishGoodAdjustmentPayload } from '../../lib/supabase/finishGoodService';
import { useAuth } from '../../contexts/AuthContext';

interface FinishGoodAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: any; // Current finish good record
}

export default function FinishGoodAdjustmentModal({
  isOpen,
  onClose,
  onSuccess,
  item
}: FinishGoodAdjustmentModalProps) {
  const { user } = useAuth();

  const [rate, setRate] = useState<number | ''>('');
  const [closingBalance, setClosingBalance] = useState<number | ''>('');
  const [nonMovingBalance, setNonMovingBalance] = useState<number | ''>('');
  const [openingQty, setOpeningQty] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (item) {
      setRate(item.rate ?? 0);
      setClosingBalance(item.closingBalance ?? 0);
      setNonMovingBalance(item.nonMovingBalance ?? 0);
      setOpeningQty(item.openingQty ?? 0);
      setRemarks('Physical Stock / Rate Adjustment');
      setErrorMsg('');
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const oldRate = Number(item.rate) || 0;
  const oldClosing = Number(item.closingBalance) || 0;
  const oldNonMoving = Number(item.nonMovingBalance) || 0;
  const oldOpening = Number(item.openingQty) || 0;

  const currentClosingNum = Number(closingBalance) || 0;
  const closingDiff = currentClosingNum - oldClosing;

  const currentRateNum = Number(rate) || 0;
  const rateChanged = currentRateNum !== oldRate;

  const quickReasons = [
    'Physical Stock Verification',
    'Rate Revision',
    'Damage / Rejection Correction',
    'Missing Production / Inward Entry',
    'Dispatch Correction'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const payload: FinishGoodAdjustmentPayload = {
        finishGoodId: item.id || item.firestore_document_id,
        rate: Number(rate) || 0,
        closingBalance: Number(closingBalance) || 0,
        nonMovingBalance: Number(nonMovingBalance) || 0,
        openingQty: Number(openingQty) || 0,
        remarks: remarks.trim() || 'Stock / Rate Adjustment'
      };

      await adjustFinishGoodStockAndRate(payload, user?.name || 'System');

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving FG adjustment:', err);
      setErrorMsg(err?.message || 'Failed to save adjustment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full text-sm rounded-lg border border-input px-3.5 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-semibold";
  const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Finish Good Rate & Qty Adjustment
              </h2>
              <p className="text-xs text-muted-foreground">
                Update selling rate and adjust regular / non-moving stock balance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Item Banner */}
          <div className="p-4 bg-secondary/40 border border-border rounded-xl">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-0.5">
              {item.customerName}
            </div>
            <div className="text-base font-black text-foreground">
              {item.productName}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase">Current Regular</div>
                <div className="text-sm font-black text-blue-600 dark:text-blue-400">{oldClosing.toLocaleString()} pcs</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase">Non-Moving</div>
                <div className="text-sm font-black text-orange-600 dark:text-orange-400">{oldNonMoving.toLocaleString()} pcs</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase">Current Rate</div>
                <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">₹{oldRate.toFixed(3)}</div>
              </div>
            </div>
          </div>

          {/* Rate Update Card */}
          <div className="p-4 bg-card border border-border rounded-xl space-y-2">
            <label className={labelClass}>
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                Selling / Inventory Rate (₹ per Pc)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                required
                value={rate}
                onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputClass} pl-8 text-base`}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
            </div>
            {rateChanged && (
              <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Rate will be updated from ₹{oldRate} to ₹{currentRateNum}
              </div>
            )}
          </div>

          {/* Stock Quantities Card */}
          <div className="p-4 bg-card border border-border rounded-xl space-y-4">
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Package className="w-4 h-4 text-primary" />
              Stock Quantities Adjustment
            </div>

            {/* Regular Closing Balance */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Regular Closing Balance (Pcs)
                </label>
                <div className="flex items-center gap-2">
                  {oldClosing > 0 && currentClosingNum !== 0 && (
                    <button
                      type="button"
                      onClick={() => setClosingBalance(0)}
                      className="text-[11px] font-bold px-2 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded border border-red-200 dark:border-red-800 hover:bg-red-200 transition-colors"
                    >
                      Make NIL (0)
                    </button>
                  )}
                  {closingDiff !== 0 && (
                    <span className={`text-xs font-bold flex items-center gap-1 ${closingDiff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {closingDiff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {closingDiff > 0 ? `+${closingDiff.toLocaleString()}` : `${closingDiff.toLocaleString()}`} pcs
                    </span>
                  )}
                </div>
              </div>
              <input
                type="number"
                step="any"
                required
                value={closingBalance}
                onChange={e => setClosingBalance(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputClass} text-base`}
              />

              {/* Clear IN/OUT Impact explanation */}
              {closingDiff < 0 && (
                <div className="mt-2 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 font-medium flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 shrink-0 text-red-600" />
                  <span>
                    <strong>Item Short (OUT):</strong> {Math.abs(closingDiff).toLocaleString()} Pcs will be added to <strong>Total OUT</strong> to adjust closing balance to {currentClosingNum.toLocaleString()} Pcs.
                  </span>
                </div>
              )}

              {closingDiff > 0 && (
                <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>Item Excess (IN):</strong> {closingDiff.toLocaleString()} Pcs will be added to <strong>Total IN</strong> to adjust closing balance to {currentClosingNum.toLocaleString()} Pcs.
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              {/* Non-Moving Balance */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Non-Moving Stock (Pcs)
                </label>
                <input
                  type="number"
                  step="any"
                  value={nonMovingBalance}
                  onChange={e => setNonMovingBalance(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              {/* Opening Qty */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Opening Qty (Pcs)
                </label>
                <input
                  type="number"
                  step="any"
                  value={openingQty}
                  onChange={e => setOpeningQty(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Reason / Remarks */}
          <div>
            <label className={labelClass}>Reason / Remarks for Adjustment</label>
            <input
              type="text"
              required
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Physical Stock Verification / Correction"
              className={inputClass}
            />

            {/* Quick Reason Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickReasons.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRemarks(r)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md border border-border transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-input hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg shadow hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Saving...</span>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Adjustment</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

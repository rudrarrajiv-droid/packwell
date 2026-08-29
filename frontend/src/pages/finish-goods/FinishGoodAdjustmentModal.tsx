import React, { useState, useEffect } from 'react';
import { X, Save, Sliders, DollarSign, Package, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, ArrowRightLeft, ArrowRight } from 'lucide-react';
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

  const [activeTab, setActiveTab] = useState<'ADJUST' | 'TRANSFER'>('ADJUST');

  // Adjust Form State
  const [rate, setRate] = useState<number | ''>('');
  const [closingBalance, setClosingBalance] = useState<number | ''>('');
  const [nonMovingBalance, setNonMovingBalance] = useState<number | ''>('');
  const [openingQty, setOpeningQty] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  // Transfer Form State
  const [transferDirection, setTransferDirection] = useState<'REGULAR_TO_NON_MOVING' | 'NON_MOVING_TO_REGULAR'>('REGULAR_TO_NON_MOVING');
  const [transferQty, setTransferQty] = useState<number | ''>('');
  const [transferRemarks, setTransferRemarks] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (item) {
      setRate(item.rate ?? 0);
      setClosingBalance(item.closingBalance ?? 0);
      setNonMovingBalance(item.nonMovingBalance ?? 0);
      setOpeningQty(item.openingQty ?? 0);
      setRemarks('Physical Stock / Rate Adjustment');

      setTransferDirection('REGULAR_TO_NON_MOVING');
      setTransferQty('');
      setTransferRemarks('Stock transfer to non-moving');
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

  // Transfer Calculations
  const tQtyNum = Number(transferQty) || 0;
  const maxAvailableForTransfer = transferDirection === 'REGULAR_TO_NON_MOVING' ? Math.max(0, oldClosing) : Math.max(0, oldNonMoving);
  
  const simulatedClosingAfterTransfer = transferDirection === 'REGULAR_TO_NON_MOVING'
    ? oldClosing - tQtyNum
    : oldClosing + tQtyNum;

  const simulatedNonMovingAfterTransfer = transferDirection === 'REGULAR_TO_NON_MOVING'
    ? oldNonMoving + tQtyNum
    : oldNonMoving - tQtyNum;

  const quickReasons = [
    'Physical Stock Verification',
    'Rate Revision',
    'Damage / Rejection Correction',
    'Missing Production / Inward Entry',
    'Dispatch Correction'
  ];

  const quickTransferReasons = [
    'Damaged in warehouse / Rejection',
    'Customer return moved to non-moving',
    'Slow-moving stock classification',
    'Rectified & passed back to regular',
    'Physical re-sorting completed'
  ];

  const handleSubmitAdjust = async (e: React.FormEvent) => {
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

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tQtyNum <= 0) {
      setErrorMsg('Please enter a valid transfer quantity (> 0)');
      return;
    }

    if (tQtyNum > maxAvailableForTransfer) {
      setErrorMsg(`Transfer quantity cannot exceed available balance (${maxAvailableForTransfer.toLocaleString()} Pcs)`);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const finalRemarks = transferRemarks.trim() || (
        transferDirection === 'REGULAR_TO_NON_MOVING'
          ? `Transferred ${tQtyNum.toLocaleString()} pcs from Regular to Non-Moving`
          : `Transferred ${tQtyNum.toLocaleString()} pcs from Non-Moving to Regular`
      );

      const payload: FinishGoodAdjustmentPayload = {
        finishGoodId: item.id || item.firestore_document_id,
        rate: oldRate,
        closingBalance: simulatedClosingAfterTransfer,
        nonMovingBalance: simulatedNonMovingAfterTransfer,
        openingQty: oldOpening,
        remarks: finalRemarks
      };

      await adjustFinishGoodStockAndRate(payload, user?.name || 'System');

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving stock transfer:', err);
      setErrorMsg(err?.message || 'Failed to transfer stock.');
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
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Finish Goods Stock Control & Adjustment
              </h2>
              <p className="text-xs text-muted-foreground">
                Adjust stock, rate or transfer between Regular and Non-Moving
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-secondary/20 shrink-0">
          <button
            type="button"
            onClick={() => { setActiveTab('ADJUST'); setErrorMsg(''); }}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'ADJUST'
                ? 'border-primary text-primary bg-card'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Rate & Qty Adjustment</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('TRANSFER'); setErrorMsg(''); }}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'TRANSFER'
                ? 'border-primary text-primary bg-card'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Transfer Regular ⇄ Non-Moving</span>
          </button>
        </div>

        {/* Item Banner */}
        <div className="px-6 pt-4 shrink-0">
          <div className="p-3.5 bg-secondary/40 border border-border rounded-xl">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-0.5">
              {item.customerName}
            </div>
            <div className="text-sm font-black text-foreground">
              {item.productName}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
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
        </div>

        {/* Form Body */}
        {activeTab === 'ADJUST' ? (
          <form onSubmit={handleSubmitAdjust} className="flex-1 overflow-y-auto p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-red-600 dark:text-red-400">
                {errorMsg}
              </div>
            )}

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

            {/* Footer buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-input hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
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
          </form>
        ) : (
          /* Transfer Form */
          <form onSubmit={handleSubmitTransfer} className="flex-1 overflow-y-auto p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-red-600 dark:text-red-400">
                {errorMsg}
              </div>
            )}

            {/* Direction Selection */}
            <div>
              <label className={labelClass}>Select Transfer Direction</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTransferDirection('REGULAR_TO_NON_MOVING');
                    setTransferQty('');
                    setErrorMsg('');
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    transferDirection === 'REGULAR_TO_NON_MOVING'
                      ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-600/20'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-foreground mb-1">
                    <span>Regular ➔ Non-Moving</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Avail: {oldClosing.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Move rejected, slow-moving, or defective goods to Non-Moving stock
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTransferDirection('NON_MOVING_TO_REGULAR');
                    setTransferQty('');
                    setErrorMsg('');
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    transferDirection === 'NON_MOVING_TO_REGULAR'
                      ? 'border-orange-600 bg-orange-50/50 dark:bg-orange-950/30 ring-2 ring-orange-600/20'
                      : 'border-border bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-foreground mb-1">
                    <span>Non-Moving ➔ Regular</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
                      Avail: {oldNonMoving.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Move rectified, sorted, or approved goods back into Regular stock
                  </p>
                </button>
              </div>
            </div>

            {/* Transfer Quantity Card */}
            <div className="p-4 bg-card border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className={labelClass}>
                  Transfer Quantity (Pcs)
                </label>
                <span className="text-xs font-bold text-muted-foreground">
                  Max Available: <strong className="text-foreground">{maxAvailableForTransfer.toLocaleString()} Pcs</strong>
                </span>
              </div>

              <input
                type="number"
                step="any"
                min="1"
                max={maxAvailableForTransfer}
                required
                value={transferQty}
                onChange={e => setTransferQty(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={`Enter quantity (max ${maxAvailableForTransfer})`}
                className={`${inputClass} text-base`}
              />

              {/* Quick Chips */}
              {maxAvailableForTransfer > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setTransferQty(maxAvailableForTransfer)}
                    className="px-2.5 py-1 text-[11px] font-bold bg-primary/10 hover:bg-primary/20 text-primary rounded-md border border-primary/20 transition-colors"
                  >
                    Transfer All (100%)
                  </button>
                  {maxAvailableForTransfer >= 2 && (
                    <button
                      type="button"
                      onClick={() => setTransferQty(Math.floor(maxAvailableForTransfer / 2))}
                      className="px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md border border-border transition-colors"
                    >
                      50% ({Math.floor(maxAvailableForTransfer / 2).toLocaleString()})
                    </button>
                  )}
                  {maxAvailableForTransfer >= 100 && (
                    <button
                      type="button"
                      onClick={() => setTransferQty(100)}
                      className="px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md border border-border transition-colors"
                    >
                      100 Pcs
                    </button>
                  )}
                  {maxAvailableForTransfer >= 500 && (
                    <button
                      type="button"
                      onClick={() => setTransferQty(500)}
                      className="px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md border border-border transition-colors"
                    >
                      500 Pcs
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Live Impact Preview */}
            {tQtyNum > 0 && (
              <div className="p-4 bg-muted/40 border border-border rounded-xl">
                <div className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                  <ArrowRight className="w-4 h-4 text-primary" />
                  Stock Balances After Transfer
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Regular Balance</div>
                    <div className="text-xs font-semibold text-muted-foreground line-through">{oldClosing.toLocaleString()}</div>
                    <div className="text-base font-black text-blue-600 dark:text-blue-400">{simulatedClosingAfterTransfer.toLocaleString()} Pcs</div>
                  </div>
                  <div className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Non-Moving Balance</div>
                    <div className="text-xs font-semibold text-muted-foreground line-through">{oldNonMoving.toLocaleString()}</div>
                    <div className="text-base font-black text-orange-600 dark:text-orange-400">{simulatedNonMovingAfterTransfer.toLocaleString()} Pcs</div>
                  </div>
                </div>
              </div>
            )}

            {/* Transfer Reason */}
            <div>
              <label className={labelClass}>Reason / Remarks for Transfer</label>
              <input
                type="text"
                required
                value={transferRemarks}
                onChange={e => setTransferRemarks(e.target.value)}
                placeholder="e.g. Moved defective boxes to non-moving"
                className={inputClass}
              />

              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickTransferReasons.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTransferRemarks(r)}
                    className="px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md border border-border transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-input hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || tQtyNum <= 0 || tQtyNum > maxAvailableForTransfer}
                className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg shadow hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Transferring...</span>
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Execute Stock Transfer</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}

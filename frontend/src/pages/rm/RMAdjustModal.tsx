import React, { useState, useEffect, useMemo } from 'react';
import { X, Scale, AlertCircle, CheckCircle2, ArrowRight, Loader2, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { adjustRawMaterialStock } from '../../lib/supabase/rmService';
import type { RawMaterial } from '../../lib/types/models';

export default function RMAdjustModal({
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
  const [currentRMId, setCurrentRMId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [auditedStock, setAuditedStock] = useState<number | ''>('');
  const [reason, setReason] = useState('Physical Stock Audit Count');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRM) {
      setCurrentRMId(selectedRM.id || '');
      setAuditedStock(selectedRM.closingBalance);
    } else if (allRMs.length > 0 && !currentRMId) {
      setCurrentRMId(allRMs[0].id || '');
      setAuditedStock(allRMs[0].closingBalance);
    }
  }, [selectedRM, allRMs, isOpen]);

  const activeRM = useMemo(() => {
    return allRMs.find(r => r.id === currentRMId) || selectedRM;
  }, [allRMs, currentRMId, selectedRM]);

  const currentSystemStock = Number(activeRM?.closingBalance) || 0;
  const targetStock = auditedStock === '' ? currentSystemStock : Number(auditedStock);
  const difference = targetStock - currentSystemStock;

  if (!isOpen || !activeRM) return null;

  const quickReasons = [
    'Physical Stock Audit Count',
    'Damage / Wastage Found',
    'Weighing / Scale Calibration Correction',
    'Annual / Monthly Inventory Audit',
    'Initial Balance Correction'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (auditedStock === '' || isNaN(Number(auditedStock)) || Number(auditedStock) < 0) {
      setError('Please enter a valid non-negative audited physical stock quantity.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const fullReason = remarks.trim() ? `${reason} (${remarks.trim()})` : reason;
      await adjustRawMaterialStock({
        rawMaterialId: activeRM.id!,
        auditedStock: Number(auditedStock),
        reason: fullReason,
        date,
        user: user?.name || 'System',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to adjust raw material stock');
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
            <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Stock Audit & Adjustment</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Match system closing stock with physical audited count
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

          {/* Select Material if multiple available */}
          {allRMs.length > 1 && !selectedRM && (
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Select Raw Material <span className="text-red-500">*</span>
              </label>
              <select
                value={currentRMId}
                onChange={(e) => {
                  setCurrentRMId(e.target.value);
                  const selected = allRMs.find(r => r.id === e.target.value);
                  if (selected) setAuditedStock(selected.closingBalance);
                }}
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {allRMs.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} (Current: {r.closingBalance})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Material Highlight Card */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Raw Material</span>
              <span className="text-base font-bold text-foreground">{activeRM.name}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground font-medium block">System Stock</span>
              <span className="text-base font-bold text-foreground font-mono">{currentSystemStock}</span>
            </div>
          </div>

          {/* Stock Input & Calculation Card */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                  Audit Date <span className="text-red-500">*</span>
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
                  Audited Physical Stock <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={auditedStock}
                  onChange={(e) => setAuditedStock(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-background border-2 border-primary/30 rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Difference & Impact Indicator */}
            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current ({currentSystemStock})</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-bold text-foreground">Audited ({targetStock})</span>
              </div>

              <div>
                {difference > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-600 border border-green-500/20 rounded-full text-xs font-bold">
                    + {difference.toFixed(2)} Surplus (Auto IN)
                  </span>
                ) : difference < 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-600 border border-red-500/20 rounded-full text-xs font-bold">
                    {difference.toFixed(2)} Shortage (Auto OUT)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded-full text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Exact Match
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Reason Selection */}
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
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Additional remarks or auditor notes (optional)..."
              className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Submitting will automatically log a transaction and adjust the balance of <b>{activeRM.name}</b> to <b>{targetStock}</b> for audit compliance.
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
              disabled={isSubmitting || auditedStock === ''}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              Confirm Stock Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

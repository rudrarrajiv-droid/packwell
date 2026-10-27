import React from 'react';
import { X, Layers } from 'lucide-react';
import type { CutSizeItem } from '../../lib/supabase/plantMisService';

interface CutSizeDetailModalProps {
  machineName: string;
  shift: string;
  items: CutSizeItem[];
  totalSqMtr: number;
  totalQty: number;
  onClose: () => void;
  onOpenCalculator?: () => void;
}

export default function CutSizeDetailModal({
  machineName,
  shift,
  items,
  totalSqMtr,
  totalQty,
  onClose,
  onOpenCalculator
}: CutSizeDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900/30 via-secondary/40 to-background flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center border border-blue-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Cut-Size Production Breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{machineName}</span> ({shift} Shift)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs space-y-3">
              <p>No detailed cut-size batches recorded yet for this entry.</p>
              {onOpenCalculator && (
                <button
                  type="button"
                  onClick={onOpenCalculator}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all inline-flex items-center gap-1.5"
                >
                  <span>📐 Open Bulk Cut-Size Calculator</span>
                </button>
              )}
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/60 text-muted-foreground font-semibold uppercase text-[11px] border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Job / Description</th>
                    <th className="py-2.5 px-3 text-right">Cut Size</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Running Sq Mtr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-secondary/20">
                      <td className="py-2 px-3 text-center text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium text-foreground">{it.jobName || 'Standard Batch'}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-foreground">{it.cutSize}"</td>
                      <td className="py-2 px-3 text-right font-mono">{it.qty.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {it.sqMtr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} m²
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-secondary/40 font-bold border-t border-border">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[11px] text-muted-foreground">Total</td>
                    <td className="py-2.5 px-3 text-right font-mono text-foreground">{totalQty.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-600 dark:text-blue-400 text-sm">
                      {totalSqMtr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} m²
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
          <div>
            {onOpenCalculator && (
              <button
                type="button"
                onClick={onOpenCalculator}
                className="px-3.5 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all"
              >
                📐 Calculate / Edit Cut Sizes
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

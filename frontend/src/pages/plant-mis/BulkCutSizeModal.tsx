import React, { useState } from 'react';
import { X, Plus, Trash2, Calculator, Clipboard, Check, Sparkles, AlertCircle, Save } from 'lucide-react';
import { calculateSqMtr } from '../../lib/supabase/plantMisService';
import type { CutSizeItem } from '../../lib/supabase/plantMisService';

interface BulkCutSizeModalProps {
  machineName: string;
  shift?: string;
  reportDate?: string;
  initialItems?: CutSizeItem[];
  onClose: () => void;
  onApply?: (summary: { totalSqMtr: number; totalQty: number; items: CutSizeItem[] }) => void;
  onSaveDirect?: (summary: { totalSqMtr: number; totalQty: number; items: CutSizeItem[] }) => Promise<void>;
}

export default function BulkCutSizeModal({
  machineName,
  shift,
  reportDate,
  initialItems = [],
  onClose,
  onApply,
  onSaveDirect
}: BulkCutSizeModalProps) {
  const [items, setItems] = useState<CutSizeItem[]>(() => {
    if (initialItems && initialItems.length > 0) return initialItems;
    return [
      { id: '1', jobName: '', cutSize: 0, qty: 0, sqMtr: 0 }
    ];
  });

  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleItemChange = (index: number, field: keyof CutSizeItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === 'cutSize' || field === 'qty') {
      const cutSize = field === 'cutSize' ? Number(value) || 0 : item.cutSize;
      const qty = field === 'qty' ? Number(value) || 0 : item.qty;
      item.sqMtr = calculateSqMtr(cutSize, qty);
    }

    updated[index] = item;
    setItems(updated);
  };

  const handleAddRow = () => {
    setItems(prev => [
      ...prev,
      { id: Date.now().toString(), jobName: '', cutSize: 0, qty: 0, sqMtr: 0 }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (items.length <= 1) {
      setItems([{ id: Date.now().toString(), jobName: '', cutSize: 0, qty: 0, sqMtr: 0 }]);
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleParsePaste = () => {
    setPasteError('');
    if (!pastedText.trim()) {
      setPasteError('Please paste some data first.');
      return;
    }

    try {
      const lines = pastedText.trim().split(/\r?\n/);
      const parsed: CutSizeItem[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by Tab, Comma or multiple spaces
        const parts = line.split(/\t|,|\s{2,}/).map(p => p.trim());
        
        let job = '';
        let cutSize = 0;
        let qty = 0;

        if (parts.length >= 3) {
          job = parts[0];
          cutSize = parseFloat(parts[1]) || 0;
          qty = parseFloat(parts[2]) || 0;
        } else if (parts.length === 2) {
          const firstNum = parseFloat(parts[0]);
          const secondNum = parseFloat(parts[1]);
          if (!isNaN(firstNum) && !isNaN(secondNum)) {
            cutSize = firstNum;
            qty = secondNum;
          } else {
            job = parts[0];
            qty = secondNum;
          }
        } else if (parts.length === 1) {
          cutSize = parseFloat(parts[0]) || 0;
        }

        if (cutSize > 0 || qty > 0) {
          parsed.push({
            id: `${Date.now()}_${i}`,
            jobName: job,
            cutSize,
            qty,
            sqMtr: calculateSqMtr(cutSize, qty)
          });
        }
      }

      if (parsed.length === 0) {
        setPasteError('Could not find valid numbers. Format should be: CutSize [Tab] Qty');
        return;
      }

      setItems(prev => {
        const cleanPrev = prev.filter(p => p.cutSize > 0 || p.qty > 0);
        return [...cleanPrev, ...parsed];
      });

      setPastedText('');
      setShowPasteBox(false);
    } catch (err: any) {
      setPasteError('Error parsing pasted data: ' + err.message);
    }
  };

  const totalQty = items.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
  const totalSqMtr = Number(items.reduce((acc, curr) => acc + (Number(curr.sqMtr) || 0), 0).toFixed(2));

  const handleSaveOrApply = async () => {
    const validItems = items.filter(it => it.cutSize > 0 && it.qty > 0);
    const summary = {
      totalSqMtr,
      totalQty,
      items: validItems
    };

    if (onSaveDirect) {
      setIsSaving(true);
      try {
        await onSaveDirect(summary);
        onClose();
      } catch (err) {
        console.error('Error saving directly:', err);
      } finally {
        setIsSaving(false);
      }
    } else if (onApply) {
      onApply(summary);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900/40 via-secondary/40 to-background flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center border border-blue-500/30">
              <Calculator className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">
                  Bulk Cut-Size & Running Sq Mtr Calculator
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Auto Formula
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Machine: <span className="text-foreground font-bold">{machineName}</span> {shift && <span className="text-blue-500 font-semibold">({shift} Shift)</span>} • Formula: <span className="font-mono text-xs text-amber-500 font-bold">(Cut Size" × Qty) ÷ 39.37</span>
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Formula and Instruction Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-500/10 via-secondary/30 to-background border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Paper / Ply Cut Size (Inches) × Quantity ÷ 39.37 = Running Sq Mtr</span>
              </div>
              <p className="text-[11px]">
                Enter multiple cut sizes one by one below, or paste directly from Excel columns.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPasteBox(!showPasteBox)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-600/20 transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
            >
              <Clipboard className="w-3.5 h-3.5 text-amber-400" />
              {showPasteBox ? 'Hide Paste Box' : '📋 Paste from Excel'}
            </button>
          </div>

          {showPasteBox && (
            <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3 animate-in fade-in duration-150">
              <div className="text-xs font-semibold text-blue-500 flex items-center gap-1">
                <span>Copy 2 columns from Excel (Cut Size & Qty) and paste below:</span>
              </div>
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Example:&#10;45&#9;1000&#10;62&#9;1500&#10;54&#9;2000"
                rows={4}
                className="w-full text-xs font-mono p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground resize-none"
              />
              {pasteError && (
                <div className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {pasteError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasteBox(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParsePaste}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                >
                  Parse & Add Rows
                </button>
              </div>
            </div>
          )}

          {/* Table of Cut Sizes */}
          <div className="border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/60 text-muted-foreground font-semibold uppercase text-[11px] border-b border-border">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Job / Box Description (Optional)</th>
                  <th className="py-2.5 px-3 w-36">Cut Size (Inches)</th>
                  <th className="py-2.5 px-3 w-36">Qty (Ply / Paper)</th>
                  <th className="py-2.5 px-3 w-36 text-right">Running Sq Mtr</th>
                  <th className="py-2.5 px-3 w-12 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={item.jobName || ''}
                        onChange={e => handleItemChange(idx, 'jobName', e.target.value)}
                        placeholder="e.g. Royalux Outer / Box Batch"
                        className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background focus:ring-1 focus:ring-blue-500 text-foreground"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.cutSize || ''}
                          onChange={e => handleItemChange(idx, 'cutSize', parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 59.8"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 pr-6 rounded-md border border-border bg-background focus:ring-1 focus:ring-blue-500 text-foreground"
                        />
                        <span className="absolute right-2 top-1.5 text-[11px] text-muted-foreground font-semibold">"</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min="0"
                        value={item.qty || ''}
                        onChange={e => handleItemChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 2075"
                        className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background focus:ring-1 focus:ring-blue-500 text-foreground"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.sqMtr > 0 ? `${item.sqMtr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} m²` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/40 font-bold border-t border-border">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 text-right uppercase text-[11px] text-muted-foreground">
                    Totals:
                  </td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">
                    {items.filter(i => i.cutSize > 0).length} Cut Sizes
                  </td>
                  <td className="py-2.5 px-3 font-mono text-foreground font-bold">
                    {totalQty.toLocaleString('en-IN')} Nos
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-blue-600 dark:text-blue-400 text-sm font-extrabold">
                    {totalSqMtr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} m²
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Add Row Button */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 rounded-lg border border-dashed border-blue-500/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Cut Size
            </button>
          </div>
        </div>

        {/* Footer with Grand Totals & Action */}
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">Total Quantity</span>
              <span className="text-base font-extrabold text-foreground font-mono">{totalQty.toLocaleString('en-IN')} Nos</span>
            </div>
            <div className="h-8 w-px bg-border"></div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">Calculated Running Sq Mtr</span>
              <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono">
                {totalSqMtr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} m²
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOrApply}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : onSaveDirect ? (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Running Sq Mtr to Report</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Apply to Machine Sheet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

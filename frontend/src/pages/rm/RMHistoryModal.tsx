import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Loader2, ArrowDownRight, ArrowUpRight, Scale, Calendar, 
  Download, Printer, Plus, Minus, Receipt, ArrowUpDown, Filter, Sparkles
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { getRawMaterialTransactions } from '../../lib/supabase/rmService';
import type { RawMaterial, RawMaterialTransaction } from '../../lib/types/models';

export default function RMHistoryModal({ 
  isOpen, 
  onClose, 
  selectedRM,
  onOpenIn,
  onOpenOut,
  onOpenAdjust
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  selectedRM: RawMaterial | null;
  onOpenIn?: (rm: RawMaterial) => void;
  onOpenOut?: (rm: RawMaterial) => void;
  onOpenAdjust?: (rm: RawMaterial) => void;
}) {
  const [transactions, setTransactions] = useState<RawMaterialTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Date filtering
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');
  const [showAllTime, setShowAllTime] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && selectedRM) {
      fetchTransactions();
    }
  }, [isOpen, selectedRM]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await getRawMaterialTransactions(selectedRM?.id);
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Chronologically sorted transactions (Oldest first for running balance calculation)
  const chronologicalTxs = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [transactions]);

  // Compute transactions with accurate running balances and rate/amount
  const enrichedTransactions = useMemo(() => {
    if (!selectedRM) return [];
    
    // We compute running balances forward
    let currentRunBal = Number(selectedRM.openingQty) || 0;
    
    return chronologicalTxs.map((tx) => {
      const isOut = tx.type === 'OUT';
      const isAdj = tx.type === 'ADJUSTMENT' || (tx.referenceNo && tx.referenceNo.includes('[AUDIT ADJUSTMENT]'));
      
      // If transaction has remainingBalance from DB, use it, or calculate
      if (tx.remainingBalance !== undefined && tx.remainingBalance !== null) {
        currentRunBal = Number(tx.remainingBalance);
      } else {
        if (isOut) {
          currentRunBal -= tx.quantity;
        } else {
          currentRunBal += tx.quantity;
        }
      }

      const txRate = tx.rate || selectedRM.rate || 0;
      const txAmount = tx.amount || (txRate ? txRate * tx.quantity : 0);

      return {
        ...tx,
        isAdjustment: isAdj,
        computedBalance: currentRunBal,
        effectiveRate: txRate,
        effectiveAmount: txAmount
      };
    });
  }, [chronologicalTxs, selectedRM]);

  // Filtered by Selected Month / Date & Type
  const filteredTransactions = useMemo(() => {
    let list = enrichedTransactions;

    if (!showAllTime && selectedMonth) {
      list = list.filter(tx => tx.date.startsWith(selectedMonth));
    }

    if (filterType !== 'ALL') {
      if (filterType === 'ADJUSTMENT') {
        list = list.filter(tx => tx.isAdjustment);
      } else {
        list = list.filter(tx => tx.type === filterType && !tx.isAdjustment);
      }
    }

    // Display newest first in the table
    return [...list].reverse();
  }, [enrichedTransactions, selectedMonth, showAllTime, filterType]);

  // Monthly Period KPI Stats
  const periodStats = useMemo(() => {
    let periodIn = 0;
    let periodInVal = 0;
    let periodOut = 0;
    let periodOutVal = 0;
    let periodAdj = 0;

    const monthTxs = showAllTime 
      ? enrichedTransactions 
      : enrichedTransactions.filter(tx => tx.date.startsWith(selectedMonth));

    monthTxs.forEach(tx => {
      const rate = tx.effectiveRate || selectedRM?.rate || 0;
      if (tx.isAdjustment) {
        // Find if it was a surplus or shortage from reference or diff
        const isSurplus = tx.referenceNo?.includes('Diff: +');
        periodAdj += isSurplus ? tx.quantity : -tx.quantity;
      } else if (tx.type === 'IN') {
        periodIn += tx.quantity;
        periodInVal += tx.quantity * rate;
      } else if (tx.type === 'OUT') {
        periodOut += tx.quantity;
        periodOutVal += tx.quantity * rate;
      }
    });

    return {
      totalIn: periodIn,
      totalInValue: periodInVal,
      totalOut: periodOut,
      totalOutValue: periodOutVal,
      netAdjustments: periodAdj,
      txCount: monthTxs.length
    };
  }, [enrichedTransactions, selectedMonth, showAllTime, selectedRM]);

  const handleExportCSV = () => {
    if (!selectedRM || filteredTransactions.length === 0) return;

    const headers = ['Date', 'Type', 'Reference / Details', 'In Qty', 'Out Qty', 'Rate (₹)', 'Amount (₹)', 'Running Balance', 'Performed By'];
    const rows = filteredTransactions.map(tx => [
      tx.date,
      tx.isAdjustment ? 'AUDIT ADJUSTMENT' : tx.type,
      `"${(tx.referenceNo || '').replace(/"/g, '""')}"`,
      tx.type === 'IN' && !tx.isAdjustment ? tx.quantity : '',
      tx.type === 'OUT' && !tx.isAdjustment ? tx.quantity : '',
      tx.effectiveRate || '',
      tx.effectiveAmount ? tx.effectiveAmount.toFixed(2) : '',
      tx.computedBalance,
      tx.performedBy || 'System'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedRM.name.replace(/\s+/g, '_')}_ledger_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !selectedRM) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-background w-full max-w-5xl rounded-2xl shadow-2xl border border-border flex flex-col h-[90vh] overflow-hidden">
        
        {/* Header with Title & RM Overview */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black text-foreground tracking-tight">{selectedRM.name}</h2>
                <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold">
                  RM Ledger
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monthly Running Balance, Inward, Outward, Rates & Valuation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors ml-2">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Quick Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-6 bg-secondary/10 border-b border-border">
          <div className="bg-card p-3.5 rounded-xl border border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Opening Qty</span>
            <span className="text-xl font-bold text-foreground font-mono mt-0.5 block">{selectedRM.openingQty}</span>
          </div>

          <div className="bg-card p-3.5 rounded-xl border border-green-500/20 bg-green-500/5">
            <span className="text-[11px] font-semibold text-green-600 uppercase tracking-wider block">Period IN (+)</span>
            <span className="text-xl font-bold text-green-600 font-mono mt-0.5 block">+{periodStats.totalIn}</span>
            <span className="text-[10px] text-muted-foreground block">₹ {periodStats.totalInValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>

          <div className="bg-card p-3.5 rounded-xl border border-red-500/20 bg-red-500/5">
            <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wider block">Period OUT (-)</span>
            <span className="text-xl font-bold text-red-600 font-mono mt-0.5 block">-{periodStats.totalOut}</span>
            <span className="text-[10px] text-muted-foreground block">₹ {periodStats.totalOutValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>

          <div className="bg-card p-3.5 rounded-xl border border-primary/20 bg-primary/5">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider block">Closing Stock</span>
            <span className="text-xl font-extrabold text-primary font-mono mt-0.5 block">{selectedRM.closingBalance}</span>
          </div>

          <div className="bg-card p-3.5 rounded-xl border border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Rate & Valuation</span>
            <span className="text-xl font-bold text-foreground font-mono mt-0.5 block">₹ {selectedRM.rate}</span>
            <span className="text-[10px] text-primary font-semibold block">Total: ₹ {(selectedRM.closingBalance * selectedRM.rate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-6 py-3 border-b border-border bg-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border">
              <Calendar className="w-4 h-4 text-muted-foreground ml-2" />
              <input
                type="month"
                value={selectedMonth}
                disabled={showAllTime}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setShowAllTime(false);
                }}
                className="bg-transparent border-none text-xs font-semibold focus:ring-0 p-1"
              />
              <button
                onClick={() => setShowAllTime(!showAllTime)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  showAllTime ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                All Time
              </button>
            </div>

            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border">
              {(['ALL', 'IN', 'OUT', 'ADJUSTMENT'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    filterType === type 
                      ? 'bg-background text-foreground shadow-2xs' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'ALL' ? 'All Transactions' : type}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Action Buttons for selected RM */}
          <div className="flex items-center gap-2">
            {onOpenIn && (
              <button
                onClick={() => onOpenIn(selectedRM)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> + Inward
              </button>
            )}
            {onOpenOut && (
              <button
                onClick={() => onOpenOut(selectedRM)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              >
                <Minus className="w-3.5 h-3.5" /> - Outward
              </button>
            )}
            {onOpenAdjust && (
              <button
                onClick={() => onOpenAdjust(selectedRM)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
              >
                <Scale className="w-3.5 h-3.5" /> Adjust Stock
              </button>
            )}
          </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading running ledger...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <Receipt className="w-12 h-12 opacity-20" />
              <p className="font-medium">No transactions recorded for this period.</p>
              <p className="text-xs">Click on "+ Inward" or "- Outward" above to record a new transaction.</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-sm">
                <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Reference & Details</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-600">IN (+)</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-600">OUT (-)</th>
                    <th className="px-4 py-3 text-right font-semibold">Rate (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold text-foreground">Running Bal</th>
                    <th className="px-4 py-3 text-left font-semibold">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredTransactions.map((tx) => {
                    const isAdj = tx.isAdjustment;
                    const isOut = tx.type === 'OUT' && !isAdj;
                    const isIn = tx.type === 'IN' && !isAdj;

                    return (
                      <tr key={tx.id} className="hover:bg-muted/25 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                          {format(new Date(tx.date), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isAdj ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              <Scale className="w-3 h-3" /> AUDIT ADJUST
                            </span>
                          ) : isIn ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/10 text-green-600 border border-green-500/20">
                              <ArrowDownRight className="w-3 h-3" /> INWARD
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                              <ArrowUpRight className="w-3 h-3" /> OUTWARD
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={tx.referenceNo || '-'}>
                          {tx.referenceNo || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">
                          {isIn ? `+${tx.quantity}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">
                          {isOut ? `-${tx.quantity}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                          {tx.effectiveRate ? `₹ ${tx.effectiveRate}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground font-mono">
                          {tx.effectiveAmount ? `₹ ${tx.effectiveAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-foreground font-mono bg-secondary/20">
                          {tx.computedBalance}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {tx.performedBy || 'System'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

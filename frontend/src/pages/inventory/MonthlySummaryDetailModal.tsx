import React, { useState, useMemo } from 'react';
import { 
  X, Search, ArrowDownToLine, ArrowUpFromLine, History, 
  Calendar, Package, FileSpreadsheet, ExternalLink, ArrowLeft,
  CheckCircle2, Layers, AlertCircle, Eye, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MonthlySummaryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string; // 'YYYY-MM-DD' or 'TOTAL'
  type: 'INWARD' | 'OUTWARD';
  monthTitle?: string;
  transactions: any[];
  reels: any[];
  onOpenFullHistory?: (reel: any) => void;
}

export default function MonthlySummaryDetailModal({
  isOpen,
  onClose,
  date,
  type,
  monthTitle,
  transactions,
  reels,
  onOpenFullHistory
}: MonthlySummaryDetailModalProps) {
  const [search, setSearch] = useState('');
  const [paperTypeFilter, setPaperTypeFilter] = useState('ALL');
  const [selectedReelForDetails, setSelectedReelForDetails] = useState<any | null>(null);

  // Reel Map for O(1) lookup
  const reelMap = useMemo(() => {
    const map = new Map<string, any>();
    reels.forEach(r => {
      if (r.id) map.set(r.id, r);
    });
    return map;
  }, [reels]);

  // Filter transactions for this date and type
  const matchingTransactions = useMemo(() => {
    if (!isOpen) return [];

    return transactions.filter(tx => {
      if (tx.type !== type) return false;
      if (!tx.date) return false;

      if (date === 'TOTAL') {
        if (monthTitle && !tx.date.startsWith(monthTitle)) return false;
        return true;
      }

      return tx.date.startsWith(date);
    });
  }, [isOpen, transactions, type, date, monthTitle]);

  // Group transactions BY UNIQUE REEL so each reel used in that weight is shown clearly once
  const reelRows = useMemo(() => {
    const groupMap = new Map<string, {
      reelId: string;
      reel: any;
      reelNumber: string;
      paperType: string;
      reelSize: number | null;
      bf: string;
      gsm: string;
      initialWeight: number;
      currentBalance: number;
      consumedWeightOnDate: number; // Sum of this date's outward/inward quantity for this reel
      rate: number;
      dateTxns: any[];
    }>();

    matchingTransactions.forEach(tx => {
      const rId = tx.reelId || tx.id;
      const reel = reelMap.get(rId) || {};
      const reelNumber = reel.reelNumber || tx.reelNumber || '-';
      const paperType = (reel.paperType || '').toUpperCase() || 'UNKNOWN';
      const reelSize = reel.reelSize ? Number(reel.reelSize) : null;
      const bf = reel.bf || '-';
      const gsm = reel.gsm || '-';
      const initialWeight = Number(reel.weight) || 0;
      const currentBalance = Number(reel.currentBalance) || 0;
      const txQty = Number(tx.quantity) || 0;
      const rate = Number(reel.rate) || 0;

      if (!groupMap.has(rId)) {
        groupMap.set(rId, {
          reelId: rId,
          reel,
          reelNumber,
          paperType,
          reelSize,
          bf,
          gsm,
          initialWeight,
          currentBalance,
          consumedWeightOnDate: 0,
          rate,
          dateTxns: []
        });
      }

      const existing = groupMap.get(rId)!;
      existing.consumedWeightOnDate += txQty;
      existing.dateTxns.push(tx);
    });

    return Array.from(groupMap.values()).sort((a, b) => b.consumedWeightOnDate - a.consumedWeightOnDate);
  }, [matchingTransactions, reelMap]);

  // Filtered rows by search and paper type
  const filteredRows = useMemo(() => {
    const s = search.toLowerCase().trim();
    return reelRows.filter(row => {
      if (paperTypeFilter !== 'ALL' && row.paperType !== paperTypeFilter) {
        return false;
      }
      if (!s) return true;
      return (
        row.reelNumber.toLowerCase().includes(s) ||
        row.paperType.toLowerCase().includes(s) ||
        String(row.reelSize || '').includes(s) ||
        String(row.bf).toLowerCase().includes(s) ||
        String(row.gsm).toLowerCase().includes(s)
      );
    });
  }, [reelRows, search, paperTypeFilter]);

  // Aggregate totals
  const totalWeightSum = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.consumedWeightOnDate, 0);
  }, [filteredRows]);

  const availablePaperTypes = useMemo(() => {
    const types = new Set<string>();
    reelRows.forEach(r => {
      if (r.paperType) types.add(r.paperType);
    });
    return Array.from(types).sort();
  }, [reelRows]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, index) => ({
      'Sr No': index + 1,
      'Reel No': r.reelNumber,
      'Paper Type': r.paperType,
      'Size (Inch)': r.reelSize || '-',
      'BF': r.bf,
      'GSM': r.gsm,
      [type === 'OUTWARD' ? 'Consumed Wt on Date (Kg)' : 'Inward Wt on Date (Kg)']: r.consumedWeightOnDate,
      'Initial Wt (Kg)': r.initialWeight || '-',
      'Current Stock Balance (Kg)': r.currentBalance,
      'Supplier': r.reel.supplierName || '-',
      'Rate': r.rate || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    const sheetName = type === 'OUTWARD' ? 'Consumed_Reels' : 'Inward_Reels';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const cleanDate = date === 'TOTAL' ? (monthTitle || 'Monthly') : date;
    XLSX.writeFile(workbook, `Reels_${type}_${cleanDate}.xlsx`);
  };

  // Specific reel outward & inward history calculation
  const selectedReelFullHistory = useMemo(() => {
    if (!selectedReelForDetails) return null;
    const rId = selectedReelForDetails.reelId || selectedReelForDetails.id;
    const reel = reelMap.get(rId) || selectedReelForDetails.reel || selectedReelForDetails;

    // Get all transactions for this reel from the master transactions array
    const reelTxns = transactions.filter(t => 
      t.reelId === rId || 
      (reel.reelNumber && t.reelNumber && String(t.reelNumber).trim() === String(reel.reelNumber).trim())
    );

    // Inward transactions
    const inwardTxns = reelTxns
      .filter(t => t.type === 'INWARD')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Outward transactions (कब कब OUT हुआ - Date wise)
    const outwardTxns = reelTxns
      .filter(t => t.type === 'OUTWARD')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Latest first

    const totalOutwardQty = outwardTxns.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
    const initialWeight = Number(reel.weight) || (inwardTxns[0]?.quantity || 0);
    const currentBalance = Number(reel.currentBalance) || 0;

    return {
      reel,
      inwardTxns,
      outwardTxns,
      totalOutwardQty,
      initialWeight,
      currentBalance
    };
  }, [selectedReelForDetails, transactions, reelMap]);

  if (!isOpen) return null;

  const isOutward = type === 'OUTWARD';
  const formattedDate = date === 'TOTAL' 
    ? (monthTitle ? `All Reels for ${monthTitle}` : 'Monthly Total')
    : new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-5 overflow-hidden">
      <div className="bg-card w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ================= MODAL HEADER ================= */}
        <div className={`px-6 py-4 border-b border-border flex items-center justify-between text-white shrink-0 ${
          isOutward 
            ? 'bg-gradient-to-r from-red-700 via-rose-700 to-amber-700' 
            : 'bg-gradient-to-r from-blue-700 via-indigo-700 to-teal-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              {isOutward ? <ArrowUpFromLine className="w-6 h-6 text-white" /> : <ArrowDownToLine className="w-6 h-6 text-white" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">
                  {isOutward ? 'Date-wise Reel Consumption Details (खपत विवरण)' : 'Date-wise Reel Inward Details (आवक विवरण)'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 border border-white/30">
                  {isOutward ? 'OUT' : 'IN'}
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                {formattedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-sm border border-white/20 transition-all shadow-sm"
              title="Download Excel Report"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              Export Excel
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= SUBHEADER: SUMMARY BADGES & SEARCH ================= */}
        <div className="p-4 bg-secondary/30 border-b border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Summary Badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-background px-3.5 py-2 rounded-xl border border-border shadow-sm text-xs flex items-center gap-2">
              <span className="text-muted-foreground font-semibold">Total Reels Used:</span>
              <span className="font-black text-primary text-base">{filteredRows.length} Reels</span>
            </div>
            
            <div className={`px-4 py-2 rounded-xl border shadow-sm text-xs flex items-center gap-2 font-bold ${
              isOutward ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              <span>{isOutward ? 'Total Consumed Weight:' : 'Total Inward Weight:'}</span>
              <span className="font-black text-lg">{totalWeightSum.toLocaleString()} Kg</span>
            </div>

            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 bg-muted/40 px-3 py-1.5 rounded-lg border border-border">
              <Info className="w-3.5 h-3.5 text-primary" />
              <span>Click on any reel row or <span className="font-bold text-red-600 underline">"View History"</span> to see initial weight &amp; when it was OUT!</span>
            </div>
          </div>

          {/* Search & Paper Type Filter */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Reel No, Type, BF, GSM..."
                className="pl-9 pr-3 py-1.5 w-full text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {availablePaperTypes.length > 0 && (
              <select
                value={paperTypeFilter}
                onChange={e => setPaperTypeFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-input bg-background font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Types ({reelRows.length})</option>
                {availablePaperTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* ================= MAIN CONTENT: LIST OF REELS ================= */}
        <div className="flex-1 overflow-auto relative">
          
          <table className="w-full text-xs text-left">
            <thead className="bg-secondary/70 uppercase text-[11px] font-bold text-muted-foreground border-b border-border sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 w-12 text-center">#</th>
                <th className="px-4 py-3">Reel Number</th>
                <th className="px-4 py-3">Paper Type</th>
                <th className="px-4 py-3 text-center">Reel Size</th>
                <th className="px-4 py-3 text-center">BF</th>
                <th className="px-4 py-3 text-center">GSM</th>
                <th className={`px-4 py-3 text-right font-black ${
                  isOutward ? 'text-red-700 bg-red-100/50' : 'text-blue-700 bg-blue-100/50'
                }`}>
                  {isOutward ? 'Consumed Wt on Date (खपत)' : 'Inward Wt on Date (आवक)'}
                </th>
                <th className="px-4 py-3 text-right">Initial Wt (शुरुआती वजन)</th>
                <th className="px-4 py-3 text-right">Current Stock Bal</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filteredRows.map((row, index) => {
                return (
                  <tr 
                    key={row.reelId || index} 
                    className="hover:bg-muted/60 transition-colors group cursor-pointer"
                    onClick={() => setSelectedReelForDetails(row)}
                  >
                    <td className="px-4 py-3 text-center text-muted-foreground font-mono">
                      {index + 1}
                    </td>

                    {/* Reel Number */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReelForDetails(row);
                        }}
                        className="font-mono font-bold px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 text-xs inline-flex items-center gap-1.5 transition-all shadow-sm group-hover:border-primary/40"
                        title="Click to view initial weight & date-wise outward history"
                      >
                        <span>{row.reelNumber}</span>
                        <Eye className="w-3 h-3 opacity-60" />
                      </button>
                    </td>

                    {/* Paper Type */}
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {row.paperType}
                    </td>

                    {/* Specs */}
                    <td className="px-4 py-3 text-center font-bold text-foreground">
                      {row.reelSize ? `${row.reelSize}"` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {row.bf}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {row.gsm}
                    </td>

                    {/* Consumed Weight on this Date */}
                    <td className={`px-4 py-3 text-right font-black text-sm ${
                      isOutward ? 'bg-red-50/50' : 'bg-blue-50/50'
                    }`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReelForDetails(row);
                        }}
                        className={`inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-md border transition-all text-xs shadow-sm ${
                          isOutward 
                            ? 'bg-red-100/90 hover:bg-red-200/90 text-red-700 border-red-300' 
                            : 'bg-blue-100/90 hover:bg-blue-200/90 text-blue-700 border-blue-300'
                        }`}
                        title="Click to view initial weight & date-wise outward details for this reel"
                      >
                        <span>{isOutward ? `-${row.consumedWeightOnDate.toLocaleString()} Kg` : `+${row.consumedWeightOnDate.toLocaleString()} Kg`}</span>
                        <span className="text-[10px] opacity-75">↗</span>
                      </button>
                    </td>

                    {/* Initial Weight (शुरुआती वजन) */}
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {row.initialWeight > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReelForDetails(row);
                          }}
                          className="text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 text-xs transition-colors cursor-pointer"
                          title="Initial Weight - click to view history"
                        >
                          {row.initialWeight.toLocaleString()} Kg
                        </button>
                      ) : '-'}
                    </td>

                    {/* Current Stock Balance */}
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={row.currentBalance <= 0 ? 'text-muted-foreground line-through opacity-70' : 'text-emerald-700 font-black'}>
                        {row.currentBalance.toLocaleString()} Kg
                      </span>
                    </td>

                    {/* View Details Action Button */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReelForDetails(row);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${
                          isOutward
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                        title="Click to view full outward dates & initial weight for this reel"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>{isOutward ? 'View Outward History (कब-कब Out)' : 'View Details (विवरण)'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto text-muted mb-2 opacity-40" />
                    <p className="font-bold text-sm">No reels found for this date.</p>
                    {search && <p className="text-xs mt-1">Try clearing your search query "{search}".</p>}
                  </td>
                </tr>
              )}
            </tbody>

            {/* Grand Total Footer */}
            {filteredRows.length > 0 && (
              <tfoot className="bg-secondary/90 font-bold border-t-2 border-border sticky bottom-0 z-10 backdrop-blur-md">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right uppercase text-xs font-black text-foreground tracking-wider">
                    Total: {filteredRows.length} Reels
                  </td>
                  <td className={`px-4 py-3 text-right text-base font-black ${
                    isOutward ? 'bg-red-100/70 text-red-700' : 'bg-blue-100/70 text-blue-700'
                  }`}>
                    {isOutward ? `-${totalWeightSum.toLocaleString()} Kg` : `+${totalWeightSum.toLocaleString()} Kg`}
                  </td>
                  <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground font-medium">
                    {isOutward ? 'Total reel consumption for this date' : 'Total reel inward for this date'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="p-3.5 bg-secondary/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Showing all {filteredRows.length} individual reels used in this weight.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-bold text-foreground border border-border transition-colors shadow-sm"
          >
            Close
          </button>
        </div>

      </div>

      {/* ================= POPUP MODAL: INDIVIDUAL REEL OUTWARD HISTORY ================= */}
      {selectedReelForDetails && selectedReelFullHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/40">
                  <History className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight text-white">
                      Reel Outward History (रील खपत का सम्पूर्ण विवरण)
                    </h3>
                    <span className="px-2.5 py-0.5 rounded font-mono font-black text-xs bg-indigo-500 text-white shadow-sm">
                      {selectedReelFullHistory.reel.reelNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">
                    {selectedReelFullHistory.reel.paperType} • {selectedReelFullHistory.reel.reelSize}" Size • {selectedReelFullHistory.reel.bf} BF • {selectedReelFullHistory.reel.gsm} GSM
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedReelForDetails(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Back to list"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reel Summary Cards */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5 bg-secondary/10">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-4 rounded-xl shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 block mb-1">
                    Initial Weight (शुरुआती वजन)
                  </span>
                  <span className="text-2xl font-black text-blue-900 dark:text-blue-100">
                    {selectedReelFullHistory.initialWeight.toLocaleString()} Kg
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1.5 text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                    <span>Inward Date: {selectedReelFullHistory.reel.inwardDate ? new Date(selectedReelFullHistory.reel.inwardDate).toLocaleDateString('en-IN') : 'N/A'}</span>
                    {selectedReelFullHistory.reel.supplierName && (
                      <span className="truncate font-semibold">Supplier: {selectedReelFullHistory.reel.supplierName}</span>
                    )}
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4 rounded-xl shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 block mb-1">
                    Total Consumed (कुल खपत)
                  </span>
                  <span className="text-2xl font-black text-red-900 dark:text-red-100">
                    -{selectedReelFullHistory.totalOutwardQty.toLocaleString()} Kg
                  </span>
                  <span className="text-[11px] text-red-600 dark:text-red-300 block mt-1">
                    Total Issues: {selectedReelFullHistory.outwardTxns.length} Times
                  </span>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 rounded-xl shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                    Current Balance (वर्तमान स्टॉक)
                  </span>
                  <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                    {selectedReelFullHistory.currentBalance.toLocaleString()} Kg
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-300 block mt-1">
                    {selectedReelFullHistory.currentBalance <= 0 ? 'Fully Consumed (NIL)' : 'Available in Godown'}
                  </span>
                </div>
              </div>

              {/* Date-wise OUT History Table */}
              <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-secondary/50 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4 text-red-600" />
                    <h4 className="font-bold text-sm text-foreground">
                      Date-wise Outward Details (यह रील कब-कब Out हुई)
                    </h4>
                  </div>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {selectedReelFullHistory.outwardTxns.length} Outward Record(s)
                  </span>
                </div>

                <table className="w-full text-xs text-left">
                  <thead className="bg-secondary/30 uppercase text-[10px] font-bold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3 w-10 text-center">#</th>
                      <th className="px-4 py-3">Outward Date &amp; Time (तारीख और समय)</th>
                      <th className="px-4 py-3 text-right text-red-600 bg-red-50/40 font-black">Consumed Wt (खपत)</th>
                      <th className="px-4 py-3 text-right font-bold">Remaining Balance (बचा वजन)</th>
                      <th className="px-4 py-3">Job Card / Purpose</th>
                      <th className="px-4 py-3">Issued By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedReelFullHistory.outwardTxns.map((tx: any, idx: number) => {
                      const isCurrentDateTx = date !== 'TOTAL' && tx.date && tx.date.startsWith(date);
                      return (
                        <tr 
                          key={tx.id || idx}
                          className={`transition-colors ${isCurrentDateTx ? 'bg-amber-50/70 dark:bg-amber-950/30 font-semibold border-l-4 border-amber-500' : 'hover:bg-muted/40'}`}
                        >
                          <td className="px-4 py-3 text-center text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                            {tx.date ? new Date(tx.date).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            }) : '-'}
                            {isCurrentDateTx && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                                Selected Date
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-red-600 text-sm bg-red-50/20">
                            -{Number(tx.quantity).toLocaleString()} Kg
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-foreground">
                            {tx.remainingBalance !== undefined && tx.remainingBalance !== null ? `${Number(tx.remainingBalance).toLocaleString()} Kg` : '-'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {tx.jobCardId ? (
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                {tx.jobCardId}
                              </span>
                            ) : (
                              tx.notes || '-'
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-medium">
                            {tx.performedBy || 'System'}
                          </td>
                        </tr>
                      );
                    })}
                    {selectedReelFullHistory.outwardTxns.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No outward consumption records found for this reel.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {selectedReelFullHistory.outwardTxns.length > 0 && (
                    <tfoot className="bg-secondary/70 font-bold border-t-2 border-border">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-right uppercase text-[11px] text-foreground">
                          Total Outward Consumption:
                        </td>
                        <td className="px-4 py-3 text-right font-black text-red-700 text-base bg-red-100/60">
                          -{selectedReelFullHistory.totalOutwardQty.toLocaleString()} Kg
                        </td>
                        <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground">
                          Current Stock Remaining: <span className="font-bold text-foreground">{selectedReelFullHistory.currentBalance.toLocaleString()} Kg</span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

            </div>

            {/* Sub-modal footer */}
            <div className="p-3.5 bg-secondary/30 border-t border-border flex items-center justify-between shrink-0">
              <button
                onClick={() => setSelectedReelForDetails(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Reels List
              </button>

              {onOpenFullHistory && (
                <button
                  onClick={() => {
                    const r = selectedReelFullHistory.reel;
                    setSelectedReelForDetails(null);
                    onClose();
                    onOpenFullHistory(r);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <History className="w-4 h-4" />
                  Open Full Ledger in Reel History
                  <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

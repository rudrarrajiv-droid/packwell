import React, { useState, useMemo } from 'react';
import { 
  X, Search, ArrowDownToLine, ArrowUpFromLine, History, 
  Calendar, Package, FileSpreadsheet, ExternalLink, ArrowLeft,
  CheckCircle2, Layers, AlertCircle
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
  const [selectedReelForHistory, setSelectedReelForHistory] = useState<any | null>(null);

  // Reel Map for quick O(1) lookup
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
        // Match the selected month prefix
        if (monthTitle && !tx.date.startsWith(monthTitle)) return false;
        return true;
      }

      return tx.date.startsWith(date);
    });
  }, [isOpen, transactions, type, date, monthTitle]);

  // Enriched transaction rows with reel specifications
  const enrichedRows = useMemo(() => {
    return matchingTransactions.map(tx => {
      const reel = reelMap.get(tx.reelId) || {};
      const reelNumber = reel.reelNumber || tx.reelNumber || '-';
      const paperType = (reel.paperType || '').toUpperCase() || 'UNKNOWN';
      const reelSize = reel.reelSize ? Number(reel.reelSize) : null;
      const bf = reel.bf || '-';
      const gsm = reel.gsm || '-';
      const initialWeight = Number(reel.weight) || 0;
      const currentBalance = Number(reel.currentBalance) || 0;
      const txQty = Number(tx.quantity) || 0;
      const rate = Number(reel.rate) || 0;

      return {
        txId: tx.id,
        tx,
        reelId: tx.reelId,
        reel,
        reelNumber,
        paperType,
        reelSize,
        bf,
        gsm,
        initialWeight,
        currentBalance,
        consumedWeight: txQty, // For OUTWARD it's consumed weight, for INWARD it's inward weight
        rate,
        date: tx.date,
        jobCardId: tx.jobCardId || null,
        performedBy: tx.performedBy || 'System',
        notes: tx.notes || ''
      };
    });
  }, [matchingTransactions, reelMap]);

  // Filtered rows by search and paper type
  const filteredRows = useMemo(() => {
    const s = search.toLowerCase().trim();
    return enrichedRows.filter(row => {
      if (paperTypeFilter !== 'ALL' && row.paperType !== paperTypeFilter) {
        return false;
      }
      if (!s) return true;
      return (
        row.reelNumber.toLowerCase().includes(s) ||
        row.paperType.toLowerCase().includes(s) ||
        String(row.reelSize || '').includes(s) ||
        String(row.bf).toLowerCase().includes(s) ||
        String(row.gsm).toLowerCase().includes(s) ||
        (row.performedBy || '').toLowerCase().includes(s) ||
        (row.notes || '').toLowerCase().includes(s)
      );
    });
  }, [enrichedRows, search, paperTypeFilter]);

  // Aggregate totals
  const totalWeightSum = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.consumedWeight, 0);
  }, [filteredRows]);

  const uniqueReelsCount = useMemo(() => {
    return new Set(filteredRows.map(r => r.reelId)).size;
  }, [filteredRows]);

  const availablePaperTypes = useMemo(() => {
    const types = new Set<string>();
    enrichedRows.forEach(r => {
      if (r.paperType) types.add(r.paperType);
    });
    return Array.from(types).sort();
  }, [enrichedRows]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, index) => ({
      'Sr No': index + 1,
      'Reel No': r.reelNumber,
      'Paper Type': r.paperType,
      'Size (Inch)': r.reelSize || '-',
      'BF': r.bf,
      'GSM': r.gsm,
      [type === 'OUTWARD' ? 'Consumed Wt (Kg)' : 'Inward Wt (Kg)']: r.consumedWeight,
      'Initial Wt (Kg)': r.initialWeight || '-',
      'Current Balance (Kg)': r.currentBalance,
      'Date & Time': r.date ? new Date(r.date).toLocaleString('en-IN') : '-',
      'Job Card / Notes': r.notes || r.jobCardId || '-',
      'Performed By': r.performedBy
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    const sheetName = type === 'OUTWARD' ? 'Consumption_Detail' : 'Inward_Detail';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const cleanDate = date === 'TOTAL' ? (monthTitle || 'Monthly') : date;
    XLSX.writeFile(workbook, `Reel_${type}_Detail_${cleanDate}.xlsx`);
  };

  // Specific reel outward history calculation
  const selectedReelHistory = useMemo(() => {
    if (!selectedReelForHistory) return null;
    const rId = selectedReelForHistory.reelId || selectedReelForHistory.id;
    const reel = reelMap.get(rId) || selectedReelForHistory.reel || selectedReelForHistory;

    // Get all transactions for this reel from the master transactions array
    const reelTxns = transactions.filter(t => t.reelId === rId);

    // Inward transactions
    const inwardTxns = reelTxns
      .filter(t => t.type === 'INWARD')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Outward transactions (कब कब OUT हुआ)
    const outwardTxns = reelTxns
      .filter(t => t.type === 'OUTWARD')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalOutwardQty = outwardTxns.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

    return {
      reel,
      inwardTxns,
      outwardTxns,
      totalOutwardQty,
      initialWeight: Number(reel.weight) || (inwardTxns[0]?.quantity || 0),
      currentBalance: Number(reel.currentBalance) || 0
    };
  }, [selectedReelForHistory, transactions, reelMap]);

  if (!isOpen) return null;

  const isOutward = type === 'OUTWARD';
  const formattedDate = date === 'TOTAL' 
    ? (monthTitle ? `All Transactions for ${monthTitle}` : 'Monthly Total')
    : new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-hidden">
      <div className="bg-card w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* MODAL HEADER */}
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
                  {isOutward ? 'Reel Consumption Details (दैनिक खपत विवरण)' : 'Reel Inward Details (दैनिक आवक विवरण)'}
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

        {/* SUBHEADER: METRICS & SEARCH TOOLBAR */}
        <div className="p-4 bg-secondary/30 border-b border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-background px-3 py-1.5 rounded-lg border border-border shadow-sm text-xs flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Reels Count:</span>
              <span className="font-black text-foreground text-sm">{uniqueReelsCount}</span>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border shadow-sm text-xs flex items-center gap-2 font-semibold ${
              isOutward ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              <span>{isOutward ? 'Total Consumed Wt:' : 'Total Inward Wt:'}</span>
              <span className="font-black text-base">{totalWeightSum.toLocaleString()} Kg</span>
            </div>
            {isOutward && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border">
                <span className="text-primary font-bold">💡 Tip:</span>
                <span>Click on any <span className="font-bold text-red-600 underline">Consumed Wt</span> to see that reel's Initial Wt &amp; all Outward dates!</span>
              </div>
            )}
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-2.5 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Reel No, Type, Size, BF..."
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
                className="px-2.5 py-1.5 text-xs rounded-lg border border-input bg-background font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Types ({enrichedRows.length})</option>
                {availablePaperTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* MAIN BODY: TABLE OR SUB-MODAL */}
        <div className="flex-1 overflow-auto relative">
          
          {/* ================= REEL OUTWARD HISTORY SUB-VIEW ================= */}
          {selectedReelForHistory && selectedReelHistory && (
            <div className="absolute inset-0 bg-background/95 backdrop-blur-md z-20 flex flex-col p-4 sm:p-6 overflow-y-auto">
              <div className="max-w-4xl mx-auto w-full space-y-4">
                
                {/* Back Button & Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <button
                    onClick={() => setSelectedReelForHistory(null)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Daily List
                  </button>
                  
                  {onOpenFullHistory && (
                    <button
                      onClick={() => {
                        const r = selectedReelHistory.reel;
                        onClose();
                        onOpenFullHistory(r);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 transition-all shadow-sm"
                    >
                      <History className="w-3.5 h-3.5" />
                      Open Full Ledger in Reel History
                      <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  )}
                </div>

                {/* Reel Specifications & Balance Card */}
                <div className="bg-card border border-border shadow-md rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-border">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reel Identity</span>
                      <h3 className="text-2xl font-black text-primary font-mono tracking-tight flex items-center gap-2">
                        {selectedReelHistory.reel.reelNumber}
                        {selectedReelHistory.currentBalance <= 0 && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold border border-red-200">
                            ZERO BALANCE (NIL)
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-foreground font-semibold mt-1">
                        {selectedReelHistory.reel.paperType} • {selectedReelHistory.reel.reelSize}" Size • {selectedReelHistory.reel.bf} BF • {selectedReelHistory.reel.gsm} GSM
                      </p>
                    </div>

                    <div className="flex gap-3 flex-wrap">
                      <div className="bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl text-right">
                        <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">Initial Weight (शुरुआती वजन)</span>
                        <span className="text-xl font-black text-blue-800">{selectedReelHistory.initialWeight.toLocaleString()} Kg</span>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl text-right">
                        <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider block">Total Outward (कुल खपत)</span>
                        <span className="text-xl font-black text-rose-800">{selectedReelHistory.totalOutwardQty.toLocaleString()} Kg</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl text-right">
                        <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">Current Balance (बचा हुआ वजन)</span>
                        <span className="text-xl font-black text-emerald-800">{selectedReelHistory.currentBalance.toLocaleString()} Kg</span>
                      </div>
                    </div>
                  </div>

                  {/* Supplier & Rates info */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-secondary/40 p-2.5 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">Supplier:</span>
                      <span className="font-bold text-foreground truncate block">{selectedReelHistory.reel.supplierName || '-'}</span>
                    </div>
                    <div className="bg-secondary/40 p-2.5 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">Manufacturer:</span>
                      <span className="font-bold text-foreground truncate block">{selectedReelHistory.reel.manufacturerName || '-'}</span>
                    </div>
                    <div className="bg-secondary/40 p-2.5 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">Rate per Kg:</span>
                      <span className="font-bold text-foreground">{selectedReelHistory.reel.rate ? `₹${Number(selectedReelHistory.reel.rate).toFixed(2)}` : '-'}</span>
                    </div>
                    <div className="bg-secondary/40 p-2.5 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">Inward Date:</span>
                      <span className="font-bold text-foreground">
                        {selectedReelHistory.reel.inwardDate ? new Date(selectedReelHistory.reel.inwardDate).toLocaleDateString('en-IN') : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Outward Ledger Table (कब कब OUT हुआ) */}
                <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-secondary/50 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpFromLine className="w-4 h-4 text-red-600" />
                      <h4 className="font-bold text-sm text-foreground">
                        Date-wise Outward History (यह रील कब-कब Out हुई)
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">
                      Total Issues: {selectedReelHistory.outwardTxns.length}
                    </span>
                  </div>

                  <table className="w-full text-xs text-left">
                    <thead className="bg-secondary/30 uppercase text-[10px] font-bold text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Outward Date &amp; Time</th>
                        <th className="px-4 py-3 text-right text-red-600 bg-red-50/30">Consumed Weight (खपत)</th>
                        <th className="px-4 py-3 text-right">Balance After Out</th>
                        <th className="px-4 py-3">Job Card No / Purpose</th>
                        <th className="px-4 py-3">Issued By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedReelHistory.outwardTxns.map((tx: any, idx: number) => {
                        const isCurrentDateTx = date !== 'TOTAL' && tx.date && tx.date.startsWith(date);
                        return (
                          <tr 
                            key={tx.id || idx}
                            className={`transition-colors ${isCurrentDateTx ? 'bg-amber-50/70 font-semibold border-l-4 border-amber-500' : 'hover:bg-muted/40'}`}
                          >
                            <td className="px-4 py-3 text-muted-foreground font-mono">{idx + 1}</td>
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
                      {selectedReelHistory.outwardTxns.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            No outward consumption records found for this reel.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {selectedReelHistory.outwardTxns.length > 0 && (
                      <tfoot className="bg-secondary/70 font-bold border-t-2 border-border">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-right uppercase text-[11px] text-foreground">
                            Total Reel Outward Sum:
                          </td>
                          <td className="px-4 py-3 text-right font-black text-red-700 text-base bg-red-100/60">
                            -{selectedReelHistory.totalOutwardQty.toLocaleString()} Kg
                          </td>
                          <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground">
                            Current Stock Balance remaining: <span className="font-bold text-foreground">{selectedReelHistory.currentBalance.toLocaleString()} Kg</span>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

              </div>
            </div>
          )}

          {/* ================= PRIMARY DAILY TRANSACTION LIST ================= */}
          <table className="w-full text-xs text-left">
            <thead className="bg-secondary/60 uppercase text-[11px] font-bold text-muted-foreground border-b border-border sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 w-12 text-center">#</th>
                <th className="px-4 py-3">Reel Number</th>
                <th className="px-4 py-3">Paper Type</th>
                <th className="px-4 py-3 text-center">Size (Inch)</th>
                <th className="px-4 py-3 text-center">BF</th>
                <th className="px-4 py-3 text-center">GSM</th>
                <th className="px-4 py-3 text-right">Initial Wt</th>
                <th className={`px-4 py-3 text-right ${
                  isOutward ? 'text-red-700 bg-red-100/50' : 'text-blue-700 bg-blue-100/50'
                }`}>
                  {isOutward ? 'Consumed Weight (खपत)' : 'Inward Weight (आवक)'}
                </th>
                <th className="px-4 py-3 text-right">Current Bal</th>
                <th className="px-4 py-3">Time / Job Card</th>
                <th className="px-4 py-3 text-center">History Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filteredRows.map((row, index) => {
                return (
                  <tr 
                    key={row.txId || index} 
                    className="hover:bg-muted/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedReelForHistory(row)}
                  >
                    <td className="px-4 py-3 text-center text-muted-foreground font-mono">
                      {index + 1}
                    </td>

                    {/* Reel No */}
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs">
                        {row.reelNumber}
                      </span>
                    </td>

                    {/* Specs */}
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {row.paperType}
                    </td>
                    <td className="px-4 py-3 text-center font-bold">
                      {row.reelSize ? `${row.reelSize}"` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {row.bf}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {row.gsm}
                    </td>

                    {/* Initial Weight */}
                    <td className="px-4 py-3 text-right font-medium text-muted-foreground">
                      {row.initialWeight > 0 ? `${row.initialWeight.toLocaleString()} Kg` : '-'}
                    </td>

                    {/* Consumed / Inward Weight - Highlighting clickable interaction */}
                    <td className={`px-4 py-3 text-right font-black text-sm ${
                      isOutward ? 'bg-red-50/40 text-red-600' : 'bg-blue-50/40 text-blue-600'
                    }`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReelForHistory(row);
                        }}
                        className={`inline-flex items-center gap-1 font-black underline-offset-4 hover:underline transition-all group-hover:scale-105 ${
                          isOutward ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800'
                        }`}
                        title="Click to view full reel inward & date-wise outward history"
                      >
                        {isOutward ? `-${row.consumedWeight.toLocaleString()} Kg` : `+${row.consumedWeight.toLocaleString()} Kg`}
                        <History className="w-3 h-3 opacity-60 ml-0.5" />
                      </button>
                    </td>

                    {/* Current Balance */}
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      <span className={row.currentBalance <= 0 ? 'text-muted-foreground line-through opacity-70' : 'text-emerald-700'}>
                        {row.currentBalance.toLocaleString()} Kg
                      </span>
                    </td>

                    {/* Job Card / Notes */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex flex-col">
                        {row.jobCardId ? (
                          <span className="font-semibold text-primary truncate max-w-[140px]" title={row.jobCardId}>
                            JC: {row.jobCardId}
                          </span>
                        ) : row.notes ? (
                          <span className="truncate max-w-[140px]" title={row.notes}>
                            {row.notes}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {row.date ? new Date(row.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    </td>

                    {/* History Action Button */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReelForHistory(row);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground border border-border transition-colors shadow-sm"
                        title="View initial weight and all date-wise outward history for this reel"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>History</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto text-muted mb-2 opacity-50" />
                    <p className="font-semibold text-sm">No {type.toLowerCase()} transactions found for this date.</p>
                    {search && <p className="text-xs mt-1">Try clearing your search query "{search}".</p>}
                  </td>
                </tr>
              )}
            </tbody>

            {/* GRAND TOTAL ROW */}
            {filteredRows.length > 0 && (
              <tfoot className="bg-secondary/90 font-bold border-t-2 border-border sticky bottom-0 z-10 backdrop-blur-md">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right uppercase text-xs font-black text-foreground tracking-wider">
                    Total for {filteredRows.length} {filteredRows.length === 1 ? 'Transaction' : 'Transactions'} ({uniqueReelsCount} Reels):
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">
                    -
                  </td>
                  <td className={`px-4 py-3 text-right text-base font-black ${
                    isOutward ? 'bg-red-100/70 text-red-700' : 'bg-blue-100/70 text-blue-700'
                  }`}>
                    {isOutward ? `-${totalWeightSum.toLocaleString()} Kg` : `+${totalWeightSum.toLocaleString()} Kg`}
                  </td>
                  <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground font-medium">
                    {isOutward ? 'Sum of all reel consumptions on this date' : 'Sum of all reel inwards on this date'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 bg-secondary/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Click any reel row to view its original weight &amp; date-wise outward timeline.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-bold text-foreground border border-border transition-colors shadow-sm"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

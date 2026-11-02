import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Calculator, Search, Download, CheckCircle2, 
  TrendingUp, TrendingDown, AlertTriangle, Layers, 
  Calendar, Eye, ArrowUpRight, ArrowDownRight, RefreshCw,
  HelpCircle, Sparkles, Box, FileSpreadsheet
} from 'lucide-react';
import { getAllJobCards } from '../lib/supabase/jobCardService';
import { getReels } from '../lib/supabase/reelService';
import type { JobCostingData } from './job-costing/jobCostingTypes';
import { buildJobCostingData } from './job-costing/jobCostingService';
import JobCostingDetailModal from './job-costing/JobCostingDetailModal';
import { exportToExcel } from '../lib/exportUtils';
import { cn } from '../lib/utils';

// Strict Cutoff Date: Only job cards on or after 1 November 2026 (01/11/2026)
const CUTOFF_DATE = '2026-11-01';

/**
 * Normalizes any date string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO) to YYYY-MM-DD
 */
const parseDateToIso = (val: any): string | null => {
  if (!val) return null;
  const str = String(val).trim();
  
  // Format: YYYY-MM-DD...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  
  // Format: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format: DD-MM-YY or DD/MM/YY
  const dmyShortMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})/);
  if (dmyShortMatch) {
    const day = dmyShortMatch[1].padStart(2, '0');
    const month = dmyShortMatch[2].padStart(2, '0');
    const year = `20${dmyShortMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
};

/**
 * Strict validator: Only and only job cards created on or after 01/11/2026
 */
const isJobCardFromNov1OrLater = (jc: any): boolean => {
  // Check created_at / createdAt
  const createdIso = parseDateToIso(jc.createdAt || jc.created_at);
  if (createdIso) {
    if (createdIso >= CUTOFF_DATE) return true;
    if (createdIso < CUTOFF_DATE) return false;
  }

  // Check target_date / targetDate
  const targetIso = parseDateToIso(jc.targetDate || jc.target_date);
  if (targetIso) {
    if (targetIso >= CUTOFF_DATE) return true;
    if (targetIso < CUTOFF_DATE) return false;
  }

  // Check new-format Job Card Number [Serial][DDMMYY] (started on 01/11/2026)
  const jcNo = String(jc.jobCardNo || jc.job_card_no || '').trim();
  if (/^\d{7,}$/.test(jcNo)) {
    const ddmmyy = jcNo.slice(-6);
    const mm = parseInt(ddmmyy.slice(2, 4), 10);
    const yy = parseInt(ddmmyy.slice(4, 6), 10);
    if (yy > 26 || (yy === 26 && mm >= 11)) {
      return true;
    }
  }

  // Legacy job cards like PI/JC/1569 are strictly rejected
  return false;
};

// Check if Job Card has allocated reels
const isJobCardAllocated = (jc: any): boolean => {
  if (!jc || !jc.productSnapshot || !jc.productSnapshot.layers) return false;
  if (jc.reelAllocationSkipped) return true;
  const layers = jc.productSnapshot.layers || [];
  return layers.some((l: any) => 
    (l.allocatedReels && Array.isArray(l.allocatedReels) && l.allocatedReels.length > 0) ||
    (l.allocatedReelNumber && l.allocatedReelWeight)
  );
};

export default function JobCosting() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROFIT' | 'LOSS' | 'PENDING'>('ALL');
  const [selectedCosting, setSelectedCosting] = useState<JobCostingData | null>(null);

  // 1. Fetch Job Cards
  const { data: jobCards = [], isLoading: loadingJobCards, refetch: refetchJobCards } = useQuery({
    queryKey: ['jobCards'],
    queryFn: getAllJobCards
  });

  // 2. Fetch Reels Inventory for rates
  const { data: reels = [] } = useQuery({
    queryKey: ['reels-all'],
    queryFn: () => getReels() as Promise<any[]>
  });

  // 3. Process Costing Rows (Strictly 01/11/2026 onwards + Reel Allocated only)
  const costingRows = useMemo(() => {
    return jobCards
      .filter((jc: any) => isJobCardFromNov1OrLater(jc) && isJobCardAllocated(jc))
      .map((jc: any) => buildJobCostingData(jc, reels));
  }, [jobCards, reels]);

  // 4. Filter Rows
  const filteredRows = useMemo(() => {
    return costingRows.filter((item) => {
      // Profit / Loss / Pending filters
      if (filterType === 'PROFIT' && (item.netProfitLoss === null || item.netProfitLoss < 0)) return false;
      if (filterType === 'LOSS' && (item.netProfitLoss === null || item.netProfitLoss >= 0)) return false;
      if (filterType === 'PENDING' && item.netProfitLoss !== null) return false;

      // Search Filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNo = item.jobCardNo.toLowerCase().includes(q);
        const matchName = item.jobName.toLowerCase().includes(q);
        if (!matchNo && !matchName) return false;
      }

      return true;
    });
  }, [costingRows, filterType, search]);

  // Executive Top Aggregates
  const summary = useMemo(() => {
    let totalProfit = 0;
    let totalLoss = 0;
    let profitCount = 0;
    let lossCount = 0;
    let pendingCount = 0;

    filteredRows.forEach((r) => {
      if (r.netProfitLoss === null) {
        pendingCount++;
      } else if (r.netProfitLoss >= 0) {
        profitCount++;
        totalProfit += r.netProfitLoss;
      } else {
        lossCount++;
        totalLoss += Math.abs(r.netProfitLoss);
      }
    });

    const netOverall = totalProfit - totalLoss;

    return {
      totalCards: filteredRows.length,
      profitCount,
      lossCount,
      pendingCount,
      totalProfit,
      totalLoss,
      netOverall
    };
  }, [filteredRows]);

  // Handle Saved from Modal
  const handleModalSaved = (updated: JobCostingData) => {
    setSelectedCosting(updated);
    queryClient.invalidateQueries({ queryKey: ['jobCards'] });
  };

  // Export to Excel using existing tested exportUtil
  const handleExportExcel = () => {
    const exportData = filteredRows.map(r => ({
      'Job Card No': r.jobCardNo,
      'Job Card Date': r.jobCardDate,
      'Job Name': r.jobName,
      'Order Box Qty': r.orderBoxQty,
      'Manufactured Box Qty': r.manfBoxQty ?? 'Pending',
      'Allocated Paper Value': r.totalAllocatedValue,
      'Actual DPR Paper Value': r.totalDprValue,
      'Intermediate Scrap Loss': r.totalLessBoxLoss,
      'Net Profit / Loss': r.netProfitLoss !== null ? r.netProfitLoss : 'Pending DPR',
      'Status': r.netProfitLoss === null ? 'Pending DPR' : r.netProfitLoss >= 0 ? 'PROFIT' : 'LOSS'
    }));

    exportToExcel(exportData, 'Job_Costing_Report_01_11_2026_Onwards');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md shadow-blue-600/20">
            <Calculator className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Job Card Costing & P/L Sheet
              </h1>
              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full border border-blue-300 shadow-xs">
                Applicable: 01/11/2026 Onwards Only
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Strictly showing Job Cards created on or after 01/11/2026 with allocated reels • WIP Scrap & Paper Variance Diagnostics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchJobCards()}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Executive MD Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Costed Jobs */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Total Applicable Jobs</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground">
              {summary.totalCards}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              Jobs (01/11/2026+)
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-medium flex items-center gap-3">
            <span className="text-emerald-600 font-bold">{summary.profitCount} Profit</span>
            <span>•</span>
            <span className="text-red-600 font-bold">{summary.lossCount} Loss</span>
            <span>•</span>
            <span className="text-amber-600 font-bold">{summary.pendingCount} Pending</span>
          </div>
        </div>

        {/* Total Profit Jobs */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Profitable Jobs Value</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600">
              +₹{summary.totalProfit.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-700 font-semibold">
            {summary.profitCount} Jobs Saved Paper & Managed Scrap
          </div>
        </div>

        {/* Total Loss Jobs */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Loss Making Jobs Value</span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-red-600">
              -₹{summary.totalLoss.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-red-700 font-semibold">
            {summary.lossCount} Jobs Suffered Process/Paper Scrap
          </div>
        </div>

        {/* Net Overall P/L */}
        <div className={cn(
          "p-5 rounded-2xl border shadow-sm",
          summary.netOverall >= 0 
            ? "bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200" 
            : "bg-gradient-to-br from-red-50 to-rose-50/50 border-red-200"
        )}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span className={summary.netOverall >= 0 ? "text-emerald-900" : "text-red-900"}>
              Net Plant Costing P/L
            </span>
            <Sparkles className={cn("w-4 h-4", summary.netOverall >= 0 ? "text-emerald-600" : "text-red-600")} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={cn(
              "text-3xl font-black",
              summary.netOverall >= 0 ? "text-emerald-700" : "text-red-700"
            )}>
              {summary.netOverall >= 0 ? '+' : ''}₹{summary.netOverall.toLocaleString()}
            </span>
          </div>
          <div className={cn("mt-2 text-xs font-bold", summary.netOverall >= 0 ? "text-emerald-800" : "text-red-800")}>
            {summary.netOverall >= 0 ? '🟢 Net Profitable Across Filtered Jobs' : '🔴 Net Loss Across Filtered Jobs'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Job No, Customer, Job Name..."
            className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              filterType === 'ALL'
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            All (01/11/2026+) ({summary.totalCards})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('PROFIT')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              filterType === 'PROFIT'
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            Profit ({summary.profitCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('LOSS')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              filterType === 'LOSS'
                ? "bg-red-600 text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            Loss ({summary.lossCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('PENDING')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              filterType === 'PENDING'
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            Pending DPR ({summary.pendingCount})
          </button>
        </div>
      </div>

      {/* Main Costing Table - EXACT 5 COLUMNS REQUESTED */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-secondary/60 border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-36">1. Job Card Number</th>
                <th className="py-3.5 px-4 w-32">2. Job Card Date</th>
                <th className="py-3.5 px-4 min-w-[280px]">3. Job Name (Click for Details)</th>
                <th className="py-3.5 px-4 text-right w-36">4. Box Quantity (Nos)</th>
                <th className="py-3.5 px-4 text-center w-48">5. Profit / Loss (P/L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingJobCards ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <span className="font-semibold text-xs">Loading Job Costing Sheet...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Calculator className="w-10 h-10 text-muted-foreground/40" />
                      <p className="font-bold text-foreground">No Job Cards found for 01/11/2026 onwards</p>
                      <p className="text-xs">
                        As per rule, only Job Cards created on or after 01/11/2026 with allocated reels are displayed here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isProfit = row.netProfitLoss !== null && row.netProfitLoss >= 0;
                  const isLoss = row.netProfitLoss !== null && row.netProfitLoss < 0;
                  const isPending = row.netProfitLoss === null;

                  return (
                    <tr 
                      key={row.jobCardId} 
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      {/* Column 1: Job Card Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        <span className="px-2 py-1 bg-secondary rounded-lg border border-border/80">
                          {row.jobCardNo}
                        </span>
                      </td>

                      {/* Column 2: Job Card Date */}
                      <td className="py-3.5 px-4 font-medium text-muted-foreground">
                        {row.jobCardDate || '—'}
                      </td>

                      {/* Column 3: Job Name (CLICKABLE LINK) */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedCosting(row)}
                          className="text-left font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2 group-hover:translate-x-0.5 transition-all cursor-pointer"
                        >
                          <span>{row.jobName}</span>
                          <Eye className="w-3.5 h-3.5 text-blue-500 opacity-60 group-hover:opacity-100" />
                        </button>
                      </td>

                      {/* Column 4: Box Quantity (Nos) */}
                      <td className="py-3.5 px-4 text-right font-black text-foreground">
                        {row.orderBoxQty.toLocaleString()}
                        {row.manfBoxQty !== null && (
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Manf: {row.manfBoxQty.toLocaleString()}
                          </span>
                        )}
                      </td>

                      {/* Column 5: Profit / Loss (P/L) */}
                      <td className="py-3.5 px-4 text-center">
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => setSelectedCosting(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Pending DPR
                          </button>
                        ) : isProfit ? (
                          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            +₹{row.netProfitLoss?.toLocaleString()} (Profit)
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300 shadow-sm">
                            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                            -₹{Math.abs(row.netProfitLoss || 0).toLocaleString()} (Loss)
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal Window */}
      {selectedCosting && (
        <JobCostingDetailModal
          initialData={selectedCosting}
          isOpen={!!selectedCosting}
          onClose={() => setSelectedCosting(null)}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}

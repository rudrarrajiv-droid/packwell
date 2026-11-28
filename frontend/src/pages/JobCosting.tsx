import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Calculator, Search, Download,
  TrendingUp, TrendingDown, AlertTriangle, Layers,
  Eye, RefreshCw, Sparkles, Gauge, ArrowRight, FileText,
  Printer, X
} from 'lucide-react';
import { getAllJobCards } from '../lib/supabase/jobCardService';
import { getReels } from '../lib/supabase/reelService';
import { getFinishGoods } from '../lib/supabase/finishGoodService';
import { getProducts } from '../lib/supabase/productService';
import { getPurchaseOrders } from '../lib/supabase/purchaseOrderService';
import { useConversionCost } from '../hooks/useConversionCost';
import type { JobCostingData } from './job-costing/jobCostingTypes';
import { buildJobCostingData } from './job-costing/jobCostingService';
import JobCostingDetailModal from './job-costing/JobCostingDetailModal';
import PrintableJobCard from './job-cards/PrintableJobCard';
import { downloadJobCardPDF } from '../lib/jobCardPdfService';
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

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

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
  const createdIso = parseDateToIso(jc.createdAt || jc.created_at);
  if (createdIso) {
    if (createdIso >= CUTOFF_DATE) return true;
    if (createdIso < CUTOFF_DATE) return false;
  }

  const targetIso = parseDateToIso(jc.targetDate || jc.target_date);
  if (targetIso) {
    if (targetIso >= CUTOFF_DATE) return true;
    if (targetIso < CUTOFF_DATE) return false;
  }

  const jcNo = String(jc.jobCardNo || jc.job_card_no || '').trim();
  if (/^\d{7,}$/.test(jcNo)) {
    const ddmmyy = jcNo.slice(-6);
    const mm = parseInt(ddmmyy.slice(2, 4), 10);
    const yy = parseInt(ddmmyy.slice(4, 6), 10);
    if (yy > 26 || (yy === 26 && mm >= 11)) {
      return true;
    }
  }

  return false;
};

const isJobCardAllocated = (jc: any): boolean => {
  if (!jc || !jc.productSnapshot || !jc.productSnapshot.layers) return false;
  if (jc.reelAllocationSkipped) return true;
  const layers = jc.productSnapshot.layers || [];
  return layers.some(
    (l: any) =>
      (l.allocatedReels && Array.isArray(l.allocatedReels) && l.allocatedReels.length > 0) ||
      (l.allocatedReelNumber && l.allocatedReelWeight)
  );
};

const getPendingLabel = (row: JobCostingData): string => {
  const hasDpr = row.layers.some((l) => l.dprWeight !== null);
  if (!hasDpr) return 'Pending DPR';
  if (row.manfBoxQty === null) return 'Pending Manf Qty';
  if (!row.saleRatePerBox || row.saleRatePerBox <= 0) return 'Pending Rate';
  return 'Pending';
};

export default function JobCosting() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROFIT' | 'LOSS' | 'PENDING'>('ALL');
  const [selectedCosting, setSelectedCosting] = useState<JobCostingData | null>(null);
  const [viewingJobCard, setViewingJobCard] = useState<any | null>(null);

  const { standardRate } = useConversionCost();

  // 1. Fetch Job Cards
  const { data: jobCards = [], isLoading: loadingJobCards, refetch: refetchJobCards } = useQuery({
    queryKey: ['jobCards'],
    queryFn: getAllJobCards,
  });

  // 2. Fetch Reels Inventory for paper rates
  const { data: reels = [] } = useQuery({
    queryKey: ['reels-all'],
    queryFn: () => getReels() as Promise<any[]>,
  });

  // 3. Fetch Finish Goods, Master Data Products & POs for Auto Sale Rate lookup
  const { data: finishGoods = [] } = useQuery({
    queryKey: ['finishGoods'],
    queryFn: getFinishGoods,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: getPurchaseOrders,
  });

  const rateLookupContext = useMemo(
    () => ({ finishGoods, products, purchaseOrders, reels }),
    [finishGoods, products, purchaseOrders, reels]
  );

  // 4. Process Costing Rows (Strictly 01/11/2026 onwards + Reel Allocated only)
  const costingRows = useMemo(() => {
    return jobCards
      .filter((jc: any) => isJobCardFromNov1OrLater(jc) && isJobCardAllocated(jc))
      .map((jc: any) =>
        buildJobCostingData(jc, reels, {
          finishGoods,
          products,
          purchaseOrders,
          currentStandardConversionRate: standardRate,
        })
      );
  }, [jobCards, reels, finishGoods, products, purchaseOrders, standardRate]);

  // 5. Filter Rows
  const filteredRows = useMemo(() => {
    return costingRows.filter((item) => {
      if (filterType === 'PROFIT' && (item.netProfitLoss === null || item.netProfitLoss < 0)) return false;
      if (filterType === 'LOSS' && (item.netProfitLoss === null || item.netProfitLoss >= 0)) return false;
      if (filterType === 'PENDING' && item.netProfitLoss !== null) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNo = item.jobCardNo.toLowerCase().includes(q);
        const matchName = item.jobName.toLowerCase().includes(q);
        const matchCust = (item.customerName || '').toLowerCase().includes(q);
        if (!matchNo && !matchName && !matchCust) return false;
      }

      return true;
    });
  }, [costingRows, filterType, search]);

  // Executive Top Aggregates
  const summary = useMemo(() => {
    let totalProfit = 0;
    let totalLoss = 0;
    let totalSale = 0;
    let totalMfgCost = 0;
    let profitCount = 0;
    let lossCount = 0;
    let pendingCount = 0;

    filteredRows.forEach((r) => {
      if (r.netProfitLoss === null) {
        pendingCount++;
      } else {
        totalSale += r.totalSaleValue || 0;
        totalMfgCost += r.totalManufacturingCost || 0;
        if (r.netProfitLoss >= 0) {
          profitCount++;
          totalProfit += r.netProfitLoss;
        } else {
          lossCount++;
          totalLoss += Math.abs(r.netProfitLoss);
        }
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
      totalSale,
      totalMfgCost,
      netOverall,
    };
  }, [filteredRows]);

  const handleModalSaved = (updated: JobCostingData) => {
    setSelectedCosting(updated);
    queryClient.invalidateQueries({ queryKey: ['jobCards'] });
  };

  const handleExportExcel = () => {
    const exportData = filteredRows.map((r) => ({
      'Job Card No': r.jobCardNo,
      'Job Card Date': r.jobCardDate,
      Customer: r.customerName || '',
      'Job Name': r.jobName,
      'Order Box Qty': r.orderBoxQty,
      'Manufactured Box Qty': r.manfBoxQty ?? 'Pending',
      'Sale Rate (₹/Box)': r.saleRatePerBox ?? 'Pending',
      'Total Sale Value (₹)': r.totalSaleValue ?? 'Pending',
      'Actual DPR Weight (Kg)': r.totalDprWeight,
      'Paper Cost (DPR Value) (₹)': r.totalDprValue,
      'Conv. Rate Used (₹/Kg)': r.conversionRateUsed,
      'Conversion Cost (₹)': r.conversionCost,
      'Base Cost (Paper + Conv.) (₹)': r.baseManufacturingCost,
      '5% Margin (₹)': r.scrapAmount,
      'Total Mfg Cost (₹)': r.totalManufacturingCost,
      'Actual Net P/L (₹)': r.netProfitLoss !== null ? r.netProfitLoss : getPendingLabel(r),
      Status:
        r.netProfitLoss === null
          ? getPendingLabel(r)
          : r.netProfitLoss >= 0
          ? 'PROFIT'
          : 'LOSS',
      'Loss / Profit Reason (Remarks)': r.notes || '',
    }));

    exportToExcel(exportData, 'Job_Full_Costing_Report_01_11_2026_Onwards');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md shadow-blue-600/20">
            <Calculator className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Job Card Full Costing &amp; P/L Sheet
              </h1>
              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full border border-blue-300 shadow-xs">
                01/11/2026 Onwards
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Full Costing = (DPR Value + DPR Weight × Conv. Rate) + 5% vs Sale Value (Manf Qty × Sale Rate)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/conversion-cost"
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-black transition shadow-xs"
            title="Click to edit Standard Conversion Rate"
          >
            <Gauge className="w-4 h-4 text-amber-700" />
            <span>Std Conv: ₹{standardRate.toFixed(2)}/Kg</span>
            <ArrowRight className="w-3.5 h-3.5 text-amber-700" />
          </Link>

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

      {/* Executive Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Total Applicable Jobs</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground">{summary.totalCards}</span>
            <span className="text-xs text-muted-foreground font-semibold">Jobs (01/11/2026+)</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-medium flex items-center gap-3">
            <span className="text-emerald-600 font-bold">{summary.profitCount} Profit</span>
            <span>•</span>
            <span className="text-red-600 font-bold">{summary.lossCount} Loss</span>
            <span>•</span>
            <span className="text-amber-600 font-bold">{summary.pendingCount} Pending</span>
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Total Sale vs Mfg Cost</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-700">
              ₹{summary.totalSale.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 font-semibold">
            Total Mfg Cost: <strong>₹{summary.totalMfgCost.toLocaleString()}</strong>
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
            <span>Profit vs Loss Breakup</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-xl font-black text-emerald-600">
              +₹{summary.totalProfit.toLocaleString()}
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xl font-black text-red-600">
              -₹{summary.totalLoss.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-semibold">
            {summary.profitCount} Profitable • {summary.lossCount} Loss Making
          </div>
        </div>

        <div
          className={cn(
            'p-5 rounded-2xl border shadow-sm',
            summary.netOverall >= 0
              ? 'bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200'
              : 'bg-gradient-to-br from-red-50 to-rose-50/50 border-red-200'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span className={summary.netOverall >= 0 ? 'text-emerald-900' : 'text-red-900'}>
              Net Plant Actual P/L
            </span>
            <Sparkles
              className={cn('w-4 h-4', summary.netOverall >= 0 ? 'text-emerald-600' : 'text-red-600')}
            />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={cn(
                'text-3xl font-black',
                summary.netOverall >= 0 ? 'text-emerald-700' : 'text-red-700'
              )}
            >
              {summary.netOverall >= 0 ? '+' : '-'}₹{Math.abs(summary.netOverall).toLocaleString()}
            </span>
          </div>
          <div
            className={cn(
              'mt-2 text-xs font-bold',
              summary.netOverall >= 0 ? 'text-emerald-800' : 'text-red-800'
            )}
          >
            {summary.netOverall >= 0
              ? '🟢 Net Profitable Across Completed Jobs'
              : '🔴 Net Loss Across Completed Jobs'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Job No, Customer, Job Name..."
            className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              filterType === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            All ({summary.totalCards})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('PROFIT')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              filterType === 'PROFIT'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            Profit ({summary.profitCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('LOSS')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              filterType === 'LOSS'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            Loss ({summary.lossCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('PENDING')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              filterType === 'PENDING'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            Pending ({summary.pendingCount})
          </button>
        </div>
      </div>

      {/* Main Costing Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-secondary/60 border-b border-border text-muted-foreground font-black uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-40">1. Job Card No</th>
                <th className="py-3.5 px-4 w-28">2. Date</th>
                <th className="py-3.5 px-4 min-w-[240px]">3. Job Name (Click for Details)</th>
                <th className="py-3.5 px-4 text-right w-32">4. Box Qty</th>
                <th className="py-3.5 px-4 text-right w-36">5. Sale Value</th>
                <th className="py-3.5 px-4 text-right w-40">6. Mfg Cost</th>
                <th className="py-3.5 px-4 text-center w-48">7. Actual P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingJobCards ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <span className="font-semibold text-xs">Loading Job Costing Sheet...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
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
                  const isPending = row.netProfitLoss === null;
                  const hasDpr = row.layers.some((l) => l.dprWeight !== null);

                  return (
                    <tr key={row.jobCardId} className="hover:bg-muted/30 transition-colors group">
                      {/* 1. Job Card No (Clickable Link to Costing & Production Job Card) */}
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCosting(row)}
                            className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:border-blue-300 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs group/btn"
                            title="Click to open Job Card Costing & P/L breakdown"
                          >
                            <span>{row.jobCardNo}</span>
                            <Eye className="w-3 h-3 text-blue-500 opacity-60 group-hover/btn:opacity-100 shrink-0" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rawJc = jobCards.find((jc: any) => jc.id === row.jobCardId || jc.jobCardNo === row.jobCardNo);
                              if (rawJc) setViewingJobCard(rawJc);
                            }}
                            className="p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
                            title="Printable / Original Production Job Card Dekhein"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* 2. Date */}
                      <td className="py-3.5 px-4 font-medium text-muted-foreground">
                        {row.jobCardDate || '—'}
                      </td>

                      {/* 3. Job Name */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedCosting(row)}
                          className="text-left font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2 group-hover:translate-x-0.5 transition-all cursor-pointer"
                        >
                          <span>{row.jobName}</span>
                          <Eye className="w-3.5 h-3.5 text-blue-500 opacity-60 group-hover:opacity-100 shrink-0" />
                        </button>
                        {row.customerName && (
                          <span className="block text-[10px] text-muted-foreground font-medium mt-0.5">
                            {row.customerName}
                          </span>
                        )}
                        {row.notes && (
                          <span
                            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-semibold max-w-[220px] truncate"
                            title={row.notes}
                          >
                            <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{row.notes}</span>
                          </span>
                        )}
                      </td>

                      {/* 4. Box Qty */}
                      <td className="py-3.5 px-4 text-right font-black text-foreground">
                        {row.orderBoxQty.toLocaleString()}
                        <span className="block text-[10px] font-semibold text-muted-foreground">
                          {row.manfBoxQty !== null
                            ? `Manf: ${row.manfBoxQty.toLocaleString()}`
                            : 'Manf: Pending'}
                        </span>
                      </td>

                      {/* 5. Sale Value */}
                      <td className="py-3.5 px-4 text-right">
                        {row.totalSaleValue !== null ? (
                          <>
                            <span className="font-black text-indigo-800">
                              ₹{row.totalSaleValue.toLocaleString()}
                            </span>
                            <span className="block text-[10px] font-semibold text-muted-foreground">
                              @ ₹{row.saleRatePerBox}/Box
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {row.saleRatePerBox ? `@ ₹${row.saleRatePerBox}/Box` : 'Rate Missing'}
                          </span>
                        )}
                      </td>

                      {/* 6. Total Mfg Cost */}
                      <td className="py-3.5 px-4 text-right">
                        {hasDpr ? (
                          <>
                            <span className="font-black text-slate-900">
                              ₹{row.totalManufacturingCost.toLocaleString()}
                            </span>
                            <span className="block text-[10px] font-semibold text-muted-foreground">
                              {Math.round(row.totalDprWeight).toLocaleString()} Kg @ ₹{row.conversionRateUsed}/Kg + 5%
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Std ₹{row.conversionRateUsed}/Kg
                          </span>
                        )}
                      </td>

                      {/* 7. Actual P/L */}
                      <td className="py-3.5 px-4 text-center">
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => setSelectedCosting(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            {getPendingLabel(row)}
                          </button>
                        ) : isProfit ? (
                          <button
                            type="button"
                            onClick={() => setSelectedCosting(row)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs hover:bg-emerald-200 transition-colors cursor-pointer"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            +₹{row.netProfitLoss?.toLocaleString()} (Profit)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedCosting(row)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300 shadow-xs hover:bg-red-200 transition-colors cursor-pointer"
                          >
                            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                            -₹{Math.abs(row.netProfitLoss || 0).toLocaleString()} (Loss)
                          </button>
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

      {/* Detailed Costing & P/L Modal Window */}
      {selectedCosting && (
        <JobCostingDetailModal
          initialData={selectedCosting}
          isOpen={!!selectedCosting}
          onClose={() => setSelectedCosting(null)}
          onSaved={handleModalSaved}
          currentStandardRate={standardRate}
          rateLookupContext={rateLookupContext}
          onViewJobCard={() => {
            const rawJc = jobCards.find(
              (jc: any) =>
                jc.id === selectedCosting.jobCardId ||
                jc.jobCardNo === selectedCosting.jobCardNo
            );
            if (rawJc) setViewingJobCard(rawJc);
          }}
        />
      )}

      {/* Production Job Card View & Print Modal */}
      {viewingJobCard && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">
                  Production Job Card: {viewingJobCard.jobCardNo}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await downloadJobCardPDF({
                      elementId: 'job-card-print-area',
                      jobCardNo: viewingJobCard.jobCardNo,
                      customerName: viewingJobCard.customerName,
                    });
                  }}
                  className="flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print Job Card
                </button>
                <button
                  type="button"
                  onClick={() => setViewingJobCard(null)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100 flex justify-center" id="print-job-card-modal">
              <div className="max-w-[210mm] w-full bg-white p-4 rounded-lg shadow-sm">
                <PrintableJobCard jobCard={viewingJobCard} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

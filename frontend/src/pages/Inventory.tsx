import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, ArrowDownToLine, ArrowUpFromLine, History, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { getReels, getReelTransactions } from '../lib/supabase/reelService';
import BulkInwardModal from './inventory/BulkInwardModal';
import OutwardModal from './inventory/OutwardModal';
import ReelHistoryModal from './inventory/ReelHistoryModal';
import ExportButtons from '../components/ExportButtons';
import JobFinderTab from './inventory/JobFinderTab';
import ReverseCalculatorTab from './inventory/ReverseCalculatorTab';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'EMPTY' | 'ISSUED_REPORT' | 'PURCHASE_REPORT' | 'MONTHLY_SUMMARY' | 'JOB_FINDER' | 'REVERSE_CALC'>('ACTIVE');
  const [isBulkInwardOpen, setIsBulkInwardOpen] = useState(false);
  const [isOutwardOpen, setIsOutwardOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [paperTypeFilter, setPaperTypeFilter] = useState('ALL');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [metricFilter, setMetricFilter] = useState<'CLOSING' | 'OPENING' | 'IN' | 'OUT'>('CLOSING');
  const [metricMonth, setMetricMonth] = useState<string>(new Date().toISOString().substring(0, 7));

  const { data: reels = [], isLoading: loadingReels, refetch } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['reelTransactions'],
    queryFn: () => getReelTransactions() as Promise<any[]>,
    enabled: activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT' || activeTab === 'MONTHLY_SUMMARY' || metricFilter !== 'CLOSING'
  });

  const sortedAndFilteredReels = useMemo(() => {
    let result = reels.filter(r => {
      const matchesSearch = (r.reelNumber?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (r.paperType?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (r.bf?.toLowerCase() || '').includes(search.toLowerCase());
        
      if (!matchesSearch) return false;
      
      const pt = (r.paperType || '').toUpperCase();
      if (paperTypeFilter === 'ALL') return true;
      if (paperTypeFilter === 'OTHERS') return !['SK', 'VK', 'DUPLEX', 'HWC'].includes(pt);
      return pt === paperTypeFilter;
    });

    // Filter by Active vs Empty
    result = result.filter(r => {
      const bal = Number(r.currentBalance) || 0;
      if (activeTab === 'ACTIVE') return bal > 0;
      if (activeTab === 'EMPTY') return bal <= 0;
      return false;
    });

    // Sequence: DUPLEX/HWC -> SK -> VK -> Others
    const getTypeRank = (type: string) => {
      const t = (type || '').toUpperCase();
      if (t.includes('DUPLEX') || t.includes('HWC')) return 1;
      if (t === 'SK') return 2;
      if (t === 'VK') return 3;
      return 4;
    };

    result.sort((a, b) => {
      const rankA = getTypeRank(a.paperType);
      const rankB = getTypeRank(b.paperType);
      if (rankA !== rankB) return rankA - rankB;

      // Size ascending
      const sizeA = Number(a.reelSize) || 0;
      const sizeB = Number(b.reelSize) || 0;
      if (sizeA !== sizeB) return sizeA - sizeB;

      // BF ascending
      const bfA = Number(a.bf) || 0;
      const bfB = Number(b.bf) || 0;
      if (bfA !== bfB) return bfA - bfB;

      return (Number(a.gsm) || 0) - (Number(b.gsm) || 0);
    });

    return result;
  }, [reels, search, paperTypeFilter, activeTab]);

  const { totalReels, totalWeight, totalValue, shortReels, shortReelsWeight, fullReels, fullReelsWeight } = useMemo(() => {
    let tr = 0, tw = 0, tv = 0, sr = 0, sw = 0, fr = 0, fw = 0;

    if (metricFilter === 'CLOSING' || activeTab !== 'ACTIVE') {
      sortedAndFilteredReels.forEach(r => {
        const bal = Number(r.currentBalance) || 0;
        const origWt = Number(r.weight) || 0;
        tr++;
        tw += bal;
        tv += bal * (Number(r.rate) || 0);
        // Short reel = partially consumed (balance < original weight)
        if (origWt > 0 && bal < origWt) {
          sr++;
          sw += bal;
        } else {
          fr++;
          fw += bal;
        }
      });
    } else {
      // Include all reels (active + empty) that match the search/type filter
      // because historical metrics should include reels that became empty in this month.
      const baseFilteredReels = reels.filter(r => {
        const matchesSearch = (r.reelNumber?.toLowerCase() || '').includes(search.toLowerCase()) ||
          (r.paperType?.toLowerCase() || '').includes(search.toLowerCase()) ||
          (r.bf?.toLowerCase() || '').includes(search.toLowerCase());
          
        if (!matchesSearch) return false;
        
        const pt = (r.paperType || '').toUpperCase();
        if (paperTypeFilter === 'ALL') return true;
        if (paperTypeFilter === 'OTHERS') return !['SK', 'VK', 'DUPLEX', 'HWC'].includes(pt);
        return pt === paperTypeFilter;
      });

      baseFilteredReels.forEach(r => {
          if (metricFilter === 'OPENING') {
              let currentBal = Number(r.currentBalance) || 0;
              const futureTxs = transactions.filter(tx => tx.reelId === r.id && tx.date && tx.date >= `${metricMonth}-01`);
              let openingBal = currentBal;
              futureTxs.forEach(tx => {
                 if (tx.type === 'INWARD') openingBal -= (Number(tx.quantity) || 0);
                 else if (tx.type === 'OUTWARD') openingBal += (Number(tx.quantity) || 0);
              });
              if (Math.round(openingBal) > 0) {
                 tr++;
                 tw += openingBal;
                 tv += openingBal * (Number(r.rate) || 0);
              }
          } else if (metricFilter === 'IN') {
              const monthTxs = transactions.filter(tx => tx.reelId === r.id && tx.type === 'INWARD' && tx.date && tx.date.startsWith(metricMonth));
              let inW = monthTxs.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
              if (inW > 0) {
                 tr++; 
                 tw += inW;
                 tv += inW * (Number(r.rate) || 0);
              }
          } else if (metricFilter === 'OUT') {
              const monthTxs = transactions.filter(tx => tx.reelId === r.id && tx.type === 'OUTWARD' && tx.date && tx.date.startsWith(metricMonth));
              let outW = monthTxs.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
              if (outW > 0) {
                 tr++; 
                 tw += outW;
                 tv += outW * (Number(r.rate) || 0);
              }
          }
      });
    }

    return { totalReels: tr, totalWeight: Math.round(tw), totalValue: Math.round(tv), shortReels: sr, shortReelsWeight: Math.round(sw), fullReels: fr, fullReelsWeight: Math.round(fw) };
  }, [reels, search, paperTypeFilter, sortedAndFilteredReels, metricFilter, metricMonth, transactions, activeTab]);

  // Generate Issued Report
  const issuedReportData = useMemo(() => {
    if (activeTab !== 'ISSUED_REPORT' && activeTab !== 'PURCHASE_REPORT') return [];
    
    const isPurchase = activeTab === 'PURCHASE_REPORT';

    const txForDate = transactions.filter(tx => {
      if (isPurchase) {
        if (tx.type !== 'INWARD') return false;
      } else {
        if (tx.type !== 'OUTWARD') return false;
      }
      if (!tx.date) return false;
      return tx.date.startsWith(reportDate);
    });

    // Group by Reel Type, Size, BF
    const groups: Record<string, { type: string, size: number, bf: string, count: Set<string>, totalWeight: number }> = {};
    
    txForDate.forEach(tx => {
      // find reel to get its properties
      const reel = reels.find(r => r.id === tx.reelId);
      if (!reel) return;
      
      const type = (reel.paperType || '').toUpperCase();
      const size = Number(reel.reelSize) || 0;
      const bf = reel.bf || '';
      
      const key = `${type}_${size}_${bf}`;
      if (!groups[key]) {
        groups[key] = { type, size, bf, count: new Set(), totalWeight: 0 };
      }
      
      groups[key].count.add(tx.reelId);
      groups[key].totalWeight += Number(tx.quantity) || 0;
    });

    let report = Object.values(groups).map(g => ({
      ...g,
      count: g.count.size
    }));

    // Sort the report same as inventory
    const getTypeRank = (type: string) => {
      const t = (type || '').toUpperCase();
      if (t.includes('DUPLEX') || t.includes('HWC')) return 1;
      if (t === 'SK') return 2;
      if (t === 'VK') return 3;
      return 4;
    };

    report.sort((a, b) => {
      const rankA = getTypeRank(a.type);
      const rankB = getTypeRank(b.type);
      if (rankA !== rankB) return rankA - rankB;
      if (a.size !== b.size) return a.size - b.size;
      return Number(a.bf) - Number(b.bf);
    });

    return report;
  }, [transactions, reels, reportDate, activeTab]);

  const monthlySummaryData = useMemo(() => {
    if (activeTab !== 'MONTHLY_SUMMARY') return null;
    const yearMonth = reportDate.substring(0, 7); // e.g. "2026-08"
    
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    let openingReelsCount = 0;
    let openingWeight = 0;

    reels.forEach(reel => {
      let currentBal = Number(reel.currentBalance) || 0;
      const futureTxs = transactions.filter(tx => tx.reelId === reel.id && tx.date && tx.date >= `${yearMonth}-01`);
      
      let openingBal = currentBal;
      futureTxs.forEach(tx => {
         if (tx.type === 'INWARD') openingBal -= (Number(tx.quantity) || 0);
         else if (tx.type === 'OUTWARD') openingBal += (Number(tx.quantity) || 0);
      });
      
      if (Math.round(openingBal) > 0) {
         openingReelsCount++;
         openingWeight += openingBal;
      }
    });

    const summary = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${yearMonth}-${i.toString().padStart(2, '0')}`;
      const dayTxs = transactions.filter(tx => tx.date && tx.date.startsWith(dateStr));
      
      let inWeight = 0;
      let outWeight = 0;
      const inReelIds = new Set<string>();
      const outReelIds = new Set<string>();

      dayTxs.forEach(tx => {
        if (tx.type === 'INWARD') {
          inReelIds.add(tx.reelId);
          inWeight += Number(tx.quantity) || 0;
        } else if (tx.type === 'OUTWARD') {
          outReelIds.add(tx.reelId);
          outWeight += Number(tx.quantity) || 0;
        }
      });

      if (inReelIds.size > 0 || outReelIds.size > 0) {
        summary.push({
          date: dateStr,
          day: i,
          inReels: inReelIds.size,
          inWeight: Math.round(inWeight),
          outReels: outReelIds.size,
          outWeight: Math.round(outWeight)
        });
      }
    }
    return {
      openingReels: openingReelsCount,
      openingWeight: Math.round(openingWeight),
      rows: summary
    };
  }, [transactions, reels, reportDate, activeTab]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reel Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage paper reels and transactions</p>
        </div>
        <div className="flex gap-3">
          {activeTab !== 'ISSUED_REPORT' && (
            <ExportButtons 
              data={sortedAndFilteredReels} 
              filenamePrefix="ReelInventory"
              title="Reel Inventory Status"
              columnMap={{
                'reelNumber': 'Reel No',
                'paperType': 'Type',
                'reelSize': 'Size',
                'bf': 'BF',
                'gsm': 'GSM',
                'weight': 'Initial Wt',
                'currentBalance': 'Balance Wt',
                'supplierName': 'Supplier',
                'manufacturerName': 'Manufacturer'
              }}
            />
          )}
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-secondary/80 transition-colors"
          >
            <History className="w-4 h-4 mr-2 text-primary" />
            Reel History
          </button>
          
          <button 
            onClick={() => setIsOutwardOpen(true)}
            className="bg-red-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-red-700 transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Outward (Issue)
          </button>
          
          <button 
            onClick={() => setIsBulkInwardOpen(true)}
            className="bg-green-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-green-700 transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Bulk Inward (IN)
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'ACTIVE' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Active Reels
        </button>
        <button
          onClick={() => setActiveTab('EMPTY')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'EMPTY' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Empty/Nil Reels
        </button>
        <button
          onClick={() => setActiveTab('ISSUED_REPORT')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'ISSUED_REPORT' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Issue Date Report
        </button>
        <button
          onClick={() => setActiveTab('PURCHASE_REPORT')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'PURCHASE_REPORT' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Purchase Date Report
        </button>
        <button
          onClick={() => setActiveTab('MONTHLY_SUMMARY')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'MONTHLY_SUMMARY' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly Summary
        </button>
        <button
          onClick={() => setActiveTab('JOB_FINDER')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2 flex items-center gap-1",
            activeTab === 'JOB_FINDER' ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          🔍 Job Finder
        </button>
        <button
          onClick={() => setActiveTab('REVERSE_CALC')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2 flex items-center gap-1",
            activeTab === 'REVERSE_CALC' ? "border-amber-600 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          🧮 Reverse Calculator
        </button>
      </div>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-lg overflow-hidden flex flex-col">
        {/* Job Finder Tab — no toolbar, rendered directly */}
        {activeTab === 'JOB_FINDER' ? (
          <div className="flex-1 overflow-y-auto">
            <JobFinderTab />
          </div>
        ) : activeTab === 'REVERSE_CALC' ? (
          <div className="flex-1 overflow-y-auto bg-amber-50/10">
            <ReverseCalculatorTab />
          </div>
        ) : (
        <>
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
          {(activeTab !== 'ISSUED_REPORT' && activeTab !== 'PURCHASE_REPORT' && activeTab !== 'MONTHLY_SUMMARY') ? (
            <>
              <div className="flex gap-4 items-center">
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search reels by No, Type, BF..." 
                    className="pl-9 pr-4 py-2 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                
                <select
                  value={paperTypeFilter}
                  onChange={e => setPaperTypeFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                >
                  <option value="ALL">All Types</option>
                  <option value="SK">SK</option>
                  <option value="VK">VK</option>
                  <option value="DUPLEX">DUPLEX</option>
                  <option value="OTHERS">Others</option>
                </select>

                {activeTab === 'ACTIVE' && (
                  <>
                    <select
                      value={metricFilter}
                      onChange={e => setMetricFilter(e.target.value as any)}
                      className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium text-blue-700"
                    >
                      <option value="CLOSING">Closing (Current Bal)</option>
                      <option value="OPENING">Opening</option>
                      <option value="IN">Inward (IN)</option>
                      <option value="OUT">Outward (OUT)</option>
                    </select>

                    {metricFilter !== 'CLOSING' && (
                      <input 
                        type="month"
                        value={metricMonth}
                        onChange={e => setMetricMonth(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                      />
                    )}
                  </>
                )}
              </div>
              
              <div className="flex gap-3 text-sm flex-wrap">
                <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                  कुल Reels: <span className="font-bold">{totalReels}</span>
                </div>
                <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                  कुल Weight: <span className="font-bold">{totalWeight.toLocaleString()} Kg</span>
                </div>
                <div className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded-md font-medium border border-orange-200 shadow-sm" title="Short Reels = partially consumed reels">
                  Short Reels: <span className="font-bold">{shortReels}</span> &nbsp;|&nbsp; <span className="font-bold">{shortReelsWeight.toLocaleString()} Kg</span>
                </div>
                <div className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-md font-medium border border-blue-200 shadow-sm" title="Full Reels = untouched / new reels">
                  Full Reels: <span className="font-bold">{fullReels}</span> &nbsp;|&nbsp; <span className="font-bold">{fullReelsWeight.toLocaleString()} Kg</span>
                </div>
                <div className="bg-green-100 text-green-800 px-3 py-1.5 rounded-md font-medium border border-green-200 shadow-sm">
                  Total Value: <span className="font-bold">Rs. {totalValue.toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-4 items-center">
               <label className="font-medium text-sm flex items-center">
                 <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                 {activeTab === 'MONTHLY_SUMMARY' ? 'Select Month:' : 'Select Date:'}
               </label>
               <input 
                 type={activeTab === 'MONTHLY_SUMMARY' ? 'month' : 'date'}
                 value={activeTab === 'MONTHLY_SUMMARY' ? reportDate.substring(0, 7) : reportDate}
                 onChange={e => setReportDate(activeTab === 'MONTHLY_SUMMARY' ? `${e.target.value}-01` : e.target.value)}
                 className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
               />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {(loadingReels || ((activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT' || activeTab === 'MONTHLY_SUMMARY') && loadingTx)) ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : activeTab === 'MONTHLY_SUMMARY' ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-blue-600 bg-blue-50/30">IN (Reels)</th>
                  <th className="px-6 py-3 font-medium text-blue-600 bg-blue-50/30">IN (Weight)</th>
                  <th className="px-6 py-3 font-medium text-red-600 bg-red-50/30">OUT (Reels)</th>
                  <th className="px-6 py-3 font-medium text-red-600 bg-red-50/30">OUT (Weight)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthlySummaryData && (
                  <tr className="bg-amber-50/50 hover:bg-amber-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-amber-800">
                      Opening Balance (1st {new Date(reportDate).toLocaleString('en-US', { month: 'short' })})
                    </td>
                    <td className="px-6 py-4 font-bold text-amber-700" colSpan={4}>
                      {monthlySummaryData.openingReels} Reels | {monthlySummaryData.openingWeight.toLocaleString()} Kg
                    </td>
                  </tr>
                )}
                {monthlySummaryData?.rows.map((row: any) => (
                  <tr key={row.date} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">
                      {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-bold text-blue-600 bg-blue-50/10">{row.inReels || '-'}</td>
                    <td className="px-6 py-4 font-bold text-blue-600 bg-blue-50/10">{row.inWeight ? `${row.inWeight.toLocaleString()} Kg` : '-'}</td>
                    <td className="px-6 py-4 font-bold text-red-600 bg-red-50/10">{row.outReels || '-'}</td>
                    <td className="px-6 py-4 font-bold text-red-600 bg-red-50/10">{row.outWeight ? `${row.outWeight.toLocaleString()} Kg` : '-'}</td>
                  </tr>
                ))}
                {monthlySummaryData?.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No IN or OUT transactions found for {reportDate.substring(0, 7)}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {(monthlySummaryData?.rows.length ?? 0) > 0 && (
                <tfoot className="bg-secondary/80 font-bold border-t-2 border-border sticky bottom-0">
                  <tr>
                    <td className="px-6 py-4 text-right text-foreground uppercase tracking-wider text-xs">Monthly Total:</td>
                    <td className="px-6 py-4 text-blue-700 text-base bg-blue-100/50">{monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.inReels, 0)}</td>
                    <td className="px-6 py-4 text-blue-700 text-base bg-blue-100/50">{monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.inWeight, 0).toLocaleString()} Kg</td>
                    <td className="px-6 py-4 text-red-700 text-base bg-red-100/50">{monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.outReels, 0)}</td>
                    <td className="px-6 py-4 text-red-700 text-base bg-red-100/50">{monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.outWeight, 0).toLocaleString()} Kg</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT') ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Paper Type</th>
                  <th className="px-6 py-3 font-medium">Reel Size</th>
                  <th className="px-6 py-3 font-medium">BF</th>
                  <th className="px-6 py-3 font-medium text-blue-600">No. of Reels {activeTab === 'PURCHASE_REPORT' ? 'Purchased' : 'Issued'}</th>
                  <th className="px-6 py-3 font-medium text-red-600">Total Weight {activeTab === 'PURCHASE_REPORT' ? 'Purchased' : 'Issued'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {issuedReportData.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">{row.type}</td>
                    <td className="px-6 py-4 font-medium">{row.size}"</td>
                    <td className="px-6 py-4 font-medium">{row.bf}</td>
                    <td className="px-6 py-4 text-blue-600 font-bold">{row.count}</td>
                    <td className="px-6 py-4 text-red-600 font-bold">{Math.round(row.totalWeight)} Kg</td>
                  </tr>
                ))}
                {issuedReportData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No {activeTab === 'PURCHASE_REPORT' ? 'inward' : 'outward'} transactions found for {new Date(reportDate).toLocaleDateString('en-IN')}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {issuedReportData.length > 0 && (
                <tfoot className="bg-secondary/80 font-bold border-t-2 border-border sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right text-foreground uppercase tracking-wider text-xs">Total for Date:</td>
                    <td className="px-6 py-4 text-blue-700 text-base">{issuedReportData.reduce((sum: number, r: any) => sum + r.count, 0)}</td>
                    <td className="px-6 py-4 text-red-700 text-base">{Math.round(issuedReportData.reduce((sum: number, r: any) => sum + r.totalWeight, 0))} Kg</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Reel No</th>
                  <th className="px-6 py-3 font-medium">Specs (Type/Size/BF/GSM)</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Rate</th>
                  <th className="px-6 py-3 font-medium text-blue-600">Initial Wt</th>
                  <th className="px-6 py-3 font-medium text-red-600">Consumed</th>
                  <th className="px-6 py-3 font-medium text-green-600">Balance</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedAndFilteredReels.map((reel: any) => {
                  const consumed = (Number(reel.weight) || 0) - (Number(reel.currentBalance) || 0);
                  
                  return (
                    <tr key={reel.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground">{reel.reelNumber}</td>
                      <td className="px-6 py-4 font-medium">
                        {reel.paperType} | {reel.reelSize}" | {reel.bf} BF | {reel.gsm} GSM
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="text-foreground">{reel.supplierName || '-'}</div>
                        {reel.manufacturerName && reel.manufacturerName !== reel.supplierName && (
                          <div className="text-xs">Mfr: {reel.manufacturerName}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-700">
                        {reel.rate ? `₹${Number(reel.rate).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-blue-600">{Math.round(reel.weight)} Kg</td>
                      <td className="px-6 py-4 text-red-600">{consumed > 0 ? `${Math.round(consumed)} Kg` : '-'}</td>
                      <td className="px-6 py-4 font-bold text-green-600">{Math.round(reel.currentBalance)} Kg</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {reel.inwardDate ? new Date(reel.inwardDate).toLocaleDateString('en-IN') : '-'}
                      </td>
                    </tr>
                  );
                })}
                {sortedAndFilteredReels.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No {activeTab === 'EMPTY' ? 'empty' : 'active'} reels found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </>
        )}
      </div>

      {isBulkInwardOpen && (
        <BulkInwardModal 
          reels={reels}
          onClose={() => setIsBulkInwardOpen(false)} 
          onSuccess={() => {
            setIsBulkInwardOpen(false);
            refetch();
          }} 
        />
      )}

      {isOutwardOpen && (
        <OutwardModal
          reels={reels}
          onClose={() => setIsOutwardOpen(false)}
          onSuccess={() => {
            setIsOutwardOpen(false);
            refetch();
          }}
        />
      )}

      {isHistoryOpen && (
        <ReelHistoryModal
          reels={reels}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
    </div>
  );
}

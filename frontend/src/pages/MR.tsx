import React, { useState, useEffect, useMemo } from 'react';
import ExportButtons from '../components/ExportButtons';
import { useQuery } from '@tanstack/react-query';
import { getReels, getReelTransactions } from '../lib/supabase/reelService';
import { getFinishGoods } from '../lib/supabase/finishGoodService';
import { getRawMaterials } from '../lib/supabase/rmService';
import { getScrapEntries } from '../lib/supabase/scrapService';
import { getOrCreateMonthlyReport, saveMonthlyExpense } from '../lib/supabase/mrService';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Save, Printer } from 'lucide-react';
import { format } from 'date-fns';

const EXPENSE_CATEGORIES = [
  "Engineer Food and Lodge Expense",
  "Interest on OD A/c",
  "Freight Outward Charges",
  "Salary with Director Remuneration",
  "Client Welfare / Commission",
  "Staff Welfare & Pantry Exp.",
  "Freight Inward Charges",
  "Conveyance & Bike Petrol Expense",
  "AMC Charges and Factory Insurance Exp",
  "Machine Exp",
  "Factory Rent Exp",
  "Plant Exp",
  "Office & Stationery Exp",
  "Legal Expenses",
  "DG Diesel",
  "DG Rent",
  "Electricity Bill",
  "LPG Cylinder",
  "Forklift Diesel",
  "Consumable Goods (Excl. Gas)",
];

const SALES_CATEGORIES = [
  "Diya Industries",
  "PP LABELS",
  "RADHE RADHE",
  "PI",
  "TALLY DATA"
];

export default function MR() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for manual inputs so it feels fast
  const [manualData, setManualData] = useState<Record<string, number>>({});
  
  const { data: reels = [] } = useQuery({ queryKey: ['reels'], queryFn: getReels });
  const { data: reelTxns = [] } = useQuery({ queryKey: ['reelTransactions'], queryFn: getReelTransactions });
  const { data: fgList = [] } = useQuery({ queryKey: ['finishGoods'], queryFn: getFinishGoods });
  const { data: rmList = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: getRawMaterials });
  const { data: scrapList = [] } = useQuery({ queryKey: ['scrapEntries'], queryFn: getScrapEntries });
  const { data: report, refetch: refetchReport } = useQuery({
    queryKey: ['mrReport', currentMonth],
    queryFn: () => getOrCreateMonthlyReport(currentMonth, user?.name || 'System')
  });

  useEffect(() => {
    if (report?.expenses) {
      const map: Record<string, number> = {};
      report.expenses.forEach(e => {
        map[e.name] = e.amount;
      });
      setManualData(map);
    }
  }, [report]);

  const handleManualChange = (name: string, value: string) => {
    setManualData(prev => ({ ...prev, [name]: Number(value) || 0 }));
  };

  const handleSave = async () => {
    if (!report?.id) return;
    setIsSaving(true);
    try {
      const promises = Object.entries(manualData).map(([name, amount]) => 
        saveMonthlyExpense(report.id!, name, amount, user?.name || 'System')
      );
      await Promise.all(promises);
      refetchReport();
      alert('Data Saved Successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save data');
    }
    setIsSaving(false);
  };

  // --- AUTOMATIC CALCULATIONS ---

  // 1. PAPER INVENTORY
  const paperStats = useMemo(() => {
    const stats: Record<string, { opnQty: number, opnAmt: number, purQty: number, purAmt: number, conQty: number, conAmt: number, cloQty: number, cloAmt: number }> = {
      "Semi Kraft (SK)": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
      "Virgin Kraft (VK)": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
      "Duplex / Chennai": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
    };

    // Helper to map reelId to Paper Type and Rate
    const reelMap = new Map<string, { type: string, rate: number }>();
    
    reels.forEach(r => {
      let type = "Semi Kraft (SK)";
      const pt = (r.paperType || '').toLowerCase();
      if (pt.includes('virgin') || pt.includes('vk')) type = "Virgin Kraft (VK)";
      if (pt.includes('chennai') || pt.includes('duplex')) type = "Duplex / Chennai";
      
      reelMap.set(r.id!, { type, rate: r.rate || 0 });
    });

    const monthStart = `${currentMonth}-01`;
    const nextMonthDate = new Date(monthStart);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEnd = nextMonthDate.toISOString().split('T')[0];

    reelTxns.forEach(txn => {
      const reelInfo = reelMap.get(txn.reelId);
      if (!reelInfo) return; // Skip if we can't find the reel (shouldn't happen)
      
      const { type, rate } = reelInfo;
      const date = txn.date;
      const qty = txn.quantity;
      const amt = qty * rate;

      if (date < monthStart) {
        // Opening balance calculation
        if (txn.type === 'INWARD') {
          stats[type].opnQty += qty;
          stats[type].opnAmt += amt;
        } else if (txn.type === 'OUTWARD' || txn.type === 'ALLOCATION') {
          stats[type].opnQty -= qty;
          stats[type].opnAmt -= amt;
        }
      } else if (date >= monthStart && date < monthEnd) {
        // Current month calculation
        if (txn.type === 'INWARD') {
          stats[type].purQty += qty;
          stats[type].purAmt += amt;
        } else if (txn.type === 'OUTWARD' || txn.type === 'ALLOCATION') {
          stats[type].conQty += qty;
          stats[type].conAmt += amt;
        }
      }
    });

    // Calculate closing balance = opening + purchase - consumed
    Object.keys(stats).forEach(type => {
      stats[type].cloQty = stats[type].opnQty + stats[type].purQty - stats[type].conQty;
      stats[type].cloAmt = stats[type].opnAmt + stats[type].purAmt - stats[type].conAmt;
    });

    return stats;
  }, [reels, reelTxns, currentMonth]);

  const paperTotals = Object.values(paperStats).reduce((acc, curr) => ({
    opnQty: acc.opnQty + curr.opnQty,
    opnAmt: acc.opnAmt + curr.opnAmt,
    purQty: acc.purQty + curr.purQty,
    purAmt: acc.purAmt + curr.purAmt,
    conQty: acc.conQty + curr.conQty,
    conAmt: acc.conAmt + curr.conAmt,
    cloQty: acc.cloQty + curr.cloQty,
    cloAmt: acc.cloAmt + curr.cloAmt,
  }), { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 });

  // 2. STOCK VALUES
  const fgStockValue = useMemo(() => fgList.reduce((acc, curr) => acc + (curr.closingBalance * curr.rate), 0), [fgList]);
  const nonMovingStockValue = useMemo(() => fgList.reduce((acc, curr) => acc + (curr.nonMovingBalance * curr.rate), 0), [fgList]);
  const rmStockValue = useMemo(() => rmList.reduce((acc, curr) => acc + (curr.closingBalance * curr.rate), 0), [rmList]);
  const wipStockValue = manualData['STOCK:WIP'] || 0; // WIP is usually manual unless tracked in JobCards
  const grandTotalStock = fgStockValue + nonMovingStockValue + wipStockValue + paperTotals.cloAmt + rmStockValue;

  // 3. REVENUE (SALES + SCRAP)
  const cashScrapRevenue = useMemo(() => {
    return scrapList
      .filter(s => s.paymentType === 'CASH' && s.date.startsWith(currentMonth))
      .reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [scrapList, currentMonth]);

  const totalSaleWithoutGST = SALES_CATEGORIES.reduce((acc, cat) => acc + (manualData[`SALE:${cat}:WOGST`] || 0), 0) + cashScrapRevenue;
  const totalSaleWithGST = SALES_CATEGORIES.reduce((acc, cat) => acc + (manualData[`SALE:${cat}:WGST`] || 0), 0) + cashScrapRevenue;
  
  const creditNoteWithoutGST = manualData['SALE:CREDITNOTE:WOGST'] || 0;
  const creditNoteWithGST = manualData['SALE:CREDITNOTE:WGST'] || 0;

  const netSaleWithoutGST = totalSaleWithoutGST - creditNoteWithoutGST;
  const netSaleWithGST = totalSaleWithGST - creditNoteWithGST;

  // 4. PURCHASES
  const totalPurchaseWithoutGST = manualData['PURCHASE:TOTAL:WOGST'] || 0;
  const totalPurchaseWithGST = manualData['PURCHASE:TOTAL:WGST'] || 0;

  // 5. EXPENSES & PROFIT
  const totalExpenses = EXPENSE_CATEGORIES.reduce((acc, cat) => acc + (manualData[`EXP:${cat}`] || 0), 0);
  
  const diffWithoutGST = netSaleWithoutGST - totalPurchaseWithoutGST;
  const netProfit = diffWithoutGST - totalExpenses;

  const exportData = [
    { Category: 'Net Sale (w/o GST)', Amount: netSaleWithoutGST },
    { Category: 'Total Purchase (w/o GST)', Amount: totalPurchaseWithoutGST },
    { Category: 'Total Expenses', Amount: totalExpenses },
    { Category: 'Net Profit', Amount: netProfit },
    ...Object.entries(manualData).map(([key, val]) => ({ Category: key, Amount: val }))
  ];

  const exportMap = {
    'Category': 'Category/Item',
    'Amount': 'Amount (₹)'
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-white border-b border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
            Profit & Loss Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">Financial overview and monthly closing</p>
        </div>
        <div className="flex items-center gap-4 mt-4 sm:mt-0">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <input 
              type="month" 
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-3 py-1.5 bg-transparent border-none focus:ring-0 text-sm font-semibold text-slate-700"
            />
          </div>
          
          <ExportButtons 
            data={exportData} 
            filenamePrefix={`MR_Report_${currentMonth}`} 
            title={`Profit & Loss Report - ${currentMonth}`} 
            columnMap={exportMap} 
          />
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium shadow-sm hover:shadow active:scale-95"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Data
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium shadow-sm active:scale-95"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6 print:p-0 print:space-y-4 print:bg-white print:overflow-visible">
        
        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
            <p className="text-sm font-medium text-slate-500 mb-1">Net Sale (w/o GST)</p>
            <h3 className="text-3xl font-bold text-slate-800">₹ {netSaleWithoutGST.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-blue-600 mt-2 font-medium bg-blue-50 inline-block px-2 py-1 rounded-md">Total Sale - Credit Note</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
            <p className="text-sm font-medium text-slate-500 mb-1">Net Purchase (w/o GST)</p>
            <h3 className="text-3xl font-bold text-slate-800">₹ {totalPurchaseWithoutGST.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-amber-600 mt-2 font-medium bg-amber-50 inline-block px-2 py-1 rounded-md">Current Month Purchases</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total Expenses</p>
            <h3 className="text-3xl font-bold text-slate-800">₹ {totalExpenses.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-rose-600 mt-2 font-medium bg-rose-50 inline-block px-2 py-1 rounded-md">Sum of all overheads</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -mr-16 -mt-16"></div>
            <p className="text-sm font-medium text-indigo-200 mb-1">Net Profit</p>
            <h3 className={`text-3xl font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹ {netProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-xs text-indigo-300 mt-2 font-medium">Sales - Purchases - Expenses</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN - Revenue & Stocks */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Revenue Block */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Revenue & Adjustments</h3>
              </div>
              <div className="p-0 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium">Category</th>
                      <th className="px-6 py-3 text-right font-medium">w/o GST</th>
                      <th className="px-6 py-3 text-right font-medium">with GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {SALES_CATEGORIES.map(cat => (
                      <tr key={cat} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-3 font-medium text-slate-700 text-xs">{cat}</td>
                        <td className="px-4 py-2">
                          <input type="number" placeholder="0" value={manualData[`SALE:${cat}:WOGST`] || ''} onChange={e => handleManualChange(`SALE:${cat}:WOGST`, e.target.value)} className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-indigo-300 focus:ring-0 text-slate-700 transition-colors p-1" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" placeholder="0" value={manualData[`SALE:${cat}:WGST`] || ''} onChange={e => handleManualChange(`SALE:${cat}:WGST`, e.target.value)} className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-indigo-300 focus:ring-0 text-slate-700 transition-colors p-1" />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50/30">
                      <td className="px-6 py-3 font-semibold text-emerald-700 text-xs">SCRAP (CASH)</td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-700">{cashScrapRevenue.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-700">{cashScrapRevenue.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="bg-rose-50/30">
                      <td className="px-6 py-3 font-semibold text-rose-700 text-xs">CREDIT NOTE</td>
                      <td className="px-4 py-2">
                        <input type="number" placeholder="0" value={manualData['SALE:CREDITNOTE:WOGST'] || ''} onChange={e => handleManualChange('SALE:CREDITNOTE:WOGST', e.target.value)} className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-rose-300 focus:ring-0 text-rose-700 font-semibold p-1" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" placeholder="0" value={manualData['SALE:CREDITNOTE:WGST'] || ''} onChange={e => handleManualChange('SALE:CREDITNOTE:WGST', e.target.value)} className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-rose-300 focus:ring-0 text-rose-700 font-semibold p-1" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Block */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Total Purchase</h3>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Without GST</label>
                  <input type="number" placeholder="0" value={manualData['PURCHASE:TOTAL:WOGST'] || ''} onChange={e => handleManualChange('PURCHASE:TOTAL:WOGST', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">With GST</label>
                  <input type="number" placeholder="0" value={manualData['PURCHASE:TOTAL:WGST'] || ''} onChange={e => handleManualChange('PURCHASE:TOTAL:WGST', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                </div>
              </div>
            </div>

            {/* Stock Values Block */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Inventory Valuation</h3>
              </div>
              <div className="p-0">
                <ul className="divide-y divide-slate-50 text-sm">
                  <li className="flex justify-between px-6 py-4">
                    <span className="text-slate-600">Finish Goods Stock</span>
                    <span className="font-semibold text-slate-800">₹ {fgStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </li>
                  <li className="flex justify-between px-6 py-4 bg-slate-50/30">
                    <span className="text-slate-600">Non-Moving Stock</span>
                    <span className="font-semibold text-slate-800">₹ {nonMovingStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </li>
                  <li className="flex justify-between items-center px-6 py-3">
                    <span className="text-slate-600">Work in Process</span>
                    <div className="w-32">
                      <input type="number" placeholder="0" value={manualData['STOCK:WIP'] || ''} onChange={e => handleManualChange('STOCK:WIP', e.target.value)} className="w-full text-right bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                    </div>
                  </li>
                  <li className="flex justify-between px-6 py-4 bg-slate-50/30">
                    <span className="text-slate-600">Paper Stock</span>
                    <span className="font-semibold text-slate-800">₹ {paperTotals.cloAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </li>
                  <li className="flex justify-between px-6 py-4">
                    <span className="text-slate-600">Raw Material Stock</span>
                    <span className="font-semibold text-slate-800">₹ {rmStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </li>
                </ul>
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-t border-indigo-100 flex justify-between items-center">
                  <span className="font-bold text-indigo-900">Grand Total Stock</span>
                  <span className="text-xl font-bold text-indigo-700">₹ {grandTotalStock.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN - Expenses & Paper */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Paper Inventory Block */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Paper Inventory</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-4 text-left font-medium">Type</th>
                      <th colSpan={2} className="px-4 py-2 text-center font-medium border-b border-slate-100">Opening</th>
                      <th colSpan={2} className="px-4 py-2 text-center font-medium border-b border-slate-100">Purchase</th>
                      <th colSpan={2} className="px-4 py-2 text-center font-medium border-b border-slate-100">Consumed</th>
                      <th colSpan={2} className="px-4 py-2 text-center font-medium border-b border-slate-100">Closing</th>
                    </tr>
                    <tr>
                      <th></th>
                      <th className="px-2 py-2 text-right font-medium">Qty (kg)</th>
                      <th className="px-2 py-2 text-right font-medium">Amt (₹)</th>
                      <th className="px-2 py-2 text-right font-medium">Qty (kg)</th>
                      <th className="px-2 py-2 text-right font-medium">Amt (₹)</th>
                      <th className="px-2 py-2 text-right font-medium">Qty (kg)</th>
                      <th className="px-2 py-2 text-right font-medium">Amt (₹)</th>
                      <th className="px-2 py-2 text-right font-medium">Qty (kg)</th>
                      <th className="px-2 py-2 text-right font-medium">Amt (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(paperStats).map(([type, stats]) => (
                      <tr key={type} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{type}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.opnQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.opnAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.purQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.purAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.conQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{stats.conAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">{stats.cloQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">{stats.cloAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                    <tr className="bg-indigo-50/50 border-t border-indigo-100">
                      <td className="px-4 py-4 font-bold text-indigo-900">Total</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.opnQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.opnAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.purQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.purAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.conQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.conAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.cloQty.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                      <td className="px-2 py-4 text-right font-bold text-indigo-700">{paperTotals.cloAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses List */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">Operational Expenses</h3>
                <span className="text-xs font-medium bg-rose-100 text-rose-700 px-2 py-1 rounded-full">Total: ₹ {totalExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  <div className="divide-y divide-slate-50">
                    {EXPENSE_CATEGORIES.slice(0, 10).map(exp => (
                      <div key={exp} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors group">
                        <span className="text-sm text-slate-600 line-clamp-1 pr-4">{exp}</span>
                        <div className="w-24 sm:w-32 shrink-0">
                          <input 
                            type="number" 
                            placeholder="0"
                            value={manualData[`EXP:${exp}`] || ''} 
                            onChange={e => handleManualChange(`EXP:${exp}`, e.target.value)} 
                            className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-rose-300 focus:ring-0 text-slate-800 font-medium transition-colors p-1" 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {EXPENSE_CATEGORIES.slice(10, 20).map(exp => (
                      <div key={exp} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors group">
                        <span className="text-sm text-slate-600 line-clamp-1 pr-4">{exp}</span>
                        <div className="w-24 sm:w-32 shrink-0">
                          <input 
                            type="number" 
                            placeholder="0"
                            value={manualData[`EXP:${exp}`] || ''} 
                            onChange={e => handleManualChange(`EXP:${exp}`, e.target.value)} 
                            className="w-full text-right bg-transparent border-0 border-b border-transparent focus:border-rose-300 focus:ring-0 text-slate-800 font-medium transition-colors p-1" 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Difference Calculation Block */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Difference (Sales vs Paper Used)</h3>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-slate-500">Paper Used (w/o GST)</label>
                    <input type="number" placeholder="0" value={manualData['PAPER_USED:WOGST'] || ''} onChange={e => handleManualChange('PAPER_USED:WOGST', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-slate-500">Paper Used (with GST)</label>
                    <input type="number" placeholder="0" value={manualData['PAPER_USED:WGST'] || ''} onChange={e => handleManualChange('PAPER_USED:WGST', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
                
                <div className="mt-6 flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-slate-500 font-medium">Difference w/o GST</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">₹ {diffWithoutGST.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="hidden sm:block w-px h-10 bg-slate-200"></div>
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-slate-500 font-medium">Difference with GST</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">₹ {(netSaleWithGST - totalPurchaseWithGST).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

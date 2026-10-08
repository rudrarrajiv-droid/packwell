import React, { useMemo, useState } from 'react';
import { X, Calendar, Package, Factory, ChevronLeft, ArrowRight } from 'lucide-react';
import type { Reel, ReelTransaction } from '../lib/supabase/reelService';

interface TotalPaperPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  reels: Reel[];
  reelTxns: ReelTransaction[];
  currentMonth: string;
}

const formatINR = (val: number, decimals: number = 0) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
};

export default function TotalPaperPurchaseModal({
  isOpen,
  onClose,
  reels,
  reelTxns,
  currentMonth
}: TotalPaperPurchaseModalProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Close handler to reset state
  const handleClose = () => {
    setSelectedSupplier(null);
    setSelectedDate(null);
    onClose();
  };

  const { allPurchases, supplierTotals } = useMemo(() => {
    const reelMap = new Map<string, Reel>();
    reels.forEach(r => {
      reelMap.set(r.id!, r);
    });

    const monthStart = `${currentMonth}-01`;
    const nextMonthDate = new Date(`${currentMonth}-01`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEnd = nextMonthDate.toISOString().split('T')[0];

    const purchases = reelTxns
      .filter(txn => {
        if (txn.type !== 'INWARD') return false;
        const date = txn.date;
        if (!date || date < monthStart || date >= monthEnd) return false;
        return reelMap.has(txn.reelId);
      })
      .map(txn => {
        const reel = reelMap.get(txn.reelId)!;
        const qty = Number(txn.quantity) || 0;
        const rate = reel.rate || 0;
        
        let mappedType = "Semi Kraft";
        const pt = (reel.paperType || '').toLowerCase();
        if (pt.includes('virgin') || pt.includes('vk')) mappedType = "Virgin Kraft";
        else if (pt.includes('chennai') || pt.includes('duplex')) mappedType = "Chennai";

        // Extract just the YYYY-MM-DD from date if it has time
        const rawDate = txn.date;
        const dateString = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

        return {
          id: txn.id,
          date: dateString,
          vendor: reel.supplierName || 'Unknown Vendor',
          paperType: mappedType,
          size: reel.reelSize,
          bf: reel.bf,
          gsm: reel.gsm,
          qty: qty,
          amount: qty * rate,
          reelNo: reel.reelNumber || 'N/A'
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totals = new Map<string, { qty: number; amount: number }>();
    purchases.forEach(p => {
      const existing = totals.get(p.vendor) || { qty: 0, amount: 0 };
      totals.set(p.vendor, {
        qty: existing.qty + p.qty,
        amount: existing.amount + p.amount
      });
    });

    return { 
      allPurchases: purchases, 
      supplierTotals: Array.from(totals.entries()).map(([vendor, stats]) => ({
        vendor,
        ...stats
      })).sort((a, b) => b.qty - a.qty)
    };
  }, [reels, reelTxns, currentMonth]);

  if (!isOpen) return null;

  // Level 1 logic is `supplierTotals`
  // Level 2 logic: Group by Date for the selected supplier
  const supplierPurchases = selectedSupplier 
    ? allPurchases.filter(p => p.vendor === selectedSupplier)
    : [];

  const dateTotalsMap = new Map<string, { qty: number; amount: number }>();
  supplierPurchases.forEach(p => {
    const existing = dateTotalsMap.get(p.date) || { qty: 0, amount: 0 };
    dateTotalsMap.set(p.date, {
      qty: existing.qty + p.qty,
      amount: existing.amount + p.amount
    });
  });

  const dateTotals = Array.from(dateTotalsMap.entries()).map(([date, stats]) => ({
    date,
    ...stats
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Level 3 logic: Exact reels for selected supplier AND selected date
  const dateSpecificPurchases = selectedDate 
    ? supplierPurchases.filter(p => p.date === selectedDate)
    : [];

  const renderContent = () => {
    // LEVEL 3: Reel Wise Detail for a Specific Date
    if (selectedSupplier && selectedDate) {
      const totalQty = dateSpecificPurchases.reduce((sum, p) => sum + p.qty, 0);
      const totalAmt = dateSpecificPurchases.reduce((sum, p) => sum + p.amount, 0);

      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-500" />
            Reel-Wise Details ({new Date(selectedDate).toLocaleDateString('en-GB')})
          </h3>
          
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-center">Reel No</th>
                    <th className="px-4 py-3 text-center">Type</th>
                    <th className="px-4 py-3 text-center">Specs (Size/BF/GSM)</th>
                    <th className="px-4 py-3 text-right">Qty (Kgs)</th>
                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateSpecificPurchases.map((p, i) => (
                    <tr key={p.id || i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {new Date(p.date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-700 whitespace-nowrap">
                        {p.reelNo}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold">{p.paperType}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                        {p.size}" | {p.bf} BF | {p.gsm} GSM
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-600">{formatINR(p.qty)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">₹ {formatINR(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-slate-600 uppercase text-xs tracking-wider">Total</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{formatINR(totalQty)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">₹ {formatINR(totalAmt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // LEVEL 2: Date-Wise Summary for Selected Supplier
    if (selectedSupplier && !selectedDate) {
      const totalQty = dateTotals.reduce((sum, d) => sum + d.qty, 0);
      const totalAmt = dateTotals.reduce((sum, d) => sum + d.amount, 0);

      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Date-Wise Summary
          </h3>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Total Weight (Kgs)</th>
                    <th className="px-4 py-3 text-right">Total Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateTotals.map((d, i) => (
                    <tr key={d.date || i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {new Date(d.date).toLocaleDateString('en-GB')}
                      </td>
                      <td 
                        className="px-4 py-3 text-right font-bold text-indigo-600 cursor-pointer hover:underline hover:text-indigo-800 transition-colors"
                        onClick={() => setSelectedDate(d.date)}
                        title="Click to view reel details for this date"
                      >
                        {formatINR(d.qty)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">₹ {formatINR(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3 text-right text-slate-600 uppercase text-xs tracking-wider">Grand Total</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{formatINR(totalQty)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">₹ {formatINR(totalAmt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // LEVEL 1: Supplier-Wise Summary
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Factory className="w-4 h-4 text-indigo-500" />
          Supplier Wise Summary
        </h3>
        
        {supplierTotals.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">No purchases found for this month.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {supplierTotals.map(st => (
              <div 
                key={st.vendor} 
                onClick={() => setSelectedSupplier(st.vendor)}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-slate-800 truncate pr-2" title={st.vendor}>{st.vendor}</div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-slate-500">Qty: <span className="font-bold text-indigo-600">{formatINR(st.qty)}</span></div>
                  <div className="text-slate-500">₹ <span className="font-bold text-slate-700">{formatINR(st.amount)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white shadow-sm z-10">
          <div className="flex items-center gap-3">
            {selectedDate ? (
              <button 
                onClick={() => setSelectedDate(null)}
                className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
                title="Back to Date Summary"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : selectedSupplier ? (
              <button 
                onClick={() => setSelectedSupplier(null)}
                className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
                title="Back to Supplier List"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Package className="w-5 h-5" />
              </div>
            )}
            
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {selectedSupplier ? `Supplier: ${selectedSupplier}` : 'Total Paper Purchases'}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {new Date(currentMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-auto p-5 flex flex-col gap-6 relative">
          {renderContent()}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={handleClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

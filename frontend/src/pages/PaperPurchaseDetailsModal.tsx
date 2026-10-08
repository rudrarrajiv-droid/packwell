import React, { useMemo } from 'react';
import { X, Calendar, Package } from 'lucide-react';
import type { Reel, ReelTransaction } from '../lib/supabase/reelService';

interface PaperPurchaseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  paperType: string;
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

export default function PaperPurchaseDetailsModal({
  isOpen,
  onClose,
  paperType,
  reels,
  reelTxns,
  currentMonth
}: PaperPurchaseDetailsModalProps) {
  
  const purchases = useMemo(() => {
    const reelMap = new Map<string, Reel>();
    reels.forEach(r => {
      reelMap.set(r.id!, r);
    });

    const monthStart = `${currentMonth}-01`;
    const nextMonthDate = new Date(`${currentMonth}-01`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEnd = nextMonthDate.toISOString().split('T')[0];

    return reelTxns.filter(txn => {
      if (txn.type !== 'INWARD') return false;
      const date = txn.date;
      if (date < monthStart || date >= monthEnd) return false;
      
      const reel = reelMap.get(txn.reelId);
      if (!reel) return false;
      
      let mappedType = "Semi Kraft";
      const pt = (reel.paperType || '').toLowerCase();
      if (pt.includes('virgin') || pt.includes('vk')) mappedType = "Virgin Kraft";
      else if (pt.includes('chennai') || pt.includes('duplex')) mappedType = "Chennai";

      return mappedType === paperType;
    }).map(txn => {
      const reel = reelMap.get(txn.reelId)!;
      const qty = Number(txn.quantity) || 0;
      const rate = reel.rate || 0;
      return {
        id: txn.id,
        date: txn.date,
        vendor: reel.supplierName || 'Unknown Vendor',
        size: reel.reelSize,
        bf: reel.bf,
        gsm: reel.gsm,
        qty: qty,
        amount: qty * rate
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [paperType, reels, reelTxns, currentMonth]);

  if (!isOpen) return null;

  const totalQty = purchases.reduce((sum, p) => sum + p.qty, 0);
  const totalAmt = purchases.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{paperType} Purchases</h2>
              <p className="text-xs font-medium text-slate-500">
                Detailed purchase breakdown for {new Date(currentMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 bg-slate-50/30">
          {purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Package className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No purchases found for {paperType} in this month.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Vendor</th>
                      <th className="px-4 py-3 text-center">Size</th>
                      <th className="px-4 py-3 text-center">BF</th>
                      <th className="px-4 py-3 text-center">GSM</th>
                      <th className="px-4 py-3 text-right">Qty (Kgs)</th>
                      <th className="px-4 py-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.map((p, i) => (
                      <tr key={p.id || i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 text-slate-700">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(p.date).toLocaleDateString('en-GB')}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{p.vendor}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.size}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.bf}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.gsm}</td>
                        <td className="px-4 py-3 text-right font-semibold text-indigo-600">{formatINR(p.qty)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">₹ {formatINR(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right text-slate-600 uppercase text-xs tracking-wider">Total</td>
                      <td className="px-4 py-3 text-right text-indigo-700">{formatINR(totalQty)}</td>
                      <td className="px-4 py-3 text-right text-slate-900">₹ {formatINR(totalAmt)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

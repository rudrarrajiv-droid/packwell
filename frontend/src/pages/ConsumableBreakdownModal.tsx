import React, { useMemo, useState } from 'react';
import { X, Box, Search, Download, Wallet, Layers, List } from 'lucide-react';
import { exportToExcel } from '../lib/exportUtils';

export interface RmBreakdownItem {
  id: string;
  date: string;
  materialName: string;
  unit: string;
  type: 'OUT' | 'ADJUSTMENT' | 'IN';
  quantity: number;
  rate: number;
  amount: number;
  referenceNo?: string;
  remarks?: string;
  performedBy?: string;
}

interface ConsumableBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  month: string;
  items: RmBreakdownItem[];
  totalAmount: number;
  cashLedgerAmount?: number;
  onOpenCashLedger?: () => void;
}

const formatINR = (val: number) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return Math.round(val).toLocaleString('en-IN');
};

export default function ConsumableBreakdownModal({
  isOpen,
  onClose,
  title,
  month,
  items,
  totalAmount,
  cashLedgerAmount = 0,
  onOpenCashLedger,
}: ConsumableBreakdownModalProps) {
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'TRANSACTIONS'>('SUMMARY');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = q
      ? items.filter(
          (it) =>
            it.materialName.toLowerCase().includes(q) ||
            (it.referenceNo || '').toLowerCase().includes(q) ||
            (it.remarks || '').toLowerCase().includes(q)
        )
      : items;
    return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [items, searchQuery]);

  const itemSummary = useMemo(() => {
    const map = new Map<
      string,
      { materialName: string; unit: string; totalQty: number; totalAmount: number; txnCount: number }
    >();
    filteredItems.forEach((it) => {
      const key = it.materialName || 'Unknown Material';
      const prev = map.get(key) || {
        materialName: key,
        unit: it.unit || '',
        totalQty: 0,
        totalAmount: 0,
        txnCount: 0,
      };
      prev.totalQty += Number(it.quantity) || 0;
      prev.totalAmount += Number(it.amount) || 0;
      prev.txnCount += 1;
      map.set(key, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredItems]);

  const filteredTotal = useMemo(() => {
    return filteredItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  }, [filteredItems]);

  if (!isOpen) return null;

  const handleExport = () => {
    if (viewMode === 'SUMMARY') {
      const rows = itemSummary.map((s, idx) => ({
        'S.No': idx + 1,
        'Material Name': s.materialName,
        'Unit': s.unit,
        'Transactions': s.txnCount,
        'Total Out Qty': Number(s.totalQty.toFixed(2)),
        'Total Amount (Rs.)': Math.round(s.totalAmount),
      }));
      exportToExcel(rows, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Summary_${month}`);
    } else {
      const rows = filteredItems.map((it, idx) => ({
        'S.No': idx + 1,
        'Date': it.date,
        'Material Name': it.materialName,
        'Type': it.type,
        'Qty': it.quantity,
        'Unit': it.unit,
        'Rate (Rs.)': it.rate,
        'Amount (Rs.)': Math.round(it.amount),
        'Reference': it.referenceNo || '',
        'Remarks': it.remarks || '',
      }));
      exportToExcel(rows, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Transactions_${month}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                {title} — Raw Material Outward Details
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Month: <strong className="text-slate-700">{month}</strong> • {items.length} Outward Entries • Auto-Calculated Total:{' '}
                <strong className="text-emerald-700 text-sm">₹ {formatINR(totalAmount)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cashLedgerAmount > 0 && onOpenCashLedger && (
              <button
                type="button"
                onClick={onOpenCashLedger}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="View Cash Ledger entries for this head"
              >
                <Wallet className="w-3.5 h-3.5" />
                Cash Ledger (₹ {formatINR(cashLedgerAmount)})
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Tabs & Search */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('SUMMARY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'SUMMARY'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Item-wise Summary ({itemSummary.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TRANSACTIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'TRANSACTIONS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Date-wise Entries ({filteredItems.length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search material, ref, remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-5 bg-slate-50/60">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-medium text-sm">
              Is mahine mein koi Raw Material Outward entry nahi mili.
            </div>
          ) : viewMode === 'SUMMARY' ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold uppercase text-[11px]">
                    <th className="px-3 py-2.5 text-center w-12">#</th>
                    <th className="px-3 py-2.5 text-left">Material / Consumable Name</th>
                    <th className="px-3 py-2.5 text-center w-24">Entries</th>
                    <th className="px-3 py-2.5 text-right w-32">Total Out Qty</th>
                    <th className="px-3 py-2.5 text-right w-36 bg-emerald-900/40">Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itemSummary.map((s, idx) => (
                    <tr key={s.materialName} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="px-3 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{s.materialName}</td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-600">{s.txnCount}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-700">
                        {Number(s.totalQty.toFixed(2)).toLocaleString('en-IN')} {s.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                        ₹ {formatINR(s.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs">
                    <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-slate-700">
                      Total ({itemSummary.length} Items):
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-900 bg-emerald-100">
                      ₹ {formatINR(filteredTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold uppercase text-[11px]">
                    <th className="px-2.5 py-2.5 text-center w-10">#</th>
                    <th className="px-2.5 py-2.5 text-left w-24">Date</th>
                    <th className="px-2.5 py-2.5 text-left">Material Name</th>
                    <th className="px-2.5 py-2.5 text-center w-20">Type</th>
                    <th className="px-2.5 py-2.5 text-left">Reference / Remarks</th>
                    <th className="px-2.5 py-2.5 text-right w-24">Qty</th>
                    <th className="px-2.5 py-2.5 text-right w-20">Rate (₹)</th>
                    <th className="px-2.5 py-2.5 text-right w-28 bg-emerald-900/40">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((it, idx) => (
                    <tr key={it.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                      <td className="px-2.5 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="px-2.5 py-2 font-mono text-slate-700 whitespace-nowrap">{it.date}</td>
                      <td className="px-2.5 py-2 font-bold text-slate-900">{it.materialName}</td>
                      <td className="px-2.5 py-2 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            it.type === 'OUT'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {it.type}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-slate-600 text-[11px]">
                        {[it.referenceNo, it.remarks].filter(Boolean).join(' — ') || '-'}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-semibold text-slate-800">
                        {Number(it.quantity).toLocaleString('en-IN')} {it.unit}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono text-slate-600">
                        {Number(it.rate).toLocaleString('en-IN')}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                        ₹ {formatINR(it.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs">
                    <td colSpan={7} className="px-3 py-2.5 text-right uppercase text-slate-700">
                      Total ({filteredItems.length} Entries):
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-900 bg-emerald-100">
                      ₹ {formatINR(filteredTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Calendar, Building2, Package, ChevronLeft, ArrowRight,
  FileSpreadsheet, Receipt, Search
} from 'lucide-react';
import type { RawMaterial, RawMaterialTransaction } from '../../lib/types/models';
import * as xlsx from 'xlsx';

interface RMPurchaseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allRMs: RawMaterial[];
  transactions: RawMaterialTransaction[];
  selectedMonth: string; // 'YYYY-MM' or '' for all time
  initialMaterial?: RawMaterial | null;
}

const formatINR = (val: number, decimals: number = 0) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
};

export const isRMDateInMonth = (rawDate: any, targetMonth: string): boolean => {
  if (!targetMonth) return true;
  if (!rawDate) return false;
  const str = String(rawDate).trim();
  if (!str) return false;

  // Direct YYYY-MM match
  if (str.startsWith(targetMonth)) return true;

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const [y, m] = targetMonth.split('-');
  if (y && m) {
    const mNum = String(parseInt(m, 10));
    if (
      str.includes(`/${m}/${y}`) ||
      str.includes(`-${m}-${y}`) ||
      str.includes(`/${mNum}/${y}`) ||
      str.includes(`-${mNum}-${y}`)
    ) {
      return true;
    }
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const parsed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return parsed === targetMonth;
    }
  } catch {
    // ignore parse error
  }

  return false;
};

export const isRMAuditTransaction = (tx: RawMaterialTransaction): boolean => {
  if (tx.type === 'ADJUSTMENT') return true;
  const ref = (tx.referenceNo || '').toLowerCase();
  const rem = (tx.remarks || '').toLowerCase();
  return ref.includes('audit') || rem.includes('audit');
};

export default function RMPurchaseDetailsModal({
  isOpen,
  onClose,
  allRMs,
  transactions,
  selectedMonth,
  initialMaterial = null
}: RMPurchaseDetailsModalProps) {
  const [activeMonth, setActiveMonth] = useState<string>(selectedMonth || '');
  const [filterMaterial, setFilterMaterial] = useState<RawMaterial | null>(initialMaterial);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedInvoiceKey, setSelectedInvoiceKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveMonth(selectedMonth || '');
      setFilterMaterial(initialMaterial || null);
      setSelectedSupplier(null);
      setSelectedInvoiceKey(null);
      setSearch('');
    }
  }, [isOpen, selectedMonth, initialMaterial]);

  const rmMap = useMemo(() => {
    const map = new Map<string, RawMaterial>();
    allRMs.forEach(rm => {
      if (rm.id) map.set(rm.id, rm);
    });
    return map;
  }, [allRMs]);

  // Clean purchase transactions (Strictly type === 'IN' and NOT audit)
  const filteredPurchases = useMemo(() => {
    return transactions
      .filter(tx => {
        if (tx.type !== 'IN') return false;
        if (isRMAuditTransaction(tx)) return false;
        if (filterMaterial && tx.rawMaterialId !== filterMaterial.id) return false;
        if (activeMonth && !isRMDateInMonth(tx.date || tx.createdAt, activeMonth)) return false;
        return true;
      })
      .map(tx => {
        const rm = rmMap.get(tx.rawMaterialId);
        const materialName = rm ? rm.name : 'Unknown Material';
        const qty = Number(tx.quantity) || 0;
        const rate = Number(tx.rate) || Number(rm?.rate) || 0;
        const amount = (tx.amount !== undefined && tx.amount > 0) ? Number(tx.amount) : (qty * rate);
        const vendor = (tx.supplierName || '').trim() || 'Unspecified Party';

        // Extract clean invoice/ref without the appended Supplier/Rate metadata
        let cleanRef = (tx.referenceNo || '').trim();
        if (cleanRef.includes(' | Supplier:')) {
          cleanRef = cleanRef.split(' | Supplier:')[0].trim();
        } else if (cleanRef.startsWith('Supplier:')) {
          cleanRef = '';
        }
        const invoiceNo = cleanRef || 'N/A';

        const rawDate = tx.date || '';
        const dateString = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

        return {
          id: tx.id,
          rawMaterialId: tx.rawMaterialId,
          materialName,
          date: dateString,
          vendor,
          invoiceNo,
          qty,
          rate,
          amount,
          performedBy: tx.performedBy || 'System',
          invoiceKey: `${vendor}__${dateString}__${invoiceNo}`
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterMaterial, activeMonth, rmMap]);

  // LEVEL 1: Supplier-wise Totals
  const supplierTotals = useMemo(() => {
    const map = new Map<string, {
      vendor: string;
      qty: number;
      amount: number;
      bills: Set<string>;
      materials: Set<string>;
    }>();

    filteredPurchases.forEach(p => {
      const existing = map.get(p.vendor) || {
        vendor: p.vendor,
        qty: 0,
        amount: 0,
        bills: new Set<string>(),
        materials: new Set<string>()
      };
      existing.qty += p.qty;
      existing.amount += p.amount;
      existing.bills.add(p.invoiceKey);
      existing.materials.add(p.materialName);
      map.set(p.vendor, existing);
    });

    let list = Array.from(map.values()).map(s => ({
      vendor: s.vendor,
      qty: s.qty,
      amount: s.amount,
      billCount: s.bills.size,
      materials: Array.from(s.materials)
    }));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.vendor.toLowerCase().includes(q) ||
        s.materials.some(m => m.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => b.amount - a.amount);
  }, [filteredPurchases, search]);

  const overallTotals = useMemo(() => {
    const qty = filteredPurchases.reduce((s, p) => s + p.qty, 0);
    const amount = filteredPurchases.reduce((s, p) => s + p.amount, 0);
    const vendors = new Set(filteredPurchases.map(p => p.vendor)).size;
    const bills = new Set(filteredPurchases.map(p => p.invoiceKey)).size;
    return { qty, amount, vendors, bills };
  }, [filteredPurchases]);

  // LEVEL 2: Date & Invoice-wise for Selected Supplier
  const supplierInvoices = useMemo(() => {
    if (!selectedSupplier) return [];
    const items = filteredPurchases.filter(p => p.vendor === selectedSupplier);
    const map = new Map<string, {
      invoiceKey: string;
      date: string;
      invoiceNo: string;
      qty: number;
      amount: number;
      items: string[];
    }>();

    items.forEach(p => {
      const existing = map.get(p.invoiceKey) || {
        invoiceKey: p.invoiceKey,
        date: p.date,
        invoiceNo: p.invoiceNo,
        qty: 0,
        amount: 0,
        items: []
      };
      existing.qty += p.qty;
      existing.amount += p.amount;
      if (!existing.items.includes(p.materialName)) {
        existing.items.push(p.materialName);
      }
      map.set(p.invoiceKey, existing);
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredPurchases, selectedSupplier]);

  // LEVEL 3: Exact line items for selected invoice
  const invoiceItems = useMemo(() => {
    if (!selectedSupplier || !selectedInvoiceKey) return [];
    return filteredPurchases.filter(p => p.invoiceKey === selectedInvoiceKey);
  }, [filteredPurchases, selectedSupplier, selectedInvoiceKey]);

  const handleExportExcel = () => {
    if (filteredPurchases.length === 0) return;

    const titleScope = filterMaterial ? filterMaterial.name : 'All Raw Materials';
    const data: any[][] = [
      [`RAW MATERIAL PURCHASE DETAILS (${titleScope.toUpperCase()})`],
      [`Month: ${activeMonth || 'All Time'} | Audit Adjustments Excluded`],
      [],
      ['Date', 'Supplier / Party', 'Invoice / Ref No', 'Material Name', 'Qty / Weight', 'Rate (Rs)', 'Total Amount (Rs)', 'Entered By']
    ];

    filteredPurchases.forEach(p => {
      data.push([
        p.date,
        p.vendor,
        p.invoiceNo,
        p.materialName,
        p.qty,
        p.rate,
        p.amount,
        p.performedBy
      ]);
    });

    data.push([]);
    data.push(['TOTAL', '', '', '', overallTotals.qty, '', overallTotals.amount, '']);

    const ws = xlsx.utils.aoa_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'RM_Purchases');
    xlsx.writeFile(wb, `RM_Purchase_${activeMonth || 'All'}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className="bg-background w-full max-w-5xl rounded-2xl shadow-2xl border border-border flex flex-col h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500/10 text-green-600 rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">
                  {filterMaterial ? `${filterMaterial.name} - Purchase Details` : 'Raw Material Purchase Details'}
                </h2>
                <span className="text-xs px-2.5 py-0.5 bg-emerald-500/15 text-emerald-700 font-semibold rounded-full border border-emerald-500/30">
                  Audit Excluded
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Supplier-wise &rarr; Date &amp; Invoice-wise breakdown (Excludes RM Audit entries)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary & Month Filter Bar */}
        <div className="p-4 bg-secondary/20 border-b border-border flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month:</span>
            <div className="flex items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-xl shadow-2xs">
              <Calendar className="w-4 h-4 text-primary" />
              <input
                type="month"
                value={activeMonth}
                onChange={e => {
                  setActiveMonth(e.target.value);
                  setSelectedSupplier(null);
                  setSelectedInvoiceKey(null);
                }}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none"
              />
            </div>
            {activeMonth && (
              <button
                onClick={() => {
                  setActiveMonth('');
                  setSelectedSupplier(null);
                  setSelectedInvoiceKey(null);
                }}
                className="text-xs text-primary hover:underline font-semibold"
              >
                All Time
              </button>
            )}
            {filterMaterial && (
              <button
                onClick={() => {
                  setFilterMaterial(null);
                  setSelectedSupplier(null);
                  setSelectedInvoiceKey(null);
                }}
                className="ml-2 px-2.5 py-1 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                Show All Materials
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 bg-card border border-border rounded-xl">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Suppliers</span>
              <span className="text-xs font-black text-foreground">{overallTotals.vendors}</span>
            </div>
            <div className="px-3 py-1.5 bg-card border border-border rounded-xl">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Invoices</span>
              <span className="text-xs font-black text-blue-600">{overallTotals.bills}</span>
            </div>
            <div className="px-3 py-1.5 bg-card border border-border rounded-xl">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Total Qty</span>
              <span className="text-xs font-black text-green-600 font-mono">+{formatINR(overallTotals.qty, 2)}</span>
            </div>
            <div className="px-3.5 py-1.5 bg-primary/10 border border-primary/20 rounded-xl">
              <span className="text-[10px] text-primary font-bold uppercase block">Total Purchase Value</span>
              <span className="text-sm font-extrabold text-primary font-mono">₹ {formatINR(overallTotals.amount)}</span>
            </div>
          </div>
        </div>

        {/* Breadcrumb & Search */}
        <div className="px-6 py-2.5 bg-card border-b border-border flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                setSelectedSupplier(null);
                setSelectedInvoiceKey(null);
              }}
              className={`font-semibold transition-colors ${
                !selectedSupplier ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Suppliers ({supplierTotals.length})
            </button>

            {selectedSupplier && (
              <>
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
                <button
                  onClick={() => setSelectedInvoiceKey(null)}
                  className={`font-semibold transition-colors ${
                    !selectedInvoiceKey ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {selectedSupplier}
                </button>
              </>
            )}

            {selectedInvoiceKey && (
              <>
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
                <span className="text-primary font-bold">
                  Invoice: {invoiceItems[0]?.invoiceNo || 'N/A'}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!selectedSupplier && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search supplier or item..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-secondary/50 border border-border rounded-lg text-xs w-48 font-medium focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <button
              onClick={handleExportExcel}
              disabled={filteredPurchases.length === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg text-xs font-semibold shadow-2xs transition-all disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
              Export Excel
            </button>
          </div>
        </div>

        {/* Body: 3-Level Drilldown */}
        <div className="flex-1 overflow-auto bg-card">
          {/* LEVEL 1: Supplier-Wise */}
          {!selectedSupplier && (
            <table className="w-full text-xs">
              <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Supplier / Party Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Materials Purchased</th>
                  <th className="px-4 py-3 text-center font-semibold">Bills</th>
                  <th className="px-4 py-3 text-right font-semibold text-green-600">Total Qty / Wt</th>
                  <th className="px-6 py-3 text-right font-semibold text-primary">Total Value (₹)</th>
                  <th className="px-4 py-3 text-center font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {supplierTotals.map(s => (
                  <tr
                    key={s.vendor}
                    onClick={() => setSelectedSupplier(s.vendor)}
                    className="hover:bg-primary/5 cursor-pointer transition-colors group"
                    title="Click to view date & invoice-wise purchases from this supplier"
                  >
                    <td className="px-6 py-3.5 font-bold text-foreground flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-500" />
                      <span className="group-hover:text-primary transition-colors">{s.vendor}</span>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {s.materials.slice(0, 3).map(m => (
                          <span key={m} className="px-2 py-0.5 bg-secondary rounded text-[10px] font-medium text-foreground">
                            {m}
                          </span>
                        ))}
                        {s.materials.length > 3 && (
                          <span className="px-1.5 py-0.5 bg-secondary/80 rounded text-[10px] text-muted-foreground font-semibold">
                            +{s.materials.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono font-semibold text-muted-foreground">
                      {s.billCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-green-600 font-mono">
                      +{formatINR(s.qty, 2)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-black text-primary font-mono text-sm">
                      ₹ {formatINR(s.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary group-hover:underline">
                        View Invoices <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}

                {supplierTotals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                      <Building2 className="w-10 h-10 mx-auto opacity-20 mb-2" />
                      <p className="font-semibold text-sm">No purchase entries found for this selection</p>
                      <p className="text-xs mt-1">RM Audit entries are automatically excluded.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* LEVEL 2: Date & Invoice-Wise for Selected Supplier */}
          {selectedSupplier && !selectedInvoiceKey && (
            <div>
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-foreground text-sm">{selectedSupplier}</span>
                  <span className="text-xs text-muted-foreground">({supplierInvoices.length} Invoices)</span>
                </div>
                <button
                  onClick={() => setSelectedSupplier(null)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to Suppliers
                </button>
              </div>

              <table className="w-full text-xs">
                <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Invoice / Bill No</th>
                    <th className="px-4 py-3 text-left font-semibold">Items</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-600">Qty / Weight</th>
                    <th className="px-6 py-3 text-right font-semibold text-primary">Invoice Value (₹)</th>
                    <th className="px-4 py-3 text-center font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplierInvoices.map(inv => (
                    <tr
                      key={inv.invoiceKey}
                      onClick={() => setSelectedInvoiceKey(inv.invoiceKey)}
                      className="hover:bg-primary/5 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {inv.date ? new Date(inv.date).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-blue-600 font-mono">
                        {inv.invoiceNo !== 'N/A' ? inv.invoiceNo : <span className="text-amber-500 italic font-normal">No Invoice No</span>}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        <span className="px-2 py-0.5 bg-secondary rounded text-[11px] font-medium text-foreground">
                          {inv.items.join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-green-600 font-mono">
                        +{formatINR(inv.qty, 2)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-extrabold text-foreground font-mono text-sm">
                        ₹ {formatINR(inv.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary group-hover:underline">
                          View Items <ArrowRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LEVEL 3: Exact Items in Selected Invoice */}
          {selectedSupplier && selectedInvoiceKey && (
            <div>
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-foreground text-sm">{selectedSupplier}</span>
                  <span className="text-xs text-muted-foreground">&bull;</span>
                  <span className="font-mono font-bold text-blue-600 text-xs">
                    Invoice: {invoiceItems[0]?.invoiceNo || 'N/A'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({invoiceItems[0]?.date ? new Date(invoiceItems[0].date).toLocaleDateString('en-GB') : '-'})
                  </span>
                </div>
                <button
                  onClick={() => setSelectedInvoiceKey(null)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to Invoices
                </button>
              </div>

              <table className="w-full text-xs">
                <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Material Name</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-600">Qty / Weight</th>
                    <th className="px-4 py-3 text-right font-semibold">Rate (₹)</th>
                    <th className="px-6 py-3 text-right font-semibold text-primary">Value (₹)</th>
                    <th className="px-4 py-3 text-center font-semibold">Entered By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoiceItems.map(item => (
                    <tr key={item.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-3 font-bold text-foreground flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-primary" />
                        {item.materialName}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-600 font-mono">
                        +{formatINR(item.qty, 2)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                        ₹ {formatINR(item.rate, 2)}
                      </td>
                      <td className="px-6 py-3 text-right font-black text-foreground font-mono text-sm">
                        ₹ {formatINR(item.amount)}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground text-[11px]">
                        {item.performedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-secondary/50 font-bold border-t border-border">
                  <tr>
                    <td className="px-6 py-3 uppercase tracking-wider text-[11px] text-muted-foreground">Total</td>
                    <td className="px-4 py-3 text-right font-black text-green-600 font-mono">
                      +{formatINR(invoiceItems.reduce((s, i) => s + i.qty, 0), 2)}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-6 py-3 text-right font-black text-primary font-mono text-sm">
                      ₹ {formatINR(invoiceItems.reduce((s, i) => s + i.amount, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-card">
          <span className="text-xs text-muted-foreground">
            Strictly vendor purchases &bull; RM Audit entries excluded
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-lg text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

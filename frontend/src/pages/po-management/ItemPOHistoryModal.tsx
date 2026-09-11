import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  FileSpreadsheet, 
  Layers, 
  Truck, 
  Building2, 
  Tag, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Filter, 
  ArrowUpDown,
  ExternalLink,
  Package,
  Receipt
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { type PurchaseOrder, type POTransaction } from '../../lib/supabase/purchaseOrderService';
import { getFinishGoodTransactions, type FinishGoodTransaction } from '../../lib/supabase/finishGoodService';
import { exportItemLedgerToExcel, type ItemLedgerExcelRow } from '../../utils/exportUtils';
import { cn } from '../../lib/utils';

interface ItemPOHistoryModalProps {
  productName: string;
  artworkNo?: string;
  purchaseOrders: PurchaseOrder[];
  poTransactions: POTransaction[];
  onClose: () => void;
  onSelectPo?: (po: PurchaseOrder) => void;
}

export interface LedgerEvent {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  subType: 'PO_CREATED' | 'PO_IN_ADD' | 'DISPATCH';
  poNo: string;
  poId?: string;
  invoiceNo: string;
  customerName: string;
  consignee?: string | null;
  quantity: number;
  rate?: number;
  runningBalance: number;
  transporter?: string | null;
  vehicleNo?: string | null;
  place?: string | null;
  remarks: string;
  status?: string;
}

// Helper: format YYYY-MM-DD or date string to DD/MM/YY
const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '-';
  const str = String(dateStr).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}/${mm}/${yyyy.slice(2)}`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str || '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
};

const formatValue = (val: number | undefined | null) => {
  return Math.round(Number(val || 0)).toLocaleString('en-IN');
};

export default function ItemPOHistoryModal({
  productName,
  artworkNo,
  purchaseOrders,
  poTransactions,
  onClose,
  onSelectPo
}: ItemPOHistoryModalProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // default latest first

  // Fetch Finish Good transactions to enrich dispatch logistics (transporter, vehicle, etc.)
  const { data: fgTransactions = [] } = useQuery<FinishGoodTransaction[]>({
    queryKey: ['finishGoodTransactions'],
    queryFn: () => getFinishGoodTransactions(),
    staleTime: 1000 * 60 * 5,
  });

  // 1. Identify all POs belonging to this item
  const matchingPOs = useMemo(() => {
    const targetName = (productName || '').trim().toLowerCase();
    const targetArt = (artworkNo || '').trim().toLowerCase();

    return purchaseOrders.filter(po => {
      const pName = (po.productName || '').trim().toLowerCase();
      const pArt = (po.artworkNo || '').trim().toLowerCase();

      if (targetName && pName === targetName) return true;
      if (targetArt && pArt && targetArt === pArt) return true;
      return false;
    });
  }, [purchaseOrders, productName, artworkNo]);

  // Map of PO by ID and PO by poNo for quick lookup
  const { poById, poByNo, poIds } = useMemo(() => {
    const byId = new Map<string, PurchaseOrder>();
    const byNo = new Map<string, PurchaseOrder>();
    const idSet = new Set<string>();

    matchingPOs.forEach(po => {
      if (po.id) {
        byId.set(po.id, po);
        idSet.add(po.id);
      }
      if (po.poNo) {
        byNo.set(po.poNo.trim().toLowerCase(), po);
      }
    });

    return { poById: byId, poByNo: byNo, poIds: idSet };
  }, [matchingPOs]);

  // Unique customers for this item
  const customersList = useMemo(() => {
    const set = new Set<string>();
    matchingPOs.forEach(p => {
      if (p.customerName) set.add(p.customerName);
    });
    return Array.from(set);
  }, [matchingPOs]);

  // 2. Map FG Outward transactions by Invoice No for quick logistics lookup
  const fgByInvoice = useMemo(() => {
    const map = new Map<string, FinishGoodTransaction>();
    fgTransactions.forEach(tx => {
      if (tx.invoiceNo && tx.type === 'OUT') {
        const cleanInv = tx.invoiceNo.trim().toUpperCase();
        if (!map.has(cleanInv)) {
          map.set(cleanInv, tx);
        }
      }
    });
    return map;
  }, [fgTransactions]);

  // 3. Build Raw Chronological Events
  const { allEvents, summaryKPIs } = useMemo(() => {
    const rawEvents: Array<Omit<LedgerEvent, 'runningBalance'>> = [];
    const processedCreationPoIds = new Set<string>();

    // Helper to extract Invoice No from referenceId or remarks
    const extractInvoice = (referenceId?: string, remarks?: string): string => {
      if (referenceId && referenceId.trim() !== '') {
        return referenceId.trim();
      }
      if (remarks) {
        // e.g. "Auto-dispatch from Invoice INV-1234"
        const match = remarks.match(/(?:Invoice|Inv|INV)[#:\s]*([A-Za-z0-9\-\/]+)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return '-';
    };

    // A. Add PO Creation Inward Records
    matchingPOs.forEach(po => {
      // Look for an Auto-IN transaction in poTransactions
      const autoInTx = poTransactions.find(
        tx => tx.poId === po.id && tx.type === 'IN' && (
          tx.remarks?.includes('Auto-IN') || 
          tx.remarks?.includes('Creation') || 
          tx.remarks?.includes('Import')
        )
      );

      const eventDate = autoInTx?.date || po.poDate || po.createdAt || '';
      rawEvents.push({
        id: `po-create-${po.id || po.poNo}`,
        date: eventDate,
        type: 'IN',
        subType: 'PO_CREATED',
        poNo: po.poNo,
        poId: po.id,
        invoiceNo: '-',
        customerName: po.customerName,
        consignee: po.consignee,
        quantity: po.orderQty,
        rate: po.rate,
        remarks: po.deliveryDate ? `Delivery: ${formatDate(po.deliveryDate)}` : 'PO Order Created',
        status: po.status
      });

      if (po.id) processedCreationPoIds.add(po.id);
    });

    // B. Add Transactions from poTransactions
    poTransactions.forEach(tx => {
      if (!poIds.has(tx.poId)) return;
      const parentPo = poById.get(tx.poId);

      // Skip Auto-IN creation transactions since we already created PO_CREATED event from PO master
      const isAutoCreationIn = tx.type === 'IN' && (
        tx.remarks?.includes('Auto-IN on PO Creation') || 
        tx.remarks?.includes('Auto-IN on PO Import')
      );
      if (isAutoCreationIn) return;

      if (tx.type === 'IN') {
        rawEvents.push({
          id: tx.id || `po-in-${tx.poId}-${tx.date}`,
          date: tx.date,
          type: 'IN',
          subType: 'PO_IN_ADD',
          poNo: parentPo?.poNo || '-',
          poId: tx.poId,
          invoiceNo: '-',
          customerName: parentPo?.customerName || '-',
          consignee: parentPo?.consignee,
          quantity: tx.quantity,
          rate: parentPo?.rate,
          remarks: tx.remarks || 'Additional PO Inward',
          status: parentPo?.status
        });
      } else if (tx.type === 'OUT') {
        const inv = extractInvoice(tx.referenceId, tx.remarks);
        const fgDetails = inv !== '-' ? fgByInvoice.get(inv.toUpperCase()) : undefined;

        rawEvents.push({
          id: tx.id || `po-out-${tx.poId}-${tx.date}`,
          date: tx.date,
          type: 'OUT',
          subType: 'DISPATCH',
          poNo: parentPo?.poNo || '-',
          poId: tx.poId,
          invoiceNo: inv,
          customerName: parentPo?.customerName || fgDetails?.customerName || '-',
          consignee: parentPo?.consignee,
          quantity: tx.quantity,
          rate: parentPo?.rate,
          transporter: fgDetails?.transporterName,
          vehicleNo: fgDetails?.vehicleNo,
          place: fgDetails?.place,
          remarks: tx.remarks || (inv !== '-' ? `Dispatch under Inv ${inv}` : 'Material Dispatched'),
          status: parentPo?.status
        });
      }
    });

    // C. Sort Chronologically (Ascending) for running balance calculation
    rawEvents.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }
      // On same date, IN events come before OUT
      if (a.type !== b.type) {
        return a.type === 'IN' ? -1 : 1;
      }
      return 0;
    });

    // D. Compute Running Balance and KPIs
    let running = 0;
    let sumIn = 0;
    let sumOut = 0;
    let sumValue = 0;
    const uniqueInvoices = new Set<string>();

    const enrichedEvents: LedgerEvent[] = rawEvents.map(ev => {
      if (ev.type === 'IN') {
        running += ev.quantity;
        sumIn += ev.quantity;
        sumValue += ev.quantity * (ev.rate || 0);
      } else {
        running -= ev.quantity;
        sumOut += ev.quantity;
        if (ev.invoiceNo && ev.invoiceNo !== '-') {
          uniqueInvoices.add(ev.invoiceNo);
        }
      }
      return {
        ...ev,
        runningBalance: running
      };
    });

    return {
      allEvents: enrichedEvents,
      summaryKPIs: {
        totalPOs: matchingPOs.length,
        totalIn: sumIn,
        totalOut: sumOut,
        currentBalance: running > 0 ? running : 0,
        totalValue: sumValue,
        totalInvoices: uniqueInvoices.size
      }
    };
  }, [matchingPOs, poTransactions, poIds, poById, fgByInvoice]);

  // 4. Apply User Filters & Sorting
  const filteredEvents = useMemo(() => {
    let list = allEvents.filter(ev => {
      // Type Filter
      if (filterType !== 'ALL' && ev.type !== filterType) return false;

      // Date Filters
      if (dateFrom && ev.date < dateFrom) return false;
      if (dateTo && ev.date > dateTo) return false;

      // Search Filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const searchStr = `${ev.poNo} ${ev.invoiceNo} ${ev.customerName} ${ev.consignee || ''} ${ev.transporter || ''} ${ev.vehicleNo || ''} ${ev.remarks || ''}`.toLowerCase();
        if (!searchStr.includes(term)) return false;
      }

      return true;
    });

    // Sort order
    if (sortOrder === 'desc') {
      return [...list].reverse();
    }
    return list;
  }, [allEvents, filterType, dateFrom, dateTo, searchTerm, sortOrder]);

  // Handle Export to Excel
  const handleExport = () => {
    const rows: ItemLedgerExcelRow[] = filteredEvents.map(e => ({
      date: formatDate(e.date),
      type: e.type === 'IN' ? 'PO IN (Order)' : 'DISPATCH OUT',
      poNo: e.poNo,
      invoiceNo: e.invoiceNo,
      customerName: e.customerName,
      inQty: e.type === 'IN' ? e.quantity : 0,
      outQty: e.type === 'OUT' ? e.quantity : 0,
      balance: e.runningBalance,
      rate: e.rate,
      remarks: [
        e.remarks,
        e.vehicleNo ? `Vehicle: ${e.vehicleNo}` : '',
        e.transporter ? `Transporter: ${e.transporter}` : ''
      ].filter(Boolean).join(' | ')
    }));

    exportItemLedgerToExcel(productName, artworkNo, rows);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[110] p-3 md:p-6 animate-fade-in">
      <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col h-[92vh] border border-border overflow-hidden">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/10 via-background to-background shrink-0 gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-primary/15 text-primary rounded-xl shrink-0 mt-0.5 shadow-xs">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Item PO & Dispatch Ledger
                </span>
                {artworkNo && (
                  <span className="px-2 py-0.5 bg-muted border border-border text-foreground font-mono text-xs rounded-md font-semibold">
                    Art: {artworkNo}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-primary/10 text-primary font-bold text-xs rounded-md">
                  {summaryKPIs.totalPOs} {summaryKPIs.totalPOs === 1 ? 'PO' : 'POs'} Found
                </span>
              </div>
              <h2 className="text-lg md:text-xl font-black text-foreground mt-0.5 leading-snug break-words">
                {productName}
              </h2>
              {customersList.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-[11px] uppercase tracking-wider">Parties:</span>
                  {customersList.map((cust, i) => (
                    <span 
                      key={i}
                      className="px-2 py-0.5 bg-secondary/80 text-foreground font-medium rounded text-[11px] border border-border/50"
                    >
                      {cust}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Download Excel Statement"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Statement</span>
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/20 border-b border-border shrink-0">
          <div className="p-3 bg-card rounded-xl border border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total PO (Inward)</span>
              <div className="p-1 bg-green-500/10 text-green-600 rounded-lg">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-green-600 mt-1">
              {summaryKPIs.totalIn.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">pcs</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Across {summaryKPIs.totalPOs} PO orders</p>
          </div>

          <div className="p-3 bg-card rounded-xl border border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Dispatched (Out)</span>
              <div className="p-1 bg-red-500/10 text-red-600 rounded-lg">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-red-600 mt-1">
              {summaryKPIs.totalOut.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">pcs</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{summaryKPIs.totalInvoices} Invoices billed</p>
          </div>

          <div className="p-3 bg-card rounded-xl border border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Current PO Balance</span>
              <div className="p-1 bg-primary/10 text-primary rounded-lg">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-primary mt-1">
              {summaryKPIs.currentBalance.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">pcs</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summaryKPIs.currentBalance === 0 ? 'All POs Completed' : 'Pending to dispatch'}
            </p>
          </div>

          <div className="p-3 bg-card rounded-xl border border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total PO Value</span>
              <div className="p-1 bg-amber-500/10 text-amber-600 rounded-lg">
                <Tag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-foreground mt-1">
              ₹{formatValue(summaryKPIs.totalValue)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Cumulative PO value</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3 md:p-4 border-b border-border bg-card/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Tab buttons */}
          <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filterType === 'ALL'
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Events ({allEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('IN')}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filterType === 'IN'
                  ? "bg-green-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-green-600"
              )}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>PO Inward ({allEvents.filter(e => e.type === 'IN').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('OUT')}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filterType === 'OUT'
                  ? "bg-red-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-red-600"
              )}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Dispatches ({allEvents.filter(e => e.type === 'OUT').length})</span>
            </button>
          </div>

          {/* Search and Date Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search PO, Invoice, Party..."
                className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border border-input px-2.5 py-1 rounded-xl">
              <Calendar className="w-3.5 h-3.5" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Date From"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Date To"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-secondary hover:bg-muted text-foreground border border-border rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title={`Sort by Date: currently ${sortOrder === 'desc' ? 'Latest First' : 'Oldest First'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'Latest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-auto bg-card">
          <table className="w-full text-left text-xs whitespace-nowrap min-w-[950px]">
            <thead className="bg-secondary/60 text-muted-foreground uppercase font-bold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md border-b border-border">
              <tr>
                <th className="px-3 py-3 w-12 text-center">#</th>
                <th className="px-3 py-3">1. Date</th>
                <th className="px-3 py-3 text-center">2. Type</th>
                <th className="px-3 py-3">3. PO No.</th>
                <th className="px-3 py-3">4. Invoice No.</th>
                <th className="px-3 py-3">5. Customer / Consignee</th>
                <th className="px-3 py-3 text-right text-green-600 font-bold">6. IN Qty (+)</th>
                <th className="px-3 py-3 text-right text-red-600 font-bold">7. OUT Qty (-)</th>
                <th className="px-3 py-3 text-right font-black">8. Running Bal</th>
                <th className="px-3 py-3 text-right">9. Rate</th>
                <th className="px-3 py-3">10. Logistics / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-muted-foreground">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm">No transactions match your filter criteria.</p>
                    {(searchTerm || dateFrom || dateTo || filterType !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setDateFrom('');
                          setDateTo('');
                          setFilterType('ALL');
                        }}
                        className="mt-2 text-primary text-xs font-bold underline hover:opacity-80 cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event, idx) => {
                  const isIN = event.type === 'IN';
                  const hasInvoice = event.invoiceNo && event.invoiceNo !== '-';

                  return (
                    <tr 
                      key={event.id || idx}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        isIN ? "bg-green-50/15 dark:bg-green-950/10" : "bg-red-50/15 dark:bg-red-950/10"
                      )}
                    >
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2.5 font-semibold text-foreground">
                        {formatDate(event.date)}
                      </td>

                      {/* Type Badge */}
                      <td className="px-3 py-2.5 text-center">
                        {isIN ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300 border border-green-300/40">
                            <ArrowDownLeft className="w-3 h-3" />
                            {event.subType === 'PO_CREATED' ? 'PO IN' : 'PO IN (ADD)'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border border-red-300/40">
                            <ArrowUpRight className="w-3 h-3" />
                            DISPATCH OUT
                          </span>
                        )}
                      </td>

                      {/* PO No. */}
                      <td className="px-3 py-2.5 font-bold text-foreground">
                        <span 
                          className="font-mono"
                          title={`PO: ${event.poNo}`}
                        >
                          {event.poNo}
                        </span>
                      </td>

                      {/* Invoice No. */}
                      <td className="px-3 py-2.5">
                        {hasInvoice ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-mono font-black text-xs rounded-md shadow-2xs">
                            <Receipt className="w-3 h-3 text-blue-500" />
                            {event.invoiceNo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs pl-2">-</span>
                        )}
                      </td>

                      {/* Customer / Consignee */}
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <p className="font-semibold text-foreground truncate" title={event.customerName}>
                          {event.customerName}
                        </p>
                        {event.consignee && event.consignee !== event.customerName && (
                          <p className="text-[10px] text-muted-foreground truncate" title={`Consignee: ${event.consignee}`}>
                            To: {event.consignee}
                          </p>
                        )}
                      </td>

                      {/* IN Qty */}
                      <td className="px-3 py-2.5 text-right font-black text-green-600 text-sm">
                        {isIN ? `+${event.quantity.toLocaleString()}` : '-'}
                      </td>

                      {/* OUT Qty */}
                      <td className="px-3 py-2.5 text-right font-black text-red-600 text-sm">
                        {!isIN ? `-${event.quantity.toLocaleString()}` : '-'}
                      </td>

                      {/* Running Balance */}
                      <td className="px-3 py-2.5 text-right font-black text-foreground text-sm font-mono">
                        {event.runningBalance.toLocaleString()}
                      </td>

                      {/* Rate */}
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {event.rate ? `₹${Number(event.rate).toFixed(3)}` : '-'}
                      </td>

                      {/* Logistics / Remarks */}
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[240px]">
                        <div className="flex flex-col gap-0.5">
                          {event.vehicleNo && (
                            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                              <Truck className="w-3 h-3 text-primary" />
                              {event.vehicleNo} {event.transporter ? `(${event.transporter})` : ''}
                            </span>
                          )}
                          <span className="truncate text-[11px]" title={event.remarks}>
                            {event.remarks || '-'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div className="p-3 bg-secondary/40 border-t border-border flex flex-wrap items-center justify-between text-xs text-muted-foreground shrink-0 gap-2">
          <div className="flex items-center gap-4">
            <span>Showing <strong className="text-foreground">{filteredEvents.length}</strong> of <strong className="text-foreground">{allEvents.length}</strong> activity records</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">Total Inward: <strong className="text-green-600">{summaryKPIs.totalIn.toLocaleString()}</strong> pcs</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">Total Outward: <strong className="text-red-600">{summaryKPIs.totalOut.toLocaleString()}</strong> pcs</span>
          </div>

          <div className="flex items-center gap-2 font-bold">
            <span>Net Balance:</span>
            <span className="px-2.5 py-0.5 rounded-md bg-primary text-primary-foreground font-black font-mono text-sm">
              {summaryKPIs.currentBalance.toLocaleString()} pcs
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

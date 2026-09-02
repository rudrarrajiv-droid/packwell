import React, { useState, useMemo } from 'react';
import { Plus, Search, FileText, ShoppingCart, Activity, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Users, List, ChevronLeft, Link, FileSpreadsheet, Scale, Boxes, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { deletePurchaseOrder, getAllPOTransactions, getPurchaseOrders, type PurchaseOrder, getPurchaseOrderBalance } from '../lib/supabase/purchaseOrderService';
import { exportPurchaseOrdersToExcel } from '../utils/exportUtils';
import AddPOModal from './po-management/AddPOModal';
import POInModal from './po-management/POInModal';
import POHistoryModal from './po-management/POHistoryModal';
import POAdjustModal from './po-management/POAdjustModal';
import LinkedJobCardsModal from './po-management/LinkedJobCardsModal';
import ExcelImportPreviewModal from './po-management/ExcelImportPreviewModal';
import EditPOModal from './po-management/EditPOModal';
import { cn } from '../lib/utils';
import { Edit2, Trash2, Download, FileX2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BulkClosePOModal from './po-management/BulkClosePOModal';
import { downloadPOTemplate } from '../utils/exportUtils';

type SortField = 'statusPriority' | 'poNo' | 'poDate' | 'deliveryDate' | 'customerName' | 'orderQty' | 'inQty' | 'outQty' | 'closingBal' | 'value';
type SortDir = 'asc' | 'desc';
type ViewMode = 'ALL' | 'ITEM_WISE' | 'SUMMARY' | 'DETAIL' | 'MONTHLY';

// Sequence Priority: 1. Overdue/Delayed -> 2. Pending -> 3. Partially Completed -> 4. Cancelled -> 5. Completed
const STATUS_PRIORITY_RANK: Record<string, number> = {
  'OVERDUE / DELAYED': 1,
  'PENDING': 2,
  'PARTIALLY COMPLETED': 3,
  'CANCELLED': 4,
  'COMPLETED': 5
};

// Helper: format YYYY-MM-DD or any date string to DD/MM/YY safely
const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '-';
  // If already in YYYY-MM-DD format (from HTML date input)
  const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const yy = yyyy.slice(2);
    return `${dd}/${mm}/${yy}`;
  }
  // Fallback: try parsing via Date object
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
};

// Phase 10: Dynamic Status Logic
const getCalculatedStatus = (po: PurchaseOrder) => {
  if (po.status === 'CANCELLED') return 'CANCELLED';

  const closingBal = getPurchaseOrderBalance(po);
  
  // 1. Completed
  if (po.status === 'CLOSED' || closingBal <= 0) return 'COMPLETED';

  // 2. Overdue / Delayed
  if (po.deliveryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delDate = new Date(po.deliveryDate);
    if (!isNaN(delDate.getTime())) {
      delDate.setHours(0, 0, 0, 0);
      if (delDate < today) return 'OVERDUE / DELAYED';
    }
  }

  // 3. Partially Completed
  if ((po.outQty || 0) > 0) return 'PARTIALLY COMPLETED';

  // 4. Pending
  return 'PENDING';
};

export default function PurchaseOrders() {
  const { user } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addPoTarget, setAddPoTarget] = useState<{ poNo?: string; customerId?: string } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [inActionPo, setInActionPo] = useState<PurchaseOrder | null>(null);
  const [historyPo, setHistoryPo] = useState<PurchaseOrder | null>(null);
  const [linkedPo, setLinkedPo] = useState<PurchaseOrder | null>(null);
  const [editPo, setEditPo] = useState<PurchaseOrder | null>(null);
  const [adjustPo, setAdjustPo] = useState<PurchaseOrder | null>(null);
  const [isBulkCloseModalOpen, setIsBulkCloseModalOpen] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [poDateFrom, setPoDateFrom] = useState('');
  const [poDateTo, setPoDateTo] = useState('');
  const [deliveryDateFrom, setDeliveryDateFrom] = useState('');
  const [deliveryDateTo, setDeliveryDateTo] = useState('');
  
  // Sorting State - default to status priority sequence: Overdue -> Pending -> Partially Completed -> Cancelled -> Completed
  const [sortField, setSortField] = useState<SortField>('statusPriority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // View State (Phase 9 & 12)
  const [viewMode, setViewMode] = useState<ViewMode>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [summarySearch, setSummarySearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Fetch Data
  const { data: purchaseOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: () => getPurchaseOrders()
  });

  // Fetch Transactions for Monthly View (Client-side aggregation Phase 12)
  const { data: poTransactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['allPoTransactions'],
    queryFn: () => getAllPOTransactions()
  });

  // Unique Customers for Dropdown
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, string>();
    purchaseOrders.forEach(po => {
      if (po.customerId && po.customerName) {
        map.set(po.customerId, po.customerName);
      } else if (po.customerName) {
        map.set(po.customerName, po.customerName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [purchaseOrders]);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Reset Filters
  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setCustomerFilter('');
    setPoDateFrom('');
    setPoDateTo('');
    setDeliveryDateFrom('');
    setDeliveryDateTo('');
  };

  const isFilterActive = searchTerm || statusFilter || customerFilter || poDateFrom || poDateTo || deliveryDateFrom || deliveryDateTo;

  // Filter and Sort Logic (Client-Side Only - Phase 5)
  const displayData = useMemo(() => {
    let filtered = purchaseOrders.filter(po => {
      // 1. Global Search (Partial match across multiple fields)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          (po.poNo || '').toLowerCase().includes(term) ||
          (po.customerName || '').toLowerCase().includes(term) ||
          (po.consignee || '').toLowerCase().includes(term) ||
          (po.artworkNo || '').toLowerCase().includes(term) ||
          (po.productName || '').toLowerCase().includes(term);
        if (!matches) return false;
      }

      // 2. Status Filter
      const calculatedStatus = getCalculatedStatus(po);
      if (statusFilter && calculatedStatus !== statusFilter) return false;

      // 3. Customer Filter
      if (customerFilter && po.customerId !== customerFilter) return false;

      // 4. PO Date Filter
      if (poDateFrom && po.poDate < poDateFrom) return false;
      if (poDateTo && po.poDate > poDateTo) return false;

      // 5. Delivery Date Filter
      if (deliveryDateFrom && po.deliveryDate < deliveryDateFrom) return false;
      if (deliveryDateTo && po.deliveryDate > deliveryDateTo) return false;

      return true;
    });

    // Sort by Status Priority sequence by default or by chosen column
    filtered.sort((a, b) => {
      const statusA = getCalculatedStatus(a);
      const statusB = getCalculatedStatus(b);
      const rankA = STATUS_PRIORITY_RANK[statusA] ?? 99;
      const rankB = STATUS_PRIORITY_RANK[statusB] ?? 99;

      if (sortField === 'statusPriority') {
        if (rankA !== rankB) return sortDir === 'asc' ? rankA - rankB : rankB - rankA;
        // Secondary sort within same status: earliest delivery date first, then newest PO date
        const delA = new Date(a.deliveryDate).getTime() || 0;
        const delB = new Date(b.deliveryDate).getTime() || 0;
        if (delA !== delB) return delA - delB;

        const poDateA = new Date(a.poDate).getTime() || 0;
        const poDateB = new Date(b.poDate).getTime() || 0;
        return poDateB - poDateA;
      }

      let aVal: any = a[sortField as keyof PurchaseOrder];
      let bVal: any = b[sortField as keyof PurchaseOrder];

      // Derived fields for sorting
      if (sortField === 'closingBal') {
        aVal = getPurchaseOrderBalance(a);
        bVal = getPurchaseOrderBalance(b);
      } else if (sortField === 'value') {
        const aBal = getPurchaseOrderBalance(a);
        const bBal = getPurchaseOrderBalance(b);
        aVal = aBal * a.rate;
        bVal = bBal * b.rate;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      
      // Secondary tie-breaker by status rank
      if (rankA !== rankB) return rankA - rankB;
      return 0;
    });

    return filtered;
  }, [purchaseOrders, searchTerm, statusFilter, customerFilter, poDateFrom, poDateTo, deliveryDateFrom, deliveryDateTo, sortField, sortDir, viewMode, selectedCustomerId]);

  // Item Wise Grouping Computation
  const [showMultipleOnly, setShowMultipleOnly] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());

  const toggleItemCollapse = (itemKey: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const expandAllItems = (keys?: string[]) => {
    setCollapsedItems(new Set());
  };

  const collapseAllItems = (keys: string[]) => {
    setCollapsedItems(new Set(keys));
  };

  const itemWiseData = useMemo(() => {
    const map = new Map<string, {
      key: string;
      productName: string;
      artworkNo: string;
      customerNames: Set<string>;
      poCount: number;
      totalOrderQty: number;
      totalInQty: number;
      totalOutQty: number;
      totalClosingBal: number;
      totalPoValue: number;
      totalPendingValue: number;
      pos: PurchaseOrder[];
    }>();

    displayData.forEach(po => {
      const prodName = (po.productName || 'Unnamed Item').trim();
      const artNo = (po.artworkNo || '').trim();
      const groupKey = `${prodName.toLowerCase()}___${artNo.toLowerCase()}`;
      const closingBal = getPurchaseOrderBalance(po);
      const poVal = po.orderQty * po.rate;
      const pendingVal = closingBal * po.rate;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          productName: prodName,
          artworkNo: artNo,
          customerNames: new Set<string>(),
          poCount: 0,
          totalOrderQty: 0,
          totalInQty: 0,
          totalOutQty: 0,
          totalClosingBal: 0,
          totalPoValue: 0,
          totalPendingValue: 0,
          pos: []
        });
      }

      const group = map.get(groupKey)!;
      group.poCount += 1;
      if (po.customerName) group.customerNames.add(po.customerName);
      group.totalOrderQty += po.orderQty;
      group.totalInQty += (po.inQty || 0);
      group.totalOutQty += (po.outQty || 0);
      group.totalClosingBal += closingBal;
      group.totalPoValue += poVal;
      group.totalPendingValue += pendingVal;
      group.pos.push(po);
    });

    let groups = Array.from(map.values()).map(g => ({
      ...g,
      customerList: Array.from(g.customerNames),
      hasMultiple: g.poCount > 1
    }));

    // Sort: items with multiple POs (>1) at top by default, then by total closing balance
    groups.sort((a, b) => {
      if (a.hasMultiple !== b.hasMultiple) {
        return a.hasMultiple ? -1 : 1;
      }
      return b.totalClosingBal - a.totalClosingBal || a.productName.localeCompare(b.productName);
    });

    return groups;
  }, [displayData]);

  const multiPoItemsCount = useMemo(() => {
    return itemWiseData.filter(g => g.hasMultiple).length;
  }, [itemWiseData]);

  const filteredItemGroups = useMemo(() => {
    if (showMultipleOnly) {
      return itemWiseData.filter(g => g.hasMultiple);
    }
    return itemWiseData;
  }, [itemWiseData, showMultipleOnly]);

  // Phase 9: Customer Summaries Computation
  const { customerSummaries, summaryGrandTotals } = useMemo(() => {
    const map = new Map<string, any>();
    
    let grandPoValue = 0;
    let grandOpnQty = 0;
    let grandInQty = 0;
    let grandOutQty = 0;
    let grandClosingBal = 0;
    let grandPendingValue = 0;

    purchaseOrders.forEach(po => {
      if (!po.customerId || !po.customerName) return;
      
      const closingBal = getPurchaseOrderBalance(po);
      const poValue = po.orderQty * po.rate;
      const pendingValue = closingBal * po.rate;

      if (!map.has(po.customerId)) {
        map.set(po.customerId, {
          id: po.customerId,
          name: po.customerName,
          poCount: 0,
          poValue: 0,
          opnQty: 0,
          inQty: 0,
          outQty: 0,
          closingBal: 0,
          pendingValue: 0
        });
      }

      const summary = map.get(po.customerId);
      summary.poCount += 1;
      summary.poValue += poValue;
      summary.opnQty += po.orderQty;
      summary.inQty += (po.inQty || 0);
      summary.outQty += (po.outQty || 0);
      summary.closingBal += closingBal;
      summary.pendingValue += pendingValue;

      // Add to grand totals
      grandPoValue += poValue;
      grandOpnQty += po.orderQty;
      grandInQty += (po.inQty || 0);
      grandOutQty += (po.outQty || 0);
      grandClosingBal += closingBal;
      grandPendingValue += pendingValue;
    });

    let summaries = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (summarySearch) {
      const term = summarySearch.toLowerCase();
      summaries = summaries.filter(s => s.name.toLowerCase().includes(term));
    }

    return { 
      customerSummaries: summaries,
      summaryGrandTotals: { grandPoValue, grandOpnQty, grandInQty, grandOutQty, grandClosingBal, grandPendingValue }
    };
  }, [purchaseOrders, summarySearch]);

  const selectedCustomerSummary = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customerSummaries.find(s => s.id === selectedCustomerId) || null;
  }, [customerSummaries, selectedCustomerId]);

  // Phase 12: Monthly PO Data Computation
  const monthlyData = useMemo(() => {
    if (viewMode !== 'MONTHLY' || !selectedMonth) return [];

    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const monthIndex = parseInt(monthStr) - 1;

    // Start and End of selected month (local time)
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    // Group transactions by PO
    const txByPo = new Map<string, any[]>();
    poTransactions.forEach(tx => {
      if (!txByPo.has(tx.poId)) txByPo.set(tx.poId, []);
      txByPo.get(tx.poId)!.push(tx);
    });

    let filtered = purchaseOrders.map(po => {
      const txs = txByPo.get(po.id || '') || [];
      
      let inBefore = 0;
      let outBefore = 0;
      let monthlyIn = 0;
      let monthlyOut = 0;

      txs.forEach(tx => {
        const txDate = new Date(tx.createdAt || tx.date);
        if (txDate < monthStart) {
          if (tx.type === 'IN') inBefore += (tx.quantity || 0);
          if (tx.type === 'OUT') outBefore += (tx.quantity || 0);
        } else if (txDate >= monthStart && txDate <= monthEnd) {
          if (tx.type === 'IN') monthlyIn += (tx.quantity || 0);
          if (tx.type === 'OUT') monthlyOut += (tx.quantity || 0);
        }
      });

      const openingBal = po.orderQty + inBefore - outBefore;
      const closingBal = openingBal + monthlyIn - monthlyOut;
      const value = closingBal * po.rate;

      return {
        ...po,
        monthlyOpeningBal: openingBal,
        monthlyIn,
        monthlyOut,
        monthlyClosingBal: closingBal,
        monthlyValue: value
      };
    });

    // Apply Monthly Filters
    filtered = filtered.filter(po => {
      // 1. Only show if there's activity OR non-zero opening/closing balance
      if (po.monthlyOpeningBal === 0 && po.monthlyIn === 0 && po.monthlyOut === 0 && po.monthlyClosingBal === 0) return false;

      // 2. Global Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          (po.poNo || '').toLowerCase().includes(term) ||
          (po.customerName || '').toLowerCase().includes(term) ||
          (po.consignee || '').toLowerCase().includes(term) ||
          (po.artworkNo || '').toLowerCase().includes(term) ||
          (po.productName || '').toLowerCase().includes(term);
        if (!matches) return false;
      }

      // 3. Status Filter
      const calculatedStatus = getCalculatedStatus(po);
      if (statusFilter && calculatedStatus !== statusFilter) return false;

      // 4. Customer Filter
      if (customerFilter && po.customerId !== customerFilter) return false;

      return true;
    });

    // Sort by PO Date
    filtered.sort((a, b) => new Date(b.poDate).getTime() - new Date(a.poDate).getTime());

    return filtered;
  }, [purchaseOrders, poTransactions, viewMode, selectedMonth, searchTerm, statusFilter, customerFilter]);

  const monthlyTotals = useMemo(() => {
    return monthlyData.reduce((acc, po) => {
      acc.inQty += po.monthlyIn;
      acc.outQty += po.monthlyOut;
      acc.closingBal += po.monthlyClosingBal;
      acc.value += po.monthlyValue;
      return acc;
    }, { inQty: 0, outQty: 0, closingBal: 0, value: 0 });
  }, [monthlyData]);

  // Dynamic Totals based on Filtered Data (for All POs view)
  const totals = useMemo(() => {
    return displayData.reduce((acc, po) => {
      const closingBal = getPurchaseOrderBalance(po);
      const value = closingBal * po.rate;
      const initialValue = po.orderQty * po.rate;
      
      acc.poValue += initialValue;
      acc.openQty += po.orderQty;
      acc.inQty += (po.inQty || 0);
      acc.outQty += (po.outQty || 0);
      acc.closingBal += closingBal;
      acc.pendingValue += value;
      return acc;
    }, { poValue: 0, openQty: 0, inQty: 0, outQty: 0, closingBal: 0, pendingValue: 0 });
  }, [displayData]);

  const handleExport = () => {
    exportPurchaseOrdersToExcel(displayData);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const thClass = "px-3 py-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors group select-none whitespace-nowrap";

  const handleDelete = async (po: PurchaseOrder) => {
    if (window.confirm(`Are you sure you want to delete PO No. ${po.poNo}? This cannot be undone.`)) {
      try {
        await deletePurchaseOrder(po.id!, user?.name || 'Unknown');
        refetch();
      } catch (err) {
        console.error('Failed to delete PO:', err);
        alert('Failed to delete PO. It might be linked to other records.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground uppercase tracking-tight flex items-center">
              <ShoppingCart className="w-6 h-6 mr-3 text-primary" />
              PO Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track and manage customer purchase orders and deliveries</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="bg-muted p-1 rounded-lg flex mr-4">
              <button 
                onClick={() => { setViewMode('ALL'); setSelectedCustomerId(null); }}
                className={cn("px-4 py-1.5 text-sm font-bold rounded-md flex items-center transition-all", viewMode === 'ALL' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <List className="w-4 h-4 mr-2" /> All POs
              </button>
              <button 
                onClick={() => { setViewMode('ITEM_WISE'); setSelectedCustomerId(null); }}
                className={cn("px-4 py-1.5 text-sm font-bold rounded-md flex items-center transition-all relative", viewMode === 'ITEM_WISE' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Boxes className="w-4 h-4 mr-2 text-primary" /> Item Wise (Grouping)
                {multiPoItemsCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black rounded-full">
                    {multiPoItemsCount} Multi
                  </span>
                )}
              </button>
              <button 
                onClick={() => { setViewMode('SUMMARY'); setSelectedCustomerId(null); }}
                className={cn("px-4 py-1.5 text-sm font-bold rounded-md flex items-center transition-all", viewMode === 'SUMMARY' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Users className="w-4 h-4 mr-2" /> Customer Summary
              </button>
              <button 
                onClick={() => { setViewMode('MONTHLY'); setSelectedCustomerId(null); }}
                className={cn("px-4 py-1.5 text-sm font-bold rounded-md flex items-center transition-all ml-1", viewMode === 'MONTHLY' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <FileText className="w-4 h-4 mr-2" /> Monthly View
              </button>
            </div>
            <button 
              onClick={downloadPOTemplate}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-lg font-bold flex items-center shadow-sm transition-all"
            >
              <Download className="w-5 h-5 mr-2" />
              TEMPLATE
            </button>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-md shadow-green-600/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              IMPORT EXCEL
            </button>
            <button 
              onClick={() => setIsBulkCloseModalOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-md shadow-red-600/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <FileX2 className="w-5 h-5 mr-2" />
              NIL POs
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-bold flex items-center shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5 mr-2" />
              CREATE NEW PO
            </button>
          </div>
        </div>
      </div>

      {/* ----------- ITEM WISE (GROUP BY ITEM) VIEW ----------- */}
      {viewMode === 'ITEM_WISE' && (
        <div className="flex flex-col h-full space-y-4 animate-fade-in">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'TOTAL UNIQUE ITEMS', value: itemWiseData.length, color: 'text-foreground' },
              { label: 'ITEMS WITH MULTI POs', value: multiPoItemsCount, color: 'text-amber-600 font-black' },
              { label: 'TOTAL OPENING QTY', value: totals.openQty.toLocaleString(), color: 'text-foreground' },
              { label: 'TOTAL IN QTY', value: totals.inQty.toLocaleString(), color: 'text-green-600' },
              { label: 'TOTAL OUT QTY', value: totals.outQty.toLocaleString(), color: 'text-red-600' },
              { label: 'TOTAL PENDING BAL', value: totals.closingBal.toLocaleString(), color: 'text-primary font-black' },
            ].map((card, i) => (
              <div key={i} className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden group hover:border-primary/50 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full -z-10 transition-transform group-hover:scale-150" />
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">{card.label}</p>
                <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative w-full lg:w-[320px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search Item, Customer, PO No..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Toggle Multiple POs only */}
              <div className="bg-muted p-1 rounded-lg flex items-center">
                <button
                  type="button"
                  onClick={() => setShowMultipleOnly(false)}
                  className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all", !showMultipleOnly ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
                >
                  All Items ({itemWiseData.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowMultipleOnly(true)}
                  className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1", showMultipleOnly ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground hover:text-foreground")}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Multiple POs Only ({multiPoItemsCount})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
              <button
                type="button"
                onClick={() => expandAllItems()}
                className="px-3 py-1.5 text-xs font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => collapseAllItems(itemWiseData.map(g => g.key))}
                className="px-3 py-1.5 text-xs font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
              >
                Collapse All
              </button>
              <button onClick={handleExport} className="px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg transition-colors hover:bg-secondary/80">
                Export Excel
              </button>
            </div>
          </div>

          {/* Item Wise Groups List */}
          <div className="space-y-4">
            {filteredItemGroups.length === 0 ? (
              <div className="bg-card p-12 rounded-xl border border-border text-center">
                <Boxes className="w-12 h-12 mb-3 text-muted-foreground/30 mx-auto" />
                <p className="text-base font-semibold text-muted-foreground">No Items Found</p>
                <p className="text-xs text-muted-foreground mt-1">Try changing your search or filters.</p>
              </div>
            ) : (
              filteredItemGroups.map((group) => {
                const isCollapsed = collapsedItems.has(group.key);
                return (
                  <div key={group.key} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden transition-all hover:border-primary/40">
                    {/* Item Header Accordion Bar */}
                    <div 
                      onClick={() => toggleItemCollapse(group.key)}
                      className="p-4 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 select-none"
                    >
                      <div className="flex items-start md:items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5 md:mt-0">
                          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-foreground">{group.productName}</h3>
                            {group.artworkNo && (
                              <span className="px-2 py-0.5 bg-muted border border-border text-muted-foreground font-mono text-xs rounded">
                                Art: {group.artworkNo}
                              </span>
                            )}
                            {group.hasMultiple ? (
                              <span className="px-2.5 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-bold rounded-full text-xs flex items-center gap-1">
                                <Layers className="w-3 h-3" />
                                {group.poCount} POs Combined
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-secondary text-muted-foreground font-semibold rounded-full text-[11px]">
                                1 PO
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>Parties:</span>
                            {group.customerList.map((cust, idx) => (
                              <span key={idx} className="font-semibold text-foreground bg-background px-2 py-0.5 rounded border border-border/60 text-[11px]">
                                {cust}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Summary Metrics for this Item */}
                      <div className="flex flex-wrap items-center gap-3 lg:gap-5 self-end md:self-auto bg-background/80 px-4 py-2 rounded-lg border border-border/50">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">Total Opn</p>
                          <p className="text-sm font-bold text-foreground">{group.totalOrderQty.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-green-600/80 font-bold uppercase">Total In</p>
                          <p className="text-sm font-bold text-green-600">{group.totalInQty.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-red-600/80 font-bold uppercase">Total Out</p>
                          <p className="text-sm font-bold text-red-600">{group.totalOutQty.toLocaleString()}</p>
                        </div>
                        <div className="text-right pl-2 border-l border-border">
                          <p className="text-[10px] text-primary font-bold uppercase">Pending Balance</p>
                          <p className="text-base font-black text-primary">{group.totalClosingBal.toLocaleString()} pcs</p>
                        </div>
                        <div className="text-right pl-2 border-l border-border">
                          <p className="text-[10px] text-orange-600/80 font-bold uppercase">Pending Value</p>
                          <p className="text-sm font-black text-orange-600">₹{group.totalPendingValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Table of POs for this item */}
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap min-w-[1100px]">
                          <thead className="bg-secondary/30 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2.5 border-b border-border">PO NO.</th>
                              <th className="px-3 py-2.5 border-b border-border">PO DATE</th>
                              <th className="px-3 py-2.5 border-b border-border">DELIVERY DATE</th>
                              <th className="px-3 py-2.5 border-b border-border">CUSTOMER</th>
                              <th className="px-3 py-2.5 border-b border-border">CONSIGNEE</th>
                              <th className="px-3 py-2.5 border-b border-border text-right">RATE</th>
                              <th className="px-3 py-2.5 border-b border-border text-right">OPN QTY</th>
                              <th className="px-3 py-2.5 border-b border-border text-right text-green-600">IN QTY</th>
                              <th className="px-3 py-2.5 border-b border-border text-right text-red-600">OUT QTY</th>
                              <th className="px-3 py-2.5 border-b border-border text-right font-bold">CLOSING BAL</th>
                              <th className="px-3 py-2.5 border-b border-border text-right text-orange-600">VALUE</th>
                              <th className="px-3 py-2.5 border-b border-border text-center">STATUS</th>
                              <th className="px-3 py-2.5 border-b border-border text-center">ACTION</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {group.pos.map((po) => {
                              const closingBal = getPurchaseOrderBalance(po);
                              const value = closingBal * po.rate;
                              const calculatedStatus = getCalculatedStatus(po);
                              return (
                                <tr key={po.id} className="hover:bg-muted/20 transition-colors">
                                  <td className="px-3 py-2 font-bold text-foreground">{po.poNo}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{formatDate(po.poDate)}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{formatDate(po.deliveryDate)}</td>
                                  <td className="px-3 py-2 font-semibold truncate max-w-[150px]" title={po.customerName}>{po.customerName}</td>
                                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]" title={po.consignee}>{po.consignee || '-'}</td>
                                  <td className="px-3 py-2 text-right font-medium">₹{po.rate.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-bold">{po.orderQty.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-bold text-green-600">{(po.inQty || 0).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-bold text-red-600">{(po.outQty || 0).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-black text-foreground">{closingBal.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right font-bold text-orange-600">₹{value.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                                      calculatedStatus === 'PENDING' ? 'bg-blue-100 text-blue-700' :
                                      calculatedStatus === 'PARTIALLY COMPLETED' ? 'bg-orange-100 text-orange-700' :
                                      calculatedStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {calculatedStatus}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => setInActionPo(po)}
                                        disabled={calculatedStatus === 'COMPLETED' || calculatedStatus === 'CANCELLED'}
                                        className="bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-0.5 rounded text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Record IN Transaction"
                                      >
                                        IN
                                      </button>
                                      <button
                                        onClick={() => setEditPo(po)}
                                        className="p-1 hover:bg-orange-100 text-orange-600 rounded transition-colors"
                                        title="Edit Purchase Order"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setAdjustPo(po)}
                                        className="p-1 hover:bg-amber-100 text-amber-600 rounded transition-colors"
                                        title="Adjust / Audit PO Balance / Make NIL"
                                      >
                                        <Scale className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setHistoryPo(po)}
                                        className="p-1 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                                        title="View Transaction History"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setLinkedPo(po)}
                                        className="p-1 hover:bg-purple-100 text-purple-600 rounded transition-colors"
                                        title="View Linked Job Cards"
                                      >
                                        <Link className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(po)}
                                        className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                                        title="Delete Purchase Order"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {group.hasMultiple && (
                            <tfoot className="bg-muted/40 font-bold border-t border-border">
                              <tr>
                                <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase text-muted-foreground">
                                  TOTAL FOR {group.productName} ({group.poCount} POs):
                                </td>
                                <td className="px-3 py-2 text-right text-foreground font-bold">{group.totalOrderQty.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-green-600 font-bold">{group.totalInQty.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-red-600 font-bold">{group.totalOutQty.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-foreground font-black">{group.totalClosingBal.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-orange-600 font-bold">₹{group.totalPendingValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ----------- CUSTOMER SUMMARY VIEW ----------- */}
      {viewMode === 'SUMMARY' && (
        <div className="flex flex-col h-full space-y-4 animate-fade-in">
          <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="relative w-full lg:w-[400px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search Customer Name..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col shadow-sm relative min-h-[400px]">
             <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[1000px]">
                <thead className="bg-secondary/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3 border-b border-border">1. CUSTOMER NAME</th>
                    <th className="px-4 py-3 border-b border-border text-right">2. TOTAL PO VALUE</th>
                    <th className="px-4 py-3 border-b border-border text-right">3. TOTAL OPN QTY</th>
                    <th className="px-4 py-3 border-b border-border text-right text-green-600/70">4. TOTAL IN QTY</th>
                    <th className="px-4 py-3 border-b border-border text-right text-red-600/70">5. TOTAL OUT QTY</th>
                    <th className="px-4 py-3 border-b border-border text-right">6. TOTAL CLOSING BAL</th>
                    <th className="px-4 py-3 border-b border-border text-right text-orange-600/70">7. PENDING VALUE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Users className="w-12 h-12 mb-3 text-muted-foreground/30" />
                          <p className="text-base font-semibold">No Purchase Orders Available</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    customerSummaries.map((s) => (
                      <tr 
                        key={s.id} 
                        className="hover:bg-primary/5 cursor-pointer transition-colors group"
                        onClick={() => {
                          setSelectedCustomerId(s.id);
                          setViewMode('DETAIL');
                        }}
                      >
                        <td className="px-4 py-3 font-bold text-foreground group-hover:text-primary transition-colors flex items-center">
                          {s.name} <span className="ml-2 text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{s.poCount} POs</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">₹{s.poValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="px-4 py-3 text-right font-semibold">{s.opnQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">{s.inQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">{s.outQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-black text-foreground">{s.closingBal.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">₹{s.pendingValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Grand Total Footer */}
                {customerSummaries.length > 0 && (
                  <tfoot className="bg-muted/50 font-bold sticky bottom-0 border-t-2 border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <tr>
                      <td className="px-4 py-3 text-foreground uppercase tracking-wider text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-3 text-right">₹{summaryGrandTotals.grandPoValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td className="px-4 py-3 text-right">{summaryGrandTotals.grandOpnQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-green-600">{summaryGrandTotals.grandInQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-600">{summaryGrandTotals.grandOutQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-foreground">{summaryGrandTotals.grandClosingBal.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-orange-600">₹{summaryGrandTotals.grandPendingValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------- DETAIL / ALL POS / MONTHLY VIEW ----------- */}
      {(viewMode === 'ALL' || viewMode === 'DETAIL' || viewMode === 'MONTHLY') && (
        <div className="flex flex-col h-full space-y-6 animate-fade-in">
          
          {/* Back Button for Detail View */}
          {viewMode === 'DETAIL' && selectedCustomerSummary && (
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => { setViewMode('SUMMARY'); setSelectedCustomerId(null); }}
                className="self-start flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> BACK TO ALL CUSTOMERS
              </button>
              
              <div className="bg-card p-5 rounded-xl border border-border shadow-sm bg-gradient-to-r from-primary/5 to-transparent">
                <h2 className="text-xl font-black text-foreground mb-4">{selectedCustomerSummary.name}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total POs</p>
                    <p className="text-lg font-bold">{selectedCustomerSummary.poCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total PO Value</p>
                    <p className="text-lg font-bold">₹{selectedCustomerSummary.poValue.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Opening Qty</p>
                    <p className="text-lg font-semibold">{selectedCustomerSummary.opnQty.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total IN</p>
                    <p className="text-lg font-semibold text-green-600">{selectedCustomerSummary.inQty.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total OUT</p>
                    <p className="text-lg font-semibold text-red-600">{selectedCustomerSummary.outQty.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Closing Bal</p>
                    <p className="text-lg font-black">{selectedCustomerSummary.closingBal.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Value</p>
                    <p className="text-lg font-bold text-orange-600">₹{selectedCustomerSummary.pendingValue.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards (Only in ALL mode) */}
          {viewMode === 'ALL' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'TOTAL PO VALUE', value: `₹${totals.poValue.toLocaleString()}`, color: 'text-primary' },
                { label: 'TOTAL OPENING QTY', value: totals.openQty.toLocaleString(), color: 'text-foreground' },
                { label: 'TOTAL IN QTY', value: totals.inQty.toLocaleString(), color: 'text-green-600' },
                { label: 'TOTAL OUT QTY', value: totals.outQty.toLocaleString(), color: 'text-red-600' },
                { label: 'TOTAL CLOSING BAL', value: totals.closingBal.toLocaleString(), color: 'text-foreground' },
                { label: 'PENDING PO VALUE', value: `₹${totals.pendingValue.toLocaleString()}`, color: 'text-orange-600' },
              ].map((card, i) => (
                <div key={i} className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden group hover:border-primary/50 transition-colors">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full -z-10 transition-transform group-hover:scale-150" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">{card.label}</p>
                  <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>
          )}

      {/* Toolbar / Filters (Phase 5 & 12 Active) */}
      <div className="flex flex-col gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="relative w-full lg:w-[400px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search PO No, Customer, Consignee, Item..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
            {viewMode === 'MONTHLY' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 mr-2"
              />
            )}
            <button onClick={handleExport} className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-bold rounded-lg transition-colors hover:bg-secondary/80 mr-2">
              Export Excel
            </button>
            {(isFilterActive || (viewMode === 'MONTHLY' && selectedMonth !== (() => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`})())) && (
              <button 
                onClick={() => {
                  resetFilters();
                  const d = new Date();
                  setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center rounded-lg font-semibold transition-colors border border-transparent hover:border-red-200"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-border">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer</label>
            <select 
              className="w-full px-3 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/20"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            >
              <option value="">All Customers</option>
              {uniqueCustomers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
            <select 
              className="w-full px-3 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/20"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY COMPLETED">Partially Completed</option>
              <option value="COMPLETED">Completed</option>
              <option value="OVERDUE / DELAYED">Overdue / Delayed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {viewMode !== 'MONTHLY' && (
          <div className="col-span-1 md:col-span-3 flex flex-wrap lg:flex-nowrap gap-3">
            <div className="flex-1 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">PO Date From</label>
                <input type="date" value={poDateFrom} onChange={(e) => setPoDateFrom(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background focus:outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">PO Date To</label>
                <input type="date" value={poDateTo} onChange={(e) => setPoDateTo(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background focus:outline-none" />
              </div>
            </div>
            <div className="flex-1 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Del Date From</label>
                <input type="date" value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background focus:outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Del Date To</label>
                <input type="date" value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background focus:outline-none" />
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Data Table */}
      {viewMode !== 'MONTHLY' && (
      <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col shadow-sm relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex flex-col items-center text-primary">
              <Activity className="w-8 h-8 animate-spin mb-2" />
              <span className="font-semibold">Loading POs...</span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[1200px]">
            <thead className="bg-secondary/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className={thClass} onClick={() => handleSort('poNo')}>
                  <div className="flex items-center">1. PO NO. <SortIcon field="poNo" /></div>
                </th>
                <th className={thClass} onClick={() => handleSort('poDate')}>
                  <div className="flex items-center">2. PO DT <SortIcon field="poDate" /></div>
                </th>
                <th className={thClass} onClick={() => handleSort('deliveryDate')}>
                  <div className="flex items-center">3. DELIVERY DATE <SortIcon field="deliveryDate" /></div>
                </th>
                <th className={thClass} onClick={() => handleSort('customerName')}>
                  <div className="flex items-center">4. CUSTOMER NAME <SortIcon field="customerName" /></div>
                </th>
                <th className="px-3 py-3 border-b border-border max-w-[150px] truncate">5. CONSIGNEE</th>
                <th className="px-3 py-3 border-b border-border">6. ARTWORK NO.</th>
                <th className="px-3 py-3 border-b border-border">7. ITEM NAME</th>
                <th className="px-3 py-3 border-b border-border">8. SIZE</th>
                <th className="px-3 py-3 border-b border-border text-right">9. RATE</th>
                <th className={cn(thClass, "text-right")} onClick={() => handleSort('orderQty')}>
                  <div className="flex items-center justify-end">10. OPN QTY <SortIcon field="orderQty" /></div>
                </th>
                <th className={cn(thClass, "text-right text-green-600/70")} onClick={() => handleSort('inQty')}>
                  <div className="flex items-center justify-end">11. IN QTY <SortIcon field="inQty" /></div>
                </th>
                <th className={cn(thClass, "text-right text-red-600/70")} onClick={() => handleSort('outQty')}>
                  <div className="flex items-center justify-end">12. OUT QTY <SortIcon field="outQty" /></div>
                </th>
                <th className={cn(thClass, "text-right")} onClick={() => handleSort('closingBal')}>
                  <div className="flex items-center justify-end">13. CLOSING BAL <SortIcon field="closingBal" /></div>
                </th>
                <th className={cn(thClass, "text-right text-orange-600/70")} onClick={() => handleSort('value')}>
                  <div className="flex items-center justify-end">14. VALUE <SortIcon field="value" /></div>
                </th>
                <th className={cn(thClass, "text-center")} onClick={() => handleSort('statusPriority')}>
                  <div className="flex items-center justify-center">STATUS <SortIcon field="statusPriority" /></div>
                </th>
                <th className="px-3 py-3 border-b border-border text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayData.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={15} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="w-12 h-12 mb-3 text-muted-foreground/30" />
                      <p className="text-base font-semibold">No Purchase Orders Found</p>
                      {isFilterActive && <p className="text-xs mt-1 text-red-500 font-medium">Try clearing your filters to see more results.</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                displayData.map((po) => {
                  const closingBal = getPurchaseOrderBalance(po);
                  const value = closingBal * po.rate;
                  const calculatedStatus = getCalculatedStatus(po);
                  return (
                    <tr key={po.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-3 py-2 font-bold text-foreground">{po.poNo}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(po.poDate)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(po.deliveryDate)}</td>
                      <td className="px-3 py-2 font-semibold truncate max-w-[150px]" title={po.customerName}>{po.customerName}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]" title={po.consignee}>{po.consignee || '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{po.artworkNo || '-'}</td>
                      <td className="px-3 py-2 font-medium max-w-[200px]" title={po.productName}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{po.productName}</span>
                          {(() => {
                            const group = itemWiseData.find(g => g.productName.toLowerCase() === (po.productName || '').trim().toLowerCase());
                            if (group && group.hasMultiple) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchTerm(po.productName);
                                    setViewMode('ITEM_WISE');
                                  }}
                                  className="px-1.5 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded text-[10px] font-bold shrink-0 transition-colors"
                                  title={`This item has ${group.poCount} POs. Click to view grouped!`}
                                >
                                  {group.poCount} POs
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{po.size}</td>
                      <td className="px-3 py-2 text-right font-medium">₹{po.rate.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold">{po.orderQty}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-600">{po.inQty || 0}</td>
                      <td className="px-3 py-2 text-right font-bold text-red-600">{po.outQty || 0}</td>
                      <td className="px-3 py-2 text-right font-black text-foreground">{closingBal}</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-600">₹{value.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          calculatedStatus === 'PENDING' ? 'bg-blue-100 text-blue-700' :
                          calculatedStatus === 'PARTIALLY COMPLETED' ? 'bg-orange-100 text-orange-700' :
                          calculatedStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {calculatedStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setInActionPo(po)}
                            disabled={calculatedStatus === 'COMPLETED' || calculatedStatus === 'CANCELLED'}
                            className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Record IN Transaction"
                          >
                            IN
                          </button>
                          <button
                            onClick={() => setAddPoTarget({ poNo: po.poNo, customerId: po.customerId })}
                            className="p-1 hover:bg-primary/10 text-primary rounded transition-colors"
                            title="Add New Item to this PO"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditPo(po)}
                            className="p-1 hover:bg-orange-100 text-orange-600 rounded transition-colors"
                            title="Edit Purchase Order"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(po)}
                            className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                            title="Delete Purchase Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setAdjustPo(po)}
                            className="p-1 hover:bg-amber-100 text-amber-600 rounded transition-colors"
                            title="Adjust / Audit PO Balance / Make NIL"
                          >
                            <Scale className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setHistoryPo(po)}
                            className="p-1 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                            title="View Transaction History"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setLinkedPo(po)}
                            className="p-1 hover:bg-purple-100 text-purple-600 rounded transition-colors"
                            title="View Linked Job Cards"
                          >
                            <Link className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {viewMode === 'MONTHLY' && (
        <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col shadow-sm relative">
          {(isLoading || loadingTx) && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex flex-col items-center text-primary">
                <Activity className="w-8 h-8 animate-spin mb-2" />
                <span className="font-semibold">Loading Monthly View...</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[1200px]">
              <thead className="bg-secondary/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-3 py-3 border-b border-border cursor-pointer hover:bg-muted/50">1. PO NO.</th>
                  <th className="px-3 py-3 border-b border-border cursor-pointer hover:bg-muted/50">2. PO DT</th>
                  <th className="px-3 py-3 border-b border-border cursor-pointer hover:bg-muted/50">3. DELIVERY DATE</th>
                  <th className="px-3 py-3 border-b border-border cursor-pointer hover:bg-muted/50">4. CUSTOMER NAME</th>
                  <th className="px-3 py-3 border-b border-border truncate max-w-[100px]">5. ARTWORK NO.</th>
                  <th className="px-3 py-3 border-b border-border truncate max-w-[150px]">6. ITEM NAME</th>
                  <th className="px-3 py-3 border-b border-border text-right">7. RATE</th>
                  <th className="px-3 py-3 border-b border-border text-right text-foreground">8. OPN QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right text-green-600/70 bg-green-50/30">9. MTH IN QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right text-red-600/70 bg-red-50/30">10. MTH OUT QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right text-foreground">11. CLOSING BAL</th>
                  <th className="px-3 py-3 border-b border-border text-right text-orange-600/70">12. VALUE</th>
                  <th className="px-3 py-3 border-b border-border text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthlyData.length === 0 && !(isLoading || loadingTx) ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="w-12 h-12 mb-3 text-muted-foreground/30" />
                        <p className="text-base font-semibold">No Monthly PO Activity Found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  monthlyData.map((po: any) => {
                    const calculatedStatus = getCalculatedStatus(po);
                    return (
                      <tr key={po.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-3 py-2 font-bold text-foreground">{po.poNo}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(po.poDate)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(po.deliveryDate)}</td>
                        <td className="px-3 py-2 font-semibold truncate max-w-[150px]" title={po.customerName}>{po.customerName}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground max-w-[100px] truncate" title={po.artworkNo}>{po.artworkNo || '-'}</td>
                        <td className="px-3 py-2 font-medium truncate max-w-[150px]" title={po.productName}>{po.productName}</td>
                        <td className="px-3 py-2 text-right font-medium">₹{po.rate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold">{po.monthlyOpeningBal}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-600 bg-green-50/30">{po.monthlyIn || 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600 bg-red-50/30">{po.monthlyOut || 0}</td>
                        <td className="px-3 py-2 text-right font-black text-foreground">{po.monthlyClosingBal}</td>
                        <td className="px-3 py-2 text-right font-bold text-orange-600">₹{po.monthlyValue.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                            calculatedStatus === 'PENDING' ? 'bg-blue-100 text-blue-700' :
                            calculatedStatus === 'PARTIALLY COMPLETED' ? 'bg-orange-100 text-orange-700' :
                            calculatedStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {calculatedStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {monthlyData.length > 0 && (
                <tfoot className="bg-muted/50 font-bold sticky bottom-0 border-t-2 border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-foreground uppercase tracking-wider text-xs text-right">MONTHLY TOTALS</td>
                    <td className="px-3 py-3 text-right text-green-600 bg-green-50/50">{monthlyTotals.inQty.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-red-600 bg-red-50/50">{monthlyTotals.outQty.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-foreground">{monthlyTotals.closingBal.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-orange-600">₹{monthlyTotals.value.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* ----------- ADD MODALS ----------- */}
      {(isAddModalOpen || addPoTarget) && (
        <AddPOModal 
          initialPoNo={addPoTarget?.poNo}
          initialCustomerId={addPoTarget?.customerId}
          onClose={() => {
            setIsAddModalOpen(false);
            setAddPoTarget(null);
          }}
          onSuccess={() => {
            setIsAddModalOpen(false);
            setAddPoTarget(null);
            refetch();
          }}
        />
      )}

      {inActionPo && (
        <POInModal
          po={inActionPo}
          onClose={() => setInActionPo(null)}
          onSuccess={() => {
            setInActionPo(null);
            refetch();
          }}
        />
      )}

      {historyPo && (
        <POHistoryModal
          po={historyPo}
          onClose={() => setHistoryPo(null)}
          onRefreshParent={refetch}
        />
      )}

      {adjustPo && (
        <POAdjustModal
          po={adjustPo}
          onClose={() => setAdjustPo(null)}
          onSuccess={() => {
            setAdjustPo(null);
            refetch();
          }}
        />
      )}

      {linkedPo && (
        <LinkedJobCardsModal
          po={linkedPo}
          onClose={() => setLinkedPo(null)}
        />
      )}

      {isImportModalOpen && (
        <ExcelImportPreviewModal
          onClose={() => setIsImportModalOpen(false)}
          existingPOs={purchaseOrders}
          onSuccess={() => {
            setIsImportModalOpen(false);
            refetch();
          }}
        />
      )}

      {editPo && (
        <EditPOModal
          po={editPo}
          onClose={() => setEditPo(null)}
          onSuccess={() => {
            setEditPo(null);
            refetch();
          }}
        />
      )}

      {isBulkCloseModalOpen && (
        <BulkClosePOModal
          activePOs={purchaseOrders}
          onClose={() => setIsBulkCloseModalOpen(false)}
        />
      )}
    </div>
  );
}

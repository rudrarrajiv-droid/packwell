import React, { useState, useMemo } from 'react';
import { 
  Plus, Search, Download, Trash2, CheckCircle2, Clock, AlertTriangle, 
  Layers, Truck, Sparkles, Filter, X, ChevronRight, FileText, Check, AlertCircle, Eye,
  Lock, Printer
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { 
  getPurchaseOrders, 
  deletePurchaseOrder, 
  updatePurchaseOrder, 
  type PurchaseOrder, 
  getPurchaseOrderBalance 
} from '../lib/supabase/purchaseOrderService';
import { getCustomers } from '../lib/supabase/customerService';
import { getProducts } from '../lib/supabase/productService';
import { getReels } from '../lib/supabase/reelService';
import { executeJobCardTransaction, updateJobCard, getAllJobCards } from '../lib/supabase/jobCardService';
import { exportToExcel } from '../lib/exportUtils';
import { cn } from '../lib/utils';
import { computePORMStatus } from '../lib/rmStatusHelper';

// Modals
import AddPOModal from './po-management/AddPOModal';
import QuickDispatchModal from './po-management/QuickDispatchModal';
import RMStatusModal from './po-management/RMStatusModal';
import { JobCardModal } from './JobCards';
import ReelAllocationWizard from './job-cards/ReelAllocationWizard';
import PrintableJobCard from './job-cards/PrintableJobCard';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Delivery Alert calculation helper
export interface DeliveryAlertInfo {
  isOverdue: boolean;
  isDueSoon: boolean; // within 2 days
  daysDiff: number;
  label: string;
  badgeClass: string;
}

export function getDeliveryAlert(deliveryDateStr?: string | null, isCompleted?: boolean): DeliveryAlertInfo {
  if (isCompleted) {
    return {
      isOverdue: false,
      isDueSoon: false,
      daysDiff: 0,
      label: 'COMPLETED',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
    };
  }

  if (!deliveryDateStr) {
    return {
      isOverdue: false,
      isDueSoon: false,
      daysDiff: 999,
      label: 'NO DATE',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const delDate = new Date(deliveryDateStr);
  if (isNaN(delDate.getTime())) {
    return {
      isOverdue: false,
      isDueSoon: false,
      daysDiff: 999,
      label: 'INVALID DATE',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
    };
  }
  delDate.setHours(0, 0, 0, 0);

  const diffTime = delDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      isOverdue: true,
      isDueSoon: false,
      daysDiff: diffDays,
      label: `🔴 OVERDUE (${overdueDays}d)`,
      badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40 font-black animate-pulse'
    };
  }

  if (diffDays === 0) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysDiff: 0,
      label: '🟡 DUE TODAY',
      badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50 font-black'
    };
  }

  if (diffDays === 1) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysDiff: 1,
      label: '🟡 DUE TOMORROW',
      badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50 font-black'
    };
  }

  if (diffDays === 2) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysDiff: 2,
      label: '🟡 DUE IN 2 DAYS',
      badgeClass: 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/40 font-bold'
    };
  }

  return {
    isOverdue: false,
    isDueSoon: false,
    daysDiff: diffDays,
    label: `📅 in ${diffDays} days`,
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 font-medium'
  };
}

export default function PurchaseOrders() {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'ALERTS' | 'COMPLETED'>('RUNNING');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPoForDispatch, setSelectedPoForDispatch] = useState<PurchaseOrder | null>(null);
  const [selectedPoForJobCard, setSelectedPoForJobCard] = useState<PurchaseOrder | null>(null);
  const [selectedPoForRM, setSelectedPoForRM] = useState<PurchaseOrder | null>(null);
  const [allocatingJobCard, setAllocatingJobCard] = useState<any>(null);
  const [printingJobCard, setPrintingJobCard] = useState<any>(null);
  const [deletingPoId, setDeletingPoId] = useState<string | null>(null);
  const [closingPoId, setClosingPoId] = useState<string | null>(null);

  // Queries
  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: () => getPurchaseOrders(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers() as unknown as Promise<any[]>,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as unknown as Promise<any[]>,
  });

  const { data: reels = [] } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>,
  });

  const { data: allJobCards = [] } = useQuery({
    queryKey: ['jobcards'],
    queryFn: () => getAllJobCards(),
  });

  const activeCustomers = useMemo(() => {
    return customers.filter((c: any) => 
      c.catalogVersion === '2026_NEW' || 
      (!c.isLegacy && c.createdAt && new Date(c.createdAt).getTime() >= new Date('2026-11-26T00:00:00').getTime())
    );
  }, [customers]);

  // Derived metrics & enriched list with RM Status computation
  const enrichedOrders = useMemo(() => {
    return purchaseOrders.map(po => {
      const balance = getPurchaseOrderBalance(po);
      const isCompleted = po.status === 'CLOSED' || (balance <= 0 && (po.outQty || 0) > 0);
      const alert = getDeliveryAlert(po.deliveryDate, isCompleted);
      const progressPercent = po.orderQty > 0 ? Math.min(100, Math.round(((po.outQty || 0) / po.orderQty) * 100)) : 0;
      const totalValue = (po.rate || 0) * (po.orderQty || 0);

      // Match product
      const product = products.find((p: any) => p.id === po.productId);

      // Compute live RM paper availability + 3 alternate resolution options
      const rmStatus = computePORMStatus(po, product, reels);

      // Match Job Card if already generated
      const matchingJobCard = allJobCards.find((jc: any) => 
        jc.status !== 'DELETED' && (
          (jc.poId && jc.poId === po.id) ||
          (jc.poNo && po.poNo && jc.poNo.trim().toLowerCase() === po.poNo.trim().toLowerCase())
        )
      );

      return {
        ...po,
        balance,
        isCompleted,
        alert,
        progressPercent,
        totalValue,
        rmStatus,
        product,
        jobCard: matchingJobCard
      };
    });
  }, [purchaseOrders, products, reels, allJobCards]);

  // KPIs
  const kpis = useMemo(() => {
    const total = enrichedOrders.length;
    let running = 0;
    let overdue = 0;
    let dueSoon = 0;
    let completed = 0;
    let paperShortage = 0;

    for (const po of enrichedOrders) {
      if (po.isCompleted) {
        completed++;
      } else {
        running++;
        if (po.alert.isOverdue) overdue++;
        else if (po.alert.isDueSoon) dueSoon++;
        if (!po.rmStatus.isGreen) paperShortage++;
      }
    }

    return { total, running, overdue, dueSoon, completed, paperShortage };
  }, [enrichedOrders]);

  // Filtered List
  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter(po => {
      // 1. Customer Filter
      if (customerFilter !== 'ALL') {
        const matchesCustomer = po.customerId === customerFilter || 
          (po.customerName || '').toLowerCase() === customerFilter.toLowerCase();
        if (!matchesCustomer) return false;
      }

      // 2. Status Filter
      if (statusFilter === 'RUNNING' && po.isCompleted) return false;
      if (statusFilter === 'COMPLETED' && !po.isCompleted) return false;
      if (statusFilter === 'ALERTS' && (po.isCompleted || (!po.alert.isOverdue && !po.alert.isDueSoon))) return false;

      // 3. Search Filter
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const poNoMatch = (po.poNo || '').toLowerCase().includes(q);
        const custMatch = (po.customerName || '').toLowerCase().includes(q);
        const prodMatch = (po.productName || '').toLowerCase().includes(q);
        const artMatch = (po.artworkNo || '').toLowerCase().includes(q);
        const consigneeMatch = (po.consignee || '').toLowerCase().includes(q);
        if (!poNoMatch && !custMatch && !prodMatch && !artMatch && !consigneeMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort logic: Overdue first -> Due soon -> Running -> Completed
      if (a.isCompleted && !b.isCompleted) return 1;
      if (!a.isCompleted && b.isCompleted) return -1;
      if (a.alert.isOverdue && !b.alert.isOverdue) return -1;
      if (!a.alert.isOverdue && b.alert.isOverdue) return 1;
      if (a.alert.isDueSoon && !b.alert.isDueSoon) return -1;
      if (!a.alert.isDueSoon && b.alert.isDueSoon) return 1;
      return (a.alert.daysDiff || 0) - (b.alert.daysDiff || 0);
    });
  }, [enrichedOrders, customerFilter, statusFilter, searchTerm]);

  // Actions
  const handleClosePo = async (po: any) => {
    if (!po.id) return;
    if (!window.confirm(`Are you sure you want to NIL / Close PO #${po.poNo}?`)) return;

    setClosingPoId(po.id);
    try {
      await updatePurchaseOrder(po.id, {
        status: 'CLOSED'
      }, user?.name || 'System');
      await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    } catch (err: any) {
      alert('Failed to close PO: ' + err.message);
    } finally {
      setClosingPoId(null);
    }
  };

  const handleDeletePo = async (po: any) => {
    if (!po.id) return;
    if (!window.confirm(`Are you sure you want to permanently delete PO #${po.poNo}?`)) return;

    setDeletingPoId(po.id);
    try {
      await deletePurchaseOrder(po.id, user?.name || 'System');
      await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    } catch (err: any) {
      alert('Failed to delete PO: ' + err.message);
    } finally {
      setDeletingPoId(null);
    }
  };

  const handleExportExcel = () => {
    const exportRows = filteredOrders.map((po, idx) => ({
      'S.No': idx + 1,
      'PO Number': po.poNo,
      'PO Date': po.poDate || '',
      'Delivery Deadline': po.deliveryDate || '',
      'Delivery Status': po.alert.label,
      'Paper RM Status': po.rmStatus.label,
      'Customer': po.customerName,
      'Product Name': po.productName,
      'Artwork No': po.artworkNo || '',
      'Box Size': po.size || '',
      'Rate (₹)': po.rate || 0,
      'Order Qty': po.orderQty || 0,
      'Dispatched Qty': po.outQty || 0,
      'Balance Qty': po.balance || 0,
      'Total Value (₹)': Math.round(po.totalValue || 0),
      'Status': po.isCompleted ? 'COMPLETED' : 'RUNNING'
    }));

    exportToExcel(exportRows, `Purchase_Orders_${new Date().toISOString().split('T')[0]}`);
  };

  // PDF Download Helper for Job Card
  const handleDownloadPDF = async () => {
    const input = document.getElementById('job-card-print-area') || document.getElementById('printable-job-card');
    if (!input || !printingJobCard) return;
    try {
      const canvas = await html2canvas(input, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`JobCard-${printingJobCard.jobCardNo || 'Document'}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      window.print();
    }
  };

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 space-y-5 overflow-hidden">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            Purchase Orders
            <span className="text-xs px-2.5 py-0.5 font-bold rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Active Master Data
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strict RM Paper Verification, 1-Click Job Card, and Auto-Synced Dispatch
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 text-sm font-bold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Purchase Order</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* Total POs */}
        <div 
          onClick={() => setStatusFilter('ALL')}
          className={cn(
            "p-3.5 rounded-xl border cursor-pointer transition-all shadow-2xs",
            statusFilter === 'ALL' ? "bg-primary/10 border-primary shadow-sm" : "bg-card border-border hover:border-primary/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total POs</span>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-black text-foreground mt-1.5">{kpis.total}</div>
          <span className="text-[11px] text-muted-foreground">All active PO records</span>
        </div>

        {/* Running Orders */}
        <div 
          onClick={() => setStatusFilter('RUNNING')}
          className={cn(
            "p-3.5 rounded-xl border cursor-pointer transition-all shadow-2xs",
            statusFilter === 'RUNNING' ? "bg-blue-500/10 border-blue-500 shadow-sm" : "bg-card border-border hover:border-blue-400"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Running Orders</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1.5">{kpis.running}</div>
          <span className="text-[11px] text-muted-foreground">Pending production / dispatch</span>
        </div>

        {/* Delivery Alerts */}
        <div 
          onClick={() => setStatusFilter('ALERTS')}
          className={cn(
            "p-3.5 rounded-xl border cursor-pointer transition-all shadow-2xs",
            statusFilter === 'ALERTS' ? "bg-red-500/15 border-red-500 shadow-sm" : "bg-card border-border hover:border-red-400",
            (kpis.overdue > 0 || kpis.dueSoon > 0) && "ring-1 ring-red-500/30"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Delivery Alerts</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl font-black text-red-600">{kpis.overdue} Overdue</span>
            {kpis.dueSoon > 0 && (
              <span className="text-xs font-bold text-amber-600">+{kpis.dueSoon} Due Soon</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">Red (Overdue) & Yellow (&le;2d)</span>
        </div>

        {/* Completed */}
        <div 
          onClick={() => setStatusFilter('COMPLETED')}
          className={cn(
            "p-3.5 rounded-xl border cursor-pointer transition-all shadow-2xs",
            statusFilter === 'COMPLETED' ? "bg-emerald-500/10 border-emerald-500 shadow-sm" : "bg-card border-border hover:border-emerald-400"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1.5">{kpis.completed}</div>
          <span className="text-[11px] text-muted-foreground">Fully fulfilled or closed</span>
        </div>
      </div>

      {/* ── Filters & Search Bar ── */}
      <div className="p-3 bg-card border border-border rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between shrink-0 shadow-2xs">
        <div className="flex flex-1 w-full md:w-auto items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by PO No, Customer, Product, Artwork..."
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-background border border-input rounded-lg text-foreground focus:ring-1 focus:ring-primary shadow-2xs"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground text-xs">
                ✕
              </button>
            )}
          </div>

          {/* Customer filter */}
          <select
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-background border border-input rounded-lg text-foreground focus:ring-1 focus:ring-primary max-w-[200px] font-medium"
          >
            <option value="ALL">All Customers</option>
            {activeCustomers.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 self-end md:self-auto overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap",
              statusFilter === 'ALL' ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            All ({kpis.total})
          </button>
          <button
            onClick={() => setStatusFilter('RUNNING')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap",
              statusFilter === 'RUNNING' ? "bg-blue-600 text-white" : "bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20"
            )}
          >
            Running ({kpis.running})
          </button>
          <button
            onClick={() => setStatusFilter('ALERTS')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap",
              statusFilter === 'ALERTS' ? "bg-red-600 text-white" : "bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20"
            )}
          >
            Alerts ({kpis.overdue + kpis.dueSoon})
          </button>
          <button
            onClick={() => setStatusFilter('COMPLETED')}
            className={cn(
              "px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap",
              statusFilter === 'COMPLETED' ? "bg-emerald-600 text-white" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
            )}
          >
            Completed ({kpis.completed})
          </button>
        </div>
      </div>

      {/* ── Main Data Table ── */}
      <div className="flex-1 bg-card border border-border rounded-xl shadow-2xs overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/60 text-muted-foreground uppercase font-bold text-[10px] tracking-wider sticky top-0 z-10 border-b border-border backdrop-blur-sm">
              <tr>
                <th className="px-3.5 py-2.5 text-center w-10">#</th>
                <th className="px-3.5 py-2.5">Alert & Status</th>
                <th className="px-3.5 py-2.5">PO No & Date</th>
                <th className="px-3.5 py-2.5">Customer Name</th>
                <th className="px-3.5 py-2.5">Item & Artwork</th>
                <th className="px-3.5 py-2.5 text-center">Paper RM Status</th>
                <th className="px-3.5 py-2.5 text-right">Order Qty & Value</th>
                <th className="px-3.5 py-2.5 text-center">Dispatch Progress</th>
                <th className="px-3.5 py-2.5 text-right">Balance Qty</th>
                <th className="px-3.5 py-2.5">Delivery Deadline</th>
                <th className="px-3.5 py-2.5 text-center min-w-[210px]">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground text-sm">
                    Loading Purchase Orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto text-muted mb-2 opacity-50" />
                    <p className="font-semibold text-sm">No Purchase Orders found.</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Click "+ New Purchase Order" to enter a PO.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((po, index) => {
                  return (
                    <tr 
                      key={po.id || index}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        po.alert.isOverdue && !po.isCompleted && "bg-red-500/[0.03]",
                        po.alert.isDueSoon && !po.isCompleted && "bg-amber-500/[0.03]"
                      )}
                    >
                      {/* # */}
                      <td className="px-3.5 py-2 text-center text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </td>

                      {/* Alert & Status */}
                      <td className="px-3.5 py-2">
                        <span className={cn(
                          "px-2.5 py-0.5 text-[11px] rounded-full border inline-flex items-center gap-1",
                          po.alert.badgeClass
                        )}>
                          {po.alert.label}
                        </span>
                      </td>

                      {/* PO No & Date */}
                      <td className="px-3.5 py-2">
                        <span className="font-bold text-foreground text-sm block">{po.poNo}</span>
                        <span className="text-[11px] text-muted-foreground block">{po.poDate || '-'}</span>
                      </td>

                      {/* Customer */}
                      <td className="px-3.5 py-2">
                        <span className="font-bold text-foreground block">{po.customerName}</span>
                        {po.consignee && (
                          <span className="text-[10px] text-muted-foreground block">Consignee: {po.consignee}</span>
                        )}
                      </td>

                      {/* Item & Artwork */}
                      <td className="px-3.5 py-2 max-w-[240px]">
                        <span className="font-semibold text-foreground block truncate" title={po.productName}>
                          {po.productName}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {po.artworkNo && <span className="font-mono bg-muted/60 px-1 rounded">Art: {po.artworkNo}</span>}
                          {po.size && <span>{po.size}</span>}
                        </div>
                      </td>

                      {/* Paper RM Status Column — Clickable to Inspect / Resolve */}
                      <td className="px-3.5 py-2 text-center">
                        <button
                          onClick={() => setSelectedPoForRM(po)}
                          className={cn(
                            "px-2.5 py-1 text-xs rounded-lg border transition-all inline-flex items-center gap-1.5 shadow-2xs hover:scale-105",
                            po.rmStatus.badgeClass
                          )}
                          title="Click to view live paper stock, choose alternate deckle, or record RM purchase order"
                        >
                          <Layers className="w-3.5 h-3.5 shrink-0" />
                          <span>{po.rmStatus.label}</span>
                        </button>
                      </td>

                      {/* Order Qty & Value */}
                      <td className="px-3.5 py-2 text-right">
                        <span className="font-black text-foreground block">
                          {(po.orderQty || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          ₹{(po.rate || 0).toFixed(2)} • ₹{Math.round(po.totalValue).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Dispatch Progress */}
                      <td className="px-3.5 py-2 text-center">
                        <div className="w-28 mx-auto space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-emerald-600">{(po.outQty || 0).toLocaleString('en-IN')}</span>
                            <span className="text-muted-foreground">{po.progressPercent}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all",
                                po.progressPercent === 100 ? "bg-emerald-500" : "bg-primary"
                              )}
                              style={{ width: `${po.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Balance Qty */}
                      <td className="px-3.5 py-2 text-right">
                        <span className={cn(
                          "font-black text-sm",
                          po.balance > 0 ? "text-amber-600" : "text-emerald-600"
                        )}>
                          {(po.balance || 0).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Delivery Deadline */}
                      <td className="px-3.5 py-2">
                        <span className="font-semibold text-foreground block text-xs">
                          {po.deliveryDate || '-'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {/* STRICT RULE: If Job Card already created -> Direct View, Print & PDF */}
                          {po.jobCard ? (
                            <button
                              onClick={() => setPrintingJobCard(po.jobCard)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all inline-flex items-center gap-1.5 hover:scale-105"
                              title={`Job Card #${po.jobCard.jobCardNo} is already generated. Click to View, Print & Download PDF.`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>JC #{po.jobCard.jobCardNo}</span>
                            </button>
                          ) : po.rmStatus.isGreen ? (
                            <button
                              onClick={() => setSelectedPoForJobCard(po)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs transition-all inline-flex items-center gap-1 hover:scale-105"
                              title="Generate Job Card against this PO (Paper Status: OK)"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>+ Job Card</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedPoForRM(po)}
                              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30 transition-all inline-flex items-center gap-1"
                              title="Job Card LOCKED: Paper is short. Click to select alternate deckle or record RM order to unlock!"
                            >
                              <Lock className="w-3 h-3 text-red-600" />
                              <span>Locked (Paper Short)</span>
                            </button>
                          )}

                          {/* 1-Click Quick Dispatch */}
                          <button
                            onClick={() => setSelectedPoForDispatch(po)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all inline-flex items-center gap-1"
                            title="Quick Dispatch (Auto-syncs to Finished Goods)"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Dispatch</span>
                          </button>

                          {/* Close (NIL) */}
                          {!po.isCompleted && (
                            <button
                              onClick={() => handleClosePo(po)}
                              disabled={closingPoId === po.id}
                              className="p-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 rounded transition-colors"
                              title="Mark PO as Closed / NIL"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete */}
                          {hasRole('ADMIN') && (
                            <button
                              onClick={() => handleDeletePo(po)}
                              disabled={deletingPoId === po.id}
                              className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete PO"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div>
            Showing <b className="text-foreground">{filteredOrders.length}</b> of <b className="text-foreground">{enrichedOrders.length}</b> orders
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Paper Ready (Job Card Unlocked)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> Paper Short (Job Card Locked)
            </span>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Add New PO Modal */}
      {isAddModalOpen && (
        <AddPOModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            setIsAddModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
          }}
        />
      )}

      {/* Quick Dispatch Modal */}
      {selectedPoForDispatch && (
        <QuickDispatchModal
          po={selectedPoForDispatch}
          onClose={() => setSelectedPoForDispatch(null)}
          onSuccess={() => {
            setSelectedPoForDispatch(null);
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
          }}
        />
      )}

      {/* Paper RM Status & Resolution Modal (Option A, B, C) */}
      {selectedPoForRM && (
        <RMStatusModal
          po={selectedPoForRM}
          onClose={() => setSelectedPoForRM(null)}
          onSuccess={() => {
            setSelectedPoForRM(null);
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
          }}
        />
      )}

      {/* 1-Click Job Card Modal */}
      {selectedPoForJobCard && (
        <JobCardModal
          initialPo={selectedPoForJobCard}
          onClose={() => setSelectedPoForJobCard(null)}
          onSuccess={(createdJobCard?: any) => {
            setSelectedPoForJobCard(null);
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
            queryClient.invalidateQueries({ queryKey: ['jobcards'] });

            // Step 4: After creating Job Card, prompt for paper allocation and then print/PDF
            if (createdJobCard) {
              setAllocatingJobCard(createdJobCard);
            }
          }}
        />
      )}

      {/* Step 4: Direct Paper Reel Allocation Wizard */}
      {allocatingJobCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-auto animate-fade-in">
          <ReelAllocationWizard 
            jobCard={allocatingJobCard}
            isAdmin={hasRole('ADMIN')}
            onBack={() => {
              setPrintingJobCard(allocatingJobCard);
              setAllocatingJobCard(null);
            }}
            onConfirm={async (layers, isPendingApproval, approvalReason) => {
              try {
                const payload: any = {
                  productSnapshot: {
                    ...allocatingJobCard.productSnapshot,
                    layers
                  },
                  reelAllocationSkipped: false
                };

                if (isPendingApproval) {
                  payload.status = 'PENDING APPROVAL';
                  payload.approvalStatus = 'PENDING';
                  payload.approvalReason = approvalReason;
                  payload.approvalRequestedBy = user?.name;
                  payload.approvalRequestedAt = new Date().toISOString();
                }

                await executeJobCardTransaction(allocatingJobCard.id, payload, allocatingJobCard, user?.name);
                const updatedJC = { ...allocatingJobCard, ...payload };
                setAllocatingJobCard(null);
                setPrintingJobCard(updatedJC);
                queryClient.invalidateQueries({ queryKey: ['jobcards'] });
                queryClient.invalidateQueries({ queryKey: ['reels'] });
              } catch (err: any) {
                alert('Failed to save allocation: ' + err.message);
              }
            }}
            onSkip={async () => {
              try {
                await updateJobCard(allocatingJobCard.id, {
                  reelAllocationSkipped: true
                }, user?.name || 'System');
                const updatedJC = { ...allocatingJobCard, reelAllocationSkipped: true };
                setAllocatingJobCard(null);
                setPrintingJobCard(updatedJC);
                queryClient.invalidateQueries({ queryKey: ['jobcards'] });
              } catch (err: any) {
                alert('Failed to skip allocation: ' + err.message);
              }
            }}
          />
        </div>
      )}

      {/* Step 4: Printable / PDF Job Card Overlay */}
      {printingJobCard && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex flex-col p-4 sm:p-6 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-primary" />
                Job Card #{printingJobCard.jobCardNo || ''} Preview
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Customer: {printingJobCard.customerName} • Product: {printingJobCard.productName} ({printingJobCard.orderQty} Boxes)
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button 
                onClick={handleDownloadPDF} 
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button 
                onClick={() => window.print()} 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
              >
                <Printer className="w-4 h-4" />
                Print Job Card
              </button>
              <button 
                onClick={() => setPrintingJobCard(null)} 
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all"
              >
                Close Preview
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto flex justify-center pb-16 no-print-bg print:p-0 print:m-0 print:overflow-visible print:block print:h-auto">
            <div className="bg-white text-black shadow-2xl rounded-lg overflow-hidden max-w-[210mm] w-full min-h-[297mm] p-6 print:shadow-none print:m-0 print:p-0">
              <PrintableJobCard jobCard={printingJobCard} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

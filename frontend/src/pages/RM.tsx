import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, Search, ArrowDownToLine, ArrowUpFromLine, History, 
  Plus, AlertCircle, Loader2, Printer, X, FileSpreadsheet, Scale, Receipt,
  Sparkles, TrendingUp, DollarSign, Layers, Calendar
} from 'lucide-react';
import ExportButtons from '../components/ExportButtons';
import { getRawMaterials, createRawMaterial, getRawMaterialTransactions } from '../lib/supabase/rmService';
import type { RawMaterial } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';
import RMInModal from './rm/RMInModal';
import RMOutModal from './rm/RMOutModal';
import RMHistoryModal from './rm/RMHistoryModal';
import RMBulkImportModal from './rm/RMBulkImportModal';
import RMAdjustModal from './rm/RMAdjustModal';
import RMBulkPurchaseInModal from './rm/RMBulkPurchaseInModal';
import RMPurchaseRegisterModal from './rm/RMPurchaseRegisterModal';
import RMAuditModal from './rm/RMAuditModal';
import RMPurchaseDetailsModal, { isRMDateInMonth, isRMAuditTransaction } from './rm/RMPurchaseDetailsModal';

export default function RM() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isInOpen, setIsInOpen] = useState(false);
  const [isOutOpen, setIsOutOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBulkPurchaseInOpen, setIsBulkPurchaseInOpen] = useState(false);
  const [isPurchaseRegisterOpen, setIsPurchaseRegisterOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isPurchaseDetailsOpen, setIsPurchaseDetailsOpen] = useState(false);
  
  const [selectedRM, setSelectedRM] = useState<RawMaterial | null>(null);
  const [purchaseFilterRM, setPurchaseFilterRM] = useState<RawMaterial | null>(null);

  // New RM Form State
  const [newName, setNewName] = useState('');
  const [newOpening, setNewOpening] = useState<number | ''>('');
  const [newRate, setNewRate] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rmList = [], isLoading, refetch } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => getRawMaterials()
  });

  const { data: rmTransactions = [], refetch: refetchTx } = useQuery({
    queryKey: ['rawMaterialTransactions'],
    queryFn: () => getRawMaterialTransactions()
  });

  const handleRefetchAll = () => {
    refetch();
    refetchTx();
  };

  // Month-wise & Audit-excluded stats for every raw material
  const rmCalculatedStats = useMemo(() => {
    const map = new Map<string, {
      openingQty: number;
      purInQty: number;
      purInValue: number;
      outQty: number;
      auditAdjQty: number;
      closingBalance: number;
    }>();

    // Compute month bounds if a specific month is selected
    let monthEnd = '9999-12-31';
    if (selectedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
      const [yStr, mStr] = selectedMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const nextMonth = m === 12 ? 1 : m + 1;
      const nextYear = m === 12 ? y + 1 : y;
      monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    }

    // Group transactions by rawMaterialId
    const txByRm = new Map<string, typeof rmTransactions>();
    rmTransactions.forEach(tx => {
      const list = txByRm.get(tx.rawMaterialId) || [];
      list.push(tx);
      txByRm.set(tx.rawMaterialId, list);
    });

    rmList.forEach(rm => {
      const txList = txByRm.get(rm.id!) || [];

      if (!selectedMonth) {
        // ALL TIME view
        let purInQty = 0;
        let purInValue = 0;
        let outQty = 0;

        txList.forEach(tx => {
          const qty = Number(tx.quantity) || 0;
          if (isRMAuditTransaction(tx)) return; // Strictly exclude audit from purchase & out
          if (tx.type === 'IN') {
            purInQty += qty;
            const rate = Number(tx.rate) || Number(rm.rate) || 0;
            const amt = (tx.amount !== undefined && tx.amount > 0) ? Number(tx.amount) : (qty * rate);
            purInValue += amt;
          } else if (tx.type === 'OUT') {
            outQty += qty;
          }
        });

        const hasTxs = txList.length > 0;
        const effectivePurIn = hasTxs ? purInQty : rm.inQty;
        const effectiveOut = hasTxs ? outQty : rm.outQty;
        const auditAdj = hasTxs
          ? rm.closingBalance - (rm.openingQty + effectivePurIn - effectiveOut)
          : 0;

        map.set(rm.id!, {
          openingQty: rm.openingQty,
          purInQty: effectivePurIn,
          purInValue: hasTxs ? purInValue : (rm.inQty * (rm.rate || 0)),
          outQty: effectiveOut,
          auditAdjQty: auditAdj,
          closingBalance: rm.closingBalance
        });
      } else {
        // SPECIFIC MONTH view
        let purInQty = 0;
        let purInValue = 0;
        let outQty = 0;
        let auditAdjQty = 0;
        let netAfterMonth = 0;

        txList.forEach(tx => {
          const qty = Number(tx.quantity) || 0;
          const rawDate = tx.date ? String(tx.date).split('T')[0] : '';
          const isAudit = isRMAuditTransaction(tx);

          // Determine sign (+ for IN/surplus, - for OUT/deficit)
          let signedQty = 0;
          if (isAudit) {
            const ref = (tx.referenceNo || '').toLowerCase();
            const isDeficit = tx.type === 'OUT' || ref.includes('deficit') || ref.includes('damage') || ref.includes('shortage');
            signedQty = isDeficit ? -qty : qty;
          } else {
            signedQty = tx.type === 'OUT' ? -qty : qty;
          }

          if (isRMDateInMonth(tx.date || tx.createdAt, selectedMonth)) {
            if (isAudit) {
              auditAdjQty += signedQty;
            } else if (tx.type === 'IN') {
              purInQty += qty;
              const rate = Number(tx.rate) || Number(rm.rate) || 0;
              const amt = (tx.amount !== undefined && tx.amount > 0) ? Number(tx.amount) : (qty * rate);
              purInValue += amt;
            } else if (tx.type === 'OUT') {
              outQty += qty;
            }
          } else if (rawDate >= monthEnd) {
            netAfterMonth += signedQty;
          }
        });

        const closingAtEnd = rm.closingBalance - netAfterMonth;
        const openingAtStart = closingAtEnd - (purInQty - outQty + auditAdjQty);

        map.set(rm.id!, {
          openingQty: openingAtStart,
          purInQty,
          purInValue,
          outQty,
          auditAdjQty,
          closingBalance: closingAtEnd
        });
      }
    });

    return map;
  }, [rmList, rmTransactions, selectedMonth]);

  const filteredRM = useMemo(() => {
    return rmList.filter(item => 
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [rmList, search]);

  const totalValue = useMemo(() => {
    return filteredRM.reduce((acc, curr) => {
      const s = rmCalculatedStats.get(curr.id!);
      const bal = s ? s.closingBalance : curr.closingBalance;
      return acc + (bal * curr.rate);
    }, 0);
  }, [filteredRM, rmCalculatedStats]);

  const totalPurchaseValue = useMemo(() => {
    return filteredRM.reduce((acc, curr) => {
      const s = rmCalculatedStats.get(curr.id!);
      return acc + (s ? s.purInValue : 0);
    }, 0);
  }, [filteredRM, rmCalculatedStats]);

  const totalBalanceQty = useMemo(() => {
    return filteredRM.reduce((acc, curr) => {
      const s = rmCalculatedStats.get(curr.id!);
      return acc + (s ? s.closingBalance : curr.closingBalance);
    }, 0);
  }, [filteredRM, rmCalculatedStats]);

  const handleCreateRM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await createRawMaterial({
        name: newName,
        openingQty: Number(newOpening) || 0,
        rate: Number(newRate) || 0,
      }, user?.name || 'System');
      
      setIsAddOpen(false);
      setNewName('');
      setNewOpening('');
      setNewRate('');
      refetch();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAction = (type: 'IN' | 'OUT' | 'ADJUST' | 'HISTORY', rm: RawMaterial) => {
    setSelectedRM(rm);
    if (type === 'IN') setIsInOpen(true);
    if (type === 'OUT') setIsOutOpen(true);
    if (type === 'ADJUST') setIsAdjustOpen(true);
    if (type === 'HISTORY') setIsHistoryOpen(true);
  };

  const handleOpenGeneralIn = () => {
    setSelectedRM(null);
    setIsInOpen(true);
  };

  const handleOpenGeneralAdjust = () => {
    setSelectedRM(null);
    setIsAdjustOpen(true);
  };

  const exportMap: Record<string, string> = {
    'name': 'Material Name',
    'openingQty': 'Opening Qty',
    'purInQty': 'Purchase IN',
    'purInValue': 'Purchase Value (₹)',
    'outQty': 'Total OUT',
    'auditAdjQty': 'Audit Adj (±)',
    'closingBalance': 'Balance Stock',
    'rate': 'Rate (₹)',
    'totalValue': 'Stock Value (₹)'
  };

  return (
    <div className="flex flex-col h-full bg-secondary/30">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-background border-b border-border print:hidden shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-2xl">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              Raw Material
              <span className="text-xs px-2.5 py-0.5 bg-secondary text-muted-foreground font-semibold rounded-full border border-border">
                {rmList.length} Items
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consumables inventory, purchasing, monthly ledgers & stock audit
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Total Purchase Value Badge (Clickable!) */}
          <button
            onClick={() => {
              setPurchaseFilterRM(null);
              setIsPurchaseDetailsOpen(true);
            }}
            className="px-3.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 rounded-xl border border-green-500/30 flex items-center gap-2 transition-colors cursor-pointer"
            title="Click to view Supplier-wise & Invoice-wise Purchase Details"
          >
            <Receipt className="w-4 h-4 text-green-600" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-green-700/80 block leading-tight">
                Total Purchase {selectedMonth ? `(${selectedMonth})` : '(All)'}
              </span>
              <span className="text-sm font-extrabold text-green-700 underline decoration-dotted">
                ₹ {totalPurchaseValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </button>

          {/* Quick Stock Value Badge */}
          <div className="px-3.5 py-1.5 bg-primary/5 rounded-xl border border-primary/20 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-tight">Stock Valuation</span>
              <span className="text-sm font-extrabold text-primary">₹ {totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <ExportButtons 
            data={filteredRM.map(rm => {
              const s = rmCalculatedStats.get(rm.id!) || { openingQty: rm.openingQty, purInQty: rm.inQty, purInValue: 0, outQty: rm.outQty, auditAdjQty: 0, closingBalance: rm.closingBalance };
              return {
                ...rm,
                openingQty: s.openingQty,
                purInQty: s.purInQty,
                purInValue: s.purInValue,
                outQty: s.outQty,
                auditAdjQty: s.auditAdjQty,
                closingBalance: s.closingBalance,
                totalValue: s.closingBalance * rm.rate
              };
            })} 
            filenamePrefix="Raw_Material_Inventory" 
            title="Raw Material Inventory Report" 
            columnMap={exportMap} 
          />
          
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-foreground rounded-xl hover:bg-secondary/80 transition-colors text-xs font-semibold shadow-2xs border border-border"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>

          <button 
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-xl transition-all text-xs font-semibold shadow-2xs border border-border"
          >
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            Bulk Setup
          </button>

          {/* Purchase Register Button */}
          <button 
            onClick={() => setIsPurchaseRegisterOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 rounded-xl transition-all text-xs font-semibold shadow-2xs"
          >
            <History className="w-4 h-4" />
            Purchase Register
          </button>

          {/* Stock Audit Button */}
          <button 
            onClick={() => setIsAuditOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl transition-all text-xs font-semibold shadow-2xs"
          >
            <Scale className="w-4 h-4" />
            RM Audit
          </button>

          {/* Purchase IN Button */}
          <div className="flex rounded-xl shadow-sm border border-border overflow-hidden">
            <button 
              onClick={handleOpenGeneralIn}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white transition-all text-xs font-semibold border-r border-green-700"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Purchase IN
            </button>
            <button 
              onClick={() => setIsBulkPurchaseInOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white transition-all text-xs font-semibold"
              title="Bulk Purchase IN (Multiple Items)"
            >
              <Layers className="w-4 h-4" />
              Bulk IN
            </button>
          </div>

          {/* Add Material Button */}
          <button 
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Material
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-background rounded-2xl shadow-sm border border-border flex flex-col h-full overflow-hidden">
          
          {/* Search Bar & Month Filter */}
          <div className="p-4 border-b border-border bg-card flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative max-w-md w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search raw materials by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                />
              </div>

              {/* Month Filter */}
              <div className="flex items-center gap-2 bg-secondary/40 border border-border px-3 py-1.5 rounded-xl">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Month:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-none"
                />
                {selectedMonth && (
                  <button
                    onClick={() => setSelectedMonth('')}
                    className="text-xs text-primary hover:underline font-semibold ml-1"
                    title="Show all-time totals"
                  >
                    All Time
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Click any <b>Purchase IN</b> qty/value to view <b>Supplier &amp; Invoice Details</b></span>
            </div>
          </div>

          {/* Materials Table */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading raw materials...</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/70 text-muted-foreground sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Material Name</th>
                    <th className="px-3 py-3 text-right font-semibold">Opening Qty</th>
                    <th className="px-3 py-3 text-right font-semibold text-green-600">Purchase IN</th>
                    <th className="px-3 py-3 text-right font-semibold text-green-700">Purchase Value</th>
                    <th className="px-3 py-3 text-right font-semibold text-red-600">Total OUT</th>
                    <th className="px-3 py-3 text-right font-semibold text-amber-600">Audit Adj (±)</th>
                    <th className="px-3 py-3 text-right font-semibold text-foreground">Balance Stock</th>
                    <th className="px-3 py-3 text-right font-semibold">Rate</th>
                    <th className="px-3 py-3 text-right font-semibold text-primary">Stock Value</th>
                    <th className="px-4 py-3 text-center font-semibold">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredRM.map((rm) => {
                    const stats = rmCalculatedStats.get(rm.id!) || {
                      openingQty: rm.openingQty,
                      purInQty: rm.inQty,
                      purInValue: 0,
                      outQty: rm.outQty,
                      auditAdjQty: 0,
                      closingBalance: rm.closingBalance
                    };

                    return (
                    <tr 
                      key={rm.id} 
                      onClick={() => openAction('HISTORY', rm)}
                      className="hover:bg-primary/5 cursor-pointer transition-colors group"
                      title="Click to view full monthly ledger"
                    >
                      <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                        <span className="group-hover:text-primary transition-colors">{rm.name}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground font-mono">{stats.openingQty}</td>
                      <td 
                        className="px-3 py-3 text-right font-mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPurchaseFilterRM(rm);
                          setIsPurchaseDetailsOpen(true);
                        }}
                        title={`Click to view supplier-wise purchase details for ${rm.name}`}
                      >
                        <span className="cursor-pointer text-green-600 font-extrabold hover:underline hover:text-green-700 bg-green-500/10 hover:bg-green-500/20 px-2 py-0.5 rounded transition-colors inline-block">
                          +{stats.purInQty}
                        </span>
                      </td>
                      <td 
                        className="px-3 py-3 text-right font-mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPurchaseFilterRM(rm);
                          setIsPurchaseDetailsOpen(true);
                        }}
                        title={`Click to view supplier-wise purchase details for ${rm.name}`}
                      >
                        <span className="cursor-pointer text-green-700 font-bold hover:underline">
                          ₹ {stats.purInValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-red-600 font-bold font-mono">
                        {stats.outQty > 0 ? `-${stats.outQty}` : '0'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {stats.auditAdjQty > 0 ? (
                          <span className="text-amber-600 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">+{stats.auditAdjQty}</span>
                        ) : stats.auditAdjQty < 0 ? (
                          <span className="text-amber-700 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">{stats.auditAdjQty}</span>
                        ) : (
                          <span className="text-muted-foreground/50">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-foreground font-mono bg-secondary/15">
                        {stats.closingBalance}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground font-mono">₹ {rm.rate}</td>
                      <td className="px-3 py-3 text-right font-bold text-primary font-mono">
                        ₹ {(stats.closingBalance * rm.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openAction('IN', rm)}
                            className="p-1.5 text-green-600 hover:bg-green-500/15 rounded-lg transition-colors"
                            title="Add Inward / Purchase (IN)"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAction('OUT', rm)}
                            className="p-1.5 text-red-600 hover:bg-red-500/15 rounded-lg transition-colors"
                            title="Issue / Consumption (OUT)"
                          >
                            <ArrowUpFromLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAction('ADJUST', rm)}
                            className="p-1.5 text-amber-600 hover:bg-amber-500/15 rounded-lg transition-colors"
                            title="Stock Audit & Adjustment"
                          >
                            <Scale className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAction('HISTORY', rm)}
                            className="p-1.5 text-blue-600 hover:bg-blue-500/15 rounded-lg transition-colors"
                            title="View Monthly Running Ledger"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {filteredRM.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto opacity-20 mb-2" />
                        <p className="font-semibold text-base">No raw materials found</p>
                        <p className="text-xs mt-1">Use "+ Purchase / IN" or "Bulk Import" to add materials.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add Single Material Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-background w-full max-w-md rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
              <h2 className="text-xl font-bold text-foreground">Add New Raw Material</h2>
              <button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <form onSubmit={handleCreateRM} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Material Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Gum, Stitching Wire, Printing Ink"
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Opening Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newOpening}
                    onChange={(e) => setNewOpening(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Rate (₹ per unit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 border border-border rounded-xl hover:bg-muted text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <RMBulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={refetch}
      />

      {/* Stock Audit & Adjustment Modal */}
      <RMAdjustModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        onSuccess={handleRefetchAll}
        selectedRM={selectedRM}
        allRMs={rmList}
      />

      {/* Inward / Purchase Modal */}
      <RMInModal 
        isOpen={isInOpen} 
        onClose={() => setIsInOpen(false)} 
        onSuccess={handleRefetchAll} 
        selectedRM={selectedRM}
        allRMs={rmList}
      />

      {/* Outward / Consumption Modal */}
      <RMOutModal 
        isOpen={isOutOpen} 
        onClose={() => setIsOutOpen(false)} 
        onSuccess={handleRefetchAll} 
        selectedRM={selectedRM} 
      />

      {/* Monthly Running Ledger Modal */}
      <RMHistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        selectedRM={selectedRM}
        onOpenIn={(rm) => openAction('IN', rm)}
        onOpenOut={(rm) => openAction('OUT', rm)}
        onOpenAdjust={(rm) => openAction('ADJUST', rm)}
      />

      {/* Bulk Purchase IN Modal */}
      <RMBulkPurchaseInModal
        isOpen={isBulkPurchaseInOpen}
        onClose={() => setIsBulkPurchaseInOpen(false)}
        onSuccess={handleRefetchAll}
        allRMs={rmList}
      />

      {/* Purchase Register Modal */}
      <RMPurchaseRegisterModal
        isOpen={isPurchaseRegisterOpen}
        onClose={() => setIsPurchaseRegisterOpen(false)}
        allRMs={rmList}
        onUpdate={handleRefetchAll}
      />

      {/* RM Audit Modal */}
      <RMAuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        onSuccess={handleRefetchAll}
      />

      {/* Supplier-Wise -> Date & Invoice-Wise Purchase Details Modal */}
      <RMPurchaseDetailsModal
        isOpen={isPurchaseDetailsOpen}
        onClose={() => {
          setIsPurchaseDetailsOpen(false);
          setPurchaseFilterRM(null);
        }}
        allRMs={rmList}
        transactions={rmTransactions}
        selectedMonth={selectedMonth}
        initialMaterial={purchaseFilterRM}
      />
    </div>
  );
}

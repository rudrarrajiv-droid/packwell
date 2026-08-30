import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, Search, ArrowDownToLine, ArrowUpFromLine, History, 
  Plus, AlertCircle, Loader2, Printer, X, FileSpreadsheet, Scale, Receipt,
  Sparkles, TrendingUp, DollarSign, Layers
} from 'lucide-react';
import ExportButtons from '../components/ExportButtons';
import { getRawMaterials, createRawMaterial } from '../lib/supabase/rmService';
import type { RawMaterial } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';
import RMInModal from './rm/RMInModal';
import RMOutModal from './rm/RMOutModal';
import RMHistoryModal from './rm/RMHistoryModal';
import RMBulkImportModal from './rm/RMBulkImportModal';
import RMAdjustModal from './rm/RMAdjustModal';

export default function RM() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isInOpen, setIsInOpen] = useState(false);
  const [isOutOpen, setIsOutOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const [selectedRM, setSelectedRM] = useState<RawMaterial | null>(null);

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

  const filteredRM = useMemo(() => {
    return rmList.filter(item => 
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [rmList, search]);

  const totalValue = useMemo(() => {
    return filteredRM.reduce((acc, curr) => acc + (curr.closingBalance * curr.rate), 0);
  }, [filteredRM]);

  const totalBalanceQty = useMemo(() => {
    return filteredRM.reduce((acc, curr) => acc + curr.closingBalance, 0);
  }, [filteredRM]);

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
    'inQty': 'Total IN',
    'outQty': 'Total OUT',
    'closingBalance': 'Balance Stock',
    'rate': 'Rate (₹)',
    'totalValue': 'Total Value (₹)'
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
              Raw Materials
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
          {/* Quick Value Badge */}
          <div className="px-3.5 py-1.5 bg-primary/5 rounded-xl border border-primary/20 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-tight">Total Valuation</span>
              <span className="text-sm font-extrabold text-primary">₹ {totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <ExportButtons 
            data={filteredRM.map(rm => ({...rm, totalValue: rm.closingBalance * rm.rate}))} 
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

          {/* Bulk Import Button */}
          <button 
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-xl transition-all text-xs font-semibold shadow-2xs border border-border"
          >
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            Bulk Import
          </button>

          {/* Stock Audit Button */}
          <button 
            onClick={handleOpenGeneralAdjust}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl transition-all text-xs font-semibold shadow-2xs"
          >
            <Scale className="w-4 h-4" />
            Stock Audit
          </button>

          {/* Purchase IN Button */}
          <button 
            onClick={handleOpenGeneralIn}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all text-xs font-semibold shadow-sm"
          >
            <ArrowDownToLine className="w-4 h-4" />
            + Purchase / IN
          </button>

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
          
          {/* Search Bar & Table Filters */}
          <div className="p-4 border-b border-border bg-card flex flex-wrap items-center justify-between gap-4">
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

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>Click on any material row to view its <b>Monthly Running Balance Ledger</b></span>
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
                    <th className="px-4 py-3 text-right font-semibold">Opening Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-600">Total IN</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-600">Total OUT</th>
                    <th className="px-4 py-3 text-right font-semibold text-foreground">Balance Stock</th>
                    <th className="px-4 py-3 text-right font-semibold">Rate</th>
                    <th className="px-4 py-3 text-right font-semibold text-primary">Total Value</th>
                    <th className="px-4 py-3 text-center font-semibold">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredRM.map((rm) => (
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
                      <td className="px-4 py-3 text-right text-muted-foreground font-mono">{rm.openingQty}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-bold font-mono">+{rm.inQty}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-bold font-mono">-{rm.outQty}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-foreground font-mono bg-secondary/15">
                        {rm.closingBalance}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground font-mono">₹ {rm.rate}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary font-mono">
                        ₹ {(rm.closingBalance * rm.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
                  ))}
                  {filteredRM.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
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
        onSuccess={refetch}
        selectedRM={selectedRM}
        allRMs={rmList}
      />

      {/* Inward / Purchase Modal */}
      <RMInModal 
        isOpen={isInOpen} 
        onClose={() => setIsInOpen(false)} 
        onSuccess={refetch} 
        selectedRM={selectedRM}
        allRMs={rmList}
      />

      {/* Outward / Consumption Modal */}
      <RMOutModal 
        isOpen={isOutOpen} 
        onClose={() => setIsOutOpen(false)} 
        onSuccess={refetch} 
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
    </div>
  );
}

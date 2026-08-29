import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, ArrowDownToLine, ArrowUpFromLine, History, Plus, AlertCircle, Loader2, Printer, X } from 'lucide-react';
import ExportButtons from '../components/ExportButtons';
import { getRawMaterials, createRawMaterial } from '../lib/supabase/rmService';
import type { RawMaterial } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';
import RMInModal from './rm/RMInModal';
import RMOutModal from './rm/RMOutModal';
import RMHistoryModal from './rm/RMHistoryModal';

export default function RM() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isInOpen, setIsInOpen] = useState(false);
  const [isOutOpen, setIsOutOpen] = useState(false);
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

  const openAction = (type: 'IN' | 'OUT' | 'HISTORY', rm: RawMaterial) => {
    setSelectedRM(rm);
    if (type === 'IN') setIsInOpen(true);
    if (type === 'OUT') setIsOutOpen(true);
    if (type === 'HISTORY') setIsHistoryOpen(true);
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
      <div className="flex items-center justify-between p-6 bg-background border-b border-border print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Raw Materials</h1>
            <p className="text-sm text-muted-foreground mt-1">Consumables and inventory ledger</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-secondary/50 rounded-lg border border-border">
            <span className="text-sm text-muted-foreground">Total Value:</span>
            <span className="ml-2 font-bold text-primary">₹ {totalValue.toLocaleString('en-IN')}</span>
          </div>
          <ExportButtons 
            data={filteredRM.map(rm => ({...rm, totalValue: rm.closingBalance * rm.rate}))} 
            filenamePrefix="Raw_Material_Inventory" 
            title="Raw Material Inventory Report" 
            columnMap={exportMap} 
          />
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Material
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-background rounded-xl shadow-sm border border-border flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search raw materials..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary/50 border-none rounded-lg focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Material Name</th>
                    <th className="px-4 py-3 text-right font-medium">Opening Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Total IN</th>
                    <th className="px-4 py-3 text-right font-medium">Total OUT</th>
                    <th className="px-4 py-3 text-right font-medium text-foreground">Balance Stock</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-right font-medium text-primary">Total Value</th>
                    <th className="px-4 py-3 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRM.map((rm) => (
                    <tr key={rm.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{rm.name}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{rm.openingQty}</td>
                      <td className="px-4 py-3 text-right text-green-600">{rm.inQty}</td>
                      <td className="px-4 py-3 text-right text-red-600">{rm.outQty}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{rm.closingBalance}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">₹ {rm.rate}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary">₹ {(rm.closingBalance * rm.rate).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openAction('IN', rm)}
                            className="p-1.5 text-green-600 hover:bg-green-500/10 rounded-lg transition-colors tooltip-trigger"
                            title="Add IN"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAction('OUT', rm)}
                            className="p-1.5 text-red-600 hover:bg-red-500/10 rounded-lg transition-colors tooltip-trigger"
                            title="Add OUT"
                          >
                            <ArrowUpFromLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAction('HISTORY', rm)}
                            className="p-1.5 text-blue-600 hover:bg-blue-500/10 rounded-lg transition-colors tooltip-trigger"
                            title="View History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRM.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        No raw materials found. Add your first material to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add New Material Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-xl font-semibold">Add New Raw Material</h2>
              <button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <form onSubmit={handleCreateRM} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Material Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Gum, Stitching Wire, Ink"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Opening Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newOpening}
                    onChange={(e) => setNewOpening(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modals */}
      <RMInModal 
        isOpen={isInOpen} 
        onClose={() => setIsInOpen(false)} 
        onSuccess={refetch} 
        selectedRM={selectedRM} 
      />
      <RMOutModal 
        isOpen={isOutOpen} 
        onClose={() => setIsOutOpen(false)} 
        onSuccess={refetch} 
        selectedRM={selectedRM} 
      />
      <RMHistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        selectedRM={selectedRM} 
      />
    </div>
  );
}

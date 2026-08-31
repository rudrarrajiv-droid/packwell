import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Search, Plus, Loader2, AlertCircle, Archive, X, Printer, Edit2 } from 'lucide-react';
import { getScrapEntries, createScrapEntry, updateScrapEntry, deleteScrapEntry } from '../lib/supabase/scrapService';
import type { ScrapEntry } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';
import ExportButtons from '../components/ExportButtons';
import { format } from 'date-fns';

export default function Scrap() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // New Scrap Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'BILLING'>('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Scrap Form State
  const [editingEntry, setEditingEntry] = useState<ScrapEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWeight, setEditWeight] = useState<number | ''>('');
  const [editRate, setEditRate] = useState<number | ''>('');
  const [editPaymentType, setEditPaymentType] = useState<'CASH' | 'BILLING'>('CASH');
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: scrapList = [], isLoading, refetch } = useQuery({
    queryKey: ['scrapEntries'],
    queryFn: () => getScrapEntries()
  });

  const filteredScrap = useMemo(() => {
    return scrapList.filter(item => 
      (item.description || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [scrapList, search]);

  const { totalCash, totalBilling } = useMemo(() => {
    return filteredScrap.reduce((acc, curr) => {
      if (curr.paymentType === 'CASH') acc.totalCash += curr.totalValue;
      if (curr.paymentType === 'BILLING') acc.totalBilling += curr.totalValue;
      return acc;
    }, { totalCash: 0, totalBilling: 0 });
  }, [filteredScrap]);

  const totalValueCalc = useMemo(() => {
    const w = Number(weight) || 0;
    const r = Number(rate) || 0;
    return w * r;
  }, [weight, rate]);

  const editTotalValueCalc = useMemo(() => {
    const w = Number(editWeight) || 0;
    const r = Number(editRate) || 0;
    return w * r;
  }, [editWeight, editRate]);

  const handleCreateScrap = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!weight || Number(weight) <= 0 || !rate || Number(rate) <= 0) {
      setError("Please enter valid weight and rate.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createScrapEntry({
        date,
        description,
        weight: Number(weight),
        rate: Number(rate),
        totalValue: totalValueCalc,
        paymentType,
      }, user?.name || 'System');
      
      setIsAddOpen(false);
      setDescription('');
      setWeight('');
      setRate('');
      refetch();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create scrap entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (entry: ScrapEntry) => {
    setEditingEntry(entry);
    setEditDate(entry.date);
    setEditDescription(entry.description || '');
    setEditWeight(entry.weight);
    setEditRate(entry.rate);
    setEditPaymentType(entry.paymentType);
    setEditError(null);
  };

  const handleUpdateScrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editingEntry.id) return;

    if (!editWeight || Number(editWeight) <= 0 || !editRate || Number(editRate) <= 0) {
      setEditError("Please enter valid weight and rate.");
      return;
    }

    setIsUpdating(true);
    setEditError(null);
    try {
      await updateScrapEntry(editingEntry.id, {
        date: editDate,
        description: editDescription,
        weight: Number(editWeight),
        rate: Number(editRate),
        totalValue: editTotalValueCalc,
        paymentType: editPaymentType,
      }, user?.name || 'System');

      setEditingEntry(null);
      refetch();
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'Failed to update scrap entry');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this scrap entry?")) return;
    
    try {
      await deleteScrapEntry(id, user?.name || 'System');
      refetch();
    } catch (error) {
      console.error(error);
      alert('Failed to delete entry');
    }
  };

  const exportMap = {
    'date': 'Date',
    'description': 'Description',
    'weight': 'Weight (kg)',
    'rate': 'Rate (₹)',
    'totalValue': 'Total Value (₹)',
    'paymentType': 'Payment Type'
  };

  return (
    <div className="flex flex-col h-full bg-secondary/30">
      <div className="flex items-center justify-between p-6 bg-background border-b border-border print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Scrap Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Track scrap sales and generated revenue</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 px-4 py-2 bg-secondary/50 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Cash Revenue:</span>
              <span className="font-bold text-green-600">₹ {totalCash.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Billing Revenue:</span>
              <span className="font-bold text-blue-600">₹ {totalBilling.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <ExportButtons 
            data={filteredScrap} 
            filenamePrefix="Scrap_Entries" 
            title="Scrap Sales Report" 
            columnMap={exportMap} 
          />
          
          <button 
            onClick={() => window.print()}
            className="flex items-center justify-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md shadow-sm hover:bg-secondary transition-colors"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </button>

          <button 
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Scrap
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
                placeholder="Search by description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary/50 border-none rounded-lg focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Weight (kg)</th>
                    <th className="px-4 py-3 text-right font-medium">Rate (₹)</th>
                    <th className="px-4 py-3 text-right font-medium text-foreground">Total Value</th>
                    <th className="px-4 py-3 text-center font-medium">Payment Type</th>
                    <th className="px-4 py-3 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredScrap.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {format(new Date(entry.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.description || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{entry.weight}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{entry.rate}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        ₹ {entry.totalValue.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          entry.paymentType === 'CASH' 
                            ? 'bg-green-500/10 text-green-600' 
                            : 'bg-blue-500/10 text-blue-600'
                        }`}>
                          {entry.paymentType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(entry)}
                            className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors tooltip-trigger"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => entry.id && handleDelete(entry.id)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors tooltip-trigger"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredScrap.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No scrap entries found. Click 'Add Scrap' to log your first entry.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add New Scrap Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-xl font-semibold">Add Scrap Entry</h2>
              <button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <form onSubmit={handleCreateScrap} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Paper Waste, Cardboard"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={weight}
                      onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate (₹)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={rate}
                      onChange={(e) => setRate(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="p-3 bg-secondary/50 rounded-lg flex justify-between items-center border border-border">
                  <span className="text-sm font-medium text-muted-foreground">Total Value:</span>
                  <span className="font-bold text-lg text-foreground">₹ {totalValueCalc.toLocaleString('en-IN')}</span>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Payment Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="CASH"
                        checked={paymentType === 'CASH'}
                        onChange={() => setPaymentType('CASH')}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      <span>Cash</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="BILLING"
                        checked={paymentType === 'BILLING'}
                        onChange={() => setPaymentType('BILLING')}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      <span>Billing</span>
                    </label>
                  </div>
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
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Scrap Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-xl font-semibold">Edit Scrap Entry</h2>
              <button onClick={() => setEditingEntry(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateScrap} className="p-6">
              {editError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">{editError}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="e.g. Paper Waste, Cardboard"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate (₹)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="p-3 bg-secondary/50 rounded-lg flex justify-between items-center border border-border">
                  <span className="text-sm font-medium text-muted-foreground">Total Value:</span>
                  <span className="font-bold text-lg text-foreground">₹ {editTotalValueCalc.toLocaleString('en-IN')}</span>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Payment Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="CASH"
                        checked={editPaymentType === 'CASH'}
                        onChange={() => setEditPaymentType('CASH')}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      <span>Cash</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="BILLING"
                        checked={editPaymentType === 'BILLING'}
                        onChange={() => setEditPaymentType('BILLING')}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      <span>Billing</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Update Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Wallet, Search, Edit3, Trash2, Calendar, CheckCircle2, 
  AlertCircle, Loader2, X, Save, ArrowUpRight, ArrowDownRight, Filter
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  getCashLedgerEntries, 
  updateCashLedgerEntry, 
  deleteCashLedgerEntry,
  getExpenseCategories 
} from '../lib/supabase/cashLedgerService';
import type { CashLedgerEntry } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';

// Helper to format Indian Currency numbers cleanly
const formatINR = (val: number, decimals: number = 0) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
};

export default function CashLedgerAdminSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [selectedExpenseFilter, setSelectedExpenseFilter] = useState<'ALL' | string>('ALL');

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState<CashLedgerEntry | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Queries
  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['cashLedgerAdminEntries', startDate, endDate, paymentModeFilter],
    queryFn: () => getCashLedgerEntries({
      startDate,
      endDate,
      paymentMode: paymentModeFilter,
    }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['expenseCategories'],
    queryFn: getExpenseCategories,
  });

  // Filter entries locally based on selected expense head and search query
  const filteredEntries = useMemo(() => {
    let result = entries;

    if (selectedExpenseFilter !== 'ALL') {
      const q = selectedExpenseFilter.trim().toLowerCase();
      result = result.filter(e => e.expenseHead.trim().toLowerCase() === q);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(e => 
        e.expenseHead.toLowerCase().includes(q) ||
        (e.narration && e.narration.toLowerCase().includes(q)) ||
        (e.voucherNo && e.voucherNo.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, selectedExpenseFilter, searchQuery]);

  // Handle Edit Submit
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editingEntry.id) return;

    if (!editingEntry.expenseHead.trim()) {
      alert('खर्चे का नाम अनिवार्य है।');
      return;
    }

    setIsUpdating(true);
    setActionMessage(null);
    try {
      await updateCashLedgerEntry(editingEntry.id, {
        date: editingEntry.date,
        voucherNo: editingEntry.voucherNo,
        expenseHead: editingEntry.expenseHead,
        narration: editingEntry.narration,
        paymentMode: editingEntry.paymentMode,
        dr: Number(editingEntry.dr) || 0,
        cr: Number(editingEntry.cr) || 0,
      }, user?.name || 'Admin');

      setActionMessage({ text: 'प्रविष्टि सफलतापूर्वक अपडेट कर दी गई!', type: 'success' });
      setEditingEntry(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['cashLedgerEntries'] });
      queryClient.invalidateQueries({ queryKey: ['cashLedgerMonthlyAggregates'] });
      queryClient.invalidateQueries({ queryKey: ['mrReport'] });
    } catch (err: any) {
      setActionMessage({ text: 'अपडेट करने में विफल: ' + (err.message || ''), type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Delete
  const handleDelete = async (entry: CashLedgerEntry) => {
    if (!entry.id) return;
    const confirmed = window.confirm(
      `क्या आप वाकई इस प्रविष्टि को हटाना चाहते हैं?\nतारीख: ${entry.date}\nखर्चा: ${entry.expenseHead}\nराशि: Dr ₹${entry.dr} / Cr ₹${entry.cr}`
    );
    if (!confirmed) return;

    setDeletingId(entry.id);
    setActionMessage(null);
    try {
      await deleteCashLedgerEntry(entry.id, user?.name || 'Admin');
      setActionMessage({ text: 'प्रविष्टि सफलतापूर्वक हटा दी गई।', type: 'success' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['cashLedgerEntries'] });
      queryClient.invalidateQueries({ queryKey: ['cashLedgerMonthlyAggregates'] });
      queryClient.invalidateQueries({ queryKey: ['mrReport'] });
    } catch (err: any) {
      setActionMessage({ text: 'हटाने में विफल: ' + (err.message || ''), type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
      
      {/* SECTION HEADER */}
      <div className="p-5 border-b border-border bg-secondary/30 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center text-foreground">
            <Wallet className="w-5 h-5 mr-2 text-rose-500" />
            Cash Ledger Management (रोकड़ बही संशोधन व विलोपन)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            केवल Admin के लिए: पुरानी कैश लेजर प्रविष्टियों को खोजें, एडिट करें, अपडेट करें या डिलीट करें।
          </p>
        </div>

        {actionMessage && (
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
              : 'bg-rose-100 text-rose-800 border border-rose-300'
          }`}>
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {actionMessage.text}
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        
        {/* FILTER CONTROLS */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/20 p-3 rounded-xl border border-border">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs font-medium bg-background border border-input rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs font-medium bg-background border border-input rounded-lg"
              />
            </div>

            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value as any)}
              className="px-2.5 py-1 bg-background border border-input rounded-lg text-xs font-bold"
            >
              <option value="ALL">All Modes</option>
              <option value="CASH">CASH</option>
              <option value="BANK">BANK</option>
            </select>

            <div className="flex items-center gap-1.5 bg-background px-2.5 py-1 rounded-lg border border-input">
              <Filter className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <select
                value={selectedExpenseFilter}
                onChange={(e) => setSelectedExpenseFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none max-w-[200px] truncate cursor-pointer"
                title="Filter by Expense Head"
              >
                <option value="ALL">All Expense Heads (सभी खर्चे)</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search voucher, expense head..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-background border border-input rounded-lg text-xs font-medium w-64 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* ENTRIES TABLE */}
        <div className="border border-border rounded-xl overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/60 text-muted-foreground font-bold text-[11px] uppercase tracking-wider border-b border-border">
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3 py-2.5 w-24">Date</th>
                  <th className="px-3 py-2.5 w-24">Voucher No</th>
                  <th className="px-4 py-2.5">Expense Head</th>
                  <th className="px-4 py-2.5">Narration</th>
                  <th className="px-3 py-2.5 w-16 text-center">Mode</th>
                  <th className="px-3 py-2.5 w-24 text-right text-rose-600">Dr (₹)</th>
                  <th className="px-3 py-2.5 w-24 text-right text-emerald-600">Cr (₹)</th>
                  <th className="px-3 py-2.5 w-24 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-primary" />
                      लोड हो रहा है...
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      कोई प्रविष्टि नहीं मिली।
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <tr key={entry.id} className="hover:bg-secondary/20 transition">
                      <td className="px-3 py-2 text-center text-muted-foreground font-bold">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold whitespace-nowrap">{entry.date}</td>
                      <td className="px-3 py-2 text-muted-foreground">{entry.voucherNo || '-'}</td>
                      <td className="px-4 py-2 font-bold text-foreground">{entry.expenseHead}</td>
                      <td className="px-4 py-2 text-muted-foreground">{entry.narration || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          entry.paymentMode === 'CASH' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                        }`}>
                          {entry.paymentMode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-black text-rose-600">
                        {entry.dr > 0 ? `₹ ${formatINR(entry.dr)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">
                        {entry.cr > 0 ? `₹ ${formatINR(entry.cr)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setEditingEntry(entry)}
                            className="p-1 hover:bg-primary/10 text-primary rounded transition"
                            title="Edit Entry"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            disabled={deletingId === entry.id}
                            onClick={() => handleDelete(entry)}
                            className="p-1 hover:bg-rose-100 text-rose-600 rounded transition disabled:opacity-50"
                            title="Delete Entry"
                          >
                            {deletingId === entry.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* EDIT MODAL */}
      {editingEntry && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-primary text-primary-foreground flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Edit Cash Ledger Entry
              </h3>
              <button
                onClick={() => setEditingEntry(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editingEntry.date}
                    onChange={(e) => setEditingEntry({ ...editingEntry, date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Voucher No.</label>
                  <input
                    type="text"
                    value={editingEntry.voucherNo || ''}
                    onChange={(e) => setEditingEntry({ ...editingEntry, voucherNo: e.target.value })}
                    placeholder="VCH-01"
                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs font-semibold uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Expense Head / Category</label>
                <input
                  type="text"
                  required
                  value={editingEntry.expenseHead}
                  onChange={(e) => setEditingEntry({ ...editingEntry, expenseHead: e.target.value })}
                  placeholder="e.g. Electricity Bill"
                  className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Narration (विवरण)</label>
                <input
                  type="text"
                  value={editingEntry.narration || ''}
                  onChange={(e) => setEditingEntry({ ...editingEntry, narration: e.target.value })}
                  placeholder="Details of the payment"
                  className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Payment Mode</label>
                  <select
                    value={editingEntry.paymentMode}
                    onChange={(e) => setEditingEntry({ ...editingEntry, paymentMode: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs font-bold"
                  >
                    <option value="CASH">CASH</option>
                    <option value="BANK">BANK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-rose-600 mb-1">Dr (Expense) ₹</label>
                  <input
                    type="number"
                    min="0"
                    value={editingEntry.dr}
                    onChange={(e) => setEditingEntry({ 
                      ...editingEntry, 
                      dr: Number(e.target.value),
                      cr: Number(e.target.value) > 0 ? 0 : editingEntry.cr 
                    })}
                    className="w-full px-3 py-1.5 bg-rose-50/50 border border-rose-300 rounded-lg text-xs font-bold text-rose-700 text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-600 mb-1">Cr (Receipt) ₹</label>
                  <input
                    type="number"
                    min="0"
                    value={editingEntry.cr}
                    onChange={(e) => setEditingEntry({ 
                      ...editingEntry, 
                      cr: Number(e.target.value),
                      dr: Number(e.target.value) > 0 ? 0 : editingEntry.dr 
                    })}
                    className="w-full px-3 py-1.5 bg-emerald-50/50 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-700 text-right"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow-md hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Changes (अपडेट करें)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  );
}

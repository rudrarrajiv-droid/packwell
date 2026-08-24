import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, History, FilterX, ArrowDownToLine, ArrowUpFromLine, Receipt, Trash2, CalendarDays, Check, XCircle } from 'lucide-react';
import { getReelTransactionsByReelId, deleteReelTransaction, updateReelTransactionDate } from '../../lib/supabase/reelService';
import { useAuth } from '../../contexts/AuthContext';

interface ReelHistoryModalProps {
  reels: any[];
  onClose: () => void;
}

export default function ReelHistoryModal({ reels, onClose }: ReelHistoryModalProps) {
  const { user, hasRole } = useAuth();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingDateTx, setEditingDateTx] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');

  // Filtering States
  const [search, setSearch] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterBF, setFilterBF] = useState('');
  const [filterGSM, setFilterGSM] = useState('');
  const [filterWeight, setFilterWeight] = useState('');
  const [filterPaperType, setFilterPaperType] = useState('');
  
  // Selection State
  const [selectedReel, setSelectedReel] = useState<any | null>(null);

  // Derived filtered reels
  const filteredReels = useMemo(() => {
    return reels.filter(r => {
      // General Search (Reel No or Paper Type)
      const searchTerm = search.toLowerCase();
      const searchMatch = 
        (r.reelNumber?.toLowerCase() || '').includes(searchTerm) ||
        (r.paperType?.toLowerCase() || '').includes(searchTerm);
      
      // Smart Filters
      const matchSize = filterSize ? String(r.reelSize) === filterSize : true;
      const matchBF = filterBF ? String(r.bf) === filterBF : true;
      const matchGSM = filterGSM ? String(r.gsm) === filterGSM : true;
      const matchWeight = filterWeight ? String(r.weight) === filterWeight : true;
      const matchPaperType = filterPaperType ? (r.paperType || '').toLowerCase() === filterPaperType.toLowerCase() : true;

      // Only show reels that have a positive balance
      const hasBalance = Number(r.currentBalance) > 0;

      return hasBalance && searchMatch && matchSize && matchBF && matchGSM && matchWeight && matchPaperType;
    }).sort((a, b) => Number(a.currentBalance) - Number(b.currentBalance));
  }, [reels, search, filterSize, filterBF, filterGSM, filterWeight, filterPaperType]);

  // Total weight stats for filtered reels
  const filteredStats = useMemo(() => {
    let totalWeight = 0, shortCount = 0, shortWeight = 0, fullCount = 0, fullWeight = 0;
    filteredReels.forEach(r => {
      const bal = Number(r.currentBalance) || 0;
      const origWt = Number(r.weight) || 0;
      totalWeight += bal;
      if (origWt > 0 && bal < origWt) {
        shortCount++;
        shortWeight += bal;
      } else {
        fullCount++;
        fullWeight += bal;
      }
    });
    return {
      totalWeight: Math.round(totalWeight),
      shortCount,
      shortWeight: Math.round(shortWeight),
      fullCount,
      fullWeight: Math.round(fullWeight),
    };
  }, [filteredReels]);

  // Unique values for filter dropdowns
  const uniqueSizes = Array.from(new Set(reels.map(p => p.reelSize))).filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  const uniqueBFs = Array.from(new Set(reels.map(p => p.bf))).filter(Boolean);
  const uniqueGSMs = Array.from(new Set(reels.map(p => p.gsm))).filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  const uniqueWeights = Array.from(new Set(reels.map(p => p.weight))).filter(Boolean).sort((a,b)=>Number(b)-Number(a));
  const uniquePaperTypes = Array.from(new Set(reels.map(p => p.paperType))).filter(Boolean);

  // Fetch transactions ONLY when a reel is selected
  const { data: transactions = [], isLoading: loadingTx, refetch } = useQuery({
    queryKey: ['reelTransactions', selectedReel?.id],
    queryFn: () => getReelTransactionsByReelId(selectedReel.id) as Promise<any[]>,
    enabled: !!selectedReel
  });

  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleDelete = async (tx: any) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This will reverse the reel balance mathematically.')) return;
    try {
      setIsDeleting(tx.id);
      await deleteReelTransaction(tx.id, tx.reelId, tx.type, Number(tx.quantity), user?.name || 'System');
      refetch();
      // It might be nice to refresh reels too, but they are passed in as props.
      // We can just trust the transaction goes away.
    } catch (error) {
      alert('Failed to delete transaction. See console.');
      console.error(error);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleUpdateDate = async (tx: any) => {
    if (!newDateValue) return;
    try {
      await updateReelTransactionDate(tx.id, newDateValue, user?.name || 'System');
      setEditingDateTx(null);
      refetch();
    } catch (error) {
      alert('Failed to update date. See console.');
      console.error(error);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-7xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] min-h-[600px]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <History className="w-5 h-5 mr-2 text-primary" />
              Advanced Reel History
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Filter, search, and audit the complete lifecycle of any paper reel.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          
          {/* Left Column: Filter & List */}
          <div className="w-1/3 border-r border-border flex flex-col bg-secondary/10 min-w-[350px]">
            {/* Filters */}
            <div className="p-4 border-b border-border space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Reel No..." 
                    className={inputCls + " pl-9 py-1.5 h-full"}
                  />
                </div>
                <select className={inputCls + " py-1.5"} value={filterPaperType} onChange={e => setFilterPaperType(e.target.value)}>
                  <option value="">Paper Type</option>
                  {uniquePaperTypes.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls + " py-1.5"} value={filterSize} onChange={e => setFilterSize(e.target.value)}>
                  <option value="">Size</option>
                  {uniqueSizes.map(v => <option key={v} value={v}>{v}"</option>)}
                </select>
                <select className={inputCls + " py-1.5"} value={filterBF} onChange={e => setFilterBF(e.target.value)}>
                  <option value="">BF</option>
                  {uniqueBFs.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
                <select className={inputCls + " py-1.5"} value={filterGSM} onChange={e => setFilterGSM(e.target.value)}>
                  <option value="">GSM</option>
                  {uniqueGSMs.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
                <select className={inputCls + " py-1.5"} value={filterWeight} onChange={e => setFilterWeight(e.target.value)}>
                  <option value="">Weight</option>
                  {uniqueWeights.map(v => <option key={v as string} value={v as string}>{v} Kg</option>)}
                </select>
              </div>
              
              {(filterSize || filterBF || filterGSM || filterWeight || filterPaperType || search) && (
                <button onClick={() => { setFilterSize(''); setFilterBF(''); setFilterGSM(''); setFilterWeight(''); setFilterPaperType(''); setSearch(''); }}
                  className="w-full flex items-center justify-center text-xs text-destructive hover:bg-destructive/10 py-1.5 rounded transition-colors">
                  <FilterX className="w-3.5 h-3.5 mr-1" /> Clear All Filters
                </button>
              )}
              
              <div className="text-sm text-foreground pt-2 pb-1 border-t border-border font-bold flex justify-between items-center">
                <span>{filteredReels.length} Reels Found</span>
                <span className="text-primary">{filteredStats.totalWeight.toLocaleString()} Kg Total</span>
              </div>
              {/* Weight Summary */}
              <div className="bg-secondary/30 border border-border rounded-md p-2 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-orange-600 font-medium">⟳ Short Reels ({filteredStats.shortCount}):</span>
                  <span className="text-orange-700 font-bold">{filteredStats.shortWeight.toLocaleString()} Kg</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-blue-600 font-medium">● Full Reels ({filteredStats.fullCount}):</span>
                  <span className="text-blue-700 font-bold">{filteredStats.fullWeight.toLocaleString()} Kg</span>
                </div>
              </div>
            </div>

            {/* Reel List */}
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {filteredReels.map(r => {
                const isSelected = selectedReel?.id === r.id;
                return (
                  <button 
                    key={r.id} 
                    onClick={() => setSelectedReel(r)}
                    className={`w-full text-left p-3 rounded-md border transition-all ${
                      isSelected 
                        ? 'bg-primary/10 border-primary shadow-sm' 
                        : 'bg-background border-border hover:border-primary/50 hover:bg-secondary/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-foreground">{r.reelNumber}</span>
                      <span className={`text-xs font-bold ${r.currentBalance > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {r.currentBalance} Kg
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.paperType} | {r.reelSize}" | {r.bf} BF | {r.gsm} GSM
                    </div>
                  </button>
                );
              })}
              {filteredReels.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No reels found matching your filters.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Complete Ledger */}
          <div className="flex-1 flex flex-col bg-card relative overflow-hidden">
            {!selectedReel ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <History className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a reel to view history</p>
                <p className="text-sm mt-2 opacity-70">Use the smart filters on the left to find a specific reel.</p>
              </div>
            ) : (
              <div className="h-full overflow-auto p-6 bg-secondary/5">
                
                {/* Detailed Overview Card */}
                <div className="bg-card border border-border shadow-md rounded-xl p-6 mb-6">
                  <div className="flex justify-between items-start mb-6 border-b border-border pb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-3xl font-black text-primary tracking-tight">{selectedReel.reelNumber}</h3>
                        {selectedReel.currentBalance <= 0 && (
                          <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">
                            ZERO BALANCE
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground font-semibold mt-2">
                        {selectedReel.paperType} • {selectedReel.reelSize}" Size • {selectedReel.bf} BF • {selectedReel.gsm} GSM
                      </p>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="text-right bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                        <div className="text-[10px] uppercase text-blue-600 font-bold tracking-wider">Original Wt</div>
                        <div className="text-xl font-bold text-blue-700">{selectedReel.weight} Kg</div>
                      </div>
                      <div className="text-right bg-green-50 px-4 py-2 rounded-lg border border-green-100 shadow-inner">
                        <div className="text-[10px] uppercase text-green-600 font-bold tracking-wider">Current Balance</div>
                        <div className="text-xl font-bold text-green-700">{selectedReel.currentBalance} Kg</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs mb-1 font-medium">Rate</span>
                      <span className="font-bold text-foreground">₹{selectedReel.rate ? Number(selectedReel.rate).toFixed(2) : '0.00'} / Kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs mb-1 font-medium">Inward Date</span>
                      <span className="font-bold text-foreground">
                        {selectedReel.inwardDate ? new Date(selectedReel.inwardDate).toLocaleDateString('en-IN') : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs mb-1 font-medium">Supplier</span>
                      <span className="font-bold text-foreground truncate block" title={selectedReel.supplierName}>{selectedReel.supplierName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs mb-1 font-medium">Manufacturer</span>
                      <span className="font-bold text-foreground truncate block" title={selectedReel.manufacturerName}>{selectedReel.manufacturerName || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Ledger Timeline */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 pl-1 flex items-center">
                    <Receipt className="w-4 h-4 mr-2" />
                    Transaction Ledger
                  </h4>
                  
                  {loadingTx ? (
                    <div className="py-12 flex justify-center text-muted-foreground">
                      <div className="animate-pulse flex items-center">Loading ledger records...</div>
                    </div>
                  ) : sortedTransactions.length === 0 ? (
                    <div className="bg-card border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
                      No transaction records found for this reel.
                    </div>
                  ) : (
                    <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                      {sortedTransactions.map((tx) => (
                        <div key={tx.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${
                            tx.type === 'INWARD' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                          }`}>
                            {tx.type === 'INWARD' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                          </div>
                          
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card border border-border p-4 rounded-xl shadow-sm group-hover:border-primary/30 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className={`font-black uppercase tracking-tight text-sm ${tx.type === 'INWARD' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type}
                                </div>
                                {editingDateTx === tx.id ? (
                                  <div className="flex items-center gap-2 mt-1">
                                    <input 
                                      type="datetime-local" 
                                      value={newDateValue} 
                                      onChange={(e) => setNewDateValue(e.target.value)}
                                      className="text-xs p-1 border rounded bg-background"
                                    />
                                    <button onClick={() => handleUpdateDate(tx)} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                                    <button onClick={() => setEditingDateTx(null)} className="text-red-500 hover:text-red-700"><XCircle className="w-4 h-4" /></button>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                                    {new Date(tx.date).toLocaleString('en-IN', { 
                                      day: '2-digit', month: 'short', year: 'numeric', 
                                      hour: '2-digit', minute: '2-digit' 
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className={`font-bold text-lg leading-none ${tx.type === 'INWARD' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type === 'INWARD' ? '+' : '-'}{tx.quantity} Kg
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                              <div className="text-xs text-muted-foreground">
                                By <span className="font-semibold text-foreground">{tx.performedBy || 'System'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {hasRole('ADMIN') && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingDateTx(tx.id);
                                        const localDate = new Date(tx.date);
                                        const tzOffset = localDate.getTimezoneOffset() * 60000;
                                        const localISOTime = (new Date(localDate.getTime() - tzOffset)).toISOString().slice(0,16);
                                        setNewDateValue(localISOTime);
                                      }}
                                      className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                                      title="Edit Date"
                                    >
                                      <CalendarDays className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(tx)}
                                      disabled={isDeleting === tx.id}
                                      className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1 rounded hover:bg-red-50 transition-colors"
                                      title="Delete Transaction"
                                    >
                                      <Trash2 className={`w-3.5 h-3.5 ${isDeleting === tx.id ? 'animate-pulse' : ''}`} />
                                    </button>
                                  </>
                                )}
                                <div className="text-xs font-bold bg-secondary px-2 py-1 rounded text-foreground">
                                  Bal: {tx.remainingBalance} Kg
                                </div>
                              </div>
                            </div>
                            
                            {tx.jobCardId && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <span className="inline-flex items-center text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-md border border-blue-200">
                                  Job Card: {tx.jobCardId}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

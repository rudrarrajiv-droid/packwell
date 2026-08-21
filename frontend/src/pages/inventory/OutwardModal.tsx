import React, { useState, useMemo } from 'react';
import { ArrowUpFromLine, X, CircleDashed, Search, FilterX } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { executeOutwardTransaction } from '../../lib/supabase/reelService';
import type { OutwardPayload } from '../../lib/supabase/reelService';

interface OutwardModalProps {
  reels: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function OutwardModal({ reels, onClose, onSuccess }: OutwardModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Filtering States
  const [search, setSearch] = useState('');
  const [filterReelSize, setFilterReelSize] = useState('');
  const [filterPaperType, setFilterPaperType] = useState('');
  const [filterBF, setFilterBF] = useState('');
  const [filterGSM, setFilterGSM] = useState('');
  
  // Date State
  const [outwardDate, setOutwardDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Selection & Input State
  // selectedReels holds reelId -> { remainingWeight: number | '', selectedAt: number }
  const [selected, setSelected] = useState<Record<string, { remainingWeight: number | '', selectedAt: number }>>({});

  // Filter out empty balances
  const availableReels = useMemo(() => reels.filter(r => (Number(r.currentBalance) || 0) > 0), [reels]);

  // Derived filtered available reels
  const filteredReels = useMemo(() => {
    return availableReels.filter(r => {
      // General Search
      const searchMatch = (r.reelNumber?.toLowerCase() || '').includes(search.toLowerCase());
      
      // Smart Filters
      const matchReelSize = filterReelSize ? String(r.reelSize) === filterReelSize : true;
      const matchPaperType = filterPaperType ? r.paperType === filterPaperType : true;
      const matchBF = filterBF ? String(r.bf) === filterBF : true;
      const matchGSM = filterGSM ? String(r.gsm) === filterGSM : true;

      return searchMatch && matchReelSize && matchPaperType && matchBF && matchGSM;
    }).sort((a, b) => Number(a.currentBalance) - Number(b.currentBalance));
  }, [availableReels, search, filterReelSize, filterPaperType, filterBF, filterGSM]);

  // Unique values for filter dropdowns (based on available reels)
  const uniqueReelSizes = Array.from(new Set(availableReels.map(p => p.reelSize))).filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  const uniquePaperTypes = Array.from(new Set(availableReels.map(p => p.paperType))).filter(Boolean);
  const uniqueBFs = Array.from(new Set(availableReels.map(p => p.bf))).filter(Boolean);
  const uniqueGSMs = Array.from(new Set(availableReels.map(p => p.gsm))).filter(Boolean).sort((a,b)=>Number(a)-Number(b));

  const handleToggleSelect = (reelId: string) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[reelId]) {
        delete next[reelId]; // deselect
      } else {
        next[reelId] = { remainingWeight: '', selectedAt: Date.now() }; // select
      }
      return next;
    });
  };

  const handleRemainingChange = (reelId: string, val: string) => {
    setSelected(prev => ({
      ...prev,
      [reelId]: { 
        remainingWeight: val === '' ? '' : Number(val),
        selectedAt: prev[reelId]?.selectedAt || Date.now() 
      }
    }));
  };

  const selectedReelsList = availableReels
    .filter(r => selected[r.id])
    .sort((a, b) => selected[b.id].selectedAt - selected[a.id].selectedAt);

  const onSubmit = async () => {
    if (selectedReelsList.length === 0) return;

    // Validate
    const payloads: OutwardPayload[] = [];
    for (const reel of selectedReelsList) {
      const input = selected[reel.id].remainingWeight;
      if (input === '' || input < 0) {
        alert(`Please enter a valid remaining weight for reel ${reel.reelNumber}`);
        return;
      }
      if (input > reel.currentBalance) {
        alert(`Remaining weight for ${reel.reelNumber} cannot exceed its current balance (${reel.currentBalance} Kg)`);
        return;
      }

      const consumed = Math.round(reel.currentBalance - Math.round(input as number));
      if (consumed <= 0) {
        alert(`Reel ${reel.reelNumber} has no consumed amount (Remaining = Current Balance).`);
        return;
      }

      payloads.push({
        reelId: reel.id,
        reelNumber: reel.reelNumber,
        consumedWeight: consumed,
        outwardDate
      });
    }

    setIsSubmitting(true);
    try {
      await executeOutwardTransaction(payloads, user?.name);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to execute outward transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-6xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] min-h-[500px]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <ArrowUpFromLine className="w-5 h-5 mr-2 text-red-500" />
              Reel Outward (Issue to Production)
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Search and select reels to issue. Support for partial consumption.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          
          {/* Left Column: Filter & Select */}
          <div className="w-3/5 border-r border-border flex flex-col bg-secondary/10">
            {/* Filters */}
            <div className="p-4 border-b border-border space-y-3 shrink-0">
              <div className="flex gap-4">
                <div className="w-1/3 space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Outward Date</label>
                  <input 
                    type="date" 
                    value={outwardDate} 
                    onChange={e => setOutwardDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1 space-y-1 relative">
                  <label className="text-xs font-semibold text-muted-foreground opacity-0">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input 
                      type="text" 
                      value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search by Reel No..." 
                      className={inputCls + " pl-9"}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <select className={inputCls + " w-32 py-1.5"} value={filterReelSize} onChange={e => setFilterReelSize(e.target.value)}>
                  <option value="">Reel Size</option>
                  {uniqueReelSizes.map(v => <option key={v} value={v}>{v}"</option>)}
                </select>
                <select className={inputCls + " w-32 py-1.5"} value={filterPaperType} onChange={e => setFilterPaperType(e.target.value)}>
                  <option value="">Paper Type</option>
                  {uniquePaperTypes.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
                <select className={inputCls + " w-24 py-1.5"} value={filterBF} onChange={e => setFilterBF(e.target.value)}>
                  <option value="">BF</option>
                  {uniqueBFs.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
                <select className={inputCls + " w-24 py-1.5"} value={filterGSM} onChange={e => setFilterGSM(e.target.value)}>
                  <option value="">GSM</option>
                  {uniqueGSMs.map(v => <option key={v as string} value={v as string}>{v}</option>)}
                </select>
                {(filterReelSize || filterPaperType || filterBF || filterGSM) && (
                  <button onClick={() => { setFilterReelSize(''); setFilterPaperType(''); setFilterBF(''); setFilterGSM(''); }}
                    className="flex items-center text-xs text-destructive hover:bg-destructive/10 px-2 rounded">
                    <FilterX className="w-3.5 h-3.5 mr-1" /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Reel Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-medium w-12 text-center">Sel</th>
                    <th className="px-4 py-3 font-medium">Reel No</th>
                    <th className="px-4 py-3 font-medium">Specs</th>
                    <th className="px-4 py-3 font-medium text-right text-green-600">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredReels.map(r => {
                    const isSelected = !!selected[r.id];
                    return (
                      <tr key={r.id} className={`hover:bg-muted/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`} onClick={() => handleToggleSelect(r.id)}>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">{r.reelNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {r.paperType} | {r.reelSize}" | {r.bf} BF | {r.gsm} GSM
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{r.currentBalance} Kg</td>
                      </tr>
                    );
                  })}
                  {filteredReels.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">No reels found matching filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Selected & Consumption */}
          <div className="w-2/5 flex flex-col bg-card relative">
            <div className="p-4 border-b border-border bg-secondary/30 shrink-0">
              <h3 className="font-semibold text-foreground">Selected for Issue ({selectedReelsList.length})</h3>
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {selectedReelsList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
                  <ArrowUpFromLine className="w-8 h-8 mb-3 opacity-20" />
                  Select reels from the left list to issue them.
                </div>
              ) : (
                selectedReelsList.map(r => {
                  const remaining = selected[r.id].remainingWeight;
                  const consumed = remaining !== '' ? r.currentBalance - remaining : 0;

                  return (
                    <div key={r.id} className="bg-background border border-border rounded-lg p-4 shadow-sm relative group">
                      <button onClick={() => handleToggleSelect(r.id)} className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                      </button>
                      <div className="font-bold text-foreground mb-1">{r.reelNumber}</div>
                      <div className="text-xs text-muted-foreground mb-3">{r.paperType} | {r.reelSize}" | {r.bf} BF | {r.gsm} GSM</div>
                      
                      <div className="grid grid-cols-2 gap-4 items-end">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-primary">Physical Remaining (Kg)</label>
                          <input 
                            id={`outward-weight-${r.id}`}
                            type="number" step="1" 
                            className={inputCls + " border-primary/50 focus:border-primary font-bold text-lg h-10 outward-weight-input"} 
                            value={remaining}
                            onChange={(e) => handleRemainingChange(r.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const inputs = Array.from(document.querySelectorAll('.outward-weight-input')) as HTMLInputElement[];
                                const currentIndex = inputs.indexOf(e.currentTarget);
                                if (currentIndex > -1 && currentIndex < inputs.length - 1) {
                                  inputs[currentIndex + 1].focus();
                                }
                              }
                            }}
                            placeholder="0"
                          />
                        </div>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2 h-10 flex flex-col justify-center">
                          <div className="text-[10px] uppercase text-red-600 font-bold leading-none mb-1">Consumed</div>
                          <div className="text-red-700 font-bold leading-none">{consumed > 0 ? Math.round(consumed) : '0'} Kg</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2 text-right">
                        Original Balance: {Math.round(r.currentBalance)} Kg
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between bg-card shrink-0 rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 relative">
          <div className="text-sm text-muted-foreground">
            Total Consumed: <span className="font-bold text-red-600 ml-1">
              {Math.round(selectedReelsList.reduce((acc, r) => {
                const rem = selected[r.id].remainingWeight;
                return acc + (rem !== '' ? r.currentBalance - rem : 0);
              }, 0))} Kg
            </span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button 
              type="button" onClick={onSubmit} 
              disabled={isSubmitting || selectedReelsList.length === 0} 
              className="px-8 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center disabled:opacity-50 shadow-lg shadow-red-600/20"
            >
              {isSubmitting && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
              Issue {selectedReelsList.length} Reels
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Plus, Save, Trash2, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { type Reel, getReels } from '../../lib/supabase/reelService';
import { executeReelAudit, type ReelAuditItemInput } from '../../lib/supabase/reelAuditService';

interface ReelAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface AuditRow {
  reel: Reel;
  auditedIn: number;
  auditedOut: number;
  auditedBalance: number;
}

export default function ReelAuditModal({ isOpen, onClose, onSuccess }: ReelAuditModalProps) {
  const { user } = useAuth();
  const [auditDate, setAuditDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // All active and empty reels to allow auditing anything
  const [allReels, setAllReels] = useState<Reel[]>([]);
  const [isLoadingReels, setIsLoadingReels] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadReels();
      setAuditRows([]);
      setSearchQuery('');
      setAuditDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const loadReels = async () => {
    setIsLoadingReels(true);
    try {
      const data = await getReels();
      setAllReels(data);
    } catch (err) {
      console.error('Failed to load reels', err);
    } finally {
      setIsLoadingReels(false);
    }
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase().trim();
    return allReels.filter(r => {
      // Don't show already added reels
      if (auditRows.some(row => row.reel.id === r.id)) return false;

      // Do not show reels with 0 or nil balance in smart search
      if (Number(r.currentBalance) <= 0) return false;

      // Smart match
      const rNum = (r.reelNumber || '').toLowerCase();
      const rType = (r.paperType || '').toLowerCase();
      const rSize = (r.reelSize?.toString() || '').toLowerCase();
      const rBf = (r.bf?.toString() || '').toLowerCase();
      const rGsm = (r.gsm?.toString() || '').toLowerCase();

      return rNum.includes(query) || 
             rType.includes(query) || 
             rSize.includes(query) || 
             rBf.includes(query) || 
             rGsm.includes(query);
    }).slice(0, 10); // Limit results for performance
  }, [searchQuery, allReels, auditRows]);

  const addReelToAudit = (reel: Reel) => {
    const sysIn = Number(reel.weight) || 0;
    const sysBal = Number(reel.currentBalance) || 0;
    const sysOut = sysIn - sysBal;

    setAuditRows(prev => [...prev, {
      reel,
      auditedIn: sysIn,
      auditedOut: sysOut,
      auditedBalance: sysBal
    }]);
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const removeRow = (index: number) => {
    setAuditRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'auditedIn' | 'auditedOut' | 'auditedBalance', value: string) => {
    const numValue = Number(value) || 0;
    setAuditRows(prev => {
      const newRows = [...prev];
      const row = newRows[index];

      if (field === 'auditedIn') {
        row.auditedIn = numValue;
        row.auditedBalance = Math.max(0, row.auditedIn - row.auditedOut);
      } else if (field === 'auditedOut') {
        row.auditedOut = numValue;
        row.auditedBalance = Math.max(0, row.auditedIn - row.auditedOut);
      } else if (field === 'auditedBalance') {
        row.auditedBalance = numValue;
        row.auditedOut = Math.max(0, row.auditedIn - row.auditedBalance);
      }

      return newRows;
    });
  };

  const handleSubmit = async () => {
    if (!auditDate) {
      setError('Please select an audit date');
      return;
    }
    if (auditRows.length === 0) {
      setError('Please add at least one reel to audit');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const items: ReelAuditItemInput[] = auditRows.map(row => {
        const sysIn = Number(row.reel.weight) || 0;
        const sysBal = Number(row.reel.currentBalance) || 0;
        return {
          reelId: row.reel.id!,
          reelNumber: row.reel.reelNumber,
          systemWeight: sysIn,
          systemBalance: sysBal,
          auditedWeight: row.auditedIn,
          auditedIn: row.auditedIn,
          auditedOut: row.auditedOut,
          auditedBalance: row.auditedBalance
        };
      });

      await executeReelAudit(auditDate, items, user?.name || 'System');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save audit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalIn = auditRows.reduce((sum, row) => sum + (Number(row.auditedIn) || 0), 0);
  const totalOut = auditRows.reduce((sum, row) => sum + (Number(row.auditedOut) || 0), 0);
  const netDifference = auditRows.reduce((sum, row) => sum + ((Number(row.auditedBalance) || 0) - (Number(row.reel.currentBalance) || 0)), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/30">
          <div>
            <h2 className="text-xl font-bold text-foreground">Audit Reel Inventory</h2>
            <p className="text-sm text-muted-foreground mt-1">Adjust and balance your reel stock with smart search</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto bg-muted/10">
          
          <div className="flex flex-wrap gap-6 mb-6">
            <div className="flex-1 min-w-[300px]">
              <label className="block text-sm font-medium text-foreground mb-1">Audit Date</label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                />
              </div>
            </div>

            <div className="flex-[2] min-w-[300px] relative">
              <label className="block text-sm font-medium text-foreground mb-1">
                Smart Search (Reel No, Size, BF, GSM, Type)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="e.g. R-1234, 25, 18, 120, SK..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                />
                
                {searchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                    {isLoadingReels ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">Loading...</div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map(reel => (
                        <div 
                          key={reel.id} 
                          onClick={() => addReelToAudit(reel)}
                          className="px-4 py-3 hover:bg-secondary cursor-pointer border-b border-border last:border-0 flex justify-between items-center group transition-colors"
                        >
                          <div>
                            <span className="font-bold font-mono text-primary group-hover:text-primary-foreground bg-primary/10 group-hover:bg-primary px-2 py-0.5 rounded mr-3 transition-colors">
                              {reel.reelNumber}
                            </span>
                            <span className="text-sm font-medium">
                              {reel.paperType} • {reel.reelSize}" • {reel.bf} BF • {reel.gsm} GSM
                            </span>
                          </div>
                          <div className="text-sm">
                            Bal: <span className="font-bold text-green-600">{reel.currentBalance} Kg</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-center text-muted-foreground">No matching reels found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center text-sm font-medium">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-secondary/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Reel No</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Size"</th>
                  <th className="px-4 py-3 font-medium">BF</th>
                  <th className="px-4 py-3 font-medium">GSM</th>
                  <th className="px-4 py-3 font-medium text-blue-600 bg-blue-50/50">IN (Weight)</th>
                  <th className="px-4 py-3 font-medium text-red-600 bg-red-50/50">OUT (Consumed)</th>
                  <th className="px-4 py-3 font-medium text-green-600 bg-green-50/50">Closing Bal</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditRows.map((row, index) => {
                  const sysIn = Number(row.reel.weight) || 0;
                  const sysBal = Number(row.reel.currentBalance) || 0;
                  const isBalChanged = row.auditedBalance !== sysBal;
                  const isInChanged = row.auditedIn !== sysIn;

                  return (
                    <tr key={row.reel.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold">{row.reel.reelNumber}</td>
                      <td className="px-4 py-3">{row.reel.paperType}</td>
                      <td className="px-4 py-3">{row.reel.reelSize}</td>
                      <td className="px-4 py-3">{row.reel.bf}</td>
                      <td className="px-4 py-3">{row.reel.gsm}</td>
                      
                      <td className={`px-4 py-2 ${isInChanged ? 'bg-blue-50' : ''}`}>
                        <div className="flex flex-col gap-1">
                          <input
                            type="number"
                            value={row.auditedIn}
                            onChange={(e) => updateRow(index, 'auditedIn', e.target.value)}
                            className="w-24 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-blue-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          {isInChanged && <span className="text-[10px] text-muted-foreground">Sys: {sysIn}</span>}
                        </div>
                      </td>

                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={row.auditedOut}
                          onChange={(e) => updateRow(index, 'auditedOut', e.target.value)}
                          className="w-24 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-red-600 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </td>

                      <td className={`px-4 py-2 ${isBalChanged ? 'bg-green-50' : ''}`}>
                        <div className="flex flex-col gap-1">
                          <input
                            type="number"
                            value={row.auditedBalance}
                            onChange={(e) => updateRow(index, 'auditedBalance', e.target.value)}
                            className="w-24 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-green-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          {isBalChanged && <span className="text-[10px] text-muted-foreground">Sys: {sysBal}</span>}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeRow(index)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Remove from audit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {auditRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Search className="w-10 h-10 mb-3 text-muted" />
                        <p className="font-medium">No reels added to audit.</p>
                        <p className="text-xs mt-1">Use the smart search above to find and add reels.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex justify-between items-center">
          <div className="flex gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total IN</span>
              <span className="font-bold text-blue-600">{totalIn} kg</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total OUT</span>
              <span className="font-bold text-orange-600">{totalOut} kg</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Net Difference</span>
              <span className={`font-bold ${netDifference > 0 ? 'text-green-600' : netDifference < 0 ? 'text-red-600' : 'text-foreground'}`}>
                {netDifference > 0 ? '+' : ''}{netDifference} kg
              </span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-input hover:bg-muted rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || auditRows.length === 0}
              className="px-6 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg shadow-md transition-colors disabled:opacity-50 flex items-center"
            >
              {isSubmitting ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Audit
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

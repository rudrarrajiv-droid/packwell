import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Trash2, Calendar, ClipboardCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getRawMaterials, adjustRawMaterialStock } from '../../lib/supabase/rmService';
import type { RawMaterial } from '../../lib/types/models';
import { useAuth } from '../../contexts/AuthContext';

interface RMAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface AuditRow {
  rmId: string;
  name: string;
  sysBal: number;
  audBal: number | string;
  rate: number;
}

export default function RMAuditModal({ isOpen, onClose, onSuccess }: RMAuditModalProps) {
  const { user } = useAuth();
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: getRawMaterials as () => Promise<RawMaterial[]>,
    enabled: isOpen,
  });

  // Handle clicking outside suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = rawMaterials.filter(item => {
    if (!searchTerm) return false;
    
    // Don't show already added items
    if (auditRows.some(row => row.rmId === item.id)) return false;

    return (item.name || '').toLowerCase().includes(searchTerm.toLowerCase());
  }).slice(0, 8); // limit suggestions

  const addRow = (item: RawMaterial) => {
    if (auditRows.some(row => row.rmId === item.id)) {
      setSearchTerm('');
      setShowSuggestions(false);
      return;
    }
    setAuditRows(prev => [{
      rmId: item.id!,
      name: item.name,
      sysBal: Number(item.closingBalance) || 0,
      audBal: Number(item.closingBalance) || 0,
      rate: Number(item.rate) || 0
    }, ...prev]);
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    if (isOpen && rawMaterials.length > 0 && !isInitialized) {
      // Pre-fill with all RMs by default, sorted alphabetically
      const sortedRMs = [...rawMaterials].sort((a, b) => a.name.localeCompare(b.name));
      const initialRows: AuditRow[] = sortedRMs.map(rm => ({
        rmId: rm.id!,
        name: rm.name,
        sysBal: Number(rm.closingBalance) || 0,
        audBal: Number(rm.closingBalance) || 0,
        rate: Number(rm.rate) || 0
      }));
      setAuditRows(initialRows);
      setIsInitialized(true);
    }
  }, [isOpen, rawMaterials, isInitialized]);

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setAuditRows([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  const removeRow = (index: number) => {
    setAuditRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof AuditRow, value: any) => {
    setAuditRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      return newRows;
    });
  };

  const handleSave = async () => {
    if (auditRows.length === 0) return;
    
    try {
      setIsSubmitting(true);
      
      // We only need to process items where balance actually changed
      const changedRows = auditRows.filter(r => {
        const audBal = Number(r.audBal) || 0;
        return audBal !== r.sysBal;
      });

      // Adjust stock sequentially for safety and accuracy of logs
      for (const row of changedRows) {
        await adjustRawMaterialStock({
          rawMaterialId: row.rmId,
          auditedStock: Number(row.audBal) || 0,
          reason: 'Bulk Physical Audit',
          date: auditDate,
          user: user?.name || 'System'
        });
      }
      
      setAuditRows([]);
      setSearchTerm('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save RM audit:', err);
      alert('Failed to save RM audit. See console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAuditRows = auditRows.filter(row => {
    if (!searchTerm) return true;
    return (row.name || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (!isOpen) return null;

  const totalQtyIn = auditRows.reduce((sum, row) => {
    const diff = (Number(row.audBal) || 0) - (row.sysBal || 0);
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  const totalQtyOut = auditRows.reduce((sum, row) => {
    const diff = (Number(row.audBal) || 0) - (row.sysBal || 0);
    return sum + (diff < 0 ? Math.abs(diff) : 0);
  }, 0);

  const totalQtyDiff = totalQtyIn - totalQtyOut;

  const totalValueDiff = auditRows.reduce((sum, row) => {
    const diff = (Number(row.audBal) || 0) - (row.sysBal || 0);
    return sum + (diff * (Number(row.rate) || 0));
  }, 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Audit Raw Material (RM)</h2>
              <p className="text-sm text-muted-foreground">Adjust and balance your RM stock with smart search</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto flex flex-col gap-6">
          {/* Controls */}
          <div className="flex gap-4 items-start">
            <div className="w-48">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Audit Date</label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex-1 relative" ref={searchRef}>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Smart Search (Material Name)</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Paper, Ink, Glue..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && searchTerm && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg overflow-hidden z-[100] max-h-60 overflow-y-auto">
                  {filteredItems.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {filteredItems.map(item => (
                        <li 
                          key={item.id}
                          onClick={() => addRow(item)}
                          className="p-3 hover:bg-muted/50 cursor-pointer transition-colors flex justify-between items-center"
                        >
                          <div>
                            <div className="font-medium text-sm text-foreground">{item.name}</div>
                          </div>
                          <div className="flex gap-4 text-xs font-mono">
                            <div className="text-right">
                              <div className="text-muted-foreground">Sys Balance</div>
                              <div className="font-bold text-foreground">{item.closingBalance}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-sm text-center text-muted-foreground">
                      No matching materials found (or already added).
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 border border-border rounded-lg overflow-hidden flex flex-col bg-background">
            {auditRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>Search and select materials to audit</p>
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-secondary/50 text-muted-foreground border-b border-border sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 font-medium">Material Name</th>
                      <th className="px-4 py-3 font-medium text-blue-600 bg-blue-50/50">System Balance</th>
                      <th className="px-4 py-3 font-medium text-green-600 bg-green-50/50 text-center">Qty IN (Surplus)</th>
                      <th className="px-4 py-3 font-medium text-red-600 bg-red-50/50 text-center">Qty OUT (Short)</th>
                      <th className="px-4 py-3 font-medium bg-muted/30">Rate</th>
                      <th className="px-4 py-3 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAuditRows.map((row) => {
                      const index = auditRows.findIndex(r => r.rmId === row.rmId);
                      const isChanged = Number(row.audBal) !== row.sysBal;
                      
                      const diff = (Number(row.audBal) || 0) - (row.sysBal || 0);
                      const qtyIn = diff > 0 ? diff : 0;
                      const qtyOut = diff < 0 ? Math.abs(diff) : 0;
                      
                      return (
                        <tr key={row.rmId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-medium">{row.name}</td>

                          <td className={`px-4 py-2 ${isChanged ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                step="any"
                                value={row.audBal}
                                onChange={(e) => updateRow(index, 'audBal', e.target.value)}
                                className="w-28 px-2 py-1.5 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-blue-700"
                              />
                              {isChanged && <span className="text-[10px] text-muted-foreground font-medium">Sys: {row.sysBal}</span>}
                            </div>
                          </td>
                          
                          <td className="px-4 py-2 text-center font-bold text-green-600">
                            {qtyIn > 0 ? `+${qtyIn.toFixed(2)}` : '-'}
                          </td>
                          
                          <td className="px-4 py-2 text-center font-bold text-red-600">
                            {qtyOut > 0 ? `-${qtyOut.toFixed(2)}` : '-'}
                          </td>
                          
                          <td className="px-4 py-2 bg-muted/10 font-mono text-muted-foreground">
                            ₹{row.rate.toFixed(2)}
                          </td>

                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeRow(index)}
                              className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex justify-between items-center">
          <div className="flex gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total IN</span>
              <span className="font-bold text-green-600">
                {totalQtyIn.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total OUT</span>
              <span className="font-bold text-red-600">
                {totalQtyOut.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col border-l border-border pl-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Net Qty Diff</span>
              <span className={`font-bold ${totalQtyDiff > 0 ? 'text-green-600' : totalQtyDiff < 0 ? 'text-red-600' : 'text-foreground'}`}>
                {totalQtyDiff > 0 ? '+' : ''}{totalQtyDiff.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col border-l border-border pl-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Value Diff</span>
              <span className={`font-bold ${totalValueDiff > 0 ? 'text-green-600' : totalValueDiff < 0 ? 'text-red-600' : 'text-foreground'}`}>
                {totalValueDiff > 0 ? '+₹' : totalValueDiff < 0 ? '-₹' : '₹'}{Math.abs(totalValueDiff).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={auditRows.length === 0 || isSubmitting}
              className="px-6 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              <ClipboardCheck className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Audit'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

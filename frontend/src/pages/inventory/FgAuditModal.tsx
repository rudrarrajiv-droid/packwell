import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Trash2, Calendar, ClipboardCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getFinishGoods, type FinishGood } from '../../lib/supabase/finishGoodService';
import { getProducts, type SupabaseProduct } from '../../lib/supabase/productService';
import { executeFgAudit } from '../../lib/supabase/fgAuditService';
import { useAuth } from '../../contexts/AuthContext';

interface FgAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CombinedFgItem {
  fgId?: string;
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  sysRegBal: number;
  sysNmBal: number;
  rate: number;
}

interface AuditRow extends CombinedFgItem {
  audRegBal: number | string;
  audNmBal: number | string;
  isRateManuallyEdited: boolean;
}

export default function FgAuditModal({ isOpen, onClose, onSuccess }: FgAuditModalProps) {
  const { user } = useAuth();
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: fgs = [] } = useQuery({
    queryKey: ['finishGoods'],
    queryFn: getFinishGoods,
    enabled: isOpen,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
    enabled: isOpen,
  });

  const combinedItems = React.useMemo(() => {
    const itemsMap = new Map<string, CombinedFgItem>();
    
    // First add all products from master data
    products.forEach(p => {
      itemsMap.set(p.id, {
        productId: p.id,
        productName: p.itemName,
        customerId: p.customerId,
        customerName: p.customerName,
        sysRegBal: 0,
        sysNmBal: 0,
        rate: 0 // Will be overridden if FG exists or manually set
      });
    });

    // Then merge FG data
    fgs.forEach(fg => {
      const existing = itemsMap.get(fg.productId);
      if (existing) {
        existing.fgId = fg.id;
        existing.sysRegBal = Number(fg.closingBalance) || 0;
        existing.sysNmBal = Number(fg.nonMovingBalance) || 0;
        existing.rate = Number(fg.rate) || 0;
      } else {
        // Just in case FG exists but not in master data (unlikely but safe)
        itemsMap.set(fg.productId || fg.id, {
          fgId: fg.id,
          productId: fg.productId,
          productName: fg.productName,
          customerId: fg.customerId,
          customerName: fg.customerName,
          sysRegBal: Number(fg.closingBalance) || 0,
          sysNmBal: Number(fg.nonMovingBalance) || 0,
          rate: Number(fg.rate) || 0
        });
      }
    });

    return Array.from(itemsMap.values());
  }, [fgs, products]);

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

  const filteredItems = combinedItems.filter(item => {
    if (!searchTerm) return false;
    
    // Don't show already added items
    if (auditRows.some(row => row.productId === item.productId)) return false;

    // Smart match
    const pName = (item.productName || '').toLowerCase();
    const cName = (item.customerName || '').toLowerCase();
    const term = searchTerm.toLowerCase();

    return pName.includes(term) || cName.includes(term);
  }).slice(0, 8); // limit suggestions

  const addRow = (item: CombinedFgItem) => {
    setAuditRows(prev => [{
      ...item,
      audRegBal: item.sysRegBal,
      audNmBal: item.sysNmBal,
      isRateManuallyEdited: false
    }, ...prev]);
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const removeRow = (index: number) => {
    setAuditRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof AuditRow, value: any) => {
    setAuditRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      if (field === 'rate') {
        newRows[index].isRateManuallyEdited = true;
      }
      return newRows;
    });
  };

  const handleSave = async () => {
    if (auditRows.length === 0) return;
    
    try {
      setIsSubmitting(true);
      await executeFgAudit(
        auditDate,
        auditRows.map(r => ({
          fgId: r.fgId,
          productId: r.productId,
          productName: r.productName,
          customerId: r.customerId,
          customerName: r.customerName,
          sysRegBal: r.sysRegBal,
          sysNmBal: r.sysNmBal,
          audRegBal: Number(r.audRegBal) || 0,
          audNmBal: Number(r.audNmBal) || 0,
          rate: Number(r.rate) || 0
        })),
        user?.name || 'System'
      );
      
      setAuditRows([]);
      setSearchTerm('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save FG audit:', err);
      alert('Failed to save FG audit. See console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Audit Finished Goods (FG)</h2>
              <p className="text-sm text-muted-foreground">Adjust and balance your FG stock with smart search</p>
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
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Smart Search (Item Name, Customer)</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Box A, Apple..."
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg overflow-hidden z-10 max-h-60 overflow-y-auto">
                  {filteredItems.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {filteredItems.map(item => (
                        <li 
                          key={item.productId}
                          onClick={() => addRow(item)}
                          className="p-3 hover:bg-muted/50 cursor-pointer transition-colors flex justify-between items-center"
                        >
                          <div>
                            <div className="font-medium text-sm text-foreground">{item.productName}</div>
                            <div className="text-xs text-muted-foreground">{item.customerName}</div>
                          </div>
                          <div className="flex gap-4 text-xs font-mono">
                            <div className="text-right">
                              <div className="text-muted-foreground">Reg Bal</div>
                              <div className="font-bold text-foreground">{item.sysRegBal}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-muted-foreground">NM Bal</div>
                              <div className="font-bold text-foreground">{item.sysNmBal}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-sm text-center text-muted-foreground">
                      No matching items found (or already added).
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
                <p>Search and select items to audit</p>
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-secondary/50 text-muted-foreground border-b border-border sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 font-medium">Item Name</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium text-blue-600 bg-blue-50/50">Reg Balance</th>
                      <th className="px-4 py-3 font-medium text-orange-600 bg-orange-50/50">NM Balance</th>
                      <th className="px-4 py-3 font-medium bg-muted/30">Rate</th>
                      <th className="px-4 py-3 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditRows.map((row, index) => {
                      const isRegChanged = Number(row.audRegBal) !== row.sysRegBal;
                      const isNmChanged = Number(row.audNmBal) !== row.sysNmBal;
                      
                      return (
                        <tr key={row.productId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-medium">{row.productName}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.customerName}</td>

                          <td className={`px-4 py-2 ${isRegChanged ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                value={row.audRegBal}
                                onChange={(e) => updateRow(index, 'audRegBal', e.target.value)}
                                className="w-24 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-blue-700"
                              />
                              {isRegChanged && <span className="text-[10px] text-muted-foreground">Sys: {row.sysRegBal}</span>}
                            </div>
                          </td>

                          <td className={`px-4 py-2 ${isNmChanged ? 'bg-orange-50/30' : ''}`}>
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                value={row.audNmBal}
                                onChange={(e) => updateRow(index, 'audNmBal', e.target.value)}
                                className="w-24 px-2 py-1 text-sm border border-input rounded bg-background focus:ring-1 focus:ring-primary font-bold text-orange-600"
                              />
                              {isNmChanged && <span className="text-[10px] text-muted-foreground">Sys: {row.sysNmBal}</span>}
                            </div>
                          </td>
                          
                          <td className="px-4 py-2 bg-muted/10">
                             <input
                                type="number"
                                value={row.rate}
                                onChange={(e) => updateRow(index, 'rate', e.target.value)}
                                className={`w-24 px-2 py-1 text-sm border rounded bg-background focus:ring-1 focus:ring-primary font-bold ${row.isRateManuallyEdited ? 'border-primary text-primary' : 'border-input'}`}
                                placeholder="Auto"
                              />
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
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex justify-end gap-3">
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
            className="px-6 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            <ClipboardCheck className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Audit'}
          </button>
        </div>

      </div>
    </div>
  );
}

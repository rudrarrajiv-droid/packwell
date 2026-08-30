import React, { useState, useMemo } from 'react';
import { X, Search, FileX2, Calendar, AlertCircle, Info, CheckCircle2, Building2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCustomers } from '../../lib/supabase/customerService';
import { bulkCloseCustomerPOs, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { useAuth } from '../../contexts/AuthContext';

interface BulkClosePOModalProps {
  onClose: () => void;
  activePOs: PurchaseOrder[];
}

export default function BulkClosePOModal({ onClose, activePOs }: BulkClosePOModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
  const [closeDate, setCloseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState<string>('NIL PO / Customer Balance Closed');
  
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: masterCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  // Combine customers from Master DB and all distinct active POs so NO customer is ever missing!
  const allAvailableCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; activeCount: number; totalPending: number }>();
    
    // 1. Add from master customers table
    masterCustomers.forEach(c => {
      if (c.name) {
        const normName = c.name.trim();
        map.set(normName.toLowerCase(), {
          id: c.id || normName,
          name: normName,
          activeCount: 0,
          totalPending: 0
        });
      }
    });

    // 2. Add / update from active POs list
    activePOs.forEach(po => {
      if (po.customerName) {
        const normName = po.customerName.trim();
        const key = normName.toLowerCase();
        const isNotClosed = po.status !== 'CLOSED' && po.status !== 'CANCELLED';
        const pending = (po.orderQty || 0) + (po.inQty || 0) - (po.outQty || 0);

        if (!map.has(key)) {
          map.set(key, {
            id: po.customerId || normName,
            name: normName,
            activeCount: isNotClosed ? 1 : 0,
            totalPending: isNotClosed && pending > 0 ? pending : 0
          });
        } else if (isNotClosed) {
          const item = map.get(key)!;
          item.activeCount += 1;
          if (pending > 0) item.totalPending += pending;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Sort customers with active POs to top
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
      return a.name.localeCompare(b.name);
    });
  }, [masterCustomers, activePOs]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return allAvailableCustomers;
    const term = searchTerm.toLowerCase().trim();
    return allAvailableCustomers.filter(c => 
      c.name.toLowerCase().includes(term)
    );
  }, [allAvailableCustomers, searchTerm]);

  // Find all active POs for the selected customer
  const selectedCustomerActivePOs = useMemo(() => {
    if (!selectedCustomerId && !selectedCustomerName) return [];
    return activePOs.filter(po => {
      const isClosed = po.status === 'CLOSED' || po.status === 'CANCELLED';
      if (isClosed) return false;
      const matchId = selectedCustomerId && po.customerId === selectedCustomerId;
      const matchName = selectedCustomerName && po.customerName?.trim().toLowerCase() === selectedCustomerName.trim().toLowerCase();
      return matchId || matchName;
    });
  }, [activePOs, selectedCustomerId, selectedCustomerName]);

  const totalPendingQty = useMemo(() => {
    return selectedCustomerActivePOs.reduce((acc, po) => {
      const bal = po.orderQty + (po.inQty || 0) - (po.outQty || 0);
      return acc + (bal > 0 ? bal : 0);
    }, 0);
  }, [selectedCustomerActivePOs]);

  const selectedCustomerActivePOsCount = selectedCustomerActivePOs.length;

  const handleSelectCustomer = (cust: { id: string; name: string }) => {
    setSelectedCustomerId(cust.id);
    setSelectedCustomerName(cust.name);
  };

  const bulkCloseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerName && !selectedCustomerId) throw new Error('Please select a customer.');
      const poIds = selectedCustomerActivePOs.map(po => po.id).filter(Boolean) as string[];
      if (poIds.length === 0) throw new Error('No active POs found to close for this customer.');
      
      return bulkCloseCustomerPOs(poIds, user?.name || 'System', {
        date: closeDate,
        remarks: remarks.trim() || `NIL PO / ${selectedCustomerName} Balance Closed`
      });
    },
    onSuccess: () => {
      alert(`Successfully NIL'd ${selectedCustomerActivePOsCount} active PO(s) for ${selectedCustomerName} with ${totalPendingQty.toLocaleString()} qty OUT adjustment recorded in ledger.`);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['allPoTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['poTransactions'] });
      onClose();
    },
    onError: (error: any) => {
      alert('Failed to NIL POs: ' + error.message);
    }
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-background w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-red-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 text-white rounded-xl shadow-xs">
              <FileX2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                NIL Customer POs (Bulk Close)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                Make all active POs NIL with automatic OUT ledger adjustment
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
              Select Customer <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customer (e.g. DSS, RBI)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-medium"
              />
            </div>
            
            <div className="mt-2 border border-border rounded-xl max-h-48 overflow-y-auto bg-card divide-y divide-border/50">
              {filteredCustomers.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No customers found matching "{searchTerm}"</div>
              ) : (
                filteredCustomers.map(customer => {
                  const isSelected = selectedCustomerName === customer.name || selectedCustomerId === customer.id;
                  return (
                    <button
                      key={customer.id + customer.name}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className={`w-full text-left p-3 text-sm transition-colors flex items-center justify-between ${
                        isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span>{customer.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {customer.activeCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            {customer.activeCount} Active ({customer.totalPending.toLocaleString()} Qty)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No active POs</span>
                        )}
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-1" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selectedCustomerName && (
            <div className="space-y-4 pt-1 animate-fade-in">
              {/* Stats Banner */}
              <div className="bg-secondary/40 border border-border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Customer Selected</span>
                  <span className="text-base font-black text-foreground">{selectedCustomerName}</span>
                  <span className="text-xs text-muted-foreground block">{selectedCustomerActivePOsCount} Active PO(s)</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-red-600 uppercase block">Total Pending to NIL</span>
                  <span className="text-lg font-black text-red-600 font-mono">{totalPendingQty.toLocaleString()} Qty</span>
                </div>
              </div>

              {selectedCustomerActivePOsCount === 0 ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                  This customer currently has no open/pending POs to close.
                </div>
              ) : (
                <>
                  {/* Date & Remarks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1">
                        NIL / Closing Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={closeDate}
                        onChange={(e) => setCloseDate(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1">
                        Reason / Remarks
                      </label>
                      <input
                        type="text"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="e.g. NIL PO / Customer Closed"
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Clicking confirm will record an <b>OUT adjustment transaction of {totalPendingQty.toLocaleString()} total quantity</b> on <b>{closeDate}</b> across all {selectedCustomerActivePOsCount} POs, setting their balance to NIL (0) in the ledger!
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-sm border border-input hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => bulkCloseMutation.mutate()}
            disabled={!selectedCustomerName || selectedCustomerActivePOsCount === 0 || bulkCloseMutation.isPending}
            className={`px-5 py-2 rounded-xl font-bold text-sm text-white flex items-center transition-all ${
              !selectedCustomerName || selectedCustomerActivePOsCount === 0
                ? 'bg-muted-foreground/50 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20'
            }`}
          >
            {bulkCloseMutation.isPending ? 'Processing NIL...' : `NIL ${selectedCustomerActivePOsCount} Active POs`}
          </button>
        </div>
      </div>
    </div>
  );
}

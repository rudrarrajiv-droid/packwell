import React, { useState } from 'react';
import { X, Search, FileX2 } from 'lucide-react';
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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  });

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCustomerName = customers.find(c => c.id === selectedCustomerId)?.name || '';

  const selectedCustomerActivePOs = selectedCustomerId 
    ? activePOs.filter(po => (po.customerId === selectedCustomerId || po.customerName === selectedCustomerName) && po.status !== 'CLOSED')
    : [];

  const selectedCustomerActivePOsCount = selectedCustomerActivePOs.length;

  const bulkCloseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId || !user?.name) throw new Error('Invalid input');
      const poIds = selectedCustomerActivePOs.map(po => po.id).filter(Boolean) as string[];
      return bulkCloseCustomerPOs(poIds, user.name);
    },
    onSuccess: () => {
      alert('Successfully closed all active POs for the selected customer');
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      onClose();
    },
    onError: (error: any) => {
      alert('Failed to close POs: ' + error.message);
    }
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileX2 className="w-5 h-5 text-red-500" />
              Bulk Close Customer POs
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Set all active POs for a customer to CLOSED</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold mb-2">Select Customer</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
            </div>
            
            <div className="mt-2 border border-border rounded-md max-h-48 overflow-y-auto bg-card">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-center text-sm text-muted-foreground">No customers found</div>
              ) : (
                filteredCustomers.map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={`w-full text-left p-3 text-sm border-b border-border/50 last:border-0 hover:bg-muted transition-colors ${
                      selectedCustomerId === customer.id ? 'bg-primary/10 text-primary font-bold' : ''
                    }`}
                  >
                    {customer.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedCustomerId && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded-lg p-4 text-center mt-2">
              <h3 className="text-orange-800 dark:text-orange-400 font-bold mb-1">Warning</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                You are about to close <span className="font-black text-lg">{selectedCustomerActivePOsCount}</span> active PO(s) for this customer.
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                This action will mark them as CLOSED and cannot be easily reversed.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-secondary/30 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md font-semibold text-sm border border-input hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => bulkCloseMutation.mutate()}
            disabled={!selectedCustomerId || selectedCustomerActivePOsCount === 0 || bulkCloseMutation.isPending}
            className={`px-5 py-2 rounded-md font-bold text-sm text-white flex items-center transition-all ${
              !selectedCustomerId || selectedCustomerActivePOsCount === 0
                ? 'bg-muted-foreground/50 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20'
            }`}
          >
            {bulkCloseMutation.isPending ? 'Closing...' : 'Close All Active POs'}
          </button>
        </div>
      </div>
    </div>
  );
}

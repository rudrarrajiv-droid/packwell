import React, { useState, useEffect } from 'react';
import { X, Loader2, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { getRawMaterialTransactions } from '../../lib/supabase/rmService';
import type { RawMaterial, RawMaterialTransaction } from '../../lib/types/models';

export default function RMHistoryModal({ 
  isOpen, 
  onClose,
  selectedRM 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  selectedRM: RawMaterial | null;
}) {
  const [transactions, setTransactions] = useState<RawMaterialTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && selectedRM) {
      fetchTransactions();
    }
  }, [isOpen, selectedRM]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await getRawMaterialTransactions(selectedRM?.id);
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !selectedRM) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background w-full max-w-4xl rounded-xl shadow-xl border border-border flex flex-col h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div>
            <h2 className="text-xl font-semibold">Transaction History: {selectedRM.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Current Balance: <span className="font-semibold text-foreground">{selectedRM.closingBalance}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>No transactions found for this material.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Ref No</th>
                    <th className="px-4 py-3 text-right font-medium">Quantity</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(new Date(tx.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        {tx.type === 'IN' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
                            <ArrowDownRight className="w-3.5 h-3.5" /> IN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
                            <ArrowUpRight className="w-3.5 h-3.5" /> OUT
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {tx.referenceNo || '-'}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${tx.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {tx.remainingBalance}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {tx.performedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

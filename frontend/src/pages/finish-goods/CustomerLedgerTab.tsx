import React, { useState, useMemo } from 'react';
import { FileText, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { FinishGoodTransaction } from '../../lib/types/models';

interface Props {
  finishGoods: any[];
  transactions: FinishGoodTransaction[];
}

export default function CustomerLedgerTab({ finishGoods, transactions }: Props) {
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  const uniqueCustomers = useMemo(() => {
    const customers = new Set<string>();
    finishGoods.forEach(fg => {
      if (fg.customerName) customers.add(fg.customerName);
    });
    return Array.from(customers).sort();
  }, [finishGoods]);

  const customerLedger = useMemo(() => {
    if (!selectedCustomer) return [];

    // Find all item IDs for this customer
    const customerItemIds = new Set(finishGoods.filter(fg => fg.customerName === selectedCustomer).map(fg => fg.productId));

    // Filter transactions
    const txs = transactions.filter(tx => customerItemIds.has(tx.finishGoodId));

    return txs.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt).getTime();
      const dateB = new Date(b.date || b.createdAt).getTime();
      return dateB - dateA; // Newest first
    }).map(tx => {
      const fg = finishGoods.find(item => item.productId === tx.finishGoodId);
      return {
        ...tx,
        productName: fg ? fg.productName : tx.finishGoodId
      };
    });
  }, [transactions, finishGoods, selectedCustomer]);

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border shadow-sm">
      <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-center shrink-0">
        <label className="font-medium text-sm flex items-center">
          Select Customer:
        </label>
        <select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          className="px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary min-w-[250px] bg-background"
        >
          <option value="">-- Select a Customer --</option>
          {uniqueCustomers.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!selectedCustomer ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a customer to view their complete item ledger</p>
          </div>
        ) : customerLedger.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No transactions found for this customer.</div>
        ) : (
          <table className="w-full text-sm text-left border border-border">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0">
              <tr>
                <th className="px-4 py-3 font-medium border-b border-r border-border">Date</th>
                <th className="px-4 py-3 font-medium border-b border-r border-border">Invoice No / Ref</th>
                <th className="px-4 py-3 font-medium border-b border-r border-border">Product Name</th>
                <th className="px-4 py-3 font-medium border-b border-r border-border">Type</th>
                <th className="px-4 py-3 font-medium border-b border-r border-border">Category</th>
                <th className="px-4 py-3 font-medium text-right border-b border-r border-border">IN Qty</th>
                <th className="px-4 py-3 font-medium text-right border-b border-border">OUT Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customerLedger.map((tx: any, i) => (
                <tr key={tx.id || i} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap border-r border-border">
                    {tx.date || (tx.createdAt ? format(new Date(tx.createdAt), 'yyyy-MM-dd') : '-')}
                  </td>
                  <td className="px-4 py-3 font-mono border-r border-border">{tx.invoiceNo || tx.referenceNo || '-'}</td>
                  <td className="px-4 py-3 border-r border-border font-medium">{tx.productName}</td>
                  <td className="px-4 py-3 border-r border-border">
                    {tx.type === 'IN' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <ArrowDownToLine className="w-3 h-3 mr-1" /> IN
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <ArrowUpFromLine className="w-3 h-3 mr-1" /> OUT
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-r border-border whitespace-nowrap text-xs">{tx.category || '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600 border-r border-border">
                    {tx.type === 'IN' ? tx.quantity : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600 border-r border-border">
                    {tx.type === 'OUT' ? tx.quantity : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


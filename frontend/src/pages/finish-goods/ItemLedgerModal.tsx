import React, { useMemo } from 'react';
import { X, FileText, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { format } from 'date-fns';
import type { FinishGoodTransaction } from '../../lib/types/models';

interface Props {
  finishGood: any;
  transactions: FinishGoodTransaction[];
  onClose: () => void;
}

export default function ItemLedgerModal({ finishGood, transactions, onClose }: Props) {
  const ledger = useMemo(() => {
    // Filter transactions for this item
    const txs = transactions.filter(tx => tx.finishGoodId === finishGood.id);
    // Sort chronological: oldest to newest
    return txs.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt).getTime();
      const dateB = new Date(b.date || b.createdAt).getTime();
      return dateA - dateB;
    });
  }, [transactions, finishGood]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-secondary/30 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <FileText className="w-6 h-6 mr-3 text-primary" />
              Item Ledger: {finishGood.productName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Customer: {finishGood.customerName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          {ledger.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No transactions found for this item.</div>
          ) : (
            <table className="w-full text-sm text-left border border-border">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium border-b border-r border-border">Date</th>
                  <th className="px-4 py-3 font-medium border-b border-r border-border">Invoice No / Ref</th>
                  <th className="px-4 py-3 font-medium border-b border-r border-border">Type</th>
                  <th className="px-4 py-3 font-medium border-b border-r border-border">Category</th>
                  <th className="px-4 py-3 font-medium text-right border-b border-r border-border">IN Qty</th>
                  <th className="px-4 py-3 font-medium text-right border-b border-r border-border">OUT Qty</th>
                  <th className="px-4 py-3 font-medium text-right border-b border-border">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.map((tx, i) => (
                  <tr key={tx.id || i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap border-r border-border">
                      {tx.date || (tx.createdAt ? format(new Date(tx.createdAt), 'yyyy-MM-dd') : '-')}
                    </td>
                    <td className="px-4 py-3 font-mono border-r border-border">{tx.invoiceNo || tx.referenceNo || '-'}</td>
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
                    <td className="px-4 py-3 text-right font-bold text-foreground">{tx.remainingBalance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


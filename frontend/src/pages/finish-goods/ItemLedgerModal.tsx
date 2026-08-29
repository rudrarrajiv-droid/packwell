import React, { useMemo } from 'react';
import { X, FileText, ArrowDownToLine, ArrowUpFromLine, Sliders, Truck, Factory, Package } from 'lucide-react';
import { format } from 'date-fns';
import type { FinishGoodTransaction } from '../../lib/types/models';

interface Props {
  finishGood: any;
  transactions: FinishGoodTransaction[];
  onClose: () => void;
}

export default function ItemLedgerModal({ finishGood, transactions, onClose }: Props) {
  const targetId = finishGood.id || finishGood.firestore_document_id;
  const targetProdId = finishGood.productId || finishGood.product_id || targetId;
  const targetProdName = (finishGood.productName || finishGood.product_name || '').trim().toLowerCase();

  const ledger = useMemo(() => {
    // Filter transactions matching this finish good by ID, productId, or product name
    const txs = transactions.filter(tx => {
      const fgId = tx.finishGoodId;
      const pid = (tx as any).productId;
      const pname = ((tx as any).productName || (tx as any).raw_data?.productName || '').trim().toLowerCase();

      if (fgId && (fgId === targetId || fgId === targetProdId)) return true;
      if (pid && (pid === targetId || pid === targetProdId)) return true;
      if (targetProdName && pname && targetProdName === pname) return true;
      return false;
    });

    // Sort chronological: oldest to newest
    return txs.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      return dateA - dateB;
    });
  }, [transactions, targetId, targetProdId, targetProdName]);

  const getRemarks = (tx: any) => {
    const raw = tx.raw_data || {};
    const cat = (tx.category || raw.category || '').toUpperCase();
    
    if (cat === 'ADJUSTMENT' || tx.place === 'Stock/Rate Adjustment') {
      return raw.remarks || tx.remarks || (tx.place !== 'Stock/Rate Adjustment' ? tx.place : null) || 'Physical Stock Verification / Rate Adjustment';
    }
    if (cat === 'DISPATCH' || tx.type === 'OUT') {
      const parts = [];
      if (tx.transporterName || raw.transporterName) parts.push(tx.transporterName || raw.transporterName);
      if (tx.vehicleNo || raw.vehicleNo) parts.push(`Veh: ${tx.vehicleNo || raw.vehicleNo}`);
      if (tx.place && tx.place !== 'Stock/Rate Adjustment') parts.push(tx.place);
      if (raw.remarks) parts.push(raw.remarks);
      return parts.join(' • ') || '-';
    }
    if (cat === 'PRODUCTION' || tx.type === 'IN') {
      if (raw.jobCardNo) return `Job Card: ${raw.jobCardNo}`;
      if (raw.remarks) return raw.remarks;
      return 'Production Inward';
    }
    return raw.remarks || tx.remarks || tx.place || '-';
  };

  const openingQty = Number(finishGood.openingQty || finishGood.opening_qty) || 0;
  const inQty = Number(finishGood.inQty || finishGood.in_qty) || 0;
  const outQty = Number(finishGood.outQty || finishGood.out_qty) || 0;
  const closingBalance = Number(finishGood.closingBalance || finishGood.closing_balance) || 0;
  const nonMovingBalance = Number(finishGood.nonMovingBalance || finishGood.non_moving_balance) || 0;
  const rate = Number(finishGood.rate) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Item Ledger: {finishGood.productName}
              </h2>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Customer / Party: <span className="font-bold text-foreground">{finishGood.customerName}</span>
                {rate > 0 && <span className="ml-3 text-emerald-600 font-semibold">• Rate: ₹{rate.toFixed(3)}</span>}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Statistics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-secondary/30 border-b border-border text-center text-xs shrink-0">
          <div className="bg-card p-2 rounded-lg border border-border">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Opening Stock</div>
            <div className="text-sm font-black text-foreground">{openingQty.toLocaleString()}</div>
          </div>
          <div className="bg-card p-2 rounded-lg border border-border">
            <div className="text-[10px] uppercase font-bold text-emerald-600">Total IN</div>
            <div className="text-sm font-black text-emerald-600">+{inQty.toLocaleString()}</div>
          </div>
          <div className="bg-card p-2 rounded-lg border border-border">
            <div className="text-[10px] uppercase font-bold text-red-600">Total OUT</div>
            <div className="text-sm font-black text-red-600">-{outQty.toLocaleString()}</div>
          </div>
          <div className="bg-card p-2 rounded-lg border border-border">
            <div className="text-[10px] uppercase font-bold text-primary">Regular Balance</div>
            <div className="text-sm font-black text-primary">{closingBalance.toLocaleString()}</div>
          </div>
          <div className="bg-card p-2 rounded-lg border border-border col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase font-bold text-orange-600">Non-Moving</div>
            <div className="text-sm font-black text-orange-600">{nonMovingBalance.toLocaleString()}</div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-auto p-4">
          {ledger.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto text-muted mb-3 opacity-20" />
              <p className="font-semibold">No transactions recorded yet for this item.</p>
              <p className="text-xs mt-1">Stock is currently based on Opening Balance ({openingQty} pcs).</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border border-border rounded-lg overflow-hidden">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/60 sticky top-0 border-b border-border shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold border-r border-border">Date</th>
                  <th className="px-4 py-3 font-semibold border-r border-border">Invoice / Ref</th>
                  <th className="px-4 py-3 font-semibold border-r border-border text-center">Type</th>
                  <th className="px-4 py-3 font-semibold border-r border-border">Category</th>
                  <th className="px-4 py-3 font-semibold text-right border-r border-border text-emerald-600">IN Qty</th>
                  <th className="px-4 py-3 font-semibold text-right border-r border-border text-red-600">OUT Qty</th>
                  <th className="px-4 py-3 font-semibold text-right border-r border-border text-primary">Balance After</th>
                  <th className="px-4 py-3 font-semibold">Remarks & Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.map((tx, i) => {
                  const isAdjustment = (tx.category || (tx as any).raw_data?.category) === 'ADJUSTMENT';
                  const isTransfer = (tx.category || (tx as any).raw_data?.category) === 'STOCK_TRANSFER';
                  const remarksText = getRemarks(tx);
                  const formattedDate = tx.date 
                    ? (tx.date.includes('T') ? tx.date.split('T')[0] : tx.date) 
                    : (tx.createdAt ? format(new Date(tx.createdAt), 'yyyy-MM-dd') : '-');

                  return (
                    <tr 
                      key={tx.id || i} 
                      className={`hover:bg-muted/50 transition-colors ${
                        isTransfer ? 'bg-purple-50/40 dark:bg-purple-950/20' : isAdjustment ? 'bg-amber-50/40 dark:bg-amber-950/20' : 'bg-card'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap border-r border-border font-medium">
                        {formattedDate}
                      </td>
                      
                      <td className="px-4 py-3 font-mono font-bold text-foreground border-r border-border">
                        {tx.invoiceNo || tx.referenceNo || '-'}
                      </td>

                      <td className="px-4 py-3 border-r border-border text-center">
                        {tx.type === 'IN' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                            <ArrowDownToLine className="w-3 h-3 mr-1" /> IN
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
                            <ArrowUpFromLine className="w-3 h-3 mr-1" /> OUT
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 border-r border-border whitespace-nowrap text-xs font-bold">
                        {isTransfer ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            🔄 TRANSFER
                          </span>
                        ) : isAdjustment ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Sliders className="w-3 h-3 mr-1" /> ADJUSTMENT
                          </span>
                        ) : tx.category === 'DISPATCH' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                            <Truck className="w-3 h-3 mr-1" /> DISPATCH
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{tx.category || '-'}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 border-r border-border">
                        {tx.type === 'IN' ? `+${Number(tx.quantity).toLocaleString()}` : '-'}
                      </td>

                      <td className="px-4 py-3 text-right font-black text-red-600 dark:text-red-400 border-r border-border">
                        {tx.type === 'OUT' ? `-${Number(tx.quantity).toLocaleString()}` : '-'}
                      </td>

                      <td className="px-4 py-3 text-right font-black text-primary border-r border-border text-base">
                        {Number(tx.remainingBalance).toLocaleString()}
                      </td>

                      <td className="px-4 py-3 text-xs text-foreground font-medium">
                        {isAdjustment ? (
                          <div className="font-semibold text-amber-800 dark:text-amber-300">
                            📝 {remarksText}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">
                            {remarksText}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between shrink-0">
          <span>Showing {ledger.length} ledger transaction entries</span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-colors text-xs"
          >
            Close Ledger
          </button>
        </div>

      </div>
    </div>
  );
}

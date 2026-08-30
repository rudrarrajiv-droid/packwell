import React, { useState, useMemo } from 'react';
import { X, History, AlertTriangle, Search, Activity, FileText, Scale, Sparkles, Printer, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getPOTransactionsByPOId, getPurchaseOrderBalance, type POTransaction, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import POAdjustModal from './POAdjustModal';

interface POHistoryModalProps {
  po: PurchaseOrder;
  onClose: () => void;
  onRefreshParent?: () => void;
}

const formatDateSafe = (dateVal: any): string => {
  if (!dateVal) return '-';
  const str = String(dateVal).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serialDays = Math.floor(Number(str));
    if (Number.isFinite(serialDays) && serialDays > 20000) {
      const excelEpochUtcMs = Date.UTC(1899, 11, 30);
      const d = new Date(excelEpochUtcMs + serialDays * 86400000);
      return d.toLocaleDateString('en-GB');
    }
  }
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str || '-';
  return d.toLocaleDateString('en-GB');
};

export default function POHistoryModal({ po, onClose, onRefreshParent }: POHistoryModalProps) {
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  // Fetch transactions for this PO
  const { data: transactions = [], isLoading, refetch } = useQuery<POTransaction[]>({
    queryKey: ['poTransactions', po.id],
    queryFn: () => getPOTransactionsByPOId(po.id!)
  });

  // Client-Side Filters
  const [filterType, setFilterType] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 1. Sort Chronologically (Oldest to Newest)
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeA - timeB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [transactions]);

  // 2. Calculate Running Balance
  const { historyData, calculatedBalance, totalIn, totalOut } = useMemo(() => {
    let currentBalance = po.orderQty;
    let tIn = 0;
    let tOut = 0;
    
    const enrichedData = sortedTransactions.map(tx => {
      const isCreationTx = tx.type === 'IN' && (
        tx.remarks?.includes('Auto-IN on PO Creation') || 
        tx.remarks?.includes('Auto-IN on PO Import')
      );

      if (isCreationTx) {
        return { ...tx, runningBalance: currentBalance };
      }

      if (tx.type === 'IN') {
        currentBalance += tx.quantity;
        tIn += tx.quantity;
      } else if (tx.type === 'OUT') {
        currentBalance -= tx.quantity;
        tOut += tx.quantity;
      }
      return { ...tx, runningBalance: currentBalance };
    });

    return { 
      historyData: enrichedData, 
      calculatedBalance: currentBalance,
      totalIn: tIn,
      totalOut: tOut
    };
  }, [sortedTransactions, po.orderQty]);

  // 3. Current System Balance
  const systemClosingBal = getPurchaseOrderBalance(po);
  const isClosedStatus = po.status === 'CLOSED';
  const isMismatch = !isClosedStatus && (calculatedBalance !== systemClosingBal);

  // 4. Apply Filters for Display Only
  const displayData = useMemo(() => {
    return historyData.filter(tx => {
      if (filterType !== 'ALL' && tx.type !== filterType) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      return true;
    });
  }, [historyData, filterType, dateFrom, dateTo]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[90vh] border border-border overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-blue-500/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-foreground">
                  PO Transaction History
                </h2>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-secondary text-foreground">
                  PO {po.poNo}
                </span>
                {isClosedStatus && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                    NIL / CLOSED
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete audit ledger & transaction history for {po.customerName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAdjustOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-2xs"
            >
              <Scale className="w-4 h-4" />
              Adjust Balance / Make NIL
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10 space-y-6">
          
          {/* Mismatch Warning */}
          {isMismatch && !isLoading && (
            <div className="p-4 bg-red-100 border border-red-300 text-red-800 rounded-xl text-sm font-semibold flex items-start animate-shake">
              <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">
                <p className="text-base font-bold">History balance mismatch detected.</p>
                <p className="mt-1 font-medium opacity-90 text-xs">
                  The calculated running balance from history is {calculatedBalance}, while stored balance is {systemClosingBal}. You can click "Adjust Balance / Make NIL" above to sync and adjust the balance with an audit transaction.
                </p>
              </div>
              <button
                onClick={() => setIsAdjustOpen(true)}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shrink-0 ml-3"
              >
                Sync / Adjust Now
              </button>
            </div>
          )}

          {/* PO Master Header */}
          <div className="p-5 bg-card rounded-2xl border border-border shadow-2xs">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">
              PO Master Data
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-y-4 gap-x-6">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">PO No.</p>
                <p className="font-black text-foreground text-sm">{po.poNo}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">PO Date</p>
                <p className="font-semibold text-foreground text-sm">{formatDateSafe(po.poDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Delivery Date</p>
                <p className="font-semibold text-foreground text-sm">{formatDateSafe(po.deliveryDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Customer</p>
                <p className="font-bold text-foreground text-sm truncate" title={po.customerName}>{po.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Consignee</p>
                <p className="font-semibold text-foreground text-sm truncate" title={po.consignee}>{po.consignee || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Artwork No.</p>
                <p className="font-mono text-foreground text-sm">{po.artworkNo || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Item Name</p>
                <p className="font-bold text-foreground text-sm truncate" title={po.productName}>{po.productName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Size</p>
                <p className="font-semibold text-foreground text-sm">{po.size || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Rate</p>
                <p className="font-bold text-foreground text-sm font-mono">₹{po.rate.toFixed(2)}</p>
              </div>
            </div>

            {/* Read-Only Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-border bg-muted/30 -mx-5 -mb-5 p-5 rounded-b-2xl">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Opening Qty</p>
                <p className="font-black text-foreground text-xl font-mono">{po.orderQty}</p>
              </div>
              <div>
                <p className="text-[10px] text-green-600 uppercase font-bold">Total IN</p>
                <p className="font-black text-green-600 text-xl font-mono">+{totalIn}</p>
              </div>
              <div>
                <p className="text-[10px] text-blue-600 uppercase font-bold">Total OUT</p>
                <p className="font-black text-blue-600 text-xl font-mono">-{totalOut}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Current Closing Bal</p>
                <p className={`font-black text-xl font-mono ${isClosedStatus ? 'text-green-600' : 'text-foreground'}`}>
                  {isClosedStatus ? '0 (NIL)' : calculatedBalance}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-2xl border border-border shadow-2xs">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Type</label>
              <select 
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Transactions</option>
                <option value="IN">IN Only</option>
                <option value="OUT">OUT Only</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Date From</label>
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Date To</label>
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" 
              />
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-2xs relative min-h-[250px]">
            {isLoading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="flex flex-col items-center text-primary">
                  <Activity className="w-8 h-8 animate-spin mb-2" />
                  <span className="font-semibold text-xs">Loading History...</span>
                </div>
              </div>
            )}
            
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-secondary/70 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3 border-b border-border">Date</th>
                  <th className="px-4 py-3 border-b border-border text-center">Type</th>
                  <th className="px-4 py-3 border-b border-border text-right">Quantity</th>
                  <th className="px-4 py-3 border-b border-border text-right">Running Balance</th>
                  <th className="px-4 py-3 border-b border-border">User</th>
                  <th className="px-4 py-3 border-b border-border w-full">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayData.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                        <FileText className="w-10 h-10 opacity-30" />
                        <p className="text-sm font-semibold">No transactions recorded for this PO.</p>
                        <button
                          onClick={() => setIsAdjustOpen(true)}
                          className="px-3 py-1.5 bg-secondary hover:bg-muted text-foreground text-xs font-bold rounded-lg border border-border mt-1 transition-colors"
                        >
                          + Record Adjustment / Make NIL
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayData.map((tx, idx) => {
                    const isNilOrAdj = tx.remarks?.toLowerCase().includes('nil') || tx.remarks?.toLowerCase().includes('adjust');
                    return (
                      <tr key={tx.id || idx} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-foreground font-medium text-xs">
                          {formatDateSafe(tx.date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isNilOrAdj ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              {tx.type === 'OUT' ? 'NIL / OUT' : 'ADJUST IN'}
                            </span>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                              tx.type === 'IN' 
                                ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            }`}>
                              {tx.type}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono ${tx.type === 'IN' ? 'text-green-600' : 'text-blue-600'}`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-foreground font-mono bg-secondary/10">
                          {tx.runningBalance}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-medium">{tx.performedBy || 'System'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-normal max-w-[320px]">
                          {tx.remarks || <span className="opacity-40 italic">No remarks</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Inline Adjust Modal */}
      {isAdjustOpen && (
        <POAdjustModal
          po={po}
          onClose={() => setIsAdjustOpen(false)}
          onSuccess={() => {
            setIsAdjustOpen(false);
            refetch();
            if (onRefreshParent) onRefreshParent();
          }}
        />
      )}
    </div>
  );
}

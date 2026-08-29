import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Search, ArrowDownToLine, ArrowUpFromLine, FileText, History, Calendar, FileSpreadsheet, Edit, Sliders, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import ExportButtons from '../components/ExportButtons';
import BulkInModal from './finish-goods/BulkInModal';
import BulkOutModal from './finish-goods/BulkOutModal';
import FinishGoodHistoryModal from './finish-goods/FinishGoodHistoryModal';
import ExcelImportModal from './finish-goods/ExcelImportModal';
import ItemLedgerModal from './finish-goods/ItemLedgerModal';
import CustomerLedgerTab from './finish-goods/CustomerLedgerTab';
import FinishGoodAdjustmentModal from './finish-goods/FinishGoodAdjustmentModal';
import { getFinishGoods, getFinishGoodTransactions } from '../lib/supabase/finishGoodService';

export default function FinishGoods() {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'EMPTY' | 'REPORT' | 'CUSTOMER_LEDGER'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'REGULAR' | 'NON-MOVING'>('ALL');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [isBulkInOpen, setIsBulkInOpen] = useState(false);
  const [isBulkOutOpen, setIsBulkOutOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<any>(null);
  const [selectedFinishGood, setSelectedFinishGood] = useState<any>(null);
  const [itemToFix, setItemToFix] = useState<any>(null);

  const queryClient = useQueryClient();

  const { data: fgList = [], isLoading, refetch } = useQuery({
    queryKey: ['finishGoods'],
    queryFn: () => getFinishGoods() as Promise<any[]>
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['finishGoodTransactions'],
    queryFn: () => getFinishGoodTransactions() as Promise<any[]>,
    enabled: true
  });

  const filteredFG = useMemo(() => {
    return fgList.filter((item: any) => {
      const searchString = `${item.productName} ${item.customerName}`.toLowerCase();
      if (!searchString.includes(search.toLowerCase())) return false;
      
      const aReg = Number(item.closingBalance) || 0;
      const aNon = Number(item.nonMovingBalance) || 0;
      const totalBal = aReg + aNon;

      // Filter by Tab
      if (activeTab === 'ACTIVE' && totalBal <= 0) return false;
      if (activeTab === 'EMPTY' && totalBal > 0) return false;

      // Filter by Stock Category
      if (stockFilter === 'REGULAR' && aReg === 0) return false;
      if (stockFilter === 'NON-MOVING' && aNon === 0) return false;

      return true;
    }).sort((a: any, b: any) => {
      const aReg = Number(a.closingBalance) || 0;
      const bReg = Number(b.closingBalance) || 0;
      const aNon = Number(a.nonMovingBalance) || 0;
      const bNon = Number(b.nonMovingBalance) || 0;

      const aHasReg = aReg > 0;
      const bHasReg = bReg > 0;

      if (aHasReg && !bHasReg) return -1;
      if (!aHasReg && bHasReg) return 1;

      if (!aHasReg && !bHasReg) {
        const aHasNon = aNon > 0;
        const bHasNon = bNon > 0;
        if (aHasNon && !bHasNon) return -1;
        if (!aHasNon && bHasNon) return 1;
      }

      // Default sort by customer name then product name
      const custCompare = (a.customerName || '').localeCompare(b.customerName || '');
      if (custCompare !== 0) return custCompare;
      return (a.productName || '').localeCompare(b.productName || '');
    });
  }, [fgList, search, stockFilter, activeTab]);

  const { totalRegValue, totalNonValue } = useMemo(() => {
    return filteredFG.reduce((acc: any, curr: any) => {
      const rate = Number(curr.rate) || 0;
      const regBal = Number(curr.closingBalance) || 0;
      const nonBal = Number(curr.nonMovingBalance) || 0;
      
      return {
        totalRegValue: acc.totalRegValue + (regBal * rate),
        totalNonValue: acc.totalNonValue + (nonBal * rate)
      };
    }, { totalRegValue: 0, totalNonValue: 0 });
  }, [filteredFG]);

  // Generate Date Report
  const reportData = useMemo(() => {
    if (activeTab !== 'REPORT') return [];
    
    // Filter tx for the specific date
    const txForDate = transactions.filter(tx => {
      const d = (tx.date || tx.createdAt || '').split('T')[0];
      return d === reportDate;
    });

    // Group by finishGoodId
    const map = new Map<string, { inQty: number; outQty: number; productName: string; customerName: string }>();

    txForDate.forEach(tx => {
      const fgId = tx.finishGoodId;
      if (!fgId) return;

      const fg = fgList.find(f => f.id === fgId || f.productId === fgId);
      const prodName = fg?.productName || tx.productName || 'Unknown Product';
      const custName = fg?.customerName || tx.customerName || 'Unknown Customer';

      if (!map.has(fgId)) {
        map.set(fgId, { inQty: 0, outQty: 0, productName: prodName, customerName: custName });
      }

      const entry = map.get(fgId)!;
      const q = Number(tx.quantity) || 0;
      if (tx.type === 'IN') {
        entry.inQty += q;
      } else if (tx.type === 'OUT') {
        entry.outQty += q;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [transactions, reportDate, activeTab, fgList]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-4 p-4 md:p-6 max-w-7xl mx-auto w-full">
      {/* Header with Title and Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <PackageCheck className="w-8 h-8 mr-3 text-primary" />
            Finish Goods Inventory
          </h1>
          <p className="text-muted-foreground mt-1">Track and manage manufactured products inventory</p>
        </div>
        <div className="flex justify-end items-center gap-4">
          <div className="bg-primary/10 border border-primary/20 px-4 py-3 rounded-xl flex items-center shadow-sm">
            <div className="text-right">
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Regular Stock Valuation</div>
              <div className="text-xl font-black text-primary">₹{totalRegValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
          {totalNonValue > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 px-4 py-3 rounded-xl flex items-center shadow-sm">
              <div className="text-right">
                <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Non-Moving Valuation</div>
                <div className="text-xl font-black text-orange-600 dark:text-orange-400">₹{totalNonValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'ACTIVE' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Active Stock
        </button>
        <button
          onClick={() => setActiveTab('EMPTY')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'EMPTY' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Empty / Nil Stock
        </button>
        <button
          onClick={() => setActiveTab('REPORT')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'REPORT' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          In/Out Date Report
        </button>
        <button
          onClick={() => setActiveTab('CUSTOMER_LEDGER')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'CUSTOMER_LEDGER' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Customer Ledger
        </button>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm shrink-0">
        {activeTab !== 'REPORT' ? (
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by customer or product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            
            <select 
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
            >
              <option value="ALL">All Items</option>
              <option value="REGULAR">Regular Stock Only</option>
              <option value="NON-MOVING">Non-Moving Only</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <label className="font-medium text-sm flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              Select Date:
            </label>
            <input 
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pb-2 sm:pb-0">
          {activeTab !== 'REPORT' && (
            <ExportButtons 
              data={filteredFG} 
              filenamePrefix="FinishGoodsInventory"
              title="Finish Goods Inventory Status"
              columnMap={{
                'customerName': 'Customer',
                'productName': 'Product',
                'openingQty': 'Opening Qty',
                'inQty': 'IN',
                'outQty': 'OUT',
                'closingBalance': 'Closing Balance',
                'nonMovingBalance': 'Non-Moving Balance',
                'rate': 'Rate',
              }}
            />
          )}
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
          >
            <History className="w-4 h-4 mr-2" />
            Product History
          </button>
          
          <button 
            onClick={() => setIsExcelImportOpen(true)}
            className="bg-violet-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-violet-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel Import
          </button>

          <button 
            onClick={() => setIsBulkOutOpen(true)}
            className="bg-red-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-red-700 transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Bulk OUT
          </button>
          
          <button 
            onClick={() => setIsBulkInOpen(true)}
            className="bg-green-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-green-700 transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Bulk IN
          </button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-lg overflow-hidden flex flex-col">
        {activeTab === 'CUSTOMER_LEDGER' ? (
          <CustomerLedgerTab finishGoods={fgList} transactions={transactions} />
        ) : (
          <div className="flex-1 overflow-auto">
            {isLoading || (activeTab === 'REPORT' && loadingTx) ? (
              <div className="p-8 text-center text-muted-foreground">Loading records...</div>
            ) : activeTab === 'REPORT' ? (
              <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer Name</th>
                  <th className="px-6 py-4 font-medium">Product Name</th>
                  <th className="px-6 py-4 font-medium text-right text-green-600">Total IN (Pcs)</th>
                  <th className="px-6 py-4 font-medium text-right text-red-600">Total OUT (Pcs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reportData.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">{row.customerName}</td>
                    <td className="px-6 py-4 font-medium text-muted-foreground">{row.productName}</td>
                    <td className="px-6 py-4 text-right font-bold text-green-600">{row.inQty > 0 ? row.inQty : '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-red-600">{row.outQty > 0 ? row.outQty : '-'}</td>
                  </tr>
                ))}
                {reportData.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto text-muted mb-3 opacity-20" />
                      <p>No inward or outward transactions found for {new Date(reportDate).toLocaleDateString('en-IN')}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer Name</th>
                  <th className="px-6 py-4 font-medium">Product / Artwork Name</th>
                  <th className="px-6 py-4 font-medium text-right">Opening Qty</th>
                  <th className="px-6 py-4 font-medium text-right text-green-600">IN</th>
                  <th className="px-6 py-4 font-medium text-right text-red-600">OUT</th>
                  <th className="px-6 py-4 font-medium text-right text-blue-600">Regular Balance</th>
                  <th className="px-6 py-4 font-medium text-right text-orange-600">Non-Moving</th>
                  <th className="px-6 py-4 font-medium text-right">Rate</th>
                  <th className="px-6 py-4 font-medium text-right">Total Value</th>
                  <th className="px-6 py-4 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFG.map((item: any) => {
                  const closingBal = Number(item.closingBalance) || 0;
                  const nonMovingBal = Number(item.nonMovingBalance) || 0;
                  const rate = Number(item.rate) || 0;
                  const totalVal = (closingBal + nonMovingBal) * rate;
                  const isNegative = closingBal < 0;
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors cursor-pointer ${isNegative ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedFinishGood(item)}
                    >
                      <td className={`px-6 py-4 font-bold ${isNegative ? 'text-red-700' : 'text-foreground'}`}>{item.customerName}</td>
                      <td className={`px-6 py-4 font-medium ${isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>{item.productName}</td>
                      <td className="px-6 py-4 text-right font-medium">{item.openingQty || 0}</td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">{item.inQty || 0}</td>
                      <td className="px-6 py-4 text-right font-bold text-red-600">{item.outQty || 0}</td>
                      <td className={`px-6 py-4 text-right font-black text-base ${isNegative ? 'text-red-700' : 'text-blue-700'}`}>
                        {isNegative && <AlertTriangle className="inline-block w-4 h-4 mr-1 text-red-500 mb-1" />}
                        {closingBal.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-orange-600">{nonMovingBal.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-medium text-muted-foreground">₹{rate.toFixed(3)}</td>
                      <td className={`px-6 py-4 text-right font-bold ${isNegative ? 'text-red-700' : 'text-foreground'}`}>₹{totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Rate & Qty Adjustment Button */}
                          <button
                            onClick={() => {
                              setAdjustmentItem(item);
                              setIsAdjustmentOpen(true);
                            }}
                            title="Update Rate & Qty Adjustment"
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                          >
                            <Sliders className="w-4 h-4" />
                            <span className="hidden xl:inline">Adjust</span>
                          </button>

                          {isNegative && (
                            <button 
                              onClick={() => {
                                setItemToFix(item);
                                setIsBulkInOpen(true);
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow-sm transition-colors text-xs font-semibold"
                              title="Fix Negative Stock (Use Bulk IN)"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredFG.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto text-muted mb-3 opacity-20" />
                      <p>No {activeTab === 'EMPTY' ? 'empty' : 'active'} finished goods found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        )}
        
        <div className="p-3 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex justify-between">
          <span>Showing {activeTab === 'REPORT' ? reportData.length : filteredFG.length} records</span>
          <span>{activeTab === 'REPORT' ? 'Showing IN/OUT quantities for the selected date.' : 'Only Finished Goods are shown here. Total Value calculates only Regular stock.'}</span>
        </div>
      </div>
      
      {isBulkInOpen && (
        <BulkInModal 
          initialItem={itemToFix}
          onClose={() => {
            setIsBulkInOpen(false);
            setItemToFix(null);
          }}
          onSuccess={() => {
            setIsBulkInOpen(false);
            setItemToFix(null);
            refetch();
          }}
        />
      )}
      {isBulkOutOpen && (
        <BulkOutModal 
          onClose={() => setIsBulkOutOpen(false)}
          onSuccess={() => {
            setIsBulkOutOpen(false);
            refetch();
          }}
        />
      )}

      {isHistoryOpen && (
        <FinishGoodHistoryModal 
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {selectedFinishGood && (
        <ItemLedgerModal
          finishGood={selectedFinishGood}
          transactions={transactions}
          onClose={() => setSelectedFinishGood(null)}
        />
      )}

      {isExcelImportOpen && (
        <ExcelImportModal
          onClose={() => setIsExcelImportOpen(false)}
          onSuccess={() => {
            setIsExcelImportOpen(false);
            refetch();
          }}
        />
      )}

      {/* Rate & Qty Adjustment Modal */}
      <FinishGoodAdjustmentModal
        isOpen={isAdjustmentOpen}
        onClose={() => {
          setIsAdjustmentOpen(false);
          setAdjustmentItem(null);
        }}
        onSuccess={() => {
          setIsAdjustmentOpen(false);
          setAdjustmentItem(null);
          refetch();
          queryClient.invalidateQueries({ queryKey: ['finishGoods'] });
          queryClient.invalidateQueries({ queryKey: ['finishGoodTransactions'] });
        }}
        item={adjustmentItem}
      />
      
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, History, ArrowDownToLine, ArrowUpFromLine, Trash2, Calendar } from 'lucide-react';
import type { FinishGoodTransaction } from '../../lib/types/models';
import { format } from 'date-fns';
import ExportButtons from '../../components/ExportButtons';
import { useAuth } from '../../contexts/AuthContext';
import { deleteFinishGoodTransaction, getFinishGoods, getFinishGoodTransactions, updateFinishGoodTransactionDate } from '../../lib/supabase/finishGoodService';

export default function FinishGoodHistoryModal({ onClose }: { onClose: () => void }) {
  const { user, hasRole } = useAuth();
  const [search, setSearch] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['finishGoodTransactions'],
    queryFn: () => getFinishGoodTransactions() as Promise<FinishGoodTransaction[]>
  });

  const queryClient = useQueryClient();

  const handleEditDate = async (tx: FinishGoodTransaction) => {
    const current = tx.date ? format(new Date(tx.date), 'yyyy-MM-dd') : '';
    const newDate = window.prompt(`Enter new date for transaction (YYYY-MM-DD):`, current);
    if (!newDate || newDate === current) return;
    
    // basic validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      alert("Invalid date format. Please use YYYY-MM-DD.");
      return;
    }

    try {
      await updateFinishGoodTransactionDate(tx.id!, newDate, user?.name || 'System');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['finishGoods'] });
    } catch (error: any) {
      alert(error.message || 'Failed to update date. See console.');
      console.error(error);
    }
  };

  const handleDelete = async (tx: FinishGoodTransaction) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This will reverse the stock balance mathematically.')) return;
    try {
      setIsDeleting(tx.id!);
      await deleteFinishGoodTransaction(tx.id!, tx.finishGoodId, tx.type as any, tx.category, Number(tx.quantity), user?.name || 'System');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['finishGoods'] });
    } catch (error) {
      alert('Failed to delete transaction. See console.');
      console.error(error);
    } finally {
      setIsDeleting(null);
    }
  };

  // Sort descending by created/date
  const sortedHistory = [...history].sort((a, b) => {
    // If they have date, fallback to createdAt
    const dateA = new Date(a.date || a.createdAt).getTime();
    const dateB = new Date(b.date || b.createdAt).getTime();
    return dateB - dateA;
  });

  // Fetch finish goods to map finishGoodId to Name
  const { data: fgList = [] } = useQuery({
    queryKey: ['finishGoods'],
    queryFn: () => getFinishGoods() as Promise<any[]>
  });

  const getProductName = (id: string) => {
    const fg = fgList.find(item => item.productId === id);
    if (fg) return `${fg.productName} (${fg.customerName})`;
    return id; // fallback
  };

  const filteredHistory = sortedHistory.filter(h => {
    const pName = getProductName(h.finishGoodId);
    const searchString = `${h.referenceNo || ''} ${pName} ${h.performedBy || ''} ${h.transporterName || ''} ${h.place || ''}`.toLowerCase();
    return searchString.includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-secondary/30 shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center">
            <History className="w-6 h-6 mr-3 text-primary" />
            Finish Goods Transaction History
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Export */}
        <div className="p-4 border-b border-border bg-card shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search Item, Customer, Invoice, ya Transporter se..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="text-sm text-muted-foreground hidden sm:block">
              Showing {filteredHistory.length} transactions
            </div>
          </div>
          
          <div className="flex-shrink-0">
            <ExportButtons 
              data={filteredHistory.map(h => ({
                ...h,
                date: h.date || (h.createdAt ? format(new Date(h.createdAt), 'yyyy-MM-dd') : ''),
                productName: getProductName(h.finishGoodId),
                freight: h.freight || 0,
                point: h.point || 0,
                holding: h.holding || 0,
                others: h.others || 0,
              }))} 
              filenamePrefix="FinishGoodTransactions"
              title="Finish Goods Transaction History"
              columnMap={{
                'date': 'Date',
                'type': 'Type',
                'category': 'Category',
                'productName': 'Product Name',
                'quantity': 'Quantity',
                'remainingBalance': 'Balance',
                'invoiceNo': 'Invoice No',
                'place': 'Place',
                'transporterName': 'Transporter Name',
                'vehicleNo': 'Vehicle No',
                'vehicleSize': 'Vehicle Size',
                'freight': 'Freight',
                'point': 'Point',
                'holding': 'Holding Charges',
                'others': 'Others',
                'performedBy': 'Performed By'
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-muted/20">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading history...</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-card border-b border-border sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Product & Customer</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Remaining Bal</th>
                  <th className="px-4 py-3 font-medium">Invoice/Ref No.</th>
                  <th className="px-4 py-3 font-medium">Transporter</th>
                  {hasRole('ADMIN') && <th className="px-4 py-3 font-medium">Action</th>}
                  <th className="px-4 py-3 font-medium">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50 transition-colors bg-card">
                    <td className="px-4 py-3 font-medium">
                      {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.type === 'IN' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700">
                          <ArrowDownToLine className="w-3 h-3 mr-1" /> IN
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">
                          <ArrowUpFromLine className="w-3 h-3 mr-1" /> OUT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${
                        item.category === 'REGULAR' || item.category === 'DISPATCH' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {getProductName(item.finishGoodId)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${item.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {item.type === 'IN' ? '+' : '-'}{item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-blue-700">
                      {item.remainingBalance}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {item.referenceNo || item.invoiceNo || '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.transporterName ? `${item.transporterName} (${item.vehicleNo})` : '-'}
                    </td>
                    {hasRole('ADMIN') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditDate(item)}
                            className="text-blue-500 hover:text-blue-700 transition-colors p-1 rounded-md hover:bg-blue-50"
                            title="Edit Transaction Date"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isDeleting === item.id}
                            className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors p-1 rounded-md hover:bg-red-50"
                            title="Delete Transaction & Reverse Balance"
                          >
                            <Trash2 className={`w-4 h-4 ${isDeleting === item.id ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.performedBy}
                    </td>
                  </tr>
                ))}
                
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">
                      No transaction history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

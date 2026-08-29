import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, Search, CircleDollarSign, FileText, Plus, Edit2, CheckCircle2 } from 'lucide-react';
import type { FinishGoodTransaction } from '../lib/types/models';
import ExportButtons from '../components/ExportButtons';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFinishGoods, getFinishGoodTransactions, markFreightReceived } from '../lib/supabase/finishGoodService';
import { getCustomers } from '../lib/supabase/customerService';
import FreightModal from './freight/FreightModal';

export default function FreightCharge() {
  const [search, setSearch] = useState('');
  const [transporterFilter, setTransporterFilter] = useState('ALL');
  const [sizeFilter, setSizeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFreightItem, setSelectedFreightItem] = useState<any | null>(null);
  
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['finishGoodTransactions'],
    queryFn: () => getFinishGoodTransactions() as Promise<FinishGoodTransaction[]>
  });

  const { data: finishGoods = [], isLoading: fgLoading } = useQuery({
    queryKey: ['finishGoods'],
    queryFn: () => getFinishGoods() as Promise<any[]>
  });

  const { data: registeredCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers()
  });

  const isLoading = txLoading || fgLoading;

  // Process data to unique invoices
  const { uniqueInvoices, transporterOptions, sizeOptions, customerOptions } = useMemo(() => {
    const outwards = transactions.filter(t => t.type === 'OUT' && t.invoiceNo);
    
    const invoiceMap = new Map<string, any>();
    const transporters = new Set<string>();
    const sizes = new Set<string>();
    const customers = new Set<string>();

    // Seed customers from Master Data
    registeredCustomers.forEach(c => {
      if (c.name) customers.add(c.name);
    });

    // Also seed customers from finish goods
    finishGoods.forEach(fg => {
      if (fg.customerName) customers.add(fg.customerName);
    });

    outwards.forEach(tx => {
      if (tx.transporterName) transporters.add(tx.transporterName);
      if (tx.vehicleSize) sizes.add(tx.vehicleSize);

      if (!invoiceMap.has(tx.invoiceNo!)) {
        // Find customer name from finishGoods or rawData
        const fg = finishGoods.find(item => item.productId === tx.finishGoodId || item.id === tx.finishGoodId);
        const resolvedCustomer = fg?.customerName || (tx as any).raw_data?.customerName || (tx as any).customerName || 'Trading / Other Party';
        
        if (resolvedCustomer && resolvedCustomer !== 'Unknown') {
          customers.add(resolvedCustomer);
        }

        invoiceMap.set(tx.invoiceNo!, {
          id: tx.id, // Just using the first transaction's id as a key
          date: tx.date || tx.createdAt,
          invoiceNo: tx.invoiceNo,
          transporterName: tx.transporterName || '',
          customerName: resolvedCustomer,
          place: tx.place || '',
          vehicleNo: tx.vehicleNo || '',
          vehicleSize: tx.vehicleSize || '',
          freight: Number(tx.freight) || 0,
          holding: Number(tx.holding) || 0,
          point: Number(tx.point) || 0,
          others: Number(tx.others) || 0,
          totalFreight: (Number(tx.freight) || 0) + (Number(tx.holding) || 0) + (Number(tx.point) || 0) + (Number(tx.others) || 0),
          receivingStatus: tx.receivingStatus || 'PENDING',
          receivingConfirmedAt: tx.receivingConfirmedAt || null,
          receivingConfirmedBy: tx.receivingConfirmedBy || null
        });
      }
    });

    // Natural sort helper: extract the numeric invoice number so current/latest number stays on top
    const parseInvoiceNumber = (invStr: string) => {
      if (!invStr) return 0;
      const match = invStr.match(/(\d+)(?!.*\d)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const sortedInvoices = Array.from(invoiceMap.values()).sort((a, b) => {
      const numA = parseInvoiceNumber(a.invoiceNo || '');
      const numB = parseInvoiceNumber(b.invoiceNo || '');

      if (numA !== numB) {
        return numB - numA; // Higher/Current invoice number on top
      }

      const strCompare = (b.invoiceNo || '').localeCompare(a.invoiceNo || '', undefined, { numeric: true, sensitivity: 'base' });
      if (strCompare !== 0) return strCompare;

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return {
      uniqueInvoices: sortedInvoices,
      transporterOptions: Array.from(transporters).sort(),
      sizeOptions: Array.from(sizes).sort(),
      customerOptions: Array.from(customers).sort()
    };
  }, [transactions, finishGoods]);

  // Apply filters
  const filteredData = useMemo(() => {
    return uniqueInvoices.filter(item => {
      const searchStr = `${item.invoiceNo} ${item.transporterName} ${item.customerName} ${item.vehicleNo} ${item.place}`.toLowerCase();
      if (!searchStr.includes(search.toLowerCase())) return false;
      if (transporterFilter !== 'ALL' && item.transporterName !== transporterFilter) return false;
      if (sizeFilter !== 'ALL' && item.vehicleSize !== sizeFilter) return false;
      if (statusFilter !== 'ALL' && item.receivingStatus !== statusFilter) return false;
      return true;
    });
  }, [uniqueInvoices, search, transporterFilter, sizeFilter, statusFilter]);

  // Calculate overall total
  const overallTotalFreight = useMemo(() => {
    return filteredData.reduce((acc, curr) => acc + curr.totalFreight, 0);
  }, [filteredData]);

  const handleMarkReceived = async (invoiceNo: string) => {
    if (!window.confirm(`Mark Freight for Invoice ${invoiceNo} as RECEIVED?`)) return;
    try {
      await markFreightReceived(invoiceNo, user?.name || 'System');
      queryClient.invalidateQueries({ queryKey: ['finishGoodTransactions'] });
    } catch (error) {
      alert("Failed to mark as received.");
    }
  };

  const handleOpenAdd = () => {
    setSelectedFreightItem(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setSelectedFreightItem(item);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['finishGoodTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['finishGoods'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const generateTransporterLedgerPDF = () => {
    if (transporterFilter === 'ALL' || filteredData.length === 0) {
      alert("Please select a specific Transporter to generate the ledger.");
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });

    // HEADER
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("PACKWELL INDIA", 14, 20);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`TRANSPORTER NAME: ${transporterFilter}`, 14, 28);
    
    // TIMESTAMP
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy hh:mm a')}`, 14, 34);

    // TABLE HEADERS
    const tableHeaders = [
      "Date", "Invoice No", "Customer Name", "Place", 
      "Vehicle No", "Size", "Freight", "Holding", "Point", "Others", "Status", "Total"
    ];

    // TABLE DATA
    const tableData = filteredData.map(item => [
      item.date ? format(new Date(item.date), 'dd/MM/yy') : '-',
      item.invoiceNo,
      item.customerName,
      item.place,
      item.vehicleNo,
      item.vehicleSize,
      item.freight ? item.freight.toString() : '0',
      item.holding ? item.holding.toString() : '0',
      item.point ? item.point.toString() : '0',
      item.others ? item.others.toString() : '0',
      item.receivingStatus,
      item.totalFreight ? item.totalFreight.toString() : '0'
    ]);

    // Calculate totals
    const tFreight = filteredData.reduce((acc, curr) => acc + (curr.freight || 0), 0);
    const tHolding = filteredData.reduce((acc, curr) => acc + (curr.holding || 0), 0);
    const tPoint = filteredData.reduce((acc, curr) => acc + (curr.point || 0), 0);
    const tOthers = filteredData.reduce((acc, curr) => acc + (curr.others || 0), 0);
    const tTotal = filteredData.reduce((acc, curr) => acc + (curr.totalFreight || 0), 0);

    // Add totals row
    tableData.push([
      '', '', '', '', '', 'TOTALS:',
      tFreight.toString(),
      tHolding.toString(),
      tPoint.toString(),
      tOthers.toString(),
      '',
      tTotal.toString()
    ]);

    autoTable(doc, {
      startY: 40,
      head: [tableHeaders],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      willDrawCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          doc.setFont('helvetica', 'bold');
        }
      },
      didDrawPage: (data) => {
        const str = `Page ${(doc as any).internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 10);
      }
    });

    const safeName = transporterFilter.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = format(new Date(), 'dd-MM-yyyy');
    doc.save(`ledger_${safeName}_${dateStr}.pdf`);
  };

  const inputCls = "w-full text-sm rounded-lg border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-4 p-4 md:p-6 max-w-7xl mx-auto w-full">
      
      {/* Header & Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <Truck className="w-8 h-8 mr-3 text-primary" />
            Freight Charges & Logistics
          </h1>
          <p className="text-muted-foreground mt-1">Manage, update, and track vehicle freight & transporter bills</p>
        </div>
        
        <div className="flex justify-end items-center gap-3">
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3.5 py-2.5 rounded-xl flex items-center shadow-sm">
            <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full mr-2.5">
              <Truck className="w-4 h-4 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Vehicles</div>
              <div className="text-lg font-black text-blue-950 dark:text-blue-100">{new Set(filteredData.map(d => d.vehicleNo).filter(Boolean)).size}</div>
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-3.5 py-2.5 rounded-xl flex items-center shadow-sm">
            <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-full mr-2.5">
              <FileText className="w-4 h-4 text-purple-700 dark:text-purple-300" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wider">Bills</div>
              <div className="text-lg font-black text-purple-950 dark:text-purple-100">{new Set(filteredData.map(d => d.invoiceNo).filter(Boolean)).size}</div>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/20 px-4 py-2.5 rounded-xl flex items-center shadow-sm">
            <div className="bg-primary/20 p-2 rounded-full mr-2.5">
              <CircleDollarSign className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Total Freight</div>
              <div className="text-lg font-black text-primary">₹{overallTotalFreight.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-card border border-border shadow-sm rounded-xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Invoice, Transporter, Customer..." 
              className={`${inputCls} pl-9`}
            />
          </div>
          
          <select 
            value={transporterFilter}
            onChange={(e) => setTransporterFilter(e.target.value)}
            className={`${inputCls} w-full sm:w-48`}
          >
            <option value="ALL">All Transporters ({transporterOptions.length})</option>
            {transporterOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${inputCls} w-full sm:w-36`}
          >
            <option value="ALL">All Status</option>
            <option value="PENDING">PENDING</option>
            <option value="RECEIVED">RECEIVED</option>
          </select>

          <select 
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            className={`${inputCls} w-full sm:w-40`}
          >
            <option value="ALL">All Vehicle Sizes</option>
            {sizeOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end">
          {/* Add New Vehicle / Bill Button */}
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg shadow-sm hover:bg-primary/90 transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Vehicle / Freight Bill
          </button>

          {transporterFilter !== 'ALL' && (
            <button
              onClick={generateTransporterLedgerPDF}
              className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-semibold text-foreground bg-muted border border-border rounded-lg shadow-sm hover:bg-muted/80 transition-colors focus:outline-none whitespace-nowrap"
            >
              <Truck className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Transporter Ledger
            </button>
          )}

          <ExportButtons 
            data={filteredData} 
            filenamePrefix="FreightCharges"
            title="Freight Charges Report"
            columnMap={{
              'date': 'Date',
              'invoiceNo': 'Invoice No',
              'transporterName': 'Transporter',
              'customerName': 'Customer',
              'place': 'Place',
              'vehicleNo': 'Vehicle No',
              'vehicleSize': 'Vehicle Size',
              'freight': 'Freight (₹)',
              'holding': 'Holding (₹)',
              'point': 'Point (₹)',
              'others': 'Others (₹)',
              'totalFreight': 'Total Freight (₹)',
              'receivingStatus': 'Status'
            }}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-card border border-border shadow-sm rounded-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading freight records...</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Invoice No</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Transporter</th>
                  <th className="px-4 py-3 font-medium">Place</th>
                  <th className="px-4 py-3 font-medium">Vehicle Info</th>
                  <th className="px-4 py-3 font-medium text-right">Freight</th>
                  <th className="px-4 py-3 font-medium text-right">Holding</th>
                  <th className="px-4 py-3 font-medium text-right">Point</th>
                  <th className="px-4 py-3 font-medium text-right">Others</th>
                  <th className="px-4 py-3 font-medium text-right text-primary">Total</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50 transition-colors bg-card">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {item.invoiceNo}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.customerName}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {item.transporterName || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.place || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{item.vehicleNo || '-'}</div>
                      <div className="text-xs text-muted-foreground">{item.vehicleSize || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.freight ? `₹${item.freight.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">
                      {item.holding ? `₹${item.holding.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-purple-700 dark:text-purple-400">
                      {item.point ? `₹${item.point.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.others ? `₹${item.others.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-primary text-base">
                      ₹{item.totalFreight.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-full border ${item.receivingStatus === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'}`}>
                        {item.receivingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="Edit Freight & Vehicle Details"
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Mark OK Button */}
                        {item.receivingStatus === 'PENDING' ? (
                          <button
                            onClick={() => handleMarkReceived(item.invoiceNo)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                            title="Mark as Received / OK"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            OK
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground leading-tight" title={`Confirmed by ${item.receivingConfirmedBy}`}>
                            OK
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-6 py-12 text-center text-muted-foreground">
                      No freight records found for the current search/filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit / Add Freight Modal */}
      <FreightModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        initialData={selectedFreightItem}
        transporterOptions={transporterOptions}
        sizeOptions={sizeOptions}
        customerOptions={customerOptions}
      />

    </div>
  );
}

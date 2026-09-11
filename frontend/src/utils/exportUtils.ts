import * as XLSX from 'xlsx';
import { type PurchaseOrder, getPurchaseOrderBalance } from '../lib/supabase/purchaseOrderService';

/**
 * Export Purchase Orders to an Excel file
 * @param poList The filtered list of POs to export
 */
export const exportPurchaseOrdersToExcel = (poList: PurchaseOrder[]) => {
  // Format the data for Excel
  const excelData = poList.map((po, index) => ({
    'S.No': index + 1,
    'PO No.': po.poNo,
    'PO Date': po.poDate,
    'Delivery Date': po.deliveryDate,
    'Customer Name': po.customerName,
    'Consignee': po.consignee || '',
    'Item Name': po.productName,
    'Artwork No': po.artworkNo || '',
    'Size': po.size,
    'Rate (₹)': Number(Number(po.rate || 0).toFixed(3)),
    'OPN QTY': po.orderQty,
    'IN QTY': po.inQty || 0,
    'OUT QTY': po.outQty || 0,
    'Closing Bal': getPurchaseOrderBalance(po),
    'Value (₹)': Math.round((getPurchaseOrderBalance(po)) * (po.rate || 0)),
    'Status': po.status,
  }));

  // Create worksheet and workbook
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();

  // Add some styling/column widths
  const colWidths = [
    { wch: 6 },   // S.No
    { wch: 15 },  // PO No.
    { wch: 12 },  // PO Date
    { wch: 12 },  // Delivery Date
    { wch: 25 },  // Customer Name
    { wch: 20 },  // Consignee
    { wch: 30 },  // Item Name
    { wch: 15 },  // Artwork No
    { wch: 20 },  // Size
    { wch: 10 },  // Rate
    { wch: 10 },  // OPN QTY
    { wch: 10 },  // IN QTY
    { wch: 10 },  // OUT QTY
    { wch: 12 },  // Closing Bal
    { wch: 15 },  // Value
    { wch: 12 },  // Status
  ];
  worksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Orders');

  // Generate filename with current date
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Purchase_Orders_Export_${dateStr}.xlsx`;

  // Trigger download
  XLSX.writeFile(workbook, filename);
};

/**
 * Generate and download a blank PO import template
 */
export const downloadPOTemplate = () => {
  // Define the headers based on the current system requirements
  const headers = [
    'PO NO',
    'PO DATE',
    'DELIVERY DATE',
    'CUSTOMER',
    'ITEM',
    'RATE',
    'OPN QTY'
  ];

  // Provide one sample row to help the user understand the format
  const sampleRow = [
    'PO-2026-001',
    '2026-08-28',
    '2026-09-15',
    'PACKWELL INDIA',
    '01W4003',
    '5.50',
    '5000'
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const workbook = XLSX.utils.book_new();

  // Make columns wider for readability
  const colWidths = [
    { wch: 15 }, // PO NO
    { wch: 12 }, // PO DATE
    { wch: 15 }, // DELIVERY DATE
    { wch: 25 }, // CUSTOMER
    { wch: 25 }, // ITEM
    { wch: 10 }, // RATE
    { wch: 12 }, // OPN QTY
  ];
  worksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'PO_Template');
  XLSX.writeFile(workbook, 'Bulk_PO_Import_Template.xlsx');
};

export interface ItemLedgerExcelRow {
  date: string;
  type: string;
  poNo: string;
  invoiceNo: string;
  customerName: string;
  inQty: number;
  outQty: number;
  balance: number;
  rate?: number;
  remarks: string;
}

/**
 * Export an Item's Complete PO In & Dispatch Out Ledger to Excel
 */
export const exportItemLedgerToExcel = (
  itemName: string,
  artworkNo: string | undefined,
  rows: ItemLedgerExcelRow[]
) => {
  const excelData = rows.map((r, idx) => ({
    'S.No': idx + 1,
    'Date': r.date,
    'Type': r.type,
    'PO No.': r.poNo,
    'Invoice No.': r.invoiceNo,
    'Customer / Party': r.customerName,
    'IN Qty (+)': r.inQty > 0 ? r.inQty : 0,
    'OUT Qty (-)': r.outQty > 0 ? r.outQty : 0,
    'Running Balance': r.balance,
    'Rate (₹)': r.rate !== undefined ? Number(Number(r.rate).toFixed(3)) : '',
    'Remarks / Vehicle': r.remarks || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [
    { wch: 6 },   // S.No
    { wch: 12 },  // Date
    { wch: 16 },  // Type
    { wch: 16 },  // PO No.
    { wch: 18 },  // Invoice No.
    { wch: 26 },  // Customer
    { wch: 14 },  // IN Qty
    { wch: 14 },  // OUT Qty
    { wch: 16 },  // Running Balance
    { wch: 10 },  // Rate
    { wch: 35 },  // Remarks
  ];

  const safeName = (itemName || 'Item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Ledger');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${safeName}_Ledger_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
};


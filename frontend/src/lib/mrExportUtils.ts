import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as xlsx from 'xlsx-js-style';

export interface MRExpenseItem {
  name: string;
  amount: number;
}

export interface SalaryBreakdownItem {
  employeeCode?: string | number;
  employeeName: string;
  category?: string;
  contractorName?: string;
  designation?: string;
  presentDays: number;
  perDayAmount: number;
  dayAmount: number;
  otHours: number;
  otAmount: number;
  refreshment: number;
  total: number;
}

export interface FreightBreakdownItem {
  date: string;
  invoiceNo: string;
  vehicleNo: string;
  customerName: string;
  transporterName?: string;
  freight: number;
  holding: number;
  point: number;
  others: number;
  total: number;
}

export interface RmBreakdownExportItem {
  date: string;
  materialName: string;
  unit: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  referenceNo?: string;
  remarks?: string;
}

export interface CashLedgerExportItem {
  date: string;
  expenseHead: string;
  narration?: string;
  voucherNo?: string;
  paymentMode: string;
  amount: number;
  partyName?: string;
}

export interface ExpenseDetailItem {
  date: string;
  voucherNo?: string;
  narration?: string;
  paymentMode?: string;
  amount: number;
  materialName?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  referenceNo?: string;
  remarks?: string;
}

export interface ExpenseSheetData {
  expenseName: string;
  sheetName: string;
  totalAmount: number;
  type: 'CASH_LEDGER' | 'RM_BREAKDOWN';
  items: ExpenseDetailItem[];
}

export interface MRExportParams {
  monthFormattedTitle: string;
  paperStats: Record<string, { opnQty: number; opnAmt: number; purQty: number; purAmt: number; conQty: number; conAmt: number; cloQty: number; cloAmt: number }>;
  paperTotals: { opnQty: number; opnAmt: number; purQty: number; purAmt: number; conQty: number; conAmt: number; cloQty: number; cloAmt: number };
  visibleSaleParties: string[];
  manualData: Record<string, number>;
  cashScrapRevenue: number;
  tallyDataWOGST: number;
  tallyDataWGST: number;
  creditNoteWOGST: number;
  creditNoteWGST: number;
  netSaleWithoutGST: number;
  netSaleWithGST: number;
  paperUsedWOGST: number;
  paperUsedWGST: number;
  partyPurchases: Array<{ party: string; purWOGST: number; purWGST: number; diffWOGST: number; diffWGST: number }>;
  scrapCashPurWOGST: number;
  scrapCashPurWGST: number;
  scrapCashDiffWOGST: number;
  scrapCashDiffWGST: number;
  gTotalPurchaseWOGST: number;
  gTotalPurchaseWGST: number;
  grandDiffWOGST: number;
  grandDiffWGST: number;
  visibleExpenses: string[];
  expenseBreakup?: MRExpenseItem[];
  kraftPurchaseWOGST?: number;
  kraftPurchaseWGST?: number;
  consumablePurchaseWOGST?: number;
  consumablePurchaseWGST?: number;
  currentMonthPurchaseWOGST?: number;
  currentMonthPurchaseWGST?: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercent: string;
  fgStockValue: number;
  nonMovingStockValue: number;
  wipStockValue: number;
  paperStockValue: number;
  rmStockValue: number;
  grandTotalStock: number;
  // Annexure Breakdown data
  salaryBreakdown?: SalaryBreakdownItem[];
  freightBreakdown?: FreightBreakdownItem[];
  consumableBreakdown?: RmBreakdownExportItem[];
  lpgBreakdown?: RmBreakdownExportItem[];
  cashLedgerEntries?: CashLedgerExportItem[];
  // Individual Expense Detail Sheets
  expenseSheets?: ExpenseSheetData[];
}

const fmt = (val: number) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

const fmtDiff = (val: number) => {
  if (isNaN(val) || val === 0) return '0';
  if (val < 0) return `(${Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })})`;
  return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

/**
 * Triggers a file download using a Blob Object URL with a long lifetime.
 * Libraries like jsPDF and SheetJS internally revoke URLs after 100ms,
 * which causes Windows Chrome to lose the filename and save files as UUIDs.
 * Data URLs are blocked by Chrome security.
 * Keeping the Object URL alive for 2 minutes guarantees proper filename and extension preservation.
 */
export const downloadBlobFile = (blob: Blob, filename: string) => {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.setAttribute('download', filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (a.parentNode) {
          document.body.removeChild(a);
        }
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 120000);
  } catch (err) {
    console.error('Download error:', err);
  }
};

/**
 * Build the jsPDF document object with complete P&L formatting
 */
export const buildMRPDFDoc = (params: MRExportParams): jsPDF => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Header Banner
  doc.setFillColor(30, 58, 138); // Deep Navy Blue #1e3a8a
  doc.roundedRect(10, 8, pageWidth - 20, 13, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`PROFIT & LOSS REPORT FOR THE M/O ${params.monthFormattedTitle.toUpperCase()}`, pageWidth / 2, 14.5, { align: 'center' });
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(219, 234, 254);
  doc.text('PACKWELL INDIA  |  EXECUTIVE STATEMENT', pageWidth / 2, 18.5, { align: 'center' });

  // 2. Table 1: Paper Inventory
  const paperRows = Object.entries(params.paperStats).map(([type, s]) => [
    type,
    fmt(s.opnQty),
    fmt(s.opnAmt),
    fmt(s.purQty),
    fmt(s.purAmt),
    fmt(s.conQty),
    fmt(s.conAmt),
    fmt(s.cloQty),
    fmt(s.cloAmt)
  ]);

  const paperTotalsRow = [
    'TOTAL',
    fmt(params.paperTotals.opnQty),
    fmt(params.paperTotals.opnAmt),
    fmt(params.paperTotals.purQty),
    fmt(params.paperTotals.purAmt),
    fmt(params.paperTotals.conQty),
    fmt(params.paperTotals.conAmt),
    fmt(params.paperTotals.cloQty),
    fmt(params.paperTotals.cloAmt)
  ];

  autoTable(doc, {
    startY: 24,
    margin: { left: 10, right: 10 },
    head: [
      [
        { content: 'PAPER', rowSpan: 2, styles: { halign: 'left', valign: 'middle', fillColor: [241, 245, 249] } },
        { content: 'OPENING', colSpan: 2, styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: 'PURCHASE', colSpan: 2, styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: 'CONSUMPTION', colSpan: 2, styles: { halign: 'center', fillColor: [224, 231, 255] } },
        { content: 'CLOSING', colSpan: 2, styles: { halign: 'center', fillColor: [241, 245, 249] } }
      ],
      [
        'Opn Stock (kg)', 'Opn Amt (Rs)',
        'Purchase Qty', 'Purchase Amt',
        'Consumption Qty', 'Consumption Amt',
        'Closing Qty', 'Closing Amt'
      ]
    ],
    body: paperRows,
    foot: [paperTotalsRow],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6, halign: 'center' },
    footStyles: { fillColor: [254, 240, 138], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 6.5 }
  });

  const nextY = (doc as any).lastAutoTable.finalY + 2;
  const leftColWidth = 105;
  const rightColX = 120;

  // ================= LEFT COLUMN =================

  // 3A. Left Table 1: Revenue & Sales
  const salesRows: any[] = params.visibleSaleParties.map(p => [
    p,
    fmt(params.manualData[`SALE:${p}:WOGST`] || 0),
    fmt(params.manualData[`SALE:${p}:WGST`] || 0)
  ]);

  salesRows.push(
    ['SCRAP (CASH)', fmt(params.cashScrapRevenue), fmt(params.cashScrapRevenue)],
    ['TALLY DATA', fmt(params.tallyDataWOGST), fmt(params.tallyDataWGST)],
    ['CREDIT NOTE', fmt(params.creditNoteWOGST), fmt(params.creditNoteWGST)]
  );

  const salesFoot = [
    ['NETT SALE', fmt(params.netSaleWithoutGST), fmt(params.netSaleWithGST)]
  ];

  autoTable(doc, {
    startY: nextY,
    margin: { left: 10, right: pageWidth - 10 - leftColWidth },
    head: [
      [{ content: 'TOTAL SALE', colSpan: 3, styles: { halign: 'center', fillColor: [0, 229, 255], textColor: [15, 23, 42], fontStyle: 'bold' } }],
      ['Party / Category', 'Without GST', 'With GST']
    ],
    body: salesRows,
    foot: salesFoot,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 30 }
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6, halign: 'center' },
    footStyles: { fillColor: [254, 240, 138], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 6.5 }
  });

  let leftFinalY = (doc as any).lastAutoTable.finalY;

  // 3B. Current Month Purchase (Matching Profit & Loss Detailed UI)
  const kraftWOGST = params.kraftPurchaseWOGST || 0;
  const kraftWGST = params.kraftPurchaseWGST || 0;
  const consWOGST = params.consumablePurchaseWOGST || 0;
  const consWGST = params.consumablePurchaseWGST || 0;
  const totalPurWOGST = params.currentMonthPurchaseWOGST !== undefined && params.currentMonthPurchaseWOGST !== 0
    ? params.currentMonthPurchaseWOGST
    : (kraftWOGST + consWOGST);
  const totalPurWGST = params.currentMonthPurchaseWGST !== undefined && params.currentMonthPurchaseWGST !== 0
    ? params.currentMonthPurchaseWGST
    : (kraftWGST + consWGST);

  autoTable(doc, {
    startY: leftFinalY + 1.5,
    margin: { left: 10, right: pageWidth - 10 - leftColWidth },
    head: [
      [{ content: 'CURRENT MONTH PURCHASE', colSpan: 3, styles: { halign: 'center', fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 6 } }],
      ['Particulars', 'Without GST', 'With GST']
    ],
    body: [
      ['Kraft Paper Purchase', fmt(kraftWOGST), fmt(kraftWGST)],
      ['Other Consumable Goods Purchase', fmt(consWOGST), fmt(consWGST)]
    ],
    foot: [
      ['TOTAL CURRENT MONTH PURCHASE', fmt(totalPurWOGST), fmt(totalPurWGST)]
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 30 }
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6, halign: 'center' },
    footStyles: { fillColor: [254, 240, 138], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 6.5 }
  });
  leftFinalY = (doc as any).lastAutoTable.finalY;

  // 3C. Stock Valuation Table below Sales & Purchases (Matching Profit & Loss Detailed UI)
  const semiKraftStock = params.paperStats['Semi Kraft']?.cloAmt || 0;
  const virginKraftStock = params.paperStats['Virgin Kraft']?.cloAmt || 0;
  const duplexStock = params.paperStats['Chennai']?.cloAmt || 0;
  const othersStock = params.paperStats['Others']?.cloAmt || 0;

  const stockRows = [
    ['Finished Goods Inventory (Closing)', fmt(params.fgStockValue)],
    ['Slow-Moving / Obsolete Inventory', fmt(params.nonMovingStockValue)],
    ['Work in Process Inventory (Closing)', fmt(params.wipStockValue)],
    ['Raw Material: Semi Kraft Paper', fmt(semiKraftStock)],
    ['Raw Material: Virgin Kraft Paper', fmt(virginKraftStock)],
    ['Raw Material: Duplex Paper', fmt(duplexStock)],
    ['Raw Material: Others Paper', fmt(othersStock)],
    ['Other Raw Materials & Consumables', fmt(params.rmStockValue)]
  ];

  autoTable(doc, {
    startY: leftFinalY + 1.5,
    margin: { left: 10, right: pageWidth - 10 - leftColWidth },
    head: [
      [{ content: 'INVENTORY ASSET VALUATION', colSpan: 2, styles: { halign: 'center', fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' } }],
      ['Category / Asset', 'Amount (Rs)']
    ],
    body: stockRows,
    foot: [['Grand Total Stock Valuation', fmt(params.grandTotalStock)]],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 65 },
      1: { halign: 'right', cellWidth: 40 }
    },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 6 },
    footStyles: { fillColor: [220, 252, 231], textColor: [22, 101, 52], fontStyle: 'bold', fontSize: 6.5 }
  });

  // ================= RIGHT COLUMN =================

  // 4A. Right Table 1: Purchase & Sister Reconciliation Matrix
  const reconRows: any[] = [
    ['Paper Used', fmt(params.paperUsedWOGST), fmt(params.paperUsedWGST), '--', '--'],
    ...params.partyPurchases.map(p => [
      p.party,
      fmt(p.purWOGST),
      fmt(p.purWGST),
      fmtDiff(p.diffWOGST),
      fmtDiff(p.diffWGST)
    ]),
    ['SCRAP(CASH)', fmt(params.scrapCashPurWOGST), fmt(params.scrapCashPurWGST), fmt(params.scrapCashDiffWOGST), fmt(params.scrapCashDiffWGST)]
  ];

  const reconFoot = [
    [
      'G. TOTAL PURCHASE',
      fmt(params.gTotalPurchaseWOGST),
      fmt(params.gTotalPurchaseWGST),
      fmt(params.grandDiffWOGST),
      fmt(params.grandDiffWGST)
    ]
  ];

  autoTable(doc, {
    startY: nextY,
    margin: { left: rightColX, right: 10 },
    head: [
      [
        { content: 'PURCHASE & SISTER RECONCILIATION MATRIX', colSpan: 5, styles: { halign: 'center', fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' } }
      ],
      [
        { content: 'Item / Concern', styles: { halign: 'left' } },
        { content: 'Purchase (W/o)', styles: { halign: 'right' } },
        { content: 'Purchase (With)', styles: { halign: 'right' } },
        { content: 'Diff (W/o GST)', styles: { halign: 'right', fillColor: [238, 242, 255] } },
        { content: 'Diff (With GST)', styles: { halign: 'right', fillColor: [238, 242, 255] } }
      ]
    ],
    body: reconRows,
    foot: reconFoot,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 47 },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 }
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6, halign: 'center' },
    footStyles: { fillColor: [254, 240, 138], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 6.5 }
  });

  let rightFinalY = (doc as any).lastAutoTable.finalY;

  // 4B. Right Table 2: Operational Expenses Breakup Table (Matching Profit & Loss UI)
  const expensesList: MRExpenseItem[] = (params.expenseBreakup && params.expenseBreakup.length > 0)
    ? params.expenseBreakup
    : params.visibleExpenses.map(exp => ({
        name: exp,
        amount: params.manualData[`EXP:${exp}`] || 0
      }));

  // Build paired 2-column expense grid rows (4 columns: Category, Amount, Category, Amount)
  const expenseGridRows: any[] = [];
  if (expensesList.length === 0) {
    expenseGridRows.push(['No operational expenses recorded', '', '', '']);
  } else {
    for (let i = 0; i < expensesList.length; i += 2) {
      const it1 = expensesList[i];
      const it2 = expensesList[i + 1];
      expenseGridRows.push([
        it1.name,
        fmt(it1.amount),
        it2 ? it2.name : '',
        it2 ? fmt(it2.amount) : ''
      ]);
    }
  }

  autoTable(doc, {
    startY: rightFinalY + 1.5,
    margin: { left: rightColX, right: 10 },
    head: [
      [
        { content: `OPERATIONAL EXPENSES  (Total: Rs. ${fmt(params.totalExpenses)})`, colSpan: 4, styles: { halign: 'center', fillColor: [225, 29, 72], textColor: 255, fontStyle: 'bold' } }
      ],
      [
        { content: 'Category / Particular', styles: { halign: 'left' } },
        { content: 'Amount (Rs)', styles: { halign: 'right' } },
        { content: 'Category / Particular', styles: { halign: 'left' } },
        { content: 'Amount (Rs)', styles: { halign: 'right' } }
      ]
    ],
    body: expenseGridRows,
    foot: [
      [
        { content: 'TOTAL OPERATIONAL EXPENSES', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `Rs. ${fmt(params.totalExpenses)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 5.5, cellPadding: 0.8, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 51 },
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'left', fontStyle: 'bold', cellWidth: 51 },
      3: { halign: 'right', cellWidth: 33 }
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6, halign: 'center' },
    footStyles: { fillColor: [255, 228, 230], textColor: [159, 18, 57], fontStyle: 'bold', fontSize: 6.5 }
  });

  rightFinalY = (doc as any).lastAutoTable.finalY;

  // 4C. Right Table 3: Profit & Loss Final Summary & Net Profit
  autoTable(doc, {
    startY: rightFinalY + 1.5,
    margin: { left: rightColX, right: 10 },
    head: [
      [
        { content: `PROFIT & LOSS SUMMARY - ${params.monthFormattedTitle.toUpperCase()}`, colSpan: 2, styles: { halign: 'center', fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' } }
      ]
    ],
    body: [
      ['Gross Difference (Nett Sale - G. Total Purchase)', `Rs. ${fmt(params.grandDiffWOGST)}`],
      ['Less: Total Operational Expenses', `(-) Rs. ${fmt(params.totalExpenses)}`]
    ],
    foot: [
      [
        { content: `NET PROFIT  (${params.profitMarginPercent}% Margin)`, styles: { halign: 'left', fontStyle: 'bold', fontSize: 7 } },
        { content: `Rs. ${fmt(params.netProfit)}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5 } }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 105 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 62 }
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 6 },
    footStyles: params.netProfit >= 0
      ? { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' }
      : { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold' }
  });

  return doc;
};

/**
 * Download the Profit & Loss PDF report as a .pdf file using a binary Blob
 */
export const exportMRToPDF = (params: MRExportParams) => {
  const doc = buildMRPDFDoc(params);
  const cleanTitle = (params.monthFormattedTitle || 'Report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Profit_Loss_Report_${cleanTitle}_${dateStr}.pdf`;

  const blob = doc.output('blob');
  downloadBlobFile(blob, filename);
};

/**
 * Open the Profit & Loss PDF in a new tab for instant viewing/printing
 */
export const previewMRPDF = (params: MRExportParams) => {
  const doc = buildMRPDFDoc(params);
  const dataUri = doc.output('datauristring');
  const win = window.open('');
  if (win) {
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Profit & Loss Report - ${params.monthFormattedTitle}</title>
          <style>body,html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #334155; }</style>
        </head>
        <body>
          <iframe src="${dataUri}" frameborder="0" style="width:100%; height:100%; border:none;"></iframe>
        </body>
      </html>
    `);
    win.document.close();
  } else {
    exportMRToPDF(params);
  }
};

/**
 * Helper to build styled cells for xlsx-js-style
 */
const createCell = (value: any, style?: any, numFmt?: string) => {
  const cell: any = {};
  if (value === null || value === undefined || value === '') {
    cell.t = 's';
    cell.v = '';
  } else if (typeof value === 'number') {
    cell.t = 'n';
    cell.v = value;
    cell.z = numFmt || '#,##0';
  } else if (typeof value === 'boolean') {
    cell.t = 'b';
    cell.v = value;
  } else {
    cell.t = 's';
    cell.v = String(value);
  }

  if (style) {
    cell.s = style;
  }
  return cell;
};

// Common styling definitions
const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const BORDER_DOUBLE_BOTTOM = {
  top: { style: 'thin', color: { rgb: '94A3B8' } },
  bottom: { style: 'double', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const STYLES = {
  titleBanner: {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A8A' } }, // Deep Navy #1e3a8a
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  subBanner: {
    font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: 'DBEAFE' } },
    fill: { fgColor: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  boxHeader: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E293B' } }, // Slate 800
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_THIN,
  },
  expenseHeader: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'E11D48' } }, // Rose 600
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_THIN,
  },
  profitHeader: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } }, // Slate 900
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_THIN,
  },
  th: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER_THIN,
  },
  thCenter: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER_THIN,
  },
  thLeft: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_THIN,
  },
  thRight: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_THIN,
  },
  tdLeft: {
    font: { name: 'Calibri', sz: 9.5, bold: false, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_THIN,
  },
  tdRight: {
    font: { name: 'Calibri', sz: 9.5, bold: false, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_THIN,
  },
  tdCenter: {
    font: { name: 'Calibri', sz: 9.5, bold: false, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_THIN,
  },
  totalLeft: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  totalRight: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  netProfit: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '15803D' } }, // Green 700
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  netProfitLabel: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '15803D' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  netLoss: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'BE123C' } }, // Red 700
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  netLossLabel: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'BE123C' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  annexureTitle: {
    font: { name: 'Calibri', sz: 11.5, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_THIN,
  },
  annexureTotalLeft: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E3A8A' } },
    fill: { fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  annexureTotalRight: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E3A8A' } },
    fill: { fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  },
  link: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '1D4ED8' }, underline: true },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_THIN,
  },
  backLink: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1D4ED8' }, underline: true },
    fill: { fgColor: { rgb: 'EFF6FF' } }, // Light blue background
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_THIN,
  },
};

/**
 * Generate formatted Excel matching the PDF 2-column balanced layout with individual linked Expense sheets
 */
export const exportMRToExcel = (params: MRExportParams) => {
  const xlsxLib: any = (xlsx as any).default || xlsx;
  const wb = xlsxLib.utils.book_new();

  // Map each expense to its sheet configuration
  const sheetMap = new Map<string, ExpenseSheetData>();
  (params.expenseSheets || []).forEach(sh => {
    sheetMap.set(sh.expenseName.toLowerCase().trim(), sh);
  });

  // =========================================================================
  // SHEET 1: Profit_Loss_Statement (PDF Parallel Box Alignment)
  // Columns: A(0), B(1), C(2) | D(3: Spacer) | E(4), F(5), G(6), H(7), I(8)
  // =========================================================================
  const wsMain: xlsx.WorkSheet = {};
  const mainMerges: xlsx.Range[] = [];
  let maxMainRow = 0;

  const setMainCell = (r: number, c: number, value: any, style?: any, numFmt?: string) => {
    const ref = xlsxLib.utils.encode_cell({ r, c });
    wsMain[ref] = createCell(value, style, numFmt);
    if (r > maxMainRow) maxMainRow = r;
  };

  const mergeMainCells = (startR: number, startC: number, endR: number, endC: number, value?: any, style?: any, numFmt?: string) => {
    mainMerges.push({ s: { r: startR, c: startC }, e: { r: endR, c: endC } });
    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        if (r === startR && c === startC) {
          setMainCell(r, c, value, style, numFmt);
        } else {
          setMainCell(r, c, '', style);
        }
      }
    }
  };

  // 1. Title Banner
  mergeMainCells(0, 0, 0, 8, `PROFIT & LOSS REPORT FOR THE M/O ${params.monthFormattedTitle.toUpperCase()}`, STYLES.titleBanner);
  mergeMainCells(1, 0, 1, 8, 'PACKWELL INDIA  |  EXECUTIVE STATEMENT', STYLES.subBanner);

  // 2. Table 1: Paper Inventory Table
  mergeMainCells(3, 0, 3, 8, 'PAPER INVENTORY & CONSUMPTION (KG & INR)', STYLES.boxHeader);

  // Multi-level Header
  mergeMainCells(4, 0, 5, 0, 'PAPER', STYLES.thLeft);
  mergeMainCells(4, 1, 4, 2, 'OPENING STOCK', STYLES.th);
  mergeMainCells(4, 3, 4, 4, 'PURCHASE', STYLES.th);
  mergeMainCells(4, 5, 4, 6, 'CONSUMPTION', STYLES.th);
  mergeMainCells(4, 7, 4, 8, 'CLOSING STOCK', STYLES.th);

  setMainCell(5, 1, 'Qty (kg)', STYLES.thRight);
  setMainCell(5, 2, 'Amt (Rs)', STYLES.thRight);
  setMainCell(5, 3, 'Qty (kg)', STYLES.thRight);
  setMainCell(5, 4, 'Amt (Rs)', STYLES.thRight);
  setMainCell(5, 5, 'Qty (kg)', STYLES.thRight);
  setMainCell(5, 6, 'Amt (Rs)', STYLES.thRight);
  setMainCell(5, 7, 'Qty (kg)', STYLES.thRight);
  setMainCell(5, 8, 'Amt (Rs)', STYLES.thRight);

  let paperRowIdx = 6;
  Object.entries(params.paperStats).forEach(([type, s]) => {
    setMainCell(paperRowIdx, 0, type, STYLES.tdLeft);
    setMainCell(paperRowIdx, 1, s.opnQty, STYLES.tdRight);
    setMainCell(paperRowIdx, 2, s.opnAmt, STYLES.tdRight);
    setMainCell(paperRowIdx, 3, s.purQty, STYLES.tdRight);
    setMainCell(paperRowIdx, 4, s.purAmt, STYLES.tdRight);
    setMainCell(paperRowIdx, 5, s.conQty, STYLES.tdRight);
    setMainCell(paperRowIdx, 6, s.conAmt, STYLES.tdRight);
    setMainCell(paperRowIdx, 7, s.cloQty, STYLES.tdRight);
    setMainCell(paperRowIdx, 8, s.cloAmt, STYLES.tdRight);
    paperRowIdx++;
  });

  // Paper Totals Row
  setMainCell(paperRowIdx, 0, 'TOTAL', STYLES.totalLeft);
  setMainCell(paperRowIdx, 1, params.paperTotals.opnQty, STYLES.totalRight);
  setMainCell(paperRowIdx, 2, params.paperTotals.opnAmt, STYLES.totalRight);
  setMainCell(paperRowIdx, 3, params.paperTotals.purQty, STYLES.totalRight);
  setMainCell(paperRowIdx, 4, params.paperTotals.purAmt, STYLES.totalRight);
  setMainCell(paperRowIdx, 5, params.paperTotals.conQty, STYLES.totalRight);
  setMainCell(paperRowIdx, 6, params.paperTotals.conAmt, STYLES.totalRight);
  setMainCell(paperRowIdx, 7, params.paperTotals.cloQty, STYLES.totalRight);
  setMainCell(paperRowIdx, 8, params.paperTotals.cloAmt, STYLES.totalRight);

  // 3. Side-by-Side 2-Column Boxes (Starting below Paper Table)
  const boxStartRow = paperRowIdx + 2;
  let leftCur = boxStartRow;
  let rightCur = boxStartRow;

  // -------------------------------------------------------------
  // LEFT SIDE (Columns A to C: 0, 1, 2)
  // -------------------------------------------------------------

  // Box L1: TOTAL SALE SUMMARY
  mergeMainCells(leftCur, 0, leftCur, 2, 'TOTAL SALE SUMMARY', STYLES.boxHeader);
  leftCur++;
  setMainCell(leftCur, 0, 'Party / Particular', STYLES.thLeft);
  setMainCell(leftCur, 1, 'Without GST (Rs)', STYLES.thRight);
  setMainCell(leftCur, 2, 'With GST (Rs)', STYLES.thRight);
  leftCur++;

  params.visibleSaleParties.forEach(p => {
    const saleWOGST = params.manualData[`SALE:${p}:WOGST`] || 0;
    const saleWGST = params.manualData[`SALE:${p}:WGST`] || 0;
    setMainCell(leftCur, 0, p, STYLES.tdLeft);
    setMainCell(leftCur, 1, saleWOGST, STYLES.tdRight);
    setMainCell(leftCur, 2, saleWGST, STYLES.tdRight);
    leftCur++;
  });

  // Scrap, Tally, Credit Note
  setMainCell(leftCur, 0, 'SCRAP (CASH)', STYLES.tdLeft);
  setMainCell(leftCur, 1, params.cashScrapRevenue, STYLES.tdRight);
  setMainCell(leftCur, 2, params.cashScrapRevenue, STYLES.tdRight);
  leftCur++;

  setMainCell(leftCur, 0, 'TALLY DATA', STYLES.tdLeft);
  setMainCell(leftCur, 1, params.tallyDataWOGST, STYLES.tdRight);
  setMainCell(leftCur, 2, params.tallyDataWGST, STYLES.tdRight);
  leftCur++;

  setMainCell(leftCur, 0, 'CREDIT NOTE', STYLES.tdLeft);
  setMainCell(leftCur, 1, params.creditNoteWOGST, STYLES.tdRight);
  setMainCell(leftCur, 2, params.creditNoteWGST, STYLES.tdRight);
  leftCur++;

  // Nett Sale Total Row
  setMainCell(leftCur, 0, 'NETT SALE', STYLES.totalLeft);
  setMainCell(leftCur, 1, params.netSaleWithoutGST, STYLES.totalRight);
  setMainCell(leftCur, 2, params.netSaleWithGST, STYLES.totalRight);
  leftCur += 2; // Spacer

  // Box L2: CURRENT MONTH PURCHASE
  const kraftWOGST = params.kraftPurchaseWOGST || 0;
  const kraftWGST = params.kraftPurchaseWGST || 0;
  const consWOGST = params.consumablePurchaseWOGST || 0;
  const consWGST = params.consumablePurchaseWGST || 0;
  const totalPurWOGST = params.currentMonthPurchaseWOGST !== undefined && params.currentMonthPurchaseWOGST !== 0
    ? params.currentMonthPurchaseWOGST
    : (kraftWOGST + consWOGST);
  const totalPurWGST = params.currentMonthPurchaseWGST !== undefined && params.currentMonthPurchaseWGST !== 0
    ? params.currentMonthPurchaseWGST
    : (kraftWGST + consWGST);

  mergeMainCells(leftCur, 0, leftCur, 2, 'CURRENT MONTH PURCHASE', STYLES.boxHeader);
  leftCur++;
  setMainCell(leftCur, 0, 'Item Description', STYLES.thLeft);
  setMainCell(leftCur, 1, 'Without GST (Rs)', STYLES.thRight);
  setMainCell(leftCur, 2, 'With GST (Rs)', STYLES.thRight);
  leftCur++;

  setMainCell(leftCur, 0, 'Kraft Paper Purchase', STYLES.tdLeft);
  setMainCell(leftCur, 1, kraftWOGST, STYLES.tdRight);
  setMainCell(leftCur, 2, kraftWGST, STYLES.tdRight);
  leftCur++;

  setMainCell(leftCur, 0, 'Other Consumable Goods Purchase', STYLES.tdLeft);
  setMainCell(leftCur, 1, consWOGST, STYLES.tdRight);
  setMainCell(leftCur, 2, consWGST, STYLES.tdRight);
  leftCur++;

  setMainCell(leftCur, 0, 'TOTAL CURRENT MONTH PURCHASE', STYLES.totalLeft);
  setMainCell(leftCur, 1, totalPurWOGST, STYLES.totalRight);
  setMainCell(leftCur, 2, totalPurWGST, STYLES.totalRight);
  leftCur += 2; // Spacer

  // Box L3: INVENTORY ASSET VALUATION
  const semiKraftStock = params.paperStats['Semi Kraft']?.cloAmt || 0;
  const virginKraftStock = params.paperStats['Virgin Kraft']?.cloAmt || 0;
  const duplexStock = params.paperStats['Chennai']?.cloAmt || 0;
  const othersStock = params.paperStats['Others']?.cloAmt || 0;

  mergeMainCells(leftCur, 0, leftCur, 2, 'INVENTORY ASSET VALUATION', STYLES.boxHeader);
  leftCur++;
  mergeMainCells(leftCur, 0, leftCur, 1, 'Inventory Category', STYLES.thLeft);
  setMainCell(leftCur, 2, 'Amount (Rs)', STYLES.thRight);
  leftCur++;

  const stockRows = [
    ['Finished Goods Inventory (Closing)', params.fgStockValue],
    ['Slow-Moving / Obsolete Inventory', params.nonMovingStockValue],
    ['Work in Process Inventory (Closing)', params.wipStockValue],
    ['Raw Material: Semi Kraft Paper', semiKraftStock],
    ['Raw Material: Virgin Kraft Paper', virginKraftStock],
    ['Raw Material: Duplex Paper', duplexStock],
    ['Raw Material: Others Paper', othersStock],
    ['Other Raw Materials & Consumables', params.rmStockValue],
  ];

  stockRows.forEach(([cat, val]) => {
    mergeMainCells(leftCur, 0, leftCur, 1, cat, STYLES.tdLeft);
    setMainCell(leftCur, 2, val, STYLES.tdRight);
    leftCur++;
  });

  mergeMainCells(leftCur, 0, leftCur, 1, 'GRAND TOTAL STOCK', STYLES.totalLeft);
  setMainCell(leftCur, 2, params.grandTotalStock, STYLES.totalRight);
  leftCur++;

  // -------------------------------------------------------------
  // RIGHT SIDE (Columns E to I: 4, 5, 6, 7, 8)
  // -------------------------------------------------------------

  // Box R1: PURCHASE & RECONCILIATION MATRIX
  mergeMainCells(rightCur, 4, rightCur, 8, 'PURCHASE & RECONCILIATION MATRIX', STYLES.boxHeader);
  rightCur++;
  setMainCell(rightCur, 4, 'Sister Unit / Party', STYLES.thLeft);
  setMainCell(rightCur, 5, 'Without GST', STYLES.thRight);
  setMainCell(rightCur, 6, 'With GST', STYLES.thRight);
  setMainCell(rightCur, 7, 'Diff W/o GST', STYLES.thRight);
  setMainCell(rightCur, 8, 'Diff With GST', STYLES.thRight);
  rightCur++;

  params.partyPurchases.forEach(pur => {
    setMainCell(rightCur, 4, pur.party, STYLES.tdLeft);
    setMainCell(rightCur, 5, pur.purWOGST, STYLES.tdRight);
    setMainCell(rightCur, 6, pur.purWGST, STYLES.tdRight);
    setMainCell(rightCur, 7, pur.diffWOGST, STYLES.tdRight);
    setMainCell(rightCur, 8, pur.diffWGST, STYLES.tdRight);
    rightCur++;
  });

  setMainCell(rightCur, 4, 'SCRAP (CASH)', STYLES.tdLeft);
  setMainCell(rightCur, 5, params.scrapCashPurWOGST, STYLES.tdRight);
  setMainCell(rightCur, 6, params.scrapCashPurWGST, STYLES.tdRight);
  setMainCell(rightCur, 7, params.scrapCashDiffWOGST, STYLES.tdRight);
  setMainCell(rightCur, 8, params.scrapCashDiffWGST, STYLES.tdRight);
  rightCur++;

  setMainCell(rightCur, 4, 'G. TOTAL PURCHASE', STYLES.totalLeft);
  setMainCell(rightCur, 5, params.gTotalPurchaseWOGST, STYLES.totalRight);
  setMainCell(rightCur, 6, params.gTotalPurchaseWGST, STYLES.totalRight);
  setMainCell(rightCur, 7, params.grandDiffWOGST, STYLES.totalRight);
  setMainCell(rightCur, 8, params.grandDiffWGST, STYLES.totalRight);
  rightCur += 2; // Spacer

  // Box R2: OPERATIONAL EXPENSES SUMMARY (With Clickable Links to Details Sheets!)
  mergeMainCells(rightCur, 4, rightCur, 8, `OPERATIONAL EXPENSES  (Total: Rs. ${fmt(params.totalExpenses)})`, STYLES.expenseHeader);
  rightCur++;
  mergeMainCells(rightCur, 4, rightCur, 5, 'Category / Particular (Click to View)', STYLES.thLeft);
  setMainCell(rightCur, 6, 'Amount (Rs)', STYLES.thRight);
  setMainCell(rightCur, 7, 'Category / Particular', STYLES.thLeft);
  setMainCell(rightCur, 8, 'Amount (Rs)', STYLES.thRight);
  rightCur++;

  const expensesList: MRExpenseItem[] = (params.expenseBreakup && params.expenseBreakup.length > 0)
    ? params.expenseBreakup
    : params.visibleExpenses.map(exp => ({
        name: exp,
        amount: params.manualData[`EXP:${exp}`] || 0
      }));

  if (expensesList.length === 0) {
    mergeMainCells(rightCur, 4, rightCur, 8, 'No operational expenses recorded', STYLES.tdCenter);
    rightCur++;
  } else {
    for (let i = 0; i < expensesList.length; i += 2) {
      const it1 = expensesList[i];
      const it2 = expensesList[i + 1];

      const sh1 = sheetMap.get(it1.name.toLowerCase().trim());
      if (sh1) {
        mergeMainCells(rightCur, 4, rightCur, 5, it1.name, STYLES.link);
        const cellRef1 = xlsxLib.utils.encode_cell({ r: rightCur, c: 4 });
        if (wsMain[cellRef1]) {
          wsMain[cellRef1].l = { Target: `#'${sh1.sheetName}'!A1`, Tooltip: `Click to view details of ${it1.name}` };
        }
      } else {
        mergeMainCells(rightCur, 4, rightCur, 5, it1.name, STYLES.tdLeft);
      }
      setMainCell(rightCur, 6, it1.amount, STYLES.tdRight);

      if (it2) {
        const sh2 = sheetMap.get(it2.name.toLowerCase().trim());
        if (sh2) {
          setMainCell(rightCur, 7, it2.name, STYLES.link);
          const cellRef2 = xlsxLib.utils.encode_cell({ r: rightCur, c: 7 });
          if (wsMain[cellRef2]) {
            wsMain[cellRef2].l = { Target: `#'${sh2.sheetName}'!A1`, Tooltip: `Click to view details of ${it2.name}` };
          }
        } else {
          setMainCell(rightCur, 7, it2.name, STYLES.tdLeft);
        }
        setMainCell(rightCur, 8, it2.amount, STYLES.tdRight);
      } else {
        setMainCell(rightCur, 7, '', STYLES.tdLeft);
        setMainCell(rightCur, 8, '', STYLES.tdRight);
      }
      rightCur++;
    }
  }

  mergeMainCells(rightCur, 4, rightCur, 7, 'TOTAL OPERATIONAL EXPENSES', STYLES.totalLeft);
  setMainCell(rightCur, 8, params.totalExpenses, STYLES.totalRight);
  rightCur += 2; // Spacer

  // Box R3: PROFIT & LOSS FINAL SUMMARY & NET PROFIT
  mergeMainCells(rightCur, 4, rightCur, 8, `PROFIT & LOSS SUMMARY - ${params.monthFormattedTitle.toUpperCase()}`, STYLES.profitHeader);
  rightCur++;

  mergeMainCells(rightCur, 4, rightCur, 6, 'Gross Difference (Nett Sale - G. Total Purchase)', STYLES.tdLeft);
  mergeMainCells(rightCur, 7, rightCur, 8, params.grandDiffWOGST, STYLES.tdRight);
  rightCur++;

  mergeMainCells(rightCur, 4, rightCur, 6, 'Less: Total Operational Expenses', STYLES.tdLeft);
  mergeMainCells(rightCur, 7, rightCur, 8, -params.totalExpenses, STYLES.tdRight);
  rightCur++;

  const isNetProfitPositive = params.netProfit >= 0;
  mergeMainCells(
    rightCur, 4, rightCur, 6,
    `NET PROFIT  (${params.profitMarginPercent}% Margin)`,
    isNetProfitPositive ? STYLES.netProfitLabel : STYLES.netLossLabel
  );
  mergeMainCells(
    rightCur, 7, rightCur, 8,
    params.netProfit,
    isNetProfitPositive ? STYLES.netProfit : STYLES.netLoss
  );
  rightCur++;

  // Set Sheet 1 Range, Column Widths & Merges
  const finalSheet1Row = Math.max(leftCur, rightCur, maxMainRow);
  wsMain['!ref'] = xlsxLib.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: finalSheet1Row, c: 8 } });
  wsMain['!merges'] = mainMerges;
  wsMain['!cols'] = [
    { wch: 32 }, // Col A: Left Particulars / Party / Paper
    { wch: 17 }, // Col B: Qty / Without GST
    { wch: 17 }, // Col C: Amt / With GST
    { wch: 5 },  // Col D: Blank Spacer
    { wch: 28 }, // Col E: Sister Party / Expense 1
    { wch: 17 }, // Col F: Pur W/o GST / Extra
    { wch: 17 }, // Col G: Pur With GST / Exp 1 Amt
    { wch: 24 }, // Col H: Diff W/o GST / Exp 2
    { wch: 18 }, // Col I: Diff With GST / Exp 2 Amt
  ];

  xlsxLib.utils.book_append_sheet(wb, wsMain, 'Profit_Loss_Statement');

  // =========================================================================
  // DEDICATED INDIVIDUAL EXPENSE SHEETS (ONE SHEET PER EXPENSE HEAD)
  // Each sheet contains only the details opened when clicking that expense
  // and has a clickable link back to Profit_Loss_Statement!
  // =========================================================================
  (params.expenseSheets || []).forEach(sh => {
    const wsExp: xlsx.WorkSheet = {};
    const expMerges: xlsx.Range[] = [];
    let maxExpRow = 0;

    const setExpCell = (r: number, c: number, value: any, style?: any, numFmt?: string) => {
      const ref = xlsxLib.utils.encode_cell({ r, c });
      wsExp[ref] = createCell(value, style, numFmt);
      if (r > maxExpRow) maxExpRow = r;
    };

    const mergeExpCells = (startR: number, startC: number, endR: number, endC: number, value?: any, style?: any, numFmt?: string) => {
      expMerges.push({ s: { r: startR, c: startC }, e: { r: endR, c: endC } });
      for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
          if (r === startR && c === startC) {
            setExpCell(r, c, value, style, numFmt);
          } else {
            setExpCell(r, c, '', style);
          }
        }
      }
    };

    const isRM = sh.type === 'RM_BREAKDOWN';
    const maxCol = isRM ? 8 : 5;

    // Row 0: Banner Title
    mergeExpCells(0, 0, 0, maxCol, `EXPENSE DETAIL: ${sh.expenseName.toUpperCase()}  |  M/O ${params.monthFormattedTitle.toUpperCase()}`, STYLES.titleBanner);

    // Row 1: Back to P&L Link
    mergeExpCells(1, 0, 1, maxCol, '⬅ Back to Profit & Loss Statement (मुख्य P&L शीट पर वापस जाएं)', STYLES.backLink);
    const backRef = xlsxLib.utils.encode_cell({ r: 1, c: 0 });
    if (wsExp[backRef]) {
      wsExp[backRef].l = { Target: "#'Profit_Loss_Statement'!E16", Tooltip: 'Click to return to Profit & Loss Statement' };
    }

    let rIdx = 3;

    if (isRM) {
      // RM Outward style (Consumable Goods / LPG)
      const headers = ['S.No', 'Date', 'Material Name', 'Quantity', 'Unit', 'Rate (Rs)', 'Amount (Rs)', 'Slip / Ref No', 'Remarks'];
      headers.forEach((h, col) => {
        setExpCell(rIdx, col, h, (col === 3 || col === 5 || col === 6) ? STYLES.thRight : (col === 0 || col === 1 ? STYLES.thCenter : STYLES.thLeft));
      });
      rIdx++;

      if (sh.items.length === 0) {
        mergeExpCells(rIdx, 0, rIdx, maxCol, `No individual material entries recorded. Total recorded P&L amount: Rs. ${fmt(sh.totalAmount)}`, STYLES.tdCenter);
        rIdx++;
      } else {
        sh.items.forEach((it, idx) => {
          setExpCell(rIdx, 0, idx + 1, STYLES.tdCenter);
          setExpCell(rIdx, 1, it.date, STYLES.tdCenter);
          setExpCell(rIdx, 2, it.materialName || it.narration || '-', STYLES.tdLeft);
          setExpCell(rIdx, 3, it.quantity || 0, STYLES.tdRight, '#,##0.00');
          setExpCell(rIdx, 4, it.unit || '-', STYLES.tdCenter);
          setExpCell(rIdx, 5, it.rate || 0, STYLES.tdRight);
          setExpCell(rIdx, 6, it.amount, STYLES.tdRight);
          setExpCell(rIdx, 7, it.referenceNo || it.voucherNo || '-', STYLES.tdLeft);
          setExpCell(rIdx, 8, it.remarks || it.paymentMode || '-', STYLES.tdLeft);
          rIdx++;
        });
      }

      // Total Row
      mergeExpCells(rIdx, 0, rIdx, 5, `TOTAL ${sh.expenseName.toUpperCase()}`, STYLES.annexureTotalLeft);
      setExpCell(rIdx, 6, sh.totalAmount, STYLES.annexureTotalRight);
      mergeExpCells(rIdx, 7, rIdx, 8, '', STYLES.annexureTotalRight);

      wsExp['!cols'] = [
        { wch: 8 },  // S.No
        { wch: 14 }, // Date
        { wch: 32 }, // Material Name
        { wch: 14 }, // Qty
        { wch: 10 }, // Unit
        { wch: 14 }, // Rate
        { wch: 18 }, // Amount
        { wch: 18 }, // Ref No
        { wch: 28 }, // Remarks
      ];
    } else {
      // Cash Ledger style (Salary, Freight, Electricity, Tea, Maintenance, and all other heads)
      const headers = ['S.No', 'Date', 'Voucher No', 'Description / Narration', 'Payment Mode', 'Amount (Rs)'];
      headers.forEach((h, col) => {
        setExpCell(rIdx, col, h, col === 5 ? STYLES.thRight : (col === 0 || col === 1 || col === 2 || col === 4 ? STYLES.thCenter : STYLES.thLeft));
      });
      rIdx++;

      if (sh.items.length === 0) {
        mergeExpCells(rIdx, 0, rIdx, maxCol, `No individual voucher entries recorded for this expense. Total recorded P&L amount: Rs. ${fmt(sh.totalAmount)}`, STYLES.tdCenter);
        rIdx++;
      } else {
        sh.items.forEach((it, idx) => {
          setExpCell(rIdx, 0, idx + 1, STYLES.tdCenter);
          setExpCell(rIdx, 1, it.date, STYLES.tdCenter);
          setExpCell(rIdx, 2, it.voucherNo || '-', STYLES.tdCenter);
          setExpCell(rIdx, 3, it.narration || '-', STYLES.tdLeft);
          setExpCell(rIdx, 4, it.paymentMode || 'CASH', STYLES.tdCenter);
          setExpCell(rIdx, 5, it.amount, STYLES.tdRight);
          rIdx++;
        });
      }

      // Total Row
      mergeExpCells(rIdx, 0, rIdx, 4, `TOTAL ${sh.expenseName.toUpperCase()}`, STYLES.annexureTotalLeft);
      setExpCell(rIdx, 5, sh.totalAmount, STYLES.annexureTotalRight);

      wsExp['!cols'] = [
        { wch: 8 },  // S.No
        { wch: 14 }, // Date
        { wch: 16 }, // Voucher No
        { wch: 44 }, // Narration
        { wch: 16 }, // Mode
        { wch: 20 }, // Amount
      ];
    }

    wsExp['!ref'] = xlsxLib.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rIdx, maxExpRow), c: maxCol } });
    wsExp['!merges'] = expMerges;

    xlsxLib.utils.book_append_sheet(wb, wsExp, sh.sheetName);
  });

  // Trigger file download
  const cleanTitle = (params.monthFormattedTitle || 'Report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Profit_Loss_Report_${cleanTitle}_${dateStr}.xlsx`;
  const wbout = xlsxLib.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlobFile(blob, filename);
};

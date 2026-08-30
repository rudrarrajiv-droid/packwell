import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as xlsx from 'xlsx';

interface MRExportParams {
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
  totalExpenses: number;
  netProfit: number;
  profitMarginPercent: string;
  fgStockValue: number;
  nonMovingStockValue: number;
  wipStockValue: number;
  paperStockValue: number;
  rmStockValue: number;
  grandTotalStock: number;
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
 * Generate a beautifully structured Multi-table PDF for MR Sheet
 */
export const exportMRToPDF = (params: MRExportParams) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Header Banner
  doc.setFillColor(0, 229, 255); // Cyan #00e5ff
  doc.rect(10, 10, pageWidth - 20, 12, 'F');
  doc.setDrawColor(30, 41, 59);
  doc.rect(10, 10, pageWidth - 20, 12, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`PROFIT & LOSS REPORT FOR THE M/O ${params.monthFormattedTitle.toUpperCase()}`, pageWidth / 2, 18, { align: 'center' });

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
    startY: 25,
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
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [255, 255, 0], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 8.5 }
  });

  const nextY = (doc as any).lastAutoTable.finalY + 5;
  const leftColWidth = 110;
  const rightColX = 125;
  const rightColWidth = pageWidth - rightColX - 10;

  // 3. Left Table: Revenue & Sales
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
      [{ content: 'TOTAL SALE', colSpan: 3, styles: { halign: 'center', fillColor: [0, 229, 255], textColor: [15, 23, 42] } }],
      ['Party / Category', 'Without GST', 'With GST']
    ],
    body: salesRows,
    foot: salesFoot,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.2, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [255, 255, 0], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 8 }
  });

  const salesFinalY = (doc as any).lastAutoTable.finalY;

  // Stock Valuation Table below Sales
  const stockRows = [
    ['Finish Goods Stock', fmt(params.fgStockValue)],
    ['Non-Moving Stock', fmt(params.nonMovingStockValue)],
    ['Work in Process (WIP)', fmt(params.wipStockValue)],
    ['Paper Stock', fmt(params.paperStockValue)],
    ['Raw Material Stock', fmt(params.rmStockValue)]
  ];

  autoTable(doc, {
    startY: salesFinalY + 3,
    margin: { left: 10, right: pageWidth - 10 - leftColWidth },
    head: [
      [{ content: 'INVENTORY ASSET VALUATION', colSpan: 2, styles: { halign: 'center', fillColor: [30, 41, 59], textColor: 255 } }]
    ],
    body: stockRows,
    foot: [['Grand Total Stock', fmt(params.grandTotalStock)]],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.2, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [255, 255, 0], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 8 }
  });

  // 4. Right Table: Reconciliation & Expenses
  const reconRows: any[] = [
    ['Paper Used', fmt(params.paperUsedWOGST), fmt(params.paperUsedWGST), '--', '--'],
    ...params.partyPurchases.map(p => [
      p.party,
      fmt(p.purWOGST),
      fmt(p.purWGST),
      fmtDiff(p.diffWOGST),
      fmtDiff(p.diffWGST)
    ]),
    ['SCRAP(CASH)', fmt(params.scrapCashPurWOGST), fmt(params.scrapCashPurWGST), fmt(params.scrapCashDiffWOGST), fmt(params.scrapCashDiffWGST)],
    [
      'G. Total Purchase',
      fmt(params.gTotalPurchaseWOGST),
      fmt(params.gTotalPurchaseWGST),
      fmt(params.grandDiffWOGST),
      fmt(params.grandDiffWGST)
    ]
  ];

  // Add Operational Expenses rows
  params.visibleExpenses.forEach((exp, idx) => {
    const isLast = idx === params.visibleExpenses.length - 1;
    reconRows.push([
      exp,
      '',
      '',
      fmt(params.manualData[`EXP:${exp}`] || 0),
      isLast ? fmt(params.totalExpenses) : ''
    ]);
  });

  autoTable(doc, {
    startY: nextY,
    margin: { left: rightColX, right: 10 },
    head: [
      [
        { content: 'Item / Particular', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
        { content: 'Without GST', styles: { halign: 'center', fillColor: [255, 255, 0], textColor: [15, 23, 42] } },
        { content: 'With GST', styles: { halign: 'center', fillColor: [255, 255, 0], textColor: [15, 23, 42] } },
        { content: 'Difference', colSpan: 2, styles: { halign: 'center', fillColor: [179, 136, 255], textColor: [30, 27, 75] } }
      ],
      [
        'Purchase', 'Purchase', 'Without GST', 'With GST'
      ]
    ],
    body: reconRows,
    foot: [
      [
        { content: 'NET PROFIT', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } },
        { content: `Rs. ${fmt(params.netProfit)}`, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } }
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.1, halign: 'right', textColor: [15, 23, 42] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    footStyles: { fillColor: [255, 255, 0], textColor: [185, 28, 28], fontStyle: 'bold', fontSize: 9.5 }
  });

  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`MR_Report_${params.monthFormattedTitle.replace(/\s+/g, '_')}_${dateStr}.pdf`);
};

/**
 * Generate formatted Excel matching the original sheet structure
 */
export const exportMRToExcel = (params: MRExportParams) => {
  const wb = xlsx.utils.book_new();

  const data: any[][] = [];

  // Title
  data.push([`PROFIT & LOSS REPORT FOR THE M/O ${params.monthFormattedTitle.toUpperCase()}`]);
  data.push([]);

  // Paper Table
  data.push(['PAPER', 'OPENING STOCK QTY', 'OPENING AMT', 'PURCHASE QTY', 'PURCHASE AMT', 'CONSUMPTION QTY', 'CONSUMPTION AMT', 'CLOSING QTY', 'CLOSING AMT']);
  Object.entries(params.paperStats).forEach(([type, s]) => {
    data.push([type, s.opnQty, s.opnAmt, s.purQty, s.purAmt, s.conQty, s.conAmt, s.cloQty, s.cloAmt]);
  });
  data.push([
    'TOTAL',
    params.paperTotals.opnQty,
    params.paperTotals.opnAmt,
    params.paperTotals.purQty,
    params.paperTotals.purAmt,
    params.paperTotals.conQty,
    params.paperTotals.conAmt,
    params.paperTotals.cloQty,
    params.paperTotals.cloAmt
  ]);
  data.push([]);

  // Revenue & Reconciliation
  data.push(['TOTAL SALE', '', '', 'PURCHASE & RECONCILIATION', '', 'DIFFERENCE']);
  data.push(['Party / Particular', 'Without GST', 'With GST', 'Item', 'Without GST', 'With GST', 'Diff W/o GST', 'Diff With GST']);

  params.visibleSaleParties.forEach((p, i) => {
    const saleWOGST = params.manualData[`SALE:${p}:WOGST`] || 0;
    const saleWGST = params.manualData[`SALE:${p}:WGST`] || 0;
    const pur = params.partyPurchases[i];

    data.push([
      p,
      saleWOGST,
      saleWGST,
      pur ? pur.party : '',
      pur ? pur.purWOGST : 0,
      pur ? pur.purWGST : 0,
      pur ? pur.diffWOGST : 0,
      pur ? pur.diffWGST : 0
    ]);
  });

  data.push(['SCRAP (CASH)', params.cashScrapRevenue, params.cashScrapRevenue, 'SCRAP (CASH)', params.scrapCashPurWOGST, params.scrapCashPurWGST, params.scrapCashDiffWOGST, params.scrapCashDiffWGST]);
  data.push(['TALLY DATA', params.tallyDataWOGST, params.tallyDataWGST, '', '', '', '', '']);
  data.push(['CREDIT NOTE', params.creditNoteWOGST, params.creditNoteWGST, '', '', '', '', '']);
  data.push(['NETT SALE', params.netSaleWithoutGST, params.netSaleWithGST, 'G. TOTAL PURCHASE', params.gTotalPurchaseWOGST, params.gTotalPurchaseWGST, params.grandDiffWOGST, params.grandDiffWGST]);
  data.push([]);

  // Expenses
  data.push(['OPERATIONAL EXPENSES', 'AMOUNT (Rs)']);
  params.visibleExpenses.forEach(exp => {
    data.push([exp, params.manualData[`EXP:${exp}`] || 0]);
  });
  data.push(['TOTAL EXPENSES', params.totalExpenses]);
  data.push([]);

  // Net Profit & Stock Summary
  data.push(['SUMMARY & PROFITABILITY', 'AMOUNT (Rs)']);
  data.push(['Nett Sale (Without GST)', params.netSaleWithoutGST]);
  data.push(['G. Total Purchase (Without GST)', params.gTotalPurchaseWOGST]);
  data.push(['Gross Difference', params.grandDiffWOGST]);
  data.push(['Total Expenses', params.totalExpenses]);
  data.push(['NET PROFIT', params.netProfit]);
  data.push([]);
  data.push(['INVENTORY VALUATION', 'AMOUNT (Rs)']);
  data.push(['Finish Goods Stock', params.fgStockValue]);
  data.push(['Non-Moving Stock', params.nonMovingStockValue]);
  data.push(['WIP Stock', params.wipStockValue]);
  data.push(['Paper Stock', params.paperStockValue]);
  data.push(['Raw Material Stock', params.rmStockValue]);
  data.push(['GRAND TOTAL STOCK', params.grandTotalStock]);

  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, 'MR_Report');

  const dateStr = new Date().toISOString().split('T')[0];
  xlsx.writeFile(wb, `MR_Report_${params.monthFormattedTitle.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
};

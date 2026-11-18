import * as xlsx from 'xlsx';
import { getAllJobCards } from './supabase/jobCardService';
import { getFinishGoods, getFinishGoodTransactions } from './supabase/finishGoodService';
import { getPurchaseOrders } from './supabase/purchaseOrderService';
import { getReels, getReelTransactions } from './supabase/reelService';
import { getProducts } from './supabase/productService';
import { getDCRecordsByMonth } from './supabase/dcRecordService';
import { getAttendanceByMonth } from './supabase/attendanceService';
import { buildJobCostingData } from '../pages/job-costing/jobCostingService';
import { downloadExcel } from '../utils/exportUtils';

export interface BackupProgressCallback {
  (step: string, percent?: number): void;
}

/**
 * Returns formatted month title, e.g. "2026-11" -> "November 2026"
 */
export function formatMonthTitle(monthStr: string): string {
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return monthStr;
  }
}

/**
 * Auto-calculates approximate column widths based on maximum string lengths
 */
function calculateColWidths(data: Record<string, any>[]): { wch: number }[] {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      const val = data[i][key];
      if (val !== null && val !== undefined) {
        const str = String(val);
        if (str.length > maxLen) {
          maxLen = Math.min(str.length, 50); // cap max width
        }
      }
    }
    return { wch: Math.max(maxLen + 3, 10) };
  });
}

/**
 * Generates and downloads a complete, multi-sheet Excel backup workbook for the given month.
 * @param selectedMonth Format: "YYYY-MM" (e.g. "2026-11")
 * @param onProgress Optional callback for progress indicator in UI
 */
export async function downloadCompleteMonthlyBackup(
  selectedMonth: string,
  onProgress?: BackupProgressCallback
): Promise<{ success: boolean; filename: string }> {
  const monthTitle = formatMonthTitle(selectedMonth);
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  onProgress?.('Fetching Job Cards & Inventory data...', 15);
  const [
    allJobCards,
    allFinishGoods,
    allFgTransactions,
    allPurchaseOrders,
    allReels,
    allReelTransactions,
    allProducts,
    dcRecordsMap,
    attendanceList,
  ] = await Promise.all([
    getAllJobCards().catch(() => []),
    getFinishGoods().catch(() => []),
    getFinishGoodTransactions().catch(() => []),
    getPurchaseOrders().catch(() => []),
    getReels().catch(() => []),
    getReelTransactions().catch(() => []),
    getProducts().catch(() => []),
    getDCRecordsByMonth(selectedMonth).catch(() => ({} as Record<string, any>)),
    getAttendanceByMonth(selectedMonth).catch(() => []),
  ]);

  // Map reels for lookup
  const reelsMap: Record<string, any> = {};
  allReels.forEach((r: any) => {
    if (r.id) reelsMap[r.id] = r;
    if (r.reelNumber) reelsMap[String(r.reelNumber).trim().toUpperCase()] = r;
  });

  onProgress?.('Processing Month Job Cards & P/L Costing...', 40);

  // 1. Filter Job Cards for this month
  const monthJobCards = allJobCards.filter((jc: any) => {
    const d = jc.targetDate || (jc.createdAt ? String(jc.createdAt).slice(0, 10) : '');
    return d.startsWith(selectedMonth);
  });

  const jobCardsSheetData = monthJobCards.map((jc: any) => {
    const snap = jc.productSnapshot || {};
    const d = jc.targetDate || (jc.createdAt ? String(jc.createdAt).slice(0, 10) : '');
    const layers = snap.layers || [];
    const allocTotal = layers.reduce((sum: number, l: any) => {
      const arr = l.allocatedReels || [];
      return sum + arr.reduce((s: number, r: any) => s + (Number(r.allocatedWeight) || 0), 0);
    }, 0);

    return {
      'Job Card No': jc.jobCardNo || '—',
      'Date': d,
      'Customer Name': jc.customerName || snap.customerName || '—',
      'Product Name': jc.productName || snap.itemName || '—',
      'Order Qty (Boxes)': Number(jc.orderQty || jc.quantity || 0),
      'Produced Qty (Boxes)': Number(jc.producedQty || jc.fgQty || 0),
      'Expected Delivery': jc.expectedDeliveryAt ? String(jc.expectedDeliveryAt).slice(0, 10) : '—',
      'Reel Size (Inch)': snap.reelSize || '—',
      'Cut Size (Inch)': snap.cutSize || '—',
      'UPS': snap.ups || 1,
      'Ply': snap.ply || layers.length || '—',
      'Total Paper Req (Kg)': Math.round(Number(jc.totalWeight || 0)),
      'Total Paper Alloc (Kg)': Math.round(allocTotal),
      'Status': jc.status || (jc.completedAt ? 'COMPLETED' : 'IN_PROGRESS'),
    };
  });

  // 2. Job Costing & P/L Sheet Data
  const costingLookupContext = {
    finishGoods: allFinishGoods,
    products: allProducts,
    purchaseOrders: allPurchaseOrders,
  };

  const jobCostingSheetData = monthJobCards.map((jc: any) => {
    const costing = buildJobCostingData(jc, allReels, costingLookupContext);
    const margin =
      costing.totalSaleValue && costing.netProfitLoss !== null
        ? `${((costing.netProfitLoss / costing.totalSaleValue) * 100).toFixed(1)}%`
        : '—';

    return {
      'Job Card No': costing.jobCardNo,
      'Date': costing.jobCardDate,
      'Customer Name': costing.customerName || '—',
      'Product Name': costing.jobName,
      'Order Qty (Boxes)': costing.orderBoxQty,
      'Manufactured Qty': costing.manfBoxQty !== null ? costing.manfBoxQty : 'Pending',
      'Sale Rate / Box (₹)': costing.saleRatePerBox !== null ? costing.saleRatePerBox : '—',
      'Total Sale Value (₹)': costing.totalSaleValue !== null ? costing.totalSaleValue : '—',
      'Total DPR Wt (Kg)': Math.round(costing.totalDprWeight),
      'DPR Paper Cost (₹)': costing.totalDprValue,
      'Conversion Rate (₹/Kg)': costing.conversionRateUsed,
      'Conversion Cost (₹)': costing.conversionCost,
      'Subtotal Paper+Conv (₹)': costing.baseManufacturingCost,
      '+5% Scrap Margin (₹)': costing.scrapAmount,
      'Total Mfg Cost (₹)': costing.totalManufacturingCost,
      'Net Profit / Loss (₹)': costing.netProfitLoss !== null ? costing.netProfitLoss : 'Pending Data',
      'Profit Margin (%)': margin,
      'Status':
        costing.netProfitLoss === null
          ? 'PENDING DPR/RATE'
          : costing.netProfitLoss >= 0
          ? 'PROFIT'
          : 'LOSS',
    };
  });

  onProgress?.('Processing Dispatches & Daily Conversion...', 65);

  // 3. Dispatches (Outward Transactions from Finish Goods)
  const monthDispatches = allFgTransactions.filter(
    (tx: any) => tx.date && tx.date.startsWith(selectedMonth) && tx.category === 'DISPATCH'
  );

  const dispatchesSheetData = monthDispatches.map((tx: any) => {
    const qty = Number(tx.quantity || 0);
    const rate = Number(tx.rate || 0);
    return {
      'Date': tx.date,
      'Invoice / DC No': tx.invoiceNo || tx.referenceNo || '—',
      'Customer Name': tx.customerName || '—',
      'Product Name': tx.productName || '—',
      'Dispatch Qty (Boxes)': qty,
      'Rate (₹)': rate > 0 ? rate : '—',
      'Total Amount (₹)': rate > 0 ? Math.round(qty * rate) : '—',
      'Vehicle No': tx.vehicleNo || '—',
      'Transporter': tx.transporterName || '—',
      'Place / Destination': tx.place || '—',
      'Freight (₹)': Number(tx.freight || 0),
    };
  });

  // 4. Daily Conversion & Paper Consumption (DC Daily Report)
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const dcDailySheetData: any[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
    const dayTx = allReelTransactions.filter((t: any) => t.date && t.date.startsWith(dateStr));

    let skWeight = 0;
    let vk20Weight = 0;
    let vk22Weight = 0;
    let vk25Weight = 0;
    let vk28Weight = 0;
    let duplexWeight = 0;
    let totalAmount = 0;

    dayTx.forEach((tx: any) => {
      const reel = reelsMap[tx.reelId] || reelsMap[String(tx.reelNumber || '').trim().toUpperCase()];
      const qty = Number(tx.quantity || 0);
      const rate = Number(reel?.rate || 0);
      const amt = qty * rate;

      const pt = String(reel?.paperType || '').toUpperCase();
      const bfNum = Number(reel?.bf) || 0;

      if (pt.includes('SK') || pt.includes('SEMI') || (pt.includes('CHENNAI') && !pt.includes('DUP') && !pt.includes('HWC'))) {
        skWeight += qty;
      } else if (pt.includes('VK') || pt.includes('VIRGIN')) {
        if (bfNum <= 20) vk20Weight += qty;
        else if (bfNum > 20 && bfNum <= 22) vk22Weight += qty;
        else if (bfNum > 22 && bfNum <= 25) vk25Weight += qty;
        else vk28Weight += qty;
      } else if (pt.includes('DUPLEX') || pt.includes('HWC') || pt.includes('DUP')) {
        duplexWeight += qty;
      } else {
        skWeight += qty;
      }

      totalAmount += amt;
    });

    const totalWeight = skWeight + vk20Weight + vk22Weight + vk25Weight + vk28Weight + duplexWeight;
    const dayAttendance = attendanceList.filter((a: any) => a.date === dateStr);
    const manpowerCost = dayAttendance.reduce(
      (sum: number, a: any) => sum + (a.perDayAmount || 0) + (a.otAmount || 0) + (a.refreshment || 0),
      0
    );

    const dcRec = (dcRecordsMap as Record<string, any>)?.[dateStr];
    const ply = dcRec?.totalPly || 0;
    const scrap = dcRec?.scrap || 0;
    const conversionCostPerKg = totalWeight > 0 ? manpowerCost / totalWeight : 0;

    if (totalWeight > 0 || manpowerCost > 0 || dcRec) {
      dcDailySheetData.push({
        'Date': dateStr,
        'Semi Kraft (Kg)': Math.round(skWeight),
        'Virgin 20 BF (Kg)': Math.round(vk20Weight),
        'Virgin 22 BF (Kg)': Math.round(vk22Weight),
        'Virgin 25 BF (Kg)': Math.round(vk25Weight),
        'Virgin 28 BF (Kg)': Math.round(vk28Weight),
        'Duplex (Kg)': Math.round(duplexWeight),
        'Total Paper (Kg)': Math.round(totalWeight),
        'Paper Amount (₹)': Math.round(totalAmount),
        'Manpower Cost (₹)': Math.round(manpowerCost),
        'Conversion / Kg (₹)': Math.round(conversionCostPerKg * 100) / 100,
        'Total Ply': ply,
        'Scrap (Kg)': scrap,
      });
    }
  }

  // 5. Purchase Orders
  const monthPOs = allPurchaseOrders.filter((po: any) => {
    const d = po.poDate || po.orderDate || (po.createdAt ? String(po.createdAt).slice(0, 10) : '');
    return d.startsWith(selectedMonth) || (Number(po.balanceQty || po.orderQty || 0) > 0);
  });

  const poSheetData = monthPOs.map((po: any) => {
    const orderQty = Number(po.orderQty || po.quantity || 0);
    const rate = Number(po.rate || po.price || 0);
    const balance = Number(po.balanceQty ?? orderQty);
    return {
      'PO No': po.poNo || po.poNumber || '—',
      'PO Date': po.poDate || po.orderDate || '—',
      'Customer Name': po.customerName || '—',
      'Product Name': po.productName || po.itemName || '—',
      'Order Qty (Boxes)': orderQty,
      'Rate (₹)': rate,
      'Total Value (₹)': Math.round(orderQty * rate),
      'Balance Qty': balance,
      'Expected Delivery': po.deliveryDate || po.expectedDeliveryDate || '—',
      'Status': po.status || (balance === 0 ? 'COMPLETED' : 'OPEN'),
    };
  });

  onProgress?.('Compiling Inventory & Master Data...', 85);

  // 6. Finish Goods Stock Snapshot
  const fgSheetData = allFinishGoods.map((fg: any) => {
    const qty = Number(fg.quantity || fg.stock || 0);
    const rate = Number(fg.rate || 0);
    return {
      'Product Name': fg.productName || '—',
      'Customer Name': fg.customerName || '—',
      'Category': fg.category || 'REGULAR',
      'Current Stock (Boxes)': qty,
      'Sale Rate (₹)': rate > 0 ? rate : '—',
      'Stock Value (₹)': rate > 0 ? Math.round(qty * rate) : 0,
      'Last Updated': fg.updatedAt ? String(fg.updatedAt).slice(0, 10) : '—',
    };
  });

  // 7. Reel Inventory Snapshot
  const reelSheetData = allReels.map((r: any) => {
    const wt = Number(r.weight || r.currentWeight || 0);
    const rate = Number(r.rate || r.purchaseRate || 0);
    return {
      'Reel No': r.reelNumber || '—',
      'Paper Type': r.paperType || '—',
      'GSM': Number(r.gsm || 0),
      'BF': r.bf || '—',
      'Reel Size (Inch)': Number(r.reelSize || r.size || 0),
      'Stock Weight (Kg)': Math.round(wt),
      'Rate (₹/Kg)': rate,
      'Stock Value (₹)': Math.round(wt * rate),
      'Mill / Supplier': r.mill || r.supplier || '—',
      'Status': wt <= 0 ? 'EMPTY' : wt < 50 ? 'LOW' : 'IN_STOCK',
    };
  });

  // 8. Master Data Products Snapshot
  const productsSheetData = allProducts.map((p: any) => ({
    'Item Name': p.itemName || '—',
    'Customer Name': p.customerName || '—',
    'Length (mm)': p.length || '—',
    'Width (mm)': p.width || '—',
    'Height (mm)': p.height || '—',
    'Ply': p.ply || '—',
    'Flute': p.flute || '—',
    'Reel Size (Inch)': p.reelSize || '—',
    'Cut Size (Inch)': p.cutSize || '—',
    'UPS': p.ups || 1,
    'Sheet Weight (Kg)': p.sheetWeight || p.oneBoxWeight || '—',
    'Customer Rate (₹)': Number(p.customerRate || p.rate || 0),
  }));

  // 9. Summary Sheet Data
  const totalJobCardsCount = monthJobCards.length;
  const totalOrderBoxQty = monthJobCards.reduce((s: number, jc: any) => s + Number(jc.orderQty || 0), 0);
  const totalDprPaperKg = jobCostingSheetData.reduce(
    (s: number, c: any) => s + (typeof c['Total DPR Wt (Kg)'] === 'number' ? c['Total DPR Wt (Kg)'] : 0),
    0
  );
  const totalDprPaperCost = jobCostingSheetData.reduce(
    (s: number, c: any) => s + (typeof c['DPR Paper Cost (₹)'] === 'number' ? c['DPR Paper Cost (₹)'] : 0),
    0
  );
  const totalMfgCost = jobCostingSheetData.reduce(
    (s: number, c: any) => s + (typeof c['Total Mfg Cost (₹)'] === 'number' ? c['Total Mfg Cost (₹)'] : 0),
    0
  );
  const totalSaleVal = jobCostingSheetData.reduce(
    (s: number, c: any) => s + (typeof c['Total Sale Value (₹)'] === 'number' ? c['Total Sale Value (₹)'] : 0),
    0
  );
  const netPL = jobCostingSheetData.reduce(
    (s: number, c: any) => s + (typeof c['Net Profit / Loss (₹)'] === 'number' ? c['Net Profit / Loss (₹)'] : 0),
    0
  );
  const totalDispatchBoxes = dispatchesSheetData.reduce(
    (s: number, d: any) => s + Number(d['Dispatch Qty (Boxes)'] || 0),
    0
  );
  const totalReelStockKg = reelSheetData.reduce((s: number, r: any) => s + Number(r['Stock Weight (Kg)'] || 0), 0);
  const totalReelStockVal = reelSheetData.reduce((s: number, r: any) => s + Number(r['Stock Value (₹)'] || 0), 0);
  const totalFgStockVal = fgSheetData.reduce((s: number, f: any) => s + Number(f['Stock Value (₹)'] || 0), 0);

  const summarySheetData = [
    { 'Key Metric': 'Backup Month', 'Value / Summary': monthTitle },
    { 'Key Metric': 'Backup Generated At', 'Value / Summary': nowStr },
    { 'Key Metric': 'Total Job Cards in Month', 'Value / Summary': `${totalJobCardsCount} Cards` },
    { 'Key Metric': 'Total Order Box Qty', 'Value / Summary': `${totalOrderBoxQty.toLocaleString()} Boxes` },
    { 'Key Metric': 'Total Finished Goods Dispatched', 'Value / Summary': `${totalDispatchBoxes.toLocaleString()} Boxes` },
    { 'Key Metric': 'Total DPR Paper Consumed', 'Value / Summary': `${Math.round(totalDprPaperKg).toLocaleString()} Kg` },
    { 'Key Metric': 'Total DPR Paper Cost', 'Value / Summary': `₹${Math.round(totalDprPaperCost).toLocaleString()}` },
    { 'Key Metric': 'Total Manufacturing Cost (Paper+Conv+5%)', 'Value / Summary': `₹${Math.round(totalMfgCost).toLocaleString()}` },
    { 'Key Metric': 'Total Sale Value', 'Value / Summary': `₹${Math.round(totalSaleVal).toLocaleString()}` },
    {
      'Key Metric': 'Net Job Costing Profit / Loss',
      'Value / Summary': `${netPL >= 0 ? '+' : '-'}₹${Math.abs(Math.round(netPL)).toLocaleString()}`,
    },
    { 'Key Metric': 'Current Paper Reel Stock', 'Value / Summary': `${Math.round(totalReelStockKg).toLocaleString()} Kg (₹${Math.round(totalReelStockVal).toLocaleString()})` },
    { 'Key Metric': 'Current Finished Goods Stock Value', 'Value / Summary': `₹${Math.round(totalFgStockVal).toLocaleString()}` },
    { 'Key Metric': 'Active Products in Master Data', 'Value / Summary': `${productsSheetData.length} Items` },
  ];

  onProgress?.('Generating Multi-Sheet Excel file...', 95);

  // Build Excel Workbook with SheetJS
  const workbook = xlsx.utils.book_new();

  const appendWorksheet = (data: any[], sheetName: string) => {
    const ws = xlsx.utils.json_to_sheet(data.length > 0 ? data : [{ Info: 'No records found for this period' }]);
    ws['!cols'] = calculateColWidths(data.length > 0 ? data : [{ Info: 'No records found for this period' }]);
    xlsx.utils.book_append_sheet(workbook, ws, sheetName);
  };

  appendWorksheet(summarySheetData, 'Summary');
  appendWorksheet(jobCardsSheetData, 'Job Cards');
  appendWorksheet(jobCostingSheetData, 'Job Costing & PL');
  appendWorksheet(dispatchesSheetData, 'Dispatches (DC)');
  appendWorksheet(dcDailySheetData, 'Daily Conversion (DC)');
  appendWorksheet(poSheetData, 'Purchase Orders');
  appendWorksheet(fgSheetData, 'Finish Goods Stock');
  appendWorksheet(reelSheetData, 'Reel Inventory');
  appendWorksheet(productsSheetData, 'Master Data');

  const cleanMonthName = monthTitle.replace(/\s+/g, '_');
  const filename = `Packwell_Monthly_Backup_${selectedMonth}_${cleanMonthName}.xlsx`;

  onProgress?.('Triggering download...', 100);
  downloadExcel(workbook, filename);

  return { success: true, filename };
}

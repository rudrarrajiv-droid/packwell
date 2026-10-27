import { supabase } from './config';
import { logActivity } from './activityLogService';

export interface CutSizeItem {
  id: string;
  jobName?: string;
  cutSize: number; // inches
  qty: number; // ply or paper
  sqMtr: number; // (cutSize * qty) / 39.37
}

export interface PlantMisReport {
  id?: string;
  reportDate: string; // YYYY-MM-DD
  selfSaleExclGst: number;
  selfSaleInclGst: number;
  outsourceSaleExclGst: number;
  outsourceSaleInclGst: number;
  totalSaleExclGst: number;
  totalSaleInclGst: number;
  // Explicit Current Month Total Sale (MTD)
  mtdSelfSaleExclGst?: number | null;
  mtdSelfSaleInclGst?: number | null;
  mtdOutsourceSaleExclGst?: number | null;
  mtdOutsourceSaleInclGst?: number | null;
  mtdTotalSaleExclGst?: number | null;
  mtdTotalSaleInclGst?: number | null;
  remarks?: string;
  showRevenue?: boolean;
  showStockValuation?: boolean;
  showFgProduced?: boolean;
  showMachines?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface PlantMisFgItem {
  id?: string;
  reportDate: string;
  vendorName: string;
  itemName: string;
  qtyBox: number;
  scrapBox: number;
  sortOrder: number;
}

export interface PlantMisMachineLog {
  id?: string;
  reportDate: string;
  machineName: string;
  shift: 'Day' | 'Night' | 'General';
  shiftHours: number; // e.g. 8, 10, 12, 16, 24
  shiftTiming?: string; // e.g. "08:00 AM - 08:00 PM"
  status: 'RUNNING' | 'MAINTENANCE' | 'IDLE' | 'BREAKDOWN';
  runningSqMtr: number;
  runningKg: number;
  totalPly: number;
  totalPaper: number;
  scrapKg: number;
  scrapSheet: number;
  notes?: string;
  sortOrder: number;
  cutSizeBreakdown?: CutSizeItem[];
}

export interface MtdRevenueSummary {
  selfExcl: number;
  selfIncl: number;
  outsourceExcl: number;
  outsourceIncl: number;
  totalExcl: number;
  totalIncl: number;
  daysCount: number;
}

export interface FgStockValuation {
  regularValue: number;
  nonMovingValue: number;
  totalValue: number;
  regularBoxes: number;
  nonMovingBoxes: number;
  totalBoxes: number;
}

export interface PlantMisFullData {
  report: PlantMisReport;
  fgItems: PlantMisFgItem[];
  machineLogs: PlantMisMachineLog[];
  prevReport: PlantMisReport | null;
  mtdSummary: MtdRevenueSummary;
  fgStockValuation: FgStockValuation;
  isExisting: boolean;
}

export const DEFAULT_PRESET_MACHINES: Omit<PlantMisMachineLog, 'reportDate'>[] = [
  {
    machineName: 'Semi Auto Corrugation Machine',
    shift: 'Day',
    shiftHours: 12,
    shiftTiming: '08:00 AM - 08:00 PM',
    status: 'MAINTENANCE',
    runningSqMtr: 0,
    runningKg: 0,
    totalPly: 0,
    totalPaper: 0,
    scrapKg: 0,
    scrapSheet: 0,
    notes: 'Under scheduled maintenance',
    sortOrder: 1,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Manual Corrugation Machine',
    shift: 'Day',
    shiftHours: 8,
    shiftTiming: '08:00 AM - 04:00 PM',
    status: 'RUNNING',
    runningSqMtr: 3145,
    runningKg: 838,
    totalPly: 2075,
    totalPaper: 200,
    scrapKg: 17,
    scrapSheet: 0,
    notes: '',
    sortOrder: 2,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Manual Corrugation Machine',
    shift: 'Night',
    shiftHours: 8,
    shiftTiming: '08:00 PM - 04:00 AM',
    status: 'RUNNING',
    runningSqMtr: 3144,
    runningKg: 838,
    totalPly: 2075,
    totalPaper: 200,
    scrapKg: 17,
    scrapSheet: 0,
    notes: '',
    sortOrder: 3,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Pasting M/c - 1',
    shift: 'Day',
    shiftHours: 8,
    shiftTiming: '08:00 AM - 04:00 PM',
    status: 'RUNNING',
    runningSqMtr: 0,
    runningKg: 0,
    totalPly: 3900,
    totalPaper: 0,
    scrapKg: 0,
    scrapSheet: 0,
    notes: '',
    sortOrder: 4,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Pasting M/c - 2',
    shift: 'Night',
    shiftHours: 3,
    shiftTiming: '08:00 PM - 11:00 PM',
    status: 'RUNNING',
    runningSqMtr: 0,
    runningKg: 0,
    totalPly: 1000,
    totalPaper: 0,
    scrapKg: 0,
    scrapSheet: 0,
    notes: '',
    sortOrder: 5,
    cutSizeBreakdown: []
  },
  {
    machineName: 'RS-4 Printing M/c',
    shift: 'Day',
    shiftHours: 12,
    shiftTiming: '08:00 AM - 08:00 PM',
    status: 'RUNNING',
    runningSqMtr: 0,
    runningKg: 0,
    totalPly: 0,
    totalPaper: 0,
    scrapKg: 0,
    scrapSheet: 4508,
    notes: '',
    sortOrder: 6,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Die M/c',
    shift: 'Day',
    shiftHours: 12,
    shiftTiming: '08:00 AM - 08:00 PM',
    status: 'RUNNING',
    runningSqMtr: 0,
    runningKg: 0,
    totalPly: 0,
    totalPaper: 0,
    scrapKg: 0,
    scrapSheet: 3650,
    notes: '',
    sortOrder: 7,
    cutSizeBreakdown: []
  },
  {
    machineName: 'Paper Cutting M/c',
    shift: 'General',
    shiftHours: 12,
    shiftTiming: '08:00 AM - 08:00 PM',
    status: 'RUNNING',
    runningSqMtr: 4159,
    runningKg: 589,
    totalPly: 0,
    totalPaper: 3850,
    scrapKg: 0,
    scrapSheet: 0,
    notes: '',
    sortOrder: 8,
    cutSizeBreakdown: []
  }
];

export const calculateSqMtr = (cutSizeInches: number, qty: number): number => {
  if (!cutSizeInches || !qty || cutSizeInches <= 0 || qty <= 0) return 0;
  // Standard Corrugation Formula: (Cut Size Inches * Qty) / 39.37
  return Number(((cutSizeInches * qty) / 39.37).toFixed(2));
};

export const getPlantMisByDate = async (dateStr: string): Promise<PlantMisFullData> => {
  // 1. Fetch main report
  const { data: reportData, error: reportError } = await supabase
    .from('daily_plant_mis_reports')
    .select('*')
    .eq('report_date', dateStr)
    .maybeSingle();

  if (reportError) {
    console.error('Error fetching plant MIS report:', reportError);
    throw reportError;
  }

  const isExisting = !!reportData;

  const report: PlantMisReport = reportData ? {
    id: reportData.id,
    reportDate: reportData.report_date,
    selfSaleExclGst: Number(reportData.self_sale_excl_gst) || 0,
    selfSaleInclGst: Number(reportData.self_sale_incl_gst) || 0,
    outsourceSaleExclGst: Number(reportData.outsource_sale_excl_gst) || 0,
    outsourceSaleInclGst: Number(reportData.outsource_sale_incl_gst) || 0,
    totalSaleExclGst: Number(reportData.total_sale_excl_gst) || 0,
    totalSaleInclGst: Number(reportData.total_sale_incl_gst) || 0,
    mtdSelfSaleExclGst: reportData.mtd_self_sale_excl_gst !== null ? Number(reportData.mtd_self_sale_excl_gst) : null,
    mtdSelfSaleInclGst: reportData.mtd_self_sale_incl_gst !== null ? Number(reportData.mtd_self_sale_incl_gst) : null,
    mtdOutsourceSaleExclGst: reportData.mtd_outsource_sale_excl_gst !== null ? Number(reportData.mtd_outsource_sale_excl_gst) : null,
    mtdOutsourceSaleInclGst: reportData.mtd_outsource_sale_incl_gst !== null ? Number(reportData.mtd_outsource_sale_incl_gst) : null,
    mtdTotalSaleExclGst: reportData.mtd_total_sale_excl_gst !== null ? Number(reportData.mtd_total_sale_excl_gst) : null,
    mtdTotalSaleInclGst: reportData.mtd_total_sale_incl_gst !== null ? Number(reportData.mtd_total_sale_incl_gst) : null,
    remarks: reportData.remarks || '',
    showRevenue: reportData.show_revenue !== false,
    showStockValuation: reportData.show_stock_valuation !== false,
    showFgProduced: reportData.show_fg_produced !== false,
    showMachines: reportData.show_machines !== false,
    createdAt: reportData.created_at,
    updatedAt: reportData.updated_at,
    createdBy: reportData.created_by
  } : {
    reportDate: dateStr,
    selfSaleExclGst: 0,
    selfSaleInclGst: 0,
    outsourceSaleExclGst: 0,
    outsourceSaleInclGst: 0,
    totalSaleExclGst: 0,
    totalSaleInclGst: 0,
    mtdSelfSaleExclGst: null,
    mtdSelfSaleInclGst: null,
    mtdOutsourceSaleExclGst: null,
    mtdOutsourceSaleInclGst: null,
    mtdTotalSaleExclGst: null,
    mtdTotalSaleInclGst: null,
    remarks: '',
    showRevenue: true,
    showStockValuation: true,
    showFgProduced: true,
    showMachines: true
  };

  // 2. Fetch FG Items
  let fgItems: PlantMisFgItem[] = [];
  if (isExisting) {
    const { data: fgData, error: fgError } = await supabase
      .from('daily_plant_mis_fg_items')
      .select('*')
      .eq('report_date', dateStr)
      .order('sort_order', { ascending: true });

    if (!fgError && fgData) {
      fgItems = fgData.map(item => ({
        id: item.id,
        reportDate: item.report_date,
        vendorName: item.vendor_name,
        itemName: item.item_name,
        qtyBox: Number(item.qty_box) || 0,
        scrapBox: 0,
        sortOrder: item.sort_order || 0
      }));
    }
  }

  // 3. Fetch Machine Logs
  let machineLogs: PlantMisMachineLog[] = [];
  if (isExisting) {
    const { data: machineData, error: machineError } = await supabase
      .from('daily_plant_mis_machine_logs')
      .select('*')
      .eq('report_date', dateStr)
      .order('sort_order', { ascending: true });

    if (!machineError && machineData && machineData.length > 0) {
      machineLogs = machineData.map(m => ({
        id: m.id,
        reportDate: m.report_date,
        machineName: m.machine_name,
        shift: m.shift as any || 'Day',
        shiftHours: Number(m.shift_hours) || 12,
        shiftTiming: m.shift_timing || '',
        status: m.status as any || 'RUNNING',
        runningSqMtr: Number(m.running_sq_mtr) || 0,
        runningKg: Number(m.running_kg) || 0,
        totalPly: Number(m.total_ply) || 0,
        totalPaper: Number(m.total_paper) || 0,
        scrapKg: Number(m.scrap_kg) || 0,
        scrapSheet: Number(m.scrap_sheet) || 0,
        notes: m.notes || '',
        sortOrder: m.sort_order || 0,
        cutSizeBreakdown: Array.isArray(m.cut_size_breakdown) ? m.cut_size_breakdown : []
      }));
    } else {
      machineLogs = DEFAULT_PRESET_MACHINES.map(m => ({ ...m, reportDate: dateStr }));
    }
  } else {
    machineLogs = DEFAULT_PRESET_MACHINES.map(m => ({ ...m, reportDate: dateStr }));
  }

  // 4. Fetch Previous Working Date Report (Most recent date < dateStr)
  let prevReport: PlantMisReport | null = null;
  const { data: prevData } = await supabase
    .from('daily_plant_mis_reports')
    .select('*')
    .lt('report_date', dateStr)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevData) {
    prevReport = {
      id: prevData.id,
      reportDate: prevData.report_date,
      selfSaleExclGst: Number(prevData.self_sale_excl_gst) || 0,
      selfSaleInclGst: Number(prevData.self_sale_incl_gst) || 0,
      outsourceSaleExclGst: Number(prevData.outsource_sale_excl_gst) || 0,
      outsourceSaleInclGst: Number(prevData.outsource_sale_incl_gst) || 0,
      totalSaleExclGst: Number(prevData.total_sale_excl_gst) || 0,
      totalSaleInclGst: Number(prevData.total_sale_incl_gst) || 0,
      remarks: prevData.remarks || ''
    };
  }

  // 5. Fetch Month-To-Date (MTD) Cumulative Revenue
  const [year, month] = dateStr.split('-');
  const monthStart = `${year}-${month}-01`;

  const { data: mtdRows } = await supabase
    .from('daily_plant_mis_reports')
    .select('self_sale_excl_gst, self_sale_incl_gst, outsource_sale_excl_gst, outsource_sale_incl_gst, total_sale_excl_gst, total_sale_incl_gst')
    .gte('report_date', monthStart)
    .lte('report_date', dateStr);

  const mtdSummary: MtdRevenueSummary = {
    selfExcl: 0,
    selfIncl: 0,
    outsourceExcl: 0,
    outsourceIncl: 0,
    totalExcl: 0,
    totalIncl: 0,
    daysCount: mtdRows?.length || 0
  };

  (mtdRows || []).forEach(row => {
    mtdSummary.selfExcl += Number(row.self_sale_excl_gst) || 0;
    mtdSummary.selfIncl += Number(row.self_sale_incl_gst) || 0;
    mtdSummary.outsourceExcl += Number(row.outsource_sale_excl_gst) || 0;
    mtdSummary.outsourceIncl += Number(row.outsource_sale_incl_gst) || 0;
    mtdSummary.totalExcl += Number(row.total_sale_excl_gst) || 0;
    mtdSummary.totalIncl += Number(row.total_sale_incl_gst) || 0;
  });

  // If report has explicit MTD values set, override cumulative sum
  if (report.mtdTotalSaleInclGst && report.mtdTotalSaleInclGst > 0) {
    mtdSummary.selfExcl = report.mtdSelfSaleExclGst || mtdSummary.selfExcl;
    mtdSummary.selfIncl = report.mtdSelfSaleInclGst || mtdSummary.selfIncl;
    mtdSummary.outsourceExcl = report.mtdOutsourceSaleExclGst || mtdSummary.outsourceExcl;
    mtdSummary.outsourceIncl = report.mtdOutsourceSaleInclGst || mtdSummary.outsourceIncl;
    mtdSummary.totalExcl = report.mtdTotalSaleExclGst || mtdSummary.totalExcl;
    mtdSummary.totalIncl = report.mtdTotalSaleInclGst || mtdSummary.totalIncl;
  }

  // 6. Fetch Finish Goods Stock Valuation (Regular vs Non-Moving) as of date
  const fgStockValuation = await getFinishGoodsStockValuation(dateStr);

  return {
    report,
    fgItems,
    machineLogs,
    prevReport,
    mtdSummary,
    fgStockValuation,
    isExisting
  };
};

export const savePlantMisFullReport = async (payload: {
  reportDate: string;
  selfSaleExclGst: number;
  selfSaleInclGst: number;
  outsourceSaleExclGst: number;
  outsourceSaleInclGst: number;
  mtdSelfSaleExclGst?: number | null;
  mtdSelfSaleInclGst?: number | null;
  mtdOutsourceSaleExclGst?: number | null;
  mtdOutsourceSaleInclGst?: number | null;
  mtdTotalSaleExclGst?: number | null;
  mtdTotalSaleInclGst?: number | null;
  remarks?: string;
  showRevenue?: boolean;
  showStockValuation?: boolean;
  showFgProduced?: boolean;
  showMachines?: boolean;
  fgItems: Omit<PlantMisFgItem, 'reportDate' | 'id'>[];
  machineLogs: Omit<PlantMisMachineLog, 'reportDate' | 'id'>[];
  user?: string;
}): Promise<void> => {
  const {
    reportDate,
    selfSaleExclGst,
    selfSaleInclGst,
    outsourceSaleExclGst,
    outsourceSaleInclGst,
    mtdSelfSaleExclGst,
    mtdSelfSaleInclGst,
    mtdOutsourceSaleExclGst,
    mtdOutsourceSaleInclGst,
    mtdTotalSaleExclGst,
    mtdTotalSaleInclGst,
    remarks,
    showRevenue,
    showStockValuation,
    showFgProduced,
    showMachines,
    fgItems,
    machineLogs,
    user
  } = payload;

  const totalSaleExclGst = Number(selfSaleExclGst || 0) + Number(outsourceSaleExclGst || 0);
  const totalSaleInclGst = Number(selfSaleInclGst || 0) + Number(outsourceSaleInclGst || 0);

  // 1. Upsert master report record
  const { error: reportError } = await supabase
    .from('daily_plant_mis_reports')
    .upsert({
      report_date: reportDate,
      self_sale_excl_gst: selfSaleExclGst,
      self_sale_incl_gst: selfSaleInclGst,
      outsource_sale_excl_gst: outsourceSaleExclGst,
      outsource_sale_incl_gst: outsourceSaleInclGst,
      total_sale_excl_gst: totalSaleExclGst,
      total_sale_incl_gst: totalSaleInclGst,
      mtd_self_sale_excl_gst: mtdSelfSaleExclGst ?? null,
      mtd_self_sale_incl_gst: mtdSelfSaleInclGst ?? null,
      mtd_outsource_sale_excl_gst: mtdOutsourceSaleExclGst ?? null,
      mtd_outsource_sale_incl_gst: mtdOutsourceSaleInclGst ?? null,
      mtd_total_sale_excl_gst: mtdTotalSaleExclGst ?? null,
      mtd_total_sale_incl_gst: mtdTotalSaleInclGst ?? null,
      remarks: remarks || '',
      show_revenue: showRevenue !== false,
      show_stock_valuation: showStockValuation !== false,
      show_fg_produced: showFgProduced !== false,
      show_machines: showMachines !== false,
      updated_at: new Date().toISOString(),
      created_by: user || 'System'
    }, { onConflict: 'report_date' });

  if (reportError) {
    console.error('Error saving plant MIS report:', reportError);
    throw reportError;
  }

  // 2. Refresh FG items (NO SCRAP BOX)
  await supabase
    .from('daily_plant_mis_fg_items')
    .delete()
    .eq('report_date', reportDate);

  if (fgItems && fgItems.length > 0) {
    const fgRows = fgItems.map((item, index) => ({
      report_date: reportDate,
      vendor_name: item.vendorName,
      item_name: item.itemName,
      qty_box: item.qtyBox,
      scrap_box: 0,
      sort_order: index + 1
    }));

    const { error: fgError } = await supabase
      .from('daily_plant_mis_fg_items')
      .insert(fgRows);

    if (fgError) {
      console.error('Error inserting FG items:', fgError);
      throw fgError;
    }
  }

  // 3. Refresh Machine Logs
  await supabase
    .from('daily_plant_mis_machine_logs')
    .delete()
    .eq('report_date', reportDate);

  if (machineLogs && machineLogs.length > 0) {
    const machineRows = machineLogs.map((m, index) => ({
      report_date: reportDate,
      machine_name: m.machineName,
      shift: m.shift,
      shift_hours: m.shiftHours,
      shift_timing: m.shiftTiming || null,
      status: m.status,
      running_sq_mtr: m.runningSqMtr,
      running_kg: m.runningKg,
      total_ply: m.totalPly,
      total_paper: m.totalPaper,
      scrap_kg: m.scrapKg,
      scrap_sheet: m.scrapSheet,
      notes: m.notes || null,
      sort_order: index + 1,
      cut_size_breakdown: m.cutSizeBreakdown || []
    }));

    const { error: mError } = await supabase
      .from('daily_plant_mis_machine_logs')
      .insert(machineRows);

    if (mError) {
      console.error('Error inserting machine logs:', mError);
      throw mError;
    }
  }

  await logActivity({
    user: user || 'User',
    action: 'SAVED_PLANT_MIS_REPORT',
    entity: 'PlantDailyMIS',
    referenceId: reportDate,
    details: `Plant Daily MIS saved for ${reportDate} (Total: ₹${totalSaleInclGst.toLocaleString('en-IN')})`
  });
};

export const saveSingleMachineCutSizes = async (
  reportDate: string,
  machineName: string,
  shift: string,
  runningSqMtr: number,
  totalQty: number,
  items: CutSizeItem[]
): Promise<void> => {
  const isCorrugationOrPasting = machineName.toLowerCase().includes('corrugation') || machineName.toLowerCase().includes('pasting');

  const updatePayload: any = {
    running_sq_mtr: runningSqMtr,
    cut_size_breakdown: items
  };

  if (isCorrugationOrPasting) {
    updatePayload.total_ply = totalQty;
  } else {
    updatePayload.total_paper = totalQty;
  }

  const { error } = await supabase
    .from('daily_plant_mis_machine_logs')
    .update(updatePayload)
    .eq('report_date', reportDate)
    .eq('machine_name', machineName)
    .eq('shift', shift);

  if (error) {
    console.error('Error updating machine cut sizes:', error);
    throw error;
  }
};

export const getFinishGoodsStockValuation = async (_asOfDate?: string): Promise<FgStockValuation> => {
  const { data: fgList, error } = await supabase
    .from('finish_goods')
    .select('firestore_document_id, closing_balance, non_moving_balance, rate')
    .eq('is_archived', false);

  if (error || !fgList) {
    console.error('Error fetching FG stock valuation:', error);
    return {
      regularValue: 0,
      nonMovingValue: 0,
      totalValue: 0,
      regularBoxes: 0,
      nonMovingBoxes: 0,
      totalBoxes: 0
    };
  }

  let regularValue = 0;
  let nonMovingValue = 0;
  let regularBoxes = 0;
  let nonMovingBoxes = 0;

  fgList.forEach((row: any) => {
    const rate = Number(row.rate) || 0;
    const regBal = Number(row.closing_balance) || 0;
    const nonBal = Number(row.non_moving_balance) || 0;

    regularBoxes += regBal;
    nonMovingBoxes += nonBal;
    regularValue += regBal * rate;
    nonMovingValue += nonBal * rate;
  });

  return {
    regularValue: Number(regularValue.toFixed(2)),
    nonMovingValue: Number(nonMovingValue.toFixed(2)),
    totalValue: Number((regularValue + nonMovingValue).toFixed(2)),
    regularBoxes: Math.round(regularBoxes),
    nonMovingBoxes: Math.round(nonMovingBoxes),
    totalBoxes: Math.round(regularBoxes + nonMovingBoxes)
  };
};

export const getAutoFillProducedFgForDate = async (dateStr: string): Promise<Array<{ vendorName: string; itemName: string; qtyBox: number }>> => {
  // 1. Fetch Inward Finish Good Transactions for that date (Production Inward)
  const { data: txData } = await supabase
    .from('finish_good_transactions')
    .select('customer_name, product_name, quantity, type, category, date, transaction_date')
    .eq('type', 'IN');

  const filteredTx = (txData || []).filter((tx: any) => {
    const d = (tx.transaction_date || tx.date || '').split('T')[0];
    return d === dateStr;
  });

  // 2. Fetch Completed Job Cards for that date
  const { data: jcData } = await supabase
    .from('job_cards')
    .select('customer_name, product_name, total_po_qty, completed_at, status')
    .eq('status', 'COMPLETED');

  const filteredJc = (jcData || []).filter((jc: any) => {
    const d = (jc.completed_at || '').split('T')[0];
    return d === dateStr;
  });

  const grouped: Record<string, { vendorName: string; itemName: string; qtyBox: number }> = {};

  filteredTx.forEach((row: any) => {
    const vendor = (row.customer_name || 'Direct Customer').trim();
    const item = (row.product_name || 'Standard Box').trim();
    const key = `${vendor}___${item}`.toUpperCase();

    if (!grouped[key]) {
      grouped[key] = { vendorName: vendor, itemName: item, qtyBox: 0 };
    }
    grouped[key].qtyBox += Number(row.quantity) || 0;
  });

  filteredJc.forEach((row: any) => {
    const vendor = (row.customer_name || 'Direct Customer').trim();
    const item = (row.product_name || 'Standard Box').trim();
    const key = `${vendor}___${item}`.toUpperCase();

    if (!grouped[key]) {
      grouped[key] = { vendorName: vendor, itemName: item, qtyBox: 0 };
    }
    // Only add if not already captured from inward tx to avoid double count
    if (!grouped[key].qtyBox) {
      grouped[key].qtyBox = Number(row.total_po_qty) || 0;
    }
  });

  return Object.values(grouped).sort((a, b) => b.qtyBox - a.qtyBox);
};

export const getAutoFillDispatchesForDate = async (dateStr: string): Promise<Array<{ vendorName: string; itemName: string; qtyBox: number; scrapBox: number }>> => {
  const { data, error } = await supabase
    .from('finish_good_transactions')
    .select('customer_name, product_name, quantity, type, category')
    .eq('date', dateStr)
    .eq('type', 'OUT');

  if (error) {
    console.error('Error fetching FG dispatches for autofill:', error);
    return [];
  }

  // Aggregate by customer_name and product_name
  const grouped: Record<string, { vendorName: string; itemName: string; qtyBox: number; scrapBox: number }> = {};

  (data || []).forEach(row => {
    const vendor = (row.customer_name || 'Direct / Other').trim();
    const item = (row.product_name || 'Standard Box').trim();
    const key = `${vendor}___${item}`.toUpperCase();

    if (!grouped[key]) {
      grouped[key] = {
        vendorName: vendor,
        itemName: item,
        qtyBox: 0,
        scrapBox: 0
      };
    }
    grouped[key].qtyBox += Number(row.quantity) || 0;
  });

  return Object.values(grouped).sort((a, b) => b.qtyBox - a.qtyBox);
};

export const getMachineHistory = async (machineName: string, fromDate: string, toDate: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from('daily_plant_mis_machine_logs')
    .select('*, daily_plant_mis_reports(report_date, total_sale_incl_gst)')
    .eq('machine_name', machineName)
    .gte('report_date', fromDate)
    .lte('report_date', toDate)
    .order('report_date', { ascending: true });

  if (error) {
    console.error('Error fetching machine history:', error);
    return [];
  }

  return data || [];
};

export const getDistinctMachineNames = async (): Promise<string[]> => {
  const { data } = await supabase
    .from('daily_plant_mis_machine_logs')
    .select('machine_name')
    .limit(200);

  const set = new Set<string>();
  DEFAULT_PRESET_MACHINES.forEach(m => set.add(m.machineName));
  (data || []).forEach(row => {
    if (row.machine_name) set.add(row.machine_name);
  });

  return Array.from(set);
};

export const ensureReportExists = async (reportDate: string): Promise<void> => {
  const { data } = await supabase
    .from('daily_plant_mis_reports')
    .select('id')
    .eq('report_date', reportDate)
    .maybeSingle();

  if (!data) {
    await supabase.from('daily_plant_mis_reports').insert({
      report_date: reportDate,
      self_sale_excl_gst: 0,
      self_sale_incl_gst: 0,
      outsource_sale_excl_gst: 0,
      outsource_sale_incl_gst: 0,
      total_sale_excl_gst: 0,
      total_sale_incl_gst: 0,
      show_revenue: true,
      show_stock_valuation: true,
      show_fg_produced: true,
      show_machines: true,
      updated_at: new Date().toISOString(),
      created_by: 'System'
    });
  }
};

export const toggleReportSection = async (
  reportDate: string,
  section: 'showRevenue' | 'showStockValuation' | 'showFgProduced' | 'showMachines',
  isVisible: boolean
): Promise<void> => {
  await ensureReportExists(reportDate);

  const colMap = {
    showRevenue: 'show_revenue',
    showStockValuation: 'show_stock_valuation',
    showFgProduced: 'show_fg_produced',
    showMachines: 'show_machines'
  };
  const colName = colMap[section];

  const { error } = await supabase
    .from('daily_plant_mis_reports')
    .update({ [colName]: isVisible, updated_at: new Date().toISOString() })
    .eq('report_date', reportDate);

  if (error) {
    console.error(`Error toggling section ${section}:`, error);
    throw error;
  }
};

export const deleteMachineFromDate = async (
  reportDate: string,
  machineName: string,
  shift: string,
  currentMachines: PlantMisMachineLog[]
): Promise<void> => {
  await ensureReportExists(reportDate);

  const { data: existingRows } = await supabase
    .from('daily_plant_mis_machine_logs')
    .select('id')
    .eq('report_date', reportDate);

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase
      .from('daily_plant_mis_machine_logs')
      .delete()
      .eq('report_date', reportDate)
      .eq('machine_name', machineName)
      .eq('shift', shift);
    if (error) throw error;
  } else {
    // If table didn't have entries yet for this date, seed with the others except this one
    const remaining = currentMachines.filter(
      m => !(m.machineName === machineName && m.shift === shift)
    );
    if (remaining.length > 0) {
      const rows = remaining.map((m, idx) => ({
        report_date: reportDate,
        machine_name: m.machineName,
        shift: m.shift,
        shift_hours: m.shiftHours,
        shift_timing: m.shiftTiming || null,
        status: m.status,
        running_sq_mtr: m.runningSqMtr,
        running_kg: m.runningKg,
        total_ply: m.totalPly,
        total_paper: m.totalPaper,
        scrap_kg: m.scrapKg,
        scrap_sheet: m.scrapSheet,
        notes: m.notes || null,
        sort_order: idx + 1,
        cut_size_breakdown: m.cutSizeBreakdown || []
      }));
      const { error } = await supabase.from('daily_plant_mis_machine_logs').insert(rows);
      if (error) throw error;
    }
  }
};

export const addMachineToDate = async (
  reportDate: string,
  machine: Omit<PlantMisMachineLog, 'reportDate' | 'id'>,
  currentMachines: PlantMisMachineLog[]
): Promise<void> => {
  await ensureReportExists(reportDate);

  const { data: existingRows } = await supabase
    .from('daily_plant_mis_machine_logs')
    .select('id')
    .eq('report_date', reportDate);

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase.from('daily_plant_mis_machine_logs').insert({
      report_date: reportDate,
      machine_name: machine.machineName,
      shift: machine.shift,
      shift_hours: machine.shiftHours,
      shift_timing: machine.shiftTiming || null,
      status: machine.status,
      running_sq_mtr: machine.runningSqMtr,
      running_kg: machine.runningKg,
      total_ply: machine.totalPly,
      total_paper: machine.totalPaper,
      scrap_kg: machine.scrapKg,
      scrap_sheet: machine.scrapSheet,
      notes: machine.notes || null,
      sort_order: (currentMachines.length || 0) + 1,
      cut_size_breakdown: machine.cutSizeBreakdown || []
    });
    if (error) throw error;
  } else {
    // Seed existing machines + new machine
    const all = [...currentMachines, { ...machine, reportDate }];
    const rows = all.map((m, idx) => ({
      report_date: reportDate,
      machine_name: m.machineName,
      shift: m.shift,
      shift_hours: m.shiftHours,
      shift_timing: m.shiftTiming || null,
      status: m.status,
      running_sq_mtr: m.runningSqMtr,
      running_kg: m.runningKg,
      total_ply: m.totalPly,
      total_paper: m.totalPaper,
      scrap_kg: m.scrapKg,
      scrap_sheet: m.scrapSheet,
      notes: m.notes || null,
      sort_order: idx + 1,
      cut_size_breakdown: m.cutSizeBreakdown || []
    }));
    const { error } = await supabase.from('daily_plant_mis_machine_logs').insert(rows);
    if (error) throw error;
  }
};

export const restoreAllPresetMachinesForDate = async (reportDate: string): Promise<void> => {
  await ensureReportExists(reportDate);

  await supabase
    .from('daily_plant_mis_machine_logs')
    .delete()
    .eq('report_date', reportDate);

  const rows = DEFAULT_PRESET_MACHINES.map((m, idx) => ({
    report_date: reportDate,
    machine_name: m.machineName,
    shift: m.shift,
    shift_hours: m.shiftHours,
    shift_timing: m.shiftTiming || null,
    status: m.status,
    running_sq_mtr: m.runningSqMtr,
    running_kg: m.runningKg,
    total_ply: m.totalPly,
    total_paper: m.totalPaper,
    scrap_kg: m.scrapKg,
    scrap_sheet: m.scrapSheet,
    notes: m.notes || null,
    sort_order: idx + 1,
    cut_size_breakdown: []
  }));

  const { error } = await supabase.from('daily_plant_mis_machine_logs').insert(rows);
  if (error) throw error;
};


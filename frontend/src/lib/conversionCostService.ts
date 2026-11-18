import { supabase } from './supabase/config';
import { logActivity } from './supabase/activityLogService';
import { getReels, getReelTransactions } from './supabase/reelService';
import { getFinishGoodTransactions } from './supabase/finishGoodService';
import { getRawMaterials, getRawMaterialTransactions } from './supabase/rmService';
import { getAttendanceByMonth, type AttendanceRecord } from './supabase/attendanceService';
import { getMonthlyReports } from './supabase/mrService';
import { getMonthlyExpenseAggregates, getExpenseCategories } from './supabase/cashLedgerService';
import type { MonthlyReport } from './types/models';

export const DEFAULT_STANDARD_CONVERSION_COST = 12;
const STANDARD_RATE_STORAGE_KEY = 'packwell_standard_conversion_cost';
const STANDARD_RATE_ENTITY = 'conversion_cost_settings';

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Engineer Food and Lodge Expense",
  "Interest on OD A/c",
  "Freight Outward Charges",
  "Salary with Director Remuneration",
  "Client Welfare / Commission",
  "Staff Welfare & Pantry Exp.",
  "Freight Inward Charges",
  "Conveyance & Bike Petrol Expense",
  "AMC Charges and Factory Insurance Exp",
  "Machine Exp",
  "Factory Rent Exp",
  "Plant Exp",
  "Office & Stationery Exp",
  "Legal Expenses",
  "DG Diesel",
  "DG Rent",
  "Electricity Bill",
  "LPG Cylinder",
  "Forklift Diesel",
  "Consumable Goods (Excl. Gas)",
];

export interface StandardConversionCostInfo {
  rate: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface StandardConversionCostHistoryItem {
  id: string;
  rate: number;
  previousRate?: number;
  action: string;
  updatedBy: string;
  updatedAt: string;
}

export interface MonthlyConversionMetrics {
  month: string;
  totalOperationalExpenses: number;
  totalPaperConsumedKg: number;
  totalPaperConsumedAmt: number;
  actualConversionCostPerKg: number;
  activeExpenseCount: number;
  expenseBreakdown: Array<{ name: string; amount: number }>;
}

/**
 * Deterministic YYYY-MM month bounds helper.
 */
export const getSafeMonthBounds = (targetMonth: string) => {
  if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return {
      monthStart: `${y}-${m}-01`,
      monthEnd: `${y}-${m}-01`,
      safeMonth: `${y}-${m}`,
    };
  }
  const [yStr, mStr] = targetMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const monthStart = `${yStr}-${mStr}-01`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { monthStart, monthEnd, safeMonth: targetMonth };
};

/**
 * Robust date matching helper for transactions (ISO, DD-MM-YYYY, DD/MM/YYYY, '31 Aug 2026').
 */
export const isDateInTargetMonth = (dateStr?: string | null, targetMonth: string = '2026-08'): boolean => {
  if (!dateStr || !targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return false;
  const str = String(dateStr).trim();
  if (str.startsWith(targetMonth)) return true;

  const parts = targetMonth.split('-');
  if (parts.length === 2) {
    const y = parts[0];
    const m = parts[1];
    const mNum = parseInt(m, 10);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthName = monthNames[mNum - 1];

    if (monthName && str.toLowerCase().includes(monthName) && str.includes(y)) {
      return true;
    }

    if (str.includes(y)) {
      if (str.includes(`/${m}/`) || str.includes(`-${m}-`) || str.includes(`/${mNum}/`) || str.includes(`-${mNum}-`)) {
        return true;
      }
    }
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const parsedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (parsedMonth === targetMonth) return true;
    }
  } catch {
    // Ignore invalid date strings
  }

  return false;
};

export const getCachedStandardConversionCost = (): number => {
  try {
    const raw = localStorage.getItem(STANDARD_RATE_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_STANDARD_CONVERSION_COST;
};

export const getStandardConversionCost = async (): Promise<StandardConversionCostInfo> => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('details, app_user, logged_at')
      .eq('entity', STANDARD_RATE_ENTITY)
      .order('logged_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const row = data[0];
      if (row.details) {
        const parsed = JSON.parse(row.details);
        const rate = Number(parsed?.standardRate);
        if (Number.isFinite(rate) && rate >= 0) {
          try {
            localStorage.setItem(STANDARD_RATE_STORAGE_KEY, String(rate));
          } catch {
            // Ignore storage write errors
          }
          return {
            rate,
            updatedBy: row.app_user,
            updatedAt: row.logged_at,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Could not read standard conversion cost from Supabase, using cached/default:', err);
  }

  return {
    rate: getCachedStandardConversionCost(),
    updatedBy: null,
    updatedAt: null,
  };
};

export const getStandardConversionCostHistory = async (limit: number = 15): Promise<StandardConversionCostHistoryItem[]> => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('firestore_document_id, action, details, app_user, logged_at')
      .eq('entity', STANDARD_RATE_ENTITY)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data
      .map((row) => {
        try {
          const parsed = row.details ? JSON.parse(row.details) : {};
          const rate = Number(parsed?.standardRate);
          if (!Number.isFinite(rate)) return null;
          return {
            id: row.firestore_document_id,
            rate,
            previousRate: parsed?.previousRate !== undefined ? Number(parsed.previousRate) : undefined,
            action: row.action || `Standard Conversion Cost set to ₹${rate}/Kg`,
            updatedBy: row.app_user || 'System',
            updatedAt: row.logged_at || '',
          } as StandardConversionCostHistoryItem;
        } catch {
          return null;
        }
      })
      .filter((x): x is StandardConversionCostHistoryItem => x !== null);
  } catch (err) {
    console.warn('Failed to load conversion cost history:', err);
    return [];
  }
};

export const saveStandardConversionCost = async (
  newRate: number,
  user: string,
  previousRate?: number
): Promise<number> => {
  const cleanRate = Math.round(Number(newRate) * 100) / 100;
  if (!Number.isFinite(cleanRate) || cleanRate < 0) {
    throw new Error('Please enter a valid non-negative Conversion Cost (₹/Kg).');
  }

  try {
    localStorage.setItem(STANDARD_RATE_STORAGE_KEY, String(cleanRate));
  } catch {
    // Ignore storage write errors
  }

  const prev = previousRate !== undefined ? Math.round(Number(previousRate) * 100) / 100 : undefined;

  await logActivity({
    user: user || 'System',
    entity: STANDARD_RATE_ENTITY,
    referenceId: 'STANDARD_CONVERSION_COST',
    action:
      prev !== undefined
        ? `Updated Standard Conversion Cost: ₹${prev}/Kg → ₹${cleanRate}/Kg`
        : `Set Standard Conversion Cost to ₹${cleanRate}/Kg`,
    details: JSON.stringify({
      standardRate: cleanRate,
      previousRate: prev,
    }),
  });

  return cleanRate;
};

interface ComputeMetricsParams {
  month: string;
  reels: any[];
  reelTxns: any[];
  fgTransactions: any[];
  monthAttendance: AttendanceRecord[];
  rmList: any[];
  rmTransactions: any[];
  cashLedgerExpenseTotals: Record<string, number>;
  dbCategories: string[];
  report?: MonthlyReport | null;
}

/**
 * Pure calculation matching MR.tsx (Profit & Loss) so Actual Conversion Cost
 * is 100% consistent across P&L, Conversion Cost page, and Global Header.
 */
export const computeMonthlyConversionMetrics = ({
  month,
  reels,
  reelTxns,
  fgTransactions,
  monthAttendance,
  rmList,
  rmTransactions,
  cashLedgerExpenseTotals,
  dbCategories,
  report,
}: ComputeMetricsParams): MonthlyConversionMetrics => {
  const manualData: Record<string, number> = {};
  const customExpenses: string[] = [];

  if (report?.expenses) {
    report.expenses.forEach((e) => {
      manualData[e.name] = e.amount;
      if (e.name.startsWith('CUSTOM_EXP:')) {
        const expName = e.name.replace('CUSTOM_EXP:', '');
        if (expName && !customExpenses.includes(expName) && !DEFAULT_EXPENSE_CATEGORIES.includes(expName)) {
          customExpenses.push(expName);
        }
      } else if (e.name.startsWith('EXP:')) {
        const expName = e.name.replace('EXP:', '');
        if (expName && !customExpenses.includes(expName) && !DEFAULT_EXPENSE_CATEGORIES.includes(expName)) {
          customExpenses.push(expName);
        }
      }
    });
  }

  // 1. Paper Consumption (Kg & Amount)
  const paperStats: Record<string, { conQty: number; conAmt: number }> = {
    'Semi Kraft': { conQty: 0, conAmt: 0 },
    'Virgin Kraft': { conQty: 0, conAmt: 0 },
    Chennai: { conQty: 0, conAmt: 0 },
    Others: { conQty: 0, conAmt: 0 },
  };

  const reelMap = new Map<string, { type: string; rate: number }>();
  (reels || []).forEach((r) => {
    let type = 'Semi Kraft';
    const pt = (r.paperType || '').toLowerCase();
    if (pt.includes('virgin') || pt.includes('vk')) type = 'Virgin Kraft';
    else if (pt.includes('chennai') || pt.includes('duplex')) type = 'Chennai';
    else if (pt.includes('other')) type = 'Others';
    else if (pt.includes('sk') || pt.includes('semi')) type = 'Semi Kraft';
    else if (pt.trim() !== '') type = 'Others';
    if (r.id) {
      reelMap.set(r.id, { type, rate: r.rate || 0 });
    }
  });

  const { monthStart, monthEnd } = getSafeMonthBounds(month);

  (reelTxns || []).forEach((txn) => {
    const reelInfo = reelMap.get(txn.reelId);
    if (!reelInfo) return;

    const type = reelInfo.type && paperStats[reelInfo.type] ? reelInfo.type : 'Semi Kraft';
    const rate = reelInfo.rate || 0;
    const date = txn.date;
    const qty = Number(txn.quantity) || 0;
    const amt = qty * rate;
    const isAuditTxn = (txn.notes || '').toLowerCase().includes('audit');

    if (date >= monthStart && date < monthEnd && !isAuditTxn) {
      if (txn.type === 'OUTWARD' || txn.type === 'ALLOCATION') {
        paperStats[type].conQty += qty;
        paperStats[type].conAmt += amt;
      }
    }
  });

  Object.keys(paperStats).forEach((type) => {
    const manualConQty = manualData[`PAPER:${type}:CON_QTY`];
    const manualConAmt = manualData[`PAPER:${type}:CON_AMT`];
    if (manualConQty !== undefined) paperStats[type].conQty = manualConQty;
    if (manualConAmt !== undefined) paperStats[type].conAmt = manualConAmt;
  });

  const totalPaperConsumedKg = Object.values(paperStats).reduce((acc, s) => acc + s.conQty, 0);
  const totalPaperConsumedAmt = Object.values(paperStats).reduce((acc, s) => acc + s.conAmt, 0);

  // 2. Auto Freight Outward
  const outwards = (fgTransactions || []).filter((t) => t.type === 'OUT' && (t.invoiceNo || t.freight || t.holding));
  const invoiceMap = new Map<string, number>();
  outwards.forEach((tx) => {
    const rawDate = tx.date || tx.createdAt || '';
    if (isDateInTargetMonth(rawDate, month)) {
      const key = tx.invoiceNo ? `INV:${tx.invoiceNo}` : `TX:${tx.id}`;
      if (!invoiceMap.has(key)) {
        const fr = Number(tx.freight) || 0;
        const hl = Number(tx.holding) || 0;
        const pt = Number(tx.point) || 0;
        const ot = Number(tx.others) || 0;
        invoiceMap.set(key, fr + hl + pt + ot);
      }
    }
  });
  const autoFreightOutward = Array.from(invoiceMap.values()).reduce((sum, val) => sum + val, 0);

  // 3. Auto Salary & Wages
  const autoSalaryWages = Math.round(
    (monthAttendance || []).reduce((sum, r) => {
      const daysAmt = Number(r.perDayAmount) || 0;
      const otAmt = Number(r.otAmount) || 0;
      const refAmt = Number(r.refreshment) || 0;
      return sum + daysAmt + otAmt + refAmt;
    }, 0)
  );

  // 4. Auto Consumables & LPG
  const rmMap = new Map<string, { rate: number; name: string }>();
  (rmList || []).forEach((rm) => {
    if (rm.id) {
      rmMap.set(rm.id, { rate: Number(rm.rate) || 0, name: rm.name || '' });
    }
  });

  let consumableSum = 0;
  let lpgSum = 0;
  (rmTransactions || []).forEach((t) => {
    const txDate = t.date || t.createdAt;
    if (!isDateInTargetMonth(txDate, month)) return;

    let include = false;
    if (t.type === 'OUT') include = true;
    else if (t.type === 'ADJUSTMENT') {
      const ref = t.referenceNo || '';
      if (ref.includes('Diff: -') || ref.includes('(-') || ref.includes('Audit')) {
        include = true;
      }
    }
    if (!include) return;

    const rmInfo = t.rawMaterialId ? rmMap.get(t.rawMaterialId) : null;
    const itemRate = t.rate || (rmInfo ? rmInfo.rate : 0) || 0;
    const amt = t.amount !== undefined && t.amount > 0 ? t.amount : t.quantity * itemRate;
    const itemName = (rmInfo ? rmInfo.name : '').toLowerCase();

    if (itemName.includes('lpg gas 33kg') || itemName.includes('lpg cylinder')) {
      lpgSum += amt;
    } else {
      consumableSum += amt;
    }
  });
  const autoConsumableGoods = Math.round(consumableSum);
  const autoLpgCylinder = Math.round(lpgSum);

  // 5. All Expense Categories
  const allExpensesList = Array.from(
    new Set([
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...customExpenses,
      ...(dbCategories || []),
      ...Object.keys(cashLedgerExpenseTotals || {}),
    ])
  ).filter(Boolean);

  const getAutoExpenseValue = (cat: string): number => {
    if (cat === 'Freight Outward Charges') {
      if (month >= '2026-10' && cashLedgerExpenseTotals[cat] !== undefined && cashLedgerExpenseTotals[cat] > 0) {
        return cashLedgerExpenseTotals[cat];
      }
      return autoFreightOutward;
    }
    if (cat === 'Salary with Director Remuneration') {
      return autoSalaryWages;
    }
    if (cat === 'Consumable Goods (Excl. Gas)' || cat === 'Consumable Goods') {
      return autoConsumableGoods;
    }
    if (cat === 'LPG Cylinder') {
      return autoLpgCylinder;
    }
    if (month >= '2026-10' && cashLedgerExpenseTotals[cat] !== undefined && cashLedgerExpenseTotals[cat] > 0) {
      return cashLedgerExpenseTotals[cat];
    }
    return 0;
  };

  const getEffectiveExpenseValue = (cat: string): number => {
    const isManualLocked = manualData[`EXP_MANUAL:${cat}`] === 1;
    const manualVal = manualData[`EXP:${cat}`];
    if (isManualLocked) {
      return manualVal || 0;
    }
    const autoVal = getAutoExpenseValue(cat);
    if (autoVal > 0) {
      return autoVal;
    }
    return manualVal || 0;
  };

  const expenseBreakdown: Array<{ name: string; amount: number }> = [];
  let totalOperationalExpenses = 0;

  allExpensesList.forEach((exp) => {
    const amt = getEffectiveExpenseValue(exp);
    if (amt > 0) {
      expenseBreakdown.push({ name: exp, amount: amt });
      totalOperationalExpenses += amt;
    }
  });

  expenseBreakdown.sort((a, b) => b.amount - a.amount);

  const actualConversionCostPerKg =
    totalPaperConsumedKg > 0 ? totalOperationalExpenses / totalPaperConsumedKg : 0;

  return {
    month,
    totalOperationalExpenses,
    totalPaperConsumedKg,
    totalPaperConsumedAmt,
    actualConversionCostPerKg,
    activeExpenseCount: expenseBreakdown.length,
    expenseBreakdown,
  };
};

export const fetchMultiMonthConversionMetrics = async (
  months: string[]
): Promise<Record<string, MonthlyConversionMetrics>> => {
  const uniqueMonths = Array.from(new Set(months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))));
  if (uniqueMonths.length === 0) return {};

  const [reels, reelTxns, fgTransactions, rmList, rmTransactions, dbCategories, reports, ...perMonthResults] =
    await Promise.all([
      getReels(),
      getReelTransactions(),
      getFinishGoodTransactions(),
      getRawMaterials(),
      getRawMaterialTransactions(),
      getExpenseCategories(),
      getMonthlyReports(),
      ...uniqueMonths.map(async (m) => {
        const [attendance, cashAggregates] = await Promise.all([
          getAttendanceByMonth(m),
          getMonthlyExpenseAggregates(m),
        ]);
        return { month: m, attendance, cashAggregates };
      }),
    ]);

  const result: Record<string, MonthlyConversionMetrics> = {};

  perMonthResults.forEach(({ month, attendance, cashAggregates }) => {
    const report = reports.find((r) => r.month === month) || null;
    result[month] = computeMonthlyConversionMetrics({
      month,
      reels,
      reelTxns,
      fgTransactions,
      monthAttendance: attendance,
      rmList,
      rmTransactions,
      cashLedgerExpenseTotals: cashAggregates,
      dbCategories,
      report,
    });
  });

  return result;
};

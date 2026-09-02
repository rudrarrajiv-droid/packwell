import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReels, getReelTransactions } from '../lib/supabase/reelService';
import { getFinishGoods, getFinishGoodTransactions } from '../lib/supabase/finishGoodService';
import { getRawMaterials, getRawMaterialTransactions } from '../lib/supabase/rmService';
import { getScrapEntries } from '../lib/supabase/scrapService';
import { getAttendanceByMonth } from '../lib/supabase/attendanceService';
import { getOrCreateMonthlyReport, saveBatchMonthlyExpenses } from '../lib/supabase/mrService';
import { useAuth } from '../contexts/AuthContext';
import { 
  Loader2, Save, Printer, Plus, Trash2, CheckCircle2,
  TrendingUp, TrendingDown, DollarSign, Wallet, Package, Layers,
  Receipt, Scale, ArrowUpRight, ArrowDownRight, Sparkles, SlidersHorizontal,
  ChevronDown, X, Building2, HelpCircle, FileDown, FileSpreadsheet, FileText, Search, Truck, RotateCcw, Users, Box
} from 'lucide-react';
import { format } from 'date-fns';
import { exportMRToPDF, exportMRToExcel } from '../lib/mrExportUtils';

const DEFAULT_EXPENSE_CATEGORIES = [
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

const DEFAULT_SISTER_PARTIES = [
  "Diya Industries",
  "PP LABELS",
  "RADHE RADHE",
  "PI"
];

// Helper to format Indian Currency numbers cleanly
const formatINR = (val: number, decimals: number = 0) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
};

// Robust date matching helper for transactions (supports ISO, DD-MM-YYYY, DD/MM/YYYY, '31 Aug 2026')
const isDateInTargetMonth = (dateStr?: string | null, targetMonth: string = '2026-08'): boolean => {
  if (!dateStr) return false;
  const str = String(dateStr).trim();
  if (str.startsWith(targetMonth)) return true;

  const parts = targetMonth.split('-'); // ['2026', '08']
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
  } catch {}

  return false;
};

export default function MR() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), '2026-07'));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Smart dynamic visibility: 'active_only' by default as requested by user
  const [activeOnlyMode, setActiveOnlyMode] = useState(true);
  
  // Custom parties added dynamically
  const [customParties, setCustomParties] = useState<string[]>([]);
  const [userAddedParties, setUserAddedParties] = useState<string[]>([]);
  const [newPartyInput, setNewPartyInput] = useState('');
  const [showSalesPartyDropdown, setShowSalesPartyDropdown] = useState(false);
  const [showReconPartyDropdown, setShowReconPartyDropdown] = useState(false);

  // Custom expenses and explicitly selected expenses
  const [customExpenses, setCustomExpenses] = useState<string[]>([]);
  const [userAddedExpenses, setUserAddedExpenses] = useState<string[]>([
    "Freight Outward Charges",
    "Salary with Director Remuneration",
    "Consumable Goods (Excl. Gas)"
  ]);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [showExpenseDropdown, setShowExpenseDropdown] = useState(false);

  // Refs for click-outside detection
  const expenseDropdownRef = useRef<HTMLDivElement>(null);
  const salesPartyDropdownRef = useRef<HTMLDivElement>(null);
  const reconPartyDropdownRef = useRef<HTMLDivElement>(null);

  // Manual values state
  const [manualData, setManualData] = useState<Record<string, number>>({});

  // Queries
  const { data: reels = [] } = useQuery({ queryKey: ['reels'], queryFn: getReels });
  const { data: reelTxns = [] } = useQuery({ queryKey: ['reelTransactions'], queryFn: getReelTransactions });
  const { data: fgList = [] } = useQuery({ queryKey: ['finishGoods'], queryFn: getFinishGoods });
  const { data: fgTransactions = [] } = useQuery({ queryKey: ['finishGoodTransactions'], queryFn: getFinishGoodTransactions });
  const { data: rmList = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: getRawMaterials });
  const { data: rmTransactions = [] } = useQuery({ queryKey: ['rawMaterialTransactions'], queryFn: () => getRawMaterialTransactions() });
  const { data: scrapList = [] } = useQuery({ queryKey: ['scrapEntries'], queryFn: getScrapEntries });
  const { data: monthAttendance = [] } = useQuery({
    queryKey: ['attendanceMonth', currentMonth],
    queryFn: () => getAttendanceByMonth(currentMonth)
  });
  const { data: report, refetch: refetchReport } = useQuery({
    queryKey: ['mrReport', currentMonth],
    queryFn: () => getOrCreateMonthlyReport(currentMonth, user?.name || 'System')
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expenseDropdownRef.current && !expenseDropdownRef.current.contains(event.target as Node)) {
        setShowExpenseDropdown(false);
      }
      if (salesPartyDropdownRef.current && !salesPartyDropdownRef.current.contains(event.target as Node)) {
        setShowSalesPartyDropdown(false);
      }
      if (reconPartyDropdownRef.current && !reconPartyDropdownRef.current.contains(event.target as Node)) {
        setShowReconPartyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. AUTO-CALCULATE FREIGHT OUTWARD DIRECTLY FROM FREIGHT SHEET / DISPATCH INVOICES
  const autoFreightOutward = useMemo(() => {
    const outwards = fgTransactions.filter(t => t.type === 'OUT' && (t.invoiceNo || t.freight || t.holding));
    const invoiceMap = new Map<string, number>();

    outwards.forEach(tx => {
      const rawDate = tx.date || tx.createdAt || '';
      if (isDateInTargetMonth(rawDate, currentMonth)) {
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

    return Array.from(invoiceMap.values()).reduce((sum, val) => sum + val, 0);
  }, [fgTransactions, currentMonth]);

  // 2. AUTO-CALCULATE SALARY & WAGES DIRECTLY FROM SALARY ATTENDANCE RECORDS
  const autoSalaryWages = useMemo(() => {
    return Math.round(
      (monthAttendance || []).reduce((sum, r) => {
        const daysAmt = Number(r.perDayAmount) || 0;
        const otAmt = Number(r.otAmount) || 0;
        const refAmt = Number(r.refreshment) || 0;
        return sum + daysAmt + otAmt + refAmt;
      }, 0)
    );
  }, [monthAttendance]);

  // 3. AUTO-CALCULATE CONSUMABLE GOODS DIRECTLY FROM RAW MATERIAL OUTWARD VALUES (STRICT MONTH FILTER)
  const autoConsumableGoods = useMemo(() => {
    const rmMap = new Map<string, number>();
    rmList.forEach(rm => {
      if (rm.id) {
        rmMap.set(rm.id, Number(rm.rate) || 0);
      }
    });

    // Check monthly out transactions strictly for currentMonth (including regular OUT and stock reduction AUDIT ADJUSTMENTS)
    const monthlyOutTxns = rmTransactions.filter(t => {
      const txDate = t.date || t.createdAt;
      if (!isDateInTargetMonth(txDate, currentMonth)) return false;

      if (t.type === 'OUT') return true;
      if (t.type === 'ADJUSTMENT') {
        const ref = t.referenceNo || '';
        // If adjustment note has negative difference (Diff: -...) or reduced balance
        if (ref.includes('Diff: -') || ref.includes('(-') || ref.includes('Audit')) {
          return true;
        }
      }
      return false;
    });

    return Math.round(
      monthlyOutTxns.reduce((sum, t) => {
        const itemRate = t.rate || (t.rawMaterialId ? rmMap.get(t.rawMaterialId) : 0) || 0;
        const amt = (t.amount !== undefined && t.amount > 0) ? t.amount : (t.quantity * itemRate);
        return sum + amt;
      }, 0)
    );
  }, [rmList, rmTransactions, currentMonth]);

  // Load saved values from database
  useEffect(() => {
    if (report?.expenses) {
      const map: Record<string, number> = {};
      const loadedCustomParties: string[] = [];
      const loadedCustomExpenses: string[] = [];
      const activeExpNames: string[] = [
        "Freight Outward Charges",
        "Salary with Director Remuneration",
        "Consumable Goods (Excl. Gas)"
      ];

      report.expenses.forEach(e => {
        map[e.name] = e.amount;
        if (e.name.startsWith('CUSTOM_PARTY:')) {
          const pName = e.name.replace('CUSTOM_PARTY:', '');
          if (pName && !loadedCustomParties.includes(pName) && !DEFAULT_SISTER_PARTIES.includes(pName)) {
            loadedCustomParties.push(pName);
          }
        }
        if (e.name.startsWith('CUSTOM_EXP:')) {
          const expName = e.name.replace('CUSTOM_EXP:', '');
          if (expName && !loadedCustomExpenses.includes(expName) && !DEFAULT_EXPENSE_CATEGORIES.includes(expName)) {
            loadedCustomExpenses.push(expName);
          }
        } else if (e.name.startsWith('EXP:')) {
          const expName = e.name.replace('EXP:', '');
          activeExpNames.push(expName);
          if (expName && !loadedCustomExpenses.includes(expName) && !DEFAULT_EXPENSE_CATEGORIES.includes(expName)) {
            loadedCustomExpenses.push(expName);
          }
        }
      });

      setManualData(map);
      if (loadedCustomParties.length > 0) {
        setCustomParties(prev => Array.from(new Set([...prev, ...loadedCustomParties])));
      }
      if (loadedCustomExpenses.length > 0) {
        setCustomExpenses(prev => Array.from(new Set([...prev, ...loadedCustomExpenses])));
      }
      if (activeExpNames.length > 0) {
        setUserAddedExpenses(prev => Array.from(new Set([...prev, ...activeExpNames])));
      }
    }
  }, [report]);

  const handleManualChange = (name: string, value: string) => {
    setManualData(prev => ({ ...prev, [name]: value === '' ? 0 : Number(value) }));
    setSaveSuccess(false);
  };

  const handleAddCustomParty = (nameToAdd?: string) => {
    const trimmed = (nameToAdd || newPartyInput).trim();
    if (!trimmed) return;
    if (!DEFAULT_SISTER_PARTIES.includes(trimmed) && !customParties.includes(trimmed)) {
      setCustomParties(prev => [...prev, trimmed]);
      setManualData(prev => ({ ...prev, [`CUSTOM_PARTY:${trimmed}`]: 1 }));
    }
    setUserAddedParties(prev => Array.from(new Set([...prev, trimmed])));
    setNewPartyInput('');
    setShowSalesPartyDropdown(false);
    setShowReconPartyDropdown(false);
  };

  const handleRemoveParty = (party: string) => {
    setUserAddedParties(prev => prev.filter(p => p !== party));
    if (customParties.includes(party)) {
      setCustomParties(prev => prev.filter(p => p !== party));
    }
    setManualData(prev => {
      const next = { ...prev };
      delete next[`CUSTOM_PARTY:${party}`];
      delete next[`SALE:${party}:WOGST`];
      delete next[`SALE:${party}:WGST`];
      delete next[`PURCHASE:${party}:WOGST`];
      delete next[`PURCHASE:${party}:WGST`];
      return next;
    });
  };

  // Add standard or custom expense category directly to active list
  const handleAddExpenseCategory = (exp: string) => {
    const trimmed = exp.trim();
    if (!trimmed) return;
    
    if (!DEFAULT_EXPENSE_CATEGORIES.includes(trimmed) && !customExpenses.includes(trimmed)) {
      setCustomExpenses(prev => [...prev, trimmed]);
      setManualData(prev => ({
        ...prev,
        [`CUSTOM_EXP:${trimmed}`]: 1,
        [`EXP:${trimmed}`]: prev[`EXP:${trimmed}`] || 0
      }));
    } else {
      setManualData(prev => ({ ...prev, [`EXP:${trimmed}`]: prev[`EXP:${trimmed}`] || 0 }));
    }

    setUserAddedExpenses(prev => Array.from(new Set([...prev, trimmed])));
    setExpenseSearchQuery('');
    setShowExpenseDropdown(false);
  };

  const handleRemoveExpense = (exp: string) => {
    setUserAddedExpenses(prev => prev.filter(e => e !== exp));
    if (customExpenses.includes(exp)) {
      setCustomExpenses(prev => prev.filter(e => e !== exp));
    }
    setManualData(prev => {
      const next = { ...prev };
      delete next[`EXP:${exp}`];
      delete next[`CUSTOM_EXP:${exp}`];
      return next;
    });
  };

  const handleSave = async () => {
    if (!report?.id) return;
    setIsSaving(true);
    try {
      // Ensure auto-mapped values are populated if not manually overridden
      const dataToSave = { ...manualData };
      if ((dataToSave['EXP:Freight Outward Charges'] === undefined || dataToSave['EXP:Freight Outward Charges'] === 0) && autoFreightOutward > 0) {
        dataToSave['EXP:Freight Outward Charges'] = autoFreightOutward;
      }
      if ((dataToSave['EXP:Salary with Director Remuneration'] === undefined || dataToSave['EXP:Salary with Director Remuneration'] === 0) && autoSalaryWages > 0) {
        dataToSave['EXP:Salary with Director Remuneration'] = autoSalaryWages;
      }
      if ((dataToSave['EXP:Consumable Goods (Excl. Gas)'] === undefined || dataToSave['EXP:Consumable Goods (Excl. Gas)'] === 0) && autoConsumableGoods > 0) {
        dataToSave['EXP:Consumable Goods (Excl. Gas)'] = autoConsumableGoods;
      }

      await saveBatchMonthlyExpenses(report.id, dataToSave, user?.name || 'System');
      refetchReport();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to save MR data', e);
      alert('Failed to save report data. Please try again.');
    }
    setIsSaving(false);
  };

  // --- AUTOMATIC CALCULATIONS & MAPPINGS ---

  // 1. PAPER INVENTORY (Opening, Purchase, Consumption, Closing)
  const paperStats = useMemo(() => {
    const stats: Record<string, { opnQty: number; opnAmt: number; purQty: number; purAmt: number; conQty: number; conAmt: number; cloQty: number; cloAmt: number }> = {
      "Semi Kraft": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
      "Virgin Kraft": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
      "Chennai": { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 },
    };

    const reelMap = new Map<string, { type: string; rate: number }>();
    reels.forEach(r => {
      let type = "Semi Kraft";
      const pt = (r.paperType || '').toLowerCase();
      if (pt.includes('virgin') || pt.includes('vk')) type = "Virgin Kraft";
      else if (pt.includes('chennai') || pt.includes('duplex')) type = "Chennai";
      reelMap.set(r.id!, { type, rate: r.rate || 0 });
    });

    const monthStart = `${currentMonth}-01`;
    const nextMonthDate = new Date(`${currentMonth}-01`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEnd = nextMonthDate.toISOString().split('T')[0];

    reelTxns.forEach(txn => {
      const reelInfo = reelMap.get(txn.reelId);
      if (!reelInfo) return;
      const { type, rate } = reelInfo;
      const date = txn.date;
      const qty = Number(txn.quantity) || 0;
      const amt = qty * rate;

      if (date < monthStart) {
        if (txn.type === 'INWARD') {
          stats[type].opnQty += qty;
          stats[type].opnAmt += amt;
        } else if (txn.type === 'OUTWARD' || txn.type === 'ALLOCATION') {
          stats[type].opnQty -= qty;
          stats[type].opnAmt -= amt;
        }
      } else if (date >= monthStart && date < monthEnd) {
        if (txn.type === 'INWARD') {
          stats[type].purQty += qty;
          stats[type].purAmt += amt;
        } else if (txn.type === 'OUTWARD' || txn.type === 'ALLOCATION') {
          stats[type].conQty += qty;
          stats[type].conAmt += amt;
        }
      }
    });

    Object.keys(stats).forEach(type => {
      const manualOpnQty = manualData[`PAPER:${type}:OPN_QTY`];
      const manualOpnAmt = manualData[`PAPER:${type}:OPN_AMT`];
      const manualPurQty = manualData[`PAPER:${type}:PUR_QTY`];
      const manualPurAmt = manualData[`PAPER:${type}:PUR_AMT`];
      const manualConQty = manualData[`PAPER:${type}:CON_QTY`];
      const manualConAmt = manualData[`PAPER:${type}:CON_AMT`];

      if (manualOpnQty !== undefined) stats[type].opnQty = manualOpnQty;
      if (manualOpnAmt !== undefined) stats[type].opnAmt = manualOpnAmt;
      if (manualPurQty !== undefined) stats[type].purQty = manualPurQty;
      if (manualPurAmt !== undefined) stats[type].purAmt = manualPurAmt;
      if (manualConQty !== undefined) stats[type].conQty = manualConQty;
      if (manualConAmt !== undefined) stats[type].conAmt = manualConAmt;

      stats[type].cloQty = stats[type].opnQty + stats[type].purQty - stats[type].conQty;
      stats[type].cloAmt = stats[type].opnAmt + stats[type].purAmt - stats[type].conAmt;
    });

    return stats;
  }, [reels, reelTxns, currentMonth, manualData]);

  const paperTotals = useMemo(() => {
    return Object.values(paperStats).reduce((acc, curr) => ({
      opnQty: acc.opnQty + curr.opnQty,
      opnAmt: acc.opnAmt + curr.opnAmt,
      purQty: acc.purQty + curr.purQty,
      purAmt: acc.purAmt + curr.purAmt,
      conQty: acc.conQty + curr.conQty,
      conAmt: acc.conAmt + curr.conAmt,
      cloQty: acc.cloQty + curr.cloQty,
      cloAmt: acc.cloAmt + curr.cloAmt,
    }), { opnQty: 0, opnAmt: 0, purQty: 0, purAmt: 0, conQty: 0, conAmt: 0, cloQty: 0, cloAmt: 0 });
  }, [paperStats]);

  const allParties = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SISTER_PARTIES, ...customParties]));
  }, [customParties]);

  const allExpensesList = useMemo(() => {
    return Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...customExpenses]));
  }, [customExpenses]);

  // SCRAP (CASH) REVENUE (Displayed for visibility, not added to Nett Sale)
  const cashScrapRevenue = useMemo(() => {
    if (manualData['SALE:SCRAP(CASH):OVERRIDE'] !== undefined) {
      return manualData['SALE:SCRAP(CASH):OVERRIDE'];
    }
    return scrapList
      .filter(s => s.paymentType === 'CASH' && isDateInTargetMonth(s.date, currentMonth))
      .reduce((acc, curr) => acc + (Number(curr.totalValue) || 0), 0);
  }, [scrapList, currentMonth, manualData]);

  // SMART VISIBILITY FOR PARTIES:
  const visibleSaleParties = useMemo(() => {
    if (!activeOnlyMode) return allParties;
    return allParties.filter(party => {
      if (userAddedParties.includes(party)) return true;
      const wogst = manualData[`SALE:${party}:WOGST`] || 0;
      const wgst = manualData[`SALE:${party}:WGST`] || 0;
      const purWogst = manualData[`PURCHASE:${party}:WOGST`] || 0;
      const purWgst = manualData[`PURCHASE:${party}:WGST`] || 0;
      return wogst !== 0 || wgst !== 0 || purWogst !== 0 || purWgst !== 0;
    });
  }, [allParties, activeOnlyMode, userAddedParties, manualData]);

  const inactiveParties = useMemo(() => {
    return allParties.filter(p => !visibleSaleParties.includes(p));
  }, [allParties, visibleSaleParties]);

  // Sales totals (Scrap is shown in table but NOT added to Nett Sale as requested)
  const tallyDataWOGST = manualData['SALE:TALLY DATA:WOGST'] || 0;
  const tallyDataWGST = manualData['SALE:TALLY DATA:WGST'] || 0;
  const creditNoteWOGST = manualData['SALE:CREDIT NOTE:WOGST'] || 0;
  const creditNoteWGST = manualData['SALE:CREDIT NOTE:WGST'] || 0;

  const totalPartySaleWOGST = allParties.reduce((sum, party) => sum + (manualData[`SALE:${party}:WOGST`] || 0), 0);
  const totalPartySaleWGST = allParties.reduce((sum, party) => sum + (manualData[`SALE:${party}:WGST`] || 0), 0);

  const netSaleWithoutGST = (totalPartySaleWOGST + tallyDataWOGST) - creditNoteWOGST;
  const netSaleWithGST = (totalPartySaleWGST + tallyDataWGST) - creditNoteWGST;

  const currentMonthPurchaseWOGST = manualData['PURCHASE:CURRENT_MONTH:WOGST'] || 0;
  const currentMonthPurchaseWGST = manualData['PURCHASE:CURRENT_MONTH:WGST'] || 0;

  // Paper Used:
  const paperUsedWOGST = manualData['PAPER_USED:WOGST'] !== undefined ? manualData['PAPER_USED:WOGST'] : paperTotals.conAmt;
  const paperUsedWGST = manualData['PAPER_USED:WGST'] !== undefined ? manualData['PAPER_USED:WGST'] : Math.round(paperUsedWOGST * 1.18);

  // Reconciliation Party rows:
  const partyPurchases = useMemo(() => {
    return visibleSaleParties.map(party => {
      const purWOGST = manualData[`PURCHASE:${party}:WOGST`] || 0;
      const purWGST = manualData[`PURCHASE:${party}:WGST`] || 0;
      const saleWOGST = manualData[`SALE:${party}:WOGST`] || 0;
      const saleWGST = manualData[`SALE:${party}:WGST`] || 0;

      const diffWOGST = saleWOGST - purWOGST;
      const diffWGST = saleWGST - purWGST;

      return { party, purWOGST, purWGST, saleWOGST, saleWGST, diffWOGST, diffWGST };
    });
  }, [visibleSaleParties, manualData]);

  const scrapCashPurWOGST = manualData['PURCHASE:SCRAP(CASH):WOGST'] || 0;
  const scrapCashPurWGST = manualData['PURCHASE:SCRAP(CASH):WGST'] || 0;
  const scrapCashDiffWOGST = cashScrapRevenue - scrapCashPurWOGST;
  const scrapCashDiffWGST = cashScrapRevenue - scrapCashPurWGST;

  // Grand Total Purchases:
  const gTotalPurchaseWOGST = paperUsedWOGST + partyPurchases.reduce((acc, p) => acc + p.purWOGST, 0);
  const gTotalPurchaseWGST = paperUsedWGST + partyPurchases.reduce((acc, p) => acc + p.purWGST, 0);

  // Differences:
  const grandDiffWOGST = netSaleWithoutGST - gTotalPurchaseWOGST;
  const grandDiffWGST = netSaleWithGST - gTotalPurchaseWGST;

  // Helper to resolve effective expense amount (mapped to Freight Sheet, Salary Sheet, and RM Sheet if not overridden)
  const getEffectiveExpenseValue = (cat: string): number => {
    const manualVal = manualData[`EXP:${cat}`];
    if (manualVal !== undefined && manualVal !== 0) {
      return manualVal;
    }
    if (cat === "Freight Outward Charges") {
      return autoFreightOutward;
    }
    if (cat === "Salary with Director Remuneration") {
      return autoSalaryWages;
    }
    if (cat === "Consumable Goods (Excl. Gas)" || cat === "Consumable Goods") {
      return autoConsumableGoods;
    }
    return manualVal || 0;
  };

  // SMART VISIBILITY FOR EXPENSES:
  const visibleExpenses = useMemo(() => {
    if (!activeOnlyMode) return allExpensesList;
    return allExpensesList.filter(exp => {
      if (
        exp === "Freight Outward Charges" || 
        exp === "Salary with Director Remuneration" ||
        exp === "Consumable Goods (Excl. Gas)"
      ) return true; // Always visible as core auto-mapped items
      if (userAddedExpenses.includes(exp)) return true;
      const amt = getEffectiveExpenseValue(exp);
      return amt !== undefined && amt !== 0;
    });
  }, [activeOnlyMode, allExpensesList, userAddedExpenses, manualData, autoFreightOutward, autoSalaryWages, autoConsumableGoods]);

  const unselectedExpenses = useMemo(() => {
    return allExpensesList.filter(e => !visibleExpenses.includes(e));
  }, [allExpensesList, visibleExpenses]);

  // Filtered dropdown list based on search query
  const filteredAvailableExpenses = useMemo(() => {
    const query = expenseSearchQuery.toLowerCase().trim();
    if (!query) return unselectedExpenses;
    return unselectedExpenses.filter(e => e.toLowerCase().includes(query));
  }, [unselectedExpenses, expenseSearchQuery]);

  // Operational Expenses calculation
  const totalExpenses = useMemo(() => {
    return allExpensesList.reduce((acc, cat) => acc + getEffectiveExpenseValue(cat), 0);
  }, [allExpensesList, manualData, autoFreightOutward, autoSalaryWages, autoConsumableGoods]);

  // NET PROFIT
  const netProfit = grandDiffWOGST - totalExpenses;
  const profitMarginPercent = netSaleWithoutGST > 0 ? ((netProfit / netSaleWithoutGST) * 100).toFixed(1) : '0';

  // Stock Valuations
  const fgStockValue = useMemo(() => fgList.reduce((acc, curr) => acc + ((curr.closingBalance || 0) * (curr.rate || 0)), 0), [fgList]);
  const nonMovingStockValue = useMemo(() => fgList.reduce((acc, curr) => acc + ((curr.nonMovingBalance || 0) * (curr.rate || 0)), 0), [fgList]);
  const rmStockValue = useMemo(() => rmList.reduce((acc, curr) => acc + ((curr.closingBalance || 0) * (curr.rate || 0)), 0), [rmList]);
  const wipStockValue = manualData['STOCK:WIP'] || 0;
  const paperStockValue = paperTotals.cloAmt;
  const grandTotalStock = fgStockValue + nonMovingStockValue + wipStockValue + paperStockValue + rmStockValue;

  // Month Title
  const monthFormattedTitle = useMemo(() => {
    try {
      const [y, m] = currentMonth.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return format(d, 'MMMM yyyy');
    } catch {
      return currentMonth;
    }
  }, [currentMonth]);

  // Effective expense breakdown with live mapped values for export
  const expenseBreakup = useMemo(() => {
    return visibleExpenses.map(exp => ({
      name: exp,
      amount: getEffectiveExpenseValue(exp)
    }));
  }, [visibleExpenses, manualData, autoFreightOutward, autoSalaryWages, autoConsumableGoods]);

  // Parameters pack for PDF and Excel export
  const exportParams = useMemo(() => ({
    monthFormattedTitle,
    paperStats,
    paperTotals,
    visibleSaleParties,
    manualData,
    cashScrapRevenue,
    tallyDataWOGST,
    tallyDataWGST,
    creditNoteWOGST,
    creditNoteWGST,
    netSaleWithoutGST,
    netSaleWithGST,
    paperUsedWOGST,
    paperUsedWGST,
    partyPurchases,
    scrapCashPurWOGST,
    scrapCashPurWGST,
    scrapCashDiffWOGST,
    scrapCashDiffWGST,
    gTotalPurchaseWOGST,
    gTotalPurchaseWGST,
    grandDiffWOGST,
    grandDiffWGST,
    visibleExpenses,
    expenseBreakup,
    currentMonthPurchaseWOGST,
    currentMonthPurchaseWGST,
    totalExpenses,
    netProfit,
    profitMarginPercent,
    fgStockValue,
    nonMovingStockValue,
    wipStockValue,
    paperStockValue,
    rmStockValue,
    grandTotalStock
  }), [
    monthFormattedTitle, paperStats, paperTotals, visibleSaleParties, manualData,
    cashScrapRevenue, tallyDataWOGST, tallyDataWGST, creditNoteWOGST, creditNoteWGST,
    netSaleWithoutGST, netSaleWithGST, paperUsedWOGST, paperUsedWGST, partyPurchases,
    scrapCashPurWOGST, scrapCashPurWGST, scrapCashDiffWOGST, scrapCashDiffWGST,
    gTotalPurchaseWOGST, gTotalPurchaseWGST, grandDiffWOGST, grandDiffWGST,
    visibleExpenses, expenseBreakup, currentMonthPurchaseWOGST, currentMonthPurchaseWGST,
    totalExpenses, netProfit, profitMarginPercent,
    fgStockValue, nonMovingStockValue, wipStockValue, paperStockValue, rmStockValue, grandTotalStock
  ]);

  const handleDownloadPDF = () => {
    try {
      exportMRToPDF(exportParams);
    } catch (e) {
      console.error('PDF Export error', e);
      alert('Error generating PDF. Please try browser print (Ctrl+P).');
    }
  };

  const handleDownloadExcel = () => {
    try {
      exportMRToExcel(exportParams);
    } catch (e) {
      console.error('Excel Export error', e);
      alert('Error generating Excel.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 print:bg-white print:p-0">
      
      {/* 1. TOP HEADER & CONTROLS (Print Hidden) */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Profit &amp; Loss Report
              </h1>
              <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100">
                MR Sheet
              </span>
            </div>
            <p className="text-xs text-slate-500">Period: <span className="font-semibold text-slate-700">{monthFormattedTitle}</span></p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          
          {/* Month Picker */}
          <div className="flex items-center bg-slate-100/80 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 transition">
            <label className="text-xs font-semibold text-slate-500 mr-2">Month:</label>
            <input 
              type="month" 
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent border-0 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Smart Active-Only Toggle */}
          <button
            onClick={() => setActiveOnlyMode(!activeOnlyMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              activeOnlyMode 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Toggle between showing only active rows or all empty rows"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
            {activeOnlyMode ? 'Smart View (Active Only)' : 'Show All (Full Grid)'}
          </button>

          {/* Dedicated Excel Download */}
          <button 
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100/80 rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
            title="Download formatted Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Excel
          </button>

          {/* Dedicated PDF Download */}
          <button 
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100/80 rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
            title="Download formatted PDF (.pdf)"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            PDF
          </button>

          {/* Browser Direct Print */}
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print
          </button>

          {/* Cloud Save Button */}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-md transition-all active:scale-95 ${
              saveSuccess 
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveSuccess ? 'Saved to Cloud' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* PRINT HEADER BANNER (Visible on Print) */}
      <div className="hidden print:block text-center py-4 border-b-2 border-slate-800 mb-4 bg-cyan-100">
        <h1 className="text-xl font-black uppercase text-slate-900 tracking-wider">
          PROFIT &amp; LOSS REPORT FOR THE M/O {monthFormattedTitle.toUpperCase()}
        </h1>
      </div>

      <div className="p-4 sm:p-6 max-w-[1700px] mx-auto w-full space-y-6 print:p-2 print:space-y-4">

        {/* 2. EXECUTIVE KPI HERO CARDS (Print Friendly) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
          
          {/* Card 1: Nett Sales */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:shadow-md transition print:p-2 print:rounded-lg print:border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider print:text-[10px]">Nett Revenue (Sale)</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center print:hidden">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 print:text-base">
              ₹ {formatINR(netSaleWithoutGST)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500 print:text-[9px]">
              <span className="text-slate-700 font-bold">₹ {formatINR(netSaleWithGST)}</span> (With GST)
            </div>
          </div>

          {/* Card 2: Total Purchases */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:shadow-md transition print:p-2 print:rounded-lg print:border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider print:text-[10px]">G. Total Purchase</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center print:hidden">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 print:text-base">
              ₹ {formatINR(gTotalPurchaseWOGST)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500 print:text-[9px]">
              <span className="text-slate-700 font-bold">₹ {formatINR(gTotalPurchaseWGST)}</span> (With GST)
            </div>
          </div>

          {/* Card 3: Gross Difference */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:shadow-md transition print:p-2 print:rounded-lg print:border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider print:text-[10px]">Gross Difference</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center print:hidden ${grandDiffWOGST >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                {grandDiffWOGST >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </div>
            </div>
            <div className={`text-2xl font-black print:text-base ${grandDiffWOGST >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
              ₹ {formatINR(grandDiffWOGST)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500 print:text-[9px]">
              Sale minus Purchase
            </div>
          </div>

          {/* Card 4: Overheads / Expenses */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:shadow-md transition print:p-2 print:rounded-lg print:border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider print:text-[10px]">Total Expenses</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center print:hidden">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 print:text-base">
              ₹ {formatINR(totalExpenses)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-500 print:text-[9px]">
              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">{visibleExpenses.length}</span> Active Overheads
            </div>
          </div>

          {/* Card 5: HERO NET PROFIT */}
          <div className={`rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden transition print:p-2 print:rounded-lg ${
            netProfit >= 0 
              ? 'bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white shadow-emerald-200 print:bg-emerald-700' 
              : 'bg-gradient-to-br from-rose-600 via-red-700 to-slate-900 text-white shadow-rose-200 print:bg-rose-700'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider opacity-90 print:text-[10px]">NET PROFIT</span>
              <span className="bg-white/20 text-white text-[11px] font-black px-2 py-0.5 rounded-full backdrop-blur-sm print:text-[9px]">
                {profitMarginPercent}%
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight mt-1 print:text-base">
              ₹ {formatINR(netProfit)}
            </div>
            <div className="text-[11px] opacity-80 mt-2 font-medium print:text-[8px]">
              Gross Diff - Expenses
            </div>
          </div>

        </div>

        {/* 3. PAPER INVENTORY RECONCILIATION TABLE */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden print:border-slate-800 print:rounded-none">
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between print:bg-slate-800 print:py-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400 print:hidden" />
              <h3 className="font-bold text-sm print:text-xs">Paper Inventory &amp; Consumption Reconciliation</h3>
            </div>
            <span className="text-xs font-semibold text-slate-300 print:text-[10px]">Auto-calculated from Reel Master &amp; Transactions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm print:text-[10px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider print:text-[9px]">
                  <th className="px-4 py-3 text-left w-40 print:py-1">Paper Type</th>
                  <th colSpan={2} className="px-3 py-2 text-center bg-slate-100/50 border-x border-slate-200 print:py-1">Opening Stock</th>
                  <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-200 print:py-1">Current Month Purchase</th>
                  <th colSpan={2} className="px-3 py-2 text-center bg-indigo-50/40 text-indigo-900 border-r border-slate-200 print:py-1">Consumption (Used)</th>
                  <th colSpan={2} className="px-3 py-2 text-center bg-slate-100/50">Closing Balance</th>
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs text-right print:text-[9px]">
                  <th className="px-4 py-2 text-left print:py-1">Category</th>
                  <th className="px-3 py-1.5 border-l border-slate-200">Qty (kg)</th>
                  <th className="px-3 py-1.5 border-r border-slate-200">Amount (₹)</th>
                  <th className="px-3 py-1.5">Qty (kg)</th>
                  <th className="px-3 py-1.5 border-r border-slate-200">Amount (₹)</th>
                  <th className="px-3 py-1.5 bg-indigo-50/30 text-indigo-800">Qty (kg)</th>
                  <th className="px-3 py-1.5 bg-indigo-50/30 text-indigo-800 border-r border-slate-200 font-bold">Amount (₹)</th>
                  <th className="px-3 py-1.5">Qty (kg)</th>
                  <th className="px-3 py-1.5 font-bold">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                {Object.entries(paperStats).map(([type, stats]) => (
                  <tr key={type} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-4 py-3 font-bold text-slate-800 flex items-center gap-2 print:py-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 print:hidden"></span>
                      {type}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600 border-l border-slate-100 print:py-1">{formatINR(stats.opnQty)}</td>
                    <td className="px-3 py-3 text-right text-slate-700 border-r border-slate-100 font-medium print:py-1">₹ {formatINR(stats.opnAmt)}</td>
                    <td className="px-3 py-3 text-right text-slate-600 print:py-1">{formatINR(stats.purQty)}</td>
                    <td className="px-3 py-3 text-right text-slate-700 border-r border-slate-100 font-medium print:py-1">₹ {formatINR(stats.purAmt)}</td>
                    <td className="px-3 py-3 text-right text-indigo-700 font-semibold bg-indigo-50/20 print:py-1">{formatINR(stats.conQty)}</td>
                    <td className="px-3 py-3 text-right text-indigo-900 font-bold bg-indigo-50/20 border-r border-slate-100 print:py-1">₹ {formatINR(stats.conAmt)}</td>
                    <td className="px-3 py-3 text-right text-slate-700 font-semibold print:py-1">{formatINR(stats.cloQty)}</td>
                    <td className="px-3 py-3 text-right text-slate-900 font-bold print:py-1">₹ {formatINR(stats.cloAmt)}</td>
                  </tr>
                ))}
                
                {/* SUMMARY TOTAL ROW */}
                <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-800 print:bg-slate-200 print:text-slate-900">
                  <td className="px-4 py-3 uppercase tracking-wider text-xs font-black text-indigo-300 print:text-slate-900 print:py-1">Total Paper Inventory</td>
                  <td className="px-3 py-3 text-right text-slate-300 border-l border-slate-800 print:text-slate-900 print:py-1">{formatINR(paperTotals.opnQty)}</td>
                  <td className="px-3 py-3 text-right text-white border-r border-slate-800 print:text-slate-900 print:py-1">₹ {formatINR(paperTotals.opnAmt)}</td>
                  <td className="px-3 py-3 text-right text-slate-300 print:text-slate-900 print:py-1">{formatINR(paperTotals.purQty)}</td>
                  <td className="px-3 py-3 text-right text-white border-r border-slate-800 print:text-slate-900 print:py-1">₹ {formatINR(paperTotals.purAmt)}</td>
                  <td className="px-3 py-3 text-right text-indigo-300 print:text-slate-900 print:py-1">{formatINR(paperTotals.conQty)}</td>
                  <td className="px-3 py-3 text-right text-indigo-200 border-r border-slate-800 font-black print:text-slate-900 print:py-1">₹ {formatINR(paperTotals.conAmt)}</td>
                  <td className="px-3 py-3 text-right text-slate-300 print:text-slate-900 print:py-1">{formatINR(paperTotals.cloQty)}</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-black print:text-slate-900 print:py-1">₹ {formatINR(paperTotals.cloAmt)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. MAIN SPLIT: LEFT (Sales & Stocks) & RIGHT (Reconciliation & Overheads) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:grid-cols-12 print:gap-3">
          
          {/* ================= LEFT SECTION (5 Cols) ================= */}
          <div className="lg:col-span-5 space-y-6 print:col-span-5 print:space-y-3">
            
            {/* SALES & REVENUE CARD */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-visible relative print:border-slate-800 print:rounded-none">
              <div className="px-5 py-3.5 bg-gradient-to-r from-blue-700 to-indigo-600 text-white flex items-center justify-between rounded-t-2xl print:bg-blue-800 print:py-2">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 print:hidden" />
                  <h3 className="font-bold text-sm print:text-xs">Revenue &amp; Customer Sales</h3>
                </div>
                
                {/* Sales Dropdown Button */}
                <div className="relative print:hidden" ref={salesPartyDropdownRef}>
                  <button
                    onClick={() => {
                      setShowSalesPartyDropdown(!showSalesPartyDropdown);
                      setShowReconPartyDropdown(false);
                      setShowExpenseDropdown(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold backdrop-blur-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Party
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {showSalesPartyDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[100] text-slate-800 space-y-2">
                      <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Available Sister Concerns</div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {inactiveParties.map(p => (
                          <button
                            key={p}
                            onClick={() => handleAddCustomParty(p)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold rounded-lg flex items-center justify-between transition"
                          >
                            <span>{p}</span>
                            <Plus className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Add Custom Party:</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Type Party Name..."
                            value={newPartyInput}
                            onChange={(e) => setNewPartyInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomParty(); }}
                            className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleAddCustomParty()}
                            disabled={!newPartyInput.trim()}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-0 overflow-x-auto">
                <table className="w-full text-xs print:text-[9px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold print:text-[8px]">
                      <th className="px-4 py-2.5 text-left print:py-1">Particulars / Party</th>
                      <th className="px-3 py-2.5 text-right w-28 print:py-1">Without GST (₹)</th>
                      <th className="px-3 py-2.5 text-right w-28 print:py-1">With GST (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                    
                    {/* Active / Configured Parties */}
                    {visibleSaleParties.map(party => {
                      const wogst = manualData[`SALE:${party}:WOGST`] || 0;
                      const wgst = manualData[`SALE:${party}:WGST`] || 0;
                      return (
                        <tr key={party} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-4 py-2 font-semibold text-slate-700 flex items-center justify-between print:py-1">
                            <span className="truncate">{party}</span>
                            <button 
                              onClick={() => handleRemoveParty(party)}
                              className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition ml-2 print:hidden"
                              title="Remove party from view"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <span className="hidden print:inline font-bold">₹ {formatINR(wogst)}</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={manualData[`SALE:${party}:WOGST`] !== undefined ? (manualData[`SALE:${party}:WOGST`] || '') : ''}
                              onChange={(e) => handleManualChange(`SALE:${party}:WOGST`, e.target.value)}
                              className="w-full text-right px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 rounded-lg text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-400 transition print:hidden"
                            />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <span className="hidden print:inline font-bold">₹ {formatINR(wgst)}</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={manualData[`SALE:${party}:WGST`] !== undefined ? (manualData[`SALE:${party}:WGST`] || '') : ''}
                              onChange={(e) => handleManualChange(`SALE:${party}:WGST`, e.target.value)}
                              className="w-full text-right px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 rounded-lg text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-400 transition print:hidden"
                            />
                          </td>
                        </tr>
                      );
                    })}

                    {/* MANDATORY 1: SCRAP (CASH) (Displayed, not summed in Nett Sale) */}
                    <tr className="bg-emerald-50/40 print:bg-emerald-50">
                      <td className="px-4 py-2.5 font-bold text-emerald-800 flex items-center gap-1.5 print:py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 print:hidden"></span>
                        SCRAP (CASH)
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-800 print:py-1">
                        ₹ {formatINR(cashScrapRevenue)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-800 print:py-1">
                        ₹ {formatINR(cashScrapRevenue)}
                      </td>
                    </tr>

                    {/* MANDATORY 2: TALLY DATA */}
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-bold text-slate-800 print:py-1">
                        TALLY DATA (Main Sale)
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold">₹ {formatINR(tallyDataWOGST)}</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={manualData['SALE:TALLY DATA:WOGST'] !== undefined ? (manualData['SALE:TALLY DATA:WOGST'] || '') : ''}
                          onChange={(e) => handleManualChange('SALE:TALLY DATA:WOGST', e.target.value)}
                          className="w-full text-right px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg text-slate-900 font-black focus:outline-none focus:ring-1 focus:ring-indigo-500 print:hidden"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold">₹ {formatINR(tallyDataWGST)}</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={manualData['SALE:TALLY DATA:WGST'] !== undefined ? (manualData['SALE:TALLY DATA:WGST'] || '') : ''}
                          onChange={(e) => handleManualChange('SALE:TALLY DATA:WGST', e.target.value)}
                          className="w-full text-right px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg text-slate-900 font-black focus:outline-none focus:ring-1 focus:ring-indigo-500 print:hidden"
                        />
                      </td>
                    </tr>

                    {/* MANDATORY 3: CREDIT NOTE */}
                    <tr className="bg-rose-50/40 print:bg-rose-50">
                      <td className="px-4 py-2 font-bold text-rose-700 flex items-center gap-1.5 print:py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 print:hidden"></span>
                        CREDIT NOTE (Deduction)
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold text-rose-700">₹ {formatINR(creditNoteWOGST)}</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={manualData['SALE:CREDIT NOTE:WOGST'] !== undefined ? (manualData['SALE:CREDIT NOTE:WOGST'] || '') : ''}
                          onChange={(e) => handleManualChange('SALE:CREDIT NOTE:WOGST', e.target.value)}
                          className="w-full text-right px-2.5 py-1 bg-white border border-rose-200 focus:border-rose-500 rounded-lg text-rose-700 font-black focus:outline-none focus:ring-1 focus:ring-rose-500 print:hidden"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold text-rose-700">₹ {formatINR(creditNoteWGST)}</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={manualData['SALE:CREDIT NOTE:WGST'] !== undefined ? (manualData['SALE:CREDIT NOTE:WGST'] || '') : ''}
                          onChange={(e) => handleManualChange('SALE:CREDIT NOTE:WGST', e.target.value)}
                          className="w-full text-right px-2.5 py-1 bg-white border border-rose-200 focus:border-rose-500 rounded-lg text-rose-700 font-black focus:outline-none focus:ring-1 focus:ring-rose-500 print:hidden"
                        />
                      </td>
                    </tr>

                    {/* NETT SALE FINAL ROW */}
                    <tr className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white font-black text-sm print:bg-slate-200 print:text-slate-900 print:text-xs">
                      <td className="px-4 py-3 uppercase tracking-wider text-xs text-blue-200 print:text-slate-900 print:py-1">NETT SALE</td>
                      <td className="px-4 py-3 text-right print:py-1">₹ {formatINR(netSaleWithoutGST)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 print:text-slate-900 print:py-1">₹ {formatINR(netSaleWithGST)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TOTAL MONTHLY PURCHASES */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3 print:border-slate-800 print:rounded-none print:p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider print:text-[9px]">Current Month Purchase</span>
                <Package className="w-4 h-4 text-slate-400 print:hidden" />
              </div>
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 print:p-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1 print:text-[8px]">Without GST</label>
                  <span className="hidden print:inline font-bold">₹ {formatINR(currentMonthPurchaseWOGST)}</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={manualData['PURCHASE:CURRENT_MONTH:WOGST'] !== undefined ? (manualData['PURCHASE:CURRENT_MONTH:WOGST'] || '') : ''}
                    onChange={(e) => handleManualChange('PURCHASE:CURRENT_MONTH:WOGST', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 print:hidden"
                  />
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 print:p-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1 print:text-[8px]">With GST</label>
                  <span className="hidden print:inline font-bold">₹ {formatINR(currentMonthPurchaseWGST)}</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={manualData['PURCHASE:CURRENT_MONTH:WGST'] !== undefined ? (manualData['PURCHASE:CURRENT_MONTH:WGST'] || '') : ''}
                    onChange={(e) => handleManualChange('PURCHASE:CURRENT_MONTH:WGST', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 print:hidden"
                  />
                </div>
              </div>
            </div>

            {/* INVENTORY VALUATION PORTFOLIO */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden print:border-slate-800 print:rounded-none">
              <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between print:bg-slate-800 print:py-1">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400 print:hidden" />
                  <h3 className="font-bold text-xs uppercase tracking-wider print:text-[9px]">Inventory Asset Valuation</h3>
                </div>
                <span className="text-xs font-black text-emerald-400 print:text-[9px]">₹ {formatINR(grandTotalStock)}</span>
              </div>
              <div className="p-4 space-y-2 text-xs print:p-2 print:text-[9px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 print:py-0.5">
                  <span className="text-slate-600 font-medium">Finish Goods Stock</span>
                  <span className="font-bold text-slate-900">₹ {formatINR(fgStockValue)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 print:py-0.5">
                  <span className="text-slate-600 font-medium">Non-Moving Stock</span>
                  <span className="font-bold text-slate-900">₹ {formatINR(nonMovingStockValue)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 print:py-0.5">
                  <span className="text-slate-600 font-medium">Work in Process (WIP)</span>
                  <span className="hidden print:inline font-bold">₹ {formatINR(wipStockValue)}</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={manualData['STOCK:WIP'] !== undefined ? (manualData['STOCK:WIP'] || '') : ''}
                    onChange={(e) => handleManualChange('STOCK:WIP', e.target.value)}
                    className="w-28 text-right bg-slate-50 border border-slate-200 rounded px-2 py-0.5 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 print:hidden"
                  />
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 bg-indigo-50/40 px-2 rounded print:py-0.5">
                  <span className="text-indigo-900 font-semibold">Paper Stock (Closing)</span>
                  <span className="font-black text-indigo-900">₹ {formatINR(paperStockValue)}</span>
                </div>
                <div className="flex justify-between items-center py-1 print:py-0.5">
                  <span className="text-slate-600 font-medium">Raw Material Stock</span>
                  <span className="font-bold text-slate-900">₹ {formatINR(rmStockValue)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* ================= RIGHT SECTION (7 Cols) ================= */}
          <div className="lg:col-span-7 space-y-6 print:col-span-7 print:space-y-3">
            
            {/* RECONCILIATION & SISTER PURCHASE MATRIX */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-visible relative print:border-slate-800 print:rounded-none">
              <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between rounded-t-2xl print:bg-slate-800 print:py-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-cyan-400 print:hidden" />
                  <h3 className="font-bold text-sm print:text-xs">Purchase &amp; Sister Reconciliation Matrix</h3>
                </div>

                {/* Recon Matrix Dropdown Button */}
                <div className="relative print:hidden" ref={reconPartyDropdownRef}>
                  <button
                    onClick={() => {
                      setShowReconPartyDropdown(!showReconPartyDropdown);
                      setShowSalesPartyDropdown(false);
                      setShowExpenseDropdown(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold backdrop-blur-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Party
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {showReconPartyDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[100] text-slate-800 space-y-2">
                      <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Available Sister Concerns</div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {inactiveParties.map(p => (
                          <button
                            key={p}
                            onClick={() => handleAddCustomParty(p)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold rounded-lg flex items-center justify-between transition"
                          >
                            <span>{p}</span>
                            <Plus className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Add Custom Party:</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Type Party Name..."
                            value={newPartyInput}
                            onChange={(e) => setNewPartyInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomParty(); }}
                            className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleAddCustomParty()}
                            disabled={!newPartyInput.trim()}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs print:text-[9px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold print:text-[8px]">
                      <th className="px-4 py-2.5 text-left print:py-1">Item / Concern</th>
                      <th className="px-3 py-2.5 text-right w-24 print:py-1">Purchase (W/o)</th>
                      <th className="px-3 py-2.5 text-right w-24 print:py-1">Purchase (With)</th>
                      <th className="px-3 py-2.5 text-right w-28 bg-indigo-50/60 text-indigo-900 print:py-1">Diff (W/o GST)</th>
                      <th className="px-3 py-2.5 text-right w-28 bg-indigo-50/60 text-indigo-900 print:py-1">Diff (With GST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                    
                    {/* Paper Used */}
                    <tr className="bg-slate-50/60 font-semibold">
                      <td className="px-4 py-2.5 text-slate-900 print:py-1">
                        Paper Used <span className="text-[10px] text-slate-400 font-normal print:hidden">(Top Consumption)</span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold">₹ {formatINR(paperUsedWOGST)}</span>
                        <input
                          type="number"
                          placeholder={String(paperTotals.conAmt)}
                          value={manualData['PAPER_USED:WOGST'] !== undefined ? (manualData['PAPER_USED:WOGST'] || '') : ''}
                          onChange={(e) => handleManualChange('PAPER_USED:WOGST', e.target.value)}
                          className="w-full text-right px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 print:hidden"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className="hidden print:inline font-bold">₹ {formatINR(paperUsedWGST)}</span>
                        <input
                          type="number"
                          placeholder={String(Math.round(paperUsedWOGST * 1.18))}
                          value={manualData['PAPER_USED:WGST'] !== undefined ? (manualData['PAPER_USED:WGST'] || '') : ''}
                          onChange={(e) => handleManualChange('PAPER_USED:WGST', e.target.value)}
                          className="w-full text-right px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 print:hidden"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300 font-mono print:py-1">--</td>
                      <td className="px-3 py-2.5 text-right text-slate-300 font-mono print:py-1">--</td>
                    </tr>

                    {/* Active Parties */}
                    {partyPurchases.map(p => (
                      <tr key={p.party} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-4 py-2 font-semibold text-slate-700 print:py-1 flex items-center justify-between">
                          <span>{p.party}</span>
                          <button 
                            onClick={() => handleRemoveParty(p.party)}
                            className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition ml-2 print:hidden"
                            title="Remove party from view"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className="hidden print:inline font-bold">₹ {formatINR(p.purWOGST)}</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={manualData[`PURCHASE:${p.party}:WOGST`] !== undefined ? (manualData[`PURCHASE:${p.party}:WOGST`] || '') : ''}
                            onChange={(e) => handleManualChange(`PURCHASE:${p.party}:WOGST`, e.target.value)}
                            className="w-full text-right px-2 py-1 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-400 rounded-lg font-bold text-slate-900 focus:outline-none print:hidden"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className="hidden print:inline font-bold">₹ {formatINR(p.purWGST)}</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={manualData[`PURCHASE:${p.party}:WGST`] !== undefined ? (manualData[`PURCHASE:${p.party}:WGST`] || '') : ''}
                            onChange={(e) => handleManualChange(`PURCHASE:${p.party}:WGST`, e.target.value)}
                            className="w-full text-right px-2.5 py-1 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-400 rounded-lg font-bold text-slate-900 focus:outline-none print:hidden"
                          />
                        </td>
                        <td className={`px-3 py-2 text-right font-black print:py-1 ${p.diffWOGST < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {p.diffWOGST < 0 ? `(₹ ${formatINR(Math.abs(p.diffWOGST))})` : `₹ ${formatINR(p.diffWOGST)}`}
                        </td>
                        <td className={`px-3 py-2 text-right font-black print:py-1 ${p.diffWGST < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {p.diffWGST < 0 ? `(₹ ${formatINR(Math.abs(p.diffWGST))})` : `₹ ${formatINR(p.diffWGST)}`}
                        </td>
                      </tr>
                    ))}

                    {/* Scrap(Cash) */}
                    <tr className="bg-emerald-50/20 font-medium">
                      <td className="px-4 py-2 text-emerald-800 font-bold print:py-1">SCRAP(CASH)</td>
                      <td className="px-3 py-2 text-right text-slate-400 print:py-1">₹ 0</td>
                      <td className="px-3 py-2 text-right text-slate-400 print:py-1">₹ 0</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700 print:py-1">₹ {formatINR(scrapCashDiffWOGST)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700 print:py-1">₹ {formatINR(scrapCashDiffWGST)}</td>
                    </tr>

                    {/* G. TOTAL PURCHASE ROW */}
                    <tr className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-sm border-t-2 border-slate-800 print:bg-amber-200 print:text-xs">
                      <td className="px-4 py-3 uppercase tracking-wider text-xs print:py-1">G. Total Purchase</td>
                      <td className="px-3 py-3 text-right print:py-1">₹ {formatINR(gTotalPurchaseWOGST)}</td>
                      <td className="px-3 py-3 text-right print:py-1">₹ {formatINR(gTotalPurchaseWGST)}</td>
                      <td className="px-3 py-3 text-right bg-amber-600 text-white print:bg-transparent print:text-slate-900 print:py-1">₹ {formatINR(grandDiffWOGST)}</td>
                      <td className="px-3 py-3 text-right bg-amber-600 text-white print:bg-transparent print:text-slate-900 print:py-1">₹ {formatINR(grandDiffWGST)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* OPERATING OVERHEADS & EXPENSES (With Freight, Salary & RM Consumable Live Mapping) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-visible relative print:border-slate-800 print:rounded-none">
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between rounded-t-2xl print:bg-slate-800 print:py-2">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-rose-400 print:hidden" />
                  <h3 className="font-bold text-sm print:text-xs">Operational Expenses</h3>
                  <span className="bg-rose-500/20 text-rose-300 text-xs px-2 py-0.5 rounded-full border border-rose-500/30 print:text-white print:text-[9px]">
                    Total: ₹ {formatINR(totalExpenses)}
                  </span>
                </div>

                {/* Expense Dropdown Button */}
                <div className="relative print:hidden" ref={expenseDropdownRef}>
                  <button
                    onClick={() => {
                      setShowExpenseDropdown(!showExpenseDropdown);
                      setShowSalesPartyDropdown(false);
                      setShowReconPartyDropdown(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-md transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Expense
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {showExpenseDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2.5 z-[100] text-slate-800 space-y-2">
                      
                      {/* Search Bar */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search or type new category..."
                          value={expenseSearchQuery}
                          onChange={(e) => setExpenseSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && expenseSearchQuery.trim()) {
                              handleAddExpenseCategory(expenseSearchQuery);
                            }
                          }}
                        />
                      </div>

                      {/* Custom Category Add Button if not matched */}
                      {expenseSearchQuery.trim() && !allExpensesList.some(e => e.toLowerCase() === expenseSearchQuery.trim().toLowerCase()) && (
                        <button
                          onClick={() => handleAddExpenseCategory(expenseSearchQuery)}
                          className="w-full text-left px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between transition"
                        >
                          <span>+ Add "{expenseSearchQuery.trim()}"</span>
                          <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded">Custom</span>
                        </button>
                      )}

                      {/* Category List Items */}
                      <div className="max-h-60 overflow-y-auto space-y-0.5 divide-y divide-slate-100 pr-1">
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Standard Categories</div>
                        {filteredAvailableExpenses.map(exp => (
                          <button
                            key={exp}
                            onClick={() => handleAddExpenseCategory(exp)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 text-slate-800 hover:text-rose-700 font-semibold rounded-lg flex items-center justify-between transition"
                          >
                            <span className="pr-2">{exp}</span>
                            <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>
                        ))}
                        {filteredAvailableExpenses.length === 0 && !expenseSearchQuery.trim() && (
                          <div className="px-3 py-4 text-xs text-slate-400 text-center font-medium">
                            All standard categories are active in your view.
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 print:p-2">
                
                {/* Active Expenses Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print:grid-cols-2 print:gap-1.5">
                  {visibleExpenses.map(exp => {
                    const isFreightOutward = exp === "Freight Outward Charges";
                    const isSalaryWages = exp === "Salary with Director Remuneration";
                    const isConsumableGoods = exp === "Consumable Goods (Excl. Gas)" || exp === "Consumable Goods";
                    const effectiveVal = getEffectiveExpenseValue(exp);
                    
                    const isUsingAutoFreight = isFreightOutward && (manualData[`EXP:${exp}`] === undefined || manualData[`EXP:${exp}`] === 0) && autoFreightOutward > 0;
                    const isUsingAutoSalary = isSalaryWages && (manualData[`EXP:${exp}`] === undefined || manualData[`EXP:${exp}`] === 0) && autoSalaryWages > 0;
                    const isUsingAutoConsumable = isConsumableGoods && (manualData[`EXP:${exp}`] === undefined || manualData[`EXP:${exp}`] === 0) && autoConsumableGoods > 0;
                    const isAutoMapped = isUsingAutoFreight || isUsingAutoSalary || isUsingAutoConsumable;

                    // Compute input display value
                    const hasManualCustomVal = manualData[`EXP:${exp}`] !== undefined && manualData[`EXP:${exp}`] !== 0;
                    const displayInputValue = hasManualCustomVal 
                      ? manualData[`EXP:${exp}`] 
                      : (effectiveVal > 0 ? effectiveVal : (manualData[`EXP:${exp}`] !== undefined && manualData[`EXP:${exp}`] !== 0 ? manualData[`EXP:${exp}`] : ''));

                    return (
                      <div key={exp} className={`flex items-center justify-between p-2.5 rounded-xl border transition group print:p-1 print:bg-white print:border-slate-200 ${
                        isAutoMapped 
                          ? 'bg-emerald-50/50 border-emerald-200/80 hover:bg-emerald-50' 
                          : 'bg-slate-50/80 hover:bg-slate-100 border border-slate-200/70'
                      }`}>
                        <div className="flex items-center gap-1.5 pr-2 min-w-0">
                          {!isFreightOutward && !isSalaryWages && !isConsumableGoods && (
                            <button
                              onClick={() => handleRemoveExpense(exp)}
                              className="text-slate-300 hover:text-rose-600 transition opacity-0 group-hover:opacity-100 print:hidden"
                              title="Remove expense from view"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 truncate block print:text-[9px]">{exp}</span>
                            
                            {/* Auto Badges & Reset Actions */}
                            {isFreightOutward && (
                              <div className="flex items-center gap-2 mt-0.5 print:hidden">
                                {isUsingAutoFreight ? (
                                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                                    <Truck className="w-2.5 h-2.5" /> Mapped from Freight Sheet (₹ {formatINR(autoFreightOutward)})
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleManualChange(`EXP:${exp}`, String(autoFreightOutward))}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
                                    title="Reset to live Freight Sheet value"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" /> Reset to Freight Sheet (₹ {formatINR(autoFreightOutward)})
                                  </button>
                                )}
                              </div>
                            )}

                            {isSalaryWages && (
                              <div className="flex items-center gap-2 mt-0.5 print:hidden">
                                {isUsingAutoSalary ? (
                                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                                    <Users className="w-2.5 h-2.5" /> Mapped from Salary &amp; Wages (₹ {formatINR(autoSalaryWages)})
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleManualChange(`EXP:${exp}`, String(autoSalaryWages))}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
                                    title="Reset to live Salary Sheet value"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" /> Reset to Salary Sheet (₹ {formatINR(autoSalaryWages)})
                                  </button>
                                )}
                              </div>
                            )}

                            {isConsumableGoods && (
                              <div className="flex items-center gap-2 mt-0.5 print:hidden">
                                {isUsingAutoConsumable ? (
                                  <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                                    <Box className="w-2.5 h-2.5" /> Mapped from RM Sheet (₹ {formatINR(autoConsumableGoods)})
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleManualChange(`EXP:${exp}`, String(autoConsumableGoods))}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
                                    title="Reset to live RM Sheet Outward value"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" /> Reset to RM Outward (₹ {formatINR(autoConsumableGoods)})
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-28 shrink-0 flex items-center justify-end">
                          <span className="hidden print:inline font-bold text-slate-900 print:text-[9px]">₹ {formatINR(effectiveVal)}</span>
                          <div className="flex items-center print:hidden">
                            <span className="text-xs font-bold text-slate-400 mr-1">₹</span>
                            <input
                              type="number"
                              placeholder={
                                isFreightOutward 
                                  ? String(autoFreightOutward) 
                                  : isSalaryWages 
                                  ? String(autoSalaryWages) 
                                  : isConsumableGoods
                                  ? String(autoConsumableGoods)
                                  : "0"
                              }
                              value={displayInputValue}
                              onChange={(e) => handleManualChange(`EXP:${exp}`, e.target.value)}
                              className={`w-full text-right rounded-lg px-2.5 py-1 text-xs font-black text-slate-900 focus:outline-none ${
                                isAutoMapped 
                                  ? 'bg-emerald-50 border border-emerald-300 focus:border-emerald-500 text-emerald-900' 
                                  : 'bg-white border border-slate-300 focus:border-rose-500'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {visibleExpenses.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No active expenses. Click <span className="font-bold text-rose-600">+ Add Expense</span> above to add categories.
                  </div>
                )}

              </div>
            </div>

            {/* FINAL NET PROFIT BANNER */}
            <div className={`rounded-2xl p-6 border shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 print:p-3 print:rounded-none ${
              netProfit >= 0 
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-emerald-500/30 print:bg-emerald-700' 
                : 'bg-gradient-to-r from-rose-600 to-red-700 text-white border-rose-500/30 print:bg-rose-700'
            }`}>
              <div className="text-center sm:text-left space-y-1">
                <span className="text-xs uppercase font-black tracking-widest text-emerald-100 print:text-[9px]">FINAL PROFIT &amp; LOSS</span>
                <h2 className="text-xl sm:text-2xl font-black print:text-base">NET PROFIT FOR {monthFormattedTitle.toUpperCase()}</h2>
                <p className="text-xs text-white/80 font-medium print:text-[8px]">
                  Gross Difference (₹ {formatINR(grandDiffWOGST)}) - Total Expenses (₹ {formatINR(totalExpenses)})
                </p>
              </div>
              <div className="text-center sm:text-right">
                <div className="text-3xl sm:text-4xl font-black tracking-tight print:text-xl">
                  ₹ {formatINR(netProfit)}
                </div>
                <span className="inline-block mt-1 bg-white/20 backdrop-blur-sm px-3 py-0.5 rounded-full text-xs font-bold print:hidden">
                  {profitMarginPercent}% Net Margin
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

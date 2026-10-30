import React, { useMemo } from 'react';
import type { PlantMisFullData, PlantMisFgItem, PlantMisMachineLog } from '../../lib/supabase/plantMisService';

export type WhatsappCardTheme = 'dark' | 'light' | 'royal' | 'industrial';

interface PlantMisWhatsappCardProps {
  data: PlantMisFullData;
  formattedDateStr: string;
  theme?: WhatsappCardTheme;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

// Shift detail within a machine
interface MachineShiftData {
  shift: 'Day' | 'Night' | 'General';
  shiftHours: number;
  shiftTiming?: string;
  status: 'RUNNING' | 'MAINTENANCE' | 'IDLE' | 'BREAKDOWN';
  runningSqMtr: number;
  runningKg: number;
  totalPly: number;
  totalPaper: number;
  scrapKg: number;
  scrapSheet: number;
  notes?: string;
}

// Grouped Machine with all its shifts
interface GroupedMachineWithShifts {
  machineName: string;
  shifts: MachineShiftData[];
  totalHours: number;
  totalSqMtr: number;
  totalKg: number;
  totalPly: number;
  totalPaper: number;
  totalScrapKg: number;
  totalScrapSheet: number;
  overallStatus: 'RUNNING' | 'MAINTENANCE' | 'IDLE' | 'BREAKDOWN';
}

export default function PlantMisWhatsappCard({
  data,
  formattedDateStr,
  theme = 'dark',
  cardRef,
}: PlantMisWhatsappCardProps) {
  const { report, fgItems, machineLogs, mtdSummary, fgStockValuation } = data;

  // 1. Day of Week
  const dayName = useMemo(() => {
    if (!report.reportDate) return '';
    const dateObj = new Date(report.reportDate + 'T00:00:00');
    return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  }, [report.reportDate]);

  // 2. Filter Valid FG Items (Only items with qtyBox > 0)
  const validFgItems = useMemo(() => {
    if (report.showFgProduced === false || !fgItems) return [];
    return fgItems
      .filter((item) => Number(item.qtyBox) > 0)
      .sort((a, b) => (Number(b.qtyBox) || 0) - (Number(a.qtyBox) || 0));
  }, [fgItems, report.showFgProduced]);

  const totalFgBoxes = useMemo(() => {
    return validFgItems.reduce((acc, curr) => acc + (Number(curr.qtyBox) || 0), 0);
  }, [validFgItems]);

  const totalFgProductionValue = useMemo(() => {
    return validFgItems.reduce((acc, curr) => {
      const val = Number(curr.totalValue) || (Number(curr.qtyBox) * (Number(curr.rate) || 0));
      return acc + val;
    }, 0);
  }, [validFgItems]);

  const hasAnyFgRates = useMemo(() => {
    return validFgItems.some((item) => (Number(item.rate) || 0) > 0 || (Number(item.totalValue) || 0) > 0);
  }, [validFgItems]);

  // 3. Process Machines into Departmental Groups
  const {
    corrugationMachines,
    pastingMachines,
    finishingMachines,
    activeMachinesCount,
    maintenanceMachinesCount,
  } = useMemo(() => {
    if (report.showMachines === false || !machineLogs) {
      return {
        corrugationMachines: [],
        pastingMachines: [],
        finishingMachines: [],
        activeMachinesCount: 0,
        maintenanceMachinesCount: 0,
      };
    }

    const machineMap = new Map<string, GroupedMachineWithShifts>();

    machineLogs.forEach((log) => {
      const name = log.machineName.trim();
      const existing = machineMap.get(name);

      const shiftData: MachineShiftData = {
        shift: log.shift || 'Day',
        shiftHours: Number(log.shiftHours) || 0,
        shiftTiming: log.shiftTiming || '',
        status: log.status,
        runningSqMtr: Number(log.runningSqMtr) || 0,
        runningKg: Number(log.runningKg) || 0,
        totalPly: Number(log.totalPly) || 0,
        totalPaper: Number(log.totalPaper) || 0,
        scrapKg: Number(log.scrapKg) || 0,
        scrapSheet: Number(log.scrapSheet) || 0,
        notes: log.notes || '',
      };

      if (!existing) {
        machineMap.set(name, {
          machineName: name,
          shifts: [shiftData],
          totalHours: shiftData.shiftHours,
          totalSqMtr: shiftData.runningSqMtr,
          totalKg: shiftData.runningKg,
          totalPly: shiftData.totalPly,
          totalPaper: shiftData.totalPaper,
          totalScrapKg: shiftData.scrapKg,
          totalScrapSheet: shiftData.scrapSheet,
          overallStatus: shiftData.status,
        });
      } else {
        existing.shifts.push(shiftData);
        existing.totalHours += shiftData.shiftHours;
        existing.totalSqMtr += shiftData.runningSqMtr;
        existing.totalKg += shiftData.runningKg;
        existing.totalPly += shiftData.totalPly;
        existing.totalPaper += shiftData.totalPaper;
        existing.totalScrapKg += shiftData.scrapKg;
        existing.totalScrapSheet += shiftData.scrapSheet;

        if (shiftData.status === 'MAINTENANCE' || shiftData.status === 'BREAKDOWN') {
          if (existing.overallStatus !== 'RUNNING') {
            existing.overallStatus = shiftData.status;
          }
        } else if (shiftData.status === 'RUNNING') {
          existing.overallStatus = 'RUNNING';
        }
      }
    });

    const activeMachinesList = Array.from(machineMap.values()).filter((m) => {
      const hasMaintenanceShift = m.shifts.some(
        (s) => s.status === 'MAINTENANCE' || s.status === 'BREAKDOWN'
      );
      const hasOutput =
        m.totalHours > 0 ||
        m.totalSqMtr > 0 ||
        m.totalKg > 0 ||
        m.totalPly > 0 ||
        m.totalPaper > 0 ||
        m.totalScrapKg > 0 ||
        m.totalScrapSheet > 0;
      return hasMaintenanceShift || hasOutput;
    });

    const corrugation: GroupedMachineWithShifts[] = [];
    const pasting: GroupedMachineWithShifts[] = [];
    const finishing: GroupedMachineWithShifts[] = [];

    activeMachinesList.forEach((m) => {
      const lower = m.machineName.toLowerCase();
      // Corrugation + Paper Cutting grouped together
      if (
        lower.includes('corrugat') ||
        lower.includes('corug') ||
        lower.includes('flute') ||
        lower.includes('paper cut') ||
        lower.includes('cutting')
      ) {
        corrugation.push(m);
      } else if (lower.includes('past')) {
        pasting.push(m);
      } else {
        finishing.push(m);
      }
    });

    let activeCount = 0;
    let maintCount = 0;
    activeMachinesList.forEach((m) => {
      if (m.overallStatus === 'MAINTENANCE' || m.overallStatus === 'BREAKDOWN') {
        maintCount++;
      } else if (m.overallStatus === 'RUNNING') {
        activeCount++;
      }
    });

    return {
      corrugationMachines: corrugation,
      pastingMachines: pasting,
      finishingMachines: finishing,
      activeMachinesCount: activeCount,
      maintenanceMachinesCount: maintCount,
    };
  }, [machineLogs, report.showMachines]);

  // 4. Sales Visibility Checks (STRICT: If Outsource === 0, HIDE IT COMPLETELY!)
  const hasRevenue =
    report.showRevenue !== false &&
    (Number(report.totalSaleExclGst) > 0 || Number(report.totalSaleInclGst) > 0);

  const hasDayOutsource =
    Number(report.outsourceSaleExclGst) > 0 || Number(report.outsourceSaleInclGst) > 0;

  const hasMtdOutsource =
    mtdSummary && (Number(mtdSummary.outsourceExcl) > 0 || Number(mtdSummary.outsourceIncl) > 0);

  const hasMtdPlant =
    mtdSummary && (Number(mtdSummary.selfExcl) > 0 || Number(mtdSummary.selfIncl) > 0);

  const hasFg = report.showFgProduced !== false && validFgItems.length > 0 && totalFgBoxes > 0;

  const hasStockValuation =
    report.showStockValuation !== false &&
    fgStockValuation &&
    (Number(fgStockValuation.totalValue) > 0 || Number(fgStockValuation.totalBoxes) > 0);

  const hasAnyMachines =
    report.showMachines !== false &&
    (corrugationMachines.length > 0 ||
      pastingMachines.length > 0 ||
      finishingMachines.length > 0);

  // 5. THEME STYLES CONFIGURATION (Compact, high contrast)
  const themeStyles = useMemo(() => {
    switch (theme) {
      case 'light':
        return {
          cardBg: 'bg-white text-slate-950 border-slate-300',
          headerBorder: 'border-slate-300',
          titleColor: 'text-slate-950 font-black',
          sectionBoxBg: 'bg-slate-100/90 border-slate-300',
          innerCardBg: 'bg-white border-slate-300 shadow-xs',
          badgePrimary: 'bg-blue-100 text-blue-900 border-blue-400 font-bold',
          badgeSuccess: 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold',
          badgeMaint: 'bg-rose-100 text-rose-900 border-rose-400 font-bold',
          tableHeaderBg: 'bg-slate-200 text-slate-900 font-bold',
          metricChipBg: 'bg-slate-200 text-slate-900',
          metricValColor: 'text-slate-950',
          footerBorder: 'border-slate-300 text-slate-700',
          // High contrast shades for light theme
          textMuted: 'text-slate-700',
          textSubtle: 'text-slate-600',
          textPrimary: 'text-blue-800',
          textSuccess: 'text-emerald-800',
          textWarn: 'text-amber-800',
          textPurple: 'text-purple-800',
          textBody: 'text-slate-900',
          textRowBg: 'bg-white',
          borderRow: 'border-slate-300',
          boxHighlightBg: 'bg-emerald-50 border-emerald-400',
          boxBlueBg: 'bg-blue-50 border-blue-300',
          boxWarnBg: 'bg-amber-50 border-amber-300',
          boxPurpleBg: 'bg-purple-50 border-purple-300',
        };
      case 'royal':
        return {
          cardBg: 'bg-[#121215] text-amber-50 border-amber-500/30',
          headerBorder: 'border-amber-900/40',
          titleColor: 'text-amber-100',
          sectionBoxBg: 'bg-[#18181f] border-amber-900/40',
          innerCardBg: 'bg-[#22222a] border-amber-800/40',
          badgePrimary: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          badgeSuccess: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          badgeMaint: 'bg-rose-500/25 text-rose-300 border-rose-500/40',
          tableHeaderBg: 'bg-[#22222a] text-amber-300/80',
          metricChipBg: 'bg-[#2a2a35] text-amber-100',
          metricValColor: 'text-amber-200',
          footerBorder: 'border-amber-950 text-amber-400/60',
          textMuted: 'text-amber-200/60',
          textSubtle: 'text-amber-300/60',
          textPrimary: 'text-amber-400',
          textSuccess: 'text-emerald-400',
          textWarn: 'text-amber-400',
          textPurple: 'text-purple-300',
          textBody: 'text-amber-50',
          textRowBg: 'bg-inherit/40',
          borderRow: 'border-amber-500/30',
          boxHighlightBg: 'bg-emerald-500/10 border-emerald-500/50',
          boxBlueBg: 'bg-blue-500/10 border-blue-500/30',
          boxWarnBg: 'bg-amber-500/10 border-amber-500/30',
          boxPurpleBg: 'bg-purple-500/10 border-purple-500/30',
        };
      case 'industrial':
        return {
          cardBg: 'bg-[#0a192f] text-slate-100 border-blue-500/40',
          headerBorder: 'border-blue-800/60',
          titleColor: 'text-white',
          sectionBoxBg: 'bg-[#0e213d] border-blue-700/50',
          innerCardBg: 'bg-[#132a4e] border-blue-800',
          badgePrimary: 'bg-blue-500/25 text-cyan-300 border-blue-400/40',
          badgeSuccess: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40',
          badgeMaint: 'bg-rose-500/30 text-rose-300 border-rose-400/50',
          tableHeaderBg: 'bg-[#132a4e] text-cyan-300',
          metricChipBg: 'bg-[#172d54] text-slate-200',
          metricValColor: 'text-cyan-300',
          footerBorder: 'border-blue-900 text-cyan-400/60',
          textMuted: 'text-slate-400',
          textSubtle: 'text-slate-400',
          textPrimary: 'text-cyan-400',
          textSuccess: 'text-emerald-400',
          textWarn: 'text-amber-400',
          textPurple: 'text-purple-300',
          textBody: 'text-slate-100',
          textRowBg: 'bg-inherit/40',
          borderRow: 'border-blue-500/30',
          boxHighlightBg: 'bg-emerald-500/10 border-emerald-500/50',
          boxBlueBg: 'bg-blue-500/10 border-blue-500/30',
          boxWarnBg: 'bg-amber-500/10 border-amber-500/30',
          boxPurpleBg: 'bg-purple-500/10 border-purple-500/30',
        };
      case 'dark':
      default:
        return {
          cardBg: 'bg-[#0f172a] text-slate-100 border-slate-700/80',
          headerBorder: 'border-slate-800',
          titleColor: 'text-white',
          sectionBoxBg: 'bg-slate-800/60 border-slate-700/70',
          innerCardBg: 'bg-slate-900/80 border-slate-800',
          badgePrimary: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
          badgeSuccess: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          badgeMaint: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          tableHeaderBg: 'bg-slate-900/90 text-slate-300',
          metricChipBg: 'bg-slate-800/70 text-slate-200',
          metricValColor: 'text-white',
          footerBorder: 'border-slate-800 text-slate-500',
          textMuted: 'text-slate-400',
          textSubtle: 'text-slate-400',
          textPrimary: 'text-blue-400',
          textSuccess: 'text-emerald-400',
          textWarn: 'text-amber-400',
          textPurple: 'text-purple-400',
          textBody: 'text-slate-100',
          textRowBg: 'bg-inherit/40',
          borderRow: 'border-slate-700/40',
          boxHighlightBg: 'bg-emerald-500/10 border-emerald-500/50',
          boxBlueBg: 'bg-blue-500/10 border-blue-500/30',
          boxWarnBg: 'bg-amber-500/10 border-amber-500/30',
          boxPurpleBg: 'bg-purple-500/10 border-purple-500/30',
        };
    }
  }, [theme]);

  return (
    <div
      ref={cardRef}
      id="plant-mis-whatsapp-card-content"
      style={{ width: '1020px' }}
      className={`mx-auto rounded-3xl p-4 md:p-5 shadow-2xl border transition-all ${themeStyles.cardBg}`}
    >
      {/* ───────────────── HEADER (Compact 1-line style) ───────────────── */}
      <div
        className={`flex items-center justify-between pb-3 border-b ${themeStyles.headerBorder}`}
      >
        <div className="flex items-center gap-3">
          {/* Packwell India Logo */}
          <img
            src="/logo.gif"
            alt="Packwell India"
            style={{ width: '52px', height: '52px', objectFit: 'contain', borderRadius: '10px', background: 'white', padding: '3px' }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-extrabold text-blue-500">
                Packwell India
              </span>
              <span
                className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase tracking-wider border ${themeStyles.badgePrimary}`}
              >
                Executive Plant MIS
              </span>
            </div>
            <h2 className={`text-xl font-black tracking-tight ${themeStyles.titleColor}`}>
              Daily Production & Sales Summary
            </h2>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-[10px] font-bold uppercase tracking-wider ${themeStyles.textSubtle}`}>
            Report Date
          </div>
          <div className={`text-lg font-black font-mono tracking-tight leading-tight ${themeStyles.textSuccess}`}>
            {formattedDateStr}
          </div>
          <div className={`text-[11px] font-medium ${themeStyles.textMuted}`}>{dayName}</div>
        </div>
      </div>

      {/* ───────────────── 2-HALF BALANCED GRID (NO SCROLLING - 100% SINGLE SCREEN FIT) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-3">
        
        {/* ════════════════════════════════════════════════════════════
            FIRST HALF (LEFT COLUMN - 6 COLS): 
            1. Day Sales (Zero outsource hidden)
            2. Month Sales (Zero outsource hidden)
            3. FG Production Items (In-House with Rate & Value)
            4. Warehouse FG Stock Valuation (If Enabled)
           ════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 space-y-3">
          
          {/* 1 & 2. SALES SUMMARY (COMPACT & CLEAN - NO WASTED SPACE) */}
          {hasRevenue && (
            <div className={`rounded-2xl p-3 border ${themeStyles.sectionBoxBg} space-y-2`}>
              <div className="flex items-center justify-between pb-1 border-b border-inherit/30">
                <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-inherit">
                  <span className="text-emerald-500">💰</span>
                  <span>Sales Performance (Without & With GST)</span>
                </span>
                <span className={`text-[10px] font-mono ${themeStyles.textSubtle}`}>INR (₹)</span>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                
                {/* 1. TODAY'S SALE */}
                {hasDayOutsource ? (
                  /* If Outsource > 0: Show Plant, Outsource & Total */
                  <div className="space-y-1">
                    <div className={`flex items-center justify-between p-1.5 rounded-lg border ${themeStyles.borderRow} ${themeStyles.textRowBg} text-[11px]`}>
                      <span className={`font-sans font-bold ${themeStyles.textPrimary}`}>🏭 Day Plant Sale:</span>
                      <span className={themeStyles.textBody}>₹{Number(report.selfSaleExclGst).toLocaleString('en-IN')} (Excl) | <strong className={themeStyles.textSuccess}>₹{Number(report.selfSaleInclGst).toLocaleString('en-IN')}</strong> (Incl)</span>
                    </div>
                    <div className={`flex items-center justify-between p-1.5 rounded-lg border ${themeStyles.borderRow} ${themeStyles.textRowBg} text-[11px]`}>
                      <span className={`font-sans font-bold ${themeStyles.textWarn}`}>📦 Day Outsource:</span>
                      <span className={themeStyles.textBody}>₹{Number(report.outsourceSaleExclGst).toLocaleString('en-IN')} (Excl) | <strong className={themeStyles.textSuccess}>₹{Number(report.outsourceSaleInclGst).toLocaleString('en-IN')}</strong> (Incl)</span>
                    </div>
                    <div className={`flex items-center justify-between p-1.5 rounded-lg border ${themeStyles.boxHighlightBg} font-bold`}>
                      <span className={`font-sans font-black ${themeStyles.textSuccess} uppercase text-[11px]`}>Total Day Sales:</span>
                      <span className={themeStyles.textBody}>₹{Number(report.totalSaleExclGst).toLocaleString('en-IN')} (Excl) | <strong className={themeStyles.textSuccess}>₹{Number(report.totalSaleInclGst).toLocaleString('en-IN')}</strong> (Bill)</span>
                    </div>
                  </div>
                ) : (
                  /* If Outsource is ZERO: Show ONLY Plant Sale cleanly! */
                  <div className={`p-2 rounded-xl border ${themeStyles.boxHighlightBg} flex items-center justify-between`}>
                    <div>
                      <span className={`font-sans font-black text-xs ${themeStyles.textSuccess} uppercase tracking-tight block`}>
                        Today's Total Sale ({formattedDateStr}):
                      </span>
                      <span className={`text-[9px] ${themeStyles.textSubtle} font-sans`}>100% In-House Plant Production</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-sm ${themeStyles.textBody}`}>
                        ₹ {Number(report.totalSaleExclGst || 0).toLocaleString('en-IN')} <span className={`text-[9px] ${themeStyles.textSubtle} font-sans`}>(Excl)</span>
                      </div>
                      <div className={`font-black text-xs ${themeStyles.textSuccess}`}>
                        ₹ {Number(report.totalSaleInclGst || 0).toLocaleString('en-IN')} <span className={`text-[9px] ${themeStyles.textSubtle} font-sans`}>(With GST)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. CURRENT MONTH SALES (MTD) — Plant & Outsource ALAG ALAG */}
                {mtdSummary && (
                  <div className="space-y-1">
                    {/* MTD Header label */}
                    <div className={`text-[10px] font-black uppercase tracking-wider ${themeStyles.textPrimary} px-1 flex items-center gap-1`}>
                      📅 Current Month Sales (MTD):
                    </div>

                    {/* MTD Plant Sale — BIG HIGHLIGHT like Report Date */}
                    {hasMtdPlant && (
                      <div className={`p-2 rounded-xl border ${themeStyles.boxHighlightBg} flex items-center justify-between`}>
                        <div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${themeStyles.textSubtle} block`}>
                            Current Month Plant Sale Only
                          </span>
                          <span className={`text-[9px] ${themeStyles.textMuted} font-sans`}>In-House Manufacturing (MTD)</span>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-black font-mono tracking-tight leading-tight ${themeStyles.textSuccess}`}>
                            ₹{Number(mtdSummary.selfIncl || 0).toLocaleString('en-IN')}
                          </div>
                          <div className={`text-[10px] font-mono ${themeStyles.textSubtle}`}>
                            ₹{Number(mtdSummary.selfExcl || 0).toLocaleString('en-IN')} <span className="text-[9px]">(Excl GST)</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MTD Outsource Sale (hidden if 0) */}
                    {hasMtdOutsource && (
                      <div className={`flex items-center justify-between p-1.5 rounded-lg border ${themeStyles.boxWarnBg} text-[11px]`}>
                        <span className={`font-sans font-bold ${themeStyles.textWarn}`}>📦 Outsource/Trade (MTD):</span>
                        <span className={`font-mono ${themeStyles.textBody}`}>
                          ₹{Number(mtdSummary.outsourceExcl || 0).toLocaleString('en-IN')} (Excl) |{' '}
                          <strong className={themeStyles.textSuccess}>₹{Number(mtdSummary.outsourceIncl || 0).toLocaleString('en-IN')}</strong> (Incl)
                        </span>
                      </div>
                    )}

                    {/* MTD Grand Total (always show) */}
                    <div className={`flex items-center justify-between p-1.5 rounded-lg border ${themeStyles.boxBlueBg} font-bold text-[11px]`}>
                      <span className={`font-sans font-black ${themeStyles.textPrimary} uppercase`}>📊 Total Month Sale (MTD):</span>
                      <span className={`font-mono ${themeStyles.textBody}`}>
                        ₹{Number(mtdSummary.totalExcl || 0).toLocaleString('en-IN')} (Excl) |{' '}
                        <strong className={themeStyles.textPrimary}>₹{Number(mtdSummary.totalIncl || 0).toLocaleString('en-IN')}</strong> (Bill)
                      </span>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* 3. IN-HOUSE FG PRODUCTION ITEMS (WITH VALUE = QTY * RATE) */}
          {hasFg && (
            <div className={`rounded-2xl p-3 border ${themeStyles.sectionBoxBg} space-y-2`}>
              <div className="flex items-center justify-between pb-1 border-b border-inherit/30">
                <span className="text-xs font-black uppercase tracking-wider text-inherit flex items-center gap-1.5">
                  <span>📦</span>
                  <span>In-House FG Production Output ({validFgItems.length} SKUs)</span>
                </span>
                <span className={`text-[10px] font-mono ${themeStyles.textSubtle}`}>Qty × Rate = Value</span>
              </div>

              {/* Items Table */}
              <div className="border border-inherit/40 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className={`text-[10px] uppercase font-bold border-b border-inherit/40 ${themeStyles.tableHeaderBg}`}>
                    <tr>
                      <th className="py-1 px-2">Item Name</th>
                      <th className="py-1 px-1.5 text-right">Qty (Box)</th>
                      <th className="py-1 px-1.5 text-right">Rate</th>
                      <th className="py-1 px-2 text-right">Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-inherit/20 font-mono text-xs">
                    {validFgItems.map((fg, idx) => {
                      const itemRate = Number(fg.rate) || 0;
                      const itemValue = Number(fg.totalValue) || (Number(fg.qtyBox) * itemRate);

                      return (
                        <tr key={idx} className="hover:bg-inherit/20">
                          <td className="py-1 px-2 font-sans">
                            <div className="flex items-start gap-1">
                              {fg.vendorName && (
                                <span className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${themeStyles.badgePrimary}`}>
                                  {fg.vendorName}
                                </span>
                              )}
                              <span className="font-semibold text-[11px] text-inherit break-words leading-tight">
                                {fg.itemName}
                              </span>
                            </div>
                          </td>
                          <td className={`py-1 px-1.5 text-right font-bold ${themeStyles.textPrimary}`}>
                            {Number(fg.qtyBox).toLocaleString('en-IN')}
                          </td>
                          <td className={`py-1 px-1.5 text-right text-[11px] ${themeStyles.textSubtle}`}>
                            {itemRate > 0 ? `₹${itemRate.toFixed(2)}` : '-'}
                          </td>
                          <td className={`py-1 px-2 text-right font-bold ${themeStyles.textSuccess}`}>
                            {itemValue > 0 ? `₹${itemValue.toLocaleString('en-IN')}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Table Footer */}
                  <tfoot className="border-t-2 border-inherit/40 font-bold bg-inherit/30 text-xs">
                    <tr>
                      <td className={`py-1.5 px-2 font-sans uppercase text-[10px] ${themeStyles.textPrimary}`}>
                        Total Produced:
                      </td>
                      <td className={`py-1.5 px-1.5 text-right font-mono font-black text-sm ${themeStyles.textPrimary}`}>
                        {totalFgBoxes.toLocaleString('en-IN')}
                      </td>
                      <td className={`py-1.5 px-1.5 text-right text-[10px] ${themeStyles.textSubtle} font-sans`}>
                        Total Value:
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono font-black text-sm ${themeStyles.textSuccess}`}>
                        {totalFgProductionValue > 0 ? `₹${totalFgProductionValue.toLocaleString('en-IN')}` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 4. FG WAREHOUSE VALUATION (COMPACT 1-LINE STRIP) */}
          {hasStockValuation && (
            <div className={`rounded-xl p-2.5 border ${themeStyles.sectionBoxBg} flex items-center justify-between text-xs font-mono`}>
              <div className="flex items-center gap-1.5">
                <span>🏢</span>
                <span className={`font-sans font-bold text-[11px] ${themeStyles.textWarn} uppercase`}>FG Warehouse Stock:</span>
              </div>
              <div className={`flex items-center gap-3 ${themeStyles.textBody}`}>
                <span>Reg: <strong className={themeStyles.textSuccess}>₹{Number(fgStockValuation.regularValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
                {Number(fgStockValuation.nonMovingValue) > 0 && (
                  <span>NM: <strong className={themeStyles.textWarn}>₹{Number(fgStockValuation.nonMovingValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
                )}
                <span className={`font-black ${themeStyles.textPrimary}`}>Total: ₹{Number(fgStockValuation.totalValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}

        </div>

        {/* ════════════════════════════════════════════════════════════
            SECOND HALF (RIGHT COLUMN - 6 COLS): 
            TOP TO BOTTOM STREAMLINED MACHINE OPERATIONS (1-LINE ENTRIES)
           ════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-6 space-y-3">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1 border-b border-inherit/40">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-inherit">
              <span className="text-emerald-500">⚙️</span>
              <span>Machine Wise Production Summary</span>
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-emerald-500 font-bold text-[10px]">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>
                {activeMachinesCount} Active
              </span>
              {maintenanceMachinesCount > 0 && (
                <span className="text-rose-500 font-bold text-[10px]">
                  <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span>
                  {maintenanceMachinesCount} Maint.
                </span>
              )}
            </div>
          </div>

          {/* 1. CORRUGATION & PAPER CUTTING SECTION */}
          {corrugationMachines.length > 0 && (
            <div className={`rounded-2xl p-2.5 border ${themeStyles.boxWarnBg} space-y-2`}>
              <div className="flex items-center justify-between pb-1 border-b border-inherit/20">
                <span className={`text-xs font-black ${themeStyles.textWarn} uppercase tracking-wider flex items-center gap-1.5`}>
                  <span>🌀</span> Corrugation & Paper Cutting Section
                </span>
                <span className={`text-[10px] font-mono ${themeStyles.textSubtle} font-bold`}>Shift-Wise (Day & Night)</span>
              </div>

              <div className="space-y-1.5">
                {corrugationMachines.map((m, mIdx) => {
                  const isMaintenance = m.overallStatus === 'MAINTENANCE' || m.overallStatus === 'BREAKDOWN';

                  if (isMaintenance) {
                    return (
                      <div
                        key={mIdx}
                        className="p-2 rounded-xl border border-rose-900/60 bg-rose-950/25 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-rose-300">{m.machineName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 animate-pulse">
                          🔴 MAINTENANCE (Under Repair)
                        </span>
                      </div>
                    );
                  }

                  const hasMultipleShifts = m.shifts.length > 1;

                  return (
                    <div
                      key={mIdx}
                      className={`p-2 rounded-xl border ${themeStyles.innerCardBg} space-y-1`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-inherit">{m.machineName}</span>
                        {m.totalHours > 0 && (
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${themeStyles.badgeSuccess}`}>
                            {m.totalHours}h Total
                          </span>
                        )}
                      </div>

                      {/* Shifts in compact 1-line format */}
                      <div className="space-y-0.5">
                        {m.shifts.map((s, sIdx) => {
                          const isMaint = s.status === 'MAINTENANCE' || s.status === 'BREAKDOWN';
                          if (isMaint) {
                            return (
                              <div key={sIdx} className="text-[11px] text-rose-600 font-mono">
                                {s.shift === 'Night' ? '🌙' : '☀️'} {s.shift} ({s.shiftHours}h): [MAINTENANCE]
                              </div>
                            );
                          }
                          return (
                            <div key={sIdx} className={`flex items-center justify-between text-[11px] font-mono ${themeStyles.textRowBg} p-1 rounded border ${themeStyles.borderRow}`}>
                              <span className={`font-sans font-semibold ${themeStyles.textBody}`}>
                                {s.shift === 'Night' ? '🌙' : '☀️'} {s.shift} ({s.shiftHours}h):
                              </span>
                              <div className="flex items-center gap-2">
                                {s.runningSqMtr > 0 && <span className={`font-bold ${themeStyles.textSuccess}`}>{s.runningSqMtr.toLocaleString('en-IN')} SqM</span>}
                                {s.runningKg > 0 && <span className={themeStyles.textBody}>{s.runningKg} Kg</span>}
                                {s.totalPly > 0 && <span className={`font-bold ${themeStyles.textPrimary}`}>{s.totalPly.toLocaleString('en-IN')} Ply</span>}
                                {s.totalPaper > 0 && <span className={themeStyles.textPrimary}>{s.totalPaper.toLocaleString('en-IN')} Paper</span>}
                                {s.scrapKg > 0 && <span className={themeStyles.textWarn}>Scrap: {s.scrapKg} Kg</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Total line if multiple shifts */}
                      {hasMultipleShifts && (
                        <div className={`pt-1 border-t border-inherit/30 flex items-center justify-between text-[10px] font-mono ${themeStyles.textSubtle}`}>
                          <span className="uppercase font-bold">Total Output:</span>
                          <div className="flex gap-2">
                            <span className={`font-bold ${themeStyles.textSuccess}`}>{m.totalSqMtr.toLocaleString('en-IN')} SqM</span>
                            <span className={themeStyles.textBody}>{m.totalKg} Kg</span>
                            <span className={`font-bold ${themeStyles.textPrimary}`}>{m.totalPly.toLocaleString('en-IN')} Ply</span>
                            {m.totalScrapKg > 0 && <span className={themeStyles.textWarn}>{m.totalScrapKg} Kg Scrap</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. PASTING SECTION (USER RULE: NO REPETITIVE TEXT, JUST M/C 1 & M/C 2 IN 1 LINE) */}
          {pastingMachines.length > 0 && (
            <div className={`rounded-2xl p-2.5 border ${themeStyles.boxBlueBg} space-y-1.5`}>
              <div className="flex items-center justify-between pb-1 border-b border-inherit/20">
                <span className={`text-xs font-black ${themeStyles.textPrimary} uppercase tracking-wider flex items-center gap-1.5`}>
                  <span>📎</span> Pasting Department
                </span>
                <span className={`text-[10px] font-mono font-bold ${themeStyles.textPrimary}`}>
                  Total: {pastingMachines.reduce((acc, m) => acc + m.totalPly, 0).toLocaleString('en-IN')} Ply
                </span>
              </div>

              {/* 1-Line Clean Machine Entries */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {pastingMachines.map((m, idx) => {
                  // Simplified display: "M/c 1" or "M/c 2"
                  const shortName = m.machineName.replace(/pasting\s*(machine|m\/c)?\s*[-–]?\s*/gi, 'M/c ').trim();
                  const firstShift = m.shifts[0];
                  const hoursText = m.totalHours > 0 ? `(${m.totalHours}h)` : '';

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border ${themeStyles.innerCardBg} flex items-center justify-between`}
                    >
                      <div>
                        <span className="font-sans font-bold text-inherit text-xs block">
                          {shortName}
                        </span>
                        <span className={`text-[9px] ${themeStyles.textSubtle} font-sans`}>
                          {hoursText} {firstShift?.shift || 'Day'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-black text-sm ${themeStyles.textPrimary}`}>
                          {m.totalPly.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-[9px] ${themeStyles.textSubtle} block font-sans`}>Ply</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. PRINTING & DIE PUNCHING (USER RULE: NO DEPARTMENT HEADER, DIRECT 1-LINE RS4 & DIE) */}
          {finishingMachines.length > 0 && (
            <div className={`rounded-2xl p-2.5 border ${themeStyles.boxPurpleBg} space-y-1.5`}>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {finishingMachines.map((m, idx) => {
                  const firstShift = m.shifts[0];
                  const hoursText = m.totalHours > 0 ? `(${m.totalHours}h)` : '';
                  const qtyText = m.totalPaper > 0 ? `${m.totalPaper.toLocaleString('en-IN')} Sheets` : m.totalScrapSheet > 0 ? `${m.totalScrapSheet} Sheets` : `${m.totalPly} Nos`;

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border ${themeStyles.innerCardBg} flex items-center justify-between gap-2`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-sans font-bold text-inherit text-xs block leading-tight break-words">
                          {m.machineName}
                        </span>
                        <span className={`text-[9px] ${themeStyles.textSubtle} font-sans block mt-0.5`}>
                          ☀️ {firstShift?.shift || 'Day'} {hoursText}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-mono font-black text-sm ${themeStyles.textPurple}`}>
                          {(m.totalPaper || m.totalScrapSheet || m.totalPly).toLocaleString('en-IN')}
                        </span>
                        <span className={`text-[9px] ${themeStyles.textSubtle} block font-sans`}>Sheets</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ───────────────── FOOTER (Compact) ───────────────── */}
      <div
        className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[10px] ${themeStyles.footerBorder}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Packwell ERP Daily MIS Verification</span>
        </div>
        <div className="font-mono">
          Ready for MD Review • Single-Screen View
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Factory, Calendar, ChevronLeft, ChevronRight, Share2, 
  Printer, Edit3, CheckCircle2, AlertTriangle, Layers, 
  Clock, Sun, Moon, Sparkles, TrendingUp, 
  Box, Check, Flame, Calculator, PackageCheck, AlertCircle, Warehouse,
  Eye, EyeOff, Trash2, Plus, RotateCcw, X
} from 'lucide-react';
import { 
  getPlantMisByDate, 
  getMachineHistory, getDistinctMachineNames,
  saveSingleMachineCutSizes,
  toggleReportSection,
  deleteMachineFromDate,
  addMachineToDate,
  restoreAllPresetMachinesForDate
} from '../lib/supabase/plantMisService';
import type { PlantMisFullData, CutSizeItem } from '../lib/supabase/plantMisService';
import PlantMisEntryModal from './plant-mis/PlantMisEntryModal';
import CutSizeDetailModal from './plant-mis/CutSizeDetailModal';
import BulkCutSizeModal from './plant-mis/BulkCutSizeModal';
import PrintablePlantMis from './plant-mis/PrintablePlantMis';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function PlantDailyMIS() {
  const queryClient = useQueryClient();

  // Selected date defaults to 2026-05-27 (the date in user's Excel sheet)
  const [selectedDate, setSelectedDate] = useState<string>('2026-05-27');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ANALYTICS'>('OVERVIEW');

  // Modals state
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isAddMachineModalOpen, setIsAddMachineModalOpen] = useState(false);
  const [newMachinePreset, setNewMachinePreset] = useState('Manual Corrugation Machine');
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineShift, setNewMachineShift] = useState<'Day' | 'Night' | 'General'>('Day');
  const [newMachineHours, setNewMachineHours] = useState<number>(8);
  const [newMachineTiming, setNewMachineTiming] = useState('08:00 AM - 04:00 PM');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCutSizeMachine, setSelectedCutSizeMachine] = useState<{
    machineName: string;
    shift: string;
    items: CutSizeItem[];
    totalSqMtr: number;
    totalQty: number;
  } | null>(null);
  const [activeBulkModal, setActiveBulkModal] = useState<{
    machineName: string;
    shift: string;
    items: CutSizeItem[];
  } | null>(null);

  // WhatsApp copy toast state
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  // Machine Analytics tab states
  const [analyticsMachine, setAnalyticsMachine] = useState('Manual Corrugation Machine');
  const [analyticsFromDate, setAnalyticsFromDate] = useState('2026-05-01');
  const [analyticsToDate, setAnalyticsToDate] = useState('2026-05-31');

  // Query Daily Data
  const { data, isLoading, refetch } = useQuery<PlantMisFullData>({
    queryKey: ['plant-mis', selectedDate],
    queryFn: () => getPlantMisByDate(selectedDate)
  });

  // Query Machine Names for Analytics
  const { data: machineNamesList = [] } = useQuery({
    queryKey: ['distinct-machine-names'],
    queryFn: getDistinctMachineNames
  });

  // Query Machine History for Analytics Tab
  const { data: machineHistory = [] } = useQuery({
    queryKey: ['machine-history', analyticsMachine, analyticsFromDate, analyticsToDate],
    queryFn: () => getMachineHistory(analyticsMachine, analyticsFromDate, analyticsToDate),
    enabled: activeTab === 'ANALYTICS'
  });

  // Date Navigation
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleJumpToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const handleJumpToPrevWorkingDate = () => {
    if (data?.prevReport?.reportDate) {
      setSelectedDate(data.prevReport.reportDate);
    } else {
      handlePrevDay();
    }
  };

  // Formatted date string (e.g. 27/05/2026)
  const formattedDateStr = useMemo(() => {
    if (!selectedDate) return '';
    const [y, m, d] = selectedDate.split('-');
    return `${d}/${m}/${y}`;
  }, [selectedDate]);

  const prevDateFormattedStr = useMemo(() => {
    if (!data?.prevReport?.reportDate) return 'No Previous Record';
    const [y, m, d] = data.prevReport.reportDate.split('-');
    return `${d}/${m}/${y}`;
  }, [data?.prevReport]);

  // Total Boxes Produced (NOT Dispatched)
  const totalBoxesProduced = useMemo(() => {
    if (!data?.fgItems) return 0;
    return data.fgItems.reduce((acc, curr) => acc + (Number(curr.qtyBox) || 0), 0);
  }, [data?.fgItems]);

  const totalRunningSqMtr = useMemo(() => {
    if (!data?.machineLogs) return 0;
    return data.machineLogs.reduce((acc, curr) => acc + (Number(curr.runningSqMtr) || 0), 0);
  }, [data?.machineLogs]);

  const runningMachinesCount = useMemo(() => {
    if (!data?.machineLogs) return 0;
    return data.machineLogs.filter(m => m.status === 'RUNNING').length;
  }, [data?.machineLogs]);

  const maintenanceMachinesCount = useMemo(() => {
    if (!data?.machineLogs) return 0;
    return data.machineLogs.filter(m => m.status === 'MAINTENANCE' || m.status === 'BREAKDOWN').length;
  }, [data?.machineLogs]);

  // Section toggle handler
  const handleToggleSection = async (
    sectionKey: 'showRevenue' | 'showStockValuation' | 'showFgProduced' | 'showMachines',
    isVisible: boolean
  ) => {
    setActionLoading(true);
    try {
      await toggleReportSection(selectedDate, sectionKey, isVisible);
      await refetch();
    } catch (err: any) {
      console.error('Error toggling section:', err);
      alert('Error updating section visibility: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Machine delete handler
  const handleDeleteMachine = async (machineName: string, shift: string) => {
    setActionLoading(true);
    try {
      await deleteMachineFromDate(selectedDate, machineName, shift, data?.machineLogs || []);
      await refetch();
    } catch (err: any) {
      console.error('Error deleting machine:', err);
      alert('Error removing machine: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Machine reset to default 8 machines handler
  const handleResetDefaultMachines = async () => {
    setActionLoading(true);
    try {
      await restoreAllPresetMachinesForDate(selectedDate);
      await refetch();
    } catch (err: any) {
      console.error('Error restoring default machines:', err);
      alert('Error restoring default machines: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Add new machine submit handler
  const handleAddMachineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalMachineName = newMachinePreset === 'Custom' ? newMachineName.trim() : newMachinePreset;
    if (!finalMachineName) {
      alert('Please enter a machine name');
      return;
    }

    setActionLoading(true);
    try {
      await addMachineToDate(selectedDate, {
        machineName: finalMachineName,
        shift: newMachineShift,
        shiftHours: Number(newMachineHours) || 8,
        shiftTiming: newMachineTiming.trim() || undefined,
        status: 'RUNNING',
        runningSqMtr: 0,
        runningKg: 0,
        totalPly: 0,
        totalPaper: 0,
        scrapKg: 0,
        scrapSheet: 0,
        notes: '',
        sortOrder: (data?.machineLogs.length || 0) + 1,
        cutSizeBreakdown: []
      }, data?.machineLogs || []);

      setIsAddMachineModalOpen(false);
      await refetch();
    } catch (err: any) {
      console.error('Error adding machine:', err);
      alert('Error adding machine: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Generate WhatsApp Message & Copy to Clipboard
  const handleCopyWhatsAppReport = () => {
    if (!data) return;
    const { report, fgItems, machineLogs, prevReport, mtdSummary, fgStockValuation } = data;

    const dateFormatted = formattedDateStr;
    const prevFormatted = prevDateFormattedStr;

    // Day of week
    const dateObj = new Date(selectedDate);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

    let msg = `📊 *PACKWELL INDIA - PLANT DAILY MIS REPORT*\n`;
    msg += `📅 *Date:* ${dateFormatted} (${dayName})\n`;
    msg += `⏮️ *Prev Working Date:* ${prevFormatted}\n\n`;

    // 1. Sale & Revenue (Omitted if removed)
    if (report.showRevenue !== false) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💰 *1. SALE & REVENUE BREAKDOWN*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🔹 *Day's Sale (${dateFormatted}):*\n`;
      msg += `  • Self Mfg (Khud banayi): ₹ ${report.selfSaleExclGst.toLocaleString('en-IN')} (Without GST) | ₹ ${report.selfSaleInclGst.toLocaleString('en-IN')} (With GST)\n`;
      msg += `  • Outsource (Bahar se li): ₹ ${report.outsourceSaleExclGst.toLocaleString('en-IN')} (Without GST) | ₹ ${report.outsourceSaleInclGst.toLocaleString('en-IN')} (With GST)\n`;
      msg += `  • *Total Day Sale:* ₹ ${report.totalSaleExclGst.toLocaleString('en-IN')} (Without GST) | ₹ ${report.totalSaleInclGst.toLocaleString('en-IN')} (With GST)\n\n`;

      msg += `🔹 *Overall Current Month Sale (MTD):*\n`;
      msg += `  • Self Mfg Cumulative: ₹ ${mtdSummary.selfExcl.toLocaleString('en-IN')} (Without GST) | ₹ ${mtdSummary.selfIncl.toLocaleString('en-IN')} (With GST)\n`;
      msg += `  • Outsource Cumulative: ₹ ${mtdSummary.outsourceExcl.toLocaleString('en-IN')} (Without GST) | ₹ ${mtdSummary.outsourceIncl.toLocaleString('en-IN')} (With GST)\n`;
      msg += `  • *Total Month Sale:* ₹ ${mtdSummary.totalExcl.toLocaleString('en-IN')} (Without GST) | ₹ ${mtdSummary.totalIncl.toLocaleString('en-IN')} (With GST)\n\n`;
    }

    // 2. Finish Goods Warehouse Stock (Omitted if removed)
    if (report.showStockValuation !== false) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🏢 *2. FINISH GOODS WAREHOUSE STOCK VALUE*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `• Regular FG Stock Value: ₹ ${fgStockValuation.regularValue.toLocaleString('en-IN')}\n`;
      msg += `• Non-Moving FG Value: ₹ ${fgStockValuation.nonMovingValue.toLocaleString('en-IN')}\n`;
      msg += `• *Total FG Warehouse Value:* ₹ ${fgStockValuation.totalValue.toLocaleString('en-IN')}\n\n`;
    }

    // 3. Finish Goods Produced (Omitted if removed)
    if (report.showFgProduced !== false) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📦 *3. FINISH GOODS PRODUCED TODAY (${totalBoxesProduced.toLocaleString('en-IN')} Boxes)*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      if (fgItems.length === 0) {
        msg += `• No production items recorded\n`;
      } else {
        fgItems.forEach(fg => {
          msg += `• ${fg.vendorName} - ${fg.itemName}: ${fg.qtyBox.toLocaleString('en-IN')} Boxes\n`;
        });
      }
      msg += `\n`;
    }

    // 4. Machine Performance (Omitted if removed)
    if (report.showMachines !== false) {
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚙️ *4. MACHINE PERFORMANCE & RUNNING SQ MTR*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      machineLogs.forEach(m => {
        const shiftTag = `${m.shift} - ${m.shiftHours}h`;
        if (m.status === 'MAINTENANCE') {
          msg += `🔴 *${m.machineName} (${shiftTag}):* [MAINTENANCE]\n`;
        } else {
          const details: string[] = [];
          if (m.runningSqMtr > 0) details.push(`${m.runningSqMtr.toLocaleString('en-IN')} SqM`);
          if (m.runningKg > 0) details.push(`${m.runningKg} Kg`);
          if (m.totalPly > 0) details.push(`${m.totalPly} Ply`);
          if (m.totalPaper > 0) details.push(`${m.totalPaper} Paper`);
          if (m.scrapSheet > 0) details.push(`${m.scrapSheet} Sheets`);
          if (m.scrapKg > 0) details.push(`Scrap: ${m.scrapKg} Kg`);

          msg += `🟢 *${m.machineName} (${shiftTag}):* ${details.join(' | ')}\n`;
        }
      });
    }

    if (report.remarks) {
      msg += `\n📝 *Notes:* ${report.remarks}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Generated via Packwell ERP System_`;

    navigator.clipboard.writeText(msg);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 3500);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
          <Factory className="w-8 h-8 text-blue-500 animate-pulse" />
          <span>Loading Plant Daily MIS...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-full space-y-6 max-w-7xl mx-auto pb-16">
      {/* Printable Area (Visible only when printing) */}
      <PrintablePlantMis
        data={data}
        formattedDateStr={formattedDateStr}
        prevDateFormattedStr={prevDateFormattedStr}
      />

      {/* Screen Interface (Hidden when printing) */}
      <div className="print:hidden space-y-6">
        {/* TOP CONTROL & ACTIONS BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Factory className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
                  Plant Daily MIS
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold border border-emerald-500/20">
                    Daily Production & Revenue
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Packwell India Plant Production Report of <span className="font-bold text-foreground">{formattedDateStr}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Date Navigator + Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Date Navigator */}
            <div className="flex items-center bg-secondary/60 rounded-xl p-1 border border-border">
              <button
                onClick={handlePrevDay}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-bold px-2 py-1 bg-transparent text-foreground focus:outline-none"
              />

              <button
                onClick={handleNextDay}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleJumpToToday}
                className="px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors ml-1"
              >
                Today
              </button>
            </div>

            {/* Jump to Prev Working Date */}
            {data.prevReport && (
              <button
                onClick={handleJumpToPrevWorkingDate}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border transition-colors hidden sm:flex items-center gap-1"
                title={`Jump to ${prevDateFormattedStr}`}
              >
                <span>⏮️ Prev: {prevDateFormattedStr}</span>
              </button>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyWhatsAppReport}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
                  copiedWhatsapp
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25'
                }`}
                title="Copy WhatsApp Summary for Directors"
              >
                {copiedWhatsapp ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedWhatsapp ? 'Copied to WhatsApp!' : 'Copy WhatsApp Report'}</span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors shadow-sm"
                title="Print Executive A4 Report"
              >
                <Printer className="w-4 h-4 text-muted-foreground" />
                <span className="hidden sm:inline">Print / PDF</span>
              </button>

              <button
                onClick={() => setIsEntryModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit / Enter Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex items-center border-b border-border space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`pb-3 border-b-2 font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'OVERVIEW'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Factory className="w-4 h-4" />
            Executive Daily Report
          </button>

          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`pb-3 border-b-2 font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'ANALYTICS'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Machine History & Trends
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: EXECUTIVE DAILY REPORT */}
        {/* ========================================================================= */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* REPORT SECTIONS CONTROLS TOOLBAR */}
            <div className="bg-card border border-border/80 p-3.5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Report Sections for {formattedDateStr}:
                </span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  (Kaam nahi hua to uncheck/remove kare - WhatsApp aur Print se bhi hide ho jayega)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Revenue Pill */}
                <button
                  type="button"
                  onClick={() => handleToggleSection('showRevenue', !(data.report.showRevenue !== false))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    data.report.showRevenue !== false
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                      : 'bg-secondary/40 text-muted-foreground border-dashed border-border line-through hover:text-foreground'
                  }`}
                  title="Click to show/hide Revenue section"
                >
                  {data.report.showRevenue !== false ? <Check className="w-3.5 h-3.5 text-blue-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>💰 1. Sale & Revenue</span>
                </button>

                {/* 2. Stock Valuation Pill */}
                <button
                  type="button"
                  onClick={() => handleToggleSection('showStockValuation', !(data.report.showStockValuation !== false))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    data.report.showStockValuation !== false
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
                      : 'bg-secondary/40 text-muted-foreground border-dashed border-border line-through hover:text-foreground'
                  }`}
                  title="Click to show/hide FG Warehouse Stock section"
                >
                  {data.report.showStockValuation !== false ? <Check className="w-3.5 h-3.5 text-amber-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>🏢 2. Warehouse Stock</span>
                </button>

                {/* 3. FG Produced Pill */}
                <button
                  type="button"
                  onClick={() => handleToggleSection('showFgProduced', !(data.report.showFgProduced !== false))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    data.report.showFgProduced !== false
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-secondary/40 text-muted-foreground border-dashed border-border line-through hover:text-foreground'
                  }`}
                  title="Click to show/hide FG Produced section"
                >
                  {data.report.showFgProduced !== false ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>📦 3. FG Produced</span>
                </button>

                {/* 4. Machine Logs Pill */}
                <button
                  type="button"
                  onClick={() => handleToggleSection('showMachines', !(data.report.showMachines !== false))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    data.report.showMachines !== false
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
                      : 'bg-secondary/40 text-muted-foreground border-dashed border-border line-through hover:text-foreground'
                  }`}
                  title="Click to show/hide Machines section"
                >
                  {data.report.showMachines !== false ? <Check className="w-3.5 h-3.5 text-purple-500" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>⚙️ 4. Machines ({data.machineLogs.length})</span>
                </button>
              </div>
            </div>

            {/* 1. FINANCIAL REVENUE & SALE */}
            {data.report.showRevenue === false ? (
              <div className="bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                  <span><strong>1. Sale & Revenue Section</strong> report se remove/hidden hai (aaj sale nahi hui).</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('showRevenue', true)}
                  className="text-xs font-bold text-blue-500 hover:underline px-3 py-1 rounded-lg bg-blue-500/10"
                >
                  + Restore Revenue Section
                </button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      1. Sale & Revenue Summary (With & Without GST)
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Self Manufacturing (In-house) vs Outsource Sale (Bahar se li hui)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {data.prevReport && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>Previous Working Date:</span>
                        <span className="font-bold font-mono text-foreground">{prevDateFormattedStr}</span>
                        <span className="text-xs font-mono text-blue-500 font-semibold">(₹{data.prevReport.totalSaleInclGst.toLocaleString('en-IN')})</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleSection('showRevenue', false)}
                      className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg border border-border/60 transition-colors flex items-center gap-1"
                      title="Remove revenue section from today's report"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>

              {/* 2 Primary Side-by-Side Panels: Day's Sale vs Month Cumulative */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Panel 1: Pichle Din ki Sale / Report Date Sale */}
                <div className="rounded-2xl border-2 border-blue-500/40 bg-gradient-to-b from-blue-900/10 via-secondary/20 to-background p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                        Day's Sale
                      </span>
                      <h3 className="text-base font-black text-foreground mt-1">
                        Report Date: <span className="font-mono">{formattedDateStr}</span>
                      </h3>
                    </div>
                    <Flame className="w-5 h-5 text-amber-500" />
                  </div>

                  <div className="space-y-3">
                    {/* Self Manufacturing */}
                    <div className="p-3 rounded-xl bg-background/80 border border-border/70 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          🏭 Self Manufacturing <span className="text-[10px] text-muted-foreground font-normal">(Khud banayi)</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Without GST (Excl):</span>
                          <span className="font-bold text-foreground">₹{data.report.selfSaleExclGst.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">With GST (Incl):</span>
                          <span className="font-extrabold text-blue-600 dark:text-blue-400">₹{data.report.selfSaleInclGst.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Outsource Sale */}
                    <div className="p-3 rounded-xl bg-background/80 border border-border/70 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          🚚 Outsource Sale <span className="text-[10px] text-muted-foreground font-normal">(Bahar se lekar bechi)</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Without GST (Excl):</span>
                          <span className="font-bold text-foreground">₹{data.report.outsourceSaleExclGst.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">With GST (Incl):</span>
                          <span className="font-extrabold text-purple-600 dark:text-purple-400">₹{data.report.outsourceSaleInclGst.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Day Grand Total */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border border-blue-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-blue-400 font-bold block">
                          Total Day's Sale ({formattedDateStr})
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          Without GST: ₹{data.report.totalSaleExclGst.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">With GST (Total)</span>
                        <span className="text-xl font-black text-blue-500 font-mono">
                          ₹{data.report.totalSaleInclGst.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Overall Current Month Total (MTD Cumulative) */}
                <div className="rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-b from-indigo-900/10 via-secondary/20 to-background p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        Overall Current Month (MTD)
                      </span>
                      <h3 className="text-base font-black text-foreground mt-1">
                        1st to {formattedDateStr} <span className="text-xs text-muted-foreground font-normal">({data.mtdSummary.daysCount} Days)</span>
                      </h3>
                    </div>
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                  </div>

                  <div className="space-y-3">
                    {/* Self Manufacturing Cumulative */}
                    <div className="p-3 rounded-xl bg-background/80 border border-border/70 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          🏭 Self Mfg Cumulative <span className="text-[10px] text-muted-foreground font-normal">(In-house Total)</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Without GST (Excl):</span>
                          <span className="font-bold text-foreground">₹{data.mtdSummary.selfExcl.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">With GST (Incl):</span>
                          <span className="font-extrabold text-indigo-500">₹{data.mtdSummary.selfIncl.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Outsource Sale Cumulative */}
                    <div className="p-3 rounded-xl bg-background/80 border border-border/70 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          🚚 Outsource Cumulative <span className="text-[10px] text-muted-foreground font-normal">(Outsource Total)</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Without GST (Excl):</span>
                          <span className="font-bold text-foreground">₹{data.mtdSummary.outsourceExcl.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">With GST (Incl):</span>
                          <span className="font-extrabold text-purple-400">₹{data.mtdSummary.outsourceIncl.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Month Grand Total */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-900/30 to-purple-900/20 border border-indigo-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-indigo-400 font-bold block">
                          Total Current Month Sale (MTD)
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          Without GST: ₹{data.mtdSummary.totalExcl.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">With GST (Total)</span>
                        <span className="text-xl font-black text-indigo-400 font-mono">
                          ₹{data.mtdSummary.totalIncl.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* 2. FINISH GOODS WAREHOUSE STOCK VALUATION */}
            {data.report.showStockValuation === false ? (
              <div className="bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                  <span><strong>2. Finish Goods Warehouse Stock Valuation Section</strong> report se remove/hidden hai.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('showStockValuation', true)}
                  className="text-xs font-bold text-amber-500 hover:underline px-3 py-1 rounded-lg bg-amber-500/10"
                >
                  + Restore Stock Valuation Section
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-slate-900/40 via-card to-background border border-border rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <Warehouse className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        Finish Goods Stock Warehouse Valuation
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold border border-emerald-500/20">
                          ⚡ Live from Finish Goods Sheet
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Warehouse me ready stock ki exact monetary value (Regular vs Non-Moving)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-muted-foreground">
                      Total Inventory Boxes: <strong className="text-foreground">{data.fgStockValuation.totalBoxes.toLocaleString('en-IN')}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleSection('showStockValuation', false)}
                      className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg border border-border/60 transition-colors flex items-center gap-1"
                      title="Remove warehouse stock section from today's report"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Regular FG Value */}
                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Regular FG Stock Value</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                        {data.fgStockValuation.regularBoxes.toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                    <div className="text-2xl font-black text-emerald-500 font-mono">
                      ₹{data.fgStockValuation.regularValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Active fast-moving inventory</span>
                  </div>

                  {/* Non-Moving FG Value */}
                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Non-Moving FG Value</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">
                        {data.fgStockValuation.nonMovingBoxes.toLocaleString('en-IN')} Boxes
                      </span>
                    </div>
                    <div className="text-2xl font-black text-amber-500 font-mono">
                      ₹{data.fgStockValuation.nonMovingValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Dormant / Slow-moving stock</span>
                  </div>

                  {/* Total Warehouse FG Value */}
                  <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/30 p-4 rounded-xl shadow-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400">Total FG Warehouse Value</span>
                      <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">Combined</span>
                    </div>
                    <div className="text-2xl font-black text-blue-500 font-mono">
                      ₹{data.fgStockValuation.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[10px] text-muted-foreground block">Total value of ready goods in plant</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PLANT KEY OUTPUT METRICS BAR */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Total Boxes Produced</span>
                  <span className="text-2xl font-black text-foreground font-mono mt-0.5 block">
                    {totalBoxesProduced.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{data.fgItems.length} Products Ready</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Box className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Running Output</span>
                  <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5 block">
                    {totalRunningSqMtr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} <span className="text-sm font-normal">m²</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">Corrugation & Cutting Output</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Active Machines</span>
                  <span className="text-2xl font-black text-emerald-500 font-mono mt-0.5 block">
                    {runningMachinesCount} <span className="text-sm text-muted-foreground font-normal">/ {data.machineLogs.length}</span>
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Running on Floor</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Under Maintenance</span>
                  <span className={`text-2xl font-black font-mono mt-0.5 block ${
                    maintenanceMachinesCount > 0 ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {maintenanceMachinesCount}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {maintenanceMachinesCount > 0 ? 'Downtime / Scheduled' : 'All Running Smoothly'}
                  </span>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  maintenanceMachinesCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-secondary text-muted-foreground'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 4. FINISH GOODS PRODUCED & MACHINES (SIDE BY SIDE ON LARGE SCREENS) */}
            {data.report.showFgProduced === false && data.report.showMachines === false ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                    <span><strong>3. Finish Goods Produced Section</strong> report se remove/hidden hai.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSection('showFgProduced', true)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-3 py-1 rounded-lg bg-emerald-500/10"
                  >
                    + Restore FG Section
                  </button>
                </div>

                <div className="bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                    <span><strong>4. Machine Performance Section</strong> report se remove/hidden hai.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSection('showMachines', true)}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline px-3 py-1 rounded-lg bg-purple-500/10"
                  >
                    + Restore Machines Section
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Finish Goods Produced */}
                {data.report.showFgProduced === false ? (
                  <div className="lg:col-span-12 bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                      <span><strong>3. Finish Goods Produced Section</strong> report se remove/hidden hai (aaj koi FG nahi bana).</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSection('showFgProduced', true)}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-3 py-1 rounded-lg bg-emerald-500/10"
                    >
                      + Restore FG Section
                    </button>
                  </div>
                ) : (
                  <div className={`${data.report.showMachines === false ? 'lg:col-span-12' : 'lg:col-span-5'} bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4 flex flex-col`}>
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Box className="w-4 h-4 text-emerald-500" />
                          Finish Goods Produced Today
                        </h3>
                        <p className="text-xs text-muted-foreground">Material plant me ready hua (Production Quantity)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                          {totalBoxesProduced.toLocaleString('en-IN')} Boxes Ready
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleSection('showFgProduced', false)}
                          className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg border border-border/60 transition-colors flex items-center gap-1"
                          title="Remove FG section from today's report"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto max-h-[520px] border border-border rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-secondary/60 text-muted-foreground font-semibold uppercase text-[11px] sticky top-0 border-b border-border">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">#</th>
                            <th className="py-2.5 px-3">Vendor / Customer</th>
                            <th className="py-2.5 px-3">Item Name / Product</th>
                            <th className="py-2.5 px-3 text-right">Produced Qty (Box)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {data.fgItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-muted-foreground text-xs">
                                No finished goods production recorded for this date.
                              </td>
                            </tr>
                          ) : (
                            data.fgItems.map((fg, idx) => (
                              <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                                <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">{idx + 1}</td>
                                <td className="py-2 px-3 font-semibold text-foreground uppercase tracking-tight">
                                  <span className="px-1.5 py-0.5 rounded bg-secondary font-mono text-[10px] mr-1.5">
                                    {fg.vendorName}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-foreground font-medium">{fg.itemName}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {fg.qtyBox.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-secondary/40 font-bold border-t border-border sticky bottom-0">
                          <tr>
                            <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[11px] text-muted-foreground">
                              Total Produced Boxes:
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                              {totalBoxesProduced.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Right Column: Machine-wise Performance */}
                {data.report.showMachines === false ? (
                  <div className="lg:col-span-12 bg-card/70 border border-dashed border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <EyeOff className="w-4 h-4 text-muted-foreground/60" />
                      <span><strong>4. Machine Performance Section</strong> report se remove/hidden hai (aaj machines nahi chali).</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleSection('showMachines', true)}
                      className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline px-3 py-1 rounded-lg bg-purple-500/10"
                    >
                      + Restore Machines Section
                    </button>
                  </div>
                ) : (
                  <div className={`${data.report.showFgProduced === false ? 'lg:col-span-12' : 'lg:col-span-7'} bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Factory className="w-4 h-4 text-blue-500" />
                          Machine Production & Shift Timings
                        </h3>
                        <p className="text-xs text-muted-foreground">Running hours, square meter bulk output, ply and paper</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const targetMachine = data.machineLogs.find(m => m.machineName.toLowerCase().includes('corrugation') || m.machineName.toLowerCase().includes('cutting')) || data.machineLogs[0];
                            if (targetMachine) {
                              setActiveBulkModal({
                                machineName: targetMachine.machineName,
                                shift: targetMachine.shift,
                                items: targetMachine.cutSizeBreakdown || []
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 transition-all shadow-sm"
                          title="Formula: (Cut Size Inches * Qty) / 39.37"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>📐 Bulk Calculator</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsAddMachineModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm"
                          title="Add a new machine or additional shift for today"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add Machine</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleResetDefaultMachines}
                          className="px-2 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 border border-border transition-colors flex items-center gap-1"
                          title="Reset to 8 default machines"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Reset</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleSection('showMachines', false)}
                          className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg border border-border/60 transition-colors flex items-center gap-1"
                          title="Remove machines section from today's report"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                <div className="space-y-3">
                  {data.machineLogs.map((m, idx) => {
                    const isMaint = m.status === 'MAINTENANCE' || m.status === 'BREAKDOWN';
                    const hasCutBreakdown = m.cutSizeBreakdown && m.cutSizeBreakdown.length > 0;
                    const isCorrugationOrPaper = m.machineName.toLowerCase().includes('corrugation') || m.machineName.toLowerCase().includes('cutting');

                    return (
                      <div 
                        key={idx} 
                        className={`p-3.5 rounded-xl border transition-all ${
                          isMaint 
                            ? 'bg-red-500/5 border-red-500/30' 
                            : 'bg-card border-border hover:border-blue-500/40 shadow-sm'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              {m.machineName}
                            </span>

                            {/* Shift Badge */}
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                              m.shift === 'Day' 
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                : m.shift === 'Night'
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : 'bg-secondary text-muted-foreground'
                            }`}>
                              {m.shift === 'Day' ? <Sun className="w-2.5 h-2.5" /> : <Moon className="w-2.5 h-2.5" />}
                              {m.shift} Shift ({m.shiftHours}h)
                            </span>

                            {m.shiftTiming && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                • {m.shiftTiming}
                              </span>
                            )}
                          </div>

                          {/* Status Pill & Bulk Calculator button */}
                          <div className="flex items-center gap-2">
                            {isCorrugationOrPaper && (
                              <button
                                type="button"
                                onClick={() => setActiveBulkModal({
                                  machineName: m.machineName,
                                  shift: m.shift,
                                  items: m.cutSizeBreakdown || []
                                })}
                                className="px-2.5 py-0.5 rounded-md text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 flex items-center gap-1 transition-all"
                                title="Automatic Running Sq Mtr = (Cut Size * Qty) / 39.37"
                              >
                                <Calculator className="w-3 h-3 text-amber-500" />
                                {hasCutBreakdown ? `Cut-Sizes (${m.cutSizeBreakdown?.length} Jobs)` : '📐 Bulk Sq Mtr Calculator'}
                              </button>
                            )}

                            {isMaint ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-sm shadow-red-600/30">
                                🔴 MAINTENANCE
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                🟢 RUNNING
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteMachine(m.machineName, m.shift)}
                              className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors ml-1"
                              title="Agar ye machine aaj nahi chali to remove kare"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Machine Output Metrics */}
                        {isMaint ? (
                          <div className="text-xs text-red-500 font-medium py-1">
                            {m.notes || 'Machine is under maintenance / scheduled downtime.'}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-4 text-xs pt-1 border-t border-border/40">
                            {/* Running Sq Mtr */}
                            {m.runningSqMtr > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Running Sq Mtr</span>
                                <div className="flex items-center gap-1">
                                  <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                                    {m.runningSqMtr.toLocaleString('en-IN')} m²
                                  </span>
                                  {isCorrugationOrPaper && (
                                    <span className="text-[9px] text-muted-foreground font-mono">
                                      ((Cut"×Qty)/39.37)
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Weight */}
                            {m.runningKg > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Running (Kg)</span>
                                <span className="font-mono font-bold text-foreground">
                                  {m.runningKg.toLocaleString('en-IN')} kg
                                </span>
                              </div>
                            )}

                            {/* Ply */}
                            {m.totalPly > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Total Ply</span>
                                <span className="font-mono font-bold text-foreground">
                                  {m.totalPly.toLocaleString('en-IN')} Nos
                                </span>
                              </div>
                            )}

                            {/* Paper */}
                            {m.totalPaper > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Total Paper</span>
                                <span className="font-mono font-bold text-foreground">
                                  {m.totalPaper.toLocaleString('en-IN')} Nos
                                </span>
                              </div>
                            )}

                            {/* Scrap Sheets */}
                            {m.scrapSheet > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Sheets</span>
                                <span className="font-mono font-bold text-foreground">
                                  {m.scrapSheet.toLocaleString('en-IN')} Sheets
                                </span>
                              </div>
                            )}

                            {/* Scrap (Kg) */}
                            {m.scrapKg > 0 && (
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Scrap (Kg)</span>
                                <span className="font-mono font-bold text-red-500">
                                  {m.scrapKg} kg
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

            {/* 5. PLANT REMARKS CARD */}
            {data.report.remarks && (
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Plant Master Remarks</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{data.report.remarks}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MACHINE HISTORY & TRENDS */}
        {/* ========================================================================= */}
        {activeTab === 'ANALYTICS' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Machine Historical Production Analytics
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Filter by machine and date range to inspect historical hours, square meters, and scrap.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={analyticsMachine}
                    onChange={e => setAnalyticsMachine(e.target.value)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-border bg-background text-foreground"
                  >
                    {machineNamesList.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="date"
                      value={analyticsFromDate}
                      onChange={e => setAnalyticsFromDate(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs"
                    />
                    <span className="text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={analyticsToDate}
                      onChange={e => setAnalyticsToDate(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Chart */}
              {machineHistory.length > 0 && (
                <div className="h-64 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={machineHistory}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="report_date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="running_sq_mtr" name="Running Sq Mtr" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Historical Table */}
              <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground font-semibold uppercase text-[11px] border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Hours</th>
                      <th className="py-2.5 px-3 text-right">Sq Mtr</th>
                      <th className="py-2.5 px-3 text-right">Kgs</th>
                      <th className="py-2.5 px-3 text-right">Ply / Paper</th>
                      <th className="py-2.5 px-3 text-right">Scrap (Kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {machineHistory.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                          No historical data found for {analyticsMachine} in this date range.
                        </td>
                      </tr>
                    ) : (
                      machineHistory.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-secondary/20">
                          <td className="py-2 px-3 font-mono font-bold text-foreground">{row.report_date}</td>
                          <td className="py-2 px-3">{row.shift} ({row.shift_hours}h)</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.status === 'RUNNING' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{row.shift_hours}h</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                            {Number(row.running_sq_mtr || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{Number(row.running_kg || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {Number(row.total_ply || row.total_paper || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-red-500">{row.scrap_kg || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Entry / Edit Modal */}
      {isEntryModalOpen && (
        <PlantMisEntryModal
          initialData={data}
          selectedDate={selectedDate}
          onClose={() => setIsEntryModalOpen(false)}
          onSuccess={savedDate => {
            queryClient.invalidateQueries({ queryKey: ['plant-mis'] });
            setSelectedDate(savedDate);
          }}
        />
      )}

      {/* Bulk Cut Size Calculator Modal with Direct Save */}
      {activeBulkModal && (
        <BulkCutSizeModal
          machineName={activeBulkModal.machineName}
          shift={activeBulkModal.shift}
          reportDate={selectedDate}
          initialItems={activeBulkModal.items}
          onClose={() => setActiveBulkModal(null)}
          onSaveDirect={async (summary) => {
            await saveSingleMachineCutSizes(
              selectedDate,
              activeBulkModal.machineName,
              activeBulkModal.shift,
              summary.totalSqMtr,
              summary.totalQty,
              summary.items
            );
            await queryClient.invalidateQueries({ queryKey: ['plant-mis'] });
            await refetch();
          }}
        />
      )}

      {/* Cut Size Breakdown Inspector Modal */}
      {selectedCutSizeMachine && (
        <CutSizeDetailModal
          machineName={selectedCutSizeMachine.machineName}
          shift={selectedCutSizeMachine.shift}
          items={selectedCutSizeMachine.items}
          totalSqMtr={selectedCutSizeMachine.totalSqMtr}
          totalQty={selectedCutSizeMachine.totalQty}
          onClose={() => setSelectedCutSizeMachine(null)}
          onOpenCalculator={() => {
            const target = selectedCutSizeMachine;
            setSelectedCutSizeMachine(null);
            if (target) {
              setActiveBulkModal({
                machineName: target.machineName,
                shift: target.shift,
                items: target.items
              });
            }
          }}
        />
      )}

      {/* Quick Add Machine Modal */}
      {isAddMachineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <Plus className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Add Machine to Today's Report
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Date: {formattedDateStr}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMachineModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMachineSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-foreground block mb-1">
                  Machine Type / Preset:
                </label>
                <select
                  value={newMachinePreset}
                  onChange={e => {
                    const val = e.target.value;
                    setNewMachinePreset(val);
                    if (val !== 'Custom') {
                      setNewMachineName(val);
                      if (val.toLowerCase().includes('night')) {
                        setNewMachineShift('Night');
                        setNewMachineTiming('08:00 PM - 04:00 AM');
                      } else if (val.toLowerCase().includes('general') || val.toLowerCase().includes('cutting')) {
                        setNewMachineShift('General');
                        setNewMachineTiming('08:00 AM - 08:00 PM');
                      } else {
                        setNewMachineShift('Day');
                        setNewMachineTiming('08:00 AM - 04:00 PM');
                      }
                    } else {
                      setNewMachineName('');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                >
                  <option value="Semi Auto Corrugation Machine">Semi Auto Corrugation Machine</option>
                  <option value="Manual Corrugation Machine">Manual Corrugation Machine</option>
                  <option value="Pasting M/c - 1">Pasting M/c - 1</option>
                  <option value="Pasting M/c - 2">Pasting M/c - 2</option>
                  <option value="RS-4 Printing M/c">RS-4 Printing M/c</option>
                  <option value="Die M/c">Die M/c</option>
                  <option value="Paper Cutting M/c">Paper Cutting M/c</option>
                  <option value="Slitter Scorer M/c">Slitter Scorer M/c</option>
                  <option value="Stitching M/c">Stitching M/c</option>
                  <option value="Lamination M/c">Lamination M/c</option>
                  <option value="Custom">+ Custom Machine Name...</option>
                </select>
              </div>

              {newMachinePreset === 'Custom' && (
                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Custom Machine Name:
                  </label>
                  <input
                    type="text"
                    required
                    value={newMachineName}
                    onChange={e => setNewMachineName(e.target.value)}
                    placeholder="e.g. Automatic Folder Gluer"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-foreground block mb-1">Shift:</label>
                  <select
                    value={newMachineShift}
                    onChange={e => setNewMachineShift(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                  >
                    <option value="Day">☀️ Day Shift</option>
                    <option value="Night">🌙 Night Shift</option>
                    <option value="General">🕒 General Shift</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">Shift Hours:</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={newMachineHours}
                    onChange={e => setNewMachineHours(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">
                  Shift Timing (Optional):
                </label>
                <input
                  type="text"
                  value={newMachineTiming}
                  onChange={e => setNewMachineTiming(e.target.value)}
                  placeholder="e.g. 08:00 AM - 08:00 PM"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddMachineModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-secondary text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {actionLoading ? 'Adding...' : '+ Add Machine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

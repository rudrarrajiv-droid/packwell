import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Trash2, Save, Zap, AlertCircle, Calculator, 
  Layers, Clock, Sun, Moon, Gauge, Sparkles, Check, CheckCircle2 
} from 'lucide-react';
import { supabase } from '../../lib/supabase/config';
import { 
  savePlantMisFullReport, getAutoFillProducedFgForDate, getAutoFillDispatchesForDate, 
  DEFAULT_PRESET_MACHINES 
} from '../../lib/supabase/plantMisService';
import type { 
  PlantMisFullData, PlantMisFgItem, PlantMisMachineLog, 
  CutSizeItem 
} from '../../lib/supabase/plantMisService';
import { useAuth } from '../../contexts/AuthContext';
import BulkCutSizeModal from './BulkCutSizeModal';

interface PlantMisEntryModalProps {
  initialData: PlantMisFullData;
  selectedDate: string;
  onClose: () => void;
  onSuccess: (savedDate: string) => void;
}

export default function PlantMisEntryModal({
  initialData,
  selectedDate,
  onClose,
  onSuccess
}: PlantMisEntryModalProps) {
  const { user } = useAuth();

  const [reportDate, setReportDate] = useState(selectedDate);
  const [selfSaleExcl, setSelfSaleExcl] = useState<number | string>(initialData.report.selfSaleExclGst || '');
  const [selfSaleIncl, setSelfSaleIncl] = useState<number | string>(initialData.report.selfSaleInclGst || '');
  const [outsourceSaleExcl, setOutsourceSaleExcl] = useState<number | string>(initialData.report.outsourceSaleExclGst || '');
  const [outsourceSaleIncl, setOutsourceSaleIncl] = useState<number | string>(initialData.report.outsourceSaleInclGst || '');

  // Current Month Total Sale (MTD) state
  const [mtdSelfExcl, setMtdSelfExcl] = useState<number | string>(
    initialData.report.mtdSelfSaleExclGst ?? (initialData.mtdSummary.selfExcl || '')
  );
  const [mtdSelfIncl, setMtdSelfIncl] = useState<number | string>(
    initialData.report.mtdSelfSaleInclGst ?? (initialData.mtdSummary.selfIncl || '')
  );
  const [mtdOutsourceExcl, setMtdOutsourceExcl] = useState<number | string>(
    initialData.report.mtdOutsourceSaleExclGst ?? (initialData.mtdSummary.outsourceExcl || '')
  );
  const [mtdOutsourceIncl, setMtdOutsourceIncl] = useState<number | string>(
    initialData.report.mtdOutsourceSaleInclGst ?? (initialData.mtdSummary.outsourceIncl || '')
  );

  const [remarks, setRemarks] = useState(initialData.report.remarks || '');

  // Section Visibility Toggles (All true by default on new date entry)
  const [showRevenue, setShowRevenue] = useState<boolean>(initialData.report.showRevenue !== false);
  const [showStockValuation, setShowStockValuation] = useState<boolean>(initialData.report.showStockValuation !== false);
  const [showFgProduced, setShowFgProduced] = useState<boolean>(initialData.report.showFgProduced !== false);
  const [showMachines, setShowMachines] = useState<boolean>(initialData.report.showMachines !== false);

  // Finish Goods state (NO SCRAP BOX)
  const [fgItems, setFgItems] = useState<PlantMisFgItem[]>(() => {
    if (initialData.fgItems && initialData.fgItems.length > 0) {
      return initialData.fgItems.map(item => ({ ...item, scrapBox: 0 }));
    }
    return [
      { reportDate, vendorName: '', itemName: '', qtyBox: 0, rate: 0, scrapBox: 0, sortOrder: 1 }
    ];
  });

  // Finish Goods Master suggestions (Product Name, Customer, Rate)
  const [fgMasterSuggestions, setFgMasterSuggestions] = useState<Array<{ productName: string; customerName: string; rate: number }>>([]);

  useEffect(() => {
    async function loadFgMaster() {
      try {
        const { data } = await supabase
          .from('finish_goods')
          .select('product_name, customer_name, rate')
          .eq('is_archived', false)
          .order('product_name', { ascending: true });
        
        if (data) {
          const suggestions = data
            .filter((d: any) => Boolean(d.product_name))
            .map((d: any) => ({
              productName: String(d.product_name).trim(),
              customerName: String(d.customer_name || '').trim(),
              rate: Number(d.rate) || 0
            }));
          setFgMasterSuggestions(suggestions);
        }
      } catch (err) {
        console.error('Failed to load FG master suggestions:', err);
      }
    }
    loadFgMaster();
  }, []);

  // Machine Logs state
  const [machines, setMachines] = useState<PlantMisMachineLog[]>(() => {
    if (initialData.machineLogs && initialData.machineLogs.length > 0) {
      return initialData.machineLogs;
    }
    return DEFAULT_PRESET_MACHINES.map(m => ({ ...m, reportDate }));
  });

  // Modal for bulk cut size
  const [activeBulkMachineIndex, setActiveBulkMachineIndex] = useState<number | null>(null);

  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto calculate total day's sale
  const totalSaleExcl = Number(selfSaleExcl || 0) + Number(outsourceSaleExcl || 0);
  const totalSaleIncl = Number(selfSaleIncl || 0) + Number(outsourceSaleIncl || 0);

  // Auto calculate total current month sale (MTD)
  const totalMtdExcl = Number(mtdSelfExcl || 0) + Number(mtdOutsourceExcl || 0);
  const totalMtdIncl = Number(mtdSelfIncl || 0) + Number(mtdOutsourceIncl || 0);

  const handleAutoSumMtd = () => {
    setMtdSelfExcl(initialData.mtdSummary.selfExcl || '');
    setMtdSelfIncl(initialData.mtdSummary.selfIncl || '');
    setMtdOutsourceExcl(initialData.mtdSummary.outsourceExcl || '');
    setMtdOutsourceIncl(initialData.mtdSummary.outsourceIncl || '');
  };

  // Auto-Fill FG from dispatches
  // Auto-Fill FG from plant production (Inward / Completed Jobs)
  const handleAutoFillFg = async () => {
    setIsAutoFilling(true);
    setAutoFillMessage(null);
    try {
      let items = await getAutoFillProducedFgForDate(reportDate);
      if (items.length === 0) {
        // Fallback to outward dispatches if no inward exists
        const dispatches = await getAutoFillDispatchesForDate(reportDate);
        if (dispatches.length > 0) {
          items = dispatches.map(d => ({ vendorName: d.vendorName, itemName: d.itemName, qtyBox: d.qtyBox }));
          setAutoFillMessage(`Loaded ${items.length} items from ERP transactions for ${reportDate}.`);
        } else {
          setAutoFillMessage(`No production records found for ${reportDate}. You can add items manually.`);
        }
      } else {
        setAutoFillMessage(`Successfully imported ${items.length} produced items for ${reportDate}!`);
      }

      if (items.length > 0) {
        const mapped = items.map((it, idx) => ({
          reportDate,
          vendorName: it.vendorName,
          itemName: it.itemName,
          qtyBox: it.qtyBox,
          scrapBox: 0,
          sortOrder: idx + 1
        }));
        setFgItems(mapped);
      }
    } catch (err: any) {
      setAutoFillMessage('Error fetching production records: ' + err.message);
    } finally {
      setIsAutoFilling(false);
    }
  };

  // FG row handlers
  const handleFgChange = (index: number, field: keyof PlantMisFgItem, value: any) => {
    const updated = [...fgItems];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-fill rate and vendor if itemName matches Master FG Data
    if (field === 'itemName' && typeof value === 'string' && value.trim()) {
      const match = fgMasterSuggestions.find(
        s => s.productName.toLowerCase() === value.trim().toLowerCase()
      );
      if (match) {
        if (match.rate > 0 && (!updated[index].rate || Number(updated[index].rate) === 0)) {
          updated[index].rate = match.rate;
        }
        if (match.customerName && !updated[index].vendorName) {
          updated[index].vendorName = match.customerName;
        }
      }
    }

    setFgItems(updated);
  };

  const handleAddFgRow = () => {
    setFgItems(prev => [
      ...prev,
      { reportDate, vendorName: '', itemName: '', qtyBox: 0, rate: 0, scrapBox: 0, sortOrder: prev.length + 1 }
    ]);
  };

  const handleRemoveFgRow = (index: number) => {
    if (fgItems.length <= 1) {
      setFgItems([{ reportDate, vendorName: '', itemName: '', qtyBox: 0, rate: 0, scrapBox: 0, sortOrder: 1 }]);
      return;
    }
    setFgItems(prev => prev.filter((_, i) => i !== index));
  };

  // Machine handlers
  const handleMachineChange = (index: number, field: keyof PlantMisMachineLog, value: any) => {
    const updated = [...machines];
    updated[index] = { ...updated[index], [field]: value };
    setMachines(updated);
  };

  const handleAddMachineRow = () => {
    setMachines(prev => [
      ...prev,
      {
        reportDate,
        machineName: 'New Machine',
        shift: 'Day',
        shiftHours: 12,
        shiftTiming: '08:00 AM - 08:00 PM',
        status: 'RUNNING',
        runningSqMtr: 0,
        runningKg: 0,
        totalPly: 0,
        totalPaper: 0,
        scrapKg: 0,
        scrapSheet: 0,
        notes: '',
        sortOrder: prev.length + 1,
        cutSizeBreakdown: []
      }
    ]);
  };

  const handleRemoveMachineRow = (index: number) => {
    if (machines.length <= 1) return;
    setMachines(prev => prev.filter((_, i) => i !== index));
  };

  const handleApplyBulkCutSize = (summary: { totalSqMtr: number; totalQty: number; items: CutSizeItem[] }) => {
    if (activeBulkMachineIndex === null) return;
    const updated = [...machines];
    const target = { ...updated[activeBulkMachineIndex] };
    target.runningSqMtr = summary.totalSqMtr;
    
    // If it's a corrugation or paper cutting machine, update ply/paper as well if appropriate
    if (target.machineName.toLowerCase().includes('corrugation') || target.machineName.toLowerCase().includes('pasting')) {
      target.totalPly = summary.totalQty;
    } else {
      target.totalPaper = summary.totalQty;
    }
    target.cutSizeBreakdown = summary.items;
    updated[activeBulkMachineIndex] = target;
    setMachines(updated);
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await savePlantMisFullReport({
        reportDate,
        selfSaleExclGst: Number(selfSaleExcl) || 0,
        selfSaleInclGst: Number(selfSaleIncl) || 0,
        outsourceSaleExclGst: Number(outsourceSaleExcl) || 0,
        outsourceSaleInclGst: Number(outsourceSaleIncl) || 0,
        mtdSelfSaleExclGst: mtdSelfExcl !== '' ? Number(mtdSelfExcl) : null,
        mtdSelfSaleInclGst: mtdSelfIncl !== '' ? Number(mtdSelfIncl) : null,
        mtdOutsourceSaleExclGst: mtdOutsourceExcl !== '' ? Number(mtdOutsourceExcl) : null,
        mtdOutsourceSaleInclGst: mtdOutsourceIncl !== '' ? Number(mtdOutsourceIncl) : null,
        mtdTotalSaleExclGst: totalMtdExcl > 0 ? totalMtdExcl : null,
        mtdTotalSaleInclGst: totalMtdIncl > 0 ? totalMtdIncl : null,
        remarks: remarks.trim(),
        showRevenue,
        showStockValuation,
        showFgProduced,
        showMachines,
        fgItems: fgItems.filter(item => item.vendorName.trim() || item.itemName.trim() || item.qtyBox > 0),
        machineLogs: machines.map((m, idx) => ({ ...m, sortOrder: idx + 1 })),
        user: user?.name || 'Supervisor'
      });

      onSuccess(reportDate);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save report. Please check data.');
      setIsSubmitting(false);
    }
  };

  const totalFgBoxes = fgItems.reduce((acc, curr) => acc + (Number(curr.qtyBox) || 0), 0);
  const totalFgScrap = fgItems.reduce((acc, curr) => acc + (Number(curr.scrapBox) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900/40 via-secondary/40 to-background flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center border border-blue-500/30">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Plant Daily MIS Entry & Edit
              </h2>
              <p className="text-xs text-muted-foreground">
                Enter Revenue, Finish Goods, and Machine logs for date: <span className="text-blue-500 font-semibold">{reportDate}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-background text-foreground"
            />
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 0. REPORT SECTIONS INCLUDED FOR THIS DATE */}
          <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Report Sections Included on {reportDate}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Agar kisi section me kaam nahi hua to uncheck karke report se remove kar sakte hai. New date ki entry par sabhi sections automatically on rahege.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevenue(true);
                    setShowStockValuation(true);
                    setShowFgProduced(true);
                    setShowMachines(true);
                  }}
                  className="text-[11px] font-bold text-blue-500 hover:underline px-2 py-1 rounded bg-blue-500/10"
                >
                  ✓ Select All Sections
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Revenue Toggle */}
              <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                showRevenue 
                  ? 'bg-blue-500/10 border-blue-500/40 text-foreground shadow-sm' 
                  : 'bg-secondary/30 border-dashed border-border text-muted-foreground opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={showRevenue}
                  onChange={e => setShowRevenue(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold block">1. Sale & Revenue</span>
                  <span className="text-[10px] text-muted-foreground">Self Mfg & Outsource</span>
                </div>
              </label>

              {/* Warehouse Stock Valuation Toggle */}
              <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                showStockValuation 
                  ? 'bg-amber-500/10 border-amber-500/40 text-foreground shadow-sm' 
                  : 'bg-secondary/30 border-dashed border-border text-muted-foreground opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={showStockValuation}
                  onChange={e => setShowStockValuation(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold block">2. FG Stock Warehouse</span>
                  <span className="text-[10px] text-muted-foreground">Regular & Non-Moving</span>
                </div>
              </label>

              {/* FG Produced Toggle */}
              <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                showFgProduced 
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-foreground shadow-sm' 
                  : 'bg-secondary/30 border-dashed border-border text-muted-foreground opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={showFgProduced}
                  onChange={e => setShowFgProduced(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold block">3. FG Produced Today</span>
                  <span className="text-[10px] text-muted-foreground">Material ready in plant</span>
                </div>
              </label>

              {/* Machines Toggle */}
              <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                showMachines 
                  ? 'bg-purple-500/10 border-purple-500/40 text-foreground shadow-sm' 
                  : 'bg-secondary/30 border-dashed border-border text-muted-foreground opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={showMachines}
                  onChange={e => setShowMachines(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold block">4. Machine Logs</span>
                  <span className="text-[10px] text-muted-foreground">Running Sq Mtr & Timing</span>
                </div>
              </label>
            </div>
          </div>

          {/* 1. REVENUE SECTION: DAY'S SALE & CURRENT MONTH MTD */}
          <div className={`bg-secondary/20 border border-border rounded-2xl p-5 space-y-5 transition-all ${
            !showRevenue ? 'opacity-50 border-dashed' : ''
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  1. Revenue & Sale Breakdown (With & Without GST)
                  {!showRevenue && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                      Excluded / Hidden from Report
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Self Manufacturing (In-house) vs Outsource Sale (Bahar se li hui)
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoSumMtd}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-600/10 text-indigo-500 hover:bg-indigo-600/20 border border-indigo-500/30 transition-all flex items-center gap-1.5 self-start sm:self-auto"
                title="Calculate Month Cumulative from daily database records"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>⚡ Auto-Sum MTD from Daily Reports</span>
              </button>
            </div>

            {/* Two Side-by-Side Panels: Day's Sale vs Month Cumulative */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* PANEL 1: Day's Sale (Pichle Din ki Sale / Report Date Sale) */}
              <div className="rounded-xl border border-blue-500/30 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      Day's Sale
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      Report Date: {reportDate}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-500">
                    ₹{totalSaleIncl.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Self Manufacturing Day */}
                  <div className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      🏭 Self Manufacturing <span className="text-[10px] text-muted-foreground font-normal">(In-house)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Without GST (Excl)</label>
                        <input
                          type="number"
                          min="0"
                          value={selfSaleExcl}
                          onChange={e => setSelfSaleExcl(e.target.value)}
                          placeholder="e.g. 6240188"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">With GST (Incl)</label>
                        <input
                          type="number"
                          min="0"
                          value={selfSaleIncl}
                          onChange={e => setSelfSaleIncl(e.target.value)}
                          placeholder="e.g. 6552197"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-blue-600 dark:text-blue-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Outsource Sale Day */}
                  <div className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      🚚 Outsource Sale <span className="text-[10px] text-muted-foreground font-normal">(Bahar se li)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Without GST (Excl)</label>
                        <input
                          type="number"
                          min="0"
                          value={outsourceSaleExcl}
                          onChange={e => setOutsourceSaleExcl(e.target.value)}
                          placeholder="e.g. 1100000"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">With GST (Incl)</label>
                        <input
                          type="number"
                          min="0"
                          value={outsourceSaleIncl}
                          onChange={e => setOutsourceSaleIncl(e.target.value)}
                          placeholder="e.g. 1177798"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-purple-600 dark:text-purple-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Day Total */}
                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-blue-500 block">Total Day's Sale</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Without GST: ₹{totalSaleExcl.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">With GST</span>
                      <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                        ₹{totalSaleIncl.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PANEL 2: Overall Current Month Total (MTD) */}
              <div className="rounded-xl border border-indigo-500/30 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      Overall Current Month (MTD)
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      Cumulative Total
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    ₹{totalMtdIncl.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Self Manufacturing MTD */}
                  <div className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      🏭 Self Mfg Month Total <span className="text-[10px] text-muted-foreground font-normal">(In-house)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Without GST (Excl)</label>
                        <input
                          type="number"
                          min="0"
                          value={mtdSelfExcl}
                          onChange={e => setMtdSelfExcl(e.target.value)}
                          placeholder="e.g. 6240188"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">With GST (Incl)</label>
                        <input
                          type="number"
                          min="0"
                          value={mtdSelfIncl}
                          onChange={e => setMtdSelfIncl(e.target.value)}
                          placeholder="e.g. 6552197"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Outsource Sale MTD */}
                  <div className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      🚚 Outsource Month Total <span className="text-[10px] text-muted-foreground font-normal">(Bahar se li)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Without GST (Excl)</label>
                        <input
                          type="number"
                          min="0"
                          value={mtdOutsourceExcl}
                          onChange={e => setMtdOutsourceExcl(e.target.value)}
                          placeholder="e.g. 1100000"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">With GST (Incl)</label>
                        <input
                          type="number"
                          min="0"
                          value={mtdOutsourceIncl}
                          onChange={e => setMtdOutsourceIncl(e.target.value)}
                          placeholder="e.g. 1177798"
                          className="w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-purple-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Month Total */}
                  <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-indigo-400 block">Total Current Month Sale</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Without GST: ₹{totalMtdExcl.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">With GST</span>
                      <span className="text-sm font-black text-indigo-400 font-mono">
                        ₹{totalMtdIncl.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. FINISH GOODS SECTION */}
          <div className={`bg-secondary/20 border border-border rounded-2xl p-5 space-y-4 transition-all ${
            !showFgProduced ? 'opacity-50 border-dashed' : ''
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  2. Finish Goods Produced / Ready in Plant
                  {!showFgProduced && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                      Excluded / Hidden from Report
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">Kaun sa material kitna plant me ready hua (Production Quantity)</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFgProduced(false);
                    setFgItems([{ reportDate, vendorName: '', itemName: '', qtyBox: 0, scrapBox: 0, sortOrder: 1 }]);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-xl text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-border transition-colors flex items-center gap-1"
                  title="Agar aaj koi FG nahi bana to section remove kare"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>No FG Today (Remove Section)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoFillFg}
                  disabled={isAutoFilling}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/20 transition-all disabled:opacity-50 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  {isAutoFilling ? 'Importing...' : "⚡ Auto-Fill From Today's Production"}
                </button>
              </div>
            </div>

            {autoFillMessage && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-500 flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-amber-500" />
                <span>{autoFillMessage}</span>
              </div>
            )}

            <div className="border border-border rounded-xl overflow-hidden shadow-sm">
              {/* Datalist for Master FG suggestions */}
              <datalist id="fg-master-items-list">
                {fgMasterSuggestions.map((s, sIdx) => (
                  <option key={sIdx} value={s.productName}>
                    {s.customerName ? `${s.customerName} • ` : ''}Rate: ₹{s.rate > 0 ? s.rate.toFixed(2) : '0'}
                  </option>
                ))}
              </datalist>

              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/60 text-muted-foreground font-semibold uppercase text-[11px] border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-1/4">Vendor / Customer</th>
                    <th className="py-2.5 px-3">Item Name / Product (Master Dropdown)</th>
                    <th className="py-2.5 px-3 w-28 text-right">Qty (Boxes)</th>
                    <th className="py-2.5 px-3 w-24 text-right">Rate (₹)</th>
                    <th className="py-2.5 px-3 w-28 text-right">Value (₹)</th>
                    <th className="py-2.5 px-3 w-10 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {fgItems.map((item, idx) => {
                    const rowRate = Number(item.rate) || 0;
                    const rowQty = Number(item.qtyBox) || 0;
                    const rowValue = Math.round(rowQty * rowRate);

                    return (
                      <tr key={idx} className="hover:bg-secondary/20">
                        <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.vendorName}
                            onChange={e => handleFgChange(idx, 'vendorName', e.target.value)}
                            placeholder="e.g. ROYALUX, MAT, RBC"
                            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground uppercase"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            list="fg-master-items-list"
                            value={item.itemName}
                            onChange={e => handleFgChange(idx, 'itemName', e.target.value)}
                            placeholder="Type to search from Master FG items..."
                            className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            value={item.qtyBox || ''}
                            onChange={e => handleFgChange(idx, 'qtyBox', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full text-xs font-mono font-bold text-right px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate !== undefined && item.rate !== null && item.rate > 0 ? item.rate : ''}
                            onChange={e => handleFgChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full text-xs font-mono text-right px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {rowValue > 0 ? `₹${rowValue.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFgRow(idx)}
                            className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-secondary/40 font-bold border-t border-border">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[11px] text-muted-foreground">Total Produced:</td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-600 dark:text-blue-400 text-sm">
                      {totalFgBoxes.toLocaleString('en-IN')} Boxes
                    </td>
                    <td className="py-2.5 px-3 text-right uppercase text-[11px] text-muted-foreground">Total Value:</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                      ₹{fgItems.reduce((acc, it) => acc + Math.round((Number(it.qtyBox) || 0) * (Number(it.rate) || 0)), 0).toLocaleString('en-IN')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleAddFgRow}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 rounded-lg border border-dashed border-blue-500/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item Row
              </button>
            </div>
          </div>

          {/* 3. MACHINE PERFORMANCE SECTION */}
          <div className={`bg-secondary/20 border border-border rounded-2xl p-5 space-y-4 transition-all ${
            !showMachines ? 'opacity-50 border-dashed' : ''
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  3. Machine-wise Production & Shift Timings
                  {!showMachines && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                      Excluded / Hidden from Report
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Agar koi machine nahi chali to 'Remove' kare. New date par sabhi 8 default machines automatically aayegi.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMachines(DEFAULT_PRESET_MACHINES.map(m => ({ ...m, reportDate })))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all shadow-sm"
                  title="Reset to 8 standard factory machines"
                >
                  ↻ Reset 8 Default Machines
                </button>

                <button
                  type="button"
                  onClick={handleAddMachineRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add Custom Machine
                </button>
              </div>
            </div>

            {/* Quick Presets Bar */}
            <div className="p-3 rounded-xl bg-card border border-border/80 space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground block">
                ⚡ Quick Add Machine Presets (Click to add machine / shift):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { name: 'Semi Auto Corrugation Machine', shift: 'Day', hours: 12, timing: '08:00 AM - 08:00 PM' },
                  { name: 'Manual Corrugation Machine', shift: 'Day', hours: 8, timing: '08:00 AM - 04:00 PM' },
                  { name: 'Manual Corrugation Machine', shift: 'Night', hours: 8, timing: '08:00 PM - 04:00 AM' },
                  { name: 'Pasting M/c - 1', shift: 'Day', hours: 8, timing: '08:00 AM - 04:00 PM' },
                  { name: 'Pasting M/c - 2', shift: 'Night', hours: 8, timing: '08:00 PM - 04:00 AM' },
                  { name: 'RS-4 Printing M/c', shift: 'Day', hours: 12, timing: '08:00 AM - 08:00 PM' },
                  { name: 'Die M/c', shift: 'Day', hours: 12, timing: '08:00 AM - 08:00 PM' },
                  { name: 'Paper Cutting M/c', shift: 'General', hours: 12, timing: '08:00 AM - 08:00 PM' },
                  { name: 'Slitter Scorer M/c', shift: 'Day', hours: 8, timing: '08:00 AM - 04:00 PM' },
                  { name: 'Stitching M/c', shift: 'Day', hours: 8, timing: '08:00 AM - 04:00 PM' }
                ].map(preset => (
                  <button
                    key={`${preset.name}-${preset.shift}`}
                    type="button"
                    onClick={() => {
                      setMachines(prev => [
                        ...prev,
                        {
                          reportDate,
                          machineName: preset.name,
                          shift: preset.shift as any,
                          shiftHours: preset.hours,
                          shiftTiming: preset.timing,
                          status: 'RUNNING',
                          runningSqMtr: 0,
                          runningKg: 0,
                          totalPly: 0,
                          totalPaper: 0,
                          scrapKg: 0,
                          scrapSheet: 0,
                          notes: '',
                          sortOrder: prev.length + 1,
                          cutSizeBreakdown: []
                        }
                      ]);
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-secondary hover:bg-blue-600/10 hover:text-blue-500 border border-border transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-blue-500" />
                    <span>{preset.name.replace(' Machine', '')} ({preset.shift})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {machines.map((m, idx) => {
                const hasCutBreakdown = m.cutSizeBreakdown && m.cutSizeBreakdown.length > 0;
                const isCorrugationOrPaper = m.machineName.toLowerCase().includes('corrugation') || m.machineName.toLowerCase().includes('cutting');

                return (
                  <div key={idx} className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm hover:border-blue-500/40 transition-all">
                    {/* Machine Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-mono font-bold text-muted-foreground px-2 py-0.5 rounded bg-secondary">
                          #{idx + 1}
                        </span>
                        
                        <input
                          type="text"
                          value={m.machineName}
                          onChange={e => handleMachineChange(idx, 'machineName', e.target.value)}
                          placeholder="Machine Name"
                          className="text-sm font-bold px-2.5 py-1 rounded-md border border-border bg-background text-foreground min-w-[200px]"
                        />

                        {/* Shift Selector */}
                        <div className="flex items-center bg-secondary/80 rounded-lg p-0.5 border border-border text-xs">
                          <button
                            type="button"
                            onClick={() => handleMachineChange(idx, 'shift', 'Day')}
                            className={`px-2 py-1 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                              m.shift === 'Day' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'text-muted-foreground'
                            }`}
                          >
                            <Sun className="w-3 h-3" /> Day
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMachineChange(idx, 'shift', 'Night')}
                            className={`px-2 py-1 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                              m.shift === 'Night' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-muted-foreground'
                            }`}
                          >
                            <Moon className="w-3 h-3" /> Night
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMachineChange(idx, 'shift', 'General')}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              m.shift === 'General' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-muted-foreground'
                            }`}
                          >
                            General
                          </button>
                        </div>

                        {/* Shift Hours Chips */}
                        <div className="flex items-center gap-1">
                          {[8, 10, 12, 16, 24].map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => handleMachineChange(idx, 'shiftHours', h)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                                m.shiftHours === h 
                                  ? 'bg-blue-600 text-white shadow-sm' 
                                  : 'bg-secondary text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Status Selector & Delete */}
                      <div className="flex items-center gap-3">
                        <select
                          value={m.status}
                          onChange={e => handleMachineChange(idx, 'status', e.target.value)}
                          className={`text-xs font-bold px-3 py-1 rounded-lg border transition-colors ${
                            m.status === 'RUNNING' 
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                              : m.status === 'MAINTENANCE'
                              ? 'bg-red-500/10 text-red-500 border-red-500/30'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                          }`}
                        >
                          <option value="RUNNING">🟢 RUNNING</option>
                          <option value="MAINTENANCE">🔴 MAINTENANCE</option>
                          <option value="IDLE">🟡 IDLE</option>
                          <option value="BREAKDOWN">🟠 BREAKDOWN</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveMachineRow(idx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 border border-red-500/30 transition-colors"
                          title="Agar ye machine aaj nahi chali to remove kare"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    {/* Bulk Cut-Size & Running Sq Mtr Calculator Highlight Panel */}
                    {isCorrugationOrPaper && (
                      <div className="p-3 rounded-xl bg-gradient-to-r from-blue-900/20 via-blue-800/10 to-transparent border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                            <Calculator className="w-4 h-4 text-amber-500" />
                            <span>Automatic Running Sq Mtr Bulk Calculator</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
                              Formula: (Cut Size" × Qty) ÷ 39.37
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {hasCutBreakdown ? (
                              <span className="text-emerald-500 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {m.cutSizeBreakdown?.length} Jobs Calculated: {m.runningSqMtr?.toLocaleString('en-IN')} m² ({m.totalPly || m.totalPaper} Nos)
                              </span>
                            ) : (
                              <span>Ek se zyada cut-sizes aur quantities ek saath add karein ya Excel se paste karein.</span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveBulkMachineIndex(idx)}
                          className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5 transition-all shrink-0 hover:scale-[1.02]"
                        >
                          <Calculator className="w-3.5 h-3.5 text-amber-300" />
                          {hasCutBreakdown ? `Edit Cut Sizes (${m.cutSizeBreakdown?.length} Jobs)` : '📐 Open Bulk Cut-Size Calculator'}
                        </button>
                      </div>
                    )}

                    {/* Machine Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                      {/* Running Sq Mtr */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-muted-foreground font-semibold">Running (Sq Mtr)</label>
                          {isCorrugationOrPaper && (
                            <button
                              type="button"
                              onClick={() => setActiveBulkMachineIndex(idx)}
                              className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-0.5"
                            >
                              <Calculator className="w-2.5 h-2.5" />
                              {hasCutBreakdown ? `(${m.cutSizeBreakdown?.length})` : 'Calc'}
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={m.runningSqMtr || ''}
                          onChange={e => handleMachineChange(idx, 'runningSqMtr', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>

                      {/* Running Kgs */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Running (Kgs)</label>
                        <input
                          type="number"
                          value={m.runningKg || ''}
                          onChange={e => handleMachineChange(idx, 'runningKg', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono font-bold px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>

                      {/* Total Ply */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Total Ply (Nos)</label>
                        <input
                          type="number"
                          value={m.totalPly || ''}
                          onChange={e => handleMachineChange(idx, 'totalPly', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>

                      {/* Total Paper */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Total Paper (Nos)</label>
                        <input
                          type="number"
                          value={m.totalPaper || ''}
                          onChange={e => handleMachineChange(idx, 'totalPaper', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>

                      {/* Total Scrap (Kgs) */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Scrap (Kgs)</label>
                        <input
                          type="number"
                          value={m.scrapKg || ''}
                          onChange={e => handleMachineChange(idx, 'scrapKg', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono text-red-500 font-semibold px-2.5 py-1.5 rounded-md border border-border bg-background"
                        />
                      </div>

                      {/* Scrap Sheets */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Scrap / Sheets</label>
                        <input
                          type="number"
                          value={m.scrapSheet || ''}
                          onChange={e => handleMachineChange(idx, 'scrapSheet', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full font-mono px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
                        />
                      </div>
                    </div>

                    {/* Shift Timing & Note */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/40 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          value={m.shiftTiming || ''}
                          onChange={e => handleMachineChange(idx, 'shiftTiming', e.target.value)}
                          placeholder="Timing: e.g. 08:00 AM - 08:00 PM (12h)"
                          className="w-full px-2.5 py-1 rounded-md border border-border bg-background text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={m.notes || ''}
                          onChange={e => handleMachineChange(idx, 'notes', e.target.value)}
                          placeholder="Optional Machine Remarks / Breakdown reason"
                          className="w-full px-2.5 py-1 rounded-md border border-border bg-background text-foreground text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. OVERALL PLANT REMARKS */}
          <div className="bg-secondary/20 border border-border rounded-2xl p-5 space-y-2">
            <label className="text-xs font-bold text-foreground block">
              📝 Plant Master Remarks / Notes for Management
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Full plant operating. Maintenance scheduled on Semi-Auto machine. Power outage for 30 minutes in evening."
              rows={2}
              className="w-full text-xs p-3 rounded-xl border border-border bg-background text-foreground resize-none"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Changes will be saved to Supabase for <span className="font-semibold text-foreground">{reportDate}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving to Database...' : 'Save Production Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Cut-Size Modal */}
      {activeBulkMachineIndex !== null && (
        <BulkCutSizeModal
          machineName={`${machines[activeBulkMachineIndex].machineName} (${machines[activeBulkMachineIndex].shift})`}
          initialItems={machines[activeBulkMachineIndex].cutSizeBreakdown || []}
          onClose={() => setActiveBulkMachineIndex(null)}
          onApply={summary => {
            handleApplyBulkCutSize(summary);
            setActiveBulkMachineIndex(null);
          }}
        />
      )}
    </div>
  );
}

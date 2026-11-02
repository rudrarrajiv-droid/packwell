import React, { useState, useMemo } from 'react';
import { 
  X, Save, Printer, Share2, TrendingUp, TrendingDown, 
  AlertTriangle, CheckCircle2, Layers, Box, Calculator, 
  Edit3, Info, Sparkles, HelpCircle 
} from 'lucide-react';
import type { JobCostingData, JobCostingLayer } from './jobCostingTypes';
import { saveCostingData } from './jobCostingService';
import { cn } from '../../lib/utils';

interface JobCostingDetailModalProps {
  initialData: JobCostingData;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: JobCostingData) => void;
}

export default function JobCostingDetailModal({
  initialData,
  isOpen,
  onClose,
  onSaved
}: JobCostingDetailModalProps) {
  const [data, setData] = useState<JobCostingData>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  if (!isOpen) return null;

  // Handler for updating Manf Box Qty
  const handleManfQtyChange = (valStr: string) => {
    const val = valStr === '' ? null : Math.max(0, parseInt(valStr, 10) || 0);
    setData(prev => recalculateCosting(prev, val, prev.saleRatePerBox, prev.layers));
  };

  // Handler for updating Sale Rate
  const handleSaleRateChange = (valStr: string) => {
    const val = valStr === '' ? null : Math.max(0, parseFloat(valStr) || 0);
    setData(prev => recalculateCosting(prev, prev.manfBoxQty, val, prev.layers));
  };

  // Handler for updating Layer field (dprWeight or reelRate)
  const handleLayerChange = (layerIdx: number, field: 'dprWeight' | 'reelRate', value: number | null) => {
    setData(prev => {
      const updatedLayers = prev.layers.map(l => {
        if (l.layerIndex !== layerIdx) return l;
        return { ...l, [field]: value };
      });
      return recalculateCosting(prev, prev.manfBoxQty, prev.saleRatePerBox, updatedLayers);
    });
  };

  // Recalculates all layer values and totals
  const recalculateCosting = (
    current: JobCostingData,
    manfBoxQty: number | null,
    saleRatePerBox: number | null | undefined,
    layers: JobCostingLayer[]
  ): JobCostingData => {
    const orderQty = current.orderBoxQty || 1;
    const lessBoxQty = manfBoxQty !== null ? Math.max(0, orderQty - manfBoxQty) : 0;

    const updatedLayers = layers.map(l => {
      const reelRate = Number(l.reelRate || 0);
      const allocatedValue = Math.round((l.allocatedWeight || 0) * reelRate);
      
      const dprWeight = l.dprWeight !== null && l.dprWeight !== undefined 
        ? Number(l.dprWeight) 
        : null;
      const dprValue = dprWeight !== null ? Math.round(dprWeight * reelRate) : null;

      const paperWeightPerBox = orderQty > 0 ? (l.allocatedWeight / orderQty) : 0;
      const lessBoxWeightLoss = Math.round(lessBoxQty * paperWeightPerBox * 100) / 100;
      const lessBoxValueLoss = Math.round(lessBoxWeightLoss * reelRate);

      return {
        ...l,
        reelRate,
        allocatedValue,
        dprWeight,
        dprValue,
        paperWeightPerBox,
        lessBoxQty,
        lessBoxWeightLoss,
        lessBoxValueLoss
      };
    });

    const totalAllocatedValue = updatedLayers.reduce((sum, l) => sum + (l.allocatedValue || 0), 0);
    const hasDpr = updatedLayers.some(l => l.dprWeight !== null);
    const totalDprValue = updatedLayers.reduce((sum, l) => sum + (l.dprValue || 0), 0);
    const totalLessBoxLoss = updatedLayers.reduce((sum, l) => sum + (l.lessBoxValueLoss || 0), 0);

    // Primary Formula requested:
    // P/L = Total Allocated Value - Total DPR Value - Total Less Box Loss
    const netProfitLoss = hasDpr 
      ? Math.round(totalAllocatedValue - totalDprValue - totalLessBoxLoss) 
      : null;

    return {
      ...current,
      manfBoxQty,
      saleRatePerBox: saleRatePerBox ?? null,
      layers: updatedLayers,
      totalAllocatedValue,
      totalDprValue,
      totalLessBoxLoss,
      netProfitLoss,
      isCompleted: hasDpr && manfBoxQty !== null,
      lastUpdated: new Date().toISOString()
    };
  };

  // Diagnostic Stats
  const stats = useMemo(() => {
    const totalAllocWeight = data.layers.reduce((sum, l) => sum + (l.allocatedWeight || 0), 0);
    const totalDprWeight = data.layers.reduce((sum, l) => sum + (l.dprWeight || 0), 0);
    const hasDpr = data.layers.some(l => l.dprWeight !== null);
    
    const paperVarianceWeight = hasDpr ? (totalDprWeight - totalAllocWeight) : 0;
    const paperVarianceValue = hasDpr ? (data.totalDprValue - data.totalAllocatedValue) : 0;

    const shortfallBoxes = data.manfBoxQty !== null ? Math.max(0, data.orderBoxQty - data.manfBoxQty) : 0;
    const yieldPercentage = data.manfBoxQty !== null && data.orderBoxQty > 0
      ? Math.round((data.manfBoxQty / data.orderBoxQty) * 100)
      : null;

    return {
      totalAllocWeight,
      totalDprWeight,
      hasDpr,
      paperVarianceWeight,
      paperVarianceValue,
      shortfallBoxes,
      yieldPercentage
    };
  }, [data]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveCostingData(data.jobCardId, data);
      onSaved(data);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error(e);
      alert('Error saving costing data.');
    } finally {
      setIsSaving(false);
    }
  };

  const copyWhatsApp = () => {
    let text = `*JOB COSTING & P/L REPORT*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Job Card:* ${data.jobCardNo}\n`;
    text += `*Date:* ${data.jobCardDate}\n`;
    text += `*Job Name:* ${data.jobName}\n`;
    text += `*Order Qty:* ${data.orderBoxQty.toLocaleString()} Nos\n`;
    text += `*Manf Qty:* ${data.manfBoxQty !== null ? `${data.manfBoxQty.toLocaleString()} Nos` : 'Pending'}\n`;
    if (stats.shortfallBoxes > 0) {
      text += `*Scrapped Boxes (WIP Loss):* ${stats.shortfallBoxes} Nos (-₹${data.totalLessBoxLoss.toLocaleString()})\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Allocated Paper Value:* ₹${data.totalAllocatedValue.toLocaleString()}\n`;
    text += `*Actual DPR Paper Used:* ₹${data.totalDprValue.toLocaleString()}\n`;
    text += `*Intermediate Scrap Loss:* ₹${data.totalLessBoxLoss.toLocaleString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (data.netProfitLoss !== null) {
      const isProfit = data.netProfitLoss >= 0;
      text += `*NET P/L:* ${isProfit ? '🟢 PROFIT' : '🔴 LOSS'} ₹${Math.abs(data.netProfitLoss).toLocaleString()}\n`;
    } else {
      text += `*STATUS:* DPR Data Pending\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Calculator className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 bg-yellow-400 text-black rounded font-mono">
                  {data.jobCardNo}
                </span>
                <span className="text-xs text-blue-200 font-medium">
                  Date: {data.jobCardDate}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
                {data.jobName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors"
              title="Copy WhatsApp Summary for MD"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors"
              title="Print Costing Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Toast notifications */}
          {savedSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Costing & P/L calculation saved successfully!
            </div>
          )}
          {copiedWhatsapp && (
            <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-bold rounded-xl border border-green-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              WhatsApp report copied to clipboard!
            </div>
          )}

          {/* 4 Executive KPI Diagnosis Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Box Production Yield */}
            <div className="bg-secondary/40 p-4 rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
                <span>Box Yield (Efficiency)</span>
                <Box className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-foreground">
                    {data.manfBoxQty !== null ? data.manfBoxQty.toLocaleString() : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">
                    / {data.orderBoxQty.toLocaleString()} Order
                  </span>
                </div>
                <div className="text-xs mt-1 font-semibold flex items-center justify-between">
                  {stats.shortfallBoxes > 0 ? (
                    <span className="text-red-600 font-bold">
                      {stats.shortfallBoxes} Boxes Lost in Process
                    </span>
                  ) : stats.yieldPercentage !== null ? (
                    <span className="text-emerald-600 font-bold">100% Full Yield</span>
                  ) : (
                    <span className="text-muted-foreground italic">Enter Manf Qty</span>
                  )}
                  {stats.yieldPercentage !== null && (
                    <span className="text-blue-700 font-black">{stats.yieldPercentage}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Corrugation Paper Over/Under Consumption */}
            <div className="bg-secondary/40 p-4 rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
                <span>Machine Paper Variance</span>
                <Layers className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-2xl font-black",
                    stats.paperVarianceWeight > 0 ? "text-red-600" : stats.paperVarianceWeight < 0 ? "text-emerald-600" : "text-foreground"
                  )}>
                    {stats.hasDpr 
                      ? `${stats.paperVarianceWeight > 0 ? '+' : ''}${Math.round(stats.paperVarianceWeight)} Kg` 
                      : '—'}
                  </span>
                  {stats.hasDpr && (
                    <span className="text-xs font-bold text-muted-foreground">
                      ({stats.paperVarianceValue > 0 ? `+₹${stats.paperVarianceValue.toLocaleString()}` : `-₹${Math.abs(stats.paperVarianceValue).toLocaleString()}`})
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1 font-semibold">
                  {stats.hasDpr ? (
                    stats.paperVarianceWeight > 0 ? (
                      <span className="text-red-600 font-bold">Over-consumed on Corrugator</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">Paper Saved on Corrugator</span>
                    )
                  ) : (
                    <span className="text-muted-foreground italic">Fill DPR Weight Below</span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Converting / WIP Scrap Loss */}
            <div className="bg-secondary/40 p-4 rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
                <span>Intermediate Scrap Loss</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-600">
                    ₹{data.totalLessBoxLoss.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs mt-1 font-semibold text-muted-foreground">
                  {stats.shortfallBoxes > 0 ? (
                    <span>Board scrapped in printing/cutting/pasting</span>
                  ) : (
                    <span>No process scrap loss</span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 4: Net Job P/L Result */}
            <div className={cn(
              "p-4 rounded-xl border flex flex-col justify-between shadow-sm",
              data.netProfitLoss === null 
                ? "bg-secondary/50 border-border" 
                : data.netProfitLoss >= 0 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900" 
                : "bg-red-500/10 border-red-500/30 text-red-900"
            )}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span>Final Job P/L</span>
                {data.netProfitLoss !== null && data.netProfitLoss >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : data.netProfitLoss !== null ? (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                ) : null}
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-3xl font-black",
                    data.netProfitLoss === null
                      ? "text-muted-foreground"
                      : data.netProfitLoss >= 0
                      ? "text-emerald-700"
                      : "text-red-700"
                  )}>
                    {data.netProfitLoss !== null 
                      ? `${data.netProfitLoss >= 0 ? '+' : ''}₹${data.netProfitLoss.toLocaleString()}` 
                      : 'Pending DPR'}
                  </span>
                </div>
                <div className="text-xs mt-1 font-bold">
                  {data.netProfitLoss === null ? (
                    <span className="text-muted-foreground">Fill DPR & Manf Box Qty</span>
                  ) : data.netProfitLoss >= 0 ? (
                    <span className="text-emerald-700">PROFITABLE JOB CARD</span>
                  ) : (
                    <span className="text-red-700">NET LOSS ON THIS JOB</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Root-Cause MD Diagnosis Banner */}
          {data.netProfitLoss !== null && (
            <div className={cn(
              "p-4 rounded-xl border flex items-start gap-3",
              data.netProfitLoss >= 0 
                ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                : "bg-red-50 border-red-200 text-red-900"
            )}>
              <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
              <div className="text-xs leading-relaxed">
                <span className="font-extrabold uppercase tracking-wider block mb-1">
                  Executive Root-Cause Diagnosis for MD:
                </span>
                {data.netProfitLoss < 0 ? (
                  <span>
                    This job resulted in a net loss of <strong>₹{Math.abs(data.netProfitLoss).toLocaleString()}</strong>.
                    {stats.shortfallBoxes > 0 && (
                      <span> <strong>{stats.shortfallBoxes} boxes</strong> were lost in intermediate processes (printing, die-cutting, stitching) causing a direct board loss of <strong>₹{data.totalLessBoxLoss.toLocaleString()}</strong>.</span>
                    )}
                    {stats.paperVarianceValue > 0 && (
                      <span> Additionally, the corrugation machine over-consumed <strong>{Math.round(stats.paperVarianceWeight)} Kg</strong> of paper costing <strong>₹{stats.paperVarianceValue.toLocaleString()}</strong>.</span>
                    )}
                  </span>
                ) : (
                  <span>
                    Job completed profitably with <strong>+₹{data.netProfitLoss.toLocaleString()}</strong> savings.
                    {stats.paperVarianceWeight < 0 && (
                      <span> Corrugation machine saved <strong>{Math.abs(Math.round(stats.paperVarianceWeight))} Kg</strong> of paper.</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* User Inputs: Manufactured Box Qty & Sale Rate */}
          <div className="bg-secondary/30 p-4 rounded-xl border border-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              {/* Manf Box Qty Input */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Manufactured Box Qty:
                </label>
                <input
                  type="number"
                  min="0"
                  value={data.manfBoxQty ?? ''}
                  onChange={(e) => handleManfQtyChange(e.target.value)}
                  placeholder="e.g. 4800"
                  className="w-32 px-3 py-1.5 bg-card border border-border rounded-lg text-sm font-black text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <span className="text-xs text-muted-foreground font-semibold">
                  (Job Card Order: {data.orderBoxQty.toLocaleString()})
                </span>
              </div>

              {/* Optional Sale Rate Input */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Sale Rate (₹/Box):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={data.saleRatePerBox ?? ''}
                  onChange={(e) => handleSaleRateChange(e.target.value)}
                  placeholder="e.g. 24.50"
                  className="w-28 px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground italic">
              * Enter actual boxes manufactured on machine to calculate WIP scrap loss.
            </div>
          </div>

          {/* Layer-wise Costing Breakdown Table */}
          <div className="border border-border rounded-xl overflow-x-auto shadow-sm">
            <div className="bg-secondary/60 px-4 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Layer-Wise Paper Allocation & DPR Costing Breakdown
              </span>
              <span className="text-[11px] text-muted-foreground">
                All values in Indian Rupees (₹)
              </span>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/30 border-b border-border font-bold text-muted-foreground text-left">
                  <th className="p-3 w-28">Layer</th>
                  <th className="p-3 w-20 text-center">Reel Size</th>
                  <th className="p-3 text-right">Alloc. Wt</th>
                  <th className="p-3 text-right">Rate (₹/Kg)</th>
                  <th className="p-3 text-right">Alloc. Value</th>
                  <th className="p-3 text-center bg-blue-50/50 min-w-[130px]">DPR Wt (Kg)</th>
                  <th className="p-3 text-right bg-blue-50/50">DPR Value</th>
                  <th className="p-3 text-right bg-amber-50/40">Less Box Loss (Kg)</th>
                  <th className="p-3 text-right bg-amber-50/40">Less Box Loss (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.layers.map((layer) => (
                  <tr key={layer.layerIndex} className="hover:bg-muted/40 transition-colors">
                    {/* Layer Name */}
                    <td className="p-3 font-bold text-foreground">
                      {layer.layerName}
                      {layer.reelNumber && (
                        <span className="block text-[10px] font-normal text-muted-foreground font-mono">
                          Reel: {layer.reelNumber}
                        </span>
                      )}
                    </td>

                    {/* Reel Size */}
                    <td className="p-3 text-center font-semibold text-foreground">
                      {layer.reelSize ? `${layer.reelSize}"` : '—'}
                    </td>

                    {/* Allocated Weight */}
                    <td className="p-3 text-right font-bold text-foreground">
                      {Math.round(layer.allocatedWeight).toLocaleString()} Kg
                    </td>

                    {/* Reel Rate (Editable if 0 or missing!) */}
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span className="text-muted-foreground font-semibold">₹</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={layer.reelRate || ''}
                          onChange={(e) => handleLayerChange(
                            layer.layerIndex, 
                            'reelRate', 
                            e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                          )}
                          placeholder="0"
                          className="w-16 px-1.5 py-1 text-right bg-card border border-border rounded text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="Rate fetched from Reels Inventory. Click to edit."
                        />
                      </div>
                    </td>

                    {/* Allocated Value */}
                    <td className="p-3 text-right font-black text-foreground">
                      ₹{layer.allocatedValue.toLocaleString()}
                    </td>

                    {/* DPR Weight Input (MANUAL) */}
                    <td className="p-2 text-center bg-blue-50/50">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={layer.dprWeight ?? ''}
                        onChange={(e) => handleLayerChange(
                          layer.layerIndex, 
                          'dprWeight', 
                          e.target.value === '' ? null : parseFloat(e.target.value) || 0
                        )}
                        placeholder="e.g. 310"
                        className="w-24 px-2 py-1 text-center bg-white border border-blue-300 rounded font-bold text-blue-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                      />
                    </td>

                    {/* DPR Value */}
                    <td className="p-3 text-right font-black text-blue-900 bg-blue-50/50">
                      {layer.dprValue !== null ? `₹${layer.dprValue.toLocaleString()}` : '—'}
                    </td>

                    {/* Less Box Weight Loss */}
                    <td className="p-3 text-right font-bold text-amber-700 bg-amber-50/40">
                      {data.manfBoxQty !== null ? `${layer.lessBoxWeightLoss} Kg` : '—'}
                    </td>

                    {/* Less Box Value Loss */}
                    <td className="p-3 text-right font-black text-amber-900 bg-amber-50/40">
                      {data.manfBoxQty !== null ? `₹${layer.lessBoxValueLoss.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Total Summary Footer */}
              <tfoot>
                <tr className="bg-secondary/70 border-t-2 border-border font-black text-foreground">
                  <td colSpan={2} className="p-3 uppercase tracking-wider text-xs">
                    TOTALS
                  </td>
                  <td className="p-3 text-right font-black">
                    {Math.round(stats.totalAllocWeight).toLocaleString()} Kg
                  </td>
                  <td className="p-3 text-right text-muted-foreground">—</td>
                  <td className="p-3 text-right font-black text-foreground text-sm">
                    ₹{data.totalAllocatedValue.toLocaleString()}
                  </td>
                  <td className="p-3 text-center font-black text-blue-900 bg-blue-100/50">
                    {stats.hasDpr ? `${Math.round(stats.totalDprWeight).toLocaleString()} Kg` : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-blue-900 bg-blue-100/50 text-sm">
                    {stats.hasDpr ? `₹${data.totalDprValue.toLocaleString()}` : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-amber-900 bg-amber-100/50">
                    {data.manfBoxQty !== null ? `${data.layers.reduce((sum, l) => sum + (l.lessBoxWeightLoss || 0), 0).toFixed(1)} Kg` : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-amber-900 bg-amber-100/50 text-sm">
                    {data.manfBoxQty !== null ? `₹${data.totalLessBoxLoss.toLocaleString()}` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bottom Formula Explanation */}
          <div className="bg-secondary/30 p-4 rounded-xl border border-border text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-bold text-foreground">Mathematical Calculation Formula:</span>
              <p className="mt-0.5 font-mono text-[11px] text-blue-700 font-semibold">
                P/L = Total Allocated Value (₹{data.totalAllocatedValue.toLocaleString()}) - Total DPR Value ({stats.hasDpr ? `₹${data.totalDprValue.toLocaleString()}` : '₹0'}) - Less Box Loss ({data.manfBoxQty !== null ? `₹${data.totalLessBoxLoss.toLocaleString()}` : '₹0'})
              </p>
            </div>
            {data.netProfitLoss !== null && (
              <div className="text-right">
                <span className="text-[11px] uppercase font-bold text-muted-foreground block">
                  Net Difference
                </span>
                <span className={cn(
                  "text-lg font-black",
                  data.netProfitLoss >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {data.netProfitLoss >= 0 ? '+' : ''}₹{data.netProfitLoss.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Close Window
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Costing & P/L'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}


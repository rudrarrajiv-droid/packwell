import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Save, Printer, Share2, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Layers, Box, Calculator,
  Sparkles, RefreshCw, Gauge, UploadCloud, Lock
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { JobCostingData, JobCostingLayer, SaleRateSource } from './jobCostingTypes';
import {
  calculateFullJobCosting,
  lookupAutoSaleRate,
  saveCostingData,
  type SaleRateLookupContext,
} from './jobCostingService';
import { syncProductRateAcrossSystem } from '../../lib/supabase/finishGoodService';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface JobCostingDetailModalProps {
  initialData: JobCostingData;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: JobCostingData) => void;
  currentStandardRate: number;
  rateLookupContext: SaleRateLookupContext;
}

const SOURCE_BADGE: Record<SaleRateSource, { label: string; cls: string }> = {
  FINISH_GOODS: { label: 'Auto: Finish Goods', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  MASTER_DATA: { label: 'Auto: Master Data', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  PO: { label: 'Auto: Linked PO', cls: 'bg-purple-100 text-purple-800 border-purple-300' },
  SAVED_MANUAL: { label: 'Manual / Saved', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  NONE: { label: 'Rate Missing — Enter Manually', cls: 'bg-rose-100 text-rose-800 border-rose-300' },
};

export default function JobCostingDetailModal({
  initialData,
  isOpen,
  onClose,
  onSaved,
  currentStandardRate,
  rateLookupContext,
}: JobCostingDetailModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [data, setData] = useState<JobCostingData>(initialData);
  const [convRateInput, setConvRateInput] = useState<string>(String(initialData.conversionRateUsed));
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingMaster, setIsSyncingMaster] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  useEffect(() => {
    setData(initialData);
    setConvRateInput(String(initialData.conversionRateUsed));
  }, [initialData]);

  const runRecalculate = (
    prev: JobCostingData,
    manfBoxQty: number | null,
    saleRatePerBox: number | null | undefined,
    saleRateSource: SaleRateSource,
    layers: JobCostingLayer[],
    conversionRateUsed: number,
    isConversionRateLocked: boolean
  ): JobCostingData => {
    return calculateFullJobCosting(
      {
        jobCardId: prev.jobCardId,
        jobCardNo: prev.jobCardNo,
        jobCardDate: prev.jobCardDate,
        jobName: prev.jobName,
        productId: prev.productId,
        customerId: prev.customerId,
        customerName: prev.customerName,
        poId: prev.poId,
        poNo: prev.poNo,
        orderBoxQty: prev.orderBoxQty,
        notes: prev.notes,
        isConversionRateLocked,
      },
      manfBoxQty,
      saleRatePerBox,
      saleRateSource,
      layers,
      conversionRateUsed
    );
  };

  // Handler for updating Manf Box Qty
  const handleManfQtyChange = (valStr: string) => {
    const val = valStr === '' ? null : Math.max(0, parseInt(valStr, 10) || 0);
    setData((prev) =>
      runRecalculate(
        prev,
        val,
        prev.saleRatePerBox,
        prev.saleRateSource || 'NONE',
        prev.layers,
        prev.conversionRateUsed,
        prev.isConversionRateLocked
      )
    );
  };

  // Handler for updating Sale Rate manually
  const handleSaleRateChange = (valStr: string) => {
    const val = valStr === '' ? null : Math.max(0, parseFloat(valStr) || 0);
    setData((prev) =>
      runRecalculate(
        prev,
        prev.manfBoxQty,
        val,
        val !== null && val > 0 ? 'SAVED_MANUAL' : 'NONE',
        prev.layers,
        prev.conversionRateUsed,
        prev.isConversionRateLocked
      )
    );
  };

  // Re-fetch Sale Rate from Finish Goods / Master Data / PO
  const handleRefreshMasterRate = () => {
    const res = lookupAutoSaleRate(
      {
        productId: data.productId,
        productName: data.jobName,
        customerName: data.customerName,
        poId: data.poId,
        poNo: data.poNo,
      },
      rateLookupContext
    );
    if (res.rate !== null && res.rate > 0) {
      setData((prev) =>
        runRecalculate(
          prev,
          prev.manfBoxQty,
          res.rate,
          res.source,
          prev.layers,
          prev.conversionRateUsed,
          prev.isConversionRateLocked
        )
      );
      setSyncMessage(`Rate ₹${res.rate} loaded from ${SOURCE_BADGE[res.source].label}.`);
      setTimeout(() => setSyncMessage(null), 3000);
    } else {
      alert('Finish Goods, Master Data ya PO me is item ka rate nahi mila. Kripya manually darj karein.');
    }
  };

  // Optional: Sync manually corrected rate back to Finish Goods & Master Data
  const handleSyncRateToMaster = async () => {
    if (!data.saleRatePerBox || data.saleRatePerBox <= 0) return;
    if (
      !confirm(
        `Kya aap "${data.jobName}" ka rate ₹${data.saleRatePerBox} Finish Goods aur Master Data me bhi update karna chahte hain?`
      )
    ) {
      return;
    }
    setIsSyncingMaster(true);
    setSyncMessage(null);
    try {
      const res = await syncProductRateAcrossSystem(
        data.jobName,
        data.saleRatePerBox,
        data.customerName || undefined,
        undefined,
        user?.name || 'Job Costing'
      );
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['finishGoods'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        setSyncMessage(
          `Rate ₹${data.saleRatePerBox} Master Data (${res.updatedProducts}) & Finish Goods (${res.updatedFinishGoods}) me update ho gaya!`
        );
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        alert('Rate master me sync nahi ho paya.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error syncing rate to Finish Goods / Master Data.');
    } finally {
      setIsSyncingMaster(false);
    }
  };

  // Handler for updating Layer field (dprWeight or reelRate)
  const handleLayerChange = (
    layerIdx: number,
    field: 'dprWeight' | 'reelRate',
    value: number | null
  ) => {
    setData((prev) => {
      const updatedLayers = prev.layers.map((l) => {
        if (l.layerIndex !== layerIdx) return l;
        return { ...l, [field]: value };
      });
      return runRecalculate(
        prev,
        prev.manfBoxQty,
        prev.saleRatePerBox,
        prev.saleRateSource || 'NONE',
        updatedLayers,
        prev.conversionRateUsed,
        prev.isConversionRateLocked
      );
    });
  };

  // Preview-only per-job Conversion Cost change (not persisted until user explicitly clicks Save)
  const handleConvRateChange = (valStr: string) => {
    setConvRateInput(valStr);
    const val = valStr === '' ? 0 : Math.max(0, parseFloat(valStr) || 0);
    setData((prev) =>
      runRecalculate(
        prev,
        prev.manfBoxQty,
        prev.saleRatePerBox,
        prev.saleRateSource || 'NONE',
        prev.layers,
        val,
        prev.isConversionRateLocked
      )
    );
  };

  // Revert preview back to initial/saved Conversion Cost
  const handleResetConvRate = () => {
    const orig = initialData.conversionRateUsed;
    setConvRateInput(String(orig));
    setData((prev) =>
      runRecalculate(
        prev,
        prev.manfBoxQty,
        prev.saleRatePerBox,
        prev.saleRateSource || 'NONE',
        prev.layers,
        orig,
        initialData.isConversionRateLocked
      )
    );
  };

  // Single-Job Recalculate preview button with current global Standard Conversion Rate
  const handleRecalculateWithCurrentConvRate = () => {
    setConvRateInput(String(currentStandardRate));
    setData((prev) =>
      runRecalculate(
        prev,
        prev.manfBoxQty,
        prev.saleRatePerBox,
        prev.saleRateSource || 'NONE',
        prev.layers,
        currentStandardRate,
        true
      )
    );
    setSyncMessage(
      `Preview updated: Is job ki Conversion Cost ₹${currentStandardRate.toFixed(2)}/Kg par calculate ho rahi hai. Save dabane tak ye permanent nahi hogi.`
    );
    setTimeout(() => setSyncMessage(null), 4000);
  };

  // Diagnostic Stats
  const stats = useMemo(() => {
    const hasDpr = data.layers.some((l) => l.dprWeight !== null);
    const paperVarianceWeight = hasDpr ? data.totalDprWeight - data.totalAllocatedWeight : 0;
    const paperVarianceValue = hasDpr ? data.totalDprValue - data.totalAllocatedValue : 0;
    const shortfallBoxes = data.manfBoxQty !== null ? Math.max(0, data.orderBoxQty - data.manfBoxQty) : 0;
    const yieldPercentage =
      data.manfBoxQty !== null && data.orderBoxQty > 0
        ? Math.round((data.manfBoxQty / data.orderBoxQty) * 100)
        : null;
    const marginPercent =
      data.netProfitLoss !== null && data.totalSaleValue && data.totalSaleValue > 0
        ? (data.netProfitLoss / data.totalSaleValue) * 100
        : null;

    let pendingReason = '';
    if (!hasDpr) pendingReason = 'Fill DPR Weight';
    else if (data.manfBoxQty === null) pendingReason = 'Enter Manf Box Qty';
    else if (!data.saleRatePerBox || data.saleRatePerBox <= 0) pendingReason = 'Enter Sale Rate';

    return {
      hasDpr,
      paperVarianceWeight,
      paperVarianceValue,
      shortfallBoxes,
      yieldPercentage,
      marginPercent,
      pendingReason,
    };
  }, [data]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveCostingData(data.jobCardId, data);
      onSaved({ ...data, isConversionRateLocked: true });
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
    let text = `*JOB FULL COSTING & P/L REPORT*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Job Card:* ${data.jobCardNo}\n`;
    text += `*Date:* ${data.jobCardDate}\n`;
    text += `*Job Name:* ${data.jobName}\n`;
    text += `*Order Qty:* ${data.orderBoxQty.toLocaleString()} Nos\n`;
    text += `*Manf Qty:* ${data.manfBoxQty !== null ? `${data.manfBoxQty.toLocaleString()} Nos` : 'Pending'}\n`;
    text += `*Sale Rate:* ${data.saleRatePerBox ? `₹${data.saleRatePerBox}/Box` : 'Pending'}\n`;
    text += `*Total Sale Value:* ${data.totalSaleValue !== null ? `₹${data.totalSaleValue.toLocaleString()}` : 'Pending'}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Actual DPR Wt:* ${Math.round(data.totalDprWeight)} Kg\n`;
    text += `*Paper Cost (DPR Value):* ₹${data.totalDprValue.toLocaleString()}\n`;
    text += `*Conversion Cost (@ ₹${data.conversionRateUsed}/Kg):* ₹${data.conversionCost.toLocaleString()}\n`;
    text += `*Paper + Conv. Subtotal:* ₹${data.baseManufacturingCost.toLocaleString()}\n`;
    text += `*+ 5% Scrap Margin:* ₹${data.scrapAmount.toLocaleString()}\n`;
    text += `*Total Manufacturing Cost:* ₹${data.totalManufacturingCost.toLocaleString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (data.netProfitLoss !== null) {
      const isProfit = data.netProfitLoss >= 0;
      text += `*ACTUAL JOB P/L:* ${isProfit ? '🟢 PROFIT' : '🔴 LOSS'} ₹${Math.abs(data.netProfitLoss).toLocaleString()}`;
      if (stats.marginPercent !== null) {
        text += ` (${stats.marginPercent.toFixed(1)}%)`;
      }
      text += `\n`;
    } else {
      text += `*STATUS:* ${stats.pendingReason || 'Pending Data'}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);
  };

  const rateSourceInfo = SOURCE_BADGE[data.saleRateSource || 'NONE'];
  const rateDiffersFromStandard =
    Math.abs(data.conversionRateUsed - currentStandardRate) > 0.001;
  const isConvRatePreviewModified =
    Math.abs(data.conversionRateUsed - initialData.conversionRateUsed) > 0.001;

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl border border-border flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Top Header Bar - High-Contrast Light Theme */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-indigo-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 text-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 bg-indigo-700 text-white rounded-md font-mono shadow-xs">
                  {data.jobCardNo}
                </span>
                <span className="text-xs text-slate-700 font-bold">
                  Date: {data.jobCardDate}
                </span>
                {data.customerName && (
                  <span className="text-xs text-indigo-800 font-bold bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                    {data.customerName}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-950 mt-1">
                {data.jobName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
              title="Copy WhatsApp Summary for MD"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
              title="Print Costing Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-700 hover:text-slate-950 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded-lg transition-colors ml-1 cursor-pointer shadow-xs"
              title="Close Window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Toast notifications */}
          {savedSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Full Job Costing &amp; P/L saved successfully (Conversion Rate ₹{data.conversionRateUsed}/Kg locked for this job)!
            </div>
          )}
          {syncMessage && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-900 text-xs font-bold rounded-xl border border-blue-200">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              {syncMessage}
            </div>
          )}
          {copiedWhatsapp && (
            <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-bold rounded-xl border border-green-300">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              WhatsApp report copied to clipboard!
            </div>
          )}

          {/* 4 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Paper Cost (DPR Value) */}
            <div className="bg-secondary/40 p-4 rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
                <span>Paper Cost (DPR Value)</span>
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {stats.hasDpr ? `₹${data.totalDprValue.toLocaleString()}` : '—'}
                </div>
                <div className="text-[11px] mt-1 font-semibold text-muted-foreground">
                  {stats.hasDpr ? (
                    <>
                      Actual DPR Wt:{' '}
                      <strong className="text-blue-700">{Math.round(data.totalDprWeight).toLocaleString()} Kg</strong>
                    </>
                  ) : (
                    'Fill DPR weight below'
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Conversion Cost */}
            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-amber-900 text-xs font-bold uppercase tracking-wider">
                <span>Conversion Cost</span>
                <Gauge className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-amber-800">
                  {stats.hasDpr ? `₹${data.conversionCost.toLocaleString()}` : '—'}
                </div>
                <div className="text-[11px] mt-1 font-bold text-amber-900/80 flex items-center gap-1">
                  {stats.hasDpr ? (
                    <span>
                      {Math.round(data.totalDprWeight).toLocaleString()} Kg × ₹{data.conversionRateUsed}/Kg
                    </span>
                  ) : (
                    <span>Rate: ₹{data.conversionRateUsed}/Kg</span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Total Mfg Cost vs Sale Value */}
            <div className="bg-secondary/40 p-4 rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-bold uppercase tracking-wider">
                <span>Sale Value vs Mfg Cost</span>
                <Box className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xl font-black text-indigo-700">
                    {data.totalSaleValue !== null ? `₹${data.totalSaleValue.toLocaleString()}` : '—'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">Sale</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                  <span className="text-sm font-black text-slate-800">
                    {stats.hasDpr ? `₹${data.totalManufacturingCost.toLocaleString()}` : '—'}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Total Mfg Cost
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Final Actual Job P/L */}
            <div
              className={cn(
                'p-4 rounded-xl border-2 flex flex-col justify-between shadow-sm',
                data.netProfitLoss === null
                  ? 'bg-secondary/50 border-border'
                  : data.netProfitLoss >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950'
                  : 'bg-red-500/10 border-red-500/40 text-red-950'
              )}
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span>Actual Job P/L</span>
                {data.netProfitLoss !== null && data.netProfitLoss >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : data.netProfitLoss !== null ? (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                ) : null}
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'text-2xl sm:text-3xl font-black',
                      data.netProfitLoss === null
                        ? 'text-muted-foreground text-xl'
                        : data.netProfitLoss >= 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    )}
                  >
                    {data.netProfitLoss !== null
                      ? `${data.netProfitLoss >= 0 ? '+' : '-'}₹${Math.abs(data.netProfitLoss).toLocaleString()}`
                      : stats.pendingReason || 'Pending'}
                  </span>
                </div>
                <div className="text-xs mt-1 font-bold">
                  {data.netProfitLoss === null ? (
                    <span className="text-muted-foreground">Complete DPR, Manf Qty &amp; Sale Rate</span>
                  ) : data.netProfitLoss >= 0 ? (
                    <span className="text-emerald-700">
                      PROFITABLE JOB{' '}
                      {stats.marginPercent !== null ? `(${stats.marginPercent.toFixed(1)}% margin)` : ''}
                    </span>
                  ) : (
                    <span className="text-red-700">
                      LOSS ON THIS JOB{' '}
                      {stats.marginPercent !== null ? `(${stats.marginPercent.toFixed(1)}%)` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* User Inputs: Manufactured Box Qty + Auto/Editable Sale Rate + Conversion Rate Control */}
          <div className="bg-secondary/30 p-4 rounded-xl border border-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Manf Box Qty */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Manufactured Box Qty:
                </label>
                <input
                  type="number"
                  min="0"
                  value={data.manfBoxQty ?? ''}
                  onChange={(e) => handleManfQtyChange(e.target.value)}
                  placeholder="e.g. 98"
                  className="w-28 px-3 py-1.5 bg-card border-2 border-blue-300 rounded-lg text-sm font-black text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
                <span className="text-xs text-muted-foreground font-semibold">
                  (Order: {data.orderBoxQty.toLocaleString()})
                </span>
              </div>

              {/* Sale Rate Input + Source Badge + Refresh / Sync */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Sale Rate (₹/Box):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={data.saleRatePerBox ?? ''}
                  onChange={(e) => handleSaleRateChange(e.target.value)}
                  placeholder="e.g. 65.00"
                  className="w-28 px-3 py-1.5 bg-card border-2 border-indigo-300 rounded-lg text-sm font-black text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                />
                <span
                  className={cn(
                    'text-[10px] font-black px-2 py-0.5 rounded-full border',
                    rateSourceInfo.cls
                  )}
                >
                  {rateSourceInfo.label}
                </span>
                <button
                  type="button"
                  onClick={handleRefreshMasterRate}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer"
                  title="Finish Goods ya Master Data se rate dubara fetch karein"
                >
                  <RefreshCw className="w-3 h-3" />
                  Fetch FG/Master
                </button>
                {data.saleRateSource === 'SAVED_MANUAL' &&
                  data.saleRatePerBox !== null &&
                  data.saleRatePerBox !== undefined &&
                  data.saleRatePerBox > 0 && (
                    <button
                      type="button"
                      onClick={handleSyncRateToMaster}
                      disabled={isSyncingMaster}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition disabled:opacity-50 cursor-pointer"
                      title="Is updated rate ko Finish Goods aur Master Data me bhi save karein"
                    >
                      <UploadCloud className="w-3 h-3" />
                      {isSyncingMaster ? 'Syncing...' : 'Update FG & Master'}
                    </button>
                  )}
              </div>
            </div>

            {/* Conversion Cost Rate Preview / Lock + Recalculate Row */}
            <div className="pt-3 border-t border-border/70 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Gauge className="w-4 h-4 text-amber-600" />
                  <label className="font-bold text-foreground">Conversion Rate (₹/Kg):</label>
                  <div className="relative inline-flex items-center">
                    <span className="absolute left-2.5 text-amber-800 font-black text-xs">₹</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={convRateInput}
                      onChange={(e) => handleConvRateChange(e.target.value)}
                      className={cn(
                        'w-24 pl-6 pr-2 py-1 rounded-lg text-xs font-black focus:outline-none focus:ring-2 shadow-xs border-2',
                        isConvRatePreviewModified
                          ? 'bg-amber-50 border-amber-500 text-amber-950 focus:ring-amber-500'
                          : 'bg-white border-amber-300 text-amber-900 focus:ring-amber-500'
                      )}
                      title="Is job ke liye Conversion Cost temporary modify karke preview dekhein (Save dabane tak apply nahi hoga)"
                    />
                  </div>

                  {isConvRatePreviewModified ? (
                    <>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wide">
                        Unsaved Preview (Saved: ₹{initialData.conversionRateUsed.toFixed(2)})
                      </span>
                      <button
                        type="button"
                        onClick={handleResetConvRate}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer"
                        title="Wapas purane saved rate par reset karein"
                      >
                        Reset
                      </button>
                    </>
                  ) : data.isConversionRateLocked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                      <Lock className="w-3 h-3 text-slate-500" />
                      Locked on this job (Old jobs unaffected by global rate changes)
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Active Global Standard Rate
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {rateDiffersFromStandard && (
                    <span className="text-[11px] font-bold text-amber-700">
                      Current Global Standard: ₹{currentStandardRate.toFixed(2)}/Kg
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRecalculateWithCurrentConvRate}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer shadow-xs',
                      rateDiffersFromStandard
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                    )}
                    title={`Recalculate only this job preview using current standard rate ₹${currentStandardRate}/Kg`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Recalculate @ ₹{currentStandardRate.toFixed(2)}/Kg
                  </button>
                </div>
              </div>

              {isConvRatePreviewModified && (
                <div className="p-2.5 rounded-lg bg-amber-100/90 border border-amber-300 text-amber-950 text-[11px] font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Preview Mode: Aapne sirf dekhne ke liye Conversion Rate ₹{data.conversionRateUsed.toFixed(2)}/Kg kiya hai. Jab tak aap niche <strong>Save Full Costing &amp; P/L</strong> button nahi dabate, ye change save/continue nahi hoga (Close karne par wapas ₹{initialData.conversionRateUsed.toFixed(2)}/Kg ho jayega).
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Layer-wise Costing Breakdown Table */}
          <div className="border border-border rounded-xl overflow-x-auto shadow-sm">
            <div className="bg-secondary/60 px-4 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Layer-Wise Paper Allocation &amp; DPR Costing Breakdown
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
                    <td className="p-3 font-bold text-foreground">
                      {layer.layerName}
                      {layer.reelNumber && (
                        <span className="block text-[10px] font-normal text-muted-foreground font-mono">
                          Reel: {layer.reelNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center font-semibold text-foreground">
                      {layer.reelSize ? `${layer.reelSize}"` : '—'}
                    </td>
                    <td className="p-3 text-right font-bold text-foreground">
                      {Math.round(layer.allocatedWeight).toLocaleString()} Kg
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span className="text-muted-foreground font-semibold">₹</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={layer.reelRate || ''}
                          onChange={(e) =>
                            handleLayerChange(
                              layer.layerIndex,
                              'reelRate',
                              e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="w-16 px-1.5 py-1 text-right bg-card border border-border rounded text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="Rate fetched from Reels Inventory. Click to edit."
                        />
                      </div>
                    </td>
                    <td className="p-3 text-right font-black text-foreground">
                      ₹{layer.allocatedValue.toLocaleString()}
                    </td>
                    <td className="p-2 text-center bg-blue-50/50">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={layer.dprWeight ?? ''}
                        onChange={(e) =>
                          handleLayerChange(
                            layer.layerIndex,
                            'dprWeight',
                            e.target.value === '' ? null : parseFloat(e.target.value) || 0
                          )
                        }
                        placeholder="e.g. 100"
                        className="w-24 px-2 py-1 text-center bg-white border border-blue-300 rounded font-bold text-blue-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                    </td>
                    <td className="p-3 text-right font-black text-blue-900 bg-blue-50/50">
                      {layer.dprValue !== null ? `₹${layer.dprValue.toLocaleString()}` : '—'}
                    </td>
                    <td className="p-3 text-right font-bold text-amber-700 bg-amber-50/40">
                      {data.manfBoxQty !== null ? `${layer.lessBoxWeightLoss} Kg` : '—'}
                    </td>
                    <td className="p-3 text-right font-black text-amber-900 bg-amber-50/40">
                      {data.manfBoxQty !== null ? `₹${layer.lessBoxValueLoss.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-secondary/70 border-t-2 border-border font-black text-foreground">
                  <td colSpan={2} className="p-3 uppercase tracking-wider text-xs">
                    TOTALS
                  </td>
                  <td className="p-3 text-right font-black">
                    {Math.round(data.totalAllocatedWeight).toLocaleString()} Kg
                  </td>
                  <td className="p-3 text-right text-muted-foreground">—</td>
                  <td className="p-3 text-right font-black text-foreground text-sm">
                    ₹{data.totalAllocatedValue.toLocaleString()}
                  </td>
                  <td className="p-3 text-center font-black text-blue-900 bg-blue-100/50">
                    {stats.hasDpr ? `${Math.round(data.totalDprWeight).toLocaleString()} Kg` : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-blue-900 bg-blue-100/50 text-sm">
                    {stats.hasDpr ? `₹${data.totalDprValue.toLocaleString()}` : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-amber-900 bg-amber-100/50">
                    {data.manfBoxQty !== null
                      ? `${data.layers.reduce((sum, l) => sum + (l.lessBoxWeightLoss || 0), 0).toFixed(1)} Kg`
                      : '—'}
                  </td>
                  <td className="p-3 text-right font-black text-amber-900 bg-amber-100/50 text-sm">
                    {data.manfBoxQty !== null ? `₹${data.totalLessBoxLoss.toLocaleString()}` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Step-by-Step Full Costing Formula & Paper Variance Diagnostic */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Full Costing Summary Box - High-Contrast Light Card */}
            <div className="lg:col-span-7 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/50 text-slate-900 p-5 rounded-xl border-2 border-indigo-200 shadow-sm space-y-2.5 text-xs">
              <div className="font-black uppercase tracking-wider text-indigo-900 flex items-center justify-between pb-2 border-b border-indigo-200">
                <span className="flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  Full Job Costing Formula Breakdown
                </span>
                <span className="text-[11px] text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200 font-bold">
                  +5% on (Paper + Conv.) Total
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-2 pt-1 items-center">
                <span className="text-slate-700 font-semibold">1. Actual Total DPR Weight:</span>
                <span className="text-right font-black text-slate-950">
                  {stats.hasDpr
                    ? `${Math.round(data.totalDprWeight).toLocaleString()} Kg`
                    : 'Pending DPR'}
                </span>

                <span className="text-slate-700 font-semibold">2. Paper Cost (Total DPR Value):</span>
                <span className="text-right font-black text-blue-700">
                  {stats.hasDpr ? `₹${data.totalDprValue.toLocaleString()}` : '—'}
                </span>

                <span className="text-slate-700 font-semibold">
                  3. Conversion Cost ({Math.round(data.totalDprWeight).toLocaleString()} Kg × ₹{data.conversionRateUsed}/Kg):
                </span>
                <span className="text-right font-black text-amber-700">
                  {stats.hasDpr ? `₹${data.conversionCost.toLocaleString()}` : '—'}
                </span>

                <span className="text-slate-800 font-bold pt-2 border-t border-indigo-100">
                  4a. Subtotal (Paper Value + Conversion Cost):
                </span>
                <span className="text-right font-extrabold text-slate-950 pt-2 border-t border-indigo-100">
                  {stats.hasDpr ? `₹${data.baseManufacturingCost.toLocaleString()}` : '—'}
                </span>

                <span className="text-slate-700 font-semibold">
                  4b. + 5% Margin (₹{data.baseManufacturingCost.toLocaleString()} × 5%):
                </span>
                <span className="text-right font-extrabold text-amber-700">
                  {stats.hasDpr ? `+ ₹${data.scrapAmount.toLocaleString()}` : '—'}
                </span>

                <span className="text-indigo-950 font-black py-1.5 px-2 bg-indigo-100/70 rounded-l-lg border-y border-indigo-200">
                  4. Total Manufacturing Cost (Subtotal + 5%):
                </span>
                <span className="text-right font-black text-indigo-950 text-sm py-1.5 px-2 bg-indigo-100/70 rounded-r-lg border-y border-indigo-200">
                  {stats.hasDpr ? `₹${data.totalManufacturingCost.toLocaleString()}` : '—'}
                </span>

                <span className="text-slate-700 font-semibold pt-1">
                  5. Sale Value ({data.manfBoxQty ?? 0} Box × ₹{data.saleRatePerBox ?? 0}):
                </span>
                <span className="text-right font-black text-indigo-700 pt-1">
                  {data.totalSaleValue !== null
                    ? `₹${data.totalSaleValue.toLocaleString()}`
                    : 'Pending Manf Qty / Rate'}
                </span>

                <span className="text-slate-950 font-black pt-2 border-t-2 border-indigo-200 text-sm">
                  6. Actual Job Profit / Loss (Sale − Mfg Cost):
                </span>
                <span className="text-right pt-2 border-t-2 border-indigo-200">
                  {data.netProfitLoss !== null ? (
                    <span
                      className={cn(
                        'inline-block px-3 py-1 rounded-lg font-black text-sm border',
                        data.netProfitLoss >= 0
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                      )}
                    >
                      {data.netProfitLoss >= 0 ? '+₹' : '-₹'}
                      {Math.abs(data.netProfitLoss).toLocaleString()}{' '}
                      {data.netProfitLoss >= 0 ? '(PROFIT)' : '(LOSS)'}
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700">{stats.pendingReason || 'Pending'}</span>
                  )}
                </span>
              </div>
            </div>

            {/* Machine Paper Efficiency Diagnostic */}
            <div className="lg:col-span-5 bg-secondary/40 p-5 rounded-xl border border-border flex flex-col justify-between text-xs space-y-3">
              <div>
                <div className="font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Machine Paper &amp; Process Diagnostics
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Box Yield:</span>
                    <span className="font-bold text-foreground">
                      {data.manfBoxQty !== null
                        ? `${data.manfBoxQty.toLocaleString()} / ${data.orderBoxQty.toLocaleString()} (${stats.yieldPercentage ?? 0}%)`
                        : 'Pending Manf Qty'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">
                      Corrugator Variance (Alloc vs DPR):
                    </span>
                    <span
                      className={cn(
                        'font-bold',
                        stats.paperVarianceWeight > 0
                          ? 'text-red-600'
                          : stats.paperVarianceWeight < 0
                          ? 'text-emerald-600'
                          : 'text-foreground'
                      )}
                    >
                      {stats.hasDpr
                        ? `${stats.paperVarianceWeight > 0 ? '+' : ''}${Math.round(stats.paperVarianceWeight)} Kg (${stats.paperVarianceValue > 0 ? '+' : '-'}₹${Math.abs(stats.paperVarianceValue).toLocaleString()})`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">
                      Intermediate WIP Scrap Loss:
                    </span>
                    <span className="font-bold text-amber-700">
                      ₹{data.totalLessBoxLoss.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="text-muted-foreground font-semibold">
                      Paper-Only Variance P/L:
                    </span>
                    <span
                      className={cn(
                        'font-black',
                        data.paperVariancePL === null
                          ? 'text-muted-foreground'
                          : data.paperVariancePL >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      )}
                    >
                      {data.paperVariancePL !== null
                        ? `${data.paperVariancePL >= 0 ? '+₹' : '-₹'}${Math.abs(data.paperVariancePL).toLocaleString()}`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {stats.shortfallBoxes > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {stats.shortfallBoxes} boxes kam nikle (order se), jisme ₹
                    {data.totalLessBoxLoss.toLocaleString()} ka board intermediate process me scrap hua.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg hover:bg-secondary/80 transition-colors cursor-pointer"
          >
            Close Window
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Full Costing & P/L'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { 
  X, Layers, AlertTriangle, CheckCircle2, ShoppingCart, RefreshCw, 
  ArrowRight, Calendar, Building2, FileText, Check, AlertCircle, Info, Sparkles,
  TrendingDown, Hash, Scale, CheckCircle, RotateCcw
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { getProducts } from '../../lib/supabase/productService';
import { getReels } from '../../lib/supabase/reelService';
import { updatePurchaseOrder, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { computePORMStatus, type AlternateDeckleLayerResolution, type MillOrderLayerResolution } from '../../lib/rmStatusHelper';
import { cn } from '../../lib/utils';

interface RMStatusModalProps {
  po: PurchaseOrder;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ShortLayerConfig {
  mode: 'ALT_DECKLE' | 'MILL_ORDER';
  // Alt Deckle fields
  selectedReelSize: number;
  selectedReelNumber?: string;
  allocatedWeight?: number;
  selectedGsm?: number;
  selectedBf?: string;
  note?: string;
  // Mill Order fields
  orderVendor?: string;
  orderEta?: string;
  orderReelSize?: number;
  orderGsm?: number;
  orderBf?: string;
  orderWeight?: number;
}

export default function RMStatusModal({ po, onClose, onSuccess }: RMStatusModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RESOLVE'>('RESOLVE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queries
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as unknown as Promise<any[]>,
    staleTime: 60000,
  });

  const { data: reels = [] } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>,
    staleTime: 30000,
  });

  const product = useMemo(() => products.find((p: any) => p.id === po.productId), [products, po.productId]);

  // Compute live stock status
  const rmStatus = useMemo(() => {
    return computePORMStatus(po, product, reels);
  }, [po, product, reels]);

  const baseReelSize = Number(product?.reelSize) || 0;

  // Split layers into matched vs short/unmatched
  const shortLayers = useMemo(() => {
    return rmStatus.layers.filter(l => !l.isOk);
  }, [rmStatus.layers]);

  const matchedLayers = useMemo(() => {
    return rmStatus.layers.filter(l => l.isOk);
  }, [rmStatus.layers]);

  const existingResolution = (po as any).raw_data?.rmResolution || (po as any).rawData?.rmResolution;

  // Shared Mill Order settings (for quick inheritance)
  const [sharedVendorName, setSharedVendorName] = useState<string>(existingResolution?.vendorName || '');
  const [sharedEta, setSharedEta] = useState<string>(
    existingResolution?.expectedDeliveryDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [sharedOrderRefNo, setSharedOrderRefNo] = useState<string>(existingResolution?.orderRefNo || '');
  const [generalNote, setGeneralNote] = useState<string>(existingResolution?.generalNote || '');

  // Helper: Find matching candidate reels from inventory for a specific layer's GSM and BF
  const getMatchingReelsForLayer = (layerGsm: number, layerBf: string) => {
    const targetGsmStr = String(layerGsm).trim();
    const targetBfStr = String(layerBf).trim();

    return (reels || []).filter((r: any) => {
      if (Number(r.currentBalance) <= 0) return false;
      const rGsm = String(r.gsm || '').trim();
      const rBf = String(r.bf || '').trim();

      const gsmMatch = rGsm === targetGsmStr ||
        (layerGsm === 220 && rGsm === '230') || (layerGsm === 230 && rGsm === '220') ||
        (layerGsm === 100 && rGsm === '120') || (layerGsm === 120 && rGsm === '100');
      const bfMatch = !targetBfStr || rBf === targetBfStr;

      return gsmMatch && bfMatch;
    }).sort((a: any, b: any) => {
      const diffA = Math.abs((Number(a.reelSize) || 0) - baseReelSize);
      const diffB = Math.abs((Number(b.reelSize) || 0) - baseReelSize);
      return diffA - diffB;
    });
  };

  // ── Unified Per-Layer Configuration State ──
  const [layerConfigs, setLayerConfigs] = useState<Record<number, ShortLayerConfig>>(() => {
    const initial: Record<number, ShortLayerConfig> = {};
    const existingLayers: any[] = existingResolution?.layers || [];
    const existingOrders: any[] = existingResolution?.orders || [];

    rmStatus.layers.forEach((layer) => {
      const idx = layer.layerIndex;
      const origSize = layer.reelSize || baseReelSize;
      const matchedResLayer = existingLayers.find((l: any) => l.layerIndex === idx);
      const matchedOrder = existingOrders.find((o: any) => o.layerIndex === idx);

      let initialMode: 'ALT_DECKLE' | 'MILL_ORDER' = 'ALT_DECKLE';
      if (matchedResLayer?.resolutionType === 'MILL_ORDER' || matchedOrder || existingResolution?.type === 'RM_ORDERED') {
        initialMode = 'MILL_ORDER';
      } else if (matchedResLayer?.resolutionType === 'ALT_DECKLE' || existingResolution?.type === 'ALTERNATE_DECKLE') {
        initialMode = 'ALT_DECKLE';
      } else {
        // Default smart suggestion: If matching reels exist in stock, recommend Alt Deckle; else Mill Order
        const cand = getMatchingReelsForLayer(Number(layer.gsm), String(layer.bf || ''));
        initialMode = cand.length > 0 ? 'ALT_DECKLE' : 'MILL_ORDER';
      }

      initial[idx] = {
        mode: initialMode,
        // Alt Deckle prefill
        selectedReelSize: matchedResLayer?.selectedReelSize || origSize,
        selectedReelNumber: matchedResLayer?.reelNumber || '',
        allocatedWeight: matchedResLayer?.allocatedWeight || 0,
        selectedGsm: matchedResLayer?.selectedGsm || layer.gsm,
        selectedBf: matchedResLayer?.selectedBf || layer.bf,
        note: matchedResLayer?.note || '',
        // Mill Order prefill
        orderVendor: matchedOrder?.vendorName || matchedResLayer?.vendorName || existingResolution?.vendorName || '',
        orderEta: matchedOrder?.expectedDeliveryDate || matchedResLayer?.expectedDeliveryDate || existingResolution?.expectedDeliveryDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        orderReelSize: matchedOrder?.orderReelSize || matchedResLayer?.orderReelSize || origSize,
        orderGsm: matchedOrder?.orderGsm || matchedResLayer?.orderGsm || layer.gsm,
        orderBf: matchedOrder?.orderBf || matchedResLayer?.orderBf || layer.bf,
        orderWeight: matchedOrder?.orderWeight || matchedResLayer?.orderWeight || (layer.shortKg > 0 ? layer.shortKg : layer.requiredKg)
      };
    });

    return initial;
  });

  // Handle Layer Field Change
  const handleLayerFieldChange = (idx: number, field: keyof ShortLayerConfig, val: any) => {
    setLayerConfigs(prev => ({
      ...prev,
      [idx]: {
        ...(prev[idx] || {}),
        [field]: val
      }
    }));
  };

  // Batch action: Set all short layers to Alt Deckle or Mill Order
  const handleSetAllMode = (mode: 'ALT_DECKLE' | 'MILL_ORDER') => {
    setLayerConfigs(prev => {
      const next = { ...prev };
      shortLayers.forEach(l => {
        next[l.layerIndex] = {
          ...(next[l.layerIndex] || {}),
          mode
        };
      });
      return next;
    });
  };

  // Submit Unified Resolution
  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!po.id || !product) return;
    setError(null);

    // Validate: Any layer on Mill Order must have vendor specified
    const needsVendor = shortLayers.some(l => {
      const cfg = layerConfigs[l.layerIndex];
      return cfg?.mode === 'MILL_ORDER' && !(cfg.orderVendor || sharedVendorName).trim();
    });

    if (needsVendor) {
      setError('Please specify the Paper Mill / Vendor name for layers ordered from mill.');
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedLayers: any[] = rmStatus.layers.map((layer) => {
        const idx = layer.layerIndex;
        const origSize = layer.reelSize || baseReelSize;
        const cfg = layerConfigs[idx];

        if (layer.isOk) {
          // In Stock (already matched)
          return {
            layerIndex: idx,
            layerName: layer.layerName,
            resolutionType: 'IN_STOCK',
            originalReelSize: origSize,
            selectedReelSize: origSize,
            originalGsm: layer.gsm,
            selectedGsm: layer.gsm,
            originalBf: layer.bf,
            selectedBf: layer.bf,
            trimLossInch: 0,
            trimLossPercent: 0,
            note: 'In Stock'
          };
        }

        if (cfg?.mode === 'ALT_DECKLE') {
          const selSize = Number(cfg.selectedReelSize) || origSize;
          const trimLossInch = Math.max(0, Math.round((selSize - origSize) * 10) / 10);
          const trimLossPercent = origSize > 0 ? Math.round((trimLossInch / origSize) * 1000) / 10 : 0;

          return {
            layerIndex: idx,
            layerName: layer.layerName,
            resolutionType: 'ALT_DECKLE',
            originalReelSize: origSize,
            selectedReelSize: selSize,
            originalGsm: layer.gsm,
            selectedGsm: cfg.selectedGsm || layer.gsm,
            originalBf: layer.bf,
            selectedBf: cfg.selectedBf || layer.bf,
            reelNumber: cfg.selectedReelNumber || undefined,
            allocatedWeight: cfg.allocatedWeight || undefined,
            trimLossInch,
            trimLossPercent,
            note: cfg.note || (selSize !== origSize ? `Using ${selSize}" alternate deckle in place of ${origSize}"` : 'Exact size matched')
          };
        } else {
          // MILL_ORDER
          const vendor = (cfg?.orderVendor || sharedVendorName).trim();
          const eta = cfg?.orderEta || sharedEta;
          const orderReelSize = Number(cfg?.orderReelSize) || origSize;
          const orderWeight = Number(cfg?.orderWeight) || (layer.shortKg > 0 ? layer.shortKg : layer.requiredKg);

          return {
            layerIndex: idx,
            layerName: layer.layerName,
            resolutionType: 'MILL_ORDER',
            originalReelSize: origSize,
            selectedReelSize: orderReelSize,
            originalGsm: layer.gsm,
            selectedGsm: Number(cfg?.orderGsm) || layer.gsm,
            originalBf: layer.bf,
            selectedBf: cfg?.orderBf || layer.bf,
            vendorName: vendor,
            expectedDeliveryDate: eta,
            orderWeight,
            note: `Mill Order: ${vendor} (ETA ${eta})`
          };
        }
      });

      const millOrders = resolvedLayers
        .filter(l => l.resolutionType === 'MILL_ORDER')
        .map(l => ({
          layerIndex: l.layerIndex,
          layerName: l.layerName,
          requiredReelSize: l.originalReelSize,
          orderReelSize: l.selectedReelSize,
          requiredGsm: l.originalGsm,
          orderGsm: l.selectedGsm,
          requiredBf: l.originalBf,
          orderBf: l.selectedBf,
          requiredWeight: l.orderWeight,
          orderWeight: l.orderWeight,
          vendorName: l.vendorName,
          expectedDeliveryDate: l.expectedDeliveryDate
        }));

      const altCount = resolvedLayers.filter(l => l.resolutionType === 'ALT_DECKLE').length;
      const orderCount = millOrders.length;
      let overallType = 'COMBINED_RESOLUTION';
      if (altCount > 0 && orderCount === 0) overallType = 'ALTERNATE_DECKLE';
      else if (orderCount > 0 && altCount === 0) overallType = 'RM_ORDERED';

      const resolutionPayload = {
        type: overallType,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user?.name || 'User',
        generalNote: generalNote.trim() || undefined,
        vendorName: sharedVendorName.trim() || undefined,
        expectedDeliveryDate: sharedEta,
        orderRefNo: sharedOrderRefNo.trim() || undefined,
        layers: resolvedLayers,
        orders: millOrders
      };

      const updatedRawData = {
        ...((po as any).raw_data || {}),
        ...((po as any).rawData || {}),
        rmResolution: resolutionPayload
      };

      await updatePurchaseOrder(po.id, {
        raw_data: updatedRawData,
        rawData: updatedRawData
      } as any, user?.name || 'System');

      await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save RM resolution:', err);
      setError(err?.message || 'Failed to save paper RM resolution.');
      setIsSubmitting(false);
    }
  };

  // Clear resolution back to live stock
  const handleClearResolution = async () => {
    if (!po.id) return;
    if (!window.confirm('Reset this RM resolution back to live stock checking?')) return;
    setIsSubmitting(true);
    try {
      const updatedRawData = { 
        ...((po as any).raw_data || {}),
        ...((po as any).rawData || {})
      };
      delete updatedRawData.rmResolution;

      await updatePurchaseOrder(po.id, {
        raw_data: updatedRawData,
        rawData: updatedRawData
      } as any, user?.name || 'System');

      await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      alert('Failed to reset: ' + err.message);
      setIsSubmitting(false);
    }
  };

  const countAlt = shortLayers.filter(l => layerConfigs[l.layerIndex]?.mode === 'ALT_DECKLE').length;
  const countOrder = shortLayers.filter(l => layerConfigs[l.layerIndex]?.mode === 'MILL_ORDER').length;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Modal Header */}
        <div className={cn(
          "p-4 sm:p-5 border-b border-border flex items-center justify-between",
          rmStatus.isGreen ? "bg-emerald-500/10" : "bg-red-500/10"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-xl shadow-sm text-white",
              rmStatus.isGreen ? "bg-emerald-600" : "bg-red-600"
            )}>
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Paper RM Status & Deckle Resolution Hub</h2>
                <span className={cn("px-2.5 py-0.5 text-xs rounded-full border", rmStatus.badgeClass)}>
                  {rmStatus.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                PO #{po.poNo} • {po.customerName} • {po.productName} ({po.orderQty} Boxes) • Standard Deckle: <b>{baseReelSize}"</b>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Tabs Bar */}
        <div className="px-5 pt-3 pb-0 border-b border-border bg-secondary/20 flex items-center justify-between overflow-x-auto shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('RESOLVE')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5",
                activeTab === 'RESOLVE'
                  ? "border-primary text-primary bg-card shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1. Resolve Short Layers ({shortLayers.length} Short)</span>
            </button>

            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5",
                activeTab === 'OVERVIEW'
                  ? "border-primary text-primary bg-card shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>2. Full Live Stock Table ({matchedLayers.length}/{rmStatus.layers.length} Matched)</span>
            </button>
          </div>

          {existingResolution && (
            <button
              type="button"
              onClick={handleClearResolution}
              disabled={isSubmitting}
              className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/30 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Live Stock
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: RESOLVE SHORT LAYERS (UNIFIED HYBRID RESOLUTION) */}
          {activeTab === 'RESOLVE' && (
            <form onSubmit={handleSaveResolution} className="space-y-4">
              
              {/* Header Guidance */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    Layer-Wise Resolution Matrix: Choose Alternate Reel or Book Mill Order
                  </h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                    For each short layer, select <b>Alternate Reel</b> (from stock) OR <b>Mill Order</b>. You can resolve some layers with alternate reels and others with mill orders simultaneously!
                  </p>
                </div>

                {shortLayers.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetAllMode('ALT_DECKLE')}
                      className="px-2.5 py-1.5 text-[11px] font-bold bg-white dark:bg-card border border-emerald-600 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      All to Alternate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllMode('MILL_ORDER')}
                      className="px-2.5 py-1.5 text-[11px] font-bold bg-white dark:bg-card border border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 transition-colors shadow-2xs flex items-center gap-1"
                    >
                      <ShoppingCart className="w-3 h-3" />
                      All to Mill Order
                    </button>
                  </div>
                )}
              </div>

              {/* Matched Layers Banner */}
              {matchedLayers.length > 0 && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">
                      ✅ {matchedLayers.length} Layer{matchedLayers.length > 1 ? 's' : ''} Already Matched in Live Stock (No Action Needed):
                    </span>
                    <span className="ml-2 text-emerald-800 dark:text-emerald-300 font-medium">
                      {matchedLayers.map(l => `${l.layerName} (${l.reelSize}" ${l.gsm}GSM ${l.bf}BF)`).join(' • ')}
                    </span>
                  </div>
                </div>
              )}

              {/* Shared Mill Order Presets (Shown if any layer is on Mill Order) */}
              {countOrder > 0 && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
                      Mill Booking Information ({countOrder} Layer{countOrder > 1 ? 's' : ''} on Mill Order)
                    </span>
                    <span className="text-[11px] text-blue-800 dark:text-blue-300 font-medium">
                      Auto-applies to all mill order layers
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                        Paper Mill / Vendor Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={sharedVendorName}
                        onChange={e => setSharedVendorName(e.target.value)}
                        placeholder="e.g. Century Paper, Devrishi..."
                        className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                        Expected Arrival Date (ETA) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={sharedEta}
                        onChange={e => setSharedEta(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-bold text-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                        Mill Booking / PO Ref No
                      </label>
                      <input
                        type="text"
                        value={sharedOrderRefNo}
                        onChange={e => setSharedOrderRefNo(e.target.value)}
                        placeholder="e.g. RM-PO-2026-042"
                        className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Short Layers Table */}
              {shortLayers.length === 0 ? (
                <div className="p-8 text-center bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <p className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                    All paper layers are already in stock!
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                    No alternate deckle or mill order needed. You can directly generate the Job Card.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shortLayers.map((layer) => {
                    const idx = layer.layerIndex;
                    const origSize = layer.reelSize || baseReelSize;
                    const cfg = layerConfigs[idx] || { mode: 'ALT_DECKLE', selectedReelSize: origSize };
                    const candidateReels = getMatchingReelsForLayer(Number(layer.gsm), String(layer.bf || ''));
                    const selectedSize = Number(cfg.selectedReelSize) || origSize;
                    const trimDiff = Math.round((selectedSize - origSize) * 10) / 10;
                    const trimPercent = origSize > 0 ? Math.round((trimDiff / origSize) * 1000) / 10 : 0;

                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-3.5 rounded-xl border transition-all",
                          cfg.mode === 'ALT_DECKLE'
                            ? "bg-emerald-500/[0.03] border-emerald-500/30 shadow-2xs"
                            : "bg-blue-500/[0.03] border-blue-500/30 shadow-2xs"
                        )}
                      >
                        {/* Layer Title & Mode Switcher */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-foreground">{layer.layerName}</span>
                                <span className="text-[10px] text-muted-foreground">({layer.standDescription})</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/15 text-red-600">
                                  Shortage: -{layer.shortKg} Kg
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Required Spec: <b>{origSize}"</b> • <b>{layer.gsm} GSM</b> • <b>{layer.bf} BF</b> ({layer.paperType || 'VK'}) • Total Needed: {layer.requiredKg} Kg
                              </span>
                            </div>
                          </div>

                          {/* Resolution Mode Pill Toggle */}
                          <div className="flex items-center p-0.5 bg-muted rounded-lg border border-border shrink-0 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleLayerFieldChange(idx, 'mode', 'ALT_DECKLE')}
                              className={cn(
                                "px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                                cfg.mode === 'ALT_DECKLE'
                                  ? "bg-emerald-600 text-white shadow-2xs"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Alternate Reel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLayerFieldChange(idx, 'mode', 'MILL_ORDER')}
                              className={cn(
                                "px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                                cfg.mode === 'MILL_ORDER'
                                  ? "bg-blue-600 text-white shadow-2xs"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>Mill RM Order</span>
                            </button>
                          </div>
                        </div>

                        {/* Mode Details Section */}
                        <div className="pt-3">
                          {cfg.mode === 'ALT_DECKLE' ? (
                            /* MODE 1: ALTERNATE DECKLE */
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                              {/* Stock Selection */}
                              <div className="md:col-span-6 space-y-1">
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase">
                                  Select Alternate Reel from Inventory ({candidateReels.length} Compatible in Stock)
                                </label>
                                <select
                                  value={cfg.selectedReelNumber || (selectedSize === origSize ? 'NONE' : 'CUSTOM')}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'NONE') {
                                      handleLayerFieldChange(idx, 'selectedReelSize', origSize);
                                      handleLayerFieldChange(idx, 'selectedReelNumber', '');
                                    } else if (val === 'CUSTOM') {
                                      handleLayerFieldChange(idx, 'selectedReelNumber', '');
                                    } else {
                                      const reel = candidateReels.find(r => (r.reelNumber || r.id) === val);
                                      if (reel) {
                                        handleLayerFieldChange(idx, 'selectedReelSize', Number(reel.reelSize) || origSize);
                                        handleLayerFieldChange(idx, 'selectedReelNumber', reel.reelNumber || reel.id);
                                        handleLayerFieldChange(idx, 'selectedGsm', Number(reel.gsm) || layer.gsm);
                                        handleLayerFieldChange(idx, 'selectedBf', String(reel.bf || layer.bf));
                                      }
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-medium text-foreground"
                                >
                                  <option value="NONE">
                                    -- Select Compatible Stock Reel --
                                  </option>
                                  {candidateReels.map((r: any) => {
                                    const rSize = Number(r.reelSize) || origSize;
                                    const rDiff = Math.round((rSize - origSize) * 10) / 10;
                                    const rLoss = origSize > 0 ? Math.round((rDiff / origSize) * 1000) / 10 : 0;
                                    const rId = r.reelNumber || r.id;
                                    return (
                                      <option key={rId} value={rId}>
                                        Reel #{r.reelNumber} — {rSize}" | {r.gsm}GSM | {r.bf}BF | Stock: {Math.round(r.currentBalance)}Kg {rDiff > 0 ? `(+${rDiff}" / +${rLoss}% trim)` : '(Exact Size)'}
                                      </option>
                                    );
                                  })}
                                  <option value="CUSTOM">Custom Size (Type Manually)...</option>
                                </select>

                                {(!cfg.selectedReelNumber && selectedSize !== origSize) && (
                                  <div className="flex items-center gap-1.5 pt-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold">Custom Size:</span>
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={cfg.selectedReelSize}
                                      onChange={e => handleLayerFieldChange(idx, 'selectedReelSize', Number(e.target.value))}
                                      className="w-20 px-2 py-0.5 text-xs border border-input rounded font-bold"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Inches</span>
                                  </div>
                                )}
                              </div>

                              {/* Trim Diff Badge */}
                              <div className="md:col-span-3 text-center sm:text-left">
                                <span className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                                  Deckle & Wastage
                                </span>
                                <div className="flex items-center gap-2">
                                  {trimDiff === 0 ? (
                                    <span className="px-2 py-1 rounded text-xs font-bold bg-muted text-muted-foreground">
                                      {origSize}" (No Trim)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded text-xs font-black bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                      +{trimDiff}" Over (+{trimPercent}% Trim)
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Note */}
                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                  Remarks
                                </label>
                                <input
                                  type="text"
                                  value={cfg.note || ''}
                                  onChange={e => handleLayerFieldChange(idx, 'note', e.target.value)}
                                  placeholder="e.g. Acceptable side trim..."
                                  className="w-full px-2 py-1 text-xs bg-background border border-input rounded"
                                />
                              </div>
                            </div>
                          ) : (
                            /* MODE 2: MILL RM ORDER */
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                  Order Reel Size (Inch)
                                </label>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={cfg.orderReelSize || origSize}
                                  onChange={e => handleLayerFieldChange(idx, 'orderReelSize', Number(e.target.value))}
                                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-bold"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                  Order Paper Spec
                                </label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="number"
                                    value={cfg.orderGsm || layer.gsm}
                                    onChange={e => handleLayerFieldChange(idx, 'orderGsm', Number(e.target.value))}
                                    placeholder="GSM"
                                    className="w-1/2 px-2 py-1.5 text-xs bg-background border border-input rounded-lg font-medium"
                                  />
                                  <input
                                    type="text"
                                    value={cfg.orderBf || layer.bf}
                                    onChange={e => handleLayerFieldChange(idx, 'orderBf', e.target.value)}
                                    placeholder="BF"
                                    className="w-1/2 px-2 py-1.5 text-xs bg-background border border-input rounded-lg font-medium"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                  Booking Weight (Kg)
                                </label>
                                <input
                                  type="number"
                                  value={cfg.orderWeight || (layer.shortKg > 0 ? layer.shortKg : layer.requiredKg)}
                                  onChange={e => handleLayerFieldChange(idx, 'orderWeight', Number(e.target.value))}
                                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg font-bold text-blue-600"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">
                                  Custom Vendor (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={cfg.orderVendor || ''}
                                  onChange={e => handleLayerFieldChange(idx, 'orderVendor', e.target.value)}
                                  placeholder={sharedVendorName || "Same as header mill..."}
                                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Overall Authorization Note */}
              {shortLayers.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Overall Authorization / Plant Remarks (Printed on Production Job Card)
                  </label>
                  <textarea
                    rows={2}
                    value={generalNote}
                    onChange={e => setGeneralNote(e.target.value)}
                    placeholder="e.g. Approved mixed resolution (2 Alternate reels allocated + 1 layer ordered from Century Paper). Side trim and GSM verified on corrugator..."
                    className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg resize-none"
                  />
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  Summary: <b className="text-foreground">{matchedLayers.length} In Stock</b> • <b className="text-emerald-600">{countAlt} Alt Deckle</b> • <b className="text-blue-600">{countOrder} Mill Order</b>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || shortLayers.length === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve Resolutions & Unlock Job Card</span>
                  </button>
                </div>
              </div>

            </form>
          )}

          {/* TAB 2: OVERVIEW FULL LIVE STOCK BREAKDOWN */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-secondary/70 text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="px-3.5 py-2.5 text-center">#</th>
                      <th className="px-3.5 py-2.5">Layer Name & Stand</th>
                      <th className="px-3.5 py-2.5">Paper Spec</th>
                      <th className="px-3.5 py-2.5 text-right">Required</th>
                      <th className="px-3.5 py-2.5 text-right">Available in Stock</th>
                      <th className="px-3.5 py-2.5 text-right">Shortage</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rmStatus.layers.map((l, i) => (
                      <tr key={i} className={cn("hover:bg-muted/20 transition-colors", !l.isOk && "bg-red-500/[0.04]")}>
                        <td className="px-3.5 py-2 text-center font-bold text-muted-foreground">{i + 1}</td>
                        <td className="px-3.5 py-2">
                          <span className="font-bold text-foreground block">{l.layerName}</span>
                          <span className="text-[10px] text-muted-foreground">{l.standDescription}</span>
                        </td>
                        <td className="px-3.5 py-2 font-medium">
                          {l.paperType} • {l.reelSize}" • {l.gsm} GSM {l.bf ? `• ${l.bf} BF` : ''}
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-foreground">
                          {l.requiredKg} {l.unit}
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold">
                          <span className={l.availableKg >= l.requiredKg ? "text-emerald-600" : "text-red-600"}>
                            {l.availableKg} {l.unit}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-right font-black">
                          {l.shortKg > 0 ? (
                            <span className="text-red-600">-{l.shortKg} {l.unit}</span>
                          ) : (
                            <span className="text-emerald-600">0</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2 text-center">
                          {l.isOk ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              ✓ In Stock
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30">
                              ⚠️ Shortage
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveTab('RESOLVE')}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Go to Short Layers Resolution Matrix ({shortLayers.length} Short)</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

import type { JobCostingData, JobCostingLayer, SaleRateSource } from './jobCostingTypes';
import { updateJobCard } from '../../lib/supabase/jobCardService';
import { DEFAULT_STANDARD_CONVERSION_COST } from '../../lib/conversionCostService';
import { isFluteLayer } from '../../lib/corrugationUtils';

const STORAGE_KEY_PREFIX = 'packwell_job_costing_';
export const DEFAULT_SCRAP_PERCENT = 5;

export const getStoredCostingData = (jobCardId: string): JobCostingData | null => {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${jobCardId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading costing from localStorage', e);
  }
  return null;
};

export const saveCostingData = async (
  jobCardId: string,
  costingData: JobCostingData
): Promise<void> => {
  const lockedPayload: JobCostingData = {
    ...costingData,
    isConversionRateLocked: true,
    lastUpdated: new Date().toISOString(),
  };

  // 1. Save to localStorage immediately for instant local persistence
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${jobCardId}`,
      JSON.stringify(lockedPayload)
    );
  } catch (e) {
    console.error('Error writing costing to localStorage', e);
  }

  // 2. Persist to Supabase in job_cards record
  try {
    await updateJobCard(
      jobCardId,
      { costingData: lockedPayload },
      'System',
      { log: true, logAction: 'SAVE_JOB_COSTING' }
    );
  } catch (e) {
    console.warn('Could not sync costing to Supabase, local cache retained:', e);
  }
};

export interface SaleRateLookupContext {
  finishGoods?: any[];
  products?: any[];
  purchaseOrders?: any[];
}

export const lookupAutoSaleRate = (
  jobCardOrIdentity: {
    productId?: string | null;
    productName?: string | null;
    customerName?: string | null;
    poId?: string | null;
    poNo?: string | null;
    productSnapshot?: any;
  },
  context: SaleRateLookupContext = {}
): { rate: number | null; source: SaleRateSource } => {
  const { finishGoods = [], products = [], purchaseOrders = [] } = context;

  const jcProductId = jobCardOrIdentity.productId || jobCardOrIdentity.productSnapshot?.id || '';
  const jcItemName = String(
    jobCardOrIdentity.productName || jobCardOrIdentity.productSnapshot?.itemName || ''
  )
    .trim()
    .toLowerCase();
  const jcCustName = String(
    jobCardOrIdentity.customerName || jobCardOrIdentity.productSnapshot?.customerName || ''
  )
    .trim()
    .toLowerCase();

  // 1. Priority 1: Finish Goods (rate > 0)
  if (finishGoods.length > 0) {
    const byProdId = jcProductId
      ? finishGoods.find((fg) => fg && fg.productId === jcProductId && Number(fg.rate) > 0)
      : undefined;
    if (byProdId) {
      return { rate: Number(byProdId.rate), source: 'FINISH_GOODS' };
    }

    const byNameAndCust =
      jcItemName && jcCustName
        ? finishGoods.find(
            (fg) =>
              fg &&
              String(fg.productName || '').trim().toLowerCase() === jcItemName &&
              String(fg.customerName || '').trim().toLowerCase() === jcCustName &&
              Number(fg.rate) > 0
          )
        : undefined;
    if (byNameAndCust) {
      return { rate: Number(byNameAndCust.rate), source: 'FINISH_GOODS' };
    }

    const byNameOnly = jcItemName
      ? finishGoods.find(
          (fg) =>
            fg &&
            String(fg.productName || '').trim().toLowerCase() === jcItemName &&
            Number(fg.rate) > 0
        )
      : undefined;
    if (byNameOnly) {
      return { rate: Number(byNameOnly.rate), source: 'FINISH_GOODS' };
    }
  }

  // 2. Priority 2: Master Data (products table)
  if (products.length > 0) {
    const prod =
      (jcProductId ? products.find((p) => p && p.id === jcProductId) : undefined) ||
      (jcItemName && jcCustName
        ? products.find(
            (p) =>
              p &&
              String(p.itemName || '').trim().toLowerCase() === jcItemName &&
              String(p.customerName || '').trim().toLowerCase() === jcCustName
          )
        : undefined) ||
      (jcItemName
        ? products.find(
            (p) => p && String(p.itemName || '').trim().toLowerCase() === jcItemName
          )
        : undefined);

    if (prod) {
      const masterRate = Number(prod.customerRate || prod.rate || prod.actualCosting || 0);
      if (masterRate > 0) {
        return { rate: masterRate, source: 'MASTER_DATA' };
      }
    }
  }

  // 3. Priority 3: Linked PO or Latest PO for same product
  if (purchaseOrders.length > 0) {
    const poById = jobCardOrIdentity.poId
      ? purchaseOrders.find((po) => po && po.id === jobCardOrIdentity.poId && Number(po.rate) > 0)
      : undefined;
    if (poById) {
      return { rate: Number(poById.rate), source: 'PO' };
    }

    const poByNo = jobCardOrIdentity.poNo
      ? purchaseOrders.find((po) => po && po.poNo === jobCardOrIdentity.poNo && Number(po.rate) > 0)
      : undefined;
    if (poByNo) {
      return { rate: Number(poByNo.rate), source: 'PO' };
    }

    const poByProd = jcProductId
      ? purchaseOrders.find(
          (po) => po && !po.isArchived && po.productId === jcProductId && Number(po.rate) > 0
        )
      : undefined;
    if (poByProd) {
      return { rate: Number(poByProd.rate), source: 'PO' };
    }
  }

  return { rate: null, source: 'NONE' };
};

/**
 * Shared pure recalculation engine used by both buildJobCostingData and JobCostingDetailModal.
 */
export const calculateFullJobCosting = (
  current: Pick<
    JobCostingData,
    | 'jobCardId'
    | 'jobCardNo'
    | 'jobCardDate'
    | 'jobName'
    | 'productId'
    | 'customerId'
    | 'customerName'
    | 'poId'
    | 'poNo'
    | 'orderBoxQty'
    | 'notes'
    | 'isConversionRateLocked'
  >,
  manfBoxQty: number | null,
  saleRatePerBox: number | null | undefined,
  saleRateSource: SaleRateSource,
  layers: JobCostingLayer[],
  conversionRateUsed: number
): JobCostingData => {
  const orderQty = current.orderBoxQty || 0;
  const lessBoxQty = manfBoxQty !== null ? Math.max(0, orderQty - manfBoxQty) : 0;

  const updatedLayers: JobCostingLayer[] = layers.map((l) => {
    const reelRate = Number(l.reelRate || 0);
    const allocatedValue = Math.round((l.allocatedWeight || 0) * reelRate);

    const dprWeight =
      l.dprWeight !== null && l.dprWeight !== undefined ? Number(l.dprWeight) : null;
    const dprValue = dprWeight !== null ? Math.round(dprWeight * reelRate) : null;

    const paperWeightPerBox = orderQty > 0 ? l.allocatedWeight / orderQty : 0;
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
      lessBoxValueLoss,
    };
  });

  const totalAllocatedWeight = updatedLayers.reduce((sum, l) => sum + (l.allocatedWeight || 0), 0);
  const totalAllocatedValue = updatedLayers.reduce((sum, l) => sum + (l.allocatedValue || 0), 0);
  const hasDpr = updatedLayers.some((l) => l.dprWeight !== null);
  const totalDprWeight = updatedLayers.reduce((sum, l) => sum + (l.dprWeight || 0), 0);
  const totalDprValue = updatedLayers.reduce((sum, l) => sum + (l.dprValue || 0), 0);
  const totalLessBoxLoss = updatedLayers.reduce((sum, l) => sum + (l.lessBoxValueLoss || 0), 0);

  // Full Costing Formula:
  // 1. Actual DPR Weight (no +5% added to weight)
  // 2. Paper Cost = Actual DPR Paper Value (totalDprValue)
  // 3. Conversion Cost = Actual DPR Weight * Conversion Rate
  // 4. Base Cost = Paper Cost + Conversion Cost; Total Manufacturing Cost = Base Cost + 5%
  // 5. Total Sale Value = Manufactured Box Qty * Sale Rate
  // 6. Actual P/L = Total Sale Value - Total Manufacturing Cost
  const scrapPercent = DEFAULT_SCRAP_PERCENT;
  const roundedDprWeight = Math.round(totalDprWeight * 100) / 100;
  const roundedDprValue = Math.round(totalDprValue);
  const cleanConvRate = Number.isFinite(Number(conversionRateUsed))
    ? Number(conversionRateUsed)
    : DEFAULT_STANDARD_CONVERSION_COST;
  const conversionCost = hasDpr ? Math.round(roundedDprWeight * cleanConvRate) : 0;
  const baseManufacturingCost = hasDpr ? roundedDprValue + conversionCost : 0;
  const scrapAmount = hasDpr ? Math.round(baseManufacturingCost * (scrapPercent / 100)) : 0;
  const totalManufacturingCost = hasDpr ? baseManufacturingCost + scrapAmount : 0;

  const cleanSaleRate =
    saleRatePerBox !== null && saleRatePerBox !== undefined && Number(saleRatePerBox) > 0
      ? Number(saleRatePerBox)
      : saleRatePerBox === 0
      ? 0
      : null;

  const totalSaleValue =
    manfBoxQty !== null && cleanSaleRate !== null && cleanSaleRate > 0
      ? Math.round(manfBoxQty * cleanSaleRate)
      : null;

  const paperVariancePL = hasDpr
    ? Math.round(totalAllocatedValue - totalDprValue - totalLessBoxLoss)
    : null;

  const netProfitLoss =
    hasDpr && totalSaleValue !== null
      ? Math.round(totalSaleValue - totalManufacturingCost)
      : null;

  return {
    ...current,
    manfBoxQty,
    saleRatePerBox: cleanSaleRate,
    saleRateSource,
    layers: updatedLayers,
    totalAllocatedWeight,
    totalAllocatedValue,
    totalDprWeight: roundedDprWeight,
    totalDprValue: roundedDprValue,
    scrapPercent,
    baseManufacturingCost,
    scrapAmount,
    conversionRateUsed: cleanConvRate,
    isConversionRateLocked: current.isConversionRateLocked,
    conversionCost,
    totalManufacturingCost,
    totalSaleValue,
    totalLessBoxLoss,
    paperVariancePL,
    netProfitLoss,
    isCompleted: hasDpr && manfBoxQty !== null && cleanSaleRate !== null && cleanSaleRate > 0,
    notes: current.notes || '',
    lastUpdated: new Date().toISOString(),
  };
};

export interface BuildJobCostingOptions {
  finishGoods?: any[];
  products?: any[];
  purchaseOrders?: any[];
  currentStandardConversionRate?: number;
}

/**
 * Builds or refreshes the JobCostingData structure for a given Job Card
 */
export const buildJobCostingData = (
  jobCard: any,
  reelsInventory: any[] = [],
  options: BuildJobCostingOptions = {}
): JobCostingData => {
  const {
    finishGoods = [],
    products = [],
    purchaseOrders = [],
    currentStandardConversionRate = DEFAULT_STANDARD_CONVERSION_COST,
  } = options;

  // Check if previously saved
  const saved = jobCard.costingData || getStoredCostingData(jobCard.id);
  const snapshot = jobCard.productSnapshot || {};
  const orderBoxQty = Number(jobCard.orderQty || jobCard.quantity || 0);

  // Map of reel rates from inventory
  const reelRateMap: Record<string, number> = {};
  reelsInventory.forEach((r: any) => {
    const rate = Number(r.rate || r.purchaseRate || 0);
    if (r.reelNumber) reelRateMap[String(r.reelNumber).trim().toUpperCase()] = rate;
    if (r.id) reelRateMap[String(r.id)] = rate;
  });

  const rawLayers = snapshot.layers || [];
  const ups = Number(snapshot.ups) > 0 ? Number(snapshot.ups) : 1;
  const noOfPaper = Math.ceil(orderBoxQty / ups);
  const snapReelSize = Number(snapshot.reelSize || 0);
  const snapCutSize = Number(snapshot.cutSize || 0);

  const layers: JobCostingLayer[] = rawLayers.map((layer: any, idx: number) => {
    const savedLayer = saved?.layers?.find((l: any) => l.layerIndex === idx);
    const layerName = layer.layerName || `Layer ${idx + 1}`;
    const gsm = Number(layer.gsm || savedLayer?.gsm || 0);
    const bf = layer.bf || savedLayer?.bf || '';
    const paperType = layer.paperType || savedLayer?.paperType || '';
    const isFlute = isFluteLayer(layer, idx);

    let baseWeightWithoutFlute = 0;
    if (snapReelSize > 0 && snapCutSize > 0 && gsm > 0 && noOfPaper > 0) {
      baseWeightWithoutFlute = Math.round(((snapReelSize * snapCutSize * gsm) / 3100 / 500 * noOfPaper) * 100) / 100;
    }

    let reelNumber = '';
    let reelSize = layer.reqSize || snapshot.reelSize || '';
    let allocatedWeight = 0;

    if (layer.allocatedReels && Array.isArray(layer.allocatedReels) && layer.allocatedReels.length > 0) {
      reelNumber = layer.allocatedReels.map((r: any) => r.reelNumber).filter(Boolean).join(', ');
      allocatedWeight = layer.allocatedReels.reduce(
        (sum: number, r: any) => sum + (Number(r.allocatedWeight) || 0),
        0
      );
      const firstAlloc = layer.allocatedReels[0];
      if (firstAlloc?.reelSize) reelSize = firstAlloc.reelSize;
    } else if (layer.allocatedReelNumber) {
      reelNumber = String(layer.allocatedReelNumber);
      allocatedWeight = Number(layer.allocatedReelWeight || layer.requiredWeight || 0);
    } else {
      allocatedWeight = Number(layer.requiredWeight || layer.calculatedWeight || layer.weight || 0);
    }

    let reelRate = savedLayer?.reelRate;
    if (reelRate === undefined || reelRate === null) {
      if (layer.allocatedReels && layer.allocatedReels.length > 0) {
        const firstReelNo = String(layer.allocatedReels[0].reelNumber || '').trim().toUpperCase();
        const firstReelId = String(layer.allocatedReels[0].reelId || '');
        reelRate = reelRateMap[firstReelNo] || reelRateMap[firstReelId] || 0;
      } else if (reelNumber) {
        reelRate = reelRateMap[reelNumber.trim().toUpperCase()] || 0;
      } else {
        reelRate = 0;
      }
    }

    const dprWeight = savedLayer?.dprWeight !== undefined ? savedLayer.dprWeight : null;

    return {
      layerIndex: idx,
      layerName,
      reelSize,
      reelNumber,
      gsm,
      bf,
      paperType,
      isFlute,
      baseWeightWithoutFlute,
      allocatedWeight,
      reelRate,
      allocatedValue: 0,
      dprWeight,
      dprValue: null,
      paperWeightPerBox: 0,
      lessBoxQty: 0,
      lessBoxWeightLoss: 0,
      lessBoxValueLoss: 0,
    };
  });

  // Resolve Sale Rate: Saved Manual Override -> Finish Goods -> Master Data -> Linked/Latest PO
  let resolvedSaleRate: number | null = null;
  let saleRateSource: SaleRateSource = 'NONE';

  if (saved?.saleRatePerBox !== undefined && saved?.saleRatePerBox !== null && Number(saved.saleRatePerBox) > 0) {
    resolvedSaleRate = Number(saved.saleRatePerBox);
    saleRateSource = saved.saleRateSource || 'SAVED_MANUAL';
  } else {
    const autoLookup = lookupAutoSaleRate(jobCard, {
      finishGoods,
      products,
      purchaseOrders,
    });
    resolvedSaleRate = autoLookup.rate;
    saleRateSource = autoLookup.source;
  }

  // Lock rule for Old vs New jobs:
  // 1. If saved job already recorded conversionRateUsed, keep that locked rate.
  // 2. If legacy saved job (already has DPR weights entered pre-feature), keep it at default ₹12/Kg so old jobs don't shift when global rate is modified.
  // 3. Otherwise (pending / new job), use the current active Standard Conversion Rate.
  const hasSavedDpr = Array.isArray(saved?.layers) && saved.layers.some((l: any) => l?.dprWeight !== null && l?.dprWeight !== undefined);
  let conversionRateUsed = currentStandardConversionRate;
  let isConversionRateLocked = false;

  if (saved?.conversionRateUsed !== undefined && saved?.conversionRateUsed !== null) {
    conversionRateUsed = Number(saved.conversionRateUsed);
    isConversionRateLocked = true;
  } else if (hasSavedDpr) {
    conversionRateUsed = DEFAULT_STANDARD_CONVERSION_COST;
    isConversionRateLocked = true;
  }

  const manfBoxQty =
    saved?.manfBoxQty !== undefined && saved?.manfBoxQty !== null
      ? Number(saved.manfBoxQty)
      : null;

  return calculateFullJobCosting(
    {
      jobCardId: jobCard.id,
      jobCardNo: jobCard.jobCardNo || 'N/A',
      jobCardDate:
        jobCard.targetDate || (jobCard.createdAt ? String(jobCard.createdAt).slice(0, 10) : ''),
      jobName: jobCard.productName || snapshot.itemName || 'Unnamed Job',
      productId: jobCard.productId ?? null,
      customerId: jobCard.customerId ?? null,
      customerName: jobCard.customerName ?? snapshot.customerName ?? null,
      poId: jobCard.poId ?? null,
      poNo: jobCard.poNo ?? null,
      orderBoxQty,
      notes: saved?.notes || '',
      isConversionRateLocked,
    },
    manfBoxQty,
    resolvedSaleRate,
    saleRateSource,
    layers,
    conversionRateUsed
  );
};

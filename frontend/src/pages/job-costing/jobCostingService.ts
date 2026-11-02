import type { JobCostingData, JobCostingLayer } from './jobCostingTypes';
import { updateJobCard } from '../../lib/supabase/jobCardService';

const STORAGE_KEY_PREFIX = 'packwell_job_costing_';

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
  // 1. Save to localStorage immediately for instant local persistence
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${jobCardId}`, 
      JSON.stringify(costingData)
    );
  } catch (e) {
    console.error('Error writing costing to localStorage', e);
  }

  // 2. Persist to Supabase in job_cards record
  try {
    await updateJobCard(
      jobCardId, 
      { costingData: costingData }, 
      'System', 
      { log: true, logAction: 'SAVE_JOB_COSTING' }
    );
  } catch (e) {
    console.warn('Could not sync costing to Supabase, local cache retained:', e);
  }
};

/**
 * Builds or refreshes the JobCostingData structure for a given Job Card
 */
export const buildJobCostingData = (
  jobCard: any, 
  reelsInventory: any[] = []
): JobCostingData => {
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
  const layers: JobCostingLayer[] = rawLayers.map((layer: any, idx: number) => {
    const savedLayer = saved?.layers?.find((l: any) => l.layerIndex === idx);
    const layerName = layer.layerName || `Layer ${idx + 1}`;
    
    // Reel details
    let reelNumber = '';
    let reelSize = layer.reqSize || snapshot.reelSize || '';
    let allocatedWeight = 0;

    if (layer.allocatedReels && Array.isArray(layer.allocatedReels) && layer.allocatedReels.length > 0) {
      reelNumber = layer.allocatedReels.map((r: any) => r.reelNumber).filter(Boolean).join(', ');
      allocatedWeight = layer.allocatedReels.reduce((sum: number, r: any) => sum + (Number(r.allocatedWeight) || 0), 0);
      const firstAlloc = layer.allocatedReels[0];
      if (firstAlloc?.reelSize) reelSize = firstAlloc.reelSize;
    } else if (layer.allocatedReelNumber) {
      reelNumber = String(layer.allocatedReelNumber);
      allocatedWeight = Number(layer.allocatedReelWeight || layer.requiredWeight || 0);
    } else {
      allocatedWeight = Number(layer.requiredWeight || layer.calculatedWeight || layer.weight || 0);
    }

    // Determine Reel Rate:
    // 1. From saved layer if manually edited
    // 2. Or from Reel Inventory
    // 3. Fallback to 0
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

    const allocatedValue = Math.round(allocatedWeight * reelRate);
    const paperWeightPerBox = orderBoxQty > 0 ? (allocatedWeight / orderBoxQty) : 0;

    const manfBoxQty = saved?.manfBoxQty !== undefined && saved?.manfBoxQty !== null 
      ? Number(saved.manfBoxQty) 
      : null;

    const lessBoxQty = manfBoxQty !== null ? Math.max(0, orderBoxQty - manfBoxQty) : 0;
    const lessBoxWeightLoss = Math.round(lessBoxQty * paperWeightPerBox * 100) / 100;
    const lessBoxValueLoss = Math.round(lessBoxWeightLoss * reelRate);

    const dprWeight = savedLayer?.dprWeight !== undefined ? savedLayer.dprWeight : null;
    const dprValue = dprWeight !== null ? Math.round(Number(dprWeight) * reelRate) : null;

    return {
      layerIndex: idx,
      layerName,
      reelSize,
      reelNumber,
      allocatedWeight,
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

  const totalAllocatedValue = layers.reduce((acc, l) => acc + (l.allocatedValue || 0), 0);
  
  const hasDpr = layers.some(l => l.dprWeight !== null);
  const totalDprValue = layers.reduce((acc, l) => acc + (l.dprValue || 0), 0);
  const totalLessBoxLoss = layers.reduce((acc, l) => acc + (l.lessBoxValueLoss || 0), 0);

  // Formula as required:
  // P/L = Total Allocated Value - Total DPR Value - Total Less Box Loss
  const netProfitLoss = hasDpr 
    ? Math.round(totalAllocatedValue - totalDprValue - totalLessBoxLoss) 
    : null;

  return {
    jobCardId: jobCard.id,
    jobCardNo: jobCard.jobCardNo || 'N/A',
    jobCardDate: jobCard.targetDate || (jobCard.createdAt ? String(jobCard.createdAt).slice(0, 10) : ''),
    jobName: jobCard.productName || snapshot.itemName || 'Unnamed Job',
    orderBoxQty,
    manfBoxQty: saved?.manfBoxQty ?? null,
    saleRatePerBox: saved?.saleRatePerBox ?? null,
    layers,
    totalAllocatedValue,
    totalDprValue,
    totalLessBoxLoss,
    netProfitLoss,
    isCompleted: hasDpr && saved?.manfBoxQty !== null && saved?.manfBoxQty !== undefined,
    notes: saved?.notes || '',
    lastUpdated: saved?.lastUpdated || new Date().toISOString()
  };
};


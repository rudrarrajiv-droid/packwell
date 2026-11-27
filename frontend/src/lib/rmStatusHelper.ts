import { calculateLayerWeight, isHdpeLayer, calculateHdpeConsumption } from './corrugationUtils';
import { getConcurrentPartnerIndices, getLayerStandDescription } from './corrugatorPairing';

export interface LayerRequirement {
  layerIndex: number;
  layerName: string;
  standDescription: string;
  paperType: string;
  bf: string;
  gsm: number;
  reelSize: number;
  unit: string;
  requiredKg: number;
  availableKg: number;
  shortKg: number;
  isOk: boolean;
  status: 'OK' | 'SHORT' | 'ORDERED' | 'NO_SPEC';
  candidateReels: any[];
}

export interface AlternateDeckleLayerResolution {
  layerIndex: number;
  layerName: string;
  originalReelSize: number;
  selectedReelSize: number;
  originalGsm: number;
  selectedGsm?: number;
  originalBf?: string;
  selectedBf?: string;
  reelNumber?: string;
  allocatedWeight?: number;
  trimLossInch: number;
  trimLossPercent: number;
  note?: string;
}

export interface MillOrderLayerResolution {
  layerIndex: number;
  layerName: string;
  requiredReelSize: number;
  orderReelSize: number;
  requiredGsm: number;
  orderGsm: number;
  requiredBf: string;
  orderBf: string;
  requiredWeight: number;
  orderWeight: number;
}

export interface PORMStatusResult {
  isGreen: boolean;
  statusType: 'IN_STOCK' | 'ALTERNATE_DECKLE' | 'RM_ORDERED' | 'SHORTAGE' | 'NO_SPEC';
  label: string;
  badgeClass: string;
  layers: LayerRequirement[];
  hasShortage: boolean;
  allOk: boolean;
  resolution?: any;
}

export function computePORMStatus(
  po: any,
  product: any,
  reels: any[]
): PORMStatusResult {
  // If no product or orderQty <= 0
  const orderQty = Number(po.orderQty) || 0;
  if (!product || orderQty <= 0 || !product.layers?.length) {
    return {
      isGreen: false,
      statusType: 'NO_SPEC',
      label: '⚠️ No Paper Spec in Master Data',
      badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold',
      layers: [],
      hasShortage: true,
      allOk: false
    };
  }

  const ups = Number(product.ups) > 0 ? Number(product.ups) : 1;
  const reelSize = Number(product.reelSize) || 0;
  const cutSize = Number(product.cutSize) || 0;
  const totalLayers = product.layers.length;

  const virtualReels = (reels || []).map((r: any) => ({
    ...r,
    virtualBalance: Math.max(0, (Number(r.currentBalance) || 0) - (Number(r.activeReservedWeight) || 0))
  }));

  const allocatedReelIdsByLayer: Record<number, Set<string>> = {};

  const layerResults: LayerRequirement[] = product.layers.map((layer: any, idx: number) => {
    const gsm = Number(layer.gsm) || 0;
    const bf = String(layer.bf || '').trim();
    const paperType = (layer.paperType || '').toUpperCase().trim();
    const layerName = layer.layerName || `Layer ${idx + 1}`;
    const standDescription = getLayerStandDescription(idx, totalLayers);

    if (isHdpeLayer(layer)) {
      const requiredMtr = calculateHdpeConsumption(cutSize, ups, orderQty).totalMtr;
      const candidates = virtualReels.filter(r => (r.paperType || '').toUpperCase().trim() === 'HDPE' && r.virtualBalance > 0);
      const totalAvail = candidates.reduce((sum, r) => sum + r.virtualBalance, 0);
      const shortMtr = Math.max(0, requiredMtr - totalAvail);
      return {
        layerIndex: idx,
        layerName,
        standDescription,
        paperType: 'HDPE',
        bf: '-',
        gsm: 90,
        reelSize,
        unit: 'Mtr',
        requiredKg: requiredMtr,
        availableKg: totalAvail,
        shortKg: shortMtr,
        isOk: shortMtr <= 0.1,
        status: shortMtr <= 0.1 ? 'OK' : 'SHORT',
        candidateReels: candidates
      };
    }

    if (!reelSize || !cutSize || !gsm) {
      return {
        layerIndex: idx,
        layerName,
        standDescription,
        paperType,
        bf,
        gsm,
        reelSize,
        unit: 'Kg',
        requiredKg: 0,
        availableKg: 0,
        shortKg: 0,
        isOk: false,
        status: 'NO_SPEC',
        candidateReels: []
      };
    }

    const noOfPaper = Math.ceil(orderQty / ups);
    const requiredKg = calculateLayerWeight(reelSize, cutSize, gsm, noOfPaper, { layerName }, idx);

    // Partner stand restrictions
    const partnerIndices = getConcurrentPartnerIndices(idx, totalLayers);
    const restrictedReelIds = new Set<string>();
    partnerIndices.forEach(pIdx => {
      const pSet = allocatedReelIdsByLayer[pIdx];
      if (pSet) pSet.forEach(id => restrictedReelIds.add(id));
    });

    let candidates = virtualReels.filter((r: any) => {
      if (r.virtualBalance <= 0) return false;
      const rId = r.id || r.firestore_document_id;
      if (restrictedReelIds.has(rId)) return false;

      const rSize = Number(r.reelSize) || 0;
      const rGsm = String(r.gsm || '').trim();
      const rBf = String(r.bf || '').trim();
      const rType = (r.paperType || '').toUpperCase().trim();

      const gsmMatch = rGsm === String(gsm) ||
        (gsm === 220 && rGsm === '230') || (gsm === 230 && rGsm === '220') ||
        (gsm === 100 && rGsm === '120') || (gsm === 120 && rGsm === '100');
      const bfMatch = !bf || rBf === bf;
      const ptMatch = !paperType || rType === paperType;
      const sizeMatch = rSize === reelSize;

      return gsmMatch && bfMatch && ptMatch && sizeMatch;
    });

    const exactAvail = candidates.reduce((sum, r) => sum + r.virtualBalance, 0);
    if (exactAvail < requiredKg) {
      const fallback = virtualReels.filter((r: any) => {
        if (r.virtualBalance <= 0) return false;
        const rId = r.id || r.firestore_document_id;
        if (restrictedReelIds.has(rId)) return false;

        const rSize = Number(r.reelSize) || 0;
        const rGsm = String(r.gsm || '').trim();
        const rBf = String(r.bf || '').trim();
        const rType = (r.paperType || '').toUpperCase().trim();

        const gsmMatch = rGsm === String(gsm) ||
          (gsm === 220 && rGsm === '230') || (gsm === 230 && rGsm === '220') ||
          (gsm === 100 && rGsm === '120') || (gsm === 120 && rGsm === '100');
        const bfMatch = !bf || rBf === bf;
        const ptMatch = !paperType || rType === paperType;
        const sizeMatch = rSize > reelSize && rSize <= reelSize + 1;

        return gsmMatch && bfMatch && ptMatch && sizeMatch;
      });
      if (fallback.length > 0) {
        candidates = [...candidates, ...fallback];
      }
    }

    const availableKg = candidates.reduce((sum, r) => sum + r.virtualBalance, 0);
    const shortKg = Math.max(0, requiredKg - availableKg);

    let remaining = requiredKg;
    allocatedReelIdsByLayer[idx] = new Set<string>();
    for (const cand of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, cand.virtualBalance);
      cand.virtualBalance -= take;
      remaining -= take;
      const rId = cand.id || cand.firestore_document_id;
      if (rId) allocatedReelIdsByLayer[idx].add(rId);
    }

    const isOk = shortKg <= 0.1;
    return {
      layerIndex: idx,
      layerName,
      standDescription,
      paperType,
      bf,
      gsm,
      reelSize,
      unit: 'Kg',
      requiredKg: Math.round(requiredKg * 100) / 100,
      availableKg: Math.round(availableKg * 100) / 100,
      shortKg: Math.round(shortKg * 100) / 100,
      isOk,
      status: isOk ? 'OK' : 'SHORT',
      candidateReels: candidates
    };
  });

  const hasShortage = layerResults.some(l => !l.isOk);
  const allOk = layerResults.length > 0 && !hasShortage;

  // Check if manually resolved via Option 2 (Alternate Deckle), Option 3 (RM Ordered), or Combined
  const resolution = po?.raw_data?.rmResolution || po?.rawData?.rmResolution;
  if (resolution) {
    if (resolution.type === 'COMBINED_RESOLUTION') {
      const resolvedLayers = resolution.layers || [];
      const altCount = resolvedLayers.filter((l: any) => l.resolutionType === 'ALT_DECKLE').length;
      const orderCount = resolvedLayers.filter((l: any) => l.resolutionType === 'MILL_ORDER').length;
      
      let summaryParts = [];
      if (altCount > 0) summaryParts.push(`${altCount} Alt Deckle`);
      if (orderCount > 0) summaryParts.push(`${orderCount} Mill Order`);
      const summaryText = summaryParts.length > 0 ? summaryParts.join(' • ') : 'Resolved';

      return {
        isGreen: true,
        statusType: 'COMBINED_RESOLUTION' as any,
        label: `✅ RM Resolved (${summaryText})`,
        badgeClass: 'bg-emerald-600 text-white font-bold border-emerald-700 shadow-2xs',
        layers: layerResults,
        hasShortage: false,
        allOk: true,
        resolution
      };
    }

    if (resolution.type === 'ALTERNATE_DECKLE') {
      const altLayers: AlternateDeckleLayerResolution[] = resolution.layers || [];
      const changedLayers = altLayers.filter(l => l.selectedReelSize && l.selectedReelSize !== l.originalReelSize);
      
      let altSummary = 'Alt Deckle';
      if (changedLayers.length > 0) {
        const first = changedLayers[0];
        altSummary = `${first.originalReelSize}" ➔ ${first.selectedReelSize}" (+${first.trimLossPercent || 0}% trim)`;
        if (changedLayers.length > 1) {
          altSummary += ` (+${changedLayers.length - 1} layers)`;
        }
      }

      return {
        isGreen: true,
        statusType: 'ALTERNATE_DECKLE',
        label: `✅ Alt Deckle (${altSummary})`,
        badgeClass: 'bg-emerald-600 text-white font-bold border-emerald-700 shadow-2xs',
        layers: layerResults,
        hasShortage: false,
        allOk: true,
        resolution
      };
    }

    if (resolution.type === 'RM_ORDERED') {
      const vendor = resolution.vendorName || 'Paper Mill';
      const arrDate = resolution.expectedDeliveryDate ? resolution.expectedDeliveryDate.split('T')[0] : 'Soon';
      return {
        isGreen: true,
        statusType: 'RM_ORDERED',
        label: `📦 Mill Order (${vendor} • ETA ${arrDate})`,
        badgeClass: 'bg-blue-600 text-white font-bold border-blue-700 shadow-2xs',
        layers: layerResults,
        hasShortage: false,
        allOk: true,
        resolution
      };
    }
  }

  if (allOk) {
    return {
      isGreen: true,
      statusType: 'IN_STOCK',
      label: '✅ All Paper in Stock',
      badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 font-bold',
      layers: layerResults,
      hasShortage: false,
      allOk: true
    };
  }

  return {
    isGreen: false,
    statusType: 'SHORTAGE',
    label: '🔴 Paper Shortage (Click to Resolve)',
    badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40 font-black animate-pulse',
    layers: layerResults,
    hasShortage: true,
    allOk: false
  };
}

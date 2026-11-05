import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProducts } from '../../lib/supabase/productService';
import { getReels } from '../../lib/supabase/reelService';
import { calculateLayerWeight } from '../../lib/corrugationUtils';
import { getConcurrentPartnerIndices, getLayerStandDescription } from '../../lib/corrugatorPairing';
import { PackageSearch, CheckCircle2, AlertTriangle, ShoppingCart, Package2 } from 'lucide-react';

interface Props {
  productId: string;
  orderQty: number;
}

// Normalize paper type: SK, SEMI, SEMI KRAFT → 'SK'; VK, VIRGIN, VIRGIN KRAFT → 'VK'
function normalizePaperType(raw: string): string {
  if (!raw) return '';
  const s = raw.toUpperCase().trim();
  if (s === 'SK' || s === 'SEMI' || s === 'SEMI KRAFT' || s.startsWith('SEMI')) return 'SK';
  if (s === 'VK' || s === 'VIRGIN' || s === 'VIRGIN KRAFT' || s.startsWith('VIRGIN')) return 'VK';
  return s;
}

// Calculate required paper weight for a layer
function calcLayerWeight(
  reelSize: number,
  cutSize: number,
  gsm: number,
  layerName: string,
  qty: number,
  ups: number,
  layerIndex?: number
): number {
  const noOfPaper = Math.ceil(qty / (ups > 0 ? ups : 1));
  return calculateLayerWeight(reelSize, cutSize, gsm, noOfPaper, { layerName }, layerIndex);
}

type LayerStatus = {
  layerName: string;
  standDescription?: string;
  note?: string;
  paperType: string;
  bf: string;
  gsm: number;
  reelSize: number;
  requiredKg: number;
  availableKg: number;
  matchedExact: boolean;
  matchedFallback: boolean; // matched +1 inch
  shortKg: number;
  isOrdered: boolean;
  status: 'OK' | 'SHORT' | 'ORDERED' | 'NO_SPEC';
};

export default function RMStatusPanel({ productId, orderQty }: Props) {
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as unknown as Promise<any[]>,
    staleTime: 60000,
  });

  const { data: reels = [], isLoading: reelsLoading } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>,
    staleTime: 30000,
  });

  const product = useMemo(() => products.find((p: any) => p.id === productId), [products, productId]);

  const layerStatuses: LayerStatus[] = useMemo(() => {
    if (!product || orderQty <= 0 || !product.layers?.length) return [];

    const ups = Number(product.ups) > 0 ? Number(product.ups) : 1;
    const reelSize = Number(product.reelSize) || 0;
    const cutSize = Number(product.cutSize) || 0;
    const totalLayers = product.layers.length;

    // Track virtual available balance sequentially across layers
    const virtualReels = reels.map((r: any) => ({
      ...r,
      virtualBalance: Math.max(0, (Number(r.currentBalance) || 0) - (Number(r.activeReservedWeight) || 0))
    }));

    const allocatedReelIdsByLayer: Record<number, Set<string>> = {};

    return product.layers.map((layer: any, idx: number) => {
      const gsm = Number(layer.gsm) || 0;
      const bf = String(layer.bf || '').trim();
      const paperType = normalizePaperType(layer.paperType || '');
      const layerName = layer.layerName || '';
      const standDescription = getLayerStandDescription(idx, totalLayers);

      // No spec → cannot check
      if (!reelSize || !cutSize || !gsm) {
        return {
          layerName, standDescription, paperType, bf, gsm, reelSize,
          requiredKg: 0, availableKg: 0,
          matchedExact: false, matchedFallback: false,
          shortKg: 0, isOrdered: false, status: 'NO_SPEC' as const,
        };
      }

      const requiredKg = calcLayerWeight(reelSize, cutSize, gsm, layerName, orderQty, ups);

      // Concurrent corrugator stand rule: cannot share reel with paired stand
      const partnerIndices = getConcurrentPartnerIndices(idx, totalLayers);
      const restrictedReelIds = new Set<string>();
      partnerIndices.forEach(pIdx => {
        const partnerSet = allocatedReelIdsByLayer[pIdx];
        if (partnerSet) {
          partnerSet.forEach(id => restrictedReelIds.add(id));
        }
      });

      // Find candidate reels (Exact size first)
      let candidateReels = virtualReels.filter((r: any) => {
        if (r.virtualBalance <= 0) return false;
        const rId = r.id || r.firestore_document_id;
        if (restrictedReelIds.has(rId)) return false;

        const rSize = Number(r.reelSize) || 0;
        const rGsm = String(r.gsm || '').trim();
        const rBf = String(r.bf || '').trim();
        const rPaperType = normalizePaperType(r.paperType || '');

        const gsmMatch = rGsm === String(gsm) || 
          (gsm === 220 && rGsm === '230') || (gsm === 230 && rGsm === '220') ||
          (gsm === 100 && rGsm === '120') || (gsm === 120 && rGsm === '100');
        const bfMatch = !bf || rBf === bf;
        const ptMatch = !paperType || rPaperType === paperType;
        const sizeMatch = rSize === reelSize;

        return gsmMatch && bfMatch && ptMatch && sizeMatch;
      });

      let matchedExact = candidateReels.length > 0;
      let matchedFallback = false;

      // Fallback: +1 inch on reel size if not enough exact weight
      const exactAvail = candidateReels.reduce((sum: number, r: any) => sum + r.virtualBalance, 0);
      if (exactAvail < requiredKg) {
        const fallbackCandidates = virtualReels.filter((r: any) => {
          if (r.virtualBalance <= 0) return false;
          const rId = r.id || r.firestore_document_id;
          if (restrictedReelIds.has(rId)) return false;

          const rSize = Number(r.reelSize) || 0;
          const rGsm = String(r.gsm || '').trim();
          const rBf = String(r.bf || '').trim();
          const rPaperType = normalizePaperType(r.paperType || '');

          const gsmMatch = rGsm === String(gsm) || 
            (gsm === 220 && rGsm === '230') || (gsm === 230 && rGsm === '220') ||
            (gsm === 100 && rGsm === '120') || (gsm === 120 && rGsm === '100');
          const bfMatch = !bf || rBf === bf;
          const ptMatch = !paperType || rPaperType === paperType;
          const sizeMatch = rSize > reelSize && rSize <= reelSize + 1;

          return gsmMatch && bfMatch && ptMatch && sizeMatch;
        });

        if (fallbackCandidates.length > 0) {
          candidateReels = [...candidateReels, ...fallbackCandidates];
          matchedFallback = true;
        }
      }

      const availableKg = candidateReels.reduce((sum: number, r: any) => sum + r.virtualBalance, 0);
      const shortKg = Math.max(0, requiredKg - availableKg);

      // Simulate sequential consumption so subsequent layers and paired stands reflect real availability
      let remainingToConsume = requiredKg;
      allocatedReelIdsByLayer[idx] = new Set<string>();

      for (const cand of candidateReels) {
        if (remainingToConsume <= 0) break;
        const take = Math.min(remainingToConsume, cand.virtualBalance);
        cand.virtualBalance -= take;
        remainingToConsume -= take;
        const rId = cand.id || cand.firestore_document_id;
        if (rId) allocatedReelIdsByLayer[idx].add(rId);
      }

      // Check if material is "ordered"
      const isOrdered = candidateReels.some((r: any) => r.isOrdered || r.status === 'ORDERED');

      let status: LayerStatus['status'];
      if (shortKg <= 0.1) status = 'OK';
      else if (isOrdered) status = 'ORDERED';
      else status = 'SHORT';

      return {
        layerName, standDescription, paperType, bf, gsm, reelSize,
        requiredKg, availableKg: Math.round(availableKg * 100) / 100,
        matchedExact, matchedFallback,
        shortKg: Math.round(shortKg * 100) / 100,
        isOrdered, status,
      };
    });
  }, [product, orderQty, reels]);

  if (!productId || orderQty <= 0) return null;

  if (!product) return null;

  if (reelsLoading) {
    return (
      <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
        <PackageSearch className="w-3.5 h-3.5 animate-pulse" />
        Checking reel inventory...
      </div>
    );
  }

  const hasShortage = layerStatuses.some(l => l.status === 'SHORT');
  const allOk = layerStatuses.length > 0 && layerStatuses.every(l => l.status === 'OK');

  return (
    <div className={`mt-2 rounded-lg border text-xs overflow-hidden transition-all ${
      allOk ? 'border-green-300 bg-green-50' :
      hasShortage ? 'border-red-300 bg-red-50' :
      'border-blue-200 bg-blue-50'
    }`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-1.5 font-bold ${
        allOk ? 'bg-green-100 text-green-800' :
        hasShortage ? 'bg-red-100 text-red-800' :
        'bg-blue-100 text-blue-800'
      }`}>
        {allOk ? <CheckCircle2 className="w-3.5 h-3.5" /> :
         hasShortage ? <AlertTriangle className="w-3.5 h-3.5" /> :
         <ShoppingCart className="w-3.5 h-3.5" />}
        RM Status — {allOk ? '✅ All Material Available' : hasShortage ? '⚠️ Material Shortage' : '🔵 Material Ordered'}
      </div>

      {/* Layers */}
      <div className="divide-y divide-border/40">
        {layerStatuses.map((layer, i) => (
          <div key={i} className={`px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 ${
            layer.status === 'OK' ? 'bg-green-50/60' :
            layer.status === 'SHORT' ? 'bg-red-50/70' :
            layer.status === 'ORDERED' ? 'bg-blue-50/70' :
            'bg-gray-50/60'
          }`}>
            <div className="flex items-center gap-1.5 min-w-[170px]">
              <span className="font-bold text-foreground">{layer.layerName}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800 border border-amber-200">
                {layer.standDescription}
              </span>
            </div>
            <span className="text-muted-foreground">
              {layer.paperType && <span className="font-semibold text-foreground">{layer.paperType} </span>}
              {layer.reelSize}"/{layer.gsm}GSM
              {layer.bf && <span>/{layer.bf}BF</span>}
            </span>
            <span>
              <span className="text-muted-foreground">Required: </span>
              <span className="font-bold">{layer.requiredKg} Kg</span>
            </span>
            <span>
              <span className="text-muted-foreground">Available: </span>
              <span className={`font-bold ${layer.availableKg >= layer.requiredKg ? 'text-green-700' : 'text-red-700'}`}>
                {layer.availableKg} Kg
              </span>
            </span>
            {layer.matchedFallback && !layer.matchedExact && (
              <span className="text-orange-600 text-[10px] font-bold">(+1" fallback)</span>
            )}
            {layer.status === 'OK' && (
              <span className="ml-auto flex items-center gap-1 text-green-700 font-bold"><CheckCircle2 className="w-3 h-3" /> OK</span>
            )}
            {layer.status === 'SHORT' && (
              <span className="ml-auto flex items-center gap-1 text-red-700 font-bold">
                <AlertTriangle className="w-3 h-3" /> Short {layer.shortKg} Kg
              </span>
            )}
            {layer.status === 'ORDERED' && (
              <span className="ml-auto flex items-center gap-1 text-blue-700 font-bold">
                <ShoppingCart className="w-3 h-3" /> Ordered
              </span>
            )}
            {layer.status === 'NO_SPEC' && (
              <span className="ml-auto text-gray-500 italic">No spec in master data</span>
            )}
          </div>
        ))}
      </div>

      {layerStatuses.length === 0 && (
        <div className="px-3 py-2 text-muted-foreground flex items-center gap-2">
          <Package2 className="w-3.5 h-3.5" />
          No layers found in Master Data for this product.
        </div>
      )}
    </div>
  );
}

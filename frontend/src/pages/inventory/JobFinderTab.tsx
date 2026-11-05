import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProducts } from '../../lib/supabase/productService';
import { calculateLayerWeight, getEffectiveGsm } from '../../lib/corrugationUtils';
import { getReels } from '../../lib/supabase/reelService';
import { Search, CheckCircle2, AlertTriangle, Package2, Layers, Weight, Calculator } from 'lucide-react';
import { cn } from '../../lib/utils';

// Normalize paper type same as RMStatusPanel
function normalizePaperType(raw: string): string {
  if (!raw) return '';
  const s = raw.toUpperCase().trim();
  if (s === 'SK' || s === 'SEMI' || s === 'SEMI KRAFT' || s.startsWith('SEMI')) return 'SK';
  if (s === 'VK' || s === 'VIRGIN' || s === 'VIRGIN KRAFT' || s.startsWith('VIRGIN')) return 'VK';
  return s;
}

function calcLayerWeight(reelSize: number, cutSize: number, gsm: number, layerName: string, qty: number, ups: number, layerIndex?: number): number {
  const noOfPaper = Math.ceil(qty / (ups > 0 ? ups : 1));
  return calculateLayerWeight(reelSize, cutSize, gsm, noOfPaper, { layerName }, layerIndex);
}

export default function JobFinderTab() {
  // Search filters
  const [filterPaperType, setFilterPaperType] = useState('');
  const [filterReelSize, setFilterReelSize] = useState('');
  const [filterBf, setFilterBf] = useState('');
  const [filterGsm, setFilterGsm] = useState('');

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as unknown as Promise<any[]>,
    staleTime: 60000,
  });

  const { data: reels = [], isLoading: loadingReels } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>,
    staleTime: 30000,
  });

  // Available filter options derived from live reels (so user sees only what's in stock)
  const uniqueReelSizes = useMemo(() =>
    [...new Set(reels.map((r: any) => String(r.reelSize)).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  , [reels]);

  const uniqueBfs = useMemo(() =>
    [...new Set(reels.map((r: any) => String(r.bf || '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  , [reels]);

  const uniqueGsms = useMemo(() =>
    [...new Set(reels.map((r: any) => String(r.gsm || '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  , [reels]);

  // Compute matched stock weight from reel inventory for given filter
  const stockInfo = useMemo(() => {
    if (!filterReelSize && !filterGsm && !filterPaperType && !filterBf) return null;

    const matchedReels = reels.filter((r: any) => {
      const rSize = String(r.reelSize || '');
      const rGsm = String(r.gsm || '');
      const rBf = String(r.bf || '');
      const rPaperType = normalizePaperType(r.paperType || '');

      if (filterReelSize && rSize !== filterReelSize) return false;
      if (filterGsm && rGsm !== filterGsm) return false;
      if (filterBf && rBf !== filterBf) return false;
      if (filterPaperType && rPaperType !== normalizePaperType(filterPaperType)) return false;
      return true;
    });

    const totalKg = matchedReels.reduce((sum: number, r: any) => sum + Math.max(0, (Number(r.currentBalance) || 0) - (Number(r.activeReservedWeight) || 0)), 0);
    const totalReels = matchedReels.length;

    return { totalKg: Math.round(totalKg * 100) / 100, totalReels };
  }, [reels, filterReelSize, filterGsm, filterBf, filterPaperType]);

  // Find matching jobs from master data
  const matchedJobs = useMemo(() => {
    if (!filterReelSize && !filterGsm && !filterPaperType && !filterBf) return [];

    const results: {
      product: any;
      matchedLayer: any;
      layerIndex: number;
      availableKg: number;
      maxBoxes: number;
    }[] = [];

    products.forEach((product: any) => {
      if (!product.layers?.length) return;

      product.layers.forEach((layer: any, layerIndex: number) => {
        const lReelSize = String(Number(product.reelSize) || '');
        const lGsm = String(layer.gsm || '');
        const lBf = String(layer.bf || '');
        const lPaperType = normalizePaperType(layer.paperType || '');

        let matches = true;
        if (filterReelSize && lReelSize !== filterReelSize) matches = false;
        if (filterGsm && lGsm !== filterGsm) matches = false;
        if (filterBf && lBf !== filterBf) matches = false;
        if (filterPaperType && lPaperType !== normalizePaperType(filterPaperType)) matches = false;

        if (!matches) return;

        // Compute available stock for this layer's exact spec
        const matchedReels = reels.filter((r: any) => {
          const rSize = String(r.reelSize || '');
          const rGsm = String(r.gsm || '');
          const rBf = String(r.bf || '');
          const rPaperType = normalizePaperType(r.paperType || '');

          const sizeMatch = !filterReelSize || rSize === lReelSize;
          const gsmMatch = !lGsm || rGsm === lGsm;
          const bfMatch = !lBf || rBf === lBf;
          const ptMatch = !lPaperType || rPaperType === lPaperType;

          const availableWeight = Math.max(0, (Number(r.currentBalance) || 0) - (Number(r.activeReservedWeight) || 0));
          return sizeMatch && gsmMatch && bfMatch && ptMatch && availableWeight > 0;
        });

        const availableKg = matchedReels.reduce((sum: number, r: any) => sum + Math.max(0, (Number(r.currentBalance) || 0) - (Number(r.activeReservedWeight) || 0)), 0);

        // Calculate how many boxes can be made from this available stock for this layer
        const gsm = Number(layer.gsm) || 0;
        const reelSize = Number(product.reelSize) || 0;
        const cutSize = Number(product.cutSize) || 0;
        const ups = Number(product.ups) > 0 ? Number(product.ups) : 1;

        let maxBoxes = 0;
        if (gsm > 0 && reelSize > 0 && cutSize > 0 && availableKg > 0) {
          const effGsm = getEffectiveGsm(gsm, layer, layerIndex);
          // weight per box = (reelSize * cutSize * effGsm) / 3100 / 500 / ups
          const weightPerBox = (reelSize * cutSize * effGsm) / 3100 / 500 / ups;
          maxBoxes = weightPerBox > 0 ? Math.floor(availableKg / weightPerBox) : 0;
        }

        results.push({ product, matchedLayer: layer, layerIndex, availableKg: Math.round(availableKg * 100) / 100, maxBoxes });
      });
    });

    // Deduplicate: if same product appears multiple times (different layers matched), keep highest maxBoxes match
    const deduped = new Map<string, typeof results[0]>();
    results.forEach(r => {
      const existing = deduped.get(r.product.id);
      if (!existing || r.availableKg > existing.availableKg) {
        deduped.set(r.product.id, r);
      }
    });

    return [...deduped.values()].sort((a, b) => b.availableKg - a.availableKg);
  }, [products, reels, filterReelSize, filterGsm, filterBf, filterPaperType]);

  const hasFilter = filterPaperType || filterReelSize || filterBf || filterGsm;

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
        <h2 className="text-base font-bold text-indigo-900 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Job Finder — Reel Size se Job Dhundhein
        </h2>
        <p className="text-sm text-indigo-700 mt-1">
          Paper type, reel size, BF ya GSM select karein — system Master Data se matching jobs dhundhega
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-card border border-border rounded-xl p-4">
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Paper Type</label>
          <select
            value={filterPaperType}
            onChange={e => setFilterPaperType(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="SK">SK (Semi Kraft)</option>
            <option value="VK">VK (Virgin Kraft)</option>
            <option value="DUPLEX">DUPLEX</option>
            <option value="HWC">HWC</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Reel Size (inch)</label>
          <select
            value={filterReelSize}
            onChange={e => setFilterReelSize(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
          >
            <option value="">All Sizes</option>
            {uniqueReelSizes.map(s => <option key={s} value={s}>{s}"</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">BF</label>
          <select
            value={filterBf}
            onChange={e => setFilterBf(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
          >
            <option value="">All BF</option>
            {uniqueBfs.map(b => <option key={b} value={b}>{b} BF</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">GSM</label>
          <select
            value={filterGsm}
            onChange={e => setFilterGsm(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-primary/20 focus:outline-none"
          >
            <option value="">All GSM</option>
            {uniqueGsms.map(g => <option key={g} value={g}>{g} GSM</option>)}
          </select>
        </div>
      </div>

      {/* Stock Summary for Selected Filter */}
      {hasFilter && stockInfo && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Package2 className="w-4 h-4 text-blue-700" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Matching Reels in Stock</p>
              <p className="text-xl font-black text-blue-900">{stockInfo.totalReels} Reels</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Weight className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Available Weight</p>
              <p className="text-xl font-black text-emerald-900">{stockInfo.totalKg} Kg</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!hasFilter && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold">Koi filter select karein</p>
          <p className="text-sm mt-1">Paper Type, Reel Size, BF ya GSM select karein — matching jobs neeche dikhengi</p>
        </div>
      )}

      {hasFilter && (loadingProducts || loadingReels) && (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p>Searching Master Data...</p>
        </div>
      )}

      {hasFilter && !loadingProducts && !loadingReels && matchedJobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          <Package2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold">Koi job match nahi mili</p>
          <p className="text-sm mt-1">Is reel spec ke liye Master Data mein koi product registered nahi hai</p>
        </div>
      )}

      {hasFilter && matchedJobs.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-secondary/30 px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              {matchedJobs.length} Matching Job{matchedJobs.length > 1 ? 's' : ''} Found
            </span>
            <span className="text-xs text-muted-foreground">Available stock ke hisaab se sort kiya gaya hai</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] uppercase font-bold text-muted-foreground bg-secondary/20 tracking-wider">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Artwork No.</th>
                  <th className="px-4 py-2">Item Name</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Size (L×W×H)</th>
                  <th className="px-4 py-2">Matched Layer</th>
                  <th className="px-4 py-2">Spec</th>
                  <th className="px-4 py-2 text-right">Available Kg</th>
                  <th className="px-4 py-2 text-right">Max Boxes (est.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matchedJobs.map(({ product, matchedLayer, availableKg, maxBoxes }, i) => (
                  <tr key={product.id} className={cn(
                    "transition-colors hover:bg-muted/30",
                    availableKg > 0 ? "" : "opacity-50"
                  )}>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-primary">{product.artworkNo || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-foreground max-w-[180px] truncate" title={product.itemName}>
                      {product.itemName || product.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[120px] truncate" title={product.customerName}>
                      {product.customerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {product.length}×{product.width}×{product.height}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                        {matchedLayer.layerName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{normalizePaperType(matchedLayer.paperType || '')}</span>
                      {' '}{product.reelSize}"{' '}
                      {matchedLayer.gsm && `${matchedLayer.gsm}GSM`}
                      {matchedLayer.bf && ` / ${matchedLayer.bf}BF`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "font-bold",
                        availableKg > 0 ? "text-emerald-700" : "text-red-500"
                      )}>
                        {availableKg} Kg
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {maxBoxes > 0 ? (
                        <span className="font-black text-foreground flex items-center justify-end gap-1">
                          <Calculator className="w-3 h-3 text-muted-foreground" />
                          ~{maxBoxes.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

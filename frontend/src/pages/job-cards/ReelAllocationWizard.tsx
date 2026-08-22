import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReels } from '../../lib/supabase/reelService';
import { Zap, CircleDashed, CheckCircle2, AlertTriangle, Search, X, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isJobCardAllocationComplete } from '../JobCards';

interface ReelAllocationWizardProps {
  jobCard: any;
  onBack: () => void;
  onConfirm: (layers: any[], requiresApproval?: boolean, approvalReason?: string) => void;
  isAdmin: boolean;
  onSkip?: () => void;
}

const parseReelDate = (reelNo: string | number) => {
  const str = String(reelNo);
  if (str.length < 5) return Infinity; 
  const yy = parseInt(str.slice(-4, -2), 10);
  const mm = parseInt(str.slice(0, -4), 10);
  return yy * 12 + mm;
};

export default function ReelAllocationWizard({ jobCard, onBack, onConfirm, isAdmin, onSkip }: ReelAllocationWizardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allocations, setAllocations] = useState<any[]>([]);
  
  // State for Manual Match modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualLayerIndex, setManualLayerIndex] = useState<number | null>(null);
  const [manualSearch, setManualSearch] = useState({
    paperType: '',
    reelSize: '',
    bf: '',
    gsm: '',
    reelNumber: ''
  });

  // Phase 3: Oversize Approval State
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');

  const { data: rawReels = [], isLoading: loadingReels } = useQuery({
    queryKey: ['reels-available'],
    queryFn: async () => {
      const data = await getReels() as any[];
      return data.filter(r => r.currentBalance > 0 && r.status !== 'INACTIVE');
    },
  });

  // Refund this specific Job Card's old reservations so the UI doesn't double-penalize it
  const selfReservedWeights = useMemo(() => {
    const reserved: Record<string, number> = {};
    // Only PENDING job cards hold active reservations in the backend
    if (jobCard && jobCard.status === 'PENDING' && jobCard.productSnapshot?.layers) {
      jobCard.productSnapshot.layers.forEach((layer: any) => {
        if (layer.allocatedReels && Array.isArray(layer.allocatedReels)) {
          layer.allocatedReels.forEach((allocReel: any) => {
            if (allocReel.reelId) {
              reserved[allocReel.reelId] = (reserved[allocReel.reelId] || 0) + (Number(allocReel.allocatedWeight) || 0);
            }
          });
        }
      });
    }
    return reserved;
  }, [jobCard]);

  const layerRequirements = useMemo(() => {
    if (!jobCard?.productSnapshot) return [];
    
    const snapshot = jobCard.productSnapshot;
    const orderQty = jobCard.orderQty || 0;
    const ups = snapshot.ups > 0 ? snapshot.ups : 1;
    const noOfPaper = Math.ceil(orderQty / ups);

    return (snapshot.layers || []).map((layer: any, idx: number) => {
      let gsm = Number(layer.gsm) || 0;
      let reqWeight = 0;
      if (gsm > 0 && snapshot.reelSize > 0 && snapshot.cutSize > 0) {
        let eff_gsm = gsm;
        const lName = (layer.layerName || '').toLowerCase().trim();
        if (lName.includes('flute') || ['p2', 'p4', 'p6'].includes(lName)) {
          eff_gsm = gsm * 1.4;
        }
        reqWeight = (snapshot.reelSize * snapshot.cutSize * eff_gsm) / 3100 / 500 * noOfPaper;
        reqWeight = Math.round(reqWeight * 100) / 100;
      }
      return {
        ...layer,
        originalIndex: idx,
        requiredWeight: reqWeight,
        reqSize: snapshot.reelSize
      };
    }).filter((l: any) => l.requiredWeight > 0);
  }, [jobCard]);

  useEffect(() => {
    if (loadingReels || rawReels.length === 0 || allocations.length > 0) return;

    let virtualReels = rawReels.map(r => {
      // Calculate true available weight: Current Balance - Reserved (by other JCs) + Reserved (by THIS JC)
      const availableAllocationWeight = Math.max(0, (r.currentBalance || 0) - (r.activeReservedWeight || 0) + (selfReservedWeights[r.id] || 0));
      return { ...r, availableAllocationWeight, virtualBalance: availableAllocationWeight };
    }).filter(r => r.availableAllocationWeight > 0);

    let initialAllocations: any[] = [];
    // Phase 2: Max auto-allocation offset is +1.0 inch
    const offsets = [0, 0.5, 1.0];

    layerRequirements.forEach((layer: any) => {
      let remainingWeight = layer.requiredWeight;
      let layerReels: any[] = [];
      
      const reqSize = Number(layer.reqSize);
      const reqBF = Number(layer.bf);
      const reqGSM = Number(layer.gsm);
      const reqType = (layer.paperType || '').toLowerCase();

      // Define match passes: First Exact, then Replacements
      let matchPasses = [{ bf: reqBF, gsm: reqGSM }];
      if (reqBF === 16 && reqGSM === 100) matchPasses.push({ bf: 18, gsm: 120 });
      else if (reqBF === 18 && reqGSM === 120) matchPasses.push({ bf: 16, gsm: 100 });
      else if (reqBF === 25 && reqGSM === 230) matchPasses.push({ bf: 28, gsm: 220 });
      else if (reqBF === 28 && reqGSM === 220) matchPasses.push({ bf: 25, gsm: 230 });
      else if (reqBF === 20) { matchPasses.push({ bf: 18, gsm: reqGSM }); matchPasses.push({ bf: 22, gsm: reqGSM }); }
      else if (reqBF === 22) { matchPasses.push({ bf: 20, gsm: reqGSM }); matchPasses.push({ bf: 25, gsm: reqGSM }); }

      for (const pass of matchPasses) {
        if (remainingWeight <= 0.1) break;

        for (const offset of offsets) {
          if (remainingWeight <= 0.1) break; 
          const targetSize = reqSize + offset;

          let candidates = virtualReels.filter(r => {
            if (r.virtualBalance <= 0) return false;
            if ((r.paperType || '').toLowerCase() !== reqType) return false;
            if (Number(r.bf) !== pass.bf) return false;
            // GSM Interchangeability (220 & 230 are identical)
            const rGSM = Number(r.gsm);
            if (rGSM !== pass.gsm) {
               if (!((pass.gsm === 220 && rGSM === 230) || (pass.gsm === 230 && rGSM === 220))) {
                 return false;
               }
            }
            if (Number(r.reelSize) !== targetSize) return false;
            return true;
          });

        candidates.sort((a, b) => {
          const ageA = parseReelDate(a.reelNumber);
          const ageB = parseReelDate(b.reelNumber);
          if (ageA !== ageB) return ageA - ageB;
          return a.virtualBalance - b.virtualBalance; 
        });

        for (const candidate of candidates) {
          if (remainingWeight <= 0.1) break;
          const allocWeight = Math.min(remainingWeight, candidate.virtualBalance);
          
          layerReels.push({
            reelId: candidate.id,
            reelNumber: candidate.reelNumber,
            allocatedWeight: allocWeight,
            matchScore: 100, 
            isAuto: true,
            reelSize: candidate.reelSize,
            sizeExcess: offset,
            bf: candidate.bf,
            gsm: candidate.gsm,
            actualReelWeight: candidate.currentBalance
          });
          
          remainingWeight -= allocWeight;
          // As per requirement, completely freeze reel for other layers once selected
          candidate.virtualBalance = 0; 
        }
      }
      }

      initialAllocations.push({
        layerIndex: layer.originalIndex,
        reels: layerReels,
        isComplete: remainingWeight <= 0.1
      });
    });

    setAllocations(initialAllocations);
  }, [loadingReels, rawReels, layerRequirements, selfReservedWeights]);

  const isFullyAllocated = allocations.length > 0 && layerRequirements.every((req: any) => {
    const alloc = allocations.find(a => a.layerIndex === req.originalIndex);
    if (!alloc) return false;
    const totalAlloc = alloc.reels.reduce((sum: number, r: any) => sum + r.allocatedWeight, 0);
    return totalAlloc >= (req.requiredWeight - 0.1);
  });

  // Approval rule: chahe auto ho ya manual — agar sizeExcess > 1.0 inch hai tabhi approval chahiye.
  // 1 inch tak (0, 0.5, 1.0) — no approval needed.
  const hasOversizeReel = useMemo(() => {
    return allocations.some(alloc =>
      alloc.reels.some((r: any) => (r.sizeExcess ?? 0) > 1.0)
    );
  }, [allocations]);

  const handleConfirm = () => {
    const updatedLayers = (jobCard.productSnapshot.layers || []).map((layer: any, idx: number) => {
      const alloc = allocations.find(a => a.layerIndex === idx);
      const req = layerRequirements.find((r: any) => r.originalIndex === idx);
      
      if (alloc) {
        return {
          ...layer,
          requiredWeight: req ? req.requiredWeight : layer.requiredWeight,
          allocatedReels: alloc.reels
        };
      }
      return {
        ...layer,
        requiredWeight: req ? req.requiredWeight : layer.requiredWeight,
        allocatedReels: []
      };
    });

    // Phase 3: If oversize reels selected and NOT admin, require approval
    if (hasOversizeReel && !isAdmin) {
      setShowApprovalModal(true);
      return;
    }

    // If admin, can proceed directly even with oversize
    setIsSubmitting(true);
    onConfirm(updatedLayers, false, undefined);
  };

  const handleApprovalSubmit = () => {
    if (!approvalReason.trim() || approvalReason.trim().length < 10) {
      alert('Kripya valid reason dein (minimum 10 characters).');
      return;
    }
    const updatedLayers = (jobCard.productSnapshot.layers || []).map((layer: any, idx: number) => {
      const alloc = allocations.find(a => a.layerIndex === idx);
      const req = layerRequirements.find((r: any) => r.originalIndex === idx);
      
      if (alloc) {
        return {
          ...layer,
          requiredWeight: req ? req.requiredWeight : layer.requiredWeight,
          allocatedReels: alloc.reels
        };
      }
      return {
        ...layer,
        requiredWeight: req ? req.requiredWeight : layer.requiredWeight,
        allocatedReels: []
      };
    });
    setIsSubmitting(true);
    setShowApprovalModal(false);
    onConfirm(updatedLayers, true, approvalReason.trim());
  };

  const openManualMatch = (layerIndex: number) => {
    setManualLayerIndex(layerIndex);
    setShowManualModal(true);
  };

  const removeAllocation = (layerIndex: number, reelId: string) => {
    setAllocations(prev => prev.map(alloc => {
      if (alloc.layerIndex !== layerIndex) return alloc;
      return {
        ...alloc,
        reels: alloc.reels.filter((r: any) => r.reelId !== reelId)
      };
    }));
  };

  const updateAllocationWeight = (layerIndex: number, reelId: string, newWeight: number) => {
    // 1. Get the raw reel to check max capacity
    const rawReel = rawReels.find(r => r.id === reelId);
    if (!rawReel) return;

    // Calculate true available weight for the reel
    const maxAvailable = Math.max(0, (rawReel.currentBalance || 0) - (rawReel.activeReservedWeight || 0) + (selfReservedWeights[rawReel.id] || 0));

    if (newWeight > maxAvailable) {
      alert("Invalid Allocation\n\nAllocated weight exceeds available reel weight.\nPlease reduce allocation or select another reel.");
      newWeight = maxAvailable;
    }

    setAllocations(prev => prev.map(alloc => {
      if (alloc.layerIndex !== layerIndex) return alloc;
      return {
        ...alloc,
        reels: alloc.reels.map((r: any) => {
          if (r.reelId === reelId) {
            return { ...r, allocatedWeight: Math.max(0, newWeight) };
          }
          return r;
        })
      };
    }));
  };

  const addManualAllocation = (reel: any) => {
    if (manualLayerIndex === null) return;
    
    const reqLayer = layerRequirements.find((l: any) => l.originalIndex === manualLayerIndex);
    if (!reqLayer) return;

    const currentAlloc = allocations.find(a => a.layerIndex === manualLayerIndex);
    const totalAllocated = currentAlloc ? currentAlloc.reels.reduce((sum: number, r: any) => sum + r.allocatedWeight, 0) : 0;
    const remainingWeight = Math.max(0, reqLayer.requiredWeight - totalAllocated);
    
    if (remainingWeight <= 0) {
      alert("Layer is already fully allocated.");
      return;
    }

    let usedInUI = 0;
    allocations.forEach(a => {
      a.reels.forEach((r: any) => {
        if (r.reelId === reel.id) usedInUI += r.allocatedWeight;
      });
    });

    // Use the already-computed available weight from manualReelsList (which correctly handles strict freezing)
    // reel.availableAllocationWeight = reel.currentBalance (if visible, it's fully available — strict freeze means it's either 100% ours or hidden)
    const actualAvailable = Math.max(0, reel.availableAllocationWeight ?? reel.currentBalance);

    if (actualAvailable <= 0) {
      alert("This reel has no available weight left.");
      return;
    }

    const allocWeight = Math.min(remainingWeight, actualAvailable);
    const sizeExcess = Math.max(0, Number(reel.reelSize) - Number(reqLayer.reqSize));

    setAllocations(prev => prev.map(alloc => {
      if (alloc.layerIndex !== manualLayerIndex) return alloc;
      return {
        ...alloc,
        reels: [...alloc.reels, {
          reelId: reel.id,
          reelNumber: reel.reelNumber,
          allocatedWeight: allocWeight,
          matchScore: reel.matchScore,
          isAuto: false,
          reelSize: reel.reelSize,
          sizeExcess: sizeExcess,
          bf: reel.bf,
          gsm: reel.gsm,
          actualReelWeight: reel.currentBalance
        }]
      };
    }));

    if (remainingWeight - allocWeight <= 0.1) {
      setShowManualModal(false);
    }

    // Clear search for next time
    setManualSearch({ paperType: '', reelSize: '', bf: '', gsm: '', reelNumber: '' });
  };

  const manualReelsList = useMemo(() => {
    if (manualLayerIndex === null) return [];
    
    const reqLayer = layerRequirements.find((l: any) => l.originalIndex === manualLayerIndex);
    if (!reqLayer) return [];

    const reqType = (reqLayer.paperType || '').toLowerCase();
    const reqSize = Number(reqLayer.reqSize);
    const reqBF = Number(reqLayer.bf);
    const reqGSM = Number(reqLayer.gsm);

    const uiReserved: Record<string, number> = {};
    allocations.forEach(a => {
      a.reels.forEach((r: any) => {
        uiReserved[r.reelId] = (uiReserved[r.reelId] || 0) + r.allocatedWeight;
      });
    });

    let results = rawReels
      .map(r => {
        const avail = Math.max(0, (r.currentBalance || 0) - (r.activeReservedWeight || 0) + (selfReservedWeights[r.id] || 0));
        return { ...r, availableAllocationWeight: avail };
      })
      .filter(r => {
         // 1. If already selected by ANY layer in the current UI, hide it completely (Strict Freezing)
         if (uiReserved[r.id] && uiReserved[r.id] > 0) return false;

         // 2. Hide zero balance reels from manual search unless explicitly searching by reel number
         if (manualSearch.reelNumber && String(r.reelNumber).toLowerCase().includes(manualSearch.reelNumber.toLowerCase())) return true;
         return r.availableAllocationWeight > 0;
      })
      .map(r => {
      const avail = r.availableAllocationWeight;
      
      const reelSize = Number(r.reelSize);
      const reelBF = Number(r.bf);
      const reelGSM = Number(r.gsm);
      
      const sizeDiff = reelSize >= reqSize ? reelSize - reqSize : Infinity;
      const bfDiff = Math.abs(reelBF - reqBF);
      let gsmDiff = Math.abs(reelGSM - reqGSM);
      // GSM Interchangeability
      if ((reqGSM === 220 && reelGSM === 230) || (reqGSM === 230 && reelGSM === 220)) {
        gsmDiff = 0;
      }
      const isTypeMatch = (r.paperType || '').toLowerCase() === reqType;
      
      let matchScore = 100;
      if (!isTypeMatch) matchScore -= 80;
      matchScore -= (sizeDiff * 10);
      matchScore -= (bfDiff * 2);
      matchScore -= (gsmDiff * 0.5);
      matchScore = Math.max(0, Math.round(matchScore));

      let matchType = 'Poor Match';
      let matchColor = 'bg-red-100 text-red-800';
      if (isTypeMatch && sizeDiff === 0 && bfDiff === 0 && gsmDiff === 0) {
        matchType = 'Exact Match';
        matchColor = 'bg-green-100 text-green-800';
      } else if (isTypeMatch && sizeDiff <= 0.5 && bfDiff <= 2 && gsmDiff <= 20) {
        matchType = 'Very Good Match';
        matchColor = 'bg-blue-100 text-blue-800';
      } else if (isTypeMatch && sizeDiff <= 1.0 && bfDiff <= 4 && gsmDiff <= 40) {
        matchType = 'Acceptable Match';
        matchColor = 'bg-orange-100 text-orange-800';
      }

      return { 
        ...r, 
        availableAllocationWeight: avail,
        sizeDiff,
        bfDiff,
        gsmDiff,
        matchScore,
        matchType,
        matchColor
      };
    }).filter(r => r.availableAllocationWeight > 0 && r.sizeDiff !== Infinity);

    // Apply Live Filters (partial matching)
    if (manualSearch.reelNumber) {
      results = results.filter(r => String(r.reelNumber).toLowerCase().includes(manualSearch.reelNumber.toLowerCase()));
    }
    if (manualSearch.paperType) {
      results = results.filter(r => String(r.paperType).toLowerCase().includes(manualSearch.paperType.toLowerCase()));
    }
    if (manualSearch.reelSize) {
      results = results.filter(r => String(r.reelSize).startsWith(manualSearch.reelSize));
    }
    if (manualSearch.bf) {
      results = results.filter(r => String(r.bf).includes(manualSearch.bf));
    }
    if (manualSearch.gsm) {
      results = results.filter(r => String(r.gsm).includes(manualSearch.gsm));
    }

    // Sort by: Nearest Size -> Nearest BF -> Nearest GSM -> Highest Match %
    results.sort((a, b) => {
      if (a.sizeDiff !== b.sizeDiff) return a.sizeDiff - b.sizeDiff;
      if (a.bfDiff !== b.bfDiff) return a.bfDiff - b.bfDiff;
      if (a.gsmDiff !== b.gsmDiff) return a.gsmDiff - b.gsmDiff;
      return b.matchScore - a.matchScore;
    });

    return results;
  }, [rawReels, selfReservedWeights, allocations, manualLayerIndex, manualSearch, layerRequirements]);

  const isLoading = loadingReels;

  // Pre-compute manual search modal weights
  const manualReqLayer = manualLayerIndex !== null ? layerRequirements.find((l:any) => l.originalIndex === manualLayerIndex) : null;
  const manualCurrentAlloc = manualLayerIndex !== null ? allocations.find(a => a.layerIndex === manualLayerIndex) : null;
  const manualTotalAlloc = manualCurrentAlloc ? manualCurrentAlloc.reels.reduce((sum: number, r: any) => sum + (Number(r.allocatedWeight) || 0), 0) : 0;
  const manualReqWt = manualReqLayer ? (Number(manualReqLayer.requiredWeight) || 0) : 0;
  const manualBalWt = Math.max(0, manualReqWt - manualTotalAlloc);

  return (
    <>
    <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-auto overflow-hidden relative">
      <div className="flex items-center justify-between p-5 border-b border-border shrink-0 bg-blue-900 text-white">
        <div>
          <h2 className="text-xl font-bold flex items-center">
            <Zap className="w-5 h-5 mr-2 text-yellow-400 fill-current" />
            Reel Allocation Engine
          </h2>
          <p className="text-sm text-blue-200 mt-1">Review allocations and manually fulfill any short weights</p>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1 bg-muted/10 relative">
        {isLoading || allocations.length === 0 ? (
          <div className="text-center p-8 flex flex-col items-center justify-center text-muted-foreground">
            <CircleDashed className="w-8 h-8 animate-spin mb-4" />
            <p>Fetching active Job Cards & calculating progressive matches...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {layerRequirements.map((layer: any) => {
              const alloc = allocations.find(a => a.layerIndex === layer.originalIndex);
              const totalAllocated = alloc ? alloc.reels.reduce((sum: number, r: any) => sum + r.allocatedWeight, 0) : 0;
              const remaining = Math.max(0, layer.requiredWeight - totalAllocated);
              const isComplete = remaining <= 0.1;

              return (
                <div key={layer.originalIndex} className={cn("p-4 rounded-lg border shadow-sm bg-white", isComplete ? "border-green-300" : "border-red-300")}>
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-bold text-lg">{layer.layerName} Requirements</h3>
                      <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                        {layer.paperType} | Size: {layer.reqSize}" | BF: {layer.bf} | GSM: {layer.gsm}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Required Weight</p>
                      <p className="text-2xl font-black text-primary">{layer.requiredWeight} Kg</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between bg-gray-50 border rounded-md px-3 py-2 text-sm font-semibold mb-2">
                      <div className="w-1/4">Reel Number</div>
                      <div className="w-1/4">Size / BF / GSM</div>
                      <div className="w-1/4">Status</div>
                      <div className="w-1/4 text-right">Weight</div>
                    </div>
                    
                    {alloc && alloc.reels.length > 0 ? (
                      <div className="space-y-2">
                        {alloc.reels.map((r: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded border border-gray-100 hover:bg-gray-50 transition-colors">
                            <div className="w-1/4 font-bold text-gray-900">{r.reelNumber}</div>
                            <div className="w-1/4 text-sm text-gray-600">
                              {r.reelSize}" / {r.bf} / {r.gsm}
                              {r.sizeExcess > 0 && (
                                <span className="ml-2 text-red-600 font-bold bg-red-100 px-1 py-0.5 rounded text-[10px]">
                                  +{r.sizeExcess}" EXCESS
                                </span>
                              )}
                            </div>
                            <div className="w-1/4 flex gap-2 items-center">
                              {r.isAuto ? (
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold uppercase">Auto</span>
                              ) : (
                                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-1 rounded font-bold uppercase">Manual</span>
                              )}
                              <button 
                                onClick={() => removeAllocation(layer.originalIndex, r.reelId)}
                                className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 ml-2"
                                title="Remove Allocation"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="w-1/4 flex justify-end items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={Math.round(r.allocatedWeight * 100) / 100}
                                onChange={(e) => updateAllocationWeight(layer.originalIndex, r.reelId, parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1 border rounded text-right font-bold text-green-700 bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <span className="text-xs font-bold text-gray-500">Kg</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground p-2 italic text-center">No reels allocated yet.</p>
                    )}
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    {!isComplete ? (
                      <div className="bg-red-50 px-4 py-2 rounded-md border border-red-200 flex-1 mr-4 flex items-center justify-between">
                        <div className="flex items-center text-red-800 font-bold">
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          SHORT WEIGHT: {Math.round(remaining * 100) / 100} Kg
                        </div>
                        <button 
                          onClick={() => openManualMatch(layer.originalIndex)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center"
                        >
                          <Search className="w-4 h-4 mr-1.5" /> Manual Search
                        </button>
                      </div>
                    ) : (
                      <div className="bg-green-50 px-4 py-2 rounded-md border border-green-200 flex-1 mr-4 flex items-center text-green-800 font-bold">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        ALLOCATION COMPLETE
                      </div>
                    )}
                    
                    {isComplete && (
                       <button 
                         onClick={() => openManualMatch(layer.originalIndex)}
                         className="text-blue-600 hover:text-blue-800 text-sm font-semibold underline decoration-blue-300 underline-offset-4"
                       >
                         Change/Manual Search
                       </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Smart Manual Search Modal */}
        {showManualModal && manualLayerIndex !== null && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col p-6 animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Smart Manual Search</h3>
                <div className="flex flex-col gap-1 mt-2">
                  <p className="text-gray-600 text-sm">
                    Layer: <span className="font-bold text-gray-800">{manualReqLayer?.layerName}</span> | 
                    Required Specs: <span className="font-bold text-gray-800">{manualReqLayer?.paperType} {manualReqLayer?.reqSize}" BF{manualReqLayer?.bf} GSM{manualReqLayer?.gsm}</span>
                  </p>
                  <div className="flex gap-4 items-center bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 mt-1 w-max">
                    <div className="text-xs font-bold uppercase text-gray-500">
                      Total Req: <span className="text-gray-900 text-sm ml-1">{manualReqWt.toFixed(1)} Kg</span>
                    </div>
                    <div className="w-px h-4 bg-blue-200"></div>
                    <div className="text-xs font-bold uppercase text-gray-500">
                      Allocated: <span className="text-green-700 text-sm ml-1">{manualTotalAlloc.toFixed(1)} Kg</span>
                    </div>
                    <div className="w-px h-4 bg-blue-200"></div>
                    <div className="text-xs font-bold uppercase text-gray-500">
                      Balance: <span className="text-orange-600 text-sm ml-1">{manualBalWt.toFixed(1)} Kg</span>
                    </div>
                  </div>
                </div>
              </div>
                <button onClick={() => setShowManualModal(false)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

            <div className="grid grid-cols-5 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Paper Type</label>
                <input
                  type="text"
                  placeholder="e.g. VK"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  value={manualSearch.paperType}
                  onChange={(e) => setManualSearch(p => ({ ...p, paperType: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reel Size</label>
                <input
                  type="text"
                  placeholder="e.g. 31"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  value={manualSearch.reelSize}
                  onChange={(e) => setManualSearch(p => ({ ...p, reelSize: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">BF</label>
                <input
                  type="text"
                  placeholder="e.g. 20"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  value={manualSearch.bf}
                  onChange={(e) => setManualSearch(p => ({ ...p, bf: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GSM</label>
                <input
                  type="text"
                  placeholder="e.g. 200"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  value={manualSearch.gsm}
                  onChange={(e) => setManualSearch(p => ({ ...p, gsm: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reel Number</label>
                <input
                  type="text"
                  placeholder="e.g. 1125"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  value={manualSearch.reelNumber}
                  onChange={(e) => setManualSearch(p => ({ ...p, reelNumber: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg border-gray-200 shadow-sm">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-100 sticky top-0 uppercase font-bold text-gray-600 text-xs shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Reel Number</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Size / BF / GSM</th>
                    <th className="px-4 py-3">Available Wt</th>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Match %</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {manualReelsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground font-medium">No available reels match your search.</td>
                    </tr>
                  ) : (
                    manualReelsList.map(r => (
                      <tr key={r.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900">{r.reelNumber}</td>
                        <td className="px-4 py-3 font-medium text-gray-700">{r.paperType}</td>
                        <td className="px-4 py-3 font-medium text-gray-700">
                          {r.reelSize}" / {r.bf} / {r.gsm}
                          {r.activeReservedWeight > 0 && (
                            <span className="ml-2 text-[10px] text-blue-700 font-bold bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded shadow-sm">
                              ❄️ Used: {r.activeReservedWeight}kg
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-green-700">{Math.round(r.availableAllocationWeight * 100) / 100} Kg</td>
                        <td className="px-4 py-3 font-medium text-gray-600">₹{r.rate || 0}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-1 rounded text-xs font-bold", r.matchColor)}>
                            {r.matchType} ({r.matchScore}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => addManualAllocation(r)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-xs font-bold inline-flex items-center transition-colors shadow-sm"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Allocate
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border flex flex-col gap-3 bg-card shrink-0">
        {/* Phase 3: Oversize Warning Banner */}
        {hasOversizeReel && !isAdmin && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 text-sm text-orange-800">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>Oversize reel selected. Saving will require <strong>Admin Approval</strong> before production can proceed.</span>
          </div>
        )}
        {hasOversizeReel && isAdmin && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>Oversize reel selected. Admin override — you can save directly without approval.</span>
          </div>
        )}
        <div className="flex justify-between">
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary">
            Cancel & Back
          </button>
          <div className="flex gap-3">
            {isAdmin && onSkip && (
              <button type="button" onClick={onSkip} className="px-4 py-2 text-sm font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                Admin: Skip Allocation
              </button>
            )}
            <button 
              type="button" 
              onClick={handleConfirm}
              disabled={isSubmitting || (!isFullyAllocated && !isAdmin)}
              className={cn(
                "px-6 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 flex items-center shadow-lg transition-all",
                hasOversizeReel && !isAdmin
                  ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
                  : "bg-green-600 hover:bg-green-700 shadow-green-600/20"
              )}
            >
              {isSubmitting ? <CircleDashed className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {hasOversizeReel && !isAdmin ? 'Request Approval & Save' : 'Confirm & Save Job Card'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Phase 3: Approval Reason Modal */}
    {showApprovalModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md animate-in zoom-in-95">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-orange-100">
                <ShieldAlert className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Approval Required</h3>
                <p className="text-sm text-muted-foreground">Oversize reel selected — Admin approval needed</p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-5">
              <p className="text-sm text-orange-800">
                Aapne <strong>required size se badi</strong> ek ya adhik reels select ki hain. Isko save karne ke liye aapko Admin se approval leni hogi.
                Approval milne tak yeh Job Card <strong>"Pending Approval"</strong> state me rahega.
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-foreground mb-2">Oversize Select Karne Ka Karan *</label>
              <textarea
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                placeholder="Explain the reason for selecting an oversize reel... (e.g. Correct size not available in stock)"
                rows={4}
                className="w-full text-sm rounded-lg border border-input px-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">{approvalReason.trim().length}/10 min characters</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowApprovalModal(false); setIsSubmitting(false); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-input bg-background hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprovalSubmit}
                disabled={approvalReason.trim().length < 10}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
}

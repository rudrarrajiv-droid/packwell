import React from 'react';
import { calculateLayerWeight, isHdpeLayer, calculateHdpeConsumption } from '../../lib/corrugationUtils';

export default function PrintableJobCard({ jobCard }: { jobCard: any }) {
  if (!jobCard) return null;
  const product = jobCard.productSnapshot;
  const loggedInUser = jobCard.createdBy || 'System';
  const roundWeight = (w: any) => Math.round(Number(w) || 0);

  const getLayerWeight = (layer: any, idx: number) => {
    const cutSize = Number(product?.cutSize || product?.cut_size || 0);
    const ups = Number(product?.ups || 1) || 1;
    const orderQty = Number(jobCard.orderQty || 0);

    if (isHdpeLayer(layer)) {
      return calculateHdpeConsumption(cutSize, ups, orderQty).totalMtr;
    }

    const reelSize = Number(product?.reelSize || product?.reel_size || 0);
    const noOfPaper = Math.ceil(orderQty / ups);
    const gsm = Number(layer.gsm) || 0;
    if (reelSize > 0 && cutSize > 0 && gsm > 0 && noOfPaper > 0) {
      return calculateLayerWeight(reelSize, cutSize, gsm, noOfPaper, layer, idx);
    }
    return Number(layer.calculatedWeight || layer.weight || layer.requiredWeight || 0);
  };

  const totalCalculatedPaperWeight = (product?.layers || []).reduce((acc: number, layer: any, idx: number) => {
    if (isHdpeLayer(layer)) return acc; // HDPE is in meters, paper weight is in Kg
    return acc + getLayerWeight(layer, idx);
  }, 0);

  return (
    <div id="job-card-print-area" className="print-view-container w-full max-w-[200mm] sm:w-[200mm] min-h-[275mm] max-h-[285mm] flex flex-col mx-auto bg-white text-black p-2 sm:p-2.5 text-[11px] font-sans leading-tight box-border relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 5mm 4mm 5mm;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #job-card-print-area {
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            max-height: 288mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      {/* HEADER */}
      <div className="grid grid-cols-3 items-center border-b-2 border-black pb-1 mb-1">
        <div className="flex justify-start">
          <div className="w-12 h-12 bg-white flex items-center justify-center">
            <img src="/logo.gif" alt="Packwell India Logo" className="w-full h-full object-contain grayscale invert bg-white" />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-lg font-black uppercase tracking-wider mb-0.5">Job Card</h1>
          <p className="font-bold text-gray-700 text-xs">PACKWELL INDIA</p>
        </div>
        <div className="text-right flex flex-col justify-start h-full pt-0.5">
          <div className="text-[10px] font-bold text-gray-600 mb-0.5 uppercase tracking-wide">DOCUMENT NO. : F/QA/016</div>
        </div>
      </div>

      {/* PRODUCT + DIMENSIONS */}
      <div className="mb-1 bg-gray-100 border border-black p-1.5 text-center relative">
        <div className="absolute top-1 left-1.5 text-[10px] font-bold text-gray-800 uppercase text-left">
          Job Card No. : {jobCard.jobCardNo}
        </div>
        <div className="absolute top-1 right-1.5 text-[10px] font-bold text-gray-800 uppercase text-right">
          Date : {new Date(jobCard.targetDate || jobCard.createdAt).toLocaleDateString('en-GB')}
        </div>
        <div className="text-xs mb-0.5 uppercase mt-0.5"><span className="text-gray-500 font-semibold mr-1">CUSTOMER NAME:</span><span className="font-extrabold text-gray-900">{jobCard.customerName || '-'}</span></div>
        <div className="text-xs mb-0.5 uppercase"><span className="text-gray-500 font-semibold mr-1">ITEM NAME:</span><span className="font-extrabold text-gray-900">{jobCard.productName}</span></div>
        <div className="text-xs uppercase">
          <span className="text-gray-500 font-semibold mr-1">DIMENSIONS:</span><span className="font-extrabold text-gray-900">{product?.length}(L) X {product?.width}(W) X {product?.height}(H) MM</span>
        </div>
      </div>

      {/* REQUIRED PRINT SEQUENCE (14 POINTS) */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 mb-1 border border-black p-1.5 text-[10.5px]">
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">1. No of Boxes:</span>
          <span className="font-bold uppercase">{jobCard.orderQty ? `${jobCard.orderQty} BOXES` : '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">2. Box Type:</span>
          <span className="font-bold uppercase">{product?.boxType || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">3. Reel Size:</span>
          <span className="font-bold">{product?.reelSize}"</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">4. Cut Size:</span>
          <span className="font-bold">{product?.cutSize}"</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">5. Paper Quantity:</span>
          <span className="font-bold">{jobCard.paperQuantity ? `${jobCard.paperQuantity} Paper` : '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">6. Ply Quantity:</span>
          <span className="font-bold text-right">
            {(() => {
              const ups = Number(product?.ups) || 1;
              const ply = Number(product?.ply) || 0;
              const qty = Number(jobCard?.orderQty) || 0;

              let calcTotalPly: number | string = '';

              if (ups > 0 && ply > 0) {
                const flutedLayers = Math.floor(ply / 2);
                calcTotalPly = Math.round((qty * flutedLayers) / ups);
              }

              if (calcTotalPly === '') return '-';

              const totalPly = Number(calcTotalPly);
              const fluteStr = product?.flute || '';
              if (!fluteStr) return `${totalPly} Ply`;

              const normalized = fluteStr.toUpperCase().replace(/\s+/g, '');
              let flutes = [];
              if (normalized.includes('+')) {
                flutes = normalized.split('+').filter(Boolean);
              } else if (normalized.length === 2 && /^[A-Z]{2}$/.test(normalized)) {
                flutes = [normalized[0], normalized[1]];
              } else {
                flutes = [normalized];
              }

              if (flutes.length === 2) {
                const half1 = Math.round(totalPly / 2);
                const half2 = totalPly - half1;
                return (
                  <>
                    <span className="mr-1">{flutes[0]}={half1} Ply,</span>
                    <span>{flutes[1]}={half2} Ply</span>
                  </>
                );
              }
              return `${flutes[0]} Flute = ${totalPly} Ply`;
            })()}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">7. Ply & Flute:</span>
          <span className="font-bold">{product?.ply} Ply / '{product?.flute}' Flute</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">8. Color:</span>
          <span className="font-bold uppercase">{product?.color || 'Plain'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">9. Creasing:</span>
          <span className="font-bold uppercase">{product?.creasing || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">10. Die Number:</span>
          <span className="font-bold uppercase">{product?.creasing === 'DIE' ? (product?.dieNo || '-') : 'N/A'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">11. UPS:</span>
          <span className="font-bold">{product?.ups || 1}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">12. Pin / Pasting:</span>
          <span className="font-bold uppercase">{product?.pinPasting || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">13. Pin Type:</span>
          <span className="font-bold uppercase">{product?.pinType || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 pb-0.5">
          <span className="font-bold text-gray-600">14. Pin Quantity:</span>
          <span className="font-bold uppercase">{product?.pinQty || '-'}</span>
        </div>
      </div>

      {/* ALTERNATE DECKLE AUDIT / MILL PURCHASE ORDER AUDIT BANNER */}
      {(jobCard.rmResolution?.type === 'ALTERNATE_DECKLE' || (jobCard.rmResolution?.type === 'COMBINED_RESOLUTION' && jobCard.rmResolution.layers?.some((l: any) => l.resolutionType === 'ALT_DECKLE'))) && (
        <div className="mb-1 p-1 border border-black bg-yellow-50 text-[9.5px] font-bold">
          <div className="flex justify-between items-center border-b border-black/30 pb-0.5 mb-0.5">
            <span className="uppercase text-amber-950 font-black flex items-center gap-1">
              ⚠️ ALTERNATE DECKLE PLANNED & APPROVED (TRIM WASTAGE RECORDED)
            </span>
            <span className="text-[9px] text-gray-700">
              Authorized By: <b>{jobCard.rmResolution.resolvedBy || 'Plant In-Charge'}</b>
            </span>
          </div>
          <div className="text-[9px] text-gray-800 flex flex-wrap gap-x-3 gap-y-0.5">
            {jobCard.rmResolution.layers?.filter((l: any) => l.resolutionType !== 'MILL_ORDER').map((l: any, i: number) => (
              <span key={i} className="inline-block">
                • <b>{l.layerName}:</b> Std {l.originalReelSize}" ➔ <b className="text-red-700">{l.selectedReelSize}"</b>
                {l.trimLossInch > 0 && <span className="text-amber-800 ml-0.5 font-bold">(+{l.trimLossInch}", +{l.trimLossPercent}% Trim)</span>}
                {l.reelNumber && <span className="text-gray-600 ml-0.5 font-mono">[{l.reelNumber}]</span>}
              </span>
            ))}
          </div>
          {jobCard.rmResolution.generalNote && (
            <div className="text-[8.5px] text-gray-600 italic mt-0.5">
              Note: {jobCard.rmResolution.generalNote}
            </div>
          )}
        </div>
      )}

      {(jobCard.rmResolution?.type === 'RM_ORDERED' || (jobCard.rmResolution?.type === 'COMBINED_RESOLUTION' && (jobCard.rmResolution.orders?.length > 0 || jobCard.rmResolution.layers?.some((l: any) => l.resolutionType === 'MILL_ORDER')))) && (
        <div className="mb-1 p-1 border border-black bg-blue-50 text-[9.5px] font-bold">
          <div className="flex justify-between items-center border-b border-black/30 pb-0.5 mb-0.5">
            <span className="uppercase text-blue-950 font-black">
              📦 RAW MATERIAL PURCHASE ORDER PLACED WITH MILL
            </span>
            <span className="text-[9px] text-gray-700">
              Mill: <b>{jobCard.rmResolution.vendorName || jobCard.rmResolution.orders?.[0]?.vendorName || 'Paper Mill'}</b> • ETA: <b>{jobCard.rmResolution.expectedDeliveryDate || '-'}</b>
            </span>
          </div>
          <div className="text-[9px] text-gray-800 flex flex-wrap gap-x-3 gap-y-0.5">
            {(jobCard.rmResolution.orders || jobCard.rmResolution.layers?.filter((l: any) => l.resolutionType === 'MILL_ORDER') || []).map((o: any, i: number) => (
              <span key={i} className="inline-block">
                • <b>{o.layerName}:</b> Ordered {o.orderReelSize || o.selectedReelSize || o.requiredReelSize}" / {o.orderGsm || o.gsm} GSM / {o.orderBf || o.bf} BF ({o.orderWeight || o.requiredWeight || o.requiredKg} Kg)
              </span>
            ))}
          </div>
          {(jobCard.rmResolution.remarks || jobCard.rmResolution.generalNote) && (
            <div className="text-[8.5px] text-gray-600 italic mt-0.5">
              Remarks: {jobCard.rmResolution.remarks || jobCard.rmResolution.generalNote}
            </div>
          )}
        </div>
      )}

      {/* PAPER SPECIFICATIONS WITH ALLOCATED REELS */}
      <div className="mb-1">
        <h3 className="font-bold text-[10.5px] uppercase mb-0.5 bg-gray-100 p-0.5 border-y border-black text-center">Paper Specification With Allocated Reels</h3>
        <table className="w-full text-center align-middle border-collapse border border-black text-[9.5px] table-auto">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-black p-0.5 text-center align-middle">Layer</th>
              <th className="border border-black p-0.5 text-center align-middle">Paper</th>
              <th className="border border-black p-0.5 text-center align-middle">Size</th>
              <th className="border border-black p-0.5 text-center align-middle">BF</th>
              <th className="border border-black p-0.5 text-center align-middle">GSM</th>
              <th className="border border-black p-0.5 text-center align-middle">Required</th>
              <th className="border border-black p-0.5 text-center align-middle">Allocated</th>
              <th className="border border-black p-0.5 text-center align-middle">Reel No.</th>
              <th className="border border-black p-0.5 text-center align-middle">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(product?.layers || []).map((layer: any, idx: number) => {
              const hasLegacy = !!layer.allocatedReelNumber && !!layer.allocatedReelWeight;
              const hasArray = layer.allocatedReels && Array.isArray(layer.allocatedReels) && layer.allocatedReels.length > 0;
              const isAllocated = hasLegacy || hasArray;
              const altResolutionLayer = (jobCard.rmResolution?.layers || []).find((l: any) => l.layerIndex === idx);

              const origSize = product?.reelSize ?? '-';
              const origBF = layer.bf;
              const origGSM = layer.gsm;
              const reelRows = hasArray ? layer.allocatedReels : [];

              const getReelSpecCell = (field: 'bf' | 'gsm' | 'reelSize', origVal: any) => {
                if (!hasArray) {
                  return <span>{origVal}</span>;
                }
                const vals = reelRows.map((r: any) => r[field]);
                const allSame = vals.every((v: any) => Number(v) === Number(origVal));
                if (allSame || vals.length === 0) {
                  return <span>{origVal}</span>;
                }
                return (
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="line-through text-gray-400 text-[8.5px]">{origVal}</span>
                    {vals.map((v: any, vi: number) => (
                      <span key={vi} className="font-bold text-red-700 text-[9.5px]">{v}</span>
                    ))}
                  </div>
                );
              };

              return (
                <tr key={idx}>
                  <td className="border border-black p-0.5 font-bold text-center align-middle">
                    <div className="flex flex-col items-center justify-center">
                      <span>{layer.layerName}</span>
                      {isAllocated ? (
                        <span className="bg-green-100 text-green-800 border border-green-200 px-1 rounded text-[8px] font-bold uppercase">Allocated</span>
                      ) : (
                        <span className="bg-red-100 text-red-800 border border-red-200 px-1 rounded text-[8px] font-bold uppercase">Not Allocated</span>
                      )}
                    </div>
                  </td>
                  <td className="border border-black p-0.5 text-center align-middle">{layer.paperType}</td>
                  {/* Size column */}
                  <td className="border border-black p-0.5 text-center align-middle">
                    {altResolutionLayer && altResolutionLayer.selectedReelSize !== altResolutionLayer.originalReelSize ? (
                      <div className="flex flex-col items-center">
                        <span className="line-through text-gray-400 text-[8px]">{origSize}"</span>
                        <span className="font-bold text-red-700 text-[9.5px]">{altResolutionLayer.selectedReelSize}"</span>
                        <span className="text-[7.5px] text-amber-800 font-bold leading-none">+{altResolutionLayer.trimLossInch}" (+{altResolutionLayer.trimLossPercent}%)</span>
                      </div>
                    ) : (
                      getReelSpecCell('reelSize', origSize)
                    )}
                  </td>
                  {/* BF column */}
                  <td className="border border-black p-0.5 text-center align-middle">
                    {getReelSpecCell('bf', origBF)}
                  </td>
                  {/* GSM column */}
                  <td className="border border-black p-0.5 font-semibold text-center align-middle">
                    {getReelSpecCell('gsm', origGSM)}
                  </td>
                  <td className="border border-black p-0.5 font-bold text-center align-middle">
                    {roundWeight(getLayerWeight(layer, idx))} {isHdpeLayer(layer) ? 'Mtr' : 'Kg'}
                  </td>
                  <td className="border border-black p-0.5 text-center align-middle whitespace-pre-line break-words">
                    {hasArray ? (
                      <div className="flex flex-col">
                        {layer.allocatedReels.map((r: any, i: number) => (
                          <span key={i} className="whitespace-nowrap font-bold text-blue-900 border-b border-gray-200 last:border-0">
                            {roundWeight(r.allocatedWeight)} {isHdpeLayer(layer) ? 'Mtr' : 'Kg'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      layer.allocatedReelWeight ? (
                        <span className="font-bold text-blue-900">
                          {roundWeight(layer.allocatedReelWeight)} {isHdpeLayer(layer) ? 'Mtr' : 'Kg'}
                        </span>
                      ) : '-'
                    )}
                  </td>
                  <td className="border border-black p-0.5 text-center align-middle whitespace-pre-line break-words">
                    {hasArray ? (
                      <div className="flex flex-col items-center">
                        {layer.allocatedReels.map((r: any, i: number) => (
                          <div key={i} className="flex flex-col items-center border-b border-gray-200 last:border-0 w-full">
                            <span className="font-bold text-[9px]">{r.reelNumber}</span>
                            <span className="text-[8px] text-gray-600 font-semibold leading-tight">
                              {r.reelSize ? `${r.reelSize}" ` : ''}{r.bf ? `BF${r.bf} ` : ''}{r.gsm ? `GSM${r.gsm}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : layer.allocatedReelNumber ? (
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-[9px]">{layer.allocatedReelNumber}</span>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="border border-black p-0.5 text-center align-middle font-bold text-[8.5px]">
                    {(() => {
                      if (!hasArray && !hasLegacy) return '';
                      const reqW = getLayerWeight(layer, idx);
                      let allocW = 0;
                      if (hasArray) {
                        allocW = layer.allocatedReels.reduce((sum: number, r: any) => sum + (Number(r.allocatedWeight) || 0), 0);
                      } else if (hasLegacy) {
                        allocW = Number(layer.allocatedReelWeight) || 0;
                      }

                      const diff = reqW - allocW;
                      let remarkText = '';
                      if (diff <= 0.1) {
                        remarkText = 'MATCHED';
                      } else {
                        remarkText = `BAL ${roundWeight(diff)} KG`;
                      }

                      if (jobCard.status === 'PENDING') {
                        remarkText += ' (PENDING)';
                      }

                      return <span className={diff <= 0.1 ? "text-green-700 uppercase" : "text-red-700 uppercase"}>{remarkText}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-100 font-bold text-[10px]">
              <td colSpan={5} className="border border-black p-0.5 text-right align-middle">Total Paper Weight:</td>
              <td className="border border-black p-0.5 text-center align-middle">{roundWeight(totalCalculatedPaperWeight || jobCard.totalWeight)} Kg</td>
              <td className="border border-black p-0.5 text-center align-middle">
                {(() => {
                  const totalAllocatedWeight = (product?.layers || []).reduce((acc: number, layer: any) => {
                    if (layer.allocatedReels && Array.isArray(layer.allocatedReels)) {
                      return acc + layer.allocatedReels.reduce((sum: number, r: any) => sum + Number(r.allocatedWeight || 0), 0);
                    } else if (layer.allocatedReelWeight) {
                      return acc + Number(layer.allocatedReelWeight || 0);
                    }
                    return acc;
                  }, 0);
                  return totalAllocatedWeight > 0 ? `${roundWeight(totalAllocatedWeight)} Kg` : '-';
                })()}
              </td>
              <td colSpan={2} className="border border-black p-0.5 bg-gray-100"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* LINE CLEARANCE & SIGNATURES */}
      <div className="mb-1">
        <h3 className="font-bold text-[10.5px] uppercase mb-0.5 bg-gray-100 p-0.5 border-y border-black">Line Clearance</h3>
        <table className="w-full text-left border-collapse border border-black text-[9px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-black p-0.5 w-[25%]">Production Department</th>
              <th className="border border-black p-0.5 w-[20%] text-center">Production Quantity</th>
              <th className="border border-black p-0.5 w-[30%] text-center">Operator Name</th>
              <th className="border border-black p-0.5 w-[25%] text-center">Sign</th>
            </tr>
          </thead>
          <tbody>
            {['CORRUGATION M/C', 'PAPER CUTTING M/C', 'PASTING M/C', 'ROTARY / DIE M/C', 'RS4 M/C', 'FG'].map((dept, i) => (
              <tr key={i} className="h-4">
                <td className="border border-black px-1 py-0.5 font-bold whitespace-nowrap">{dept}</td>
                <td className="border border-black p-0.5"></td>
                <td className="border border-black p-0.5"></td>
                <td className="border border-black p-0.5"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* INSTRUCTIONS */}
      {(() => {
        const formatRemark = (r: any): string => {
          if (!r) return '';
          if (typeof r === 'string') return r;
          if (typeof r === 'object') {
            if (r.text) {
              const meta = [r.by, r.date ? new Date(r.date).toLocaleDateString('en-GB') : null].filter(Boolean).join(' - ');
              return meta ? `${r.text} (${meta})` : r.text;
            }
            return JSON.stringify(r);
          }
          return String(r);
        };

        let remarkList: string[] = [];
        if (Array.isArray(jobCard.remarks)) {
          remarkList = jobCard.remarks.map(formatRemark).filter(Boolean);
        } else if (jobCard.remarks) {
          remarkList = [formatRemark(jobCard.remarks)];
        }

        if (Array.isArray(jobCard.specialInstructions)) {
          remarkList.push(...jobCard.specialInstructions.map(formatRemark).filter(Boolean));
        } else if (jobCard.specialInstructions) {
          remarkList.push(formatRemark(jobCard.specialInstructions));
        }

        if (remarkList.length === 0) return null;

        return (
          <div className="mb-1 p-1 border border-black min-h-[25px]">
            <h3 className="font-bold text-[10px] mb-0.5">Remarks / Special Instructions:</h3>
            <div className="text-[9px] whitespace-pre-wrap space-y-0.5 leading-tight">
              {remarkList.map((text, idx) => (
                <p key={idx}>{text}</p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* PREPARED / CHECKED / PRODUCTION HEAD */}
      <div className="grid grid-cols-3 gap-6 mt-auto pt-1 text-center text-gray-800 font-bold uppercase text-[9.5px] break-inside-avoid relative bottom-0">
        <div className="border-t border-black pt-0.5">
          Prepared By<br />
          <span className="font-normal text-[10px] uppercase">MR. SHUBHAM CHAUHAN</span>
        </div>
        <div className="border-t border-black pt-0.5">
          Checked By<br />
          <span className="font-normal text-[10px] uppercase">MR. JITENDER BALHARA</span>
        </div>
        <div className="border-t border-black pt-0.5">
          Production Head<br />
          <span className="font-normal text-[10px] uppercase">MR. RAJ KUMAR</span>
        </div>
      </div>

    </div>
  );
}

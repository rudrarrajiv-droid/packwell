import React from 'react';

export default function PrintableJobCard({ jobCard }: { jobCard: any }) {
  if (!jobCard) return null;
  const product = jobCard.productSnapshot;
  const loggedInUser = jobCard.createdBy || 'System';
  const roundWeight = (w: any) => Math.round(Number(w) || 0);

  return (
    <div id="job-card-print-area" className="print-view-container w-[210mm] h-[297mm] print:h-[100vh] print:max-h-[100vh] overflow-hidden flex flex-col mx-auto bg-white text-black p-[5mm] sm:p-[10mm] text-[12px] font-sans leading-snug box-border relative">
      
      {/* HEADER */}
      <div className="grid grid-cols-3 items-center border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-start">
          <div className="w-16 h-16 bg-white flex items-center justify-center">
             <img src="/logo.gif" alt="Packwell India Logo" className="w-full h-full object-contain grayscale invert bg-white" />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wider mb-0.5">Job Card</h1>
          <p className="font-semibold text-gray-700">PACKWELL INDIA</p>
        </div>
        <div className="text-right flex flex-col justify-start h-full pt-1">
          <div className="text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">DOCUMENT NO. : F/QA/016</div>
        </div>
      </div>

      {/* PRODUCT + DIMENSIONS */}
      <div className="mb-2 bg-gray-100 border border-black p-2 text-center relative">
        <div className="absolute top-2 left-2 text-xs font-bold text-gray-800 uppercase text-left">
          Job Card No. : {jobCard.jobCardNo}
        </div>
        <div className="absolute top-2 right-2 text-xs font-bold text-gray-800 uppercase text-right">
          Date : {new Date(jobCard.targetDate || jobCard.createdAt).toLocaleDateString()}
        </div>
        <div className="text-sm mb-1 uppercase mt-0.5"><span className="text-gray-500 font-semibold mr-1">CUSTOMER NAME:</span><span className="font-extrabold text-gray-900">{jobCard.customerName || '-'}</span></div>
        <div className="text-sm mb-1 uppercase"><span className="text-gray-500 font-semibold mr-1">ITEM NAME:</span><span className="font-extrabold text-gray-900">{jobCard.productName}</span></div>
        <div className="text-sm uppercase">
          <span className="text-gray-500 font-semibold mr-1">DIMENSIONS:</span><span className="font-extrabold text-gray-900">{product?.length}(L) X {product?.width}(W) X {product?.height}(H) MM</span>
        </div>
      </div>

      {/* REQUIRED PRINT SEQUENCE */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-2 border border-black p-2">
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">1. No of Boxes:</span>
          <span className="font-bold uppercase">{jobCard.orderQty ? `${jobCard.orderQty} BOXES` : '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">2. Box Type:</span>
          <span className="font-bold uppercase">{product?.boxType || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">3. Reel Size:</span>
          <span className="font-bold">{product?.reelSize}"</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">4. Cut Size:</span>
          <span className="font-bold">{product?.cutSize}"</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">5. Paper Quantity:</span>
          <span className="font-bold">{jobCard.paperQuantity ? `${jobCard.paperQuantity} Paper` : '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
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
                    <div className="leading-tight">{flutes[0]} Flute = {half1} Ply</div>
                    <div className="leading-tight">{flutes[1]} Flute = {half2} Ply</div>
                  </>
                );
              }
              return `${flutes[0]} Flute = ${totalPly} Ply`;
            })()}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">7. Ply & Flute:</span>
          <span className="font-bold">{product?.ply} Ply / '{product?.flute}' Flute</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">8. Color:</span>
          <span className="font-bold uppercase">{product?.color || 'Plain'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">9. Creasing:</span>
          <span className="font-bold uppercase">{product?.creasing || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">10. Die Number:</span>
          <span className="font-bold uppercase">{product?.creasing === 'DIE' ? (product?.dieNo || '-') : 'N/A'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">11. UPS:</span>
          <span className="font-bold">{product?.ups || 1}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">12. Pin / Pasting:</span>
          <span className="font-bold uppercase">{product?.pinPasting || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">13. Pin Type:</span>
          <span className="font-bold uppercase">{product?.pinType || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-300 pb-1">
          <span className="font-bold text-gray-600">14. Pin Quantity:</span>
          <span className="font-bold uppercase">{product?.pinQty || '-'}</span>
        </div>
      </div>

      {/* PAPER SPECIFICATIONS WITH ALLOCATED REELS */}
      <div className="mb-2">
        <h3 className="font-bold text-xs uppercase mb-1 bg-gray-100 p-1 border-y border-black text-center">Paper Specification With Allocated Reels</h3>
        <table className="w-full text-center align-middle border-collapse border border-black text-[11px] table-auto">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-black p-1 text-center align-middle">Layer</th>
              <th className="border border-black p-1 text-center align-middle">Paper</th>
              <th className="border border-black p-1 text-center align-middle">Size</th>
              <th className="border border-black p-1 text-center align-middle">BF</th>
              <th className="border border-black p-1 text-center align-middle">GSM</th>
              <th className="border border-black p-1 text-center align-middle">Required</th>
              <th className="border border-black p-1 text-center align-middle">Allocated</th>
              <th className="border border-black p-1 text-center align-middle">Reel No.</th>
              <th className="border border-black p-1 text-center align-middle">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(product?.layers || []).map((layer: any, idx: number) => {
              const hasLegacy = !!layer.allocatedReelNumber && !!layer.allocatedReelWeight;
              const hasArray = layer.allocatedReels && Array.isArray(layer.allocatedReels) && layer.allocatedReels.length > 0;
              const isAllocated = hasLegacy || hasArray;

              // For display: get actual specs from allocated reel (replacement may differ from original layer specs)
              // If multiple reels with different specs, show each reel's own specs in Reel No. column
              const origSize = product?.reelSize ?? '-';
              const origBF = layer.bf;
              const origGSM = layer.gsm;

              // Compute per-reel display values for array allocations
              const reelRows = hasArray ? layer.allocatedReels : [];

              // For single-reel display in BF/GSM/Size columns:
              // If all allocated reels have same BF/GSM/size as original → show original
              // If any reel differs → show actual reel value (strikethrough original, bold actual)
              const getReelSpecCell = (field: 'bf' | 'gsm' | 'reelSize', origVal: any) => {
                if (!hasArray) {
                  // Legacy: no extra info, show original
                  return <span>{origVal}</span>;
                }
                const vals = reelRows.map((r: any) => r[field]);
                const allSame = vals.every((v: any) => Number(v) === Number(origVal));
                if (allSame || vals.length === 0) {
                  return <span>{origVal}</span>;
                }
                // Replacement detected — show each reel's actual value
                return (
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="line-through text-gray-400 text-[9px]">{origVal}</span>
                    {vals.map((v: any, vi: number) => (
                      <span key={vi} className="font-bold text-red-700 text-[11px]">{v}</span>
                    ))}
                  </div>
                );
              };

              return (
                <tr key={idx}>
                  <td className="border border-black p-1 font-bold text-center align-middle">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span>{layer.layerName}</span>
                      {isAllocated ? (
                        <span className="bg-green-100 text-green-800 border border-green-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Allocated</span>
                      ) : (
                        <span className="bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Not Allocated</span>
                      )}
                    </div>
                  </td>
                  <td className="border border-black p-1 text-center align-middle">{layer.paperType}</td>
                  {/* Size column — actual allocated reel size, strikethrough original if replaced */}
                  <td className="border border-black p-1 text-center align-middle">
                    {getReelSpecCell('reelSize', origSize)}
                  </td>
                  {/* BF column — actual allocated reel BF, strikethrough if replaced */}
                  <td className="border border-black p-1 text-center align-middle">
                    {getReelSpecCell('bf', origBF)}
                  </td>
                  {/* GSM column — actual allocated reel GSM, strikethrough if replaced */}
                  <td className="border border-black p-1 font-semibold text-center align-middle">
                    {getReelSpecCell('gsm', origGSM)}
                  </td>
                  <td className="border border-black p-1 font-bold text-center align-middle">{roundWeight(layer.calculatedWeight || layer.weight || layer.requiredWeight)} Kg</td>
                  <td className="border border-black p-1 text-center align-middle whitespace-pre-line break-words">
                    {hasArray ? (
                      <div className="flex flex-col gap-1">
                        {layer.allocatedReels.map((r: any, i: number) => (
                          <span key={i} className="whitespace-nowrap font-bold text-blue-900 border-b border-gray-200 last:border-0 pb-0.5 last:pb-0">{roundWeight(r.allocatedWeight)} Kg</span>
                        ))}
                      </div>
                    ) : (
                      layer.allocatedReelWeight ? <span className="font-bold text-blue-900">{roundWeight(layer.allocatedReelWeight)} Kg</span> : '-'
                    )}
                  </td>
                  <td className="border border-black p-1 text-center align-middle whitespace-pre-line break-words">
                    {hasArray ? (
                      <div className="flex flex-col gap-1 items-center">
                        {layer.allocatedReels.map((r: any, i: number) => (
                          <div key={i} className="flex flex-col items-center border-b border-gray-200 last:border-0 pb-0.5 last:pb-0 w-full">
                            <span className="font-bold">{r.reelNumber}</span>
                            <span className="text-[9px] text-gray-600 font-semibold">
                              {r.reelSize ? `${r.reelSize}" ` : ''}{r.bf ? `BF${r.bf} ` : ''}{r.gsm ? `GSM${r.gsm}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : layer.allocatedReelNumber ? (
                      <div className="flex flex-col items-center">
                        <span className="font-bold">{layer.allocatedReelNumber}</span>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="border border-black p-1 text-center align-middle font-bold text-[10px]">
                    {(() => {
                      if (!hasArray && !hasLegacy) return '';
                      const reqW = layer.calculatedWeight || layer.weight || layer.requiredWeight || 0;
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
                        remarkText = `BALANCE REQUIRED ${roundWeight(diff)} KG`;
                      }
                      
                      if (jobCard.status === 'PENDING') {
                        remarkText += ' (PENDING FOR ISSUE)';
                      }

                      return <span className={diff <= 0.1 ? "text-green-700 uppercase" : "text-red-700 uppercase"}>{remarkText}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-100 font-bold">
              <td colSpan={5} className="border border-black p-1 text-right align-middle">Total Paper Weight:</td>
              <td className="border border-black p-1 text-center align-middle">{roundWeight(jobCard.totalWeight)} Kg</td>
              <td className="border border-black p-1 text-center align-middle">
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
              <td colSpan={2} className="border border-black p-1 bg-gray-100"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* REEL ALLOCATION (LEGACY SUPPORT) */}
      {(jobCard.allocations && jobCard.allocations.length > 0) && (
        <div className="mb-2">
          <h3 className="font-bold text-xs uppercase mb-1 bg-gray-100 p-1 border-y border-black">Allocated Reels</h3>
          <table className="w-full text-left border-collapse border border-black text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-black p-1">Reel Number</th>
                <th className="border border-black p-1 text-right">Allocated Weight</th>
              </tr>
            </thead>
            <tbody>
              {jobCard.allocations.map((a: any, idx: number) => (
                <tr key={idx}>
                  <td className="border border-black p-1 font-bold">{a.reelNumber}</td>
                  <td className="border border-black p-1 text-right font-bold">{roundWeight(a.allocatedWeight)} Kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LINE CLEARANCE & SIGNATURES */}
      <div className="mb-2">
        <h3 className="font-bold text-xs uppercase mb-1 bg-gray-100 p-1 border-y border-black">Line Clearance</h3>
        <table className="w-full text-left border-collapse border border-black text-[11px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-black p-1 w-[25%]">Production Department</th>
              <th className="border border-black p-1 w-[20%] text-center">Production Quantity</th>
              <th className="border border-black p-1 w-[30%] text-center">Operator Name</th>
              <th className="border border-black p-1 w-[25%] text-center">Sign</th>
            </tr>
          </thead>
          <tbody>
            {['CORRUGATION M/C', 'PAPER CUTTING M/C', 'PASTING M/C', 'ROTARY / DIE M/C', 'RS4 M/C', 'FG'].map((dept, i) => (
              <tr key={i} className="h-6">
                <td className="border border-black p-1 font-bold whitespace-nowrap">{dept}</td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
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
          <div className="mb-2 p-2 border border-black min-h-[40px]">
            <h3 className="font-bold text-xs mb-1">Remarks / Special Instructions:</h3>
            <div className="text-[11px] whitespace-pre-wrap space-y-1">
              {remarkList.map((text, idx) => (
                <p key={idx}>{text}</p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* PREPARED / CHECKED / PRODUCTION HEAD */}
      <div className="grid grid-cols-3 gap-8 mt-auto pt-4 text-center text-gray-800 font-bold uppercase text-[10px] break-inside-avoid relative bottom-0">
        <div className="border-t border-black pt-1">
          Prepared By<br/>
          <span className="font-normal text-[11px] uppercase">MR. SHUBHAM CHAUHAN</span>
        </div>
        <div className="border-t border-black pt-1">
          Checked By<br/>
          <span className="font-normal text-[11px] uppercase">MR. JITENDER BALHARA</span>
        </div>
        <div className="border-t border-black pt-1">
          Production Head<br/>
          <span className="font-normal text-[11px] uppercase">MR. RAJ KUMAR</span>
        </div>
      </div>
      
    </div>
  );
}

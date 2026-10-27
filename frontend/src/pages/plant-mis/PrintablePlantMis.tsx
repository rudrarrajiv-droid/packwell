import React from 'react';
import type { PlantMisFullData } from '../../lib/supabase/plantMisService';

interface PrintablePlantMisProps {
  data: PlantMisFullData;
  formattedDateStr: string;
  prevDateFormattedStr: string;
}

export default function PrintablePlantMis({
  data,
  formattedDateStr,
  prevDateFormattedStr
}: PrintablePlantMisProps) {
  const { report, fgItems, machineLogs, prevReport, mtdSummary, fgStockValuation } = data;

  const totalFgBoxes = fgItems.reduce((acc, curr) => acc + (Number(curr.qtyBox) || 0), 0);

  return (
    <div id="plant-mis-printable-area" className="hidden print:block p-8 bg-white text-black font-sans text-xs leading-normal">
      {/* Title Header */}
      <div className="border-2 border-black mb-4">
        <div className="bg-[#b91c1c] text-white py-2 px-4 text-center">
          <h1 className="text-xl font-black uppercase tracking-wider">
            PACKWELL INDIA PLANT PRODUCTION REPORT OF {formattedDateStr}
          </h1>
        </div>

        {/* Top Info Bar */}
        <div className="flex justify-between items-center px-4 py-1.5 bg-gray-100 border-t border-black text-[11px] font-semibold">
          <div>Report Date: <span className="font-bold">{formattedDateStr}</span></div>
          <div>Previous Working Date: <span className="font-bold">{prevDateFormattedStr}</span></div>
          <div>Report Generated: <span className="font-bold">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
      </div>

      {/* SECTION 1: REVENUE COMPARISON (WITHOUT & WITH GST) */}
      {report.showRevenue !== false && (
        <div className="mb-4">
          <div className="bg-yellow-300 border border-black px-3 py-1 font-bold text-xs uppercase tracking-wide">
            1. Sale & Revenue Summary (With & Without GST)
          </div>
          <table className="w-full border-collapse border border-black text-left text-xs">
            <thead>
              <tr className="bg-gray-100 text-center font-bold">
                <th className="border border-black p-1.5">Particulars</th>
                <th className="border border-black p-1.5">Day's Sale ({formattedDateStr})</th>
                <th className="border border-black p-1.5">Previous Date ({prevDateFormattedStr})</th>
                <th className="border border-black p-1.5">Current Month Till Date (MTD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-1.5 font-bold">Self Manufacturing (Khud banayi)</td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{report.selfSaleExclGst.toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{report.selfSaleInclGst.toLocaleString('en-IN')}</span>
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{(prevReport?.selfSaleExclGst || 0).toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{(prevReport?.selfSaleInclGst || 0).toLocaleString('en-IN')}</span>
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{mtdSummary.selfExcl.toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{mtdSummary.selfIncl.toLocaleString('en-IN')}</span>
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1.5 font-bold">Outsource Sale (Bahar se li)</td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{report.outsourceSaleExclGst.toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{report.outsourceSaleInclGst.toLocaleString('en-IN')}</span>
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{(prevReport?.outsourceSaleExclGst || 0).toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{(prevReport?.outsourceSaleInclGst || 0).toLocaleString('en-IN')}</span>
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{mtdSummary.outsourceExcl.toLocaleString('en-IN')}<br />
                  <span className="font-bold">With GST: ₹{mtdSummary.outsourceIncl.toLocaleString('en-IN')}</span>
                </td>
              </tr>
              <tr className="bg-yellow-100 font-bold">
                <td className="border border-black p-1.5 uppercase">TOTAL PLANT SALE</td>
                <td className="border border-black p-1.5 text-right font-mono font-black text-sm">
                  Without GST: ₹{report.totalSaleExclGst.toLocaleString('en-IN')}<br />
                  With GST: ₹{report.totalSaleInclGst.toLocaleString('en-IN')}
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{(prevReport?.totalSaleExclGst || 0).toLocaleString('en-IN')}<br />
                  With GST: ₹{(prevReport?.totalSaleInclGst || 0).toLocaleString('en-IN')}
                </td>
                <td className="border border-black p-1.5 text-right font-mono">
                  Without GST: ₹{mtdSummary.totalExcl.toLocaleString('en-IN')}<br />
                  With GST: ₹{mtdSummary.totalIncl.toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* SECTION 2: WAREHOUSE FG STOCK VALUATION */}
      {report.showStockValuation !== false && (
        <div className="mb-4">
          <div className="bg-yellow-300 border border-black px-3 py-1 font-bold text-xs uppercase tracking-wide">
            2. Finish Goods Warehouse Stock Valuation (Live from Finish Goods Sheet)
          </div>
          <table className="w-full border-collapse border border-black text-xs text-center">
            <thead className="bg-gray-100 font-bold">
              <tr>
                <th className="border border-black p-1.5">Regular FG Stock Value</th>
                <th className="border border-black p-1.5">Non-Moving FG Stock Value</th>
                <th className="border border-black p-1.5">Total FG Stock Warehouse Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-mono text-sm font-bold">
                <td className="border border-black p-2 text-emerald-800">
                  ₹{fgStockValuation.regularValue.toLocaleString('en-IN')}
                  <div className="text-[10px] text-gray-600 font-normal">({fgStockValuation.regularBoxes.toLocaleString('en-IN')} Boxes)</div>
                </td>
                <td className="border border-black p-2 text-amber-800">
                  ₹{fgStockValuation.nonMovingValue.toLocaleString('en-IN')}
                  <div className="text-[10px] text-gray-600 font-normal">({fgStockValuation.nonMovingBoxes.toLocaleString('en-IN')} Boxes)</div>
                </td>
                <td className="border border-black p-2 font-black text-blue-900 bg-blue-50">
                  ₹{fgStockValuation.totalValue.toLocaleString('en-IN')}
                  <div className="text-[10px] text-gray-600 font-normal">({fgStockValuation.totalBoxes.toLocaleString('en-IN')} Total Boxes)</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* SECTION 3 & 4: FINISH GOODS AND MACHINES */}
      {(report.showFgProduced !== false || report.showMachines !== false) && (
        <div className={`grid ${report.showFgProduced !== false && report.showMachines !== false ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-4`}>
          {/* Left: Finish Goods Produced (NO SCRAP) */}
          {report.showFgProduced !== false && (
            <div>
              <div className="bg-yellow-300 border border-black px-3 py-1 font-bold text-xs uppercase tracking-wide">
                3. Finish Goods Produced Today ({totalFgBoxes.toLocaleString('en-IN')} Boxes)
              </div>
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-gray-100 font-bold">
                    <th className="border border-black p-1 w-8 text-center">#</th>
                    <th className="border border-black p-1">Vendor</th>
                    <th className="border border-black p-1">Item Name</th>
                    <th className="border border-black p-1 text-right">Produced (Box)</th>
                  </tr>
                </thead>
                <tbody>
                  {fgItems.map((fg, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                      <td className="border border-black p-1 font-semibold">{fg.vendorName}</td>
                      <td className="border border-black p-1">{fg.itemName}</td>
                      <td className="border border-black p-1 text-right font-mono font-bold">
                        {fg.qtyBox.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-yellow-200 font-bold border-t-2 border-black">
                    <td colSpan={3} className="border border-black p-1 text-right uppercase">Total Produced</td>
                    <td className="border border-black p-1 text-right font-mono font-black">
                      {totalFgBoxes.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Right: Machine Performance */}
          {report.showMachines !== false && (
            <div>
              <div className="bg-yellow-300 border border-black px-3 py-1 font-bold text-xs uppercase tracking-wide">
                4. Machine Performance & Running Sq Mtr
              </div>
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-gray-100 font-bold">
                    <th className="border border-black p-1">Machine & Shift</th>
                    <th className="border border-black p-1 text-center">Status / Hrs</th>
                    <th className="border border-black p-1 text-right">Production Output</th>
                    <th className="border border-black p-1 text-right">Scrap</th>
                  </tr>
                </thead>
                <tbody>
                  {machineLogs.map((m, idx) => {
                    const isMaint = m.status === 'MAINTENANCE';
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-black p-1 font-semibold">
                          {m.machineName} ({m.shift})
                          {m.shiftTiming && <div className="text-[10px] text-gray-500">{m.shiftTiming}</div>}
                        </td>
                        <td className={`border border-black p-1 text-center font-bold ${
                          isMaint ? 'bg-red-600 text-white font-black' : ''
                        }`}>
                          {isMaint ? 'MAINTENANCE' : `${m.shiftHours} Hrs`}
                        </td>
                        <td className="border border-black p-1 text-right font-mono">
                          {isMaint ? '-' : (
                            <div>
                              {m.runningSqMtr > 0 && <span className="font-bold">{m.runningSqMtr.toLocaleString('en-IN')} m² </span>}
                              {m.runningKg > 0 && <span>({m.runningKg} kg) </span>}
                              {m.totalPly > 0 && <span>• {m.totalPly} Ply </span>}
                              {m.totalPaper > 0 && <span>• {m.totalPaper} Paper </span>}
                              {m.scrapSheet > 0 && <span>• {m.scrapSheet} Sheets </span>}
                            </div>
                          )}
                        </td>
                        <td className="border border-black p-1 text-right font-mono">
                          {m.scrapKg > 0 ? `${m.scrapKg} kg` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Remarks Section */}
      {report.remarks && (
        <div className="border border-black p-2 mb-6 bg-gray-50">
          <span className="font-bold uppercase text-[11px] block">Plant Remarks / Notes:</span>
          <p className="text-xs text-gray-800">{report.remarks}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-10 text-center text-xs font-bold border-t border-black">
        <div>
          <div className="border-t border-black pt-1 w-3/4 mx-auto">Prepared By (Supervisor)</div>
        </div>
        <div>
          <div className="border-t border-black pt-1 w-3/4 mx-auto">Checked By (Plant Manager)</div>
        </div>
        <div>
          <div className="border-t border-black pt-1 w-3/4 mx-auto">Director's Approval</div>
        </div>
      </div>
    </div>
  );
}

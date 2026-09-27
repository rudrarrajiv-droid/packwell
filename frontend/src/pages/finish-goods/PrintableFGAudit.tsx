import React from 'react';

interface PrintableFGAuditProps {
  finishGoods: any[];
}

export default function PrintableFGAudit({ finishGoods }: PrintableFGAuditProps) {
  // 1. Filter: active finish goods where closingBalance > 0 OR nonMovingBalance > 0
  const activeFG = finishGoods.filter(fg => {
    const regBal = Number(fg.closingBalance) || 0;
    const nonBal = Number(fg.nonMovingBalance) || 0;
    return regBal > 0 || nonBal > 0;
  });

  // 2. Sort: Regular first, then Non-Moving, then by product name, then customer name
  const sortedFG = [...activeFG].sort((a, b) => {
    const aReg = Number(a.closingBalance) || 0;
    const bReg = Number(b.closingBalance) || 0;
    const aNon = Number(a.nonMovingBalance) || 0;
    const bNon = Number(b.nonMovingBalance) || 0;

    const aHasReg = aReg > 0;
    const bHasReg = bReg > 0;

    if (aHasReg && !bHasReg) return -1;
    if (!aHasReg && bHasReg) return 1;

    if (!aHasReg && !bHasReg) {
      const aHasNon = aNon > 0;
      const bHasNon = bNon > 0;
      if (aHasNon && !bHasNon) return -1;
      if (!aHasNon && bHasNon) return 1;
    }

    const prodCompare = (a.productName || '').localeCompare(b.productName || '');
    if (prodCompare !== 0) return prodCompare;
    return (a.customerName || '').localeCompare(b.customerName || '');
  });

  // Create 20 blank rows
  const blankRows = Array.from({ length: 20 }).map((_, i) => i);

  return (
    <div className="hidden print:block print-view-multipage w-full text-black bg-white">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-center mb-1">Finish Goods Audit Report</h1>
        <p className="text-center text-sm text-gray-600">Date: {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      <table className="w-full border-collapse text-sm" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <thead className="table-header-group">
          <tr>
            <th className="border-[1.5px] border-black px-2 py-2 text-center w-12 bg-gray-100" style={{ border: '1px solid black' }}>Sr. No.</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-left bg-gray-100" style={{ border: '1px solid black' }}>Product Name</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-right w-32 bg-gray-100" style={{ border: '1px solid black' }}>Regular Closing Balance</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-right w-32 bg-gray-100" style={{ border: '1px solid black' }}>Non Moving Closing Balance</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-left w-48 bg-gray-100" style={{ border: '1px solid black' }}>Audit</th>
          </tr>
        </thead>
        <tbody>
          {sortedFG.map((item, index) => (
            <tr key={item.id || index} className="break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
              <td className="border-[1.5px] border-black px-2 py-1.5 text-center" style={{ border: '1px solid black' }}>{index + 1}</td>
              <td className="border-[1.5px] border-black px-2 py-1.5 font-bold" style={{ border: '1px solid black' }}>
                {item.productName}
                <div className="text-xs text-gray-600 font-normal">{item.customerName}</div>
              </td>
              <td className="border-[1.5px] border-black px-2 py-1.5 text-right font-medium" style={{ border: '1px solid black' }}>
                {Math.round(Number(item.closingBalance) || 0)}
              </td>
              <td className="border-[1.5px] border-black px-2 py-1.5 text-right font-medium" style={{ border: '1px solid black' }}>
                {Math.round(Number(item.nonMovingBalance) || 0)}
              </td>
              <td className="border-[1.5px] border-black px-2 py-1.5" style={{ border: '1px solid black' }}></td>
            </tr>
          ))}
          {/* 20 blank rows for manual entry */}
          {blankRows.map(i => (
            <tr key={`blank-${i}`} className="break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
              <td className="border-[1.5px] border-black px-2 py-4" style={{ border: '1px solid black' }}></td>
              <td className="border-[1.5px] border-black px-2 py-4" style={{ border: '1px solid black' }}></td>
              <td className="border-[1.5px] border-black px-2 py-4" style={{ border: '1px solid black' }}></td>
              <td className="border-[1.5px] border-black px-2 py-4" style={{ border: '1px solid black' }}></td>
              <td className="border-[1.5px] border-black px-2 py-4" style={{ border: '1px solid black' }}></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

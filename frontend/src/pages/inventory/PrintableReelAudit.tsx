import React from 'react';
import { type Reel } from '../../lib/supabase/reelService';

interface PrintableReelAuditProps {
  reels: Reel[];
}

export default function PrintableReelAudit({ reels }: PrintableReelAuditProps) {
  // 1. Filter: active reels > 1 kg
  const activeReels = reels.filter(r => (Number(r.currentBalance) || 0) > 1);

  // 2. Sort sequence
  const getTypeRank = (type: string) => {
    const t = (type || '').toUpperCase();
    if (t === 'SK') return 1;
    if (t === 'VK') return 2;
    return 3; // HWC, DUPLEX, OTHERS
  };

  const getTypeName = (type: string) => {
    const t = (type || '').toUpperCase();
    if (t === 'SK' || t === 'VK') return t;
    return 'OTHERS (HWC/DUPLEX etc.)';
  };

  const sortedReels = [...activeReels].sort((a, b) => {
    const rankA = getTypeRank(a.paperType);
    const rankB = getTypeRank(b.paperType);
    if (rankA !== rankB) return rankA - rankB;

    const sizeA = Number(a.reelSize) || 0;
    const sizeB = Number(b.reelSize) || 0;
    if (sizeA !== sizeB) return sizeA - sizeB;

    const bfA = Number(a.bf) || 0;
    const bfB = Number(b.bf) || 0;
    if (bfA !== bfB) return bfA - bfB;

    return (Number(a.gsm) || 0) - (Number(b.gsm) || 0);
  });

  // Calculate totals by type
  const totalsByType: Record<string, number> = {};
  sortedReels.forEach(r => {
    const typeName = getTypeName(r.paperType);
    if (!totalsByType[typeName]) {
      totalsByType[typeName] = 0;
    }
    totalsByType[typeName] += Number(r.currentBalance) || 0;
  });

  // Create 10 blank rows
  const blankRows = Array.from({ length: 10 }).map((_, i) => i);

  return (
    <div className="hidden print:block print-view-multipage w-full text-black bg-white">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-center mb-1">Reel Inventory Audit Report</h1>
        <p className="text-center text-sm text-gray-600">Date: {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      <div className="mb-6 flex gap-6 justify-center">
        {Object.entries(totalsByType).map(([type, weight]) => (
          <div key={type} className="border border-black px-4 py-2 font-bold text-sm">
            {type} Total: {Math.round(weight)} Kg
          </div>
        ))}
        <div className="border border-black px-4 py-2 font-bold text-sm bg-gray-100">
          Grand Total: {Math.round(Object.values(totalsByType).reduce((a, b) => a + b, 0))} Kg
        </div>
      </div>

      <table className="w-full border-collapse text-sm" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <thead className="table-header-group">
          <tr>
            <th className="border-[1.5px] border-black px-2 py-2 text-center w-12 bg-gray-100" style={{ border: '1px solid black' }}>Sr. No.</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-left bg-gray-100" style={{ border: '1px solid black' }}>Reel No.</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-left bg-gray-100" style={{ border: '1px solid black' }}>Specs (Type/Size/BF/GSM)</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-right w-32 bg-gray-100" style={{ border: '1px solid black' }}>Closing Balance</th>
            <th className="border-[1.5px] border-black px-2 py-2 text-left w-48 bg-gray-100" style={{ border: '1px solid black' }}>Audit</th>
          </tr>
        </thead>
        <tbody>
          {sortedReels.map((reel, index) => (
            <tr key={reel.id} className="break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
              <td className="border-[1.5px] border-black px-2 py-1.5 text-center" style={{ border: '1px solid black' }}>{index + 1}</td>
              <td className="border-[1.5px] border-black px-2 py-1.5 font-bold" style={{ border: '1px solid black' }}>{reel.reelNumber}</td>
              <td className="border-[1.5px] border-black px-2 py-1.5" style={{ border: '1px solid black' }}>
                {reel.paperType} | {reel.reelSize}" | {reel.bf} BF | {reel.gsm} GSM
              </td>
              <td className="border-[1.5px] border-black px-2 py-1.5 text-right font-medium" style={{ border: '1px solid black' }}>
                {Math.round(Number(reel.currentBalance) || 0)} Kg
              </td>
              <td className="border-[1.5px] border-black px-2 py-1.5" style={{ border: '1px solid black' }}></td>
            </tr>
          ))}
          {/* 10 blank rows for manual entry */}
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

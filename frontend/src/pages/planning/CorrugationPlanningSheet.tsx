import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Printer, Download, RotateCcw, Save, 
  Calendar, Check, Copy, Share2, Sparkles, AlertCircle 
} from 'lucide-react';
import * as xlsx from 'xlsx';
import type { CorrugationPlanningRow } from './PlanningTypes';
import { INITIAL_CORRUGATION_ROWS } from './samplePlanningData';

const formatTodayDate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CorrugationPlanningSheet() {
  const [selectedDate, setSelectedDate] = useState<string>(formatTodayDate);
  const [rows, setRows] = useState<CorrugationPlanningRow[]>(() => {
    const saved = localStorage.getItem(`packwell_corrugation_planning_${formatTodayDate()}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_CORRUGATION_ROWS;
  });

  const [savedToast, setSavedToast] = useState(false);
  const [whatsappToast, setWhatsappToast] = useState(false);

  // Load rows when selectedDate changes
  useEffect(() => {
    const saved = localStorage.getItem(`packwell_corrugation_planning_${selectedDate}`);
    if (saved) {
      try {
        setRows(JSON.parse(saved));
        return;
      } catch (e) {
        console.error(e);
      }
    }
    // If not saved for this date, keep existing or fallback
  }, [selectedDate]);

  // Auto-save to localStorage
  const saveToLocalStorage = (updatedRows: CorrugationPlanningRow[]) => {
    localStorage.setItem(`packwell_corrugation_planning_${selectedDate}`, JSON.stringify(updatedRows));
  };

  const handleManualSave = () => {
    saveToLocalStorage(rows);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const updateRow = (id: string, field: keyof CorrugationPlanningRow, value: any) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        const newRow = { ...row, [field]: value };
        
        // Smart auto-calc: If user edits ups or nosOfPly, auto-calculate boxQty if not manually locked
        if (field === 'ups' || field === 'nosOfPly') {
          const plyNum = field === 'nosOfPly' ? parseFloat(value) : parseFloat(String(row.nosOfPly || 0));
          const upsNum = field === 'ups' ? parseFloat(value) : parseFloat(String(row.ups || 0));
          if (!isNaN(plyNum) && !isNaN(upsNum) && upsNum > 0) {
            newRow.boxQty = Math.round(plyNum * upsNum);
          }
        }
        return newRow;
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const addRow = () => {
    setRows(prev => {
      const newSNo = prev.length > 0 ? Math.max(...prev.map(r => r.sNo || 0)) + 1 : 1;
      const newRow: CorrugationPlanningRow = {
        id: `c-${Date.now()}`,
        sNo: newSNo,
        customerName: '',
        jobName: '',
        reelSize: '',
        cutSize: '',
        ups: '',
        fluteType: 'B',
        nosOfPly: '',
        boxQty: '',
        remarks: ''
      };
      const updated = [...prev, newRow];
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const deleteRow = (id: string) => {
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== id);
      // Re-index sNo
      const reindexed = filtered.map((r, idx) => ({ ...r, sNo: idx + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });
  };

  const resetToSample = () => {
    if (window.confirm('Reset this sheet to the original sample planning data?')) {
      setRows(INITIAL_CORRUGATION_ROWS);
      saveToLocalStorage(INITIAL_CORRUGATION_ROWS);
    }
  };

  const clearAll = () => {
    if (window.confirm('Are you sure you want to clear all rows for this date?')) {
      const emptyRow: CorrugationPlanningRow = {
        id: `c-${Date.now()}`,
        sNo: 1,
        customerName: '',
        jobName: '',
        reelSize: '',
        cutSize: '',
        ups: '',
        fluteType: 'B',
        nosOfPly: '',
        boxQty: '',
        remarks: ''
      };
      setRows([emptyRow]);
      saveToLocalStorage([emptyRow]);
    }
  };

  // Calculations
  const totalPly = useMemo(() => {
    return rows.reduce((acc, row) => {
      const val = parseFloat(String(row.nosOfPly || 0));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [rows]);

  const totalBoxQty = useMemo(() => {
    return rows.reduce((acc, row) => {
      const val = parseFloat(String(row.boxQty || 0));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [rows]);

  // Export to Excel
  const exportExcel = () => {
    const exportData = rows.map(r => ({
      'S No.': r.sNo,
      'CUSTOMER NAME': r.customerName,
      'JOB NAME': r.jobName,
      'REEL SIZE': r.reelSize ?? '',
      'CUT SIZE': r.cutSize ?? '',
      'UPS': r.ups ?? '',
      'FLUTE type': r.fluteType ?? '',
      'NOS OF PLY': r.nosOfPly ?? '',
      'BOX QTY.': r.boxQty ?? '',
      'REMARKS.': r.remarks ?? ''
    }));

    // Add total row
    exportData.push({
      'S No.': '' as any,
      'CUSTOMER NAME': '' as any,
      'JOB NAME': '' as any,
      'REEL SIZE': '' as any,
      'CUT SIZE': '' as any,
      'UPS': '' as any,
      'FLUTE type': 'TOTAL PLY',
      'NOS OF PLY': totalPly as any,
      'BOX QTY.': totalBoxQty as any,
      'REMARKS.': '' as any
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Corrugation Planning');
    xlsx.writeFile(workbook, `Corrugation_Machine_Planning_${selectedDate}.xlsx`);
  };

  // WhatsApp Copy
  const copyWhatsApp = () => {
    let text = `*CORRUGATION MACHINE PLANNING (${selectedDate})*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    rows.forEach((r, idx) => {
      if (r.customerName || r.jobName) {
        text += `${idx + 1}. *${r.customerName || 'N/A'}* - ${r.jobName}\n`;
        text += `   Reel: ${r.reelSize || '-'} | Cut: ${r.cutSize || '-'} | UPS: ${r.ups || '-'} | Flute: ${r.fluteType || '-'}\n`;
        text += `   Ply: *${r.nosOfPly || 0}* | Box: *${r.boxQty || 0}* ${r.remarks ? `(${r.remarks})` : ''}\n`;
      }
    });
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*TOTAL PLY: ${totalPly.toLocaleString()}*\n`;
    text += `*TOTAL BOX QTY: ${totalBoxQty.toLocaleString()}*\n`;

    navigator.clipboard.writeText(text);
    setWhatsappToast(true);
    setTimeout(() => setWhatsappToast(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-sm print:hidden">
        {/* Left: Date selector & quick indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-border">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planning Date:</span>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
              {rows.length} Jobs
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
              Total Ply: {totalPly.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>

          <button
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            title="Auto-saved automatically, click to save explicitly"
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            onClick={copyWhatsApp}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            title="Copy formatted text to paste on WhatsApp for MD"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </button>

          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-secondary text-foreground text-xs font-medium rounded-lg border border-border shadow-sm transition-all"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Excel
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-secondary text-foreground text-xs font-medium rounded-lg border border-border shadow-sm transition-all"
          >
            <Printer className="w-4 h-4 text-primary" />
            Print / PDF
          </button>

          <button
            onClick={resetToSample}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-all"
            title="Reset to sample data"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Clear all rows"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Toast notifications */}
      {savedToast && (
        <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-emerald-600" />
          Planning saved successfully for {selectedDate}!
        </div>
      )}
      {whatsappToast && (
        <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg border border-green-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-green-600" />
          Copied WhatsApp summary to clipboard! Paste it directly into your WhatsApp chat with MD.
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-x-auto print:shadow-none print:border-none print:rounded-none">
        {/* Table Title Banner - Matching Screenshot 1 */}
        <div className="text-center py-2.5 bg-white border-b-2 border-black font-extrabold text-lg sm:text-xl tracking-wider text-black uppercase">
          CORRUGATION MACHINE PLANNING
          <span className="block text-xs font-normal text-gray-600 capitalize tracking-normal mt-0.5 print:hidden">
            (Daily MD Planning Sheet • Date: {selectedDate})
          </span>
        </div>

        <table className="w-full text-xs border-collapse text-black">
          <thead>
            <tr className="bg-gray-100 border-b border-black text-center font-bold text-[11px] sm:text-xs">
              <th className="border border-black px-2 py-2 w-12 text-center">S No.</th>
              <th className="border border-black px-3 py-2 text-left min-w-[160px]">CUSTOMER NAME</th>
              <th className="border border-black px-3 py-2 text-left min-w-[200px]">JOB NAME</th>
              <th className="border border-black px-2 py-2 w-20 text-center">REEL SIZE</th>
              <th className="border border-black px-2 py-2 w-20 text-center">CUT SIZE</th>
              <th className="border border-black px-2 py-2 w-14 text-center">UPS</th>
              <th className="border border-black px-2 py-2 w-16 text-center">FLUTE<br />type</th>
              <th className="border border-black px-2 py-2 w-24 text-center">NOS OF PLY</th>
              <th className="border border-black px-2 py-2 w-24 text-center">BOX QTY.</th>
              <th className="border border-black px-3 py-2 min-w-[140px] text-center bg-[#ffff00] text-black font-extrabold">
                REMARKS.
              </th>
              <th className="border border-black px-2 py-2 w-12 text-center print:hidden bg-gray-200">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                {/* S No */}
                <td className="border border-black px-2 py-1.5 text-center font-bold">
                  {row.sNo}
                </td>

                {/* Customer Name */}
                <td className="border border-black px-2 py-1 font-bold">
                  <input
                    type="text"
                    value={row.customerName}
                    onChange={(e) => updateRow(row.id, 'customerName', e.target.value.toUpperCase())}
                    placeholder="CUSTOMER NAME"
                    className="w-full bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded uppercase"
                  />
                </td>

                {/* Job Name */}
                <td className="border border-black px-2 py-1 font-semibold">
                  <input
                    type="text"
                    value={row.jobName}
                    onChange={(e) => updateRow(row.id, 'jobName', e.target.value.toUpperCase())}
                    placeholder="JOB NAME / SIZE"
                    className="w-full bg-transparent font-semibold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded uppercase"
                  />
                </td>

                {/* Reel Size */}
                <td className="border border-black px-1 py-1 text-center font-semibold">
                  <input
                    type="text"
                    value={row.reelSize ?? ''}
                    onChange={(e) => updateRow(row.id, 'reelSize', e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-center font-semibold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* Cut Size */}
                <td className="border border-black px-1 py-1 text-center font-semibold">
                  <input
                    type="text"
                    value={row.cutSize ?? ''}
                    onChange={(e) => updateRow(row.id, 'cutSize', e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-center font-semibold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* UPS */}
                <td className="border border-black px-1 py-1 text-center font-semibold">
                  <input
                    type="text"
                    value={row.ups ?? ''}
                    onChange={(e) => updateRow(row.id, 'ups', e.target.value)}
                    placeholder="1"
                    className="w-full bg-transparent text-center font-semibold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* Flute Type */}
                <td className="border border-black px-1 py-1 text-center font-bold">
                  <select
                    value={row.fluteType || 'B'}
                    onChange={(e) => updateRow(row.id, 'fluteType', e.target.value)}
                    className="w-full bg-transparent text-center font-bold text-black border-none focus:outline-none focus:bg-yellow-50 py-0.5 cursor-pointer"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="E">E</option>
                    <option value="F">F</option>
                    <option value="BC">BC</option>
                  </select>
                </td>

                {/* Nos of Ply */}
                <td className="border border-black px-2 py-1 text-center font-bold">
                  <input
                    type="number"
                    value={row.nosOfPly ?? ''}
                    onChange={(e) => updateRow(row.id, 'nosOfPly', e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-center font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* Box Qty */}
                <td className="border border-black px-2 py-1 text-center font-bold">
                  <input
                    type="number"
                    value={row.boxQty ?? ''}
                    onChange={(e) => updateRow(row.id, 'boxQty', e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-center font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* Remarks */}
                <td className="border border-black px-2 py-1">
                  <input
                    type="text"
                    value={row.remarks || ''}
                    onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                    placeholder=""
                    className="w-full bg-transparent text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                  />
                </td>

                {/* Actions (hidden in print) */}
                <td className="border border-black px-1 py-1 text-center print:hidden">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    title="Delete Row"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Footer Total Row - Exactly as shown in Screenshot 1 */}
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-black font-extrabold text-black">
              <td colSpan={7} className="border border-black px-4 py-2 text-right uppercase tracking-wider text-xs sm:text-sm">
                TOTAL PLY
              </td>
              <td className="border border-black px-2 py-2 text-center text-xs sm:text-sm font-black bg-blue-50/50">
                {totalPly.toLocaleString()}
              </td>
              <td className="border border-black px-2 py-2 text-center text-xs sm:text-sm font-black bg-emerald-50/50">
                {totalBoxQty.toLocaleString()}
              </td>
              <td className="border border-black px-2 py-2"></td>
              <td className="border border-black px-2 py-2 print:hidden"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bottom Quick Row Add button for convenience */}
      <div className="flex justify-between items-center print:hidden pt-2">
        <button
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Another Row at End
        </button>
        <span className="text-xs text-muted-foreground italic">
          Tip: Edits are automatically saved to your browser cache for this date.
        </span>
      </div>
    </div>
  );
}

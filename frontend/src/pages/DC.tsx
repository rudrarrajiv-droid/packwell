import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Calendar, FileDown, Loader2, Save, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../contexts/AuthContext';
import { getOutwardReelTransactionsByMonth, getReelsByIds } from '../lib/supabase/reelService';
import { getDCRecordsByMonth, saveDCRecord, type DCRecord } from '../lib/supabase/dcRecordService';
import { getAttendanceByMonth } from '../lib/supabase/attendanceService';

interface DCDailyRow {
  date: string;
  dayNum: number;
  skWeight: number;
  vk20Weight: number;
  vk22Weight: number;
  vk25Weight: number;
  vk28Weight: number;
  duplexWeight: number;
  totalWeight: number;
  totalAmount: number;
  manpowerCost: number;
  conversionCost: number;
  totalPly: number;
  scrap: number;
  isSavingPly: boolean;
  isSavingScrap: boolean;
}

export default function DC() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK1' | 'WEEK2' | 'WEEK3' | 'WEEK4' | 'DATE'>('MONTH');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState<DCDailyRow[]>([]);
  const [dcRecordsMap, setDcRecordsMap] = useState<Record<string, DCRecord>>({});

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [transactions, allReels, dcRecords, attendance] = await Promise.all([
        getOutwardReelTransactionsByMonth(selectedMonth),
        getReelsByIds([]), // Fetches all active reels
        getDCRecordsByMonth(selectedMonth),
        getAttendanceByMonth(selectedMonth)
      ]);

      setDcRecordsMap(dcRecords);

      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const daysInMonth = new Date(year, month, 0).getDate();

      const newRows: DCDailyRow[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
        
        let skWeight = 0;
        let vk20Weight = 0;
        let vk22Weight = 0;
        let vk25Weight = 0;
        let vk28Weight = 0;
        let duplexWeight = 0;
        let totalAmount = 0;

        // Filter transactions for this day
        const dayTx = transactions.filter(t => t.date.startsWith(dateStr));
        
        dayTx.forEach(tx => {
          const reel = allReels[tx.reelId];
          if (!reel) return;
          
          const qty = tx.quantity || 0;
          const rate = reel.rate || 0;
          const amt = qty * rate;

          const paperType = String(reel.paperType || '').toUpperCase();
          const bf = String(reel.bf || '');

          const pt = String(reel.paperType || '').toUpperCase();
          const bfNum = Number(reel.bf) || 0;

          if (pt.includes('SK') || pt.includes('SEMI') || (pt.includes('CHENNAI') && !pt.includes('DUP') && !pt.includes('HWC'))) {
            skWeight += qty;
          } else if (pt.includes('VK') || pt.includes('VIRGIN')) {
            if (bfNum <= 20) vk20Weight += qty;
            else if (bfNum > 20 && bfNum <= 22) vk22Weight += qty;
            else if (bfNum > 22 && bfNum <= 25) vk25Weight += qty;
            else vk28Weight += qty;
          } else if (pt.includes('DUPLEX') || pt.includes('HWC') || pt.includes('DUP')) {
            duplexWeight += qty;
          } else {
            // fallback
            skWeight += qty;
          }

          totalAmount += amt;
        });

        const totalWeight = skWeight + vk20Weight + vk22Weight + vk25Weight + vk28Weight + duplexWeight;

        // Calculate Manpower Cost
        const dayAttendance = attendance.filter(a => a.date === dateStr);
        const manpowerCost = dayAttendance.reduce((sum, a) => sum + (a.perDayAmount || 0) + (a.otAmount || 0) + (a.refreshment || 0), 0);

        // Hide row if neither material nor manpower cost exists
        if (totalWeight === 0 && manpowerCost === 0 && !dcRecords[dateStr]) {
          continue;
        }

        const conversionCost = totalWeight > 0 ? (manpowerCost / totalWeight) : 0;
        
        const ply = dcRecords[dateStr]?.totalPly || 0;
        const scrap = dcRecords[dateStr]?.scrap || 0;

        newRows.push({
          date: dateStr,
          dayNum: day,
          skWeight: Math.round(skWeight),
          vk20Weight: Math.round(vk20Weight),
          vk22Weight: Math.round(vk22Weight),
          vk25Weight: Math.round(vk25Weight),
          vk28Weight: Math.round(vk28Weight),
          duplexWeight: Math.round(duplexWeight),
          totalWeight: Math.round(totalWeight),
          totalAmount: Math.round(totalAmount),
          manpowerCost: Math.round(manpowerCost),
          conversionCost,
          totalPly: Math.round(ply),
          scrap: Math.round(scrap),
          isSavingPly: false,
          isSavingScrap: false
        });
      }

      setRows(newRows);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRecord = async (date: string, field: 'totalPly' | 'scrap', value: number) => {
    try {
      // Optimistic update
      setRows(prev => prev.map(r => r.date === date ? { 
        ...r, 
        [field]: value,
        [field === 'totalPly' ? 'isSavingPly' : 'isSavingScrap']: true 
      } : r));

      const existing = dcRecordsMap[date] || { date, totalPly: 0, scrap: 0 };
      const updated = { ...existing, [field]: value };
      
      await saveDCRecord(updated, user?.name || 'System');
      
      setDcRecordsMap(prev => ({ ...prev, [date]: updated }));
    } catch (error) {
      console.error(error);
      alert("Failed to save entry");
    } finally {
      setRows(prev => prev.map(r => r.date === date ? { 
        ...r, 
        [field === 'totalPly' ? 'isSavingPly' : 'isSavingScrap']: false 
      } : r));
    }
  };

  const filteredRows = useMemo(() => {
    if (viewMode === 'MONTH') return rows;
    if (viewMode === 'DATE') return rows.filter(r => r.date === selectedDate);
    
    return rows.filter(r => {
      if (viewMode === 'WEEK1') return r.dayNum >= 1 && r.dayNum <= 7;
      if (viewMode === 'WEEK2') return r.dayNum >= 8 && r.dayNum <= 14;
      if (viewMode === 'WEEK3') return r.dayNum >= 15 && r.dayNum <= 21;
      if (viewMode === 'WEEK4') return r.dayNum >= 22;
      return true;
    });
  }, [rows, viewMode, selectedDate]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert("No data available to export.");
      return;
    }

    const exportData = filteredRows.map(r => ({
      "Date": r.date,
      "Semi (SK)": r.skWeight,
      "Virgin 20 BF": r.vk20Weight,
      "Virgin 22 BF": r.vk22Weight,
      "Virgin 25 BF": r.vk25Weight,
      "Virgin 28 BF": r.vk28Weight,
      "Duplex": r.duplexWeight,
      "Total Weight (Kgs)": r.totalWeight,
      "Total Amount (₹)": r.totalAmount,
      "Total Ply": r.totalPly,
      "Manpower Cost (₹)": r.manpowerCost,
      "Conversion Cost / Kg": r.conversionCost.toFixed(2),
      "Scrap": r.scrap
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Conversion Report");
    
    XLSX.writeFile(workbook, `Conversion_Report_${selectedMonth}.xlsx`);
  };

  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      alert("No data available to export.");
      return;
    }

    const doc = new jsPDF('landscape');

    // ── Step 1: Figure out which optional columns have ANY data ──────────────
    const hasSK     = filteredRows.some(r => r.skWeight > 0);
    const hasVK20   = filteredRows.some(r => r.vk20Weight > 0);
    const hasVK22   = filteredRows.some(r => r.vk22Weight > 0);
    const hasVK25   = filteredRows.some(r => r.vk25Weight > 0);
    const hasVK28   = filteredRows.some(r => r.vk28Weight > 0);
    const hasDuplex = filteredRows.some(r => r.duplexWeight > 0);
    const hasPly    = filteredRows.some(r => r.totalPly > 0);
    const hasScrap  = filteredRows.some(r => r.scrap > 0);

    // ── Step 2: Build dynamic column list ───────────────────────────────────
    // Each entry: { label, key, getValue, getTotal }
    type ColDef = { label: string; getValue: (r: DCDailyRow) => string | number; getTotal: () => string | number; convKg?: boolean };

    const allCols: ColDef[] = [
      { label: 'Date',      getValue: r => new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), getTotal: () => 'TOTAL' },
      ...(hasSK     ? [{ label: 'SK',      getValue: (r: DCDailyRow) => r.skWeight     || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.skWeight,0)     || '-' }] : []),
      ...(hasVK20   ? [{ label: 'VK20',    getValue: (r: DCDailyRow) => r.vk20Weight   || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.vk20Weight,0)   || '-' }] : []),
      ...(hasVK22   ? [{ label: 'VK22',    getValue: (r: DCDailyRow) => r.vk22Weight   || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.vk22Weight,0)   || '-' }] : []),
      ...(hasVK25   ? [{ label: 'VK25',    getValue: (r: DCDailyRow) => r.vk25Weight   || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.vk25Weight,0)   || '-' }] : []),
      ...(hasVK28   ? [{ label: 'VK28',    getValue: (r: DCDailyRow) => r.vk28Weight   || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.vk28Weight,0)   || '-' }] : []),
      ...(hasDuplex ? [{ label: 'Duplex',  getValue: (r: DCDailyRow) => r.duplexWeight || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.duplexWeight,0) || '-' }] : []),
      { label: 'Tot Wt',   getValue: r => r.totalWeight  || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.totalWeight,0)  || '-' },
      { label: 'Tot Amt',  getValue: r => r.totalAmount  || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.totalAmount,0)  || '-' },
      ...(hasPly    ? [{ label: 'Tot Ply', getValue: (r: DCDailyRow) => r.totalPly     || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.totalPly,0)     || '-' }] : []),
      { label: 'Manpower', getValue: r => r.manpowerCost || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.manpowerCost,0) || '-' },
      { label: 'Conv/Kg',  getValue: r => r.conversionCost > 0 ? r.conversionCost.toFixed(2) : '-',
        getTotal: () => {
          const tw  = filteredRows.reduce((s,r)=>s+r.totalWeight,0);
          const tmc = filteredRows.reduce((s,r)=>s+r.manpowerCost,0);
          return tw > 0 ? (tmc/tw).toFixed(2) : '-';
        },
        convKg: true },
      ...(hasScrap  ? [{ label: 'Scrap',   getValue: (r: DCDailyRow) => r.scrap        || '-', getTotal: () => filteredRows.reduce((s,r)=>s+r.scrap,0)        || '-' }] : []),
    ];

    const tableColumn = allCols.map(c => c.label);
    const tableRows   = filteredRows.map(row => allCols.map(c => c.getValue(row)));
    const totalsRow   = allCols.map(c => c.getTotal());

    // Index of Conv/Kg column in the final column list
    const convKgColIndex = allCols.findIndex(c => c.convKg);

    // ── Step 3: Totals row value for Conv/Kg (for colour logic) ─────────────
    const convKgTotal = filteredRows.reduce((s,r)=>s+r.totalWeight,0) > 0
      ? parseFloat((filteredRows.reduce((s,r)=>s+r.manpowerCost,0) / filteredRows.reduce((s,r)=>s+r.totalWeight,0)).toFixed(2))
      : 0;

    // ── Step 4: Auto-calculate font & padding to fit ALL rows in ONE page ────
    // Landscape A4 usable height ≈ 190mm. Title=15mm, startY=20mm → 170mm left.
    // Each row ≈ fontSize + 2*cellPadding (mm). Solve for fontSize.
    const totalDataRows = filteredRows.length + 2; // +1 header +1 footer
    const pageUsableH   = 170; // mm available after title
    // Try to fit: rowH = fontSize*0.352 + 2*padding (rough pt→mm conversion)
    // We keep padding proportional: padding = fontSize * 0.18
    // pageUsableH = totalDataRows * (fontSize*0.352 + 2*fontSize*0.18)
    // pageUsableH = totalDataRows * fontSize * (0.352 + 0.36)
    // fontSize = pageUsableH / (totalDataRows * 0.712)
    let autoFontSize  = Math.floor(pageUsableH / (totalDataRows * 0.712));
    autoFontSize      = Math.min(9, Math.max(5, autoFontSize)); // clamp 5–9
    const autoPadding = Math.max(1, Math.floor(autoFontSize * 0.18));
    const footFontSize = Math.min(10, autoFontSize + 1);

    // ── Step 5: Title ────────────────────────────────────────────────────────
    doc.setFontSize(13);
    doc.setTextColor(30, 60, 120);
    doc.text(`Daily Conversion Report - ${selectedMonth}`, 14, 13);
    doc.setTextColor(0, 0, 0);

    // ── Step 6: Render table (single page) ───────────────────────────────────
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 18,
      // ── Force single page: no page breaks inside table ────────────────────
      pageBreak: 'avoid',
      rowPageBreak: 'avoid',
      showHead: 'firstPage',
      showFoot: 'lastPage',
      styles: {
        fontSize: autoFontSize,
        cellPadding: autoPadding,
        overflow: 'linebreak',
        halign: 'center',
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: autoFontSize,
        cellPadding: autoPadding,
      },
      // ── Total row (foot) ──────────────────────────────────────────────────
      foot: [totalsRow],
      footStyles: {
        fillColor: [28, 40, 80],    // Dark navy background
        textColor: [255, 255, 255], // White text
        fontStyle: 'bold',
        fontSize: footFontSize,
        cellPadding: autoPadding,
      },
      // ── Per-cell overrides for Conv/Kg in the totals row ──────────────────
      didDrawCell: (data) => {
        if (data.section === 'foot' && data.column.index === convKgColIndex && convKgColIndex >= 0) {
          const { x, y, width, height } = data.cell;
          doc.setFillColor(255, 180, 0); // Bright gold
          doc.rect(x, y, width, height, 'F');
          doc.setFontSize(footFontSize + 1);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(80, 20, 0);
          const cellText = String(convKgTotal > 0 ? `${convKgTotal.toFixed(2)}` : '-');
          doc.text(cellText, x + width / 2, y + height / 2 + 1.2, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(autoFontSize);
          doc.setFont('helvetica', 'normal');
        }
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' }, // Date column left-aligned
        ...(convKgColIndex >= 0 ? { [convKgColIndex]: { halign: 'center', fontStyle: 'bold' } } : {})
      }
    });

    doc.save(`Conversion_Report_${selectedMonth}.pdf`);
  };

  const thClass = "px-3 py-3 border-b border-border text-left font-medium text-muted-foreground whitespace-nowrap bg-muted/50";
  const tdClass = "px-3 py-3 border-b border-border";

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-primary" />
            Daily Conversion Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Aggregated view of daily inventory consumption and manpower cost</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex space-x-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center px-4 py-2 bg-green-600/10 text-green-600 font-medium rounded-lg hover:bg-green-600/20 transition-colors shadow-sm text-sm border border-green-600/20"
              title="Export Excel"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 bg-red-600/10 text-red-600 font-medium rounded-lg hover:bg-red-600/20 transition-colors shadow-sm text-sm border border-red-600/20"
              title="Export PDF"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </button>
          </div>
          
          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as any)}
            className="px-3 py-2 border border-input rounded-lg bg-background font-medium shadow-sm"
          >
            <option value="MONTH">Full Month</option>
            <option value="WEEK1">Week 1 (1-7)</option>
            <option value="WEEK2">Week 2 (8-14)</option>
            <option value="WEEK3">Week 3 (15-21)</option>
            <option value="WEEK4">Week 4 (22+)</option>
            <option value="DATE">Specific Date</option>
          </select>

          {viewMode === 'DATE' ? (
            <input 
              type="date" 
              className="px-4 py-2 border border-input rounded-lg bg-background font-medium shadow-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <input 
                type="month" 
                className="px-4 py-2 border border-input rounded-lg bg-background font-medium shadow-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground sticky top-0 z-10 shadow-sm">
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Semi (SK)</th>
                <th className={thClass}>Virgin 20 BF</th>
                <th className={thClass}>Virgin 22 BF</th>
                <th className={thClass}>Virgin 25 BF</th>
                <th className={thClass}>Virgin 28 BF</th>
                <th className={thClass}>Duplex</th>
                <th className={thClass}>Total Wt (Kgs)</th>
                <th className={thClass}>Total Amount</th>
                <th className={thClass}>Total Ply</th>
                <th className={thClass}>Manpower Cost</th>
                <th className={thClass}>Conv. Cost / Kg</th>
                <th className={thClass}>Scrap</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                    Calculating daily conversions...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-muted-foreground">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No production or manpower data found for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const costOk = row.conversionCost > 0 && row.conversionCost <= 5;
                  const costHigh = row.conversionCost > 5;
                  const rowBg = costOk ? 'bg-green-50 hover:bg-green-100' : costHigh ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-muted/50';
                  return (
                  <tr key={row.date} className={`transition-colors ${rowBg}`}>
                    <td className={`${tdClass} font-medium text-foreground whitespace-nowrap`}>
                      {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className={tdClass}>{row.skWeight || '-'}</td>
                    <td className={tdClass}>{row.vk20Weight || '-'}</td>
                    <td className={tdClass}>{row.vk22Weight || '-'}</td>
                    <td className={tdClass}>{row.vk25Weight || '-'}</td>
                    <td className={tdClass}>{row.vk28Weight || '-'}</td>
                    <td className={tdClass}>{row.duplexWeight || '-'}</td>
                    
                    <td className={`${tdClass} font-semibold text-primary`}>{row.totalWeight || '-'}</td>
                    <td className={tdClass}>{row.totalAmount ? `₹${row.totalAmount}` : '-'}</td>
                    
                    <td className={tdClass}>
                      <div className="relative w-20">
                        <input
                          type="number"
                          className={`w-full px-2 py-1 bg-background border ${row.isSavingPly ? 'border-primary opacity-50' : 'border-input'} rounded-md`}
                          value={row.totalPly || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRows(prev => prev.map(r => r.date === row.date ? { ...r, totalPly: val } : r));
                          }}
                          onBlur={(e) => handleUpdateRecord(row.date, 'totalPly', Number(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    </td>
                    
                    <td className={tdClass}>{row.manpowerCost ? `₹${row.manpowerCost}` : '-'}</td>
                    
                    <td className={`${tdClass} font-bold`}>
                      <span className={row.conversionCost > 5 ? 'text-red-600' : row.conversionCost > 0 ? 'text-green-700' : 'text-muted-foreground'}>
                        {row.conversionCost > 0 ? `₹${row.conversionCost.toFixed(2)}` : '-'}
                      </span>
                    </td>
                    
                    <td className={tdClass}>
                      <div className="relative w-20">
                        <input
                          type="number"
                          className={`w-full px-2 py-1 bg-background border ${row.isSavingScrap ? 'border-primary opacity-50' : 'border-input'} rounded-md`}
                          value={row.scrap || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRows(prev => prev.map(r => r.date === row.date ? { ...r, scrap: val } : r));
                          }}
                          onBlur={(e) => handleUpdateRecord(row.date, 'scrap', Number(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
            {/* Grand Totals */}
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-primary">
                <tr style={{ background: 'linear-gradient(90deg, #1e2d5a 0%, #2563eb 100%)' }}>
                  <td className="px-3 py-4 text-right font-black text-white uppercase tracking-widest text-sm">
                    TOTAL
                  </td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.skWeight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.vk20Weight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.vk22Weight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.vk25Weight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.vk28Weight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.duplexWeight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-white">{filteredRows.reduce((s, r) => s + r.totalWeight, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-white">₹{filteredRows.reduce((s, r) => s + r.totalAmount, 0)}</td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.totalPly, 0) || '-'}</td>
                  <td className="px-3 py-4 font-bold text-white">₹{filteredRows.reduce((s, r) => s + r.manpowerCost, 0)}</td>
                  {/* ★ Conv/Kg total — specially highlighted ★ */}
                  <td className="px-3 py-3">
                    {(() => {
                      const tw = filteredRows.reduce((s, r) => s + r.totalWeight, 0);
                      const tmc = filteredRows.reduce((s, r) => s + r.manpowerCost, 0);
                      const avgCost = tw > 0 ? tmc / tw : null;
                      if (!avgCost) return <span className="text-blue-300">-</span>;
                      const isHigh = avgCost > 5;
                      return (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            background: isHigh
                              ? 'linear-gradient(135deg, #ff4e50, #f9d423)'
                              : 'linear-gradient(135deg, #f9d423, #56ab2f)',
                            color: '#1a1a1a',
                            fontWeight: 900,
                            fontSize: '1rem',
                            letterSpacing: '0.02em',
                            boxShadow: '0 0 12px 3px rgba(249,212,35,0.6)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ₹{avgCost.toFixed(2)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-4 font-bold text-blue-200">{filteredRows.reduce((s, r) => s + r.scrap, 0) || '-'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

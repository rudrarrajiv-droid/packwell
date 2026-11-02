import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Plus, Trash2, Printer, Download, RotateCcw, Save, 
  Calendar, Check, Share2, Sparkles, AlertCircle, 
  CheckCircle2, ArrowUpDown, ChevronUp, ChevronDown, 
  Search, Eye, EyeOff 
} from 'lucide-react';
import type { CorrugationPlanningRow } from './PlanningTypes';
import { getProducts } from '../../lib/supabase/productService';
import { exportToExcel } from '../../lib/exportUtils';
import { cn } from '../../lib/utils';

const formatTodayDate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createBlankRow = (sNo: number): CorrugationPlanningRow => ({
  id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  sNo,
  customerName: '',
  jobName: '',
  reelSize: '',
  cutSize: '',
  ups: 1,
  fluteType: 'B',
  nosOfPly: '',
  boxQty: '',
  remarks: '',
  isDone: false
});

/**
 * Loads planning for the selected date.
 * If no plan exists for this date, carries forward uncompleted (active) jobs
 * from the most recently saved planning date. If none found, opens with 1 blank row.
 */
const getInitialRowsForDate = (date: string): CorrugationPlanningRow[] => {
  // 1. Check if this date already has saved planning in localStorage
  const saved = localStorage.getItem(`packwell_corrugation_planning_${date}`);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing saved planning for', date, e);
    }
  }

  // 2. Scan all saved dates to find most recent date with pending jobs (Point 7)
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('packwell_corrugation_planning_'));
  const sortedDates = allKeys
    .map(k => k.replace('packwell_corrugation_planning_', ''))
    .filter(d => d < date)
    .sort()
    .reverse();

  for (const prevDate of sortedDates) {
    const prevData = localStorage.getItem(`packwell_corrugation_planning_${prevDate}`);
    if (prevData) {
      try {
        const parsed: CorrugationPlanningRow[] = JSON.parse(prevData);
        // Carry forward only incomplete/pending jobs
        const pendingJobs = parsed.filter(r => !r.isDone && (r.jobName || r.customerName));
        if (pendingJobs.length > 0) {
          return pendingJobs.map((r, idx) => ({
            ...r,
            id: `c-${Date.now()}-${idx}`,
            sNo: idx + 1,
            isDone: false
          }));
        }
      } catch (e) {
        console.error('Error carrying forward planning from', prevDate, e);
      }
    }
  }

  // 3. Otherwise open with 1 single blank row (Point 1)
  return [createBlankRow(1)];
};

export default function CorrugationPlanningSheet() {
  const [selectedDate, setSelectedDate] = useState<string>(formatTodayDate);
  const [rows, setRows] = useState<CorrugationPlanningRow[]>(() => getInitialRowsForDate(formatTodayDate()));
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  const [savedToast, setSavedToast] = useState(false);
  const [whatsappToast, setWhatsappToast] = useState(false);

  // Autocomplete state
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Input refs for keyboard navigation and auto-focus
  const jobNameInputRefs = useRef<{ [rowId: string]: HTMLInputElement | null }>({});
  const boxQtyInputRefs = useRef<{ [rowId: string]: HTMLInputElement | null }>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // 1. Fetch Master Data Products
  const { data: masterProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as Promise<any[]>,
    staleTime: 1000 * 60 * 10
  });

  // Load rows when selectedDate changes
  useEffect(() => {
    const loadedRows = getInitialRowsForDate(selectedDate);
    setRows(loadedRows);
  }, [selectedDate]);

  // Auto-focus cursor in Job Name of the first row on mount (Point 2)
  useEffect(() => {
    if (rows.length > 0 && !rows[0].jobName) {
      const firstId = rows[0].id;
      setTimeout(() => {
        jobNameInputRefs.current[firstId]?.focus();
      }, 100);
    }
  }, [selectedDate]);

  // Save to localStorage
  const saveToLocalStorage = (updatedRows: CorrugationPlanningRow[]) => {
    try {
      localStorage.setItem(`packwell_corrugation_planning_${selectedDate}`, JSON.stringify(updatedRows));
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualSave = () => {
    saveToLocalStorage(rows);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  // Helper to calculate dropdown position safely outside the table container
  const updateDropdownPosition = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 260;
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setDropdownPos({
      top: showAbove ? Math.max(10, rect.top - dropdownHeight - 4) : rect.bottom + 4,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - 420)),
      width: Math.max(380, rect.width)
    });
  };

  // Keep dropdown aligned if user scrolls or resizes
  useEffect(() => {
    const handleScrollOrResize = () => {
      if (activeSearchRowId && jobNameInputRefs.current[activeSearchRowId]) {
        updateDropdownPosition(jobNameInputRefs.current[activeSearchRowId]!);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeSearchRowId]);

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSearchRowId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered products for smart autocomplete (Point 2)
  const searchMatches = useMemo(() => {
    if (!activeSearchRowId) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      // If empty, show first 12 master products
      return masterProducts.slice(0, 12);
    }
    return masterProducts
      .filter((p: any) => {
        const item = String(p.itemName || '').toLowerCase();
        const cust = String(p.customerName || '').toLowerCase();
        return item.includes(q) || cust.includes(q);
      })
      .slice(0, 15);
  }, [activeSearchRowId, searchQuery, masterProducts]);

  // Select product from Master Data (Point 3)
  const handleSelectProduct = (rowId: string, product: any) => {
    setRows(prev => {
      const updated = prev.map(r => {
        if (r.id !== rowId) return r;
        const ups = Number(product.ups) > 0 ? Number(product.ups) : 1;
        const currentBoxQty = Number(r.boxQty || 0);
        const nosOfPly = currentBoxQty > 0 ? Math.round(currentBoxQty / ups) : r.nosOfPly;

        return {
          ...r,
          jobName: product.itemName || '',
          customerName: product.customerName || '',
          reelSize: product.reelSize || '',
          cutSize: product.cutSize || '',
          ups: ups,
          fluteType: product.flute || 'B',
          nosOfPly: nosOfPly
        };
      });
      saveToLocalStorage(updated);
      return updated;
    });

    setActiveSearchRowId(null);
    setSearchQuery('');
    setDropdownPos(null);

    // Focus into Box Qty automatically!
    setTimeout(() => {
      boxQtyInputRefs.current[rowId]?.focus();
      boxQtyInputRefs.current[rowId]?.select();
    }, 60);
  };

  // Update cell field
  const updateRow = (id: string, field: keyof CorrugationPlanningRow, value: any) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        const newRow = { ...row, [field]: value };

        // Point 4: Box Qty auto-calculates Nos of Ply
        if (field === 'boxQty') {
          const boxNum = parseFloat(value);
          const upsNum = parseFloat(String(row.ups || 1));
          if (!isNaN(boxNum) && !isNaN(upsNum) && upsNum > 0) {
            newRow.nosOfPly = Math.round(boxNum / upsNum);
          }
        } else if (field === 'ups') {
          const upsNum = parseFloat(value);
          const boxNum = parseFloat(String(row.boxQty || 0));
          if (!isNaN(boxNum) && !isNaN(upsNum) && upsNum > 0) {
            newRow.nosOfPly = Math.round(boxNum / upsNum);
          }
        }
        return newRow;
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Add new row below (Point 5)
  const addRow = (insertAfterIndex?: number) => {
    const newRowId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRows(prev => {
      const newSNo = (insertAfterIndex !== undefined ? insertAfterIndex + 2 : prev.length + 1);
      const newRow = createBlankRow(newSNo);
      newRow.id = newRowId;

      let nextRows = [...prev];
      if (insertAfterIndex !== undefined && insertAfterIndex >= 0) {
        nextRows.splice(insertAfterIndex + 1, 0, newRow);
      } else {
        nextRows.push(newRow);
      }

      // Re-index sNo
      const reindexed = nextRows.map((r, i) => ({ ...r, sNo: i + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });

    // Auto-focus on Job Name of new row
    setTimeout(() => {
      jobNameInputRefs.current[newRowId]?.focus();
    }, 60);
  };

  // Point 5: Enter on Box Qty creates new row below and focuses on Job Name
  const handleBoxQtyKeyDown = (e: React.KeyboardEvent, rowId: string, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow(idx);
    }
  };

  // Point 6: Priority-wise S.No reordering
  const handleSNoChange = (rowId: string, newTargetSNoStr: string) => {
    const newTargetSNo = parseInt(newTargetSNoStr, 10);
    if (isNaN(newTargetSNo) || newTargetSNo <= 0) return;

    setRows(prev => {
      const currentIndex = prev.findIndex(r => r.id === rowId);
      if (currentIndex === -1) return prev;

      const targetIndex = Math.min(prev.length - 1, Math.max(0, newTargetSNo - 1));
      if (currentIndex === targetIndex) return prev;

      const clone = [...prev];
      const [movedRow] = clone.splice(currentIndex, 1);
      clone.splice(targetIndex, 0, movedRow);

      // Re-sequence 1, 2, 3...
      const reindexed = clone.map((r, i) => ({ ...r, sNo: i + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });
  };

  const moveRow = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    setRows(prev => {
      const clone = [...prev];
      const [row] = clone.splice(index, 1);
      clone.splice(targetIndex, 0, row);
      const reindexed = clone.map((r, i) => ({ ...r, sNo: i + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });
  };

  // Point 7: Mark Job as Done / Complete
  const markJobDone = (id: string) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, isDone: true } : r);
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const restoreJob = (id: string) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, isDone: false } : r);
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const deleteRow = (id: string) => {
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== id);
      const result = filtered.length > 0 ? filtered : [createBlankRow(1)];
      const reindexed = result.map((r, idx) => ({ ...r, sNo: idx + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });
  };

  const clearAll = () => {
    if (window.confirm('Clear all jobs for this planning date and start with 1 blank row?')) {
      const emptyRow = createBlankRow(1);
      setRows([emptyRow]);
      saveToLocalStorage([emptyRow]);
      setTimeout(() => {
        jobNameInputRefs.current[emptyRow.id]?.focus();
      }, 60);
    }
  };

  // Visible rows based on showCompleted toggle
  const visibleRows = useMemo(() => {
    if (showCompleted) return rows;
    return rows.filter(r => !r.isDone);
  }, [rows, showCompleted]);

  const completedCount = useMemo(() => rows.filter(r => r.isDone).length, [rows]);
  const activeCount = useMemo(() => rows.filter(r => !r.isDone).length, [rows]);

  // Calculations for active visible rows
  const totalPly = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      const val = parseFloat(String(row.nosOfPly || 0));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [visibleRows]);

  const totalBoxQty = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      const val = parseFloat(String(row.boxQty || 0));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [visibleRows]);

  // Export to Excel
  const exportExcel = () => {
    const exportData = visibleRows.map(r => ({
      'S No.': r.sNo,
      'CUSTOMER NAME': r.customerName,
      'JOB NAME': r.jobName,
      'REEL SIZE': r.reelSize ?? '',
      'CUT SIZE': r.cutSize ?? '',
      'UPS': r.ups ?? '',
      'FLUTE type': r.fluteType ?? '',
      'NOS OF PLY': r.nosOfPly ?? '',
      'BOX QTY.': r.boxQty ?? '',
      'REMARKS.': r.remarks ?? '',
      'STATUS': r.isDone ? 'COMPLETED' : 'PENDING'
    }));

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
      'REMARKS.': '' as any,
      'STATUS': '' as any
    });

    exportToExcel(exportData, `Corrugation_Machine_Planning_${selectedDate}`);
  };

  // WhatsApp Copy
  const copyWhatsApp = () => {
    let text = `*CORRUGATION MACHINE PLANNING (${selectedDate})*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    visibleRows.forEach((r, idx) => {
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
      {/* Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-sm print:hidden">
        {/* Left: Planning Date Selector & Carry-Forward Info */}
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {activeCount} Active Jobs
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Total Ply: {totalPly.toLocaleString()}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Total Boxes: {totalBoxQty.toLocaleString()}
            </span>

            {/* Toggle Completed Jobs */}
            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                  showCompleted 
                    ? "bg-purple-100 text-purple-900 border-purple-300" 
                    : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                )}
              >
                {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showCompleted ? 'Hide Completed' : `Show Done (${completedCount})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => addRow()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>

          <button
            type="button"
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Saves planning for this date"
          >
            <Save className="w-4 h-4" />
            Save Plan
          </button>

          <button
            type="button"
            onClick={copyWhatsApp}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Copy formatted text to send on WhatsApp for MD"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </button>

          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-secondary text-foreground text-xs font-medium rounded-lg border border-border shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Excel
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-secondary text-foreground text-xs font-medium rounded-lg border border-border shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-primary" />
            Print / PDF
          </button>

          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            title="Clear all rows"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Notifications */}
      {savedToast && (
        <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-emerald-600" />
          Corrugation Planning saved successfully for {selectedDate}!
        </div>
      )}
      {whatsappToast && (
        <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg border border-green-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-green-600" />
          Copied WhatsApp planning summary to clipboard!
        </div>
      )}

      {/* Smart Autocomplete Helper Bar */}
      <div className="text-xs text-muted-foreground bg-blue-50/60 p-2.5 rounded-lg border border-blue-200 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>
            <strong>Smart Master Data Typing:</strong> Start typing any job name or size $\to$ dropdown filters automatically $\to$ selecting fills all specs $\to$ enter <strong>Box Qty</strong> $\to$ press <strong>Enter</strong> to create next row!
          </span>
        </div>
        <span className="font-semibold text-blue-800">
          Priority Change: Change <strong>S No.</strong> to shift job position!
        </span>
      </div>

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
              <th className="border border-black px-2 py-2 w-16 text-center" title="Edit number to change priority">
                S No.
              </th>
              <th className="border border-black px-3 py-2 text-left min-w-[170px]">CUSTOMER NAME</th>
              <th className="border border-black px-3 py-2 text-left min-w-[220px]">JOB NAME</th>
              <th className="border border-black px-2 py-2 w-20 text-center">REEL SIZE</th>
              <th className="border border-black px-2 py-2 w-20 text-center">CUT SIZE</th>
              <th className="border border-black px-2 py-2 w-14 text-center">UPS</th>
              <th className="border border-black px-2 py-2 w-16 text-center">FLUTE<br />type</th>
              <th className="border border-black px-2 py-2 w-24 text-center">NOS OF PLY</th>
              <th className="border border-black px-2 py-2 w-24 text-center">BOX QTY.</th>
              <th className="border border-black px-3 py-2 min-w-[140px] text-center bg-[#ffff00] text-black font-extrabold">
                REMARKS.
              </th>
              <th className="border border-black px-2 py-2 w-24 text-center print:hidden bg-gray-200">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-gray-500 font-semibold">
                  No active jobs for this date. Click below to add a job!
                </td>
              </tr>
            ) : (
              visibleRows.map((row, idx) => {
                return (
                  <tr 
                    key={row.id} 
                    className={cn(
                      "hover:bg-blue-50/40 transition-colors",
                      row.isDone ? "bg-emerald-50/30 opacity-70" : ""
                    )}
                  >
                    {/* S No - Editable for Priority Shift (Point 6) */}
                    <td className="border border-black px-1 py-1 text-center font-bold">
                      <div className="flex items-center justify-center gap-0.5">
                        <input
                          type="number"
                          min="1"
                          max={rows.length}
                          value={row.sNo}
                          onChange={(e) => handleSNoChange(row.id, e.target.value)}
                          className="w-10 text-center font-bold text-black bg-transparent border-none focus:outline-none focus:bg-yellow-200 rounded py-0.5"
                          title="Type priority position to move job"
                        />
                        <div className="flex flex-col print:hidden opacity-40 hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => moveRow(idx, 'UP')}
                            disabled={idx === 0}
                            className="p-0.5 hover:text-blue-600 disabled:opacity-20 cursor-pointer"
                          >
                            <ChevronUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(idx, 'DOWN')}
                            disabled={idx === rows.length - 1}
                            className="p-0.5 hover:text-blue-600 disabled:opacity-20 cursor-pointer"
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
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

                    {/* Job Name with Smart Master Data Dropdown (Point 2 & 3) */}
                    <td className="border border-black px-2 py-1 font-semibold">
                      <input
                        ref={(el) => { jobNameInputRefs.current[row.id] = el; }}
                        type="text"
                        value={row.jobName}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateRow(row.id, 'jobName', val.toUpperCase());
                          setActiveSearchRowId(row.id);
                          setSearchQuery(val);
                          setHighlightedIndex(0);
                          updateDropdownPosition(e.currentTarget);
                        }}
                        onFocus={(e) => {
                          setActiveSearchRowId(row.id);
                          setSearchQuery(row.jobName || '');
                          setHighlightedIndex(0);
                          updateDropdownPosition(e.currentTarget);
                        }}
                        onKeyDown={(e) => {
                          if (activeSearchRowId === row.id && searchMatches.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedIndex((prev) => (prev + 1) % searchMatches.length);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSelectProduct(row.id, searchMatches[highlightedIndex]);
                            } else if (e.key === 'Escape') {
                              setActiveSearchRowId(null);
                            }
                          }
                        }}
                        placeholder="Type to search master products..."
                        className="w-full bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-100 px-1 py-0.5 rounded uppercase"
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

                    {/* Nos of Ply (Auto-calculated from Box Qty, editable) (Point 4) */}
                    <td className="border border-black px-2 py-1 text-center font-black">
                      <input
                        type="number"
                        value={row.nosOfPly ?? ''}
                        onChange={(e) => updateRow(row.id, 'nosOfPly', e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent text-center font-black text-blue-900 border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                      />
                    </td>

                    {/* Box Qty (Press Enter to create new row below) (Point 5) */}
                    <td className="border border-black px-2 py-1 text-center font-black">
                      <input
                        ref={(el) => { boxQtyInputRefs.current[row.id] = el; }}
                        type="number"
                        value={row.boxQty ?? ''}
                        onChange={(e) => updateRow(row.id, 'boxQty', e.target.value)}
                        onKeyDown={(e) => handleBoxQtyKeyDown(e, row.id, idx)}
                        placeholder="0"
                        className="w-full bg-transparent text-center font-black text-black border-none focus:outline-none focus:bg-yellow-200 px-1 py-0.5 rounded shadow-xs"
                        title="Enter Box Qty and press ENTER to add next row"
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

                    {/* Actions: Done checkmark & Delete (Point 7) */}
                    <td className="border border-black px-1 py-1 text-center print:hidden bg-gray-50/50">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Point 7: Mark Job as Done */}
                        {row.isDone ? (
                          <button
                            type="button"
                            onClick={() => restoreJob(row.id)}
                            className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors cursor-pointer"
                            title="Click to restore to active"
                          >
                            ✓ Done
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markJobDone(row.id)}
                            className="p-1 text-emerald-700 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                            title="Mark Job Complete (Removes from tomorrow's carry-forward)"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete Row */}
                        <button
                          type="button"
                          onClick={() => deleteRow(row.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          title="Delete Row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer Total Row */}
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-black font-extrabold text-black">
              <td colSpan={7} className="border border-black px-4 py-2 text-right uppercase tracking-wider text-xs sm:text-sm">
                TOTAL PLY ({visibleRows.length} ACTIVE JOBS)
              </td>
              <td className="border border-black px-2 py-2 text-center text-xs sm:text-sm font-black bg-blue-100/70">
                {totalPly.toLocaleString()}
              </td>
              <td className="border border-black px-2 py-2 text-center text-xs sm:text-sm font-black bg-emerald-100/70">
                {totalBoxQty.toLocaleString()}
              </td>
              <td className="border border-black px-2 py-2"></td>
              <td className="border border-black px-2 py-2 print:hidden bg-gray-200"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FIXED FLOATING DROPDOWN (Rendered completely outside table container so it is NEVER clipped) */}
      {activeSearchRowId && searchMatches.length > 0 && dropdownPos && (
        <div 
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            zIndex: 99999
          }}
          onMouseDown={(e) => e.preventDefault()} // Prevents input blur on mouse click
          className="bg-white border-2 border-blue-600 rounded-xl shadow-2xl overflow-hidden divide-y divide-gray-100 text-xs animate-in fade-in"
        >
          <div className="bg-blue-600 text-white font-bold px-3 py-1.5 flex items-center justify-between text-[11px]">
            <span>Master Data Matching ({searchMatches.length})</span>
            <span className="text-blue-100 font-normal text-[10px]">Click or Press Enter</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {searchMatches.map((prod: any, pIdx: number) => (
              <button
                key={prod.id || pIdx}
                type="button"
                onClick={() => handleSelectProduct(activeSearchRowId, prod)}
                onMouseEnter={() => setHighlightedIndex(pIdx)}
                className={cn(
                  "w-full text-left p-2.5 transition-colors cursor-pointer block border-b border-gray-100 last:border-b-0",
                  highlightedIndex === pIdx ? "bg-blue-100 text-blue-950 font-semibold" : "hover:bg-gray-50 text-gray-800"
                )}
              >
                <div className="font-extrabold text-sm text-black flex items-center justify-between">
                  <span>{prod.itemName}</span>
                  <span className="text-[11px] font-black px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                    UPS: {prod.ups || 1}
                  </span>
                </div>
                <div className="text-xs text-gray-600 font-medium mt-0.5 flex items-center justify-between">
                  <span>Party: <strong>{prod.customerName}</strong></span>
                  <span>Reel: {prod.reelSize}" | Cut: {prod.cutSize}" | Flute: {prod.flute || 'B'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row Add Helper */}
      <div className="flex flex-wrap justify-between items-center print:hidden pt-2 gap-3">
        <button
          type="button"
          onClick={() => addRow()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Another Row at End
        </button>
        <span className="text-xs text-muted-foreground italic">
          Tip: In <strong>Box Qty</strong>, press <strong>Enter</strong> to instantly add the next row!
        </span>
      </div>
    </div>
  );
}

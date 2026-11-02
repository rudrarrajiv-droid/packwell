import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Plus, Trash2, Printer, Download, RotateCcw, Save, 
  Calendar, Check, Share2, Sparkles, CheckCircle2, Eye, EyeOff 
} from 'lucide-react';
import { exportToExcel } from '../../lib/exportUtils';
import type { DispatchPlanGroup, DispatchPlanItem } from './PlanningTypes';
import { INITIAL_DISPATCH_GROUPS } from './samplePlanningData';
import { getProducts } from '../../lib/supabase/productService';
import { cn } from '../../lib/utils';

const formatTodayDate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateToDMY = (dateStr: string): string => {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      // YYYY-MM-DD -> DD-MM-YYYY
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
};

const createBlankGroup = (sNo: number, date: string): DispatchPlanGroup => ({
  id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  sNo,
  dispatchDate: date,
  customerName: '',
  items: [
    {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      jobName: '',
      qty: '',
      isDone: false
    }
  ]
});

/**
 * Loads Dispatch Planning for the selected date.
 * If no plan exists for this date, carries forward uncompleted (active) items
 * from the most recently saved planning date. If none found, falls back to sample/blank.
 */
const getInitialGroupsForDate = (date: string): DispatchPlanGroup[] => {
  // 1. Check if this date already has saved planning in localStorage
  const saved = localStorage.getItem(`packwell_dispatch_planning_${date}`);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing saved dispatch planning for', date, e);
    }
  }

  // 2. Scan all saved dates to find most recent date with pending jobs
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith('packwell_dispatch_planning_'));
  const sortedDates = allKeys
    .map(k => k.replace('packwell_dispatch_planning_', ''))
    .filter(d => d < date)
    .sort()
    .reverse();

  for (const prevDate of sortedDates) {
    const prevData = localStorage.getItem(`packwell_dispatch_planning_${prevDate}`);
    if (prevData) {
      try {
        const parsed: DispatchPlanGroup[] = JSON.parse(prevData);
        // Carry forward only incomplete/pending items
        const pendingGroups: DispatchPlanGroup[] = [];
        parsed.forEach((grp) => {
          const pendingItems = grp.items.filter(it => !it.isDone && (it.jobName || it.qty));
          if (pendingItems.length > 0) {
            pendingGroups.push({
              ...grp,
              id: `grp-${Date.now()}-${pendingGroups.length + 1}`,
              sNo: pendingGroups.length + 1,
              dispatchDate: date, // update to new date
              items: pendingItems.map((it, itIdx) => ({
                ...it,
                id: `item-${Date.now()}-${pendingGroups.length}-${itIdx}`,
                isDone: false
              }))
            });
          }
        });

        if (pendingGroups.length > 0) {
          return pendingGroups;
        }
      } catch (e) {
        console.error('Error carrying forward dispatch planning from', prevDate, e);
      }
    }
  }

  // 3. If no previous saved date exists, return INITIAL_DISPATCH_GROUPS
  return INITIAL_DISPATCH_GROUPS;
};

export default function DispatchPlanningSheet() {
  const [planDate, setPlanDate] = useState<string>(formatTodayDate);
  const [groups, setGroups] = useState<DispatchPlanGroup[]>(() => getInitialGroupsForDate(formatTodayDate()));
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  const [savedToast, setSavedToast] = useState(false);
  const [whatsappToast, setWhatsappToast] = useState(false);

  // Autocomplete state
  const [activeSearchKey, setActiveSearchKey] = useState<{ groupId: string; itemId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Input refs for keyboard navigation and auto-focus
  const itemInputRefs = useRef<{ [itemId: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [itemId: string]: HTMLInputElement | null }>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fetch Master Data Products from Supabase
  const { data: masterProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as Promise<any[]>,
    staleTime: 1000 * 60 * 10
  });

  // Load from localStorage or carry-forward when planDate changes
  useEffect(() => {
    const loaded = getInitialGroupsForDate(planDate);
    setGroups(loaded);
  }, [planDate]);

  const saveToLocalStorage = (updatedGroups: DispatchPlanGroup[]) => {
    try {
      localStorage.setItem(`packwell_dispatch_planning_${planDate}`, JSON.stringify(updatedGroups));
    } catch (e) {
      console.error('Error saving dispatch plan', e);
    }
  };

  const handleManualSave = () => {
    saveToLocalStorage(groups);
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
      if (activeSearchKey && itemInputRefs.current[activeSearchKey.itemId]) {
        updateDropdownPosition(itemInputRefs.current[activeSearchKey.itemId]!);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeSearchKey]);

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSearchKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered products for smart autocomplete (matches item name or customer name)
  const searchMatches = useMemo(() => {
    if (!activeSearchKey) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return masterProducts.slice(0, 15);
    }
    return masterProducts
      .filter((p: any) => {
        const item = String(p.itemName || '').toLowerCase();
        const cust = String(p.customerName || '').toLowerCase();
        return item.includes(q) || cust.includes(q);
      })
      .slice(0, 15);
  }, [activeSearchKey, searchQuery, masterProducts]);

  // Select product from Master Data: auto-fills item name AND customer name
  const handleSelectProduct = (groupId: string, itemId: string, product: any) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItems = g.items.map(it => {
          if (it.id !== itemId) return it;
          return { ...it, jobName: product.itemName || it.jobName };
        });

        // Auto-fill customer name from Master Data Product as requested
        const updatedCustomer = product.customerName || g.customerName;
        return {
          ...g,
          customerName: updatedCustomer,
          items: newItems
        };
      });
      saveToLocalStorage(updated);
      return updated;
    });

    setActiveSearchKey(null);
    setSearchQuery('');
    setDropdownPos(null);

    // Auto-focus into Qty input for rapid data entry
    setTimeout(() => {
      qtyInputRefs.current[itemId]?.focus();
      qtyInputRefs.current[itemId]?.select();
    }, 60);
  };

  // Mark an item as Done (Completed) -> removes from active plan & future carry-forwards
  const markItemDone = (groupId: string, itemId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItems = g.items.map(it => it.id === itemId ? { ...it, isDone: true } : it);
        return { ...g, items: newItems };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Restore a completed item back to active
  const restoreItem = (groupId: string, itemId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItems = g.items.map(it => it.id === itemId ? { ...it, isDone: false } : it);
        return { ...g, items: newItems };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Update customer group level field (dispatchDate or customerName)
  const updateGroup = (groupId: string, field: 'dispatchDate' | 'customerName', value: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        return { ...g, [field]: value };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Update item field (jobName or qty)
  const updateItem = (groupId: string, itemId: string, field: 'jobName' | 'qty', value: any) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItems = g.items.map(item => {
          if (item.id !== itemId) return item;
          return { ...item, [field]: value };
        });
        return { ...g, items: newItems };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Add a new customer group
  const addGroup = () => {
    const newItemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setGroups(prev => {
      const newSNo = prev.length > 0 ? Math.max(...prev.map(g => g.sNo || 0)) + 1 : 1;
      const newGroup: DispatchPlanGroup = {
        id: `grp-${Date.now()}`,
        sNo: newSNo,
        dispatchDate: planDate,
        customerName: '',
        items: [
          { id: newItemId, jobName: '', qty: '', isDone: false }
        ]
      };
      const updated = [...prev, newGroup];
      saveToLocalStorage(updated);
      return updated;
    });

    // Auto-focus into the item name of the new group
    setTimeout(() => {
      itemInputRefs.current[newItemId]?.focus();
    }, 60);
  };

  // Add an item row under a specific customer group
  const addItemToGroup = (groupId: string) => {
    const newItemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItem: DispatchPlanItem = {
          id: newItemId,
          jobName: '',
          qty: '',
          isDone: false
        };
        return { ...g, items: [...g.items, newItem] };
      });
      saveToLocalStorage(updated);
      return updated;
    });

    // Auto-focus into the new item's input
    setTimeout(() => {
      itemInputRefs.current[newItemId]?.focus();
    }, 60);
  };

  // Enter on Qty creates a new item row for this customer
  const handleQtyKeyDown = (e: React.KeyboardEvent, groupId: string, itemIdx: number, totalItems: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (itemIdx === totalItems - 1) {
        addItemToGroup(groupId);
      }
    }
  };

  // Remove an item from a group
  const removeItemFromGroup = (groupId: string, itemId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        if (g.items.length <= 1) {
          // Keep at least one empty item row
          return { ...g, items: [{ id: `item-${Date.now()}`, jobName: '', qty: '', isDone: false }] };
        }
        return { ...g, items: g.items.filter(it => it.id !== itemId) };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Delete an entire customer group
  const deleteGroup = (groupId: string) => {
    setGroups(prev => {
      const filtered = prev.filter(g => g.id !== groupId);
      const result = filtered.length > 0 ? filtered : [createBlankGroup(1, planDate)];
      const reindexed = result.map((g, idx) => ({ ...g, sNo: idx + 1 }));
      saveToLocalStorage(reindexed);
      return reindexed;
    });
  };

  const resetToSample = () => {
    if (window.confirm('Reset this dispatch plan to the original sample planning data?')) {
      setGroups(INITIAL_DISPATCH_GROUPS);
      saveToLocalStorage(INITIAL_DISPATCH_GROUPS);
    }
  };

  const clearAll = () => {
    if (window.confirm('Are you sure you want to clear all dispatch planning rows?')) {
      const emptyGroup = createBlankGroup(1, planDate);
      setGroups([emptyGroup]);
      saveToLocalStorage([emptyGroup]);
      setTimeout(() => {
        itemInputRefs.current[emptyGroup.items[0].id]?.focus();
      }, 60);
    }
  };

  // Visible groups based on showCompleted toggle:
  // When showCompleted is false (default), completed items are hidden.
  // Groups with no active items are also hidden.
  const visibleGroups = useMemo(() => {
    if (showCompleted) return groups;
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(it => !it.isDone)
      }))
      .filter(g => g.items.length > 0);
  }, [groups, showCompleted]);

  // Statistics
  const completedCount = useMemo(() => {
    let count = 0;
    groups.forEach(g => {
      g.items.forEach(it => {
        if (it.isDone) count++;
      });
    });
    return count;
  }, [groups]);

  const activeCount = useMemo(() => {
    let count = 0;
    groups.forEach(g => {
      g.items.forEach(it => {
        if (!it.isDone) count++;
      });
    });
    return count;
  }, [groups]);

  // Total quantity calculation for visible items
  const totalQty = useMemo(() => {
    let sum = 0;
    visibleGroups.forEach(g => {
      g.items.forEach(it => {
        const val = parseFloat(String(it.qty || 0));
        if (!isNaN(val)) sum += val;
      });
    });
    return sum;
  }, [visibleGroups]);

  // Export to Excel
  const exportExcel = () => {
    const flatData: any[] = [];
    visibleGroups.forEach(g => {
      g.items.forEach((it, idx) => {
        flatData.push({
          'S No.': idx === 0 ? g.sNo : '',
          'DISPATCH DATE': idx === 0 ? formatDateToDMY(g.dispatchDate) : '',
          'CUSTOMER NAME': idx === 0 ? g.customerName : '',
          'ITEM / JOB NAME': it.jobName,
          'QTY': it.qty ?? '',
          'STATUS': it.isDone ? 'COMPLETED' : 'PENDING'
        });
      });
    });

    // Append total row
    flatData.push({
      'S No.': '',
      'DISPATCH DATE': '',
      'CUSTOMER NAME': '',
      'ITEM / JOB NAME': 'TOTAL QUANTITY',
      'QTY': totalQty,
      'STATUS': ''
    });

    exportToExcel(flatData, `Dispatch_Plan_${planDate}`);
  };

  // WhatsApp formatted copy
  const copyWhatsApp = () => {
    let text = `*DISPATCH PLAN (${formatDateToDMY(planDate)})*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    visibleGroups.forEach((g) => {
      if (g.customerName) {
        text += `\n*${g.sNo}. ${g.customerName}* (Dispatch: ${formatDateToDMY(g.dispatchDate)})\n`;
        g.items.forEach((it) => {
          if (it.jobName) {
            text += `  • ${it.jobName}: *${it.qty || 0}* ${it.isDone ? '(✓ Dispatched)' : ''}\n`;
          }
        });
      }
    });
    text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*TOTAL DISPATCH QTY: ${totalQty.toLocaleString()}*\n`;

    navigator.clipboard.writeText(text);
    setWhatsappToast(true);
    setTimeout(() => setWhatsappToast(false), 2500);
  };

  const displayPlanDateDMY = formatDateToDMY(planDate);

  return (
    <div className="space-y-4">
      {/* Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-sm print:hidden">
        {/* Left: Plan Date Selector & Summary badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-border">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Date:</span>
            <input 
              type="date" 
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {visibleGroups.length} Parties • {activeCount} Active Items
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Total Qty: {totalQty.toLocaleString()}
            </span>

            {/* Toggle Completed Items */}
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
                title="Toggle visibility of dispatched/completed items"
              >
                {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showCompleted ? 'Hide Done' : `Show Done (${completedCount})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Customer Party
          </button>

          <button
            type="button"
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Saves dispatch plan for this date"
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            type="button"
            onClick={copyWhatsApp}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Copy formatted text to paste on WhatsApp for MD"
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
            onClick={resetToSample}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-all cursor-pointer"
            title="Reset to sample data"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
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
          Dispatch Plan saved successfully for {formatDateToDMY(planDate)}!
        </div>
      )}
      {whatsappToast && (
        <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg border border-green-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-green-600" />
          Copied WhatsApp dispatch plan to clipboard!
        </div>
      )}

      {/* Smart Autocomplete Helper Bar */}
      <div className="text-xs text-muted-foreground bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>
            <strong>Smart Master Data Typing:</strong> Type <strong>Item Name</strong> $\to$ floating dropdown opens $\to$ select to auto-fill <strong>Item Name & Customer Name</strong> $\to$ enter <strong>Qty</strong> $\to$ press <strong>Enter</strong> to add next item!
          </span>
        </div>
        <span className="font-semibold text-emerald-800">
          Click <strong>✓ Done</strong> to complete & remove an item from future plans!
        </span>
      </div>

      {/* Main Table Container - Matching Screenshot 2 Exact Style */}
      <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-x-auto print:shadow-none print:border-none print:rounded-none">
        {/* Table Title Banner: DISPATCH PLAN (DD-MM-YYYY) */}
        <div className="text-center py-2.5 bg-white border-b-2 border-black font-extrabold text-lg sm:text-xl tracking-wider text-black uppercase">
          DISPATCH PLAN ({displayPlanDateDMY})
        </div>

        <table className="w-full text-xs border-collapse text-black">
          <thead>
            <tr className="bg-white border-b border-black text-center font-bold text-xs sm:text-sm">
              <th className="border border-black px-2 py-2 w-14 text-center">S No.</th>
              <th className="border border-black px-3 py-2 text-center min-w-[130px]">DATE</th>
              <th className="border border-black px-4 py-2 text-center min-w-[200px]">CUSTOMER NAME</th>
              <th className="border border-black px-4 py-2 text-center min-w-[260px]">ITEM NAME</th>
              <th className="border border-black px-3 py-2 text-center w-28">QTY</th>
              <th className="border border-black px-2 py-2 w-32 text-center print:hidden bg-gray-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500 font-semibold">
                  No active dispatch items for this date. All items completed or click below to add a customer party!
                  {completedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCompleted(true)}
                      className="block mx-auto mt-2 text-xs text-blue-600 hover:underline font-bold"
                    >
                      View {completedCount} Completed Items
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              visibleGroups.map((group) => {
                const rowSpanCount = group.items.length;

                return group.items.map((item, itemIdx) => {
                  const isFirstRow = itemIdx === 0;

                  return (
                    <tr 
                      key={item.id} 
                      className={cn(
                        "hover:bg-blue-50/30 transition-colors",
                        item.isDone ? "bg-emerald-50/40 opacity-70" : ""
                      )}
                    >
                      {/* S No - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-black px-2 py-2 text-center font-bold align-middle bg-white"
                        >
                          {group.sNo}
                        </td>
                      )}

                      {/* Dispatch Date - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-black px-2 py-2 text-center font-bold align-middle bg-white"
                        >
                          <input
                            type="text"
                            value={formatDateToDMY(group.dispatchDate)}
                            onChange={(e) => updateGroup(group.id, 'dispatchDate', e.target.value)}
                            placeholder="DD-MM-YYYY"
                            className="w-full text-center bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                          />
                        </td>
                      )}

                      {/* Customer Name - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-black px-3 py-2 text-center font-bold align-middle bg-white"
                        >
                          <input
                            type="text"
                            value={group.customerName}
                            onChange={(e) => updateGroup(group.id, 'customerName', e.target.value.toUpperCase())}
                            placeholder="CUSTOMER / PARTY NAME"
                            className="w-full text-center bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded uppercase"
                          />
                        </td>
                      )}

                      {/* Item / Job Name with Smart Floating Autocomplete Dropdown */}
                      <td className="border border-black px-3 py-2 text-center font-semibold">
                        <input
                          ref={(el) => { itemInputRefs.current[item.id] = el; }}
                          type="text"
                          value={item.jobName}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateItem(group.id, item.id, 'jobName', val.toUpperCase());
                            setActiveSearchKey({ groupId: group.id, itemId: item.id });
                            setSearchQuery(val);
                            setHighlightedIndex(0);
                            updateDropdownPosition(e.currentTarget);
                          }}
                          onFocus={(e) => {
                            setActiveSearchKey({ groupId: group.id, itemId: item.id });
                            setSearchQuery(item.jobName || '');
                            setHighlightedIndex(0);
                            updateDropdownPosition(e.currentTarget);
                          }}
                          onKeyDown={(e) => {
                            if (activeSearchKey?.itemId === item.id && searchMatches.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlightedIndex((prev) => (prev + 1) % searchMatches.length);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlightedIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSelectProduct(group.id, item.id, searchMatches[highlightedIndex]);
                              } else if (e.key === 'Escape') {
                                setActiveSearchKey(null);
                              }
                            }
                          }}
                          placeholder="Type item or party to search master data..."
                          className={cn(
                            "w-full text-center bg-transparent font-semibold text-black border-none focus:outline-none focus:bg-yellow-100 px-1 py-0.5 rounded uppercase",
                            item.isDone ? "line-through text-gray-500" : ""
                          )}
                        />
                      </td>

                      {/* Qty */}
                      <td className="border border-black px-2 py-2 text-center font-bold">
                        <input
                          ref={(el) => { qtyInputRefs.current[item.id] = el; }}
                          type="number"
                          value={item.qty ?? ''}
                          onChange={(e) => updateItem(group.id, item.id, 'qty', e.target.value)}
                          onKeyDown={(e) => handleQtyKeyDown(e, group.id, itemIdx, rowSpanCount)}
                          placeholder="0"
                          className={cn(
                            "w-full text-center bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-200 px-1 py-0.5 rounded",
                            item.isDone ? "line-through text-gray-500" : ""
                          )}
                          title="Enter Qty and press ENTER to add another item"
                        />
                      </td>

                      {/* Row & Group Actions (hidden during print) */}
                      <td className="border border-black px-2 py-1 text-center print:hidden bg-gray-50/50">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Done Button: Removes job from plan & future carry forwards */}
                          {item.isDone ? (
                            <button
                              type="button"
                              onClick={() => restoreItem(group.id, item.id)}
                              className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors cursor-pointer"
                              title="Click to restore to active"
                            >
                              ✓ Done
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markItemDone(group.id, item.id)}
                              className="p-1 text-emerald-700 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                              title="Mark as Dispatched/Done (Removes from plan and future dates)"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Add sub-item for this customer */}
                          {isFirstRow && (
                            <button
                              type="button"
                              onClick={() => addItemToGroup(group.id)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                              title="Add another item for this customer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete this single item row */}
                          <button
                            type="button"
                            onClick={() => removeItemFromGroup(group.id, item.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                            title="Remove this item row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete entire customer party */}
                          {isFirstRow && (
                            <button
                              type="button"
                              onClick={() => deleteGroup(group.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors cursor-pointer"
                              title="Delete entire party and all its items"
                            >
                              <Trash2 className="w-4 h-4 font-bold" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })
            )}
          </tbody>

          {/* Footer Total Row */}
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-black font-extrabold text-black">
              <td colSpan={3} className="border border-black px-4 py-2 text-center uppercase tracking-wider text-xs sm:text-sm font-black">
                TOTAL DISPATCH SUMMARY ({visibleGroups.length} PARTIES)
              </td>
              <td className="border border-black px-4 py-2 text-center text-xs sm:text-sm font-black uppercase">
                TOTAL QUANTITY
              </td>
              <td className="border border-black px-2 py-2 text-center text-xs sm:text-sm font-black bg-emerald-50 text-emerald-950">
                {totalQty.toLocaleString()}
              </td>
              <td className="border border-black px-2 py-2 print:hidden bg-gray-100"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FIXED FLOATING DROPDOWN (Rendered completely outside table container so it is NEVER clipped) */}
      {activeSearchKey && searchMatches.length > 0 && dropdownPos && (
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
          className="bg-white border-2 border-emerald-600 rounded-xl shadow-2xl overflow-hidden divide-y divide-gray-100 text-xs animate-in fade-in"
        >
          <div className="bg-emerald-600 text-white font-bold px-3 py-1.5 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Master Data Matching ({searchMatches.length})
            </span>
            <span className="text-emerald-100 font-normal text-[10px]">Click or Press Enter</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {searchMatches.map((prod: any, pIdx: number) => (
              <button
                key={prod.id || pIdx}
                type="button"
                onClick={() => handleSelectProduct(activeSearchKey.groupId, activeSearchKey.itemId, prod)}
                onMouseEnter={() => setHighlightedIndex(pIdx)}
                className={cn(
                  "w-full text-left p-2.5 transition-colors cursor-pointer block border-b border-gray-100 last:border-b-0",
                  highlightedIndex === pIdx ? "bg-emerald-100 text-emerald-950 font-semibold" : "hover:bg-gray-50 text-gray-800"
                )}
              >
                <div className="font-extrabold text-sm text-black flex items-center justify-between">
                  <span>{prod.itemName}</span>
                  {prod.ups && (
                    <span className="text-[11px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                      UPS: {prod.ups}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 font-medium mt-0.5 flex items-center justify-between">
                  <span>Party: <strong className="text-emerald-800">{prod.customerName}</strong></span>
                  <span>Reel: {prod.reelSize || '-'}" | Cut: {prod.cutSize || '-'}" | Flute: {prod.flute || 'B'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Buttons */}
      <div className="flex flex-wrap justify-between items-center print:hidden pt-2 gap-3">
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-300 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Another Customer Party
        </button>
        <span className="text-xs text-muted-foreground italic">
          Tip: In <strong>Qty</strong>, press <strong>Enter</strong> to instantly add another item for the same customer!
        </span>
      </div>
    </div>
  );
}

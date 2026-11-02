import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Plus, Trash2, Printer, Download, RotateCcw, Save, 
  Calendar, Check, Share2, Sparkles, CheckCircle2, 
  Eye, EyeOff, Users, Truck, FileText, PackageCheck 
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
              dispatchDate: date,
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

  // Filtered products for smart autocomplete
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

        // Auto-fill customer name from Master Data Product
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

  // Mark an item as Done (Completed)
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

  // Update customer group level field
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

  // Update item field
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

  // Visible groups based on showCompleted toggle
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
            text += `  • ${it.jobName}: *${(Number(it.qty) || 0).toLocaleString()}* ${it.isDone ? '(✓ Dispatched)' : ''}\n`;
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
    <div className="space-y-5">
      {/* 1. EXECUTIVE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
        {/* Customer Parties */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 rounded-xl border border-emerald-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">Customer Parties</span>
            <span className="text-2xl font-black text-emerald-950 mt-0.5 block">{visibleGroups.length}</span>
            <span className="text-[10px] text-emerald-600/80 font-medium">Parties scheduled</span>
          </div>
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Scheduled Items */}
        <div className="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-4 rounded-xl border border-blue-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">Dispatch Items</span>
            <span className="text-2xl font-black text-blue-950 mt-0.5 block">{activeCount}</span>
            <span className="text-[10px] text-blue-600/80 font-medium">Distinct line items</span>
          </div>
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Total Dispatch Qty */}
        <div className="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent p-4 rounded-xl border border-teal-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 block">Total Quantity</span>
            <span className="text-2xl font-black text-teal-950 mt-0.5 block">{totalQty.toLocaleString()}</span>
            <span className="text-[10px] text-teal-600/80 font-medium">Boxes to dispatch</span>
          </div>
          <div className="p-3 bg-teal-600 text-white rounded-xl shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* Completed / Dispatched */}
        <div className="bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-4 rounded-xl border border-purple-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 block">Dispatched Today</span>
            <span className="text-2xl font-black text-purple-950 mt-0.5 block">{completedCount}</span>
            <span className="text-[10px] text-purple-600/80 font-medium">Marked completed</span>
          </div>
          <div className="p-3 bg-purple-600 text-white rounded-xl shadow-xs">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. TOP ACTION TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3.5 rounded-xl border border-border shadow-xs print:hidden">
        {/* Left: Plan Date Selector & Summary badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/70 hover:bg-secondary px-3.5 py-1.5 rounded-lg border border-border transition-colors">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Date:</span>
            <input 
              type="date" 
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-foreground focus:outline-none cursor-pointer"
            />
          </div>

          {/* Toggle Completed Items */}
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs",
                showCompleted 
                  ? "bg-purple-100 text-purple-900 border-purple-300" 
                  : "bg-secondary text-foreground border-border hover:bg-secondary/80"
              )}
              title="Toggle visibility of dispatched/completed items"
            >
              {showCompleted ? <EyeOff className="w-3.5 h-3.5 text-purple-700" /> : <Eye className="w-3.5 h-3.5 text-purple-600" />}
              <span>{showCompleted ? 'Hide Done' : `Show Done (${completedCount})`}</span>
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Customer Party
          </button>

          <button
            type="button"
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
            title="Saves dispatch plan for this date"
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            type="button"
            onClick={copyWhatsApp}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
            title="Copy formatted text to paste on WhatsApp for MD"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </button>

          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-lg border border-border shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Excel
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-lg border border-border shadow-2xs transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-primary" />
            Print / PDF
          </button>

          <button
            type="button"
            onClick={resetToSample}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
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
        <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-emerald-600" />
          Dispatch Plan saved successfully for {formatDateToDMY(planDate)}!
        </div>
      )}
      {whatsappToast && (
        <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-bold rounded-lg border border-green-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-green-600" />
          Copied WhatsApp dispatch plan to clipboard!
        </div>
      )}

      {/* Smart Autocomplete Helper Bar */}
      <div className="text-xs text-slate-700 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-2.5 rounded-lg border border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 shadow-2xs print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 animate-pulse" />
          <span>
            <strong>Smart Master Data Typing:</strong> Type <strong>Item Name</strong> $\to$ floating dropdown opens $\to$ select product to auto-fill <strong>Item Name & Customer Name</strong> $\to$ enter <strong>Qty</strong> $\to$ press <strong>Enter</strong> to add next item!
          </span>
        </div>
        <span className="font-bold text-emerald-900 bg-white/80 px-2.5 py-0.5 rounded border border-emerald-200 text-[11px]">
          Click ✓ Done to mark dispatched
        </span>
      </div>

      {/* 3. MAIN TABLE CONTAINER */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-slate-900 overflow-x-auto print:shadow-none print:border-none print:rounded-none">
        {/* Table Title Banner: DISPATCH PLAN (DD-MM-YYYY) */}
        <div className="text-center py-3 bg-slate-900 text-white font-black text-base sm:text-lg tracking-widest uppercase border-b-2 border-slate-900">
          DISPATCH PLAN ({displayPlanDateDMY})
          <span className="block text-xs font-semibold text-slate-300 capitalize tracking-normal mt-0.5">
            Daily Customer Party & Finished Goods Dispatch Report
          </span>
        </div>

        <table className="w-full text-xs border-collapse text-slate-950 font-sans">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-center font-black text-[11px] sm:text-xs tracking-wider uppercase text-slate-900">
              <th className="border border-slate-900 px-2 py-2.5 w-16 text-center bg-slate-200/80">S No.</th>
              <th className="border border-slate-900 px-3 py-2.5 text-center min-w-[130px] bg-slate-200/60">DATE</th>
              <th className="border border-slate-900 px-4 py-2.5 text-left min-w-[200px] bg-slate-100">CUSTOMER NAME</th>
              <th className="border border-slate-900 px-4 py-2.5 text-left min-w-[280px] bg-slate-100">ITEM NAME</th>
              <th className="border border-slate-900 px-3 py-2.5 text-center w-32 bg-emerald-100/80 text-emerald-950">QTY</th>
              <th className="border border-slate-900 px-2 py-2.5 w-32 text-center print:hidden bg-slate-200">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500 font-bold text-sm">
                  No active dispatch items scheduled for this date.
                  <button
                    type="button"
                    onClick={addGroup}
                    className="block mx-auto mt-2 text-xs text-emerald-700 hover:underline font-bold"
                  >
                    + Click here to add a customer party
                  </button>
                  {completedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCompleted(true)}
                      className="block mx-auto mt-1 text-xs text-blue-600 hover:underline font-semibold"
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
                        "transition-colors group",
                        group.sNo % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                        item.isDone ? "bg-emerald-50/60 opacity-60" : "hover:bg-amber-50/40"
                      )}
                    >
                      {/* S No - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-slate-900 px-2 py-2 text-center font-black align-middle bg-slate-100/60"
                        >
                          <span className="inline-block w-7 h-7 leading-7 rounded-full bg-slate-200 text-slate-900 font-mono font-black text-xs">
                            {group.sNo}
                          </span>
                        </td>
                      )}

                      {/* Dispatch Date - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-slate-900 px-2 py-2 text-center font-mono font-bold align-middle bg-white"
                        >
                          <input
                            type="text"
                            value={formatDateToDMY(group.dispatchDate)}
                            onChange={(e) => updateGroup(group.id, 'dispatchDate', e.target.value)}
                            placeholder="DD-MM-YYYY"
                            className="w-full text-center bg-transparent font-mono font-bold text-slate-900 border-none focus:outline-none focus:bg-amber-100/70 px-1 py-1 rounded text-xs"
                          />
                        </td>
                      )}

                      {/* Customer Name - Merged for the party */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowSpanCount}
                          className="border border-slate-900 px-3 py-2 text-left font-black align-middle bg-white"
                        >
                          <input
                            type="text"
                            value={group.customerName}
                            onChange={(e) => updateGroup(group.id, 'customerName', e.target.value.toUpperCase())}
                            placeholder="CUSTOMER / PARTY NAME"
                            className="w-full text-left bg-transparent font-extrabold text-blue-950 border-none focus:outline-none focus:bg-amber-100/70 px-1.5 py-1 rounded uppercase tracking-tight text-xs"
                          />
                        </td>
                      )}

                      {/* Item / Job Name with Smart Floating Autocomplete Dropdown */}
                      <td className="border border-slate-900 px-3 py-1.5 text-left font-bold">
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
                            "w-full text-left bg-transparent font-extrabold text-slate-950 border-none focus:outline-none focus:bg-amber-100/70 px-1.5 py-1 rounded uppercase text-xs",
                            item.isDone ? "line-through text-slate-400" : ""
                          )}
                        />
                      </td>

                      {/* Qty */}
                      <td className="border border-slate-900 px-2 py-1.5 text-center font-black bg-emerald-50/60">
                        <input
                          ref={(el) => { qtyInputRefs.current[item.id] = el; }}
                          type="number"
                          value={item.qty ?? ''}
                          onChange={(e) => updateItem(group.id, item.id, 'qty', e.target.value)}
                          onKeyDown={(e) => handleQtyKeyDown(e, group.id, itemIdx, rowSpanCount)}
                          placeholder="0"
                          className={cn(
                            "w-full text-center bg-transparent font-mono font-black text-emerald-950 border-none focus:outline-none focus:bg-amber-200 px-1 py-1 rounded text-xs",
                            item.isDone ? "line-through text-slate-400" : ""
                          )}
                          title="Enter Qty and press ENTER to add another item"
                        />
                      </td>

                      {/* Row & Group Actions (hidden during print) */}
                      <td className="border border-slate-900 px-2 py-1 text-center print:hidden bg-slate-100">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Done Button: Removes job from plan & future carry forwards */}
                          {item.isDone ? (
                            <button
                              type="button"
                              onClick={() => restoreItem(group.id, item.id)}
                              className="px-2 py-0.5 text-[10px] font-black bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors cursor-pointer"
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
                            className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
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
            <tr className="bg-slate-200 border-t-2 border-slate-900 font-black text-slate-950">
              <td colSpan={3} className="border border-slate-900 px-4 py-2.5 text-center uppercase tracking-wider text-xs sm:text-sm font-black">
                TOTAL DISPATCH SUMMARY ({visibleGroups.length} PARTIES)
              </td>
              <td className="border border-slate-900 px-4 py-2.5 text-right text-xs sm:text-sm font-black uppercase tracking-wider">
                TOTAL QUANTITY:
              </td>
              <td className="border border-slate-900 px-2 py-2.5 text-center text-xs sm:text-sm font-black bg-emerald-200/90 text-emerald-950 font-mono">
                {totalQty.toLocaleString()}
              </td>
              <td className="border border-slate-900 px-2 py-2.5 print:hidden bg-slate-300"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FIXED FLOATING DROPDOWN */}
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
          onMouseDown={(e) => e.preventDefault()}
          className="bg-white border-2 border-emerald-600 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 text-xs animate-in fade-in"
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
                  "w-full text-left p-2.5 transition-colors cursor-pointer block border-b border-slate-100 last:border-b-0",
                  highlightedIndex === pIdx ? "bg-emerald-100 text-emerald-950 font-semibold" : "hover:bg-slate-50 text-slate-800"
                )}
              >
                <div className="font-extrabold text-sm text-slate-950 flex items-center justify-between">
                  <span>{prod.itemName}</span>
                  {prod.ups && (
                    <span className="text-[11px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                      UPS: {prod.ups}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-0.5 flex items-center justify-between">
                  <span>Party: <strong className="text-emerald-900">{prod.customerName}</strong></span>
                  <span>Reel: {prod.reelSize || '-'}" | Cut: {prod.cutSize || '-'}" | Flute: {prod.flute || 'B'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Buttons */}
      <div className="flex flex-wrap justify-between items-center print:hidden pt-1 gap-3">
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-300 transition-all cursor-pointer shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          Add Another Customer Party
        </button>
        <span className="text-xs text-slate-500 italic">
          Tip: In <strong>Qty</strong>, press <strong>Enter</strong> to instantly add another item for the same customer!
        </span>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Printer, Download, RotateCcw, Save, 
  Calendar, Check, Share2, Layers, AlertCircle
} from 'lucide-react';
import * as xlsx from 'xlsx';
import type { DispatchPlanGroup, DispatchPlanItem } from './PlanningTypes';
import { INITIAL_DISPATCH_GROUPS } from './samplePlanningData';

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

export default function DispatchPlanningSheet() {
  const [planDate, setPlanDate] = useState<string>(formatTodayDate);
  const [groups, setGroups] = useState<DispatchPlanGroup[]>(() => {
    const saved = localStorage.getItem(`packwell_dispatch_planning_${formatTodayDate()}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_DISPATCH_GROUPS;
  });

  const [savedToast, setSavedToast] = useState(false);
  const [whatsappToast, setWhatsappToast] = useState(false);

  // Load from localStorage when planDate changes
  useEffect(() => {
    const saved = localStorage.getItem(`packwell_dispatch_planning_${planDate}`);
    if (saved) {
      try {
        setGroups(JSON.parse(saved));
        return;
      } catch (e) {
        console.error(e);
      }
    }
  }, [planDate]);

  const saveToLocalStorage = (updatedGroups: DispatchPlanGroup[]) => {
    localStorage.setItem(`packwell_dispatch_planning_${planDate}`, JSON.stringify(updatedGroups));
  };

  const handleManualSave = () => {
    saveToLocalStorage(groups);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
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
    setGroups(prev => {
      const newSNo = prev.length > 0 ? Math.max(...prev.map(g => g.sNo || 0)) + 1 : 1;
      const newGroup: DispatchPlanGroup = {
        id: `grp-${Date.now()}`,
        sNo: newSNo,
        dispatchDate: planDate,
        customerName: '',
        items: [
          { id: `item-${Date.now()}-1`, jobName: '', qty: '' }
        ]
      };
      const updated = [...prev, newGroup];
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Add an item row under a specific customer group
  const addItemToGroup = (groupId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newItem: DispatchPlanItem = {
          id: `item-${Date.now()}-${g.items.length + 1}`,
          jobName: '',
          qty: ''
        };
        return { ...g, items: [...g.items, newItem] };
      });
      saveToLocalStorage(updated);
      return updated;
    });
  };

  // Remove an item from a group
  const removeItemFromGroup = (groupId: string, itemId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        if (g.items.length <= 1) {
          // Keep at least one empty item row
          return { ...g, items: [{ id: `item-${Date.now()}`, jobName: '', qty: '' }] };
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
      const reindexed = filtered.map((g, idx) => ({ ...g, sNo: idx + 1 }));
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
      const emptyGroup: DispatchPlanGroup = {
        id: `grp-${Date.now()}`,
        sNo: 1,
        dispatchDate: planDate,
        customerName: '',
        items: [{ id: `item-${Date.now()}`, jobName: '', qty: '' }]
      };
      setGroups([emptyGroup]);
      saveToLocalStorage([emptyGroup]);
    }
  };

  // Total quantity calculation
  const totalQty = useMemo(() => {
    let sum = 0;
    groups.forEach(g => {
      g.items.forEach(it => {
        const val = parseFloat(String(it.qty || 0));
        if (!isNaN(val)) sum += val;
      });
    });
    return sum;
  }, [groups]);

  const totalItemsCount = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.items.length, 0);
  }, [groups]);

  // Export to Excel
  const exportExcel = () => {
    const flatData: any[] = [];
    groups.forEach(g => {
      g.items.forEach((it, idx) => {
        flatData.push({
          'S No.': idx === 0 ? g.sNo : '',
          'DISPATCH DATE': idx === 0 ? formatDateToDMY(g.dispatchDate) : '',
          'CUSTOMER NAME': idx === 0 ? g.customerName : '',
          'ITEM / JOB NAME': it.jobName,
          'QTY': it.qty ?? ''
        });
      });
    });

    // Append total row
    flatData.push({
      'S No.': '',
      'DISPATCH DATE': '',
      'CUSTOMER NAME': '',
      'ITEM / JOB NAME': 'TOTAL QUANTITY',
      'QTY': totalQty
    });

    const worksheet = xlsx.utils.json_to_sheet(flatData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Dispatch Plan');
    xlsx.writeFile(workbook, `Dispatch_Plan_${planDate}.xlsx`);
  };

  // WhatsApp formatted copy
  const copyWhatsApp = () => {
    let text = `*DISPATCH PLAN (${formatDateToDMY(planDate)})*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    groups.forEach((g) => {
      if (g.customerName) {
        text += `\n*${g.sNo}. ${g.customerName}* (Dispatch: ${formatDateToDMY(g.dispatchDate)})\n`;
        g.items.forEach((it) => {
          if (it.jobName) {
            text += `  • ${it.jobName}: *${it.qty || 0}*\n`;
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
        {/* Left: Plan Date Selector */}
        <div className="flex items-center gap-3">
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

          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
              {groups.length} Parties • {totalItemsCount} Items
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
              Total Qty: {totalQty.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Customer Party
          </button>

          <button
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
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

      {/* Notifications */}
      {savedToast && (
        <div className="flex items-center gap-2 p-3 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-emerald-600" />
          Dispatch Plan saved successfully!
        </div>
      )}
      {whatsappToast && (
        <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg border border-green-300 animate-in fade-in slide-in-from-top-1 print:hidden">
          <Check className="w-4 h-4 text-green-600" />
          Copied WhatsApp dispatch plan to clipboard! Paste it directly in WhatsApp.
        </div>
      )}

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
              <th className="border border-black px-4 py-2 text-center min-w-[180px]">CUSTOMER NAME</th>
              <th className="border border-black px-4 py-2 text-center min-w-[260px]">ITEM NAME</th>
              <th className="border border-black px-3 py-2 text-center w-28">QTY</th>
              <th className="border border-black px-2 py-2 w-28 text-center print:hidden bg-gray-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rowSpanCount = group.items.length;

              return group.items.map((item, itemIdx) => {
                const isFirstRow = itemIdx === 0;

                return (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
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

                    {/* Item / Job Name */}
                    <td className="border border-black px-3 py-2 text-center font-semibold">
                      <input
                        type="text"
                        value={item.jobName}
                        onChange={(e) => updateItem(group.id, item.id, 'jobName', e.target.value.toUpperCase())}
                        placeholder="ITEM DESCRIPTION"
                        className="w-full text-center bg-transparent font-semibold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded uppercase"
                      />
                    </td>

                    {/* Qty */}
                    <td className="border border-black px-2 py-2 text-center font-bold">
                      <input
                        type="number"
                        value={item.qty ?? ''}
                        onChange={(e) => updateItem(group.id, item.id, 'qty', e.target.value)}
                        placeholder="0"
                        className="w-full text-center bg-transparent font-bold text-black border-none focus:outline-none focus:bg-yellow-50 px-1 py-0.5 rounded"
                      />
                    </td>

                    {/* Row & Group Actions (hidden during print) */}
                    <td className="border border-black px-2 py-1 text-center print:hidden bg-gray-50/50">
                      <div className="flex items-center justify-center gap-1">
                        {/* Add sub-item for this customer */}
                        {isFirstRow && (
                          <button
                            onClick={() => addItemToGroup(group.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition-colors"
                            title="Add another item for this customer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete this single item row */}
                        <button
                          onClick={() => removeItemFromGroup(group.id, item.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Remove this item row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete entire customer party */}
                        {isFirstRow && (
                          <button
                            onClick={() => deleteGroup(group.id)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
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
            })}
          </tbody>

          {/* Footer Total Row */}
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-black font-extrabold text-black">
              <td colSpan={3} className="border border-black px-4 py-2 text-center uppercase tracking-wider text-xs sm:text-sm font-black">
                TOTAL DISPATCH SUMMARY ({groups.length} PARTIES)
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

      {/* Bottom Buttons */}
      <div className="flex flex-wrap justify-between items-center print:hidden pt-2 gap-3">
        <button
          onClick={addGroup}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-300 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Another Customer Party
        </button>
        <span className="text-xs text-muted-foreground italic">
          Tip: Click the + icon inside any row to add multiple items for the same customer.
        </span>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  X, Plus, Printer, FileDown, Search, ArrowUpRight, ArrowDownRight, 
  Wallet, Building2, Calendar, CheckCircle2, AlertCircle, Loader2,
  Trash2, CornerDownLeft, Sparkles, Filter, ChevronDown
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  getCashLedgerEntries, 
  getOpeningBalance,
  batchCreateCashLedgerEntries, 
  getExpenseCategories, 
  createExpenseCategory 
} from '../lib/supabase/cashLedgerService';
import type { CashLedgerEntry } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';

interface CashLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMonth?: string; // YYYY-MM
  initialExpenseFilter?: string; // Pre-selected expense head to filter
  standardExpenses?: string[];
  onEntriesSaved?: () => void;
}

interface DraftRow {
  id: string;
  date: string;
  voucherNo: string;
  expenseHead: string;
  narration: string;
  paymentMode: 'CASH' | 'BANK';
  dr: string;
  cr: string;
}

// Helper to format Indian Currency numbers cleanly
const formatINR = (val: number, decimals: number = 0) => {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
};

// Smart Category Filter: Matches ANY word/token from front, middle, or back with relevance scoring
export const smartFilterExpenseCategories = (categories: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  if (!q) return categories;

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { name: string; score: number }[] = [];

  for (const cat of categories) {
    const catLower = cat.toLowerCase();

    // Check if every token matches anywhere in the category name (front, middle, or back)
    const allTokensMatch = tokens.every(token => catLower.includes(token));
    if (!allTokensMatch) continue;

    // Relevance scoring (lower score = higher rank)
    let score = 100;
    if (catLower === q) {
      score = 0; // Exact match
    } else if (catLower.startsWith(q)) {
      score = 10; // Starts with full query
    } else if (tokens.length > 0 && catLower.startsWith(tokens[0])) {
      score = 20; // Starts with first token
    } else if (catLower.includes(q)) {
      score = 30; // Contiguous substring match anywhere (middle / end)
    } else {
      score = 40; // All tokens present in various places
    }

    // Secondary scoring based on position of first token and string length
    const firstPos = catLower.indexOf(tokens[0]);
    if (firstPos >= 0) score += firstPos * 0.1;
    score += cat.length * 0.01;

    scored.push({ name: cat, score });
  }

  return scored.sort((a, b) => a.score - b.score).map(s => s.name);
};

// Render category name with matched query tokens highlighted in bold amber
export const renderHighlightedCategory = (name: string, query: string) => {
  const q = query.trim();
  if (!q) return <span>{name}</span>;

  const tokens = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length === 0) return <span>{name}</span>;

  const regex = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = name.split(regex);

  return (
    <span className="truncate">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-200 text-amber-950 font-black px-1 py-0.2 rounded shadow-xs not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

export default function CashLedgerModal({
  isOpen,
  onClose,
  defaultMonth,
  initialExpenseFilter,
  standardExpenses = [],
  onEntriesSaved,
}: CashLedgerModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Period / Filter State: Default to current month
  const initialMonth = defaultMonth || format(new Date(), 'yyyy-MM');
  const [filterType, setFilterType] = useState<'MONTH' | 'WEEK' | 'CUSTOM'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [selectedExpenseFilter, setSelectedExpenseFilter] = useState<string>(initialExpenseFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync initialExpenseFilter and defaultMonth when passed from parent (e.g. from P&L expense click)
  useEffect(() => {
    if (isOpen) {
      if (initialExpenseFilter) {
        setSelectedExpenseFilter(initialExpenseFilter);
      } else {
        setSelectedExpenseFilter('ALL');
      }
      if (defaultMonth) {
        setSelectedMonth(defaultMonth);
        setFilterType('MONTH');
      }
    }
  }, [initialExpenseFilter, defaultMonth, isOpen]);
  
  // Show / Toggle Fast Entry Sheet
  const [showEntrySheet, setShowEntrySheet] = useState(true);

  // Draft Rows State: Starts with strictly ONE blank row (Requirement 3)
  const createBlankRow = (dateStr?: string): DraftRow => ({
    id: Math.random().toString(36).substring(2, 9),
    date: dateStr || format(new Date(), 'yyyy-MM-dd'),
    voucherNo: '',
    expenseHead: '',
    narration: '',
    paymentMode: 'CASH',
    dr: '',
    cr: '',
  });

  const [draftRows, setDraftRows] = useState<DraftRow[]>([createBlankRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Active Dropdown / Autocomplete State for Expense Head
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);
  const [expenseSearchText, setExpenseSearchText] = useState('');
  const [highlightedCategoryIndex, setHighlightedCategoryIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus Refs for Date inputs and Narration inputs
  const dateInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const narrationInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Compute Active Date Boundaries for queries
  const activeDateRange = useMemo(() => {
    const today = new Date();
    if (filterType === 'MONTH') {
      const [y, m] = (selectedMonth || format(today, 'yyyy-MM')).split('-').map(Number);
      const start = format(new Date(y, m - 1, 1), 'yyyy-MM-dd');
      const end = format(endOfMonth(new Date(y, m - 1, 1)), 'yyyy-MM-dd');
      return { start, end };
    } else if (filterType === 'WEEK') {
      const start = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return { start, end };
    } else {
      return {
        start: startDate || format(startOfMonth(today), 'yyyy-MM-dd'),
        end: endDate || format(endOfMonth(today), 'yyyy-MM-dd'),
      };
    }
  }, [filterType, selectedMonth, startDate, endDate]);

  // Fetch Existing Ledger Entries
  const { data: entries = [], isLoading: isLoadingEntries, refetch: refetchEntries } = useQuery({
    queryKey: ['cashLedgerEntries', activeDateRange.start, activeDateRange.end, paymentModeFilter],
    queryFn: () => getCashLedgerEntries({
      startDate: activeDateRange.start,
      endDate: activeDateRange.end,
      paymentMode: paymentModeFilter,
    }),
    enabled: isOpen,
  });

  // Fetch Custom Expense Categories from Supabase
  const { data: dbCategories = [], refetch: refetchCategories } = useQuery({
    queryKey: ['expenseCategories'],
    queryFn: getExpenseCategories,
    enabled: isOpen,
  });

  // Combined Unique Expense Categories List
  const allExpenseCategories = useMemo(() => {
    const set = new Set<string>([...standardExpenses, ...dbCategories]);
    return Array.from(set).filter(Boolean).sort();
  }, [standardExpenses, dbCategories]);

  // Filtered Entries based on Expense Head filter and local search query
  const filteredEntries = useMemo(() => {
    let result = entries;

    // 1. Filter by specific Expense Head if selected
    if (selectedExpenseFilter && selectedExpenseFilter !== 'ALL') {
      const expQ = selectedExpenseFilter.trim().toLowerCase();
      result = result.filter(e => e.expenseHead.trim().toLowerCase() === expQ);
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(e => 
        e.expenseHead.toLowerCase().includes(q) ||
        (e.narration && e.narration.toLowerCase().includes(q)) ||
        (e.voucherNo && e.voucherNo.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, selectedExpenseFilter, searchQuery]);

  // Fetch Opening Balance (B/F prior to start date)
  const { data: openingBalance = 0 } = useQuery({
    queryKey: ['cashLedgerOpeningBalance', activeDateRange.start, paymentModeFilter],
    queryFn: () => getOpeningBalance(activeDateRange.start, paymentModeFilter),
    enabled: isOpen,
  });

  // Compute Running Balance for entries starting automatically from Opening Balance
  // Debit (Dr) = Expense / Outflow (subtracts cash)
  // Credit (Cr) = Receipt / Inflow (adds cash)
  const entriesWithBalance = useMemo(() => {
    let running = selectedExpenseFilter === 'ALL' ? openingBalance : 0;
    return filteredEntries.map(e => {
      const cr = Number(e.cr) || 0;
      const dr = Number(e.dr) || 0;
      running += (cr - dr);
      return {
        ...e,
        runningBalance: running,
      };
    });
  }, [filteredEntries, openingBalance, selectedExpenseFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalDr = filteredEntries.reduce((acc, curr) => acc + (Number(curr.dr) || 0), 0);
    const totalCr = filteredEntries.reduce((acc, curr) => acc + (Number(curr.cr) || 0), 0);
    const netBalance = openingBalance + totalCr - totalDr;
    const headNetExpense = totalDr - totalCr;
    return {
      openingBalance,
      totalDr,
      totalCr,
      netBalance,
      headNetExpense,
      count: filteredEntries.length,
    };
  }, [filteredEntries, openingBalance]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdownRowId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update a single draft row field
  const handleUpdateDraftRow = (id: string, field: keyof DraftRow, value: string) => {
    setDraftRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      return { ...row, [field]: value };
    }));
  };

  // Add a new draft row and immediately focus its date input (Requirement 3)
  const handleAddNewRow = (fromDate?: string) => {
    const newRow = createBlankRow(fromDate);
    setDraftRows(prev => [...prev, newRow]);

    // Fast cursor focus to Date input of the newly opened row
    setTimeout(() => {
      const el = dateInputRefs.current[newRow.id];
      if (el) {
        el.focus();
        el.select();
      }
    }, 60);
  };

  // Delete a draft row
  const handleDeleteDraftRow = (id: string) => {
    if (draftRows.length === 1) {
      setDraftRows([createBlankRow()]);
      return;
    }
    setDraftRows(prev => prev.filter(r => r.id !== id));
  };

  // Keydown handler on Dr / Cr inputs: Pressing ENTER triggers next row and focuses Date (Requirement 3)
  const handleAmountKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: DraftRow,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If user is at the last row, automatically append a new row and focus its date input!
      if (rowIndex === draftRows.length - 1) {
        handleAddNewRow(row.date);
      } else {
        // Move focus to next row's date
        const nextRow = draftRows[rowIndex + 1];
        if (nextRow && dateInputRefs.current[nextRow.id]) {
          dateInputRefs.current[nextRow.id]?.focus();
        }
      }
    }
  };

  // Select an existing expense category and focus Narration input
  const handleSelectCategory = (cat: string, rowId: string) => {
    handleUpdateDraftRow(rowId, 'expenseHead', cat);
    setActiveDropdownRowId(null);
    setExpenseSearchText('');
    setHighlightedCategoryIndex(0);
    // Directly move cursor focus to Narration input
    setTimeout(() => {
      narrationInputRefs.current[rowId]?.focus();
    }, 40);
  };

  // Add a new custom expense category on the fly via "+" button or Enter key (Saves permanently for future use)
  const handleCreateNewCategory = async (name: string, rowId: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      setIsSubmittingCategory(true);
      await createExpenseCategory(clean, user?.name || 'Admin');
      await refetchCategories();
      handleUpdateDraftRow(rowId, 'expenseHead', clean);
      setActiveDropdownRowId(null);
      setExpenseSearchText('');
      setHighlightedCategoryIndex(0);
      setSaveSuccessMsg(`नया खर्चा "${clean}" भविष्य के लिए सफलतापूर्वक सहेज लिया गया!`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
      // Directly move cursor focus to Narration input
      setTimeout(() => {
        narrationInputRefs.current[rowId]?.focus();
      }, 50);
    } catch (err: any) {
      alert('नया खर्चा श्रेणी बनाने में त्रुटि: ' + (err.message || ''));
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  // Keyboard navigation inside Expense Head input & autocomplete dropdown
  const handleExpenseHeadKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: DraftRow,
    filteredCats: string[],
    canCreateNew: boolean
  ) => {
    if (!activeDropdownRowId) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setActiveDropdownRowId(row.id);
        setExpenseSearchText(row.expenseHead);
        return;
      }
    }

    const totalOptions = (canCreateNew ? 1 : 0) + filteredCats.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedCategoryIndex(prev => (prev + 1) % Math.max(1, totalOptions));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCategoryIndex(prev => (prev - 1 + Math.max(1, totalOptions)) % Math.max(1, totalOptions));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (canCreateNew && highlightedCategoryIndex === 0) {
        // Trigger "+ Add new"
        handleCreateNewCategory(expenseSearchText || row.expenseHead, row.id);
      } else {
        const catIdx = canCreateNew ? highlightedCategoryIndex - 1 : highlightedCategoryIndex;
        const selected = filteredCats[catIdx] || filteredCats[0];
        if (selected) {
          handleSelectCategory(selected, row.id);
        } else if (canCreateNew) {
          handleCreateNewCategory(expenseSearchText || row.expenseHead, row.id);
        } else {
          narrationInputRefs.current[row.id]?.focus();
        }
      }
    } else if (e.key === 'Tab') {
      if (filteredCats.length > 0) {
        const catIdx = canCreateNew && highlightedCategoryIndex > 0 ? highlightedCategoryIndex - 1 : 0;
        handleSelectCategory(filteredCats[catIdx] || filteredCats[0], row.id);
      }
    } else if (e.key === 'Escape') {
      setActiveDropdownRowId(null);
    }
  };

  // Submit and Save all draft entries in Batch (Requirement 4)
  const handleSubmitBatch = async () => {
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    // Filter valid rows: Must have date, an expenseHead, and either Dr > 0 or Cr > 0
    const validRows = draftRows.filter(r => {
      const hasAmount = (Number(r.dr) > 0) || (Number(r.cr) > 0);
      const hasHead = Boolean(r.expenseHead.trim());
      return hasAmount && hasHead;
    });

    if (validRows.length === 0) {
      setSaveErrorMsg('कृपया कम से कम एक प्रविष्टि में खर्चे का नाम और Dr या Cr की राशि दर्ज करें।');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = validRows.map(r => ({
        date: r.date,
        voucherNo: r.voucherNo.trim() || undefined,
        expenseHead: r.expenseHead.trim(),
        narration: r.narration.trim() || undefined,
        paymentMode: r.paymentMode,
        dr: Number(r.dr) || 0,
        cr: Number(r.cr) || 0,
      }));

      await batchCreateCashLedgerEntries(payload, user?.name || 'User');
      
      setSaveSuccessMsg(`सफलतापूर्वक ${validRows.length} प्रविष्टियां सहेजी गईं!`);
      // Reset draft entries to exactly 1 fresh blank row
      setDraftRows([createBlankRow()]);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['cashLedgerEntries'] });
      queryClient.invalidateQueries({ queryKey: ['mrReport'] });
      refetchEntries();

      if (onEntriesSaved) {
        onEntriesSaved();
      }

      setTimeout(() => {
        setSaveSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      setSaveErrorMsg('त्रुटि: प्रविष्टियां सहेजने में विफल। ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export to PDF (Requirement 2)
  const handleExportPDF = () => {
    if (entriesWithBalance.length === 0) {
      alert('डाउनलोड करने के लिए कोई डाटा उपलब्ध नहीं है।');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header Branding
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(0, 0, doc.internal.pageSize.width, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PACKWELL INDUSTRIES', 14, 11);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`CASH LEDGER REPORT ${selectedExpenseFilter !== 'ALL' ? `- [${selectedExpenseFilter.toUpperCase()}] ` : ''}|  Period: ${activeDateRange.start} to ${activeDateRange.end}`, 14, 18);

    // Summary Sub-header
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const summaryText = selectedExpenseFilter !== 'ALL'
      ? `Filtered Expense Head: ${selectedExpenseFilter}  |  Entries: ${summary.count}  |  Total Debit (Expense): Rs. ${formatINR(summary.totalDr)}  |  Total Credit (Receipt): Rs. ${formatINR(summary.totalCr)}  |  Net Outflow: Rs. ${formatINR(summary.headNetExpense)}`
      : `Opening Balance: Rs. ${formatINR(summary.openingBalance)}  |  Total Debit: Rs. ${formatINR(summary.totalDr)}  |  Total Credit: Rs. ${formatINR(summary.totalCr)}  |  Closing Balance: Rs. ${formatINR(summary.netBalance)}`;
    doc.text(summaryText, 14, 31);

    // Table Data
    const tableHeaders = [['S.No', 'Date', 'Voucher No.', 'Expense Head / Category', 'Narration', 'Mode', 'Debit (Dr - Rs.)', 'Credit (Cr - Rs.)', 'Balance (Rs.)']];
    const tableBody = [
      ...(selectedExpenseFilter === 'ALL' ? [
        [
          '0',
          activeDateRange.start,
          '-',
          'OPENING BALANCE (प्रारंभिक शेष B/F)',
          'Balance brought forward from previous transactions',
          '-',
          '-',
          '-',
          formatINR(summary.openingBalance),
        ]
      ] : []),
      ...entriesWithBalance.map((e, idx) => [
        String(idx + 1),
        e.date,
        e.voucherNo || '-',
        e.expenseHead,
        e.narration || '-',
        e.paymentMode,
        e.dr > 0 ? formatINR(e.dr) : '-',
        e.cr > 0 ? formatINR(e.cr) : '-',
        formatINR(e.runningBalance),
      ])
    ];

    autoTable(doc, {
      head: tableHeaders,
      body: tableBody,
      startY: 35,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'left', cellWidth: 50 },
        4: { halign: 'left' },
        5: { halign: 'center', cellWidth: 16 },
        6: { halign: 'right', cellWidth: 26, textColor: [225, 29, 72] }, // Red for Dr
        7: { halign: 'right', cellWidth: 26, textColor: [16, 185, 129] }, // Green for Cr
        8: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // Highlight negative balance in PDF
        if (data.section === 'body' && data.column.index === 8) {
          const rawVal = entriesWithBalance[data.row.index]?.runningBalance;
          if (rawVal < 0) {
            data.cell.styles.fillColor = [127, 29, 29]; // Dark red fill
            data.cell.styles.textColor = 255; // White text
          } else {
            data.cell.styles.textColor = [5, 150, 105]; // Green text
          }
        }
      },
      foot: [[
        { content: selectedExpenseFilter !== 'ALL' ? `TOTAL FOR ${selectedExpenseFilter.toUpperCase()}` : 'TOTAL', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `Rs. ${formatINR(summary.totalDr)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] } },
        { content: `Rs. ${formatINR(summary.totalCr)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] } },
        { content: `Rs. ${formatINR(selectedExpenseFilter !== 'ALL' ? summary.headNetExpense : summary.netBalance)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: (selectedExpenseFilter === 'ALL' && summary.netBalance < 0) ? [127, 29, 29] : [240, 253, 244], textColor: (selectedExpenseFilter === 'ALL' && summary.netBalance < 0) ? 255 : [5, 150, 105] } },
      ]],
    });

    doc.save(`Packwell_Cash_Ledger_${selectedExpenseFilter !== 'ALL' ? selectedExpenseFilter.replace(/[^a-zA-Z0-9]/g, '_') + '_' : ''}${activeDateRange.start}_to_${activeDateRange.end}.pdf`);
  };

  // Print Report (Requirement 2)
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-slate-50 w-full max-w-7xl max-h-[96vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:bg-slate-800 print:text-white print:py-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 print:hidden">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight print:text-base">
                  CASH LEDGER (रोकड़ बही)
                </h2>
                <span className="text-xs bg-slate-800 px-2.5 py-0.5 rounded-full text-slate-300 border border-slate-700 font-medium print:text-[10px]">
                  Packwell Industries
                </span>
              </div>
              <p className="text-xs text-slate-400 print:text-[10px]">
                {filterType === 'MONTH' ? `Period: ${format(parseISO(activeDateRange.start), 'MMMM yyyy')}` : `From ${activeDateRange.start} to ${activeDateRange.end}`}
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => setShowEntrySheet(!showEntrySheet)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                showEntrySheet 
                  ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              {showEntrySheet ? 'Hide Entry Sheet' : '+ New Entry Sheet'}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition"
              title="Print Cash Ledger"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>

            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              title="Export as PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINT BRANDING HEADER (Visible only in Print mode) */}
        <div className="hidden print:block p-4 border-b border-slate-300">
          <div className="text-center">
            <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">Packwell Industries</h1>
            <p className="text-xs text-slate-600 font-medium">CASH LEDGER REPORT</p>
            <p className="text-xs text-slate-500">Period: {activeDateRange.start} to {activeDateRange.end}</p>
          </div>
        </div>

        {/* PERIOD FILTERS & KPI SUMMARY CARDS */}
        <div className="p-4 bg-white border-b border-slate-200 shrink-0 space-y-3 print:p-2 print:border-none">
          
          {/* Top Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setFilterType('MONTH')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  filterType === 'MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Current Month
              </button>
              <button
                onClick={() => setFilterType('WEEK')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  filterType === 'WEEK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setFilterType('CUSTOM')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  filterType === 'CUSTOM' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Date Pickers */}
            <div className="flex items-center gap-2">
              {filterType === 'MONTH' && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              )}

              {filterType === 'CUSTOM' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <span className="text-xs text-slate-400 font-bold">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              )}

              {/* Payment Mode Selector */}
              <select
                value={paymentModeFilter}
                onChange={(e) => setPaymentModeFilter(e.target.value as any)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="ALL">All Modes (Cash &amp; Bank)</option>
                <option value="CASH">Cash Only</option>
                <option value="BANK">Bank Only</option>
              </select>

              {/* Dedicated Expense Head Filter Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                <Filter className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <select
                  value={selectedExpenseFilter}
                  onChange={(e) => setSelectedExpenseFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none max-w-[210px] truncate cursor-pointer"
                  title="खर्चे के अनुसार फ़िल्टर करें (Filter by Expense Head)"
                >
                  <option value="ALL">All Expenses (सभी खर्चे)</option>
                  {allExpenseCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {selectedExpenseFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedExpenseFilter('ALL')}
                    className="p-0.5 text-slate-400 hover:text-rose-600 transition"
                    title="Clear filter (सभी खर्चे देखें)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Local Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search voucher, narration..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium w-44 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active Expense Filter Banner */}
          {selectedExpenseFilter !== 'ALL' && (
            <div className="flex items-center justify-between bg-gradient-to-r from-rose-50 via-white to-amber-50 border border-rose-200 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-950 shadow-xs animate-in fade-in">
              <div className="flex flex-wrap items-center gap-2">
                <span className="p-1 bg-rose-600 text-white rounded-md shadow-xs">
                  <Filter className="w-3.5 h-3.5" />
                </span>
                <span>
                  खर्चा फ़िल्टर: <strong className="underline underline-offset-2 text-rose-900 font-extrabold">{selectedExpenseFilter}</strong>
                </span>
                <span className="text-[11px] font-bold text-rose-800 bg-rose-100/80 px-2.5 py-0.5 rounded-full border border-rose-300 shadow-xs">
                  {filterType === 'MONTH' ? `महीना: ${selectedMonth}` : `अवधि: ${activeDateRange.start} से ${activeDateRange.end}`}
                </span>
                <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  {filteredEntries.length} प्रविष्टियां | कुल व्यय: ₹ {formatINR(summary.totalDr)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedExpenseFilter('ALL')}
                className="flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-white bg-white hover:bg-rose-600 px-3 py-1 rounded-lg border border-rose-300 hover:border-rose-600 transition shadow-xs active:scale-95 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Clear Filter (सभी खर्चे देखें)
              </button>
            </div>
          )}

          {/* 4 KPI Summary Cards with user specified color rules */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
            
            {/* Card 1: Opening Balance if ALL, or Filtered Head Info */}
            {selectedExpenseFilter === 'ALL' ? (
              <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
                summary.openingBalance < 0
                  ? 'bg-red-950 border-red-600 text-white shadow-md ring-2 ring-red-500/60 print:bg-red-100 print:text-red-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800 print:border-slate-300 print:bg-white'
              }`}>
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${
                    summary.openingBalance < 0 ? 'text-red-200' : 'text-slate-500'
                  }`}>
                    Opening Balance (प्रारंभिक शेष)
                  </p>
                  <p className={`text-lg font-black ${
                    summary.openingBalance < 0 ? 'text-white' : 'text-slate-800'
                  }`}>
                    {summary.openingBalance < 0 ? `(-) ₹ ${formatINR(Math.abs(summary.openingBalance))}` : `₹ ${formatINR(summary.openingBalance)}`}
                  </p>
                </div>
                <div className="p-2 bg-slate-200 text-slate-700 rounded-lg print:hidden">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl flex items-center justify-between print:border-slate-300 print:bg-white">
                <div className="min-w-0 pr-2">
                  <p className="text-[11px] font-bold text-rose-800 uppercase tracking-wider truncate">
                    Filtered Category (खर्चा श्रेणी)
                  </p>
                  <p className="text-sm font-black text-rose-950 truncate" title={selectedExpenseFilter}>
                    {selectedExpenseFilter}
                  </p>
                  <p className="text-[10px] text-rose-600 font-semibold">{filteredEntries.length} प्रविष्टियां</p>
                </div>
                <div className="p-2 bg-rose-200 text-rose-800 rounded-lg print:hidden shrink-0">
                  <Filter className="w-4 h-4" />
                </div>
              </div>
            )}

            {/* Total Expense (Dr) - RED */}
            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between print:border-slate-300 print:bg-white">
              <div>
                <p className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Total Debit (Expense / व्यय)</p>
                <p className="text-lg font-black text-rose-600 print:text-base">
                  ₹ {formatINR(summary.totalDr)}
                </p>
              </div>
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg print:hidden">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>

            {/* Total Receipt (Cr) - GREEN */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between print:border-slate-300 print:bg-white">
              <div>
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Credit (Receipt / प्राप्ति)</p>
                <p className="text-lg font-black text-emerald-600 print:text-base">
                  ₹ {formatINR(summary.totalCr)}
                </p>
              </div>
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg print:hidden">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>

            {/* Net Closing Balance if ALL, or Net Head Outflow if filtered */}
            {selectedExpenseFilter === 'ALL' ? (
              <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
                summary.netBalance < 0
                  ? 'bg-red-950 border-red-600 text-white shadow-md ring-2 ring-red-500/60 print:bg-red-100 print:text-red-900'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950 print:border-slate-300 print:bg-white'
              }`}>
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-wider ${
                    summary.netBalance < 0 ? 'text-red-200' : 'text-emerald-800'
                  }`}>
                    Closing Balance (अंतिम शेष)
                  </p>
                  <p className={`text-lg font-black ${
                    summary.netBalance < 0 ? 'text-white font-extrabold tracking-wide' : 'text-emerald-700'
                  }`}>
                    {summary.netBalance < 0 ? `(-) ₹ ${formatINR(Math.abs(summary.netBalance))}` : `₹ ${formatINR(summary.netBalance)}`}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                  summary.netBalance < 0 ? 'bg-red-700 text-white border border-red-400' : 'bg-emerald-200 text-emerald-900'
                }`}>
                  {summary.netBalance < 0 ? 'Negative / घाटा' : 'Surplus / जमा'}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between print:border-slate-300 print:bg-white">
                <div>
                  <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
                    Net Head Expense (शुद्ध व्यय)
                  </p>
                  <p className="text-lg font-black text-amber-950">
                    ₹ {formatINR(summary.headNetExpense)}
                  </p>
                </div>
                <div className="px-2 py-1 rounded text-[10px] font-bold bg-amber-200 text-amber-950">
                  Total in Range
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FAST KEYBOARD DATA ENTRY SECTION (Requirements 1, 3, 4) - Hidden in Print */}
        {showEntrySheet && (
          <div className="p-4 bg-slate-100/90 border-b border-slate-300 print:hidden space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-rose-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  New Voucher Entry Sheet (Enter दबाने पर स्वतः अगली Row खुल जाएगी)
                </h3>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                  {draftRows.length} {draftRows.length === 1 ? 'Row' : 'Rows'}
                </span>
              </div>

              {/* Feedback messages */}
              {saveSuccessMsg && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-300 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  {saveSuccessMsg}
                </div>
              )}
              {saveErrorMsg && (
                <div className="flex items-center gap-1.5 text-xs text-rose-700 font-bold bg-rose-100 px-3 py-1 rounded-lg border border-rose-300 animate-in fade-in">
                  <AlertCircle className="w-4 h-4" />
                  {saveErrorMsg}
                </div>
              )}
            </div>

            {/* Draft Entry Table */}
            <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-visible">
              <div className={`overflow-x-auto transition-all ${activeDropdownRowId ? 'min-h-[280px] pb-36' : 'min-h-[140px]'}`}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-slate-200 font-bold text-[11px] uppercase tracking-wider border-b border-slate-700">
                      <th className="px-2.5 py-2 w-10 text-center">#</th>
                      <th className="px-2.5 py-2 w-32">Date</th>
                      <th className="px-2.5 py-2 w-28">Voucher No</th>
                      <th className="px-2.5 py-2 w-80">Expense Head / Category</th>
                      <th className="px-2.5 py-2">Narration (विवरण)</th>
                      <th className="px-2.5 py-2 w-28">Mode</th>
                      <th className="px-2.5 py-2 w-28 text-right text-rose-400">Dr (Expense) ₹</th>
                      <th className="px-2.5 py-2 w-28 text-right text-emerald-400">Cr (Receipt) ₹</th>
                      <th className="px-2 py-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {draftRows.map((row, idx) => {
                      const isDropdownOpen = activeDropdownRowId === row.id;
                      const activeQuery = isDropdownOpen ? (expenseSearchText !== '' ? expenseSearchText : row.expenseHead) : row.expenseHead;

                      // Smart Filter categories: Matches ANY part of the name (front, middle, or back, multi-word)
                      const filteredCategories = smartFilterExpenseCategories(allExpenseCategories, activeQuery);
                      const isExactMatch = allExpenseCategories.some(cat => 
                        cat.toLowerCase() === activeQuery.toLowerCase().trim()
                      );
                      const canCreateNew = Boolean(activeQuery.trim() && !isExactMatch);

                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition">
                          <td className="px-2.5 py-1.5 text-center text-slate-400 font-bold text-xs">
                            {idx + 1}
                          </td>

                          {/* Date Input with Ref for automatic cursor focus */}
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              ref={(el) => {
                                dateInputRefs.current[row.id] = el;
                              }}
                              value={row.date}
                              onChange={(e) => handleUpdateDraftRow(row.id, 'date', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-rose-500 focus:bg-white"
                            />
                          </td>

                          {/* Voucher No. */}
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              placeholder="VCH-01"
                              value={row.voucherNo}
                              onChange={(e) => handleUpdateDraftRow(row.id, 'voucherNo', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-rose-500 focus:bg-white uppercase"
                            />
                          </td>

                          {/* Smart Searchable Expense Head Input with "+" quick create */}
                          <td className="px-2 py-1.5 relative">
                            <div className="flex items-center gap-1.5">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  placeholder="Type any word (tea, diesel, off...)"
                                  value={row.expenseHead}
                                  onFocus={() => {
                                    setActiveDropdownRowId(row.id);
                                    setExpenseSearchText(row.expenseHead);
                                    setHighlightedCategoryIndex(0);
                                  }}
                                  onChange={(e) => {
                                    handleUpdateDraftRow(row.id, 'expenseHead', e.target.value);
                                    setExpenseSearchText(e.target.value);
                                    setActiveDropdownRowId(row.id);
                                    setHighlightedCategoryIndex(0);
                                  }}
                                  onKeyDown={(e) => handleExpenseHeadKeyDown(e, row, filteredCategories, canCreateNew)}
                                  className="w-full px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 focus:bg-white"
                                />
                              </div>

                              {/* Quick "+" Add Button for Custom Expense */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (row.expenseHead.trim() && !isExactMatch) {
                                    handleCreateNewCategory(row.expenseHead, row.id);
                                  } else {
                                    setActiveDropdownRowId(row.id);
                                    setExpenseSearchText(row.expenseHead);
                                    setHighlightedCategoryIndex(0);
                                  }
                                }}
                                className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg transition active:scale-95 border border-rose-300/60 shadow-xs flex items-center justify-center shrink-0"
                                title={row.expenseHead.trim() && !isExactMatch ? `Save "${row.expenseHead.trim()}" for future` : "खर्चा सूची खोलें / नया खर्चा जोड़ें"}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Smart Autocomplete Dropdown Popup */}
                            {isDropdownOpen && (
                              <div
                                ref={dropdownRef}
                                className="absolute left-0 top-full mt-1.5 w-84 max-w-sm bg-white rounded-xl shadow-2xl border border-slate-300 z-[150] p-2 space-y-1.5 text-slate-800 animate-in fade-in zoom-in-95"
                              >
                                <div className="flex items-center justify-between px-2 py-0.5 border-b border-slate-100 pb-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Smart Search (आगे, पीछे या बीच का शब्द)
                                  </span>
                                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                                    {filteredCategories.length} मैच
                                  </span>
                                </div>

                                {/* Prominent "+ Add [typed]" button if no exact match */}
                                {canCreateNew && (
                                  <button
                                    type="button"
                                    disabled={isSubmittingCategory}
                                    onClick={() => handleCreateNewCategory(activeQuery, row.id)}
                                    className={`w-full text-left p-2 rounded-xl text-xs font-bold flex items-center justify-between border transition shadow-sm ${
                                      highlightedCategoryIndex === 0
                                        ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400/50 shadow-md'
                                        : 'bg-rose-50/90 hover:bg-rose-100 text-rose-800 border-rose-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`p-1 rounded-md shrink-0 ${highlightedCategoryIndex === 0 ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'}`}>
                                        <Plus className="w-3.5 h-3.5" />
                                      </span>
                                      <span className="truncate">
                                        + नया खर्चा जोड़ें: &ldquo;<strong>{activeQuery.trim()}</strong>&rdquo;
                                      </span>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                                      highlightedCategoryIndex === 0 ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'
                                    }`}>
                                      भविष्य के लिए सेव करें
                                    </span>
                                  </button>
                                )}

                                {/* Scrollable Categories List */}
                                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 pr-1">
                                  {filteredCategories.map((cat, i) => {
                                    const itemIndex = canCreateNew ? i + 1 : i;
                                    const isHighlighted = highlightedCategoryIndex === itemIndex;
                                    const isSelected = row.expenseHead.trim().toLowerCase() === cat.toLowerCase();

                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        onClick={() => handleSelectCategory(cat, row.id)}
                                        className={`w-full text-left px-2.5 py-2 text-xs rounded-lg flex items-center justify-between transition ${
                                          isHighlighted
                                            ? 'bg-rose-50 text-rose-800 font-bold border-l-4 border-rose-600 pl-2'
                                            : 'hover:bg-slate-50 text-slate-700 font-medium'
                                        }`}
                                      >
                                        <div className="min-w-0 pr-2">
                                          {renderHighlightedCategory(cat, activeQuery)}
                                        </div>
                                        <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-600' : 'text-slate-300'}`} />
                                      </button>
                                    );
                                  })}

                                  {filteredCategories.length === 0 && !canCreateNew && (
                                    <div className="px-2 py-4 text-center text-xs text-slate-400">
                                      कोई खर्चा मैच नहीं हुआ
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Narration with Ref for auto-focus */}
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              ref={(el) => {
                                narrationInputRefs.current[row.id] = el;
                              }}
                              placeholder="Narration / Purpose of payment"
                              value={row.narration}
                              onChange={(e) => handleUpdateDraftRow(row.id, 'narration', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-500 focus:bg-white"
                            />
                          </td>

                          {/* Payment Mode */}
                          <td className="px-2 py-1.5">
                            <select
                              value={row.paymentMode}
                              onChange={(e) => handleUpdateDraftRow(row.id, 'paymentMode', e.target.value as any)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                            >
                              <option value="CASH">CASH</option>
                              <option value="BANK">BANK</option>
                            </select>
                          </td>

                          {/* Dr (Debit / Expense) Input - KeyDown triggers next row on Enter */}
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={row.dr}
                              onChange={(e) => {
                                handleUpdateDraftRow(row.id, 'dr', e.target.value);
                                if (e.target.value && Number(e.target.value) > 0) {
                                  handleUpdateDraftRow(row.id, 'cr', '');
                                }
                              }}
                              onKeyDown={(e) => handleAmountKeyDown(e, row, idx)}
                              className="w-full px-2 py-1 text-right bg-rose-50/50 border border-rose-300 rounded-lg text-xs font-black text-rose-700 focus:ring-1 focus:ring-rose-500 focus:bg-white"
                            />
                          </td>

                          {/* Cr (Credit / Receipt) Input - KeyDown triggers next row on Enter */}
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={row.cr}
                              onChange={(e) => {
                                handleUpdateDraftRow(row.id, 'cr', e.target.value);
                                if (e.target.value && Number(e.target.value) > 0) {
                                  handleUpdateDraftRow(row.id, 'dr', '');
                                }
                              }}
                              onKeyDown={(e) => handleAmountKeyDown(e, row, idx)}
                              className="w-full px-2 py-1 text-right bg-emerald-50/50 border border-emerald-300 rounded-lg text-xs font-black text-emerald-700 focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                            />
                          </td>

                          {/* Delete Draft Row */}
                          <td className="px-2 py-1.5 text-center">
                            {draftRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDraftRow(row.id)}
                                className="text-slate-400 hover:text-rose-600 transition p-1"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Buttons Bar for Entry Sheet */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddNewRow(draftRows[draftRows.length - 1]?.date)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
                  >
                    <Plus className="w-3 h-3" />
                    + Add Row (या Enter दबाएं)
                  </button>
                  <span className="text-[11px] text-slate-400 font-medium">
                    (टिप: Dr या Cr में राशि डालकर Enter दबाने पर स्वतः नई row खुल जाएगी)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftRows([createBlankRow()])}
                    className="px-3 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-lg hover:bg-slate-200 transition"
                  >
                    Clear All
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitBatch}
                    className="flex items-center gap-2 px-5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        सहेज रहे हैं...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Submit &amp; Save Entries (प्रविष्टियां सहेजें)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LEDGER TRANSACTIONS TABLE VIEW (Requirement 1, 5, and Color Rule) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 print:p-2 print:overflow-visible">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-slate-800 print:rounded-none">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider print:bg-slate-800 print:text-[10px]">
                    <th className="px-3 py-2.5 w-12 text-center print:py-1">#</th>
                    <th className="px-3 py-2.5 w-24 print:py-1">Date</th>
                    <th className="px-3 py-2.5 w-24 print:py-1">Voucher No</th>
                    <th className="px-4 py-2.5 print:py-1">Expense Head / Category</th>
                    <th className="px-4 py-2.5 print:py-1">Narration</th>
                    <th className="px-3 py-2.5 w-20 text-center print:py-1">Mode</th>
                    <th className="px-4 py-2.5 w-32 text-right text-rose-300 print:py-1 print:text-slate-900">
                      Debit (Dr) ₹
                    </th>
                    <th className="px-4 py-2.5 w-32 text-right text-emerald-300 print:py-1 print:text-slate-900">
                      Credit (Cr) ₹
                    </th>
                    <th className="px-4 py-2.5 w-36 text-right print:py-1">
                      Balance ₹
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 font-medium">
                  {isLoadingEntries ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-500 mb-2" />
                        लेजर प्रविष्टियां लोड हो रही हैं...
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* OPENING BALANCE ROW (B/F) or HEAD FILTER SUMMARY ROW */}
                      {selectedExpenseFilter === 'ALL' ? (
                        <tr className="bg-slate-100/90 font-bold border-b border-slate-300 print:bg-slate-100">
                          <td className="px-3 py-2.5 text-center text-slate-400 font-bold print:py-1 print:text-[9px]">0</td>
                          <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap print:py-1 print:text-[9px]">
                            {activeDateRange.start}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2.5 font-black text-slate-800 uppercase tracking-wider print:py-1 print:text-[9px]">
                            OPENING BALANCE (प्रारंभिक शेष B/F)
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 italic print:py-1 print:text-[9px]">
                            Balance brought forward from previous period
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2.5 text-right print:py-1 print:text-[9px]">
                            {openingBalance < 0 ? (
                              <span className="bg-red-900 text-white font-black px-2.5 py-1 rounded-md shadow-md ring-2 ring-red-500 tracking-wider text-[11px] inline-block print:bg-red-200 print:text-red-950 print:ring-0">
                                (-) ₹ {formatINR(Math.abs(openingBalance))}
                              </span>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md font-bold text-xs inline-block print:border-none print:bg-transparent">
                                ₹ {formatINR(openingBalance)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ) : (
                        <tr className="bg-rose-50/80 font-bold border-b border-rose-200 print:bg-rose-50">
                          <td className="px-3 py-2 text-center text-rose-500 font-bold print:py-1 print:text-[9px]">★</td>
                          <td className="px-3 py-2 font-bold text-rose-900 whitespace-nowrap print:py-1 print:text-[9px]">{activeDateRange.start}</td>
                          <td className="px-3 py-2 text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2 font-black text-rose-900 uppercase tracking-wider print:py-1 print:text-[9px]">
                            HEAD: {selectedExpenseFilter}
                          </td>
                          <td className="px-4 py-2 text-rose-700 italic print:py-1 print:text-[9px]">
                            Showing all transactions for &ldquo;{selectedExpenseFilter}&rdquo; in this date range
                          </td>
                          <td className="px-3 py-2 text-center text-slate-400 print:py-1 print:text-[9px]">-</td>
                          <td className="px-4 py-2 text-right font-black text-rose-600 print:py-1 print:text-[9px]">
                            ₹ {formatINR(summary.totalDr)}
                          </td>
                          <td className="px-4 py-2 text-right font-black text-emerald-600 print:py-1 print:text-[9px]">
                            {summary.totalCr > 0 ? `₹ ${formatINR(summary.totalCr)}` : '-'}
                          </td>
                          <td className="px-4 py-2 text-right font-black text-slate-900 print:py-1 print:text-[9px]">
                            Net: ₹ {formatINR(summary.headNetExpense)}
                          </td>
                        </tr>
                      )}

                      {entriesWithBalance.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            <Wallet className="w-7 h-7 mx-auto text-slate-300 mb-1" />
                            चयनित अवधि में कोई नई प्रविष्टि नहीं है।
                          </td>
                        </tr>
                      ) : (
                        entriesWithBalance.map((e, index) => {
                          const isNegativeBalance = e.runningBalance < 0;

                          return (
                            <tr 
                              key={e.id} 
                              className={`transition hover:bg-slate-50/80 ${
                                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                              } print:border-b print:border-slate-300`}
                            >
                              <td className="px-3 py-2.5 text-center text-slate-400 font-bold print:py-1 print:text-[9px]">
                                {index + 1}
                              </td>
                              <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap print:py-1 print:text-[9px]">
                                {e.date}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-600 print:py-1 print:text-[9px]">
                                {e.voucherNo || '-'}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-900 print:py-1 print:text-[9px]">
                                {e.expenseHead}
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 print:py-1 print:text-[9px]">
                                {e.narration || '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center print:py-1 print:text-[9px]">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  e.paymentMode === 'CASH' 
                                    ? 'bg-amber-100 text-amber-900' 
                                    : 'bg-blue-100 text-blue-900'
                                }`}>
                                  {e.paymentMode}
                                </span>
                              </td>

                              {/* DR (EXPENSE) - USER REQUIREMENT: RED COLOR */}
                              <td className="px-4 py-2.5 text-right font-black text-rose-600 print:py-1 print:text-[9px]">
                                {e.dr > 0 ? `₹ ${formatINR(e.dr)}` : '-'}
                              </td>

                              {/* CR (RECEIPT) - USER REQUIREMENT: GREEN COLOR */}
                              <td className="px-4 py-2.5 text-right font-black text-emerald-600 print:py-1 print:text-[9px]">
                                {e.cr > 0 ? `₹ ${formatINR(e.cr)}` : '-'}
                              </td>

                              {/* RUNNING BALANCE - USER REQUIREMENT: GREEN IF POSITIVE, DARK HIGHLIGHTED RED IF NEGATIVE */}
                              <td className="px-4 py-2.5 text-right print:py-1 print:text-[9px]">
                                {isNegativeBalance ? (
                                  <span className="bg-red-900 text-white font-black px-2.5 py-1 rounded-md shadow-md ring-2 ring-red-500 tracking-wider text-[11px] inline-block print:bg-red-200 print:text-red-950 print:ring-0">
                                    (-) ₹ {formatINR(Math.abs(e.runningBalance))}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md font-bold text-xs inline-block print:border-none print:bg-transparent">
                                    ₹ {formatINR(e.runningBalance)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </>
                  )}
                </tbody>

                {/* TABLE FOOTER SUMMARY */}
                {entriesWithBalance.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-700 print:bg-slate-800 print:text-[10px]">
                      <td colSpan={6} className="px-4 py-3 text-right uppercase tracking-wider print:py-1.5">
                        {selectedExpenseFilter !== 'ALL' ? `TOTAL FOR ${selectedExpenseFilter.toUpperCase()}:` : 'TOTAL SUMMARY (कुल योग):'}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400 print:py-1.5">
                        ₹ {formatINR(summary.totalDr)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 print:py-1.5">
                        ₹ {formatINR(summary.totalCr)}
                      </td>
                      <td className="px-4 py-3 text-right print:py-1.5">
                        {selectedExpenseFilter !== 'ALL' ? (
                          <span className="text-amber-300 font-black">
                            Net: ₹ {formatINR(summary.headNetExpense)}
                          </span>
                        ) : (
                          summary.netBalance < 0 ? (
                            <span className="bg-red-700 text-white px-2 py-0.5 rounded font-black">
                              (-) ₹ {formatINR(Math.abs(summary.netBalance))}
                            </span>
                          ) : (
                            <span className="text-emerald-300 font-black">
                              ₹ {formatINR(summary.netBalance)}
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">सुरक्षा नोट:</span>
            <span>लेजर में डाटा सुरक्षा के लिए Edit और Delete विकल्प केवल <strong>Settings</strong> मेनू में Admin एक्सेस के तहत उपलब्ध हैं।</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition"
          >
            Close (बंद करें)
          </button>
        </div>

      </div>
    </div>
  );
}

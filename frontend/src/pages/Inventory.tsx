import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Package, ArrowDownToLine, ArrowUpFromLine, History, Calendar, Edit2, ListFilter, FileSpreadsheet, Printer, Trash2, AlertTriangle, Save, CheckSquare, CheckCircle2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { getReels, getReelTransactions, updateReelTransactionDate, updateReelInwardDate, deleteReel, deleteMultipleReels, updateMultipleReelsRate, type Reel } from '../lib/supabase/reelService';
import BulkInwardModal from './inventory/BulkInwardModal';
import OutwardModal from './inventory/OutwardModal';
import ReelHistoryModal from './inventory/ReelHistoryModal';
import EditReelModal from './inventory/EditReelModal';
import ExportButtons from '../components/ExportButtons';
import JobFinderTab from './inventory/JobFinderTab';
import ReverseCalculatorTab from './inventory/ReverseCalculatorTab';
import PrintableReelAudit from './inventory/PrintableReelAudit';
import ReelAuditModal from './inventory/ReelAuditModal';
import ReelAuditHistoryModal from './inventory/ReelAuditHistoryModal';
import MonthlySummaryDetailModal from './inventory/MonthlySummaryDetailModal';
import { ClipboardCheck } from 'lucide-react';

export default function Inventory() {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'EMPTY' | 'ISSUED_REPORT' | 'PURCHASE_REPORT' | 'MONTHLY_SUMMARY' | 'JOB_FINDER' | 'REVERSE_CALC'>('ACTIVE');
  const [isBulkInwardOpen, setIsBulkInwardOpen] = useState(false);
  const [isOutwardOpen, setIsOutwardOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySelectedReel, setHistorySelectedReel] = useState<Reel | null>(null);
  const [editingReel, setEditingReel] = useState<Reel | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false);

  const handleViewHistory = (reel: Reel) => {
    setHistorySelectedReel(reel);
    setIsHistoryOpen(true);
  };
  const [summaryDetailConfig, setSummaryDetailConfig] = useState<{
    isOpen: boolean;
    date: string;
    type: 'INWARD' | 'OUTWARD';
  }>({
    isOpen: false,
    date: '',
    type: 'OUTWARD'
  });
  const [purchaseViewMode, setPurchaseViewMode] = useState<'DETAIL' | 'SUMMARY'>('DETAIL');
  const [search, setSearch] = useState('');
  const [paperTypeFilter, setPaperTypeFilter] = useState('ALL');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [metricFilter, setMetricFilter] = useState<'CLOSING' | 'OPENING' | 'IN' | 'OUT'>('CLOSING');
  const [metricMonth, setMetricMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [showReservedOnly, setShowReservedOnly] = useState(false);

  // Bulk Edit State
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [newBulkDate, setNewBulkDate] = useState('');
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');

  const { data: reels = [], isLoading: loadingReels, refetch } = useQuery({
    queryKey: ['reels'],
    queryFn: () => getReels() as Promise<any[]>
  });

  const { data: transactions = [], isLoading: loadingTx, refetch: refetchTx } = useQuery({
    queryKey: ['reelTransactions'],
    queryFn: () => getReelTransactions() as Promise<any[]>,
    enabled: activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT' || activeTab === 'MONTHLY_SUMMARY' || metricFilter !== 'CLOSING'
  });

  const sortedAndFilteredReels = useMemo(() => {
    let result = reels.filter(r => {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        (r.reelNumber?.toLowerCase() || '').includes(searchLower) ||
        (r.paperType?.toLowerCase() || '').includes(searchLower) ||
        (r.bf?.toLowerCase() || '').includes(searchLower) ||
        (r.gsm?.toString() || '').includes(searchLower) ||
        (r.reelSize?.toString() || '').includes(searchLower) ||
        (r.supplierName?.toLowerCase() || '').includes(searchLower) ||
        (r.supplier?.toLowerCase() || '').includes(searchLower) ||
        (r.manufacturerName?.toLowerCase() || '').includes(searchLower);
        
      if (!matchesSearch) return false;
      
      const pt = (r.paperType || '').toUpperCase();
      if (paperTypeFilter === 'ALL') return true;
      if (paperTypeFilter === 'OTHERS') return !['SK', 'VK', 'DUPLEX', 'HWC'].includes(pt);
      return pt === paperTypeFilter;
    });

    // Filter by Active vs Empty vs Reserved
    result = result.filter(r => {
      const bal = Number(r.currentBalance) || 0;
      if (activeTab === 'ACTIVE') {
        if (bal <= 0) return false;
        if (showReservedOnly) {
          return (Number(r.activeReservedWeight) || 0) > 0;
        }
        return true;
      }
      if (activeTab === 'EMPTY') return bal <= 0;
      return false;
    });

    // Sequence: DUPLEX/HWC -> SK -> VK -> Others
    const getTypeRank = (type: string) => {
      const t = (type || '').toUpperCase();
      if (t.includes('DUPLEX') || t.includes('HWC')) return 1;
      if (t === 'SK') return 2;
      if (t === 'VK') return 3;
      return 4;
    };

    result.sort((a, b) => {
      const rankA = getTypeRank(a.paperType);
      const rankB = getTypeRank(b.paperType);
      if (rankA !== rankB) return rankA - rankB;

      // Size ascending
      const sizeA = Number(a.reelSize) || 0;
      const sizeB = Number(b.reelSize) || 0;
      if (sizeA !== sizeB) return sizeA - sizeB;

      // BF ascending
      const bfA = Number(a.bf) || 0;
      const bfB = Number(b.bf) || 0;
      if (bfA !== bfB) return bfA - bfB;

      return (Number(a.gsm) || 0) - (Number(b.gsm) || 0);
    });

    return result;
  }, [reels, search, paperTypeFilter, activeTab, showReservedOnly]);

  const { totalReels, totalWeight, totalValue } = useMemo(() => {
    let tr = 0, tw = 0, tv = 0;

    if (metricFilter === 'CLOSING' || activeTab !== 'ACTIVE') {
      sortedAndFilteredReels.forEach(r => {
        const bal = Number(r.currentBalance) || 0;
        tr++;
        tw += bal;
        tv += bal * (Number(r.rate) || 0);
      });
    } else {
      // Include all reels (active + empty) that match the search/type filter
      // because historical metrics should include reels that became empty in this month.
      const baseFilteredReels = reels.filter(r => {
        const matchesSearch = (r.reelNumber?.toLowerCase() || '').includes(search.toLowerCase()) ||
          (r.paperType?.toLowerCase() || '').includes(search.toLowerCase()) ||
          (r.bf?.toLowerCase() || '').includes(search.toLowerCase());
          
        if (!matchesSearch) return false;
        
        const pt = (r.paperType || '').toUpperCase();
        if (paperTypeFilter === 'ALL') return true;
        if (paperTypeFilter === 'OTHERS') return !['SK', 'VK', 'DUPLEX', 'HWC'].includes(pt);
        return pt === paperTypeFilter;
      });

      baseFilteredReels.forEach(r => {
          if (metricFilter === 'OPENING') {
              let currentBal = Number(r.currentBalance) || 0;
              const futureTxs = transactions.filter(tx => tx.reelId === r.id && tx.date && tx.date >= `${metricMonth}-01`);
              let openingBal = currentBal;
              futureTxs.forEach(tx => {
                 if (tx.type === 'INWARD') openingBal -= (Number(tx.quantity) || 0);
                 else if (tx.type === 'OUTWARD') openingBal += (Number(tx.quantity) || 0);
              });
              if (Math.round(openingBal) > 0) {
                 tr++;
                 tw += openingBal;
                 tv += openingBal * (Number(r.rate) || 0);
              }
          } else if (metricFilter === 'IN') {
              const monthTxs = transactions.filter(tx => tx.reelId === r.id && tx.type === 'INWARD' && tx.date && tx.date.startsWith(metricMonth));
              let inW = monthTxs.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
              if (inW > 0) {
                 tr++; 
                 tw += inW;
                 tv += inW * (Number(r.rate) || 0);
              }
          } else if (metricFilter === 'OUT') {
              const monthTxs = transactions.filter(tx => tx.reelId === r.id && tx.type === 'OUTWARD' && tx.date && tx.date.startsWith(metricMonth));
              let outW = monthTxs.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
              if (outW > 0) {
                 tr++; 
                 tw += outW;
                 tv += outW * (Number(r.rate) || 0);
              }
          }
      });
    }

    return { totalReels: tr, totalWeight: Math.round(tw), totalValue: Math.round(tv) };
  }, [reels, search, paperTypeFilter, sortedAndFilteredReels, metricFilter, metricMonth, transactions, activeTab]);

  // Generate Issued Report
  const issuedReportData = useMemo(() => {
    if (activeTab !== 'ISSUED_REPORT' && activeTab !== 'PURCHASE_REPORT') return [];
    
    const isPurchase = activeTab === 'PURCHASE_REPORT';

    const txForDate = transactions.filter(tx => {
      if (isPurchase) {
        if (tx.type !== 'INWARD') return false;
      } else {
        if (tx.type !== 'OUTWARD') return false;
      }
      if (!tx.date) return false;
      return tx.date.startsWith(reportDate);
    });

    // Group by Reel Type, Size, BF
    const groups: Record<string, { type: string, size: number, bf: string, count: Set<string>, totalWeight: number }> = {};
    
    txForDate.forEach(tx => {
      // find reel to get its properties
      const reel = reels.find(r => r.id === tx.reelId);
      if (!reel) return;
      
      const type = (reel.paperType || '').toUpperCase();
      const size = Number(reel.reelSize) || 0;
      const bf = reel.bf || '';
      
      const key = `${type}_${size}_${bf}`;
      if (!groups[key]) {
        groups[key] = { type, size, bf, count: new Set(), totalWeight: 0 };
      }
      
      groups[key].count.add(tx.reelId);
      groups[key].totalWeight += Number(tx.quantity) || 0;
    });

    let report = Object.values(groups).map(g => ({
      ...g,
      count: g.count.size
    }));

    // Sort the report same as inventory
    const getTypeRank = (type: string) => {
      const t = (type || '').toUpperCase();
      if (t.includes('DUPLEX') || t.includes('HWC')) return 1;
      if (t === 'SK') return 2;
      if (t === 'VK') return 3;
      return 4;
    };

    report.sort((a, b) => {
      const rankA = getTypeRank(a.type);
      const rankB = getTypeRank(b.type);
      if (rankA !== rankB) return rankA - rankB;
      if (a.size !== b.size) return a.size - b.size;
      return Number(a.bf) - Number(b.bf);
    });

    return report;
  }, [transactions, reels, reportDate, activeTab]);

  // Purchased Reels for selected Date (Detailed List)
  const purchasedReelsForDate = useMemo(() => {
    if (activeTab !== 'PURCHASE_REPORT') return [];

    const inTxs = transactions.filter(tx => {
      if (tx.type !== 'INWARD') return false;
      const isAudit = (tx.notes || '').toLowerCase().includes('audit');
      if (isAudit) return false;
      return tx.date && tx.date.startsWith(reportDate);
    });
    const txReelIds = new Set(inTxs.map(tx => tx.reelId));

    const matched = reels.filter(r => {
      if (txReelIds.has(r.id)) return true;
      if (r.inwardDate && r.inwardDate.startsWith(reportDate)) {
        const rTxs = transactions.filter(tx => tx.reelId === r.id);
        const hasAuditOnly = rTxs.length > 0 && rTxs.every(tx => (tx.notes || '').toLowerCase().includes('audit'));
        return !hasAuditOnly;
      }
      return false;
    });

    return matched.sort((a, b) => (a.reelNumber || '').localeCompare(b.reelNumber || '', undefined, { numeric: true }));
  }, [transactions, reels, reportDate, activeTab]);

  // Bulk Rate Changes State (in-memory until Save button clicked)
  const [pendingRateChanges, setPendingRateChanges] = useState<Record<string, number>>({});
  const [bulkRateInput, setBulkRateInput] = useState('');
  const [isRateConfirmModalOpen, setIsRateConfirmModalOpen] = useState(false);
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [rateUpdateSuccess, setRateUpdateSuccess] = useState('');

  const { purchasedTotalWeight, purchasedTotalValue } = useMemo(() => {
    let tw = 0;
    let tv = 0;
    purchasedReelsForDate.forEach(r => {
      const w = Number(r.weight) || 0;
      const effectiveRate = pendingRateChanges[r.id] !== undefined ? pendingRateChanges[r.id] : (Number(r.rate) || 0);
      tw += w;
      tv += w * effectiveRate;
    });
    return { purchasedTotalWeight: Math.round(tw), purchasedTotalValue: Math.round(tv) };
  }, [purchasedReelsForDate, pendingRateChanges]);

  // Unconsumed reels for the selected date
  const unconsumedReelsForDate = useMemo(() => {
    return purchasedReelsForDate.filter(reel => {
      const consumed = Math.max(0, (Number(reel.weight) || 0) - (Number(reel.currentBalance) || 0));
      const isReserved = (Number(reel.activeReservedWeight) || 0) > 0.1 || !!reel.reservedForJC;
      return consumed <= 0.1 && !isReserved;
    });
  }, [purchasedReelsForDate]);

  // Selected reel IDs for batch operations
  const [selectedPurchaseReelIds, setSelectedPurchaseReelIds] = useState<string[]>([]);
  const [selectedActiveReelIds, setSelectedActiveReelIds] = useState<string[]>([]);
  const [isDeletingReels, setIsDeletingReels] = useState(false);
  const [reelDeleteConfirm, setReelDeleteConfirm] = useState<{
    isOpen: boolean;
    reels: any[];
    title: string;
    skippedConsumedCount: number;
  } | null>(null);

  const currentSelectedIds = activeTab === 'PURCHASE_REPORT' ? selectedPurchaseReelIds : selectedActiveReelIds;
  const pendingCount = Object.keys(pendingRateChanges).length;

  const toggleSelectPurchaseReel = (id: string) => {
    setSelectedPurchaseReelIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPurchasedReels = () => {
    if (selectedPurchaseReelIds.length === purchasedReelsForDate.length) {
      setSelectedPurchaseReelIds([]);
    } else {
      setSelectedPurchaseReelIds(purchasedReelsForDate.map(r => r.id));
    }
  };

  const toggleSelectActiveReel = (id: string) => {
    setSelectedActiveReelIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllActiveReels = () => {
    if (selectedActiveReelIds.length === sortedAndFilteredReels.length) {
      setSelectedActiveReelIds([]);
    } else {
      setSelectedActiveReelIds(sortedAndFilteredReels.map(r => r.id));
    }
  };

  const handleApplyBulkRate = () => {
    const rateVal = parseFloat(bulkRateInput);
    if (isNaN(rateVal) || rateVal <= 0) {
      alert("Please enter a valid rate (greater than 0).");
      return;
    }
    if (currentSelectedIds.length === 0) {
      alert("Please select at least one reel using the checkboxes first.");
      return;
    }

    setPendingRateChanges(prev => {
      const next = { ...prev };
      currentSelectedIds.forEach(id => {
        next[id] = rateVal;
      });
      return next;
    });

    setRateUpdateSuccess(`Applied ₹${rateVal.toFixed(2)} to ${currentSelectedIds.length} reel(s). Click "Save Rates" to commit to database.`);
    setTimeout(() => setRateUpdateSuccess(''), 5000);
  };

  const handleDiscardBulkRates = () => {
    if (confirm("Are you sure you want to discard all unsaved rate changes?")) {
      setPendingRateChanges({});
    }
  };

  const handleConfirmSaveBulkRates = async () => {
    const ids = Object.keys(pendingRateChanges);
    if (ids.length === 0) return;
    try {
      setIsSavingRates(true);
      const updates = ids.map(id => ({ id, rate: pendingRateChanges[id] }));
      await updateMultipleReelsRate(updates, user?.name || 'System');
      await queryClient.invalidateQueries({ queryKey: ['reels'] });
      await queryClient.invalidateQueries({ queryKey: ['reelTransactions'] });
      await refetch();
      await refetchTx();

      setPendingRateChanges({});
      setSelectedActiveReelIds([]);
      setSelectedPurchaseReelIds([]);
      setIsRateConfirmModalOpen(false);
      alert(`Successfully saved updated rates for ${updates.length} reel(s)!`);
    } catch (err: any) {
      console.error('Failed to save bulk rates:', err);
      alert(err.message || 'Failed to save rate updates.');
    } finally {
      setIsSavingRates(false);
    }
  };

  const promptDeleteSingleReel = (reel: any) => {
    setReelDeleteConfirm({
      isOpen: true,
      reels: [reel],
      title: `Delete Reel ${reel.reelNumber}`,
      skippedConsumedCount: 0,
    });
  };

  const promptDeleteSelectedReels = () => {
    const selectedReels = purchasedReelsForDate.filter(r => selectedPurchaseReelIds.includes(r.id));
    if (selectedReels.length === 0) return;
    const unconsumedSelected = selectedReels.filter(r => unconsumedReelsForDate.some(u => u.id === r.id));
    const skipped = selectedReels.length - unconsumedSelected.length;
    if (unconsumedSelected.length === 0) {
      alert("All selected reels have already been consumed or reserved and cannot be deleted.");
      return;
    }
    setReelDeleteConfirm({
      isOpen: true,
      reels: unconsumedSelected,
      title: `Delete Selected Reels (${unconsumedSelected.length})`,
      skippedConsumedCount: skipped,
    });
  };

  const promptDeleteAllForDate = () => {
    const unconsumed = unconsumedReelsForDate;
    const skipped = purchasedReelsForDate.length - unconsumed.length;
    if (unconsumed.length === 0) {
      alert("All reels on this date have already been consumed or reserved in production and cannot be deleted.");
      return;
    }
    setReelDeleteConfirm({
      isOpen: true,
      reels: unconsumed,
      title: `Delete All Purchases for ${new Date(reportDate).toLocaleDateString('en-IN')}`,
      skippedConsumedCount: skipped,
    });
  };

  const executeDeleteReels = async () => {
    if (!reelDeleteConfirm || reelDeleteConfirm.reels.length === 0) return;
    try {
      setIsDeletingReels(true);
      const idsToDelete = reelDeleteConfirm.reels.map(r => r.id);
      const { successCount, errors } = await deleteMultipleReels(idsToDelete, user?.name || 'System');
      
      if (errors.length > 0) {
        alert(`Deleted ${successCount} reel(s). Some failed:\n${errors.join('\n')}`);
      }
      setSelectedPurchaseReelIds([]);
      setReelDeleteConfirm(null);
      await Promise.all([refetch(), refetchTx()]);
    } catch (err: any) {
      alert(err.message || 'Failed to delete reels');
    } finally {
      setIsDeletingReels(false);
    }
  };

  const monthlySummaryData = useMemo(() => {
    if (activeTab !== 'MONTHLY_SUMMARY') return null;
    const yearMonth = reportDate.substring(0, 7); // e.g. "2026-08"
    
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    let openingReelsCount = 0;
    let openingWeight = 0;

    reels.forEach(reel => {
      let currentBal = Number(reel.currentBalance) || 0;
      const futureTxs = transactions.filter(tx => tx.reelId === reel.id && tx.date && tx.date >= `${yearMonth}-01`);
      
      let openingBal = currentBal;
      futureTxs.forEach(tx => {
         if (tx.type === 'INWARD') openingBal -= (Number(tx.quantity) || 0);
         else if (tx.type === 'OUTWARD') openingBal += (Number(tx.quantity) || 0);
      });
      
      if (Math.round(openingBal) > 0) {
         openingReelsCount++;
         openingWeight += openingBal;
      }
    });

    const summary = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${yearMonth}-${i.toString().padStart(2, '0')}`;
      const dayTxs = transactions.filter(tx => tx.date && tx.date.startsWith(dateStr));
      
      let inWeight = 0;
      let outWeight = 0;
      const inReelIds = new Set<string>();
      const outReelIds = new Set<string>();

      dayTxs.forEach(tx => {
        const isAudit = (tx.notes || '').toLowerCase().includes('audit');
        if (isAudit) return;
        if (tx.type === 'INWARD') {
          inReelIds.add(tx.reelId);
          inWeight += Number(tx.quantity) || 0;
        } else if (tx.type === 'OUTWARD') {
          outReelIds.add(tx.reelId);
          outWeight += Number(tx.quantity) || 0;
        }
      });

      if (inReelIds.size > 0 || outReelIds.size > 0) {
        summary.push({
          date: dateStr,
          day: i,
          inReels: inReelIds.size,
          inWeight: Math.round(inWeight),
          outReels: outReelIds.size,
          outWeight: Math.round(outWeight)
        });
      }
    }
    return {
      openingReels: openingReelsCount,
      openingWeight: Math.round(openingWeight),
      rows: summary
    };
  }, [transactions, reels, reportDate, activeTab]);

  const handleBulkDateChange = async () => {
    try {
      setBulkError('');
      setBulkSuccess('');

      if (!newBulkDate) {
        setBulkError('Please select a new date');
        return;
      }

      const txType = activeTab === 'PURCHASE_REPORT' ? 'INWARD' : 'OUTWARD';
      const txForDate = transactions.filter(tx => tx.type === txType && tx.date && tx.date.startsWith(reportDate));

      if (txForDate.length === 0) {
        setBulkError(`No ${txType} transactions found for date: ${reportDate}. Please ensure transactions exist.`);
        return;
      }

      setIsBulkEditing(true);
      let successCount = 0;
      
      for (const tx of txForDate) {
        // Keep original time if possible, just change date part
        const originalTime = tx.date && tx.date.includes('T') ? tx.date.split('T')[1] : '00:00:00Z';
        const newDateTime = `${newBulkDate}T${originalTime}`;
        await updateReelTransactionDate(tx.id, newDateTime, user?.name || 'System');
        
        if (txType === 'INWARD') {
          await updateReelInwardDate(tx.reelId, newDateTime, user?.name || 'System');
        }
        
        successCount++;
      }
      
      setBulkSuccess(`Success! Moved ${successCount} transactions to ${newBulkDate}`);
      setTimeout(() => {
        setShowBulkEditModal(false);
        setBulkSuccess('');
      }, 2000);
      refetch();
      refetchTx();
    } catch (err: any) {
      console.error(err);
      setBulkError(`Error updating transactions: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsBulkEditing(false);
    }
  };

  return (
    <>
    <div className="h-full flex flex-col print:hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reel Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage paper reels and transactions</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => window.print()}
            className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-secondary/80 transition-colors"
          >
            <Printer className="w-4 h-4 mr-2 text-primary" />
            Print Audit
          </button>
          
          {activeTab !== 'ISSUED_REPORT' && (
            <ExportButtons 
              data={sortedAndFilteredReels} 
              filenamePrefix="ReelInventory"
              title="Reel Inventory Status"
              columnMap={{
                'reelNumber': 'Reel No',
                'paperType': 'Type',
                'reelSize': 'Size',
                'bf': 'BF',
                'gsm': 'GSM',
                'weight': 'Initial Wt',
                'currentBalance': 'Balance Wt',
                'supplierName': 'Supplier',
                'manufacturerName': 'Manufacturer'
              }}
            />
          )}
          <button 
            onClick={() => {
              setHistorySelectedReel(null);
              setIsHistoryOpen(true);
            }}
            className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-secondary/80 transition-colors"
          >
            <History className="w-4 h-4 mr-2 text-primary" />
            Reel History
          </button>
          
          <button 
            onClick={() => setIsAuditHistoryOpen(true)}
            className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-secondary/80 transition-colors"
          >
            <History className="w-4 h-4 mr-2 text-purple-600" />
            Audit History
          </button>

          <button 
            onClick={() => setIsAuditModalOpen(true)}
            className="bg-purple-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-purple-700 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Audit Inventory
          </button>
          
          <button 
            onClick={() => setIsOutwardOpen(true)}
            className="bg-red-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-red-700 transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Outward (Issue)
          </button>
          
          <button 
            onClick={() => setIsBulkInwardOpen(true)}
            className="bg-green-600 text-white px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-green-700 transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Bulk Inward (IN)
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'ACTIVE' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Active Reels
        </button>
        <button
          onClick={() => setActiveTab('EMPTY')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'EMPTY' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Empty/Nil Reels
        </button>
        <button
          onClick={() => setActiveTab('ISSUED_REPORT')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'ISSUED_REPORT' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Issue Date Report
        </button>
        <button
          onClick={() => setActiveTab('PURCHASE_REPORT')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'PURCHASE_REPORT' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Purchase Date Report
        </button>
        <button
          onClick={() => setActiveTab('MONTHLY_SUMMARY')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2",
            activeTab === 'MONTHLY_SUMMARY' ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly Summary
        </button>
        <button
          onClick={() => setActiveTab('JOB_FINDER')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2 flex items-center gap-1",
            activeTab === 'JOB_FINDER' ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          🔍 Job Finder
        </button>
        <button
          onClick={() => setActiveTab('REVERSE_CALC')}
          className={cn(
            "pb-2 px-1 font-medium text-sm transition-colors border-b-2 flex items-center gap-1",
            activeTab === 'REVERSE_CALC' ? "border-amber-600 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          🧮 Reverse Calculator
        </button>
      </div>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-lg overflow-hidden flex flex-col">
        {/* Job Finder Tab — no toolbar, rendered directly */}
        {activeTab === 'JOB_FINDER' ? (
          <div className="flex-1 overflow-y-auto">
            <JobFinderTab />
          </div>
        ) : activeTab === 'REVERSE_CALC' ? (
          <div className="flex-1 overflow-y-auto bg-amber-50/10">
            <ReverseCalculatorTab />
          </div>
        ) : (
        <>
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
          {(activeTab !== 'ISSUED_REPORT' && activeTab !== 'PURCHASE_REPORT' && activeTab !== 'MONTHLY_SUMMARY') ? (
            <>
              <div className="flex gap-4 items-center">
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search reels by No, Type, BF..." 
                    className="pl-9 pr-4 py-2 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                
                <select
                  value={paperTypeFilter}
                  onChange={e => setPaperTypeFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                >
                  <option value="ALL">All Types</option>
                  <option value="SK">SK</option>
                  <option value="VK">VK</option>
                  <option value="DUPLEX">DUPLEX</option>
                  <option value="OTHERS">Others</option>
                </select>

                {activeTab === 'ACTIVE' && (
                  <>
                    <select
                      value={metricFilter}
                      onChange={e => setMetricFilter(e.target.value as any)}
                      className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium text-blue-700"
                    >
                      <option value="CLOSING">Closing (Current Bal)</option>
                      <option value="OPENING">Opening</option>
                      <option value="IN">Inward (IN)</option>
                      <option value="OUT">Outward (OUT)</option>
                    </select>

                    {metricFilter !== 'CLOSING' && (
                      <input 
                        type="month"
                        value={metricMonth}
                        onChange={e => setMetricMonth(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                      />
                    )}
                  </>
                )}
                
                {activeTab === 'ACTIVE' && (
                  <label className="flex items-center space-x-2 text-sm font-medium bg-blue-50 text-blue-800 px-3 py-2 rounded-md border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={showReservedOnly} 
                      onChange={e => setShowReservedOnly(e.target.checked)} 
                      className="rounded border-blue-400 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                    />
                    <span>Show Reserved Only</span>
                  </label>
                )}
              </div>
              
              <div className="flex gap-3 text-sm flex-wrap">
                <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                  कुल Reels: <span className="font-bold">{totalReels}</span>
                </div>
                <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                  {metricFilter === 'OUT' ? 'कुल Consumption (OUT): ' : metricFilter === 'IN' ? 'कुल Inward (IN): ' : metricFilter === 'OPENING' ? 'कुल Opening Stock: ' : 'कुल Stock Balance: '}
                  <span className="font-bold">{totalWeight.toLocaleString()} Kg</span>
                </div>

                <div className="bg-green-100 text-green-800 px-3 py-1.5 rounded-md font-medium border border-green-200 shadow-sm">
                  Total Value: <span className="font-bold">Rs. {totalValue.toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-4 items-center justify-between w-full flex-wrap">
              <div className="flex gap-4 items-center flex-wrap">
                <label className="font-medium text-sm flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                  {activeTab === 'MONTHLY_SUMMARY' ? 'Select Month:' : 'Select Date:'}
                </label>
                <input 
                  type={activeTab === 'MONTHLY_SUMMARY' ? 'month' : 'date'}
                  value={activeTab === 'MONTHLY_SUMMARY' ? reportDate.substring(0, 7) : reportDate}
                  onChange={e => setReportDate(activeTab === 'MONTHLY_SUMMARY' ? `${e.target.value}-01` : e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                />
                
                {hasRole('ADMIN') && (activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT') && (
                  <button
                    onClick={() => setShowBulkEditModal(true)}
                    className="bg-orange-100 text-orange-700 px-3 py-2 flex items-center text-sm font-medium rounded-md border border-orange-200 hover:bg-orange-200 transition-colors"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Change Date for All
                  </button>
                )}

                {hasRole('ADMIN') && activeTab === 'PURCHASE_REPORT' && purchaseViewMode === 'DETAIL' && selectedPurchaseReelIds.length > 0 && (
                  <button
                    type="button"
                    onClick={promptDeleteSelectedReels}
                    disabled={isDeletingReels}
                    className="bg-red-600 text-white px-3 py-2 flex items-center text-sm font-semibold rounded-md shadow-sm hover:bg-red-700 transition-colors animate-in fade-in"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Selected ({selectedPurchaseReelIds.length})
                  </button>
                )}

                {hasRole('ADMIN') && activeTab === 'PURCHASE_REPORT' && selectedPurchaseReelIds.length === 0 && purchasedReelsForDate.length > 0 && (
                  <button
                    type="button"
                    onClick={promptDeleteAllForDate}
                    disabled={isDeletingReels || unconsumedReelsForDate.length === 0}
                    className={cn(
                      "px-3 py-2 flex items-center text-sm font-semibold rounded-md border transition-colors",
                      unconsumedReelsForDate.length === 0
                        ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50"
                        : "bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border-red-200"
                    )}
                    title={
                      unconsumedReelsForDate.length === 0
                        ? "All reels on this date have been consumed in production"
                        : "Delete all unconsumed reels on this date"
                    }
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete All for Date
                  </button>
                )}

                {activeTab === 'PURCHASE_REPORT' && (
                  <div className="flex bg-secondary/80 p-0.5 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setPurchaseViewMode('DETAIL')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                        purchaseViewMode === 'DETAIL'
                          ? "bg-background text-foreground shadow-sm font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      Purchased Reels ({purchasedReelsForDate.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchaseViewMode('SUMMARY')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                        purchaseViewMode === 'SUMMARY'
                          ? "bg-background text-foreground shadow-sm font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Grouped Summary
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'PURCHASE_REPORT' && (
                <div className="flex gap-3 text-xs flex-wrap">
                  <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                    Reels: <span className="font-bold">{purchasedReelsForDate.length}</span>
                  </div>
                  <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium border border-primary/20 shadow-sm">
                    Total Weight: <span className="font-bold">{purchasedTotalWeight.toLocaleString()} Kg</span>
                  </div>
                  <div className="bg-green-100 text-green-800 px-3 py-1.5 rounded-md font-medium border border-green-200 shadow-sm">
                    Total Value: <span className="font-bold">₹{Math.round(purchasedTotalValue).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* BULK RATE UPDATE BAR */}
        {hasRole('ADMIN') && (activeTab === 'ACTIVE' || activeTab === 'PURCHASE_REPORT') && (currentSelectedIds.length > 0 || pendingCount > 0) && (
          <div className="mx-4 my-2.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-lg p-3 flex items-center justify-between flex-wrap gap-3 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-900/60 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>{currentSelectedIds.length} Reel(s) Selected</span>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-foreground">Set Rate:</label>
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1.5 text-xs text-muted-foreground font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bulkRateInput}
                    onChange={(e) => setBulkRateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyBulkRate();
                      }
                    }}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-1 text-xs font-bold rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyBulkRate}
                  disabled={currentSelectedIds.length === 0 || !bulkRateInput}
                  className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xs"
                >
                  Apply to Selected
                </button>
              </div>

              {rateUpdateSuccess && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 animate-in fade-in">
                  ✓ {rateUpdateSuccess}
                </span>
              )}
            </div>

            {pendingCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 animate-pulse">
                  ⚡ {pendingCount} Pending Update(s) (Not Saved Yet)
                </div>
                <button
                  type="button"
                  onClick={() => setIsRateConfirmModalOpen(true)}
                  disabled={isSavingRates}
                  className="bg-emerald-600 text-white px-3.5 py-1 rounded-md text-xs font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-1.5 transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Rates ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={handleDiscardBulkRates}
                  disabled={isSavingRates}
                  className="bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground px-2.5 py-1 rounded-md text-xs font-semibold border border-border transition-all"
                >
                  Discard
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {(loadingReels || ((activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT' || activeTab === 'MONTHLY_SUMMARY') && loadingTx)) ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : activeTab === 'MONTHLY_SUMMARY' ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-blue-600 bg-blue-50/30">IN (Reels)</th>
                  <th className="px-6 py-3 font-medium text-blue-700 bg-blue-50/50">
                    <span className="flex items-center gap-1.5">
                      IN (Weight)
                      <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-blue-200/60 text-blue-800">Clickable</span>
                    </span>
                  </th>
                  <th className="px-6 py-3 font-medium text-red-600 bg-red-50/30">OUT (Reels)</th>
                  <th className="px-6 py-3 font-medium text-red-700 bg-red-50/50">
                    <span className="flex items-center gap-1.5">
                      OUT (Weight)
                      <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-red-200/60 text-red-800">Clickable</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthlySummaryData && (
                  <tr className="bg-amber-50/50 hover:bg-amber-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-amber-800">
                      Opening Balance (1st {new Date(reportDate).toLocaleString('en-US', { month: 'short' })})
                    </td>
                    <td className="px-6 py-4 font-bold text-amber-700" colSpan={4}>
                      {monthlySummaryData.openingReels} Reels | {monthlySummaryData.openingWeight.toLocaleString()} Kg
                    </td>
                  </tr>
                )}
                {monthlySummaryData?.rows.map((row: any) => {
                  const hasIn = (row.inReels > 0 || row.inWeight > 0);
                  const hasOut = (row.outReels > 0 || row.outWeight > 0);

                  return (
                    <tr key={row.date} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground">
                        {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>

                      {/* IN (Reels) */}
                      <td 
                        onClick={() => hasIn && setSummaryDetailConfig({ isOpen: true, date: row.date, type: 'INWARD' })}
                        className={cn(
                          "px-6 py-4 font-bold text-blue-600 bg-blue-50/10",
                          hasIn && "cursor-pointer hover:bg-blue-100 hover:text-blue-900 transition-all"
                        )}
                        title={hasIn ? `Click to view ${row.inReels} inward reels on ${row.date}` : undefined}
                      >
                        {row.inReels ? (
                          <span className="inline-flex items-center gap-1 font-bold">
                            {row.inReels}
                            <span className="text-[10px] opacity-60">Reels</span>
                          </span>
                        ) : '-'}
                      </td>

                      {/* IN (Weight) */}
                      <td 
                        onClick={() => hasIn && setSummaryDetailConfig({ isOpen: true, date: row.date, type: 'INWARD' })}
                        className={cn(
                          "px-6 py-4 font-bold text-blue-600 bg-blue-50/10",
                          hasIn && "cursor-pointer hover:bg-blue-100 hover:text-blue-900 transition-all group"
                        )}
                        title={hasIn ? `Click to view inward reels & details for ${row.date}` : undefined}
                      >
                        {row.inWeight ? (
                          <span className="inline-flex items-center gap-1.5 border-b border-dashed border-blue-400 group-hover:border-blue-700 font-black">
                            {row.inWeight.toLocaleString()} Kg
                            <span className="text-[10px] opacity-70 group-hover:scale-125 transition-transform">↗</span>
                          </span>
                        ) : '-'}
                      </td>

                      {/* OUT (Reels) */}
                      <td 
                        onClick={() => hasOut && setSummaryDetailConfig({ isOpen: true, date: row.date, type: 'OUTWARD' })}
                        className={cn(
                          "px-6 py-4 font-bold text-red-600 bg-red-50/10",
                          hasOut && "cursor-pointer hover:bg-red-100 hover:text-red-900 transition-all"
                        )}
                        title={hasOut ? `Click to view ${row.outReels} consumed reels on ${row.date}` : undefined}
                      >
                        {row.outReels ? (
                          <span className="inline-flex items-center gap-1 font-bold">
                            {row.outReels}
                            <span className="text-[10px] opacity-60">Reels</span>
                          </span>
                        ) : '-'}
                      </td>

                      {/* OUT (Weight) */}
                      <td 
                        onClick={() => hasOut && setSummaryDetailConfig({ isOpen: true, date: row.date, type: 'OUTWARD' })}
                        className={cn(
                          "px-6 py-4 font-bold text-red-600 bg-red-50/10",
                          hasOut && "cursor-pointer hover:bg-red-100 hover:text-red-900 transition-all group"
                        )}
                        title={hasOut ? `Click to view consumed reels & outward details for ${row.date}` : undefined}
                      >
                        {row.outWeight ? (
                          <span className="inline-flex items-center gap-1.5 font-black border-b border-dashed border-red-400 group-hover:border-red-700">
                            {row.outWeight.toLocaleString()} Kg
                            <span className="text-[10px] opacity-70 group-hover:scale-125 transition-transform">↗</span>
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
                {monthlySummaryData?.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No IN or OUT transactions found for {reportDate.substring(0, 7)}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {(monthlySummaryData?.rows.length ?? 0) > 0 && (
                <tfoot className="bg-secondary/80 font-bold border-t-2 border-border sticky bottom-0">
                  <tr>
                    <td className="px-6 py-4 text-right text-foreground uppercase tracking-wider text-xs">Monthly Total:</td>
                    <td 
                      onClick={() => setSummaryDetailConfig({ isOpen: true, date: 'TOTAL', type: 'INWARD' })}
                      className="px-6 py-4 text-blue-700 text-base bg-blue-100/50 cursor-pointer hover:bg-blue-200/70 hover:underline transition-all"
                      title="Click to view all IN reels for this month"
                    >
                      {monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.inReels, 0)} Reels
                    </td>
                    <td 
                      onClick={() => setSummaryDetailConfig({ isOpen: true, date: 'TOTAL', type: 'INWARD' })}
                      className="px-6 py-4 text-blue-700 text-base bg-blue-100/50 cursor-pointer hover:bg-blue-200/70 hover:underline transition-all"
                      title="Click to view all IN inward transactions for this month"
                    >
                      <span className="inline-flex items-center gap-1 font-black">
                        {monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.inWeight, 0).toLocaleString()} Kg
                        <span className="text-xs opacity-70">↗</span>
                      </span>
                    </td>
                    <td 
                      onClick={() => setSummaryDetailConfig({ isOpen: true, date: 'TOTAL', type: 'OUTWARD' })}
                      className="px-6 py-4 text-red-700 text-base bg-red-100/50 cursor-pointer hover:bg-red-200/70 hover:underline transition-all"
                      title="Click to view all OUT reels for this month"
                    >
                      {monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.outReels, 0)} Reels
                    </td>
                    <td 
                      onClick={() => setSummaryDetailConfig({ isOpen: true, date: 'TOTAL', type: 'OUTWARD' })}
                      className="px-6 py-4 text-red-700 text-base bg-red-100/50 cursor-pointer hover:bg-red-200/70 hover:underline transition-all"
                      title="Click to view all OUT consumption transactions for this month"
                    >
                      <span className="inline-flex items-center gap-1 font-black">
                        {monthlySummaryData?.rows.reduce((sum: number, r: any) => sum + r.outWeight, 0).toLocaleString()} Kg
                        <span className="text-xs opacity-70">↗</span>
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (activeTab === 'PURCHASE_REPORT' && purchaseViewMode === 'DETAIL') ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  {hasRole('ADMIN') && (
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={
                          purchasedReelsForDate.length > 0 &&
                          selectedPurchaseReelIds.length === purchasedReelsForDate.length
                        }
                        onChange={toggleSelectAllPurchasedReels}
                        disabled={purchasedReelsForDate.length === 0}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        title="Select/Deselect all reels on this date"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 font-medium">Reel No</th>
                  <th className="px-6 py-3 font-medium">Specs (Type/Size/BF/GSM)</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Rate</th>
                  <th className="px-6 py-3 font-medium text-blue-600">Initial Wt</th>
                  <th className="px-6 py-3 font-medium text-red-600">Consumed</th>
                  <th className="px-6 py-3 font-medium text-green-600">Balance</th>
                  <th className="px-6 py-3 font-medium">Inward Date</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchasedReelsForDate.map((reel: any) => {
                  const consumed = Math.max(0, (Number(reel.weight) || 0) - (Number(reel.currentBalance) || 0));
                  const isConsumed = consumed > 0.1;
                  const isReserved = (Number(reel.activeReservedWeight) || 0) > 0.1 || !!reel.reservedForJC;

                  return (
                    <tr key={reel.id} className={cn("hover:bg-muted/50 transition-colors group", selectedPurchaseReelIds.includes(reel.id) && "bg-blue-50/40 dark:bg-blue-950/20")}>
                      {hasRole('ADMIN') && (
                        <td className="w-10 px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedPurchaseReelIds.includes(reel.id)}
                            onChange={() => toggleSelectPurchaseReel(reel.id)}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            title="Select for bulk rate update or deletion"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-mono font-bold text-foreground">
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {reel.reelNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {reel.paperType} | {reel.reelSize}" | {reel.bf} BF | {reel.gsm} GSM
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="text-foreground font-medium">{reel.supplierName || '-'}</div>
                        {reel.manufacturerName && reel.manufacturerName !== reel.supplierName && (
                          <div className="text-xs text-muted-foreground">Mfr: {reel.manufacturerName}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-700 dark:text-gray-300">
                        {pendingRateChanges[reel.id] !== undefined ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="line-through text-xs text-muted-foreground">₹{Number(reel.rate || 0).toFixed(2)}</span>
                            <span className="text-emerald-700 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 shadow-sm animate-pulse">
                              ₹{Number(pendingRateChanges[reel.id]).toFixed(2)}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.2 rounded">Modified</span>
                          </div>
                        ) : (
                          reel.rate ? `₹${Number(reel.rate).toFixed(2)}` : '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{Math.round(reel.weight)} Kg</td>
                      <td className="px-6 py-4 text-red-600">{consumed > 0 ? `${Math.round(consumed)} Kg` : '-'}</td>
                      <td className="px-6 py-4 font-bold text-green-600">{Math.round(reel.currentBalance)} Kg</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {reel.inwardDate ? new Date(reel.inwardDate).toLocaleDateString('en-IN') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingReel(reel)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 transition-all shadow-sm"
                            title="Edit purchased reel specifications, weight, date or supplier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          {hasRole('ADMIN') && (
                            <button
                              type="button"
                              onClick={() => promptDeleteSingleReel(reel)}
                              disabled={isConsumed || isReserved || isDeletingReels}
                              className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-all shadow-sm",
                                isConsumed || isReserved
                                  ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-40"
                                  : "bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border-red-200"
                              )}
                              title={
                                isConsumed
                                  ? `Cannot delete: Consumed (${Math.round(consumed)} Kg)`
                                  : isReserved
                                  ? "Cannot delete: Reserved for Job Card"
                                  : "Delete this reel from inventory"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {purchasedReelsForDate.length === 0 && (
                  <tr>
                    <td colSpan={hasRole('ADMIN') ? 10 : 9} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No purchased reels found for {new Date(reportDate).toLocaleDateString('en-IN')}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {purchasedReelsForDate.length > 0 && (
                <tfoot className="bg-secondary/80 font-bold border-t-2 border-border sticky bottom-0">
                  <tr>
                    <td colSpan={hasRole('ADMIN') ? 5 : 4} className="px-6 py-3.5 text-right text-foreground uppercase tracking-wider text-xs">Total for Date:</td>
                    <td className="px-6 py-3.5 text-blue-700 text-base">{purchasedTotalWeight.toLocaleString()} Kg</td>
                    <td colSpan={2} className="px-6 py-3.5 text-green-700 text-base">₹{Math.round(purchasedTotalValue).toLocaleString()}</td>
                    <td colSpan={2} className="px-6 py-3.5 text-right text-muted-foreground text-xs">{purchasedReelsForDate.length} Reels</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (activeTab === 'ISSUED_REPORT' || activeTab === 'PURCHASE_REPORT') ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Paper Type</th>
                  <th className="px-6 py-3 font-medium">Reel Size</th>
                  <th className="px-6 py-3 font-medium">BF</th>
                  <th className="px-6 py-3 font-medium text-blue-600">No. of Reels {activeTab === 'PURCHASE_REPORT' ? 'Purchased' : 'Issued'}</th>
                  <th className="px-6 py-3 font-medium text-red-600">Total Weight {activeTab === 'PURCHASE_REPORT' ? 'Purchased' : 'Issued'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {issuedReportData.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">{row.type}</td>
                    <td className="px-6 py-4 font-medium">{row.size}"</td>
                    <td className="px-6 py-4 font-medium">{row.bf}</td>
                    <td className="px-6 py-4 text-blue-600 font-bold">{row.count}</td>
                    <td className="px-6 py-4 text-red-600 font-bold">{Math.round(row.totalWeight)} Kg</td>
                  </tr>
                ))}
                {issuedReportData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No {activeTab === 'PURCHASE_REPORT' ? 'inward' : 'outward'} transactions found for {new Date(reportDate).toLocaleDateString('en-IN')}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {issuedReportData.length > 0 && (
                <tfoot className="bg-secondary/80 font-bold border-t-2 border-border sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right text-foreground uppercase tracking-wider text-xs">Total for Date:</td>
                    <td className="px-6 py-4 text-blue-700 text-base">{issuedReportData.reduce((sum: number, r: any) => sum + r.count, 0)}</td>
                    <td className="px-6 py-4 text-red-700 text-base">{Math.round(issuedReportData.reduce((sum: number, r: any) => sum + r.totalWeight, 0))} Kg</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
                <tr>
                  {hasRole('ADMIN') && (
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={
                          sortedAndFilteredReels.length > 0 &&
                          selectedActiveReelIds.length === sortedAndFilteredReels.length
                        }
                        onChange={toggleSelectAllActiveReels}
                        disabled={sortedAndFilteredReels.length === 0}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        title="Select/Deselect all visible reels"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 font-medium">Reel No</th>
                  <th className="px-6 py-3 font-medium">Specs (Type/Size/BF/GSM)</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Rate</th>
                  <th className="px-6 py-3 font-medium text-blue-600">Initial Wt</th>
                  <th className="px-6 py-3 font-medium text-red-600">Consumed</th>
                  <th className="px-6 py-3 font-medium text-green-600">Balance</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedAndFilteredReels.map((reel: any) => {
                  const consumed = (Number(reel.weight) || 0) - (Number(reel.currentBalance) || 0);
                  
                  return (
                    <tr 
                      key={reel.id} 
                      className={cn("hover:bg-muted/50 transition-colors cursor-pointer group", selectedActiveReelIds.includes(reel.id) && "bg-blue-50/40 dark:bg-blue-950/20")}
                      onClick={() => handleViewHistory(reel)}
                    >
                      {hasRole('ADMIN') && (
                        <td className="w-10 px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedActiveReelIds.includes(reel.id)}
                            onChange={() => toggleSelectActiveReel(reel.id)}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            title="Select for bulk rate update"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-bold text-blue-600 group-hover:text-blue-800 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600" />
                        {reel.reelNumber}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {reel.paperType} | {reel.reelSize}" | {reel.bf} BF | {reel.gsm} GSM
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="text-foreground">{reel.supplierName || '-'}</div>
                        {reel.manufacturerName && reel.manufacturerName !== reel.supplierName && (
                          <div className="text-xs">Mfr: {reel.manufacturerName}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-700 dark:text-gray-300">
                        {pendingRateChanges[reel.id] !== undefined ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="line-through text-xs text-muted-foreground">₹{Number(reel.rate || 0).toFixed(2)}</span>
                            <span className="text-emerald-700 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 shadow-sm animate-pulse">
                              ₹{Number(pendingRateChanges[reel.id]).toFixed(2)}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.2 rounded">Modified</span>
                          </div>
                        ) : (
                          reel.rate ? `₹${Number(reel.rate).toFixed(2)}` : '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-blue-600">{Math.round(reel.weight)} Kg</td>
                      <td className="px-6 py-4 text-red-600">{consumed > 0 ? `${Math.round(consumed)} Kg` : '-'}</td>
                      <td className="px-6 py-4 font-bold text-green-600">{Math.round(reel.currentBalance)} Kg</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {reel.inwardDate ? new Date(reel.inwardDate).toLocaleDateString('en-IN') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingReel(reel); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground border border-border hover:border-primary transition-all"
                          title="Edit reel purchase details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sortedAndFilteredReels.length === 0 && (
                  <tr>
                    <td colSpan={hasRole('ADMIN') ? 10 : 9} className="px-6 py-12 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto text-muted mb-3" />
                      <p>No {activeTab === 'EMPTY' ? 'empty' : 'active'} reels found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </>
        )}
      </div>

      {isBulkInwardOpen && (
        <BulkInwardModal 
          reels={reels}
          onClose={() => setIsBulkInwardOpen(false)} 
          onSuccess={() => {
            setIsBulkInwardOpen(false);
            refetch();
          }} 
        />
      )}

      {isOutwardOpen && (
        <OutwardModal
          reels={reels}
          onClose={() => setIsOutwardOpen(false)}
          onSuccess={() => {
            setIsOutwardOpen(false);
            refetch();
          }}
        />
      )}

      {isHistoryOpen && (
        <ReelHistoryModal
          reels={reels}
          onClose={() => {
            setIsHistoryOpen(false);
            setHistorySelectedReel(null);
          }}
          initialSelectedReel={historySelectedReel}
        />
      )}

      {editingReel && (
        <EditReelModal
          reel={editingReel}
          onClose={() => setEditingReel(null)}
          onSuccess={() => {
            setEditingReel(null);
            refetch();
            refetchTx();
          }}
        />
      )}

      <ReelAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onSuccess={() => { refetch(); refetchTx(); }}
      />

      <ReelAuditHistoryModal
        isOpen={isAuditHistoryOpen}
        onClose={() => setIsAuditHistoryOpen(false)}
      />

      {showBulkEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-2xl flex flex-col p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">Bulk Change Date</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Move all <span className="font-bold text-foreground">{activeTab === 'PURCHASE_REPORT' ? 'Purchased (INWARD)' : 'Issued (OUTWARD)'}</span> transactions from <span className="font-bold text-foreground">{new Date(reportDate).toLocaleDateString('en-IN')}</span> to a new date.
            </p>
            {bulkError && <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md border border-red-200">{bulkError}</div>}
            {bulkSuccess && <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-md border border-green-200">{bulkSuccess}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">New Date</label>
                <input
                  type="date"
                  value={newBulkDate}
                  onChange={(e) => setNewBulkDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setShowBulkEditModal(false)}
                  className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDateChange}
                  disabled={isBulkEditing || !newBulkDate}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {isBulkEditing ? 'Moving...' : 'Move Transactions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <MonthlySummaryDetailModal
        isOpen={summaryDetailConfig.isOpen}
        onClose={() => setSummaryDetailConfig(prev => ({ ...prev, isOpen: false }))}
        date={summaryDetailConfig.date}
        type={summaryDetailConfig.type}
        monthTitle={reportDate.substring(0, 7)}
        transactions={transactions}
        reels={reels}
        onOpenFullHistory={(reel) => {
          handleViewHistory(reel);
        }}
      />

      {/* Delete Reel Confirmation Modal */}
      {reelDeleteConfirm?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl p-6 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{reelDeleteConfirm.title}</h3>
                <p className="text-xs text-muted-foreground">Confirm permanent deletion from inventory</p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 text-xs p-3 rounded-lg mb-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <strong>Warning:</strong> This will delete {reelDeleteConfirm.reels.length} reel(s) and remove their inward purchase records permanently.
              </div>
            </div>

            {reelDeleteConfirm.skippedConsumedCount > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs p-3 rounded-lg mb-3">
                ⚠️ <strong>Note:</strong> {reelDeleteConfirm.skippedConsumedCount} reel(s) on this date are already consumed in production and will <strong>NOT</strong> be deleted.
              </div>
            )}

            <div className="bg-secondary/40 border border-border rounded-lg p-3 text-xs space-y-1.5 mb-5 max-h-48 overflow-y-auto">
              <div className="flex justify-between font-bold text-foreground pb-1 border-b border-border">
                <span>Reel No</span>
                <span>Specs</span>
                <span>Weight</span>
              </div>
              {reelDeleteConfirm.reels.map((r: any) => (
                <div key={r.id} className="flex justify-between text-muted-foreground py-0.5">
                  <span className="font-mono font-semibold text-foreground">{r.reelNumber}</span>
                  <span>{r.paperType} {r.reelSize}" {r.gsm} GSM</span>
                  <span className="font-bold text-foreground">{Math.round(r.weight)} Kg</span>
                </div>
              ))}
              <div className="pt-2 border-t border-border flex justify-between font-black text-sm text-foreground">
                <span>Total Weight:</span>
                <span className="text-red-600">
                  {reelDeleteConfirm.reels.reduce((sum: number, r: any) => sum + (Number(r.weight) || 0), 0).toLocaleString()} Kg
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReelDeleteConfirm(null)}
                disabled={isDeletingReels}
                className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteReels}
                disabled={isDeletingReels}
                className="px-4 py-2 text-sm font-bold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isDeletingReels ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Delete {reelDeleteConfirm.reels.length} Reel{reelDeleteConfirm.reels.length > 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rate Confirmation Modal */}
      {isRateConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-card w-full max-w-2xl rounded-xl shadow-2xl border border-border flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border bg-emerald-50 dark:bg-emerald-950/40">
              <div>
                <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Confirm Bulk Rate Update
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Review the rate updates below. Clicking "Confirm & Save" will permanently update these reels in the database.
                </p>
              </div>
              <button 
                onClick={() => setIsRateConfirmModalOpen(false)}
                className="p-1.5 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-3 py-2">Reel No</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Specs</th>
                      <th className="px-3 py-2 text-right">Old Rate</th>
                      <th className="px-3 py-2 text-right text-emerald-600">New Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.keys(pendingRateChanges).map(id => {
                      const reel = reels.find(r => r.id === id);
                      if (!reel) return null;
                      const oldRate = Number(reel.rate) || 0;
                      const newRate = pendingRateChanges[id];
                      return (
                        <tr key={id} className="hover:bg-muted/40">
                          <td className="px-3 py-2 font-mono font-bold text-foreground">{reel.reelNumber}</td>
                          <td className="px-3 py-2 text-muted-foreground">{reel.supplierName || '-'}</td>
                          <td className="px-3 py-2">{reel.paperType} | {reel.reelSize}" | {reel.gsm} GSM</td>
                          <td className="px-3 py-2 text-right font-medium text-muted-foreground">₹{oldRate.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600">₹{newRate.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Total: <strong className="text-foreground">{Object.keys(pendingRateChanges).length}</strong> reel(s)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsRateConfirmModalOpen(false)}
                  disabled={isSavingRates}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-input hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveBulkRates}
                  disabled={isSavingRates}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isSavingRates ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving to Database...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Confirm & Save to Database
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    <PrintableReelAudit reels={reels} />
    </>
  );
}

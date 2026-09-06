import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layers, Clock, Activity, CheckCircle2, AlertCircle, Snowflake, Unlock, ShieldAlert, ShieldCheck, ShieldX, Printer, X, Flame, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DashboardListModal from './dashboard/DashboardListModal';
import PrintableJobCard from './job-cards/PrintableJobCard';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { getJobCards, getPendingApprovalJobCards, updateJobCard } from '../lib/supabase/jobCardService';
import { getFrozenReels, unfreezeReel } from '../lib/supabase/reelService';
import { getRecentActivityLogs } from '../lib/supabase/activityLogService';

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unfreezingId, setUnfreezingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [viewingJobCard, setViewingJobCard] = useState<any | null>(null);
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; filterKey: string }>({
    isOpen: false,
    title: '',
    filterKey: ''
  });
  const [radarFilter, setRadarFilter] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'NEXT48' | 'IN_PROCESS'>('ALL');

  const { data: jobCards = [], isLoading: loadingJC } = useQuery({
    queryKey: ['dashboard-jobcards'],
    queryFn: () => getJobCards() as Promise<any[]>,
    refetchInterval: 10000
  });

  const { data: activityLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['dashboard-logs'],
    queryFn: () => getRecentActivityLogs(50),
    refetchInterval: 10000
  });

  const { data: frozenReels = [], isLoading: loadingFrozen, refetch: refetchFrozen } = useQuery({
    queryKey: ['dashboard-frozen-reels'],
    queryFn: () => getFrozenReels() as Promise<any[]>,
    refetchInterval: 10000,
    enabled: hasRole('ADMIN')
  });

  // Phase 3: Pending Approvals query
  const { data: pendingApprovals = [], refetch: refetchApprovals } = useQuery({
    queryKey: ['dashboard-pending-approvals'],
    queryFn: async () => {
      const now = Date.now();
      const cards = await getPendingApprovalJobCards();
      return cards
        .filter(jc => {
          // Auto-expire check: skip expired ones
          if (jc.approvalExpiresAt && new Date(jc.approvalExpiresAt).getTime() < now) {
            // Fire-and-forget auto-expiry
            void updateJobCard(jc.id, {
              status: 'CANCELLED',
              approvalStatus: 'EXPIRED',
            }, 'System', { log: false, touchUpdatedBy: false }).catch((error) => {
              console.error('Failed to auto-expire approval:', error);
            });
            return false;
          }
          return true;
        });
    },
    refetchInterval: 10000,
    enabled: hasRole('ADMIN')
  });

  const handleUnfreeze = async (reelId: string) => {
    try {
      setUnfreezingId(reelId);
      await unfreezeReel(reelId, user?.name || 'System');
      refetchFrozen();
    } catch (err: any) {
      alert('Failed to unfreeze: ' + err.message);
    } finally {
      setUnfreezingId(null);
    }
  };

  // Phase 3: Approve or Reject oversize approval request
  const handleApprovalAction = async (jcId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      setApprovingId(jcId + action);
      const newStatus = action === 'APPROVED' ? 'PENDING' : 'CANCELLED';
      await updateJobCard(jcId, {
        status: newStatus,
        approvalStatus: action,
        approvalReviewedAt: new Date().toISOString(),
      }, 'System', { log: false, touchUpdatedBy: false });
      refetchApprovals();
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobcards'] });
    } catch (err: any) {
      alert('Failed to process: ' + err.message);
    } finally {
      setApprovingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = jobCards.length;
    const pending = jobCards.filter(jc => jc.status === 'PENDING');
    const inProcess = jobCards.filter(jc => jc.status === 'IN_PROCESS');
    const completed = jobCards.filter(jc => jc.status === 'COMPLETED');
    const delayed = jobCards.filter(jc => (jc.status === 'COMPLETED' && jc.completionStatus === 'DELAYED') || (jc.status === 'IN_PROCESS' && new Date(jc.expectedDeliveryAt) < new Date()));

    return {
      total,
      pending,
      inProcess,
      completed,
      delayed
    };
  }, [jobCards]);

  const openModal = (title: string, filterKey: string) => {
    if (filterKey === 'total') return; // Don't drill down into total orders for now
    setModalState({ isOpen: true, title, filterKey });
  };

  const getFilteredJobs = () => {
    switch (modalState.filterKey) {
      case 'pending': return stats.pending;
      case 'inProcess': return stats.inProcess;
      case 'completed': return stats.completed;
      case 'delayed': return stats.delayed;
      default: return [];
    }
  };

  // Option 1: Urgent Orders Radar & Live Floor Priority
  const urgentQueue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Active jobs only: not completed, not deleted, not cancelled
    const active = jobCards.filter((jc: any) => {
      const s = (jc.status || '').toUpperCase();
      return s !== 'COMPLETED' && s !== 'DELETED' && s !== 'CANCELLED';
    });

    const parsed = active.map((jc: any) => {
      let targetMs: number | null = null;
      let targetDisplay = '-';
      if (jc.targetDate) {
        const isoMatch = String(jc.targetDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const [, yyyy, mm, dd] = isoMatch;
          targetMs = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
          targetDisplay = `${dd}/${mm}/${yyyy.slice(2)}`;
        } else {
          const d = new Date(jc.targetDate);
          if (!isNaN(d.getTime())) {
            d.setHours(0, 0, 0, 0);
            targetMs = d.getTime();
            targetDisplay = d.toLocaleDateString('en-IN');
          }
        }
      }

      const diffDays = targetMs !== null ? Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24)) : null;

      let urgencyLevel: 'OVERDUE' | 'TODAY' | 'NEXT48' | 'UPCOMING' | 'NO_DATE' = 'NO_DATE';
      if (diffDays !== null) {
        if (diffDays < 0) urgencyLevel = 'OVERDUE';
        else if (diffDays === 0) urgencyLevel = 'TODAY';
        else if (diffDays <= 2) urgencyLevel = 'NEXT48';
        else urgencyLevel = 'UPCOMING';
      }

      return {
        ...jc,
        targetMs,
        targetDisplay,
        diffDays,
        urgencyLevel
      };
    });

    // Priority sorting: Overdue (diffDays < 0 ascending, most overdue first) -> Today -> Next48 -> Upcoming -> No Date
    const order: Record<string, number> = { OVERDUE: 1, TODAY: 2, NEXT48: 3, UPCOMING: 4, NO_DATE: 5 };
    parsed.sort((a: any, b: any) => {
      const rankA = order[String(a.urgencyLevel)] ?? 99;
      const rankB = order[String(b.urgencyLevel)] ?? 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      if (a.targetMs !== null && b.targetMs !== null) {
        return a.targetMs - b.targetMs;
      }
      if (a.targetMs !== null) return -1;
      if (b.targetMs !== null) return 1;
      const numA = parseInt(String(a.jobCardNo).split('/').pop() || '0', 10);
      const numB = parseInt(String(b.jobCardNo).split('/').pop() || '0', 10);
      return numB - numA;
    });

    const overdueList = parsed.filter((j: any) => j.urgencyLevel === 'OVERDUE');
    const todayList = parsed.filter((j: any) => j.urgencyLevel === 'TODAY');
    const next48List = parsed.filter((j: any) => j.urgencyLevel === 'NEXT48');

    return {
      all: parsed,
      overdueList,
      todayList,
      next48List,
      counts: {
        total: parsed.length,
        overdue: overdueList.length,
        today: todayList.length,
        next48: next48List.length
      }
    };
  }, [jobCards]);

  const filteredRadarJobs = useMemo(() => {
    switch (radarFilter) {
      case 'OVERDUE': return urgentQueue.overdueList;
      case 'TODAY': return urgentQueue.todayList;
      case 'NEXT48': return urgentQueue.next48List;
      case 'IN_PROCESS': return urgentQueue.all.filter((j: any) => j.status === 'IN_PROCESS');
      default: return urgentQueue.all;
    }
  }, [urgentQueue, radarFilter]);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Operational Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time overview of production metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {/* Total Orders Card */}
        <div className="p-6 bg-card border border-border shadow-sm rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Total Orders</h2>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layers className="w-5 h-5 text-primary" />
            </div>
          </div>
          <p className="text-4xl font-bold text-foreground">
            {loadingJC ? '...' : stats.total}
          </p>
        </div>

        {/* Pending Card */}
        <div 
          onClick={() => openModal('Pending', 'pending')}
          className="p-6 bg-card border border-border shadow-sm rounded-xl cursor-pointer hover:border-yellow-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Pending</h2>
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-foreground">
            {loadingJC ? '...' : stats.pending.length}
          </p>
        </div>

        {/* In-Process Card */}
        <div 
          onClick={() => openModal('In Process', 'inProcess')}
          className="p-6 bg-card border border-border shadow-sm rounded-xl cursor-pointer hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground">In-Process</h2>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-foreground">
            {loadingJC ? '...' : stats.inProcess.length}
          </p>
        </div>

        {/* Completed Card */}
        <div 
          onClick={() => openModal('Completed', 'completed')}
          className="p-6 bg-card border border-border shadow-sm rounded-xl cursor-pointer hover:border-green-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Completed</h2>
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-foreground">
            {loadingJC ? '...' : stats.completed.length}
          </p>
        </div>

        {/* Delayed Card */}
        <div 
          onClick={() => openModal('Delayed', 'delayed')}
          className="p-6 bg-card border border-border shadow-sm rounded-xl cursor-pointer hover:border-red-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Delayed</h2>
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-foreground">
            {loadingJC ? '...' : stats.delayed.length}
          </p>
        </div>
      </div>

      {hasRole('ADMIN') && frozenReels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center">
            <Snowflake className="w-5 h-5 mr-2 text-blue-500" />
            Frozen Reels (Reserved for Active/Pending Job Cards)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {frozenReels.map((reel: any) => (
              <div key={reel.id} className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-blue-100/50 pointer-events-none">
                   <Snowflake className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">Reel No</p>
                      <p className="font-bold text-blue-900">{reel.reelNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-muted-foreground uppercase">Weight</p>
                      <p className="font-bold text-foreground">{reel.currentBalance} Kg</p>
                    </div>
                  </div>
                  <p className="text-xs mb-3">
                    Reserved For JC: <span className="font-semibold text-primary">{jobCards.find((jc: any) => jc.id === reel.reservedForJC)?.jobCardNo || reel.reservedForJC}</span>
                  </p>
                  <button 
                    onClick={() => handleUnfreeze(reel.id)}
                    disabled={unfreezingId === reel.id}
                    className="w-full flex items-center justify-center text-xs font-bold bg-white border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white transition-colors py-2 rounded-md"
                  >
                    {unfreezingId === reel.id ? 'Unfreezing...' : <><Unlock className="w-3 h-3 mr-1.5" /> Force Unfreeze</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 3: Pending Approvals Widget (Admin Only) */}
      {hasRole('ADMIN') && pendingApprovals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center">
            <ShieldAlert className="w-5 h-5 mr-2 text-orange-500" />
            Pending Approvals — Oversize Reel Requests
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{pendingApprovals.length}</span>
          </h2>
          <div className="flex flex-col gap-3">
            {pendingApprovals.map((jc: any) => {
              const requestedAt = jc.approvalRequestedAt ? new Date(jc.approvalRequestedAt) : null;
              const expiresAt = jc.approvalExpiresAt ? new Date(jc.approvalExpiresAt) : null;
              const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000)) : null;
              return (
                <div key={jc.id} className="bg-orange-50/60 border border-orange-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-foreground text-sm">JC #{jc.jobCardNo}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Oversize</span>
                    </div>
                    <p className="text-sm text-foreground font-medium truncate">{jc.productSnapshot?.productName || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Requested by: <span className="font-semibold text-foreground">{jc.approvalRequestedBy || 'Unknown'}</span>
                      {requestedAt && <> · {formatDistanceToNow(requestedAt, { addSuffix: true })}</>}
                    </p>
                    <div className="mt-2 bg-white border border-orange-100 rounded-lg p-2.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Reason Given:</p>
                      <p className="text-sm text-foreground">{jc.approvalReason}</p>
                    </div>
                    {hoursLeft !== null && (
                      <p className={cn("text-xs mt-2 font-semibold", hoursLeft < 6 ? "text-red-600" : "text-orange-600")}>
                        ⏱ Expires in: {hoursLeft}h
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setViewingJobCard(jc)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      View
                    </button>
                    <button
                      onClick={() => handleApprovalAction(jc.id, 'REJECTED')}
                      disabled={approvingId === jc.id + 'REJECTED'}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-white border border-red-200 text-red-700 hover:bg-red-600 hover:text-white transition-colors"
                    >
                      <ShieldX className="w-4 h-4" />
                      {approvingId === jc.id + 'REJECTED' ? '...' : 'Reject'}
                    </button>
                    <button
                      onClick={() => handleApprovalAction(jc.id, 'APPROVED')}
                      disabled={approvingId === jc.id + 'APPROVED'}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {approvingId === jc.id + 'APPROVED' ? '...' : 'Approve'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
         {/* Option 1: Urgent Orders Radar & Live Floor Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[420px]">
        
        {/* Left Column: Urgent Orders Radar (2 Cols) */}
        <div className="bg-card border border-border shadow-sm rounded-xl p-5 sm:p-6 flex flex-col lg:col-span-2 overflow-hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-border/70">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-foreground text-lg tracking-tight">Urgent Orders Radar</h3>
                  {urgentQueue.counts.overdue > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 animate-pulse">
                      {urgentQueue.counts.overdue} OVERDUE
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Live production floor priorities sorted by target deadline</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1 bg-muted/60 p-1 rounded-lg border border-border self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setRadarFilter('ALL')}
                className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", radarFilter === 'ALL' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                All ({urgentQueue.counts.total})
              </button>
              <button
                type="button"
                onClick={() => setRadarFilter('OVERDUE')}
                className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1", radarFilter === 'OVERDUE' ? "bg-red-600 text-white shadow-xs" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30")}
              >
                Overdue ({urgentQueue.counts.overdue})
              </button>
              <button
                type="button"
                onClick={() => setRadarFilter('TODAY')}
                className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1", radarFilter === 'TODAY' ? "bg-amber-500 text-white shadow-xs" : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30")}
              >
                Today ({urgentQueue.counts.today})
              </button>
              <button
                type="button"
                onClick={() => setRadarFilter('NEXT48')}
                className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", radarFilter === 'NEXT48' ? "bg-blue-600 text-white shadow-xs" : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30")}
              >
                Next 48h ({urgentQueue.counts.next48})
              </button>
              <button
                type="button"
                onClick={() => setRadarFilter('IN_PROCESS')}
                className={cn("px-2.5 py-1 text-xs font-bold rounded-md transition-all", radarFilter === 'IN_PROCESS' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
              >
                In-Process
              </button>
            </div>
          </div>

          {/* Radar Job Cards List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[460px]">
            {filteredRadarJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-base font-bold text-foreground">All Orders On Track!</p>
                <p className="text-xs text-muted-foreground mt-1">No job cards found in this priority category right now.</p>
              </div>
            ) : (
              filteredRadarJobs.map((jc: any) => (
                <div
                  key={jc.id}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                    jc.urgencyLevel === 'OVERDUE'
                      ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 hover:border-red-400"
                      : jc.urgencyLevel === 'TODAY'
                      ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 hover:border-amber-400"
                      : "bg-background border-border/70 hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {jc.urgencyLevel === 'OVERDUE' ? (
                        <span className="flex h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 items-center justify-center font-bold text-xs">
                          <AlertCircle className="w-4 h-4" />
                        </span>
                      ) : jc.urgencyLevel === 'TODAY' ? (
                        <span className="flex h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 items-center justify-center font-bold text-xs">
                          <Clock className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="flex h-8 w-8 rounded-lg bg-primary/10 text-primary items-center justify-center font-bold text-xs">
                          <Layers className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="font-black text-foreground text-sm tracking-tight">{jc.jobCardNo}</span>
                        {jc.poNo && (
                          <span className="px-1.5 py-0.2 text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 rounded">
                            PO: {jc.poNo}
                          </span>
                        )}
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border",
                          jc.status === 'IN_PROCESS' 
                            ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300"
                            : jc.status === 'PENDING APPROVAL'
                            ? "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300"
                            : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300"
                        )}>
                          {jc.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground truncate max-w-[180px]" title={jc.customerName}>{jc.customerName}</span>
                        <span>•</span>
                        <span className="text-foreground/90 font-medium truncate max-w-[200px]" title={jc.productName}>{jc.productName}</span>
                        {jc.productSnapshot && (
                          <span className="text-muted-foreground/70 font-mono text-[11px]">
                            ({jc.productSnapshot.length}"x{jc.productSnapshot.width}"x{jc.productSnapshot.height}")
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metrics & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-bold text-foreground">{Number(jc.orderQty || 0).toLocaleString()} pcs</p>
                      <p className="text-[11px] text-muted-foreground">{jc.totalWeight ? `${jc.totalWeight} Kg` : '-'}</p>
                    </div>

                    {/* Target Deadline Badge */}
                    <div className="min-w-[115px] text-right">
                      {jc.urgencyLevel === 'OVERDUE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black bg-red-600 text-white shadow-xs">
                          <AlertTriangle className="w-3 h-3" />
                          {Math.abs(jc.diffDays)}d Overdue
                        </span>
                      ) : jc.urgencyLevel === 'TODAY' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black bg-amber-500 text-white shadow-xs">
                          <Clock className="w-3 h-3" />
                          Due Today
                        </span>
                      ) : jc.urgencyLevel === 'NEXT48' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          {jc.diffDays === 1 ? 'Due Tomorrow' : `In 2 days`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-semibold">
                          Target: {jc.targetDisplay}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewingJobCard(jc)}
                      className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border/60"
                      title="View & Print Job Card"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Floor Urgency Summary + Live Activity Feed (1 Col) */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          
          {/* Floor Urgency Summary Widget */}
          <div className="bg-card border border-border shadow-sm rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Floor Urgency Summary
              </h3>
              <button 
                type="button"
                onClick={() => navigate('/job-cards')}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                All Jobs <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div 
                onClick={() => setRadarFilter('OVERDUE')}
                className={cn("p-2.5 rounded-lg cursor-pointer transition-all border", radarFilter === 'OVERDUE' ? "bg-red-600 text-white border-red-600" : "bg-red-500/10 border-red-200/60 hover:border-red-400")}
              >
                <p className={cn("text-[10px] uppercase font-bold", radarFilter === 'OVERDUE' ? "text-white" : "text-red-700")}>Overdue</p>
                <p className={cn("text-xl font-black", radarFilter === 'OVERDUE' ? "text-white" : "text-red-600")}>{urgentQueue.counts.overdue}</p>
              </div>
              <div 
                onClick={() => setRadarFilter('TODAY')}
                className={cn("p-2.5 rounded-lg cursor-pointer transition-all border", radarFilter === 'TODAY' ? "bg-amber-500 text-white border-amber-500" : "bg-amber-500/10 border-amber-200/60 hover:border-amber-400")}
              >
                <p className={cn("text-[10px] uppercase font-bold", radarFilter === 'TODAY' ? "text-white" : "text-amber-700")}>Due Today</p>
                <p className={cn("text-xl font-black", radarFilter === 'TODAY' ? "text-white" : "text-amber-600")}>{urgentQueue.counts.today}</p>
              </div>
              <div 
                onClick={() => setRadarFilter('NEXT48')}
                className={cn("p-2.5 rounded-lg cursor-pointer transition-all border", radarFilter === 'NEXT48' ? "bg-blue-600 text-white border-blue-600" : "bg-blue-500/10 border-blue-200/60 hover:border-blue-400")}
              >
                <p className={cn("text-[10px] uppercase font-bold", radarFilter === 'NEXT48' ? "text-white" : "text-blue-700")}>Next 48h</p>
                <p className={cn("text-xl font-black", radarFilter === 'NEXT48' ? "text-white" : "text-blue-600")}>{urgentQueue.counts.next48}</p>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-card border border-border shadow-sm rounded-xl p-6 flex flex-col flex-1 min-h-[280px] overflow-hidden">
             <h3 className="font-semibold text-foreground mb-4 text-sm flex items-center justify-between">
                Live Activity Feed
                {loadingLogs && <span className="text-xs text-muted-foreground animate-pulse">Syncing...</span>}
             </h3>
             <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {activityLogs.length > 0 ? (
                   activityLogs.map((log: any) => {
                    let ts = Date.now();
                    if (log.timestamp?.toDate) ts = log.timestamp.toDate().getTime();
                    else if (log.timestamp) ts = new Date(log.timestamp).getTime();
                    else if (log.createdAt?.toDate) ts = log.createdAt.toDate().getTime();

                    let displayAction = log.action;
                    if (displayAction === 'Updated') displayAction = 'Modified';
                    
                    return (
                      <div key={log.id} className="flex items-start text-sm pb-3 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0">
                          {log.user?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="text-foreground leading-snug">
                            <span className="font-semibold">{log.user || 'System'}</span> {displayAction.toLowerCase()} <span className="font-medium text-primary">{log.entity === 'jobCards' ? 'Job Card' : log.entity}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(ts, { addSuffix: true })}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No recent activities found.</p>
                )}
             </div>
          </div>

        </div>

      </div>

      {modalState.isOpen && (
        <DashboardListModal 
          title={modalState.title}
          jobCards={getFilteredJobs()}
          onClose={() => setModalState({ isOpen: false, title: '', filterKey: '' })}
        />
      )}

      {viewingJobCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">View Job Card</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-job-card');
                    if (printContent) {
                      const printWindow = window.open('', '', 'width=900,height=600');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Print Job Card - ${viewingJobCard.jobCardNo}</title>
                              <script src="https://cdn.tailwindcss.com"></script>
                            </head>
                            <body class="bg-white p-8">
                              ${printContent.innerHTML}
                              <script>
                                setTimeout(() => {
                                  window.print();
                                  window.close();
                                }, 500);
                              </script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }
                  }}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </button>
                <button
                  onClick={() => setViewingJobCard(null)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100" id="print-job-card">
              <PrintableJobCard jobCard={viewingJobCard} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

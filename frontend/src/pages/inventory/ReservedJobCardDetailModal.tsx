import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Printer, Unlock, Calendar, User, Box, Layers, RefreshCw, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { unreserveReelFromJobCard, clearOrphanedReelReservation } from '../../lib/supabase/reelService';
import { cn } from '../../lib/utils';

export interface ReelReservationInfo {
  jobCardId: string;
  jobCardNo: string;
  customerName: string;
  productName: string;
  targetDate?: string | null;
  createdAt?: string | null;
  status: string;
  layerIndex: number;
  layerName: string;
  allocatedWeight: number;
  jobCard: any;
}

interface ReservedJobCardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reel: any;
  reservations: ReelReservationInfo[];
  initialSelectedJobCardId?: string;
  onReservationReleased: () => void;
  onViewPrintableJobCard: (jobCard: any) => void;
}

export default function ReservedJobCardDetailModal({
  isOpen,
  onClose,
  reel,
  reservations,
  onReservationReleased,
  onViewPrintableJobCard,
}: ReservedJobCardDetailModalProps) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');

  const [confirmUnreserve, setConfirmUnreserve] = useState<{
    jobCardId: string;
    jobCardNo: string;
    weight: number;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !reel) return null;

  const currentBalance = Number(reel.currentBalance) || 0;
  const activeReservedWeight = Number(reel.activeReservedWeight) || 0;
  const availableWeight = Math.max(0, currentBalance - activeReservedWeight);

  // Group reservations by Job Card
  const groupedByJobCard: Record<string, {
    jobCardId: string;
    jobCardNo: string;
    customerName: string;
    productName: string;
    targetDate?: string | null;
    createdAt?: string | null;
    status: string;
    jobCard: any;
    layers: { layerIndex: number; layerName: string; allocatedWeight: number }[];
    totalAllocated: number;
  }> = {};

  reservations.forEach(res => {
    if (!groupedByJobCard[res.jobCardId]) {
      groupedByJobCard[res.jobCardId] = {
        jobCardId: res.jobCardId,
        jobCardNo: res.jobCardNo,
        customerName: res.customerName,
        productName: res.productName,
        targetDate: res.targetDate,
        createdAt: res.createdAt,
        status: res.status,
        jobCard: res.jobCard,
        layers: [],
        totalAllocated: 0,
      };
    }
    groupedByJobCard[res.jobCardId].layers.push({
      layerIndex: res.layerIndex,
      layerName: res.layerName,
      allocatedWeight: res.allocatedWeight,
    });
    groupedByJobCard[res.jobCardId].totalAllocated += res.allocatedWeight;
  });

  const jobCardList = Object.values(groupedByJobCard);

  const handleExecuteUnreserve = async () => {
    if (!confirmUnreserve) return;
    try {
      setIsProcessing(true);
      setErrorMsg('');
      setSuccessMsg('');

      await unreserveReelFromJobCard(
        reel.id,
        reel.reelNumber,
        confirmUnreserve.jobCardId,
        user?.name || 'Admin'
      );

      setSuccessMsg(`Successfully released ${Math.round(confirmUnreserve.weight)} Kg from Job Card #${confirmUnreserve.jobCardNo}!`);
      setConfirmUnreserve(null);
      onReservationReleased();
    } catch (err: any) {
      console.error('Failed to unreserve reel:', err);
      setErrorMsg(err.message || 'Failed to release reservation. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearOrphaned = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg('');
      setSuccessMsg('');

      await clearOrphanedReelReservation(
        reel.id,
        reel.reelNumber,
        user?.name || 'Admin'
      );

      setSuccessMsg(`Successfully cleared lock on Reel #${reel.reelNumber}!`);
      onReservationReleased();
    } catch (err: any) {
      console.error('Failed to clear lock:', err);
      setErrorMsg(err.message || 'Failed to clear lock. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-card w-full max-w-2xl max-h-[92vh] rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center font-bold text-lg shadow-xs">
              🔒
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">
                  Reel Reservation Details
                </h2>
                <span className="font-mono px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  #{reel.reelNumber}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reel.paperType} | {reel.reelSize}" | {reel.bf} BF | {reel.gsm} GSM | Supplier: {reel.supplierName || reel.supplier || '-'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK MESSAGES */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-semibold rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* STOCK STATUS METRICS CARD */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-secondary/30 rounded-lg border border-border">
            <div className="text-center p-2 rounded bg-background border border-border/60">
              <span className="text-[11px] font-medium text-muted-foreground block">Physical Balance</span>
              <span className="text-base font-bold text-foreground">
                {Math.round(currentBalance)} <span className="text-xs font-normal">Kg</span>
              </span>
            </div>

            <div className="text-center p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block">Active Reserved</span>
              <span className="text-base font-black text-amber-700 dark:text-amber-400">
                {Math.round(activeReservedWeight)} <span className="text-xs font-normal">Kg</span>
              </span>
            </div>

            <div className="text-center p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">Available (Free)</span>
              <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                {Math.round(availableWeight)} <span className="text-xs font-normal">Kg</span>
              </span>
            </div>
          </div>

          {/* RESERVING JOB CARDS LIST */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Job Cards Holding This Reel ({jobCardList.length})</span>
              {jobCardList.length > 0 && (
                <span className="text-[11px] font-semibold text-foreground">
                  Total Allocated: {Math.round(jobCardList.reduce((acc, jc) => acc + jc.totalAllocated, 0))} Kg
                </span>
              )}
            </h3>

            {jobCardList.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-border rounded-xl bg-secondary/10">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-foreground">No Active Job Cards Found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This reel has <span className="font-bold text-amber-700">{Math.round(activeReservedWeight)} Kg</span> locked in inventory, but no active Job Card allocation is referencing it.
                </p>
                {isAdmin && activeReservedWeight > 0 && (
                  <button
                    type="button"
                    onClick={handleClearOrphaned}
                    disabled={isProcessing}
                    className="mt-4 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs inline-flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isProcessing && "animate-spin")} />
                    Clear Orphaned Lock (Reset to 0)
                  </button>
                )}
              </div>
            ) : (
              jobCardList.map((jcItem) => (
                <div 
                  key={jcItem.jobCardId} 
                  className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3 hover:border-amber-400 transition-colors"
                >
                  {/* CARD HEADER */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-foreground bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        JC #{jcItem.jobCardNo}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        jcItem.status === 'PENDING' ? "bg-amber-100 text-amber-800 border-amber-300" :
                        jcItem.status === 'IN_PROCESS' ? "bg-blue-100 text-blue-800 border-blue-300" :
                        "bg-secondary text-secondary-foreground border-border"
                      )}>
                        {jcItem.status}
                      </span>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        🔒 Reserved: {Math.round(jcItem.totalAllocated)} Kg
                      </span>
                    </div>
                  </div>

                  {/* CUSTOMER & PRODUCT DETAILS */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Customer</span>
                      <span className="font-bold text-foreground truncate block">{jcItem.customerName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Product</span>
                      <span className="font-bold text-foreground truncate block">{jcItem.productName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Target Date</span>
                      <span className="font-semibold text-foreground block">
                        {jcItem.targetDate ? new Date(jcItem.targetDate).toLocaleDateString('en-IN') : '-'}
                      </span>
                    </div>
                  </div>

                  {/* LAYER BREAKDOWN */}
                  <div className="bg-secondary/20 rounded-lg p-2.5 border border-border/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Layers Allocated from this Reel:
                    </span>
                    <div className="space-y-1.5">
                      {jcItem.layers.map((l, lIdx) => (
                        <div key={lIdx} className="flex items-center justify-between text-xs bg-background p-1.5 rounded border border-border/60">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                            {l.layerName}
                          </span>
                          <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                            {Math.round(l.allocatedWeight)} Kg
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onViewPrintableJobCard(jcItem.jobCard)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                      View / Print Job Card
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmUnreserve({
                          jobCardId: jcItem.jobCardId,
                          jobCardNo: jcItem.jobCardNo,
                          weight: jcItem.totalAllocated,
                        })}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 hover:border-red-600 flex items-center gap-1.5 transition-all shadow-xs"
                        title="Release reservation and free weight for other job cards"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        Release Reservation (Admin)
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-secondary/30 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {isAdmin ? '🛡️ Admin privileges active: You can release reservations.' : '🔒 View-only mode for non-admin staff.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors"
          >
            Close
          </button>
        </div>

        {/* UNRESERVE CONFIRMATION DIALOG */}
        {confirmUnreserve && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-card w-full max-w-md rounded-xl p-6 shadow-2xl border border-destructive/30 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shrink-0">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">
                    Release Reservation?
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Reel #{reel.reelNumber} → Job Card #{confirmUnreserve.jobCardNo}
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-lg border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">Are you sure you want to release this reservation?</p>
                <p className="text-[11px] opacity-90">
                  This will remove this reel allocation from Job Card #{confirmUnreserve.jobCardNo} and make{' '}
                  <span className="font-bold underline">{Math.round(confirmUnreserve.weight)} Kg</span> available in inventory stock immediately.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmUnreserve(null)}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteUnreserve}
                  disabled={isProcessing}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-1.5 transition-all"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Releasing...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      Confirm Release
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

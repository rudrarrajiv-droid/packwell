import React, { useState } from 'react';
import { X, CircleDashed, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { updateJobCard } from '../../lib/supabase/jobCardService';

export default function CompleteProductionModal({ jobCard, onClose, onSuccess }: { jobCard: any, onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [completionType, setCompletionType] = useState<'PART' | 'FINAL'>('FINAL');
  const [productionQty, setProductionQty] = useState('');
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  
  const totalRequired = Number(jobCard.orderQty) || 0;
  const producedSoFar = Number(jobCard.producedQty) || 0;
  const pendingBalance = Math.max(0, totalRequired - producedSoFar);

  // Auto-fill quantity when FINAL is selected
  const handleTypeChange = (type: 'PART' | 'FINAL') => {
    setCompletionType(type);
    if (type === 'FINAL') {
      setProductionQty(pendingBalance.toString());
    } else {
      setProductionQty('');
    }
  };

  const executeCompletion = async () => {
    const qty = Number(productionQty);
    try {
      setIsSubmitting(true);
      
      const now = new Date();
      const expected = new Date(jobCard.expectedDeliveryAt);
      const isDelayed = now > expected;

      const newProducedTotal = producedSoFar + qty;

      const newJobCardPayload: any = {
        producedQty: newProducedTotal,
      };

      if (completionType === 'FINAL') {
        newJobCardPayload.status = 'COMPLETED';
        newJobCardPayload.completedAt = now.toISOString();
        newJobCardPayload.completedBy = user?.name || 'System';
        newJobCardPayload.completionStatus = isDelayed ? 'DELAYED' : 'ON TIME';
      }

      await updateJobCard(jobCard.id, newJobCardPayload, user?.name || 'System');
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to complete job card');
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const qty = Number(productionQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid Production Quantity.");
      return;
    }

    await executeCompletion();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-card w-full max-w-lg rounded-xl shadow-2xl flex flex-col border border-border">
        
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0 bg-green-50">
          <div>
            <h2 className="text-xl font-bold text-green-900 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              Complete Production
            </h2>
            <p className="text-xs text-green-700 mt-1 font-medium">Job Card: {jobCard.jobCardNo}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 flex-1 flex flex-col gap-6">
          
          <div className="grid grid-cols-3 gap-4 bg-secondary/20 p-4 rounded-lg border border-border">
            <div className="text-center border-r border-border">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Total Required</p>
              <p className="text-xl font-black text-foreground">{totalRequired}</p>
            </div>
            <div className="text-center border-r border-border">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Produced So Far</p>
              <p className="text-xl font-black text-blue-600">{producedSoFar}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Pending Balance</p>
              <p className="text-xl font-black text-red-600">{pendingBalance}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">Completion Date</label>
              <input 
                type="date"
                required
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">Completion Type</label>
              <div className="flex bg-secondary p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => handleTypeChange('PART')}
                  className={cn(
                    "flex-1 text-xs font-bold py-1.5 rounded-sm transition-all",
                    completionType === 'PART' ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  PART (Incomplete)
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('FINAL')}
                  className={cn(
                    "flex-1 text-xs font-bold py-1.5 rounded-sm transition-all",
                    completionType === 'FINAL' ? "bg-white text-green-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  FINAL (Complete)
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-bold text-foreground">
              Production Quantity <span className="text-destructive">*</span>
            </label>
            <input 
              type="number" 
              required
              min="1"
              value={productionQty}
              onChange={(e) => setProductionQty(e.target.value)}
              placeholder="Enter Quantity produced..."
              className="w-full text-xl font-bold rounded-md border border-input px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {completionType === 'FINAL' && Number(productionQty) !== pendingBalance && (
              <p className="text-xs text-orange-600 font-bold mt-1">
                Note: You are closing this Job Card with {productionQty || '0'} qty, but pending balance was {pendingBalance}.
              </p>
            )}
          </div>

          <div className="bg-orange-50 text-orange-900 text-xs p-3 rounded border border-orange-100 flex items-start mt-2">
            <CheckCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
            <p>
              This will update the Job Card but will <strong>NOT</strong> automatically add to the Finish Goods Inventory. You will need to inward it manually.
            </p>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting || !productionQty}
              className={cn(
                "px-6 py-2 text-sm font-bold rounded-md text-white transition-colors shadow flex items-center disabled:opacity-50",
                completionType === 'FINAL' ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isSubmitting && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
              {completionType === 'FINAL' ? 'Complete Job Card' : 'Save Partial Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

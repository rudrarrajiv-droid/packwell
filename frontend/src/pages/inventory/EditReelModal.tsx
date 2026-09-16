import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Edit3, X, CircleDashed, AlertTriangle, CheckCircle2, Scale, Info, ArrowUpFromLine, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { updatePurchasedReel, type Reel } from '../../lib/supabase/reelService';

interface EditReelModalProps {
  reel: Reel;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditReelFormData {
  reelNumber: string;
  paperType: string;
  reelSize: number | '';
  bf: string;
  gsm: number | '';
  rate: number | '';
  weight: number | '';
  inwardDate: string;
  supplierName: string;
  manufacturerName: string;
}

export default function EditReelModal({ reel, onClose, onSuccess }: EditReelModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Calculate consumed weight on this reel initially
  const initialWeight = Number(reel.weight) || 0;
  const currentBalance = Number(reel.currentBalance) || 0;
  const initialConsumedWeight = Math.max(0, initialWeight - currentBalance);
  const isFullyConsumed = currentBalance <= 0 && initialWeight > 0;

  // OUT adjustment mode & state
  const [adjustMode, setAdjustMode] = useState<'AUTO_OUT' | 'FIXED_OUT' | 'CUSTOM'>('AUTO_OUT');
  const [outWeight, setOutWeight] = useState<number | ''>(initialConsumedWeight);

  // Format initial inward date (YYYY-MM-DD)
  const defaultInwardDate = reel.inwardDate
    ? reel.inwardDate.substring(0, 10)
    : new Date().toISOString().split('T')[0];

  const { register, handleSubmit, watch, formState: { errors } } = useForm<EditReelFormData>({
    defaultValues: {
      reelNumber: reel.reelNumber || '',
      paperType: reel.paperType || 'SK',
      reelSize: reel.reelSize ? Number(reel.reelSize) : '',
      bf: reel.bf || '16',
      gsm: reel.gsm ? Number(reel.gsm) : '',
      rate: reel.rate !== undefined ? Number(reel.rate) : '',
      weight: initialWeight || '',
      inwardDate: defaultInwardDate,
      supplierName: reel.supplierName || '',
      manufacturerName: reel.manufacturerName || '',
    }
  });

  const watchedWeight = watch('weight');
  const numericWatchedWeight = Number(watchedWeight) || 0;

  // Reactively adjust outWeight when Initial Purchase Weight changes
  useEffect(() => {
    if (initialConsumedWeight <= 0) return;

    if (adjustMode === 'AUTO_OUT') {
      if (isFullyConsumed) {
        // Entire reel went to production, so OUT matches new initial weight
        setOutWeight(numericWatchedWeight > 0 ? numericWatchedWeight : '');
      } else {
        // Partially consumed: scale or apply difference
        const diff = (numericWatchedWeight || 0) - initialWeight;
        const newCalculatedOut = Math.max(0, initialConsumedWeight + diff);
        setOutWeight(newCalculatedOut);
      }
    } else if (adjustMode === 'FIXED_OUT') {
      setOutWeight(initialConsumedWeight);
    }
  }, [numericWatchedWeight, adjustMode, isFullyConsumed, initialConsumedWeight, initialWeight]);

  const numericOutWeight = outWeight === '' ? 0 : Number(outWeight);
  const projectedBalance = Math.max(0, numericWatchedWeight - numericOutWeight);
  const isOutExceedsWeight = numericOutWeight > numericWatchedWeight && numericWatchedWeight > 0;

  const onSubmit = async (data: EditReelFormData) => {
    setError(null);
    setSuccessMsg(null);

    const weightNum = Number(data.weight);
    if (!weightNum || weightNum <= 0) {
      setError('Please enter a valid Initial Purchase Weight greater than 0.');
      return;
    }

    if (initialConsumedWeight > 0) {
      if (outWeight === '' || Number(outWeight) < 0) {
        setError('Please enter a valid Production OUT weight.');
        return;
      }
      if (Number(outWeight) > weightNum) {
        setError(`Production OUT weight (${outWeight} Kg) cannot exceed Initial Purchase Weight (${weightNum} Kg).`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const finalConsumed = initialConsumedWeight > 0 ? Number(outWeight) : 0;

      await updatePurchasedReel(
        {
          reelId: reel.id!,
          reelNumber: data.reelNumber,
          paperType: data.paperType,
          reelSize: Number(data.reelSize) || 0,
          bf: data.bf,
          gsm: Number(data.gsm) || 0,
          rate: Number(data.rate) || 0,
          weight: weightNum,
          inwardDate: data.inwardDate,
          supplierName: data.supplierName,
          manufacturerName: data.manufacturerName,
          consumedWeight: finalConsumed,
        },
        user?.name || 'System'
      );

      setSuccessMsg('Reel & Production OUT updated successfully!');
      setTimeout(() => {
        onSuccess();
      }, 700);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update reel. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-xl shadow-2xl flex flex-col border border-border overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Edit Purchased Reel</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                  #{reel.reelNumber}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Update reel specifications, weight, purchase date or production OUT.
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error and Success Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2.5 text-destructive text-sm animate-in slide-in-from-top-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2.5 text-green-700 dark:text-green-400 text-sm animate-in slide-in-from-top-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="edit-reel-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          
          {/* Section 1: Inward & Identification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reel Number <span className="text-destructive">*</span>
              </label>
              <input
                {...register('reelNumber', { required: 'Reel number is required' })}
                className={`${inputCls} font-mono font-bold uppercase`}
                placeholder="e.g. 8261"
              />
              {errors.reelNumber && <p className="text-xs text-destructive">{errors.reelNumber.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Inward / Purchase Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                {...register('inwardDate', { required: 'Inward date is required' })}
                className={inputCls}
              />
              {errors.inwardDate && <p className="text-xs text-destructive">{errors.inwardDate.message}</p>}
            </div>
          </div>

          {/* Section 2: Technical Specifications */}
          <div className="bg-secondary/15 p-4 rounded-lg border border-border space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Reel Specifications
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Paper Type</label>
                <select {...register('paperType', { required: true })} className={inputCls}>
                  <option value="SK">SK</option>
                  <option value="VK">VK</option>
                  <option value="HWC">HWC</option>
                  <option value="DUPLEX">DUPLEX</option>
                  <option value="OTHERS">OTHERS</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Size (inches)</label>
                <input
                  type="number"
                  step="0.1"
                  {...register('reelSize', { required: true })}
                  className={inputCls}
                  placeholder="e.g. 32"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">BF</label>
                <input
                  {...register('bf', { required: true })}
                  className={inputCls}
                  placeholder="e.g. 16"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">GSM</label>
                <input
                  type="number"
                  {...register('gsm', { required: true })}
                  className={inputCls}
                  placeholder="e.g. 100"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Weight & Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Purchase Rate (₹ / Kg)
              </label>
              <input
                type="number"
                step="0.01"
                {...register('rate')}
                className={inputCls}
                placeholder="e.g. 32.50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                <span>Initial Purchase Weight (Kg) <span className="text-destructive">*</span></span>
              </label>
              <input
                type="number"
                step="1"
                {...register('weight', { required: 'Weight is required' })}
                className={`${inputCls} font-bold text-base border-primary/40`}
                placeholder="e.g. 500"
              />
            </div>
          </div>

          {/* Section 4: Production OUT Auto-Adjustment (Displayed when reel was already taken in production) */}
          {initialConsumedWeight > 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md">
                    <ArrowUpFromLine className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                      Production OUT Auto-Update (प्रोडक्शन खपत)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      इस रील का वज़न प्रोडक्शन में लिया जा चुका है। वज़न बदलने पर आउट भी ऑटोमैटिक अपडेट होगा।
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-200/60 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  {isFullyConsumed ? 'Full Reel Outwarded (Nil Balance)' : `Current OUT: ${Math.round(initialConsumedWeight)} Kg`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center justify-between">
                    <span>Production OUT Weight (Kg)</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      Original: {Math.round(initialConsumedWeight)} Kg
                    </span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={outWeight}
                    onChange={(e) => {
                      setAdjustMode('CUSTOM');
                      setOutWeight(e.target.value === '' ? '' : Number(e.target.value));
                    }}
                    className={`${inputCls} font-bold text-base text-amber-700 dark:text-amber-300 border-amber-500/40`}
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground block">Adjustment Mode</span>
                  <div className="space-y-1.5 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-foreground font-medium">
                      <input
                        type="radio"
                        name="adjustMode"
                        checked={adjustMode === 'AUTO_OUT'}
                        onChange={() => {
                          setAdjustMode('AUTO_OUT');
                          if (isFullyConsumed) {
                            setOutWeight(numericWatchedWeight);
                          } else {
                            const diff = numericWatchedWeight - initialWeight;
                            setOutWeight(Math.max(0, initialConsumedWeight + diff));
                          }
                        }}
                        className="text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>
                        {isFullyConsumed 
                          ? 'Auto-sync entire weight to OUT (Balance = 0)' 
                          : 'Auto-adjust OUT with weight difference'}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-foreground font-medium">
                      <input
                        type="radio"
                        name="adjustMode"
                        checked={adjustMode === 'FIXED_OUT'}
                        onChange={() => {
                          setAdjustMode('FIXED_OUT');
                          setOutWeight(initialConsumedWeight);
                        }}
                        className="text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Keep OUT at {Math.round(initialConsumedWeight)} Kg (put difference in Balance)</span>
                    </label>
                  </div>
                </div>
              </div>

              {isOutExceedsWeight && (
                <div className="p-2 bg-destructive/10 rounded-md border border-destructive/20 text-xs text-destructive flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Production OUT ({numericOutWeight} Kg) cannot exceed Initial Purchase Weight ({numericWatchedWeight} Kg).
                </div>
              )}
            </div>
          ) : null}

          {/* Live Weight Balance Calculation Card */}
          <div className="bg-primary/5 rounded-xl border border-primary/15 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1.5 text-foreground font-bold">
                <Scale className="w-4 h-4 text-primary" /> Live Balance & OUT Summary
              </span>
              <span className="text-xs text-muted-foreground">
                Formula: Balance = Initial Wt - Production OUT
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
              <div className="bg-background/90 p-2.5 rounded-lg border border-border/70 shadow-sm">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">New Initial Wt</div>
                <div className="text-base font-black text-foreground">{numericWatchedWeight || 0} Kg</div>
              </div>

              <div className="bg-background/90 p-2.5 rounded-lg border border-border/70 shadow-sm">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Production OUT</div>
                <div className="text-base font-black text-amber-600 dark:text-amber-400">-{numericOutWeight || 0} Kg</div>
              </div>

              <div className="bg-background/90 p-2.5 rounded-lg border border-border/70 shadow-sm">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Stock Balance</div>
                <div className={`text-base font-black ${projectedBalance === 0 ? 'text-muted-foreground' : 'text-green-600'}`}>
                  {projectedBalance} Kg
                </div>
              </div>
            </div>

            {initialConsumedWeight > 0 && (
              <p className="text-[11px] text-green-700 dark:text-green-400 font-medium flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5 shrink-0" />
                Production OUT transaction in history, ledger, and monthly summary will automatically update to <strong>{numericOutWeight} Kg</strong>.
              </p>
            )}
          </div>

          {/* Section 5: Supplier & Manufacturer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Supplier Name</label>
              <input
                {...register('supplierName')}
                className={inputCls}
                placeholder="e.g. Star Paper Mills"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Manufacturer Name</label>
              <input
                {...register('manufacturerName')}
                className={inputCls}
                placeholder="e.g. Star Paper Mills"
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border flex items-center justify-end gap-3 bg-secondary/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            form="edit-reel-form"
            disabled={isSubmitting || isOutExceedsWeight}
            className="px-6 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <CircleDashed className="w-4 h-4 mr-2 animate-spin" />
                Updating Reel & OUT...
              </>
            ) : (
              'Save & Update Reel'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

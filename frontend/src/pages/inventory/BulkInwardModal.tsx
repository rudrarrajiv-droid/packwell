import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ArrowDownToLine, X, CircleDashed, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createBulkInwardReels } from '../../lib/supabase/reelService';

interface ReelRow {
  reelNo: string;
  paperType: string;
  size: number | '';
  bf: string;
  gsm: number | '';
  rate: number | '';
  weight: number | '';
}

interface BulkInwardForm {
  inwardDate: string;
  supplierName: string;
  manufacturerName: string;
  rows: ReelRow[];
}

export default function BulkInwardModal({ reels, onClose, onSuccess }: { reels: any[], onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reel Number Auto Generation logic
  const getNextReelNumber = (currentRows: ReelRow[]) => {
    const date = new Date();
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear().toString().slice(2); // e.g. '26'
    const prefix = `${month}${year}`;

    let maxSeq = 0;

    // Check existing reels from DB
    if (reels) {
      reels.forEach(r => {
        if (r.reelNumber && r.reelNumber.startsWith(prefix)) {
          const seqStr = r.reelNumber.replace(prefix, '');
          const seqNum = parseInt(seqStr, 10);
          if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
          }
        }
      });
    }

    // Check current form rows
    if (currentRows) {
      currentRows.forEach(r => {
        if (r.reelNo && r.reelNo.startsWith(prefix)) {
          const seqStr = r.reelNo.replace(prefix, '');
          const seqNum = parseInt(seqStr, 10);
          if (!isNaN(seqNum) && seqNum > maxSeq) {
            maxSeq = seqNum;
          }
        }
      });
    }

    return `${prefix}${maxSeq + 1}`;
  };

  const { register, control, handleSubmit, watch, getValues, setValue } = useForm<BulkInwardForm>({
    defaultValues: {
      inwardDate: new Date().toISOString().split('T')[0],
      supplierName: '',
      manufacturerName: '',
      rows: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rows'
  });

  // Initialize first row on mount (strict mode safe)
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && fields.length === 0) {
      initialized.current = true;
      append({ 
        reelNo: getNextReelNumber([]), 
        paperType: 'SK', 
        size: 32, 
        bf: '16', 
        gsm: 100, 
        rate: 0, 
        weight: '' 
      });
    }
  }, [append]);

  const rows = watch('rows');
  const validReelsCount = rows.filter(r => Number(r.weight) > 0).length;
  const totalWeight = rows.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
  const totalValue = rows.reduce((acc, r) => acc + ((Number(r.weight) || 0) * (Number(r.rate) || 0)), 0);

  // Auto-scroll to bottom when a new row is added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [fields.length]);

  const handleWeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent accidental form submission
      
      const val = Number(e.currentTarget.value);
      if (val > 0 && index === fields.length - 1) {
        // Auto-generate next row based on current row's inherited values
        const currentRow = getValues(`rows.${index}`);
        append({
          reelNo: getNextReelNumber(getValues('rows')),
          paperType: currentRow.paperType,
          size: currentRow.size,
          bf: currentRow.bf,
          gsm: currentRow.gsm,
          rate: currentRow.rate,
          weight: ''
        });
      }
      
      // Auto focus the next row's weight input
      setTimeout(() => {
        const nextInput = document.getElementById(`weight-${index + 1}`);
        if (nextInput) {
          nextInput.focus();
        }
      }, 50); // small delay to allow react to render the appended row
    }
  };

  const onSubmit = async (data: BulkInwardForm) => {
    const validRows = data.rows.filter(r => Number(r.weight) > 0);
    
    if (validRows.length === 0) {
      alert("No valid reels with weight found to submit.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createBulkInwardReels(
        validRows,
        data.inwardDate,
        data.supplierName,
        data.manufacturerName,
        user?.name || 'System'
      );
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save bulk inward: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-6xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <ArrowDownToLine className="w-5 h-5 mr-2 text-green-500" />
              Bulk Reel Inward
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Rapid data entry: Press ENTER on Weight to automatically move to the next sequential Reel row.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="bulk-inward-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
          
          {/* Top Level Metadata */}
          <div className="p-6 bg-secondary/20 border-b border-border grid grid-cols-3 gap-6 shrink-0">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">Inward Date <span className="text-destructive">*</span></label>
              <input type="date" {...register('inwardDate', { required: true })} className={inputCls} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">Supplier Name <span className="text-xs font-normal opacity-70">(Optional)</span></label>
              <input {...register('supplierName')} className={inputCls} placeholder="e.g. ABC Paper Mills" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">Manufacturer Name <span className="text-xs font-normal opacity-70">(Optional)</span></label>
              <input {...register('manufacturerName')} className={inputCls} placeholder="e.g. ABC Paper Mills" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
            </div>
          </div>

          {/* Table Header: 1. Reel No, 2. Paper Type, 3. Size, 4. BF, 5. GSM, 6. Rate, 7. Weight */}
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-6 py-3 bg-secondary/50 border-b border-border text-xs font-semibold uppercase text-muted-foreground shrink-0">
            <div>Reel No</div>
            <div>Paper Type</div>
            <div>Size (in)</div>
            <div>BF</div>
            <div>GSM</div>
            <div>Rate (₹)</div>
            <div>Weight (Kg)</div>
            <div className="w-8"></div>
          </div>

          {/* Rows Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3" ref={containerRef}>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-start group">
                <input 
                  {...register(`rows.${idx}.reelNo` as const, { required: true })} 
                  defaultValue={field.reelNo}
                  className={inputCls + " font-mono font-bold text-primary uppercase bg-primary/5"} 
                  placeholder="e.g. 8261"
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
                
                <select 
                  {...register(`rows.${idx}.paperType` as const)} 
                  defaultValue={field.paperType}
                  className={inputCls}
                >
                  <option value="SK">SK</option>
                  <option value="VK">VK</option>
                  <option value="HWC">HWC</option>
                  <option value="DUPLEX">DUPLEX</option>
                  <option value="HDPE">HDPE (Mtr)</option>
                  <option value="OTHERS">OTHERS</option>
                </select>
                
                <input 
                  type="number" step="0.1" 
                  {...register(`rows.${idx}.size` as const)} 
                  defaultValue={field.size}
                  className={inputCls} 
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
                
                <input 
                  {...register(`rows.${idx}.bf` as const)} 
                  defaultValue={field.bf}
                  className={inputCls} 
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
                
                <input 
                  type="number" 
                  {...register(`rows.${idx}.gsm` as const)} 
                  defaultValue={field.gsm}
                  className={inputCls} 
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />

                <input 
                  type="number" step="0.01" 
                  {...register(`rows.${idx}.rate` as const)} 
                  defaultValue={field.rate}
                  className={inputCls} 
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />

                <input 
                  id={`weight-${idx}`}
                  type="number" step="1" 
                  {...register(`rows.${idx}.weight` as const)} 
                  defaultValue={field.weight}
                  className={inputCls + " font-bold border-primary/30"} 
                  placeholder="0.0" 
                  onKeyDown={(e) => handleWeightKeyDown(e, idx)}
                />

                <div className="w-8 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </form>

        {/* Footer / Live Summary */}
        <div className="p-6 border-t border-border flex items-center justify-between bg-card shrink-0 rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          
          <div className="flex gap-8 px-4 py-2 bg-secondary/30 rounded-lg border border-border/50">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Valid Reels</div>
              <div className="text-xl font-bold text-foreground">{validReelsCount}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Weight</div>
              <div className="text-xl font-bold text-primary">{Math.round(totalWeight)} <span className="text-sm font-normal text-muted-foreground">Kg</span></div>
            </div>
            <div className="pl-8 border-l border-border/50">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Value</div>
              <div className="text-xl font-bold text-green-600">₹{Math.round(totalValue)}</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button type="submit" form="bulk-inward-form" disabled={isSubmitting} className="px-8 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center shadow-lg shadow-green-600/20">
              {isSubmitting && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
              Save {validReelsCount > 0 ? validReelsCount : ''} Reels
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

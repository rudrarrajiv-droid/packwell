import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Truck, Loader2, AlertCircle, CheckCircle2, PackageCheck, 
  Calendar, Hash, IndianRupee, Sparkles, Building2
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { executePOQuickDispatch, type PurchaseOrder, getPurchaseOrderBalance } from '../../lib/supabase/purchaseOrderService';
import { 
  lookupVehicle, 
  saveVehicleMapping, 
  seedVehicleDirectoryFromHistory, 
  getLocalVehicleDirectory 
} from '../../lib/vehicleMemoryService';
import { cn } from '../../lib/utils';

interface QuickDispatchModalProps {
  po: PurchaseOrder;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuickDispatchModal({ po, onClose, onSuccess }: QuickDispatchModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const balanceQty = getPurchaseOrderBalance(po);
  const [quantity, setQuantity] = useState<string>(balanceQty > 0 ? String(balanceQty) : '0');
  const [dispatchDate, setDispatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [vehicleNo, setVehicleNo] = useState<string>('');
  const [transporterName, setTransporterName] = useState<string>('');
  const [freight, setFreight] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load and seed vehicle memory directory on mount
  const [knownVehicles, setKnownVehicles] = useState<Record<string, any>>({});

  useEffect(() => {
    setKnownVehicles(getLocalVehicleDirectory());
    seedVehicleDirectoryFromHistory().then(seeded => {
      setKnownVehicles(seeded);
    });
  }, []);

  const vehicleOptions = useMemo(() => {
    return Object.values(knownVehicles).map((v: any) => v.vehicleNo).filter(Boolean);
  }, [knownVehicles]);

  // Handle vehicle change with instant auto-fill
  const handleVehicleChange = (val: string) => {
    setVehicleNo(val);
    if (!val.trim()) {
      setAutoFilledNotice(null);
      return;
    }

    const match = lookupVehicle(val);
    if (match) {
      if (match.transporterName) {
        setTransporterName(match.transporterName);
      }
      if (match.freight !== undefined && match.freight !== null) {
        setFreight(String(match.freight));
      }
      setAutoFilledNotice(`Matched with past history: ${match.transporterName} (₹${match.freight})`);
    } else {
      setAutoFilledNotice(null);
    }
  };

  const numQty = Number(quantity);
  const isOverBalance = numQty > balanceQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid dispatch quantity greater than 0.');
      return;
    }

    if (!po.id) {
      setError('Purchase order ID is missing.');
      return;
    }

    setIsSubmitting(true);
    try {
      const numFreight = freight ? Number(freight) : 0;

      // 1. Save vehicle memory so it auto-fills next time
      if (vehicleNo.trim()) {
        saveVehicleMapping(vehicleNo.trim(), transporterName.trim(), numFreight);
      }

      // 2. Execute quick dispatch with transport & freight
      await executePOQuickDispatch({
        poId: po.id,
        quantity: numQty,
        dispatchDate: dispatchDate || new Date().toISOString().split('T')[0],
        invoiceNo: invoiceNo.trim() || undefined,
        vehicleNo: vehicleNo.trim().toUpperCase() || undefined,
        transporterName: transporterName.trim() || undefined,
        freight: numFreight,
        remarks: remarks.trim() || undefined,
        user: user?.name || 'System'
      });

      // 3. Invalidate relevant queries so UI reflects immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['finishGoods'] }),
        queryClient.invalidateQueries({ queryKey: ['finishGoodTransactions'] }),
        queryClient.invalidateQueries({ queryKey: ['jobcards'] })
      ]);

      onSuccess();
    } catch (err: any) {
      console.error('Error during Quick Dispatch:', err);
      setError(err?.message || 'Failed to execute quick dispatch.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card w-full max-w-xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-border bg-emerald-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Quick Dispatch Order</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                PO #{po.poNo} • {po.customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form id="quick-dispatch-form" onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Product & Balance Summary Card */}
          <div className="p-4 bg-muted/40 rounded-xl border border-border/60 space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">{po.productName}</p>
                {po.artworkNo && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">Artwork: {po.artworkNo}</p>
                )}
                {po.size && (
                  <p className="text-xs text-muted-foreground mt-0.5">Size: {po.size}</p>
                )}
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary">
                {po.status || 'OPEN'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-center">
              <div className="p-2 bg-background rounded-lg border border-border/50">
                <span className="text-[10px] text-muted-foreground block font-bold uppercase">Ordered</span>
                <span className="text-sm font-black text-foreground">{po.orderQty?.toLocaleString('en-IN') || 0}</span>
              </div>
              <div className="p-2 bg-background rounded-lg border border-border/50">
                <span className="text-[10px] text-muted-foreground block font-bold uppercase">Dispatched</span>
                <span className="text-sm font-black text-emerald-600">{(po.outQty || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2 bg-background rounded-lg border border-border/50">
                <span className="text-[10px] text-muted-foreground block font-bold uppercase">Remaining</span>
                <span className="text-sm font-black text-amber-600">{balanceQty.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Quantity & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                Dispatch Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="Enter dispatch qty..."
                className={cn(
                  "w-full px-3 py-2 text-sm font-bold rounded-lg border bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-emerald-500/20",
                  isOverBalance ? "border-amber-500 text-amber-700 bg-amber-500/5" : "border-input"
                )}
              />
              {isOverBalance && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1">
                  ⚠️ Note: Qty exceeds remaining balance ({balanceQty}).
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Dispatch Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={dispatchDate}
                onChange={e => setDispatchDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Invoice No & Vehicle No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                Invoice No
              </label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-2026-112"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                  Vehicle Number
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  (Auto-remembers transport & rate)
                </span>
              </label>
              <input
                type="text"
                list="known-vehicles-list"
                value={vehicleNo}
                onChange={e => handleVehicleChange(e.target.value)}
                placeholder="e.g. RJ-14-GA-8921"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20 font-medium uppercase"
              />
              <datalist id="known-vehicles-list">
                {vehicleOptions.map((v, i) => (
                  <option key={i} value={v} />
                ))}
              </datalist>

              {autoFilledNotice && (
                <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1 animate-fade-in">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {autoFilledNotice}
                </p>
              )}
            </div>
          </div>

          {/* Transport Name & Freight (₹) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 bg-blue-500/[0.04] rounded-xl border border-blue-500/20">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Transport Name
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={e => setTransporterName(e.target.value)}
                placeholder="e.g. Bhaichara Transport, Sharma..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                Freight / Rate (₹)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={freight}
                onChange={e => setFreight(e.target.value)}
                placeholder="e.g. 3500"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20 font-bold text-blue-600"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">
              Remarks / Dispatch Notes
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Any dispatch note, consignee details or remarks..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-all shadow-xs focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Zero Double Entry Info Banner */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">
              <b>Auto-Synced:</b> This dispatch will automatically update Finished Goods (FG) stock, deduct inventory, and record freight logistics. Zero double entry needed!
            </p>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            form="quick-dispatch-form"
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recording Dispatch...</span>
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                <span>Confirm & Record Dispatch</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

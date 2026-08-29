import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Truck, Calendar, FileText, MapPin, Hash, DollarSign } from 'lucide-react';
import { addFreightRecord, updateFreightRecord, deleteFreightRecord, type FreightRecordPayload } from '../../lib/supabase/finishGoodService';
import { useAuth } from '../../contexts/AuthContext';

interface FreightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null; // If provided, we are editing; otherwise adding new
  transporterOptions?: string[];
  sizeOptions?: string[];
  customerOptions?: string[];
}

export default function FreightModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  transporterOptions = [],
  sizeOptions = [],
  customerOptions = []
}: FreightModalProps) {
  const { user } = useAuth();
  const isEditing = !!initialData;

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [place, setPlace] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [vehicleSize, setVehicleSize] = useState('');
  const [freight, setFreight] = useState<number | ''>(0);
  const [holding, setHolding] = useState<number | ''>(0);
  const [point, setPoint] = useState<string | number>('0');
  const [others, setOthers] = useState<string | number>('0');
  const [receivingStatus, setReceivingStatus] = useState<'PENDING' | 'RECEIVED'>('PENDING');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialData) {
      const d = initialData.date ? (typeof initialData.date === 'string' ? initialData.date.substring(0, 10) : new Date(initialData.date).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
      setDate(d);
      setInvoiceNo(initialData.invoiceNo || '');
      setCustomerName(initialData.customerName || '');
      setTransporterName(initialData.transporterName || '');
      setPlace(initialData.place || '');
      setVehicleNo(initialData.vehicleNo || '');
      setVehicleSize(initialData.vehicleSize || '');
      setFreight(initialData.freight ?? 0);
      setHolding(initialData.holding ?? 0);
      setPoint(initialData.point ?? '0');
      setOthers(initialData.others ?? '0');
      setReceivingStatus(initialData.receivingStatus || 'PENDING');
    } else {
      setDate(new Date().toISOString().split('T')[0]);
      setInvoiceNo('');
      setCustomerName('');
      setTransporterName('');
      setPlace('');
      setVehicleNo('');
      setVehicleSize('');
      setFreight(0);
      setHolding(0);
      setPoint('0');
      setOthers('0');
      setReceivingStatus('PENDING');
    }
    setErrorMsg('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const totalCalculated = (Number(freight) || 0) + (Number(holding) || 0) + (Number(point) || 0) + (Number(others) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNo.trim()) {
      setErrorMsg('Invoice No is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const payload: FreightRecordPayload = {
        invoiceNo: initialData ? initialData.invoiceNo : invoiceNo.trim(),
        newInvoiceNo: invoiceNo.trim(),
        date: date,
        customerName: customerName.trim(),
        transporterName: transporterName.trim(),
        place: place.trim(),
        vehicleNo: vehicleNo.trim().toUpperCase(),
        vehicleSize: vehicleSize.trim(),
        freight: Number(freight) || 0,
        holding: Number(holding) || 0,
        point: point || '0',
        others: others || '0',
        receivingStatus: receivingStatus
      };

      if (isEditing) {
        await updateFreightRecord(payload, user?.name || 'System');
      } else {
        await addFreightRecord(payload, user?.name || 'System');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving freight entry:', err);
      setErrorMsg(err?.message || 'Failed to save freight record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.invoiceNo) return;
    if (!window.confirm(`Are you sure you want to delete Freight record for Invoice ${initialData.invoiceNo}?`)) return;

    try {
      setIsSubmitting(true);
      await deleteFreightRecord(initialData.invoiceNo, user?.name || 'System');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error deleting freight record:', err);
      setErrorMsg(err?.message || 'Failed to delete freight record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full text-sm rounded-lg border border-input px-3.5 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";
  const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isEditing ? `Edit Freight Bill: ${initialData.invoiceNo}` : 'Add New Vehicle / Freight Bill'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isEditing ? 'Update freight amount, holding, point, vehicle or party details' : 'Enter new dispatch vehicle and freight logistics details'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Top Row: Date & Invoice No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Dispatch Date *
                </span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  Invoice / Bill No *
                </span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 2026-27/450"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Second Row: Customer & Transporter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Customer / Party Name</label>
              <input
                type="text"
                list="customer-list"
                placeholder="e.g. RBI, MBI, RBC"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className={inputClass}
              />
              <datalist id="customer-list">
                {customerOptions.map((c, i) => (
                  <option key={i} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className={labelClass}>Transporter Name</label>
              <input
                type="text"
                list="transporter-list"
                placeholder="e.g. BHAICHARA TRANSPORT"
                value={transporterName}
                onChange={e => setTransporterName(e.target.value)}
                className={inputClass}
              />
              <datalist id="transporter-list">
                {transporterOptions.map((t, i) => (
                  <option key={i} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Third Row: Place, Vehicle No, Vehicle Size */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  Destination / Place
                </span>
              </label>
              <input
                type="text"
                placeholder="e.g. BHALGARH, KUNDLI"
                value={place}
                onChange={e => setPlace(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Vehicle Number</label>
              <input
                type="text"
                placeholder="e.g. HR69D7559"
                value={vehicleNo}
                onChange={e => setVehicleNo(e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Vehicle Size / Type</label>
              <input
                type="text"
                list="size-list"
                placeholder="e.g. 14 FT, 17 FT"
                value={vehicleSize}
                onChange={e => setVehicleSize(e.target.value)}
                className={inputClass}
              />
              <datalist id="size-list">
                {sizeOptions.map((s, i) => (
                  <option key={i} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Freight Charges Breakdown Card */}
          <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3">
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Freight Charges Breakdown
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Freight (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={freight}
                  onChange={e => setFreight(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Holding (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={holding}
                  onChange={e => setHolding(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Point / Halting (₹)</label>
                <input
                  type="text"
                  value={point}
                  onChange={e => setPoint(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Others (₹)</label>
                <input
                  type="text"
                  value={others}
                  onChange={e => setOthers(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Total Display */}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total Freight Payable:</span>
              <span className="text-lg font-black text-primary">₹{totalCalculated.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label className={labelClass}>Payment / Receiving Status</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReceivingStatus('PENDING')}
                className={`py-2.5 px-4 text-xs font-bold rounded-xl border transition-all ${
                  receivingStatus === 'PENDING'
                    ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300 shadow-sm'
                    : 'bg-background border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                ⏳ PENDING
              </button>
              <button
                type="button"
                onClick={() => setReceivingStatus('RECEIVED')}
                className={`py-2.5 px-4 text-xs font-bold rounded-xl border transition-all ${
                  receivingStatus === 'RECEIVED'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'bg-background border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                ✅ RECEIVED (OK)
              </button>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
          <div>
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
              >
                Delete Bill Record
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-input hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg shadow hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Update Bill' : 'Save New Bill'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

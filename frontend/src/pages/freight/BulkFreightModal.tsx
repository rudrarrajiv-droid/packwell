import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Truck, X, CircleDashed, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { addFreightRecord, type FreightRecordPayload } from '../../lib/supabase/finishGoodService';
import SmartInput from '../../components/SmartInput';
import { createCustomer } from '../../lib/supabase/customerService';

interface BulkFreightRow {
  date: string;
  invoiceNo: string;
  customerName: string;
  transporterName: string;
  place: string;
  vehicleNo: string;
  freight: number | '';
}

interface BulkFreightForm {
  rows: BulkFreightRow[];
}

export default function BulkFreightModal({ 
  onClose, 
  onSuccess,
  customerOptions = [],
  transporterOptions = [],
  placeOptions = []
}: { 
  onClose: () => void, 
  onSuccess: () => void,
  customerOptions: string[],
  transporterOptions: string[],
  placeOptions: string[]
}) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { register, control, handleSubmit, watch, getValues, setValue } = useForm<BulkFreightForm>({
    defaultValues: {
      rows: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rows'
  });

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && fields.length === 0) {
      initialized.current = true;
      append({ 
        date: new Date().toISOString().split('T')[0],
        invoiceNo: '',
        customerName: '',
        transporterName: '',
        place: '',
        vehicleNo: '',
        freight: ''
      });
    }
  }, [append, fields.length]);

  const rows = watch('rows');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentVal = getValues(`rows.${index}.freight`);
      if (currentVal !== '' && currentVal !== null) {
        const prevRow = getValues(`rows.${index}`);
        append({
          date: prevRow.date, // keep same date
          invoiceNo: '',
          customerName: '',
          transporterName: prevRow.transporterName, // often same transporter
          place: '',
          vehicleNo: '',
          freight: ''
        });
        
        // Focus the first input (invoiceNo) of the newly created row
        setTimeout(() => {
          if (containerRef.current) {
            const inputs = containerRef.current.querySelectorAll<HTMLInputElement>('input[name$=".invoiceNo"]');
            const nextInput = inputs[index + 1];
            if (nextInput) {
              nextInput.focus();
            }
          }
        }, 50);
      }
    }
  };

  const onSubmit = async (data: BulkFreightForm) => {
    const validRows = data.rows.filter(r => r.invoiceNo && r.freight !== '');
    
    if (validRows.length === 0) {
      alert("Please enter at least one valid row with Invoice No and Freight.");
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUser = user?.name || 'System';
      
      // Auto-create customers
      for (const row of validRows) {
        const trimmedCust = row.customerName.trim();
        if (trimmedCust && !customerOptions.some(c => c.trim().toLowerCase() === trimmedCust.toLowerCase())) {
          try {
            await createCustomer(trimmedCust, currentUser);
          } catch (e) {}
        }
      }

      // Process all rows
      for (const row of validRows) {
        const payload: FreightRecordPayload = {
          invoiceNo: row.invoiceNo.trim(),
          newInvoiceNo: row.invoiceNo.trim(),
          date: row.date,
          customerName: row.customerName.trim(),
          transporterName: row.transporterName.trim().toUpperCase(),
          place: row.place.trim().toUpperCase(),
          vehicleNo: row.vehicleNo.trim().toUpperCase(),
          vehicleSize: '',
          freight: Number(row.freight) || 0,
          holding: 0,
          point: '0',
          others: '0',
          receivingStatus: 'PENDING'
        };
        await addFreightRecord(payload, currentUser);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Bulk Freight failed", error);
      alert(error.message || "Failed to submit Bulk Freight entries.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-xs rounded-md border border-input px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary shadow-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-primary/10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <Truck className="w-6 h-6 mr-3 text-primary" />
              Bulk Freight Entry
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Smartly enter multiple freight bills row-by-row. Press Enter on the Freight column to add a new row automatically.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          
          {/* Rows */}
          <div className="flex-1 overflow-auto p-5 bg-muted/20" ref={containerRef}>
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-12 gap-3 mb-3 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Invoice No</div>
                <div className="col-span-2">Customer</div>
                <div className="col-span-2">Transporter Name</div>
                <div className="col-span-1">Place</div>
                <div className="col-span-1">Vehicle No</div>
                <div className="col-span-1 text-right">Freight (₹)</div>
                <div className="col-span-1 text-center">Action</div>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-3 mb-2 items-start bg-card p-1.5 rounded-lg border border-border shadow-sm group hover:border-primary/40 transition-colors">
                  
                  {/* Date */}
                  <div className="col-span-2">
                    <input type="date" required {...register(`rows.${index}.date` as const)} className={inputCls} />
                  </div>

                  {/* Invoice */}
                  <div className="col-span-2">
                    <input type="text" required {...register(`rows.${index}.invoiceNo` as const)} className={inputCls} placeholder="INV..." />
                  </div>

                  {/* Customer */}
                  <div className="col-span-2">
                    <SmartInput
                      value={rows[index]?.customerName || ''}
                      onChange={(val) => setValue(`rows.${index}.customerName`, val)}
                      options={customerOptions}
                      placeholder="Customer..."
                      className={inputCls}
                    />
                  </div>

                  {/* Transporter */}
                  <div className="col-span-2">
                    <SmartInput
                      value={rows[index]?.transporterName || ''}
                      onChange={(val) => setValue(`rows.${index}.transporterName`, val)}
                      options={transporterOptions}
                      placeholder="Transporter..."
                      className={inputCls}
                    />
                  </div>

                  {/* Place */}
                  <div className="col-span-1">
                    <SmartInput
                      value={rows[index]?.place || ''}
                      onChange={(val) => setValue(`rows.${index}.place`, val)}
                      options={placeOptions}
                      placeholder="Place..."
                      className={inputCls}
                    />
                  </div>

                  {/* Vehicle No */}
                  <div className="col-span-1">
                    <input type="text" {...register(`rows.${index}.vehicleNo` as const)} className={inputCls + " uppercase"} placeholder="HR..." onChange={e => setValue(`rows.${index}.vehicleNo`, e.target.value.toUpperCase())} />
                  </div>

                  {/* Freight */}
                  <div className="col-span-1 relative">
                    <input
                      type="number"
                      step="any"
                      {...register(`rows.${index}.freight` as const)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className={inputCls + " text-right font-bold text-primary"}
                      placeholder="0"
                    />
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const prevRow = rows[rows.length - 1];
                append({ 
                  date: prevRow?.date || new Date().toISOString().split('T')[0],
                  invoiceNo: '',
                  customerName: '',
                  transporterName: prevRow?.transporterName || '',
                  place: '',
                  vehicleNo: '',
                  freight: ''
                });
              }}
              className="mt-4 flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Another Row
            </button>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border bg-card shrink-0 flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Valid Entries: <span className="font-bold text-foreground">{rows.filter(r => r.invoiceNo && r.freight !== '').length}</span>
            </div>
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={onClose} 
                className="px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold text-sm flex items-center shadow-lg hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {isSubmitting ? <CircleDashed className="w-5 h-5 mr-2 animate-spin" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                {isSubmitting ? 'Saving...' : 'Submit Bulk Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

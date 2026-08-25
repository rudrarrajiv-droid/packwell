import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ArrowUpFromLine, X, CircleDashed, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { executeFinishGoodOutwardTransaction, getFinishGoods, getFinishGoodTransactions, type FinishGoodOutwardPayload, type LogisticsPayload } from '../../lib/supabase/finishGoodService';
import { getPurchaseOrders, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';

interface FGRow {
  productId: string;
  customerName: string;
  productName: string;
  category: 'DISPATCH' | 'NON-MOVING';
  quantity: number | '';
  poId?: string;
}

interface BulkOutwardForm extends LogisticsPayload {
  rows: FGRow[];
}

export default function BulkOutModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Fetch available finished goods (so we only show products that have stock)
  const [finishGoods, setFinishGoods] = useState<any[]>([]);
  const [historyDocs, setHistoryDocs] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  
  useEffect(() => {
    void Promise.all([getFinishGoods(), getFinishGoodTransactions(), getPurchaseOrders()]).then(([fgData, txData, poData]) => {
      setFinishGoods(fgData);
      setHistoryDocs(txData);
      setPurchaseOrders(poData.filter(po => po.status === 'OPEN' || po.status === 'PARTIAL'));
    });
  }, []);

  const uniquePlaces = Array.from(new Set(historyDocs.map(d => d.place).filter(Boolean)));
  const uniqueTransporters = Array.from(new Set(historyDocs.map(d => d.transporterName).filter(Boolean)));
  const uniqueVehicleNos = Array.from(new Set(historyDocs.map(d => d.vehicleNo).filter(Boolean)));
  const uniqueVehicleSizes = Array.from(new Set(historyDocs.map(d => d.vehicleSize).filter(Boolean)));

  const { register, control, handleSubmit, watch, getValues, setValue } = useForm<BulkOutwardForm>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      invoiceNo: '',
      place: '',
      transporterName: '',
      vehicleNo: '',
      vehicleSize: '',
      freight: 0,
      holding: 0,
      point: '',
      others: '',
      rows: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rows'
  });

  // Initialize first row
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && fields.length === 0) {
      initialized.current = true;
      append({ 
        productId: '',
        customerName: '',
        productName: '',
        category: 'DISPATCH',
        quantity: '',
        poId: ''
      });
    }
  }, [append]);

  const rows = watch('rows');
  const vehicleNoValue = watch('vehicleNo');

  useEffect(() => {
    if (vehicleNoValue && historyDocs.length > 0) {
      // Find the most recent record with this vehicleNo that has a freight > 0
      const lastRecord = [...historyDocs].reverse().find(d => 
        d.vehicleNo === vehicleNoValue && Number(d.freight) > 0
      );
      if (lastRecord) {
        setValue('freight', Number(lastRecord.freight));
      }
    }
  }, [vehicleNoValue, historyDocs, setValue]);

  const handleProductChange = (index: number, productId: string) => {
    const fg = finishGoods.find(p => p.productId === productId);
    if (fg) {
      setValue(`rows.${index}.customerName`, fg.customerName || '');
      setValue(`rows.${index}.productName`, fg.productName || '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentVal = getValues(`rows.${index}.quantity`);
      if (currentVal && String(currentVal) !== '') {
        const prevRow = getValues(`rows.${index}`);
        append({
          productId: '',
          customerName: '',
          productName: '',
          category: prevRow.category,
          quantity: '',
          poId: ''
        });
        setTimeout(() => {
          if (containerRef.current) {
            const inputs = containerRef.current.querySelectorAll<HTMLInputElement>('input[name$=".quantity"]');
            const nextInput = inputs[index + 1];
            if (nextInput) {
              nextInput.focus();
            }
          }
        }, 50);
      }
    }
  };

  const onSubmit = async (data: BulkOutwardForm) => {
    const incompleteRows = data.rows.filter(r => (!r.productId && r.quantity) || (r.productId && (!r.quantity || Number(r.quantity) <= 0)));
    if (incompleteRows.length > 0) {
      alert("Some rows are incomplete. Please make sure you selected a product from the dropdown and entered a valid quantity for all rows.");
      return;
    }

    const validRows = data.rows.filter(r => r.quantity && Number(r.quantity) > 0 && r.productId);
    
    if (validRows.length === 0) {
      alert("Please enter at least one valid row with a product and quantity.");
      return;
    }
    
    if (!data.invoiceNo) {
      alert("Invoice No. is required.");
      return;
    }

    // Check for duplicates
    const productCounts = new Map<string, number>();
    let hasDuplicates = false;
    
    validRows.forEach(r => {
      const key = `${r.productId}_${r.category}_${r.poId || 'none'}`;
      if (productCounts.has(key)) {
        hasDuplicates = true;
      }
      productCounts.set(key, (productCounts.get(key) || 0) + Number(r.quantity));
    });

    if (hasDuplicates) {
      const confirmMerge = window.confirm(
        "Warning: You have duplicate product entries in this batch.\n\n" +
        "Click OK to automatically merge their quantities (e.g., 50 + 10 = 60).\n" +
        "Click Cancel to abort and review your entries."
      );
      if (!confirmMerge) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const mergedPayloads: FinishGoodOutwardPayload[] = [];
      const processed = new Set<string>();
      
      validRows.forEach(r => {
        const key = `${r.productId}_${r.category}_${r.poId || 'none'}`;
        if (!processed.has(key)) {
          mergedPayloads.push({
            productId: r.productId,
            quantity: productCounts.get(key)!,
            category: r.category,
            poId: r.poId || undefined
          });
          processed.add(key);
        }
      });

      const logistics: LogisticsPayload = {
        date: data.date,
        invoiceNo: data.invoiceNo,
        place: data.place,
        transporterName: data.transporterName,
        vehicleNo: data.vehicleNo,
        vehicleSize: data.vehicleSize,
        freight: Number(data.freight) || 0,
        holding: Number(data.holding) || 0,
        point: data.point,
        others: data.others
      };

      await executeFinishGoodOutwardTransaction(logistics, mergedPayloads, user?.name || 'System');
      onSuccess();
    } catch (error: any) {
      console.error("Bulk OUT failed", error);
      alert(error.message || "Failed to submit Bulk OUT. See console for details.");
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary shadow-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-destructive/10 shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center">
            <ArrowUpFromLine className="w-6 h-6 mr-3 text-destructive" />
            Finish Goods Bulk OUT (Dispatch)
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          
          {/* Logistics Section */}
          <div className="p-5 border-b border-border bg-card shrink-0">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Logistics & Freight Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Date</label>
                <input type="date" required {...register('date')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Invoice No. <span className="text-red-500">*</span></label>
                <input type="text" required {...register('invoiceNo')} className={inputCls} placeholder="INV-001" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Place</label>
                <input type="text" list="place-list" {...register('place')} className={inputCls} placeholder="City/Location" />
                <datalist id="place-list">
                  {uniquePlaces.map((v: any) => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Transporter Name</label>
                <input type="text" list="transporter-list" {...register('transporterName')} className={inputCls} placeholder="Transporter..." />
                <datalist id="transporter-list">
                  {uniqueTransporters.map((v: any) => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Vehicle No.</label>
                <input type="text" list="vehicle-list" {...register('vehicleNo')} className={inputCls} placeholder="UP14 XX 0000" />
                <datalist id="vehicle-list">
                  {uniqueVehicleNos.map((v: any) => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Vehicle Size</label>
                <input type="text" list="vehiclesize-list" {...register('vehicleSize')} className={inputCls} placeholder="e.g. 17ft" />
                <datalist id="vehiclesize-list">
                  {uniqueVehicleSizes.map((v: any) => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Freight (₹)</label>
                <input type="number" step="0.01" {...register('freight')} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Holding Charges</label>
                <input type="number" step="0.01" {...register('holding')} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Point</label>
                <input type="text" {...register('point')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Others</label>
                <input type="text" {...register('others')} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-auto p-5 bg-muted/20" ref={containerRef}>
            <div className="min-w-[800px]">
              <div className="grid grid-cols-12 gap-3 mb-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">Product Name</div>
                <div className="col-span-2">Customer</div>
                <div className="col-span-2">Against PO</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-1 text-right">Qty OUT</div>
                <div className="col-span-1 text-center">Action</div>
              </div>

              {fields.map((field, index) => {
                const currentProductId = rows[index]?.productId;
                const isDuplicate = currentProductId && rows.findIndex((r, i) => i !== index && r.productId === currentProductId) !== -1;

                return (
                <div key={field.id} className="grid grid-cols-12 gap-3 mb-3 items-start bg-card p-2 rounded-lg border border-border shadow-sm">
                  
                  {/* Product */}
                  <div className="col-span-4">
                    <ProductSearchSelect 
                      index={index} 
                      finishGoods={finishGoods} 
                      register={register} 
                      setValue={setValue} 
                      handleProductChange={handleProductChange} 
                      inputCls={inputCls} 
                    />
                  </div>

                  {/* Customer */}
                  <div className="col-span-2">
                    <input
                      type="text"
                      {...register(`rows.${index}.customerName` as const)}
                      className={inputCls + " bg-muted/30 text-xs"}
                      placeholder="Auto-filled"
                      readOnly
                    />
                  </div>

                  {/* Against PO */}
                  <div className="col-span-2">
                    {(() => {
                      const rowFg = finishGoods.find(fg => fg.productId === currentProductId);
                      if (!currentProductId || !rowFg) {
                        return <select disabled className={inputCls + " bg-muted/30 text-xs"}><option>Select Product First</option></select>;
                      }
                      
                      const availablePOs = purchaseOrders
                        .filter(po => po.productId === currentProductId && po.customerName === rowFg.customerName)
                        .sort((a, b) => new Date(a.poDate).getTime() - new Date(b.poDate).getTime());
                        
                      if (availablePOs.length === 0) {
                        return (
                          <div className="relative">
                            <select {...register(`rows.${index}.poId` as const)} className={inputCls + " text-xs text-muted-foreground bg-muted/10 border-orange-200"}>
                              <option value="">No Pending POs</option>
                            </select>
                            <input type="hidden" {...register(`rows.${index}.poId` as const)} value="" />
                          </div>
                        );
                      }
                      
                      return (
                        <select {...register(`rows.${index}.poId` as const)} className={inputCls + " text-xs font-semibold text-blue-700"}>
                          <option value="">-- Skip PO --</option>
                          {availablePOs.map(po => {
                            const pending = po.orderQty - po.outQty;
                            return (
                              <option key={po.id} value={po.id!}>
                                {po.poNo} ({pending} pending)
                              </option>
                            );
                          })}
                        </select>
                      );
                    })()}
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <select
                      {...register(`rows.${index}.category` as const)}
                      className={inputCls + (rows[index]?.category === 'NON-MOVING' ? " text-orange-600 font-semibold text-xs" : " text-blue-600 font-semibold text-xs")}
                    >
                      <option value="DISPATCH">DISPATCH (Sale)</option>
                      <option value="NON-MOVING">NON-MOVING (Reject)</option>
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1 relative">
                    <input
                      type="number"
                      {...register(`rows.${index}.quantity` as const)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className={inputCls + " text-right font-bold text-red-600"}
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
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Warnings (Duplicate or Exceeding PO) */}
                  {(() => {
                    let warnings = [];
                    if (isDuplicate) warnings.push("This product is selected multiple times.");
                    
                    const rowPoId = rows[index]?.poId;
                    const rowQty = Number(rows[index]?.quantity || 0);
                    if (rowPoId && rowQty > 0) {
                      const selectedPo = purchaseOrders.find(po => po.id === rowPoId);
                      if (selectedPo) {
                        const pending = selectedPo.orderQty - selectedPo.outQty;
                        if (rowQty > pending) {
                          warnings.push(`Dispatch quantity (${rowQty}) exceeds pending PO quantity (${pending}).`);
                        }
                      }
                    }
                    
                    if (warnings.length > 0) {
                      return (
                        <div className="col-span-12 mt-1 text-xs text-orange-700 flex flex-col gap-1 font-semibold bg-orange-50 p-1.5 rounded border border-orange-200">
                          {warnings.map((w, i) => (
                            <div key={i} className="flex items-center"><AlertCircle className="w-4 h-4 mr-1.5 shrink-0" /> {w}</div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                </div>
              )})}
            </div>

            <button
              type="button"
              onClick={() => append({ 
                productId: '', customerName: '', productName: '', category: 'DISPATCH', quantity: '' 
              })}
              className="mt-4 flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Another Row
            </button>
          </div>

          {/* Footer Actions */}
          <div className="p-5 border-t border-border bg-card shrink-0 flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">
              Total Entries: {rows.filter(r => r.quantity && Number(r.quantity) > 0 && r.productId).length} / {rows.length}
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
                className="bg-destructive text-destructive-foreground px-6 py-2.5 rounded-lg font-bold text-sm flex items-center shadow-lg hover:bg-destructive/90 transition-all disabled:opacity-50"
              >
                {isSubmitting ? <CircleDashed className="w-5 h-5 mr-2 animate-spin" /> : <ArrowUpFromLine className="w-5 h-5 mr-2" />}
                {isSubmitting ? 'Processing...' : 'Submit Dispatch (OUT)'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductSearchSelect({ index, finishGoods, register, setValue, handleProductChange, inputCls }: any) {
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search Product / Artwork..."
        className={inputCls}
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value);
          setIsOpen(true);
          setValue(`rows.${index}.productId`, '');
          handleProductChange(index, '');
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />
      {/* Hidden input for react-hook-form to register productId */}
      <input type="hidden" {...register(`rows.${index}.productId` as const)} />
      
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-[150%] bg-white border border-gray-300 rounded-md shadow-xl max-h-60 overflow-y-auto">
          {finishGoods.filter((p: any) => {
             const lower = searchText.toLowerCase();
             return !searchText || p.productName?.toLowerCase().includes(lower);
          }).map((p: any) => (
            <div 
              key={p.id}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm text-black border-b border-gray-100 last:border-0"
              onMouseDown={() => {
                setValue(`rows.${index}.productId`, p.productId);
                setSearchText(`${p.productName}`);
                handleProductChange(index, p.productId);
                setIsOpen(false);
              }}
            >
              <div className="font-bold">{p.productName}</div>
              <div className="text-xs text-gray-600">Stock: {p.closingBalance || 0} Reg | {p.nonMovingBalance || 0} Non-Mov</div>
            </div>
          ))}
          {finishGoods.filter((p: any) => {
             const lower = searchText.toLowerCase();
             return !searchText || p.productName?.toLowerCase().includes(lower);
          }).length === 0 && (
             <div className="px-3 py-2 text-sm text-gray-500 italic text-center">No matching products found.</div>
          )}
        </div>
      )}
    </div>
  );
}

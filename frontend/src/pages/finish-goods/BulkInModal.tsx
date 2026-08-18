import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ArrowDownToLine, X, CircleDashed, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getJobCards } from '../../lib/supabase/jobCardService';
import { getProducts } from '../../lib/supabase/productService';
import { executeFinishGoodInwardTransaction, getFinishGoods, type FinishGoodInwardPayload } from '../../lib/supabase/finishGoodService';

interface FGRow {
  productId: string; // Will store the selected product's ID
  customerName: string;
  productName: string;
  category: 'REGULAR' | 'REJECTED';
  quantity: number | '';
  rate: number | '';
  jobCardAllocations?: { jobCardId: string; quantity: number; expected: number }[];
}

interface BulkInwardForm {
  inwardDate: string;
  rows: FGRow[];
}

function JobCardSelector({ 
  productId, 
  rowQuantity, 
  allocations = [], 
  onChange 
}: { 
  productId: string, 
  rowQuantity: number, 
  allocations?: { jobCardId: string; quantity: number; expected: number }[],
  onChange: (allocs: { jobCardId: string; quantity: number; expected: number }[]) => void
}) {
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    getJobCards({ statuses: ['IN_PROCESS'] })
      .then((data: any[]) => {
        const openCards = data.filter(jc => 
          jc.productId === productId && 
          jc.status === 'IN_PROCESS' &&
          !jc.isArchived
        );
        // Sort by date oldest first
        openCards.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setJobCards(openCards);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  // Auto allocate logic when rowQuantity changes
  useEffect(() => {
    if (jobCards.length === 0 || rowQuantity <= 0) return;
    
    let remaining = rowQuantity;
    const newAllocs: { jobCardId: string; quantity: number; expected: number }[] = [];

    for (const jc of jobCards) {
      if (remaining <= 0) break;
      const req = (jc.quantity || 0) - (jc.producedQuantity || 0);
      if (req <= 0) continue;
      
      const allocQty = Math.min(req, remaining);
      newAllocs.push({ jobCardId: jc.id, quantity: allocQty, expected: req });
      remaining -= allocQty;
    }
    
    const currentStr = JSON.stringify(allocations);
    const newStr = JSON.stringify(newAllocs);
    if (currentStr !== newStr) {
      onChange(newAllocs);
    }
  }, [rowQuantity, jobCards, allocations, onChange]);

  if (!productId || loading || jobCards.length === 0) return null;

  return (
    <div className="col-span-12 mt-1 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
      <div className="text-xs font-semibold text-blue-800 mb-2 flex items-center">
        <CheckCircle2 className="w-4 h-4 mr-1" /> 
        Auto-Allocated to Open Job Cards:
      </div>
      <div className="grid grid-cols-1 gap-2">
        {jobCards.map(jc => {
          const req = (jc.quantity || 0) - (jc.producedQuantity || 0);
          if (req <= 0) return null;
          const alloc = allocations.find(a => a.jobCardId === jc.id);
          const isAllocated = !!alloc;

          return (
            <div key={jc.id} className={`flex items-center justify-between text-xs p-2 rounded border ${isAllocated ? 'bg-blue-100 border-blue-200' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-4">
                <span className="font-mono font-medium">{jc.jobCardNumber || jc.id.slice(0,6)}</span>
                <span className="text-gray-600">Req: {req} pcs</span>
              </div>
              {isAllocated && (
                <div className="font-bold text-blue-700">
                  Closing: {alloc.quantity} / {req} pcs
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BulkInModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Fetch Products for dropdowns
  const [products, setProducts] = useState<any[]>([]);
  const [finishGoods, setFinishGoods] = useState<any[]>([]);
  
  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
    });
    getFinishGoods().then(data => {
      setFinishGoods(data);
    });
  }, []);

  const { register, control, handleSubmit, watch, getValues, setValue } = useForm<BulkInwardForm>({
    defaultValues: {
      inwardDate: new Date().toISOString().split('T')[0],
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
        category: 'REGULAR',
        quantity: '',
        rate: ''
      });
    }
  }, [append]);

  const rows = watch('rows');

  // Handle product selection to auto-fill customer and rate (if rate exists on product, wait rate is not on product master usually, but we can leave it 0)
  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setValue(`rows.${index}.customerName`, product.customerName || '');
      setValue(`rows.${index}.productName`, product.itemName || product.artworkNo || '');
      
      const fg = finishGoods.find(fg => fg.productId === productId);
      if (fg && fg.rate) {
        setValue(`rows.${index}.rate`, fg.rate);
      } else {
        setValue(`rows.${index}.rate`, '');
      }
    }
  };

  // Keyboard Navigation & Auto-Row Generation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      
      const currentVal = getValues(`rows.${index}.quantity`);
      // Only append if quantity is entered
      if (currentVal && String(currentVal) !== '') {
        const prevRow = rows[index];
        append({
          productId: '',
          productName: '',
          customerName: '',
          category: prevRow.category,
          quantity: '',
          rate: prevRow.rate
        });

        // Focus next quantity input
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

  const onSubmit = async (data: BulkInwardForm) => {
    // Filter out rows without quantity or product
    const validRows = data.rows.filter(r => r.quantity && Number(r.quantity) > 0 && r.productId);
    
    if (validRows.length === 0) {
      alert("Please enter at least one valid row with a product and quantity.");
      return;
    }

    // Check for duplicates
    const productCounts = new Map<string, { qty: number, rate: number }>();
    let hasDuplicates = false;
    
    validRows.forEach(r => {
      const key = `${r.productId}_${r.category}`;
      if (productCounts.has(key)) {
        hasDuplicates = true;
      }
      const existing = productCounts.get(key) || { qty: 0, rate: Number(r.rate) || 0 };
      productCounts.set(key, { qty: existing.qty + Number(r.quantity), rate: Number(r.rate) || existing.rate });
    });

    if (hasDuplicates) {
      const confirmMerge = window.confirm(
        "Warning: You have duplicate product entries in this batch.\n\n" +
        "Click OK to automatically merge their quantities.\n" +
        "Click Cancel to abort and review your entries."
      );
      if (!confirmMerge) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const mergedPayloads: FinishGoodInwardPayload[] = [];
      const processed = new Set<string>();

      validRows.forEach(r => {
        const key = `${r.productId}_${r.category}`;
        if (!processed.has(key)) {
          const aggregated = productCounts.get(key)!;
          mergedPayloads.push({
            productId: r.productId,
            productName: r.productName,
            customerId: products.find(p => p.id === r.productId)?.customerId || '',
            customerName: r.customerName,
            quantity: aggregated.qty,
            category: r.category,
            date: data.inwardDate,
            rate: aggregated.rate,
            jobCardAllocations: r.jobCardAllocations
          });
          processed.add(key);
        }
      });

      await executeFinishGoodInwardTransaction(mergedPayloads, user?.name || 'System');
      onSuccess();
    } catch (error) {
      console.error("Bulk IN failed", error);
      alert("Failed to submit Bulk IN. See console for details.");
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary shadow-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-secondary/30 shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center">
            <ArrowDownToLine className="w-6 h-6 mr-3 text-primary" />
            Finish Goods Bulk IN
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          {/* Top Config */}
          <div className="p-5 border-b border-border bg-card grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
            <div>
              <label className="block text-sm font-semibold mb-1">Inward Date</label>
              <input type="date" required {...register('inwardDate')} className={inputCls} />
            </div>
            <div className="col-span-2 flex items-end">
               <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded border border-border">
                  <strong>Pro Tip:</strong> Enter quantity and press <strong>Enter</strong> to automatically copy product details to the next row!
               </div>
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-auto p-5 bg-muted/20" ref={containerRef}>
            <div className="min-w-[800px]">
              <div className="grid grid-cols-12 gap-3 mb-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">Product Name</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-1">Rate</div>
                <div className="col-span-1 text-right">Qty</div>
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
                      products={products} 
                      register={register} 
                      setValue={setValue} 
                      handleProductChange={handleProductChange} 
                      inputCls={inputCls} 
                    />
                  </div>

                  {/* Customer (Readonly mostly, auto-filled) */}
                  <div className="col-span-3">
                    <input
                      type="text"
                      {...register(`rows.${index}.customerName` as const)}
                      className={inputCls + " bg-muted/30"}
                      placeholder="Auto-filled"
                      readOnly
                    />
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <select
                      {...register(`rows.${index}.category` as const)}
                      className={inputCls + (rows[index]?.category === 'REJECTED' ? " text-red-600 font-semibold" : " text-green-600 font-semibold")}
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>

                  {/* Rate */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      step="0.01"
                      {...register(`rows.${index}.rate` as const)}
                      className={inputCls}
                      placeholder="₹0.00"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      {...register(`rows.${index}.quantity` as const)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className={inputCls + " text-right font-bold"}
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

                  {isDuplicate && (
                    <div className="col-span-12 mt-1 text-xs text-orange-600 flex items-center font-semibold bg-orange-50/50 p-1.5 rounded border border-orange-200">
                      <AlertCircle className="w-4 h-4 mr-1.5" />
                      Warning: This product is already selected in another row of this batch.
                    </div>
                  )}

                  {/* Job Card Selector */}
                  {rows[index]?.productId && (
                     <JobCardSelector
                       productId={rows[index].productId}
                       rowQuantity={Number(rows[index].quantity) || 0}
                       allocations={rows[index].jobCardAllocations}
                       onChange={(allocs) => setValue(`rows.${index}.jobCardAllocations`, allocs)}
                     />
                  )}

                </div>
              )})}
            </div>

            <button
              type="button"
              onClick={() => append({ 
                productId: '', customerName: '', productName: '', category: 'REGULAR', quantity: '', rate: '' 
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
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold text-sm flex items-center shadow-lg hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {isSubmitting ? <CircleDashed className="w-5 h-5 mr-2 animate-spin" /> : <ArrowDownToLine className="w-5 h-5 mr-2" />}
                {isSubmitting ? 'Processing...' : 'Submit Bulk IN'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductSearchSelect({ index, products, register, setValue, handleProductChange, inputCls }: any) {
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
        required={!searchText}
      />
      <input type="hidden" {...register(`rows.${index}.productId` as const, { required: true })} />
      
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-[150%] bg-white border border-gray-300 rounded-md shadow-xl max-h-60 overflow-y-auto">
          {products.filter((p: any) => {
             const lower = searchText.toLowerCase();
             const combined = `${p.itemName} ${p.artworkNo}`.toLowerCase();
             return !searchText || combined.includes(lower);
          }).map((p: any) => (
            <div 
              key={p.id}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm text-black border-b border-gray-100 last:border-0 flex flex-col"
              onMouseDown={() => {
                setValue(`rows.${index}.productId`, p.id);
                setSearchText(`${p.itemName} (${p.artworkNo})`);
                handleProductChange(index, p.id);
                setIsOpen(false);
              }}
            >
              <div className="font-bold">{p.itemName}</div>
              <div className="text-xs text-gray-600">Artwork: {p.artworkNo}</div>
            </div>
          ))}
          {products.filter((p: any) => {
             const lower = searchText.toLowerCase();
             const combined = `${p.itemName} ${p.artworkNo}`.toLowerCase();
             return !searchText || combined.includes(lower);
          }).length === 0 && (
             <div className="px-3 py-2 text-sm text-gray-500 italic text-center">No matching products found.</div>
          )}
        </div>
      )}
    </div>
  );
}

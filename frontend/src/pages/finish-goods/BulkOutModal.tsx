import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { ArrowUpFromLine, X, CircleDashed, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { executeFinishGoodOutwardTransaction, getFinishGoods, getFinishGoodTransactions, type FinishGoodOutwardPayload, type LogisticsPayload } from '../../lib/supabase/finishGoodService';
import { getProducts } from '../../lib/supabase/productService';
import { getPurchaseOrders, getPurchaseOrderBalance, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import BulkInModal from './BulkInModal';

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

const normalizeStr = (s?: string | null) => (s || '').trim().toLowerCase();

// Extracts dimension pattern like "205x105x325" or "345x345x325"
const extractDimensions = (s?: string | null) => {
  if (!s) return '';
  const match = s.toLowerCase().match(/\d+[\s]*[x*×][\s]*\d+([\s]*[x*×][\s]*\d+)?/);
  if (match) {
    return match[0].replace(/[\s*×]/g, 'x');
  }
  return '';
};

// Clean strings: remove punctuation, normalize palin/plain, remove spaces
const cleanItemStr = (s?: string | null) => {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/palin/g, 'plain') // common typo fix
    .replace(/[^a-z0-9]/g, ''); // alphanumeric only
};

export default function BulkOutModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInModal, setShowInModal] = useState(false);
  const [shortages, setShortages] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Fetch products and finish goods
  const [products, setProducts] = useState<any[]>([]);
  const [finishGoods, setFinishGoods] = useState<any[]>([]);
  const [historyDocs, setHistoryDocs] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  
  const loadData = () => {
    void Promise.all([getProducts(), getFinishGoods(), getFinishGoodTransactions(), getPurchaseOrders()]).then(([prodData, fgData, txData, poData]) => {
      setProducts(prodData || []);
      setFinishGoods(fgData || []);
      setHistoryDocs(txData || []);
      const activePOs = (poData || []).filter(po => {
        const status = (po.status || '').toUpperCase();
        const bal = getPurchaseOrderBalance(po);
        return (status !== 'CLOSED' && status !== 'CANCELLED') || bal > 0;
      });
      setPurchaseOrders(activePOs);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const mergedProducts = useMemo(() => {
    const map = new Map<string, any>();

    products.forEach((p: any) => {
      map.set(p.id, {
        productId: p.id,
        productName: p.itemName,
        customerName: p.customerName || '',
        artworkNo: p.artworkNo || '',
        closingBalance: 0,
        nonMovingBalance: 0,
        rate: p.actualCosting || 0
      });
    });

    finishGoods.forEach((fg: any) => {
      const pid = fg.productId || fg.id;
      const existing = map.get(pid);
      if (existing) {
        existing.closingBalance = fg.closingBalance || 0;
        existing.nonMovingBalance = fg.nonMovingBalance || 0;
        existing.rate = fg.rate || existing.rate || 0;
        if (!existing.productName && fg.productName) existing.productName = fg.productName;
        if (!existing.customerName && fg.customerName) existing.customerName = fg.customerName;
      } else {
        map.set(pid, {
          productId: pid,
          productName: fg.productName,
          customerName: fg.customerName || '',
          artworkNo: '',
          closingBalance: fg.closingBalance || 0,
          nonMovingBalance: fg.nonMovingBalance || 0,
          rate: fg.rate || 0
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  }, [products, finishGoods]);

  const uniquePlaces = useMemo(() => Array.from(new Set(historyDocs.map(d => d.place).filter(Boolean))), [historyDocs]);
  const uniqueTransporters = useMemo(() => Array.from(new Set(historyDocs.map(d => d.transporterName).filter(Boolean))), [historyDocs]);
  const uniqueVehicleNos = useMemo(() => Array.from(new Set(historyDocs.map(d => d.vehicleNo).filter(Boolean))), [historyDocs]);
  const uniqueVehicleSizes = useMemo(() => Array.from(new Set(historyDocs.map(d => d.vehicleSize).filter(Boolean))), [historyDocs]);

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

  // Strictly match POs for the selected product/item
  const getMatchingPOsForProduct = (productId: string, productName?: string, customerName?: string) => {
    const normFgProd = normalizeStr(productName);
    const normFgCust = normalizeStr(customerName);
    const cleanFgProd = cleanItemStr(productName);
    const fgDim = extractDimensions(productName);

    return purchaseOrders
      .map(po => {
        const bal = getPurchaseOrderBalance(po);
        if (bal <= 0) return null;

        const poProdName = po.productName || '';
        const normPoProd = normalizeStr(poProdName);
        const cleanPoProd = cleanItemStr(poProdName);
        const normPoCust = normalizeStr(po.customerName);
        const poDim = extractDimensions(poProdName);

        let isMatch = false;
        let score = 0;

        // 1. Direct ID match
        if (po.productId && (po.productId === productId || normalizeStr(po.productId) === normalizeStr(productId))) {
          isMatch = true;
          score += 100;
        }

        // 2. Exact Product Name match
        if (normPoProd && normFgProd && normPoProd === normFgProd) {
          isMatch = true;
          score += 100;
        }

        // 3. Cleaned Product Name match (exact character equality)
        if (cleanPoProd && cleanFgProd && cleanPoProd === cleanFgProd) {
          isMatch = true;
          score += 90;
        }

        // 4. Exact Dimension Match (e.g. 205x105x325 === 205x105x325)
        if (fgDim && poDim && fgDim === poDim) {
          const isSameCust = normFgCust && normPoCust && (normFgCust === normPoCust || normPoCust.includes(normFgCust) || normFgCust.includes(normPoCust));
          if (isSameCust || cleanPoProd.includes('box') || cleanFgProd.includes('box')) {
            isMatch = true;
            score += 85;
          }
        }

        if (!isMatch) return null;

        // Customer match priority bonus
        const isCustMatch = Boolean(normFgCust && normPoCust && (normFgCust === normPoCust || normPoCust.includes(normFgCust) || normFgCust.includes(normPoCust)));
        if (isCustMatch) {
          score += 50;
        }

        return {
          po,
          bal,
          score,
          isCustMatch
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const timeA = a.po.poDate ? new Date(a.po.poDate).getTime() : 0;
        const timeB = b.po.poDate ? new Date(b.po.poDate).getTime() : 0;
        return timeA - timeB;
      });
  };

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
    const fg = mergedProducts.find(p => p.productId === productId);
    if (fg) {
      setValue(`rows.${index}.customerName`, fg.customerName || '');
      setValue(`rows.${index}.productName`, fg.productName || '');

      // Automatically check and auto-select matching PO strictly for this item
      const matchingPOs = getMatchingPOsForProduct(productId, fg.productName, fg.customerName);
      if (matchingPOs.length > 0) {
        setValue(`rows.${index}.poId`, matchingPOs[0].po.id || '');
        if (!fg.customerName && matchingPOs[0].po.customerName) {
          setValue(`rows.${index}.customerName`, matchingPOs[0].po.customerName);
        }
      } else {
        setValue(`rows.${index}.poId`, '');
      }
    } else {
      setValue(`rows.${index}.customerName`, '');
      setValue(`rows.${index}.productName`, '');
      setValue(`rows.${index}.poId`, '');
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

    // Pre-calculate shortages
    const requiredStock = new Map<string, { productId: string, category: string, requiredQty: number }>();
    validRows.forEach(r => {
       const key = `${r.productId}_${r.category}`;
       const current = requiredStock.get(key) || { productId: r.productId, category: r.category, requiredQty: 0 };
       current.requiredQty += Number(r.quantity);
       requiredStock.set(key, current);
    });

    const currentShortages: any[] = [];
    for (const req of requiredStock.values()) {
       const fg = mergedProducts.find(f => f.productId === req.productId);
       if (!fg) continue;
       const available = req.category === 'NON-MOVING' ? (fg.nonMovingBalance || 0) : (fg.closingBalance || 0);
       if (req.requiredQty > available) {
           currentShortages.push({
               productId: fg.productId,
               productName: fg.productName,
               customerName: fg.customerName,
               category: req.category === 'NON-MOVING' ? 'REJECTED' : 'REGULAR',
               shortQty: req.requiredQty - available,
               rate: fg.rate
           });
       }
    }

    if (currentShortages.length > 0) {
       const msg = `Insufficient balance for some products:\n` + currentShortages.map(s => `- ${s.productName}: Short by ${s.shortQty}`).join('\n');
       const confirmIn = window.confirm(`${msg}\n\nWould you like to auto-fill the Bulk IN form with these exact shortages now?`);
       if (confirmIn) {
          setShortages(currentShortages);
          setShowInModal(true);
       }
       return;
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
      const msg = error.message || "";
      if (msg.toLowerCase().includes("insufficient") && msg.toLowerCase().includes("balance")) {
        const confirmIn = window.confirm(`${msg}\n\nWould you like to open the Bulk IN form to add stock right now?`);
        if (confirmIn) {
          setShowInModal(true);
        }
      } else {
        alert(msg || "Failed to submit Bulk OUT. See console for details.");
      }
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
                      items={mergedProducts} 
                      register={register} 
                      setValue={setValue} 
                      handleProductChange={handleProductChange} 
                      inputCls={inputCls} 
                      value={currentProductId}
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
                      const rowFg = mergedProducts.find(fg => fg.productId === currentProductId);
                      if (!currentProductId || !rowFg) {
                        return <select disabled className={inputCls + " bg-muted/30 text-xs text-muted-foreground"}><option>Select Item First</option></select>;
                      }
                      
                      const matchingPOs = getMatchingPOsForProduct(currentProductId, rowFg.productName, rowFg.customerName);
                        
                      if (matchingPOs.length === 0) {
                        return (
                          <div className="relative">
                            <select disabled className={inputCls + " text-xs text-muted-foreground bg-muted/20 border-dashed"}>
                              <option value="">No Pending PO</option>
                            </select>
                            <input type="hidden" {...register(`rows.${index}.poId` as const)} value="" />
                          </div>
                        );
                      }

                      const chosenPoId = rows[index]?.poId;
                      const selectedPo = purchaseOrders.find(p => p.id === chosenPoId);
                      const selectedPoBal = selectedPo ? getPurchaseOrderBalance(selectedPo) : null;

                      return (
                        <div>
                          <select 
                            {...register(`rows.${index}.poId` as const)} 
                            onChange={(e) => {
                              const chosenPoId = e.target.value;
                              setValue(`rows.${index}.poId`, chosenPoId);
                              if (chosenPoId) {
                                const chosenPo = purchaseOrders.find(p => p.id === chosenPoId);
                                if (chosenPo?.customerName) {
                                  setValue(`rows.${index}.customerName`, chosenPo.customerName);
                                }
                              }
                            }}
                            className={inputCls + " text-xs font-semibold text-blue-700 bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 cursor-pointer"}
                          >
                            <option value="">-- Skip PO / None --</option>
                            {matchingPOs.map(({ po, bal, isCustMatch }) => (
                              <option key={po.id} value={po.id!}>
                                {po.poNo} | Bal: {bal.toLocaleString()} pcs{isCustMatch ? ' ★' : ''}
                              </option>
                            ))}
                          </select>
                          {selectedPoBal !== null && (
                            <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-between">
                              <span>PO Bal: {selectedPoBal.toLocaleString()} pcs</span>
                              {matchingPOs.length > 1 && (
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  ({matchingPOs.length} POs available)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
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

                  {/* Stock & PO Indicators */}
                  {currentProductId && (
                    <div className="col-span-12 -mt-1 px-2 pb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {(() => {
                        const fg = mergedProducts.find(p => p.productId === currentProductId);
                        if (!fg) return null;
                        const stock = rows[index]?.category === 'NON-MOVING' ? (fg.nonMovingBalance || 0) : (fg.closingBalance || 0);
                        const isShortage = rows[index]?.quantity && Number(rows[index]?.quantity) > stock;
                        
                        const chosenPoId = rows[index]?.poId;
                        const selectedPo = purchaseOrders.find(p => p.id === chosenPoId);
                        const selectedPoBal = selectedPo ? getPurchaseOrderBalance(selectedPo) : null;
                        const qtyNum = Number(rows[index]?.quantity) || 0;
                        const isPoOverQty = selectedPoBal !== null && qtyNum > selectedPoBal;

                        return (
                          <div className="flex flex-wrap items-center gap-3">
                            <div className={`flex items-center gap-1.5 font-medium ${isShortage ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                              {isShortage && <AlertCircle className="w-3.5 h-3.5 inline text-destructive animate-pulse" />}
                              <span>
                                Available in {rows[index]?.category === 'NON-MOVING' ? 'Non-Moving' : 'Regular'}: {stock} pcs
                              </span>
                              {isShortage && (
                                <span className="text-destructive font-bold bg-destructive/10 px-1.5 py-0.5 rounded">
                                  (Short by {Number(rows[index]?.quantity) - stock} pcs)
                                </span>
                              )}
                            </div>

                            {isPoOverQty && (
                              <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded flex items-center gap-1.5">
                                <span>
                                  💡 <b>{selectedPoBal} pcs</b> PO {selectedPo?.poNo} se close hoga. Baaki <b>{qtyNum - selectedPoBal} pcs</b> ke liye aap <b>+ Add Another Row</b> karke 2nd PO select kar sakte hain ya auto-adjust hone de sakte hain.
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Duplicate warning */}
                  {isDuplicate && (
                    <div className="col-span-12 -mt-1 px-2 pb-1">
                      <span className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                        <AlertCircle className="w-3 h-3 inline" /> Duplicate product entry — quantities will be merged automatically on submit
                      </span>
                    </div>
                  )}
                </div>
              )})}
            </div>

            <button
              type="button"
              onClick={() => append({ 
                productId: '', customerName: '', productName: '', category: 'DISPATCH', quantity: '', poId: '' 
              })}
              className="mt-4 flex items-center text-sm font-semibold text-destructive hover:text-destructive/80 transition-colors"
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

      {showInModal && (
        <BulkInModal
          initialItems={shortages}
          onClose={() => {
            setShowInModal(false);
            setShortages([]);
            loadData();
          }}
          onSuccess={() => {
            setShowInModal(false);
            setShortages([]);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function ProductSearchSelect({ index, items, register, setValue, handleProductChange, inputCls, value }: any) {
  const selectedProduct = items.find((p: any) => p.productId === value);
  const [searchText, setSearchText] = useState(
    selectedProduct ? `${selectedProduct.productName}${selectedProduct.artworkNo ? ` (${selectedProduct.artworkNo})` : ''}` : ''
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const p = items.find((item: any) => item.productId === value);
      if (p) {
        setSearchText(`${p.productName}${p.artworkNo ? ` (${p.artworkNo})` : ''}`);
      }
    } else if (!searchText) {
      setSearchText('');
    }
  }, [value, items]);

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
        <div className="absolute z-[100] mt-1 w-[150%] bg-white dark:bg-card border border-border rounded-md shadow-xl max-h-60 overflow-y-auto">
          {items.filter((p: any) => {
             const lower = searchText.toLowerCase();
             const combined = `${p.productName || ''} ${p.artworkNo || ''} ${p.customerName || ''}`.toLowerCase();
             return !searchText || combined.includes(lower);
          }).map((p: any) => (
            <div 
              key={p.productId}
              className="px-3 py-2 cursor-pointer hover:bg-muted/80 text-sm text-foreground border-b border-border/40 last:border-0"
              onMouseDown={() => {
                setValue(`rows.${index}.productId`, p.productId);
                setSearchText(`${p.productName}${p.artworkNo ? ` (${p.artworkNo})` : ''}`);
                handleProductChange(index, p.productId);
                setIsOpen(false);
              }}
            >
              <div className="font-bold">{p.productName}</div>
              <div className="text-xs text-muted-foreground">
                {p.customerName} {p.artworkNo ? `• Artwork: ${p.artworkNo}` : ''}
              </div>
              <div className="text-xs text-muted-foreground/80">
                Stock: <span className={p.closingBalance > 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>{p.closingBalance || 0} Reg</span> | <span className={p.nonMovingBalance > 0 ? "font-semibold text-orange-600 dark:text-orange-400" : ""}>{p.nonMovingBalance || 0} Non-Mov</span>
              </div>
            </div>
          ))}
          {items.filter((p: any) => {
             const lower = searchText.toLowerCase();
             const combined = `${p.productName || ''} ${p.artworkNo || ''} ${p.customerName || ''}`.toLowerCase();
             return !searchText || combined.includes(lower);
          }).length === 0 && (
             <div className="px-3 py-2 text-sm text-muted-foreground italic text-center">No matching products found.</div>
          )}
        </div>
      )}
    </div>
  );
}

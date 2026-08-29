import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, Search, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProducts } from '../../lib/supabase/productService';
import { getCustomers } from '../../lib/supabase/customerService';
import { createPurchaseOrders, purchaseOrderNumberExists, getPendingPOsForCustomerAndProducts, bulkCloseCustomerPOs, getPurchaseOrderBalance, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { useAuth } from '../../contexts/AuthContext';
import { cn, getCustomerDisplayLabel } from '../../lib/utils';
import RMStatusPanel from './RMStatusPanel';

// ── Searchable Product Dropdown ──────────────────────────────────────────────
interface ProductOption {
  id: string;
  name: string;
  artworkNo?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  products: ProductOption[];
  hasError?: boolean;
  triggerDataId?: string;
}

function SearchableSelect({ value, onChange, products, hasError, triggerDataId }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selected = products.find(p => p.id === value);

  const filtered = search.trim()
    ? products
        .filter(p => {
          const label = `${p.name} ${p.artworkNo || ''}`.toLowerCase();
          return label.includes(search.trim().toLowerCase());
        })
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const q = search.trim().toLowerCase();
          const aStarts = aName.startsWith(q) ? 0 : 1;
          const bStarts = bName.startsWith(q) ? 0 : 1;
          return aStarts - bStarts || aName.localeCompare(bName);
        })
    : products.slice().sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => { setHighlightIdx(0); }, [search]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) { onChange(filtered[highlightIdx].id); setOpen(false); }
    }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const displayLabel = selected
    ? `${selected.name.trim()}${selected.artworkNo?.trim() ? ` (${selected.artworkNo.trim()})` : ''}`
    : '';

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        type="button"
        data-item-trigger={triggerDataId}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between px-2 py-1.5 text-sm rounded border bg-background transition-colors font-medium text-left',
          hasError ? 'border-red-500' : 'border-input',
          !displayLabel && 'text-muted-foreground'
        )}
      >
        <span className="truncate flex-1 min-w-0">{displayLabel || 'Select Item...'}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 ml-1 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
          style={{ maxHeight: 260 }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/30">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              type="text"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              placeholder="Type to search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>

          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 210 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No items found</div>
            ) : (
              filtered.map((p, idx) => {
                const label = `${p.name.trim()}${p.artworkNo?.trim() ? ` (${p.artworkNo.trim()})` : ''}`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-idx={idx}
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors truncate',
                      p.id === value
                        ? 'bg-primary/15 text-primary font-semibold'
                        : idx === highlightIdx
                          ? 'bg-muted/60 text-foreground'
                          : 'text-foreground hover:bg-muted/40'
                    )}
                  >
                    {label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

type POItem = {
  id: string; // internal UI id
  productId: string;
  rate: string;
  orderQty: string;
  deliveryDate: string;
};

export default function AddPOModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { user } = useAuth();
  
  const [commonData, setCommonData] = useState({
    poNo: '',
    poDate: new Date().toISOString().split('T')[0],
    customerId: '',
    consignee: '',
  });

  const [items, setItems] = useState<POItem[]>([
    { id: Math.random().toString(36).substring(7), productId: '', rate: '', orderQty: '', deliveryDate: '' }
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingOldPOs, setPendingOldPOs] = useState<PurchaseOrder[]>([]);
  const [showConfirmNil, setShowConfirmNil] = useState(false);
  const [validatedDataToSave, setValidatedDataToSave] = useState<any[]>([]);

  // Refs for qty inputs — used for Enter-key auto-add-row
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch Customers
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers() as unknown as Promise<any[]>
  });

  // Fetch Products
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const data = await getProducts() as any[];
      return data.map((product: any) => ({ ...product, name: product.itemName }));
    }
  });

  // Returns the new item's id so callers can focus it
  const handleAddItem = useCallback((): string => {
    const newId = Math.random().toString(36).substring(7);
    setItems(prev => [...prev, { id: newId, productId: '', rate: '', orderQty: '', deliveryDate: '' }]);
    return newId;
  }, []);

  // Enter on QTY → add new row and focus its product dropdown
  const handleQtyKeyDown = (e: React.KeyboardEvent, _itemId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newId = handleAddItem();
      setTimeout(() => {
        const btn = document.querySelector<HTMLButtonElement>(`[data-item-trigger="${newId}"]`);
        btn?.focus();
      }, 60);
    }
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof POItem, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
    if (errors[`${field}-${id}`]) {
      const newErrors = { ...errors };
      delete newErrors[`${field}-${id}`];
      setErrors(newErrors);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!commonData.poNo.trim()) newErrors.poNo = "PO No. is required.";
    if (!commonData.poDate) newErrors.poDate = "PO Date is required.";
    if (!commonData.customerId) newErrors.customerId = "Customer is required.";
    
    if (items.length === 0) {
      newErrors.general = "At least one item must be added.";
    }

    const selectedProductIds = new Set<string>();

    items.forEach((item) => {
      if (!item.productId) newErrors[`productId-${item.id}`] = "Required";
      else {
        if (selectedProductIds.has(item.productId)) {
           newErrors[`productId-${item.id}`] = "Duplicate item in list";
        }
        selectedProductIds.add(item.productId);
      }
      
      const rateNum = Number(item.rate);
      if (!item.rate || isNaN(rateNum) || rateNum < 0) {
        newErrors[`rate-${item.id}`] = "Invalid";
      }
      
      const qtyNum = Number(item.orderQty);
      if (!item.orderQty || isNaN(qtyNum) || qtyNum <= 0) {
        newErrors[`orderQty-${item.id}`] = "Invalid";
      }

      if (!item.deliveryDate) {
        newErrors[`deliveryDate-${item.id}`] = "Required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; 
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // 1. Duplicate check for this PO No in the database
      const poExists = await purchaseOrderNumberExists(commonData.poNo.trim());

      if (poExists) {
        setErrors({ poNo: "This Purchase Order number already exists in the system." });
        setIsSubmitting(false);
        return;
      }

      const customer = customers.find(c => c.id === commonData.customerId);
      if (!customer) {
        setErrors({ general: "Invalid customer selected." });
        setIsSubmitting(false);
        return;
      }

      const purchaseOrdersToCreate: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[] = [];

      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;

        const rate = Number(item.rate);
        const opnQty = Number(item.orderQty);
        const inQty = 0;
        const outQty = 0;

        purchaseOrdersToCreate.push({
          poNo: commonData.poNo.trim(),
          poDate: commonData.poDate,
          deliveryDate: item.deliveryDate,
          customerId: customer.id,
          customerName: customer.name || '',
          consignee: commonData.consignee.trim(),
          productId: product.id,
          productName: product.itemName || product.name || '',
          artworkNo: product.artworkNo || '',
          size: `${product.length || ''}x${product.width || ''}x${product.height || ''} ${product.unit || ''}`.trim(),
          rate: rate,
          orderQty: opnQty,
          inQty: inQty,
          outQty: outQty,
          status: 'OPEN',
          history: [],
          isArchived: false,
        });
      }

      if (purchaseOrdersToCreate.length === 0) {
         setErrors({ general: "No valid items to save." });
         setIsSubmitting(false);
         return;
      }

      const productIds = Array.from(new Set(items.map(i => i.productId).filter(Boolean)));
      const oldPOs = await getPendingPOsForCustomerAndProducts(customer.id, productIds);

      if (oldPOs.length > 0) {
        setPendingOldPOs(oldPOs);
        setValidatedDataToSave(purchaseOrdersToCreate);
        setShowConfirmNil(true);
        setIsSubmitting(false);
        return;
      }

      await proceedWithSave(purchaseOrdersToCreate, false);

    } catch (error: any) {
      console.error("Error checking POs:", error);
      setErrors({ general: `A critical database error occurred. ${error?.message || ''}` });
      setIsSubmitting(false);
    }
  };

  const proceedWithSave = async (poToCreate: any[], shouldNilOld: boolean) => {
    setIsSubmitting(true);
    try {
      if (shouldNilOld && pendingOldPOs.length > 0) {
        await bulkCloseCustomerPOs(pendingOldPOs.map(p => p.id!), user?.name || 'System');
      }
      await createPurchaseOrders(poToCreate, user?.name || 'System');
      onSuccess();
    } catch (error: any) {
      console.error("Error saving PO:", error);
      setErrors({ general: `A critical database error occurred. ${error?.message || ''}` });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] border border-border overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-xl font-bold text-foreground">Create Purchase Order (Bulk Add)</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Add a new PO with multiple items</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={isSubmitting}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {errors.general && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm font-semibold flex items-center">
               {errors.general}
            </div>
          )}

          <form id="add-po-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Common Fields */}
            <div className="bg-muted/20 p-4 rounded-xl border border-border space-y-4">
              <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-wider mb-2 border-b pb-2">Common Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">PO No. *</label>
                  <input 
                    type="text" 
                    className={cn(
                      "w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground transition-colors font-bold",
                      errors.poNo ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                    )}
                    value={commonData.poNo}
                    onChange={e => {
                      setCommonData({...commonData, poNo: e.target.value});
                      if (errors.poNo) setErrors({...errors, poNo: ''});
                    }}
                  />
                  {errors.poNo && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.poNo}</p>}
                </div>
                
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Customer *</label>
                  <select
                    className={cn(
                      "w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground transition-colors font-medium",
                      errors.customerId ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                    )}
                    value={commonData.customerId}
                    onChange={e => {
                      setCommonData({...commonData, customerId: e.target.value});
                      if (errors.customerId) setErrors({...errors, customerId: ''});
                    }}
                  >
                    <option value="">Select Customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{getCustomerDisplayLabel(c, customers)}</option>
                    ))}
                  </select>
                  {errors.customerId && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.customerId}</p>}
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">PO Date *</label>
                  <input 
                    type="date" 
                    className={cn(
                      "w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground transition-colors",
                      errors.poDate ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                    )}
                    value={commonData.poDate}
                    onChange={e => {
                      setCommonData({...commonData, poDate: e.target.value});
                      if (errors.poDate) setErrors({...errors, poDate: ''});
                    }}
                  />
                  {errors.poDate && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.poDate}</p>}
                </div>
                
                <div className="md:col-span-1">
                   <label className="block text-xs font-bold text-muted-foreground mb-1">Consignee (Optional)</label>
                   <input 
                     type="text"
                     placeholder="Enter consignee details"
                     className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-colors"
                     value={commonData.consignee}
                     onChange={e => setCommonData({...commonData, consignee: e.target.value})}
                   />
                </div>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">
                  Line Items
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case">
                    (Qty field me Enter → next row auto-add)
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-md text-xs font-bold flex items-center transition-colors"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </button>
              </div>

              <div className="bg-muted/10 border rounded-xl" style={{ overflow: 'visible' }}>
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-secondary/50 text-muted-foreground uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2 min-w-[250px]">Item Name *</th>
                      <th className="px-3 py-2 w-28">Rate (₹) *</th>
                      <th className="px-3 py-2 w-28">Qty *</th>
                      <th className="px-3 py-2 w-36">Delivery *</th>
                      <th className="px-3 py-2 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                     {items.map((item, index) => (
                      <React.Fragment key={item.id}>
                       <tr className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 text-center font-bold text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2" style={{ overflow: 'visible', position: 'relative' }}>
                          <SearchableSelect
                            value={item.productId}
                            onChange={val => handleItemChange(item.id, 'productId', val)}
                            products={products}
                            hasError={!!errors[`productId-${item.id}`]}
                            triggerDataId={item.id}
                          />
                          {errors[`productId-${item.id}`] && <span className="text-red-500 text-[10px] font-bold block">{errors[`productId-${item.id}`]}</span>}
                        </td>
                        <td className="px-3 py-2">
                           <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            className={cn(
                              "w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground transition-colors font-bold text-right",
                              errors[`rate-${item.id}`] ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                            )}
                            value={item.rate}
                            onChange={e => handleItemChange(item.id, 'rate', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                           <input 
                            type="number" 
                            min="1"
                            ref={el => { qtyRefs.current[item.id] = el; }}
                            className={cn(
                              "w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground transition-colors font-bold text-right",
                              errors[`orderQty-${item.id}`] ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                            )}
                            value={item.orderQty}
                            onChange={e => handleItemChange(item.id, 'orderQty', e.target.value)}
                            onKeyDown={e => handleQtyKeyDown(e, item.id)}
                          />
                        </td>
                        <td className="px-3 py-2">
                           <input 
                            type="date"
                            className={cn(
                              "w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground transition-colors font-bold",
                              errors[`deliveryDate-${item.id}`] ? "border-red-500 focus:ring-red-200" : "border-input focus:ring-primary/20"
                            )}
                            value={item.deliveryDate}
                            onChange={e => handleItemChange(item.id, 'deliveryDate', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={items.length === 1}
                            className="text-red-500/70 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed p-1 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {/* Phase 2: RM Status Panel - shows live shortage below each item */}
                      {item.productId && Number(item.orderQty) > 0 && (
                        <tr key={`rm-${item.id}`}>
                          <td colSpan={6} className="px-3 pb-2">
                            <RMStatusPanel productId={item.productId} orderQty={Number(item.orderQty)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-muted/20 flex justify-end gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg font-bold text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            form="add-po-form"
            type="submit" 
            disabled={isSubmitting}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50 flex items-center"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving Batch...</>
            ) : (
              `Save ${items.length} ${items.length === 1 ? 'Item' : 'Items'}`
            )}
          </button>
        </div>
      </div>

      {showConfirmNil && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border bg-orange-500/10">
              <h2 className="text-xl font-black text-foreground">Old Pending PO Found!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We found existing pending PO(s) for this customer and item(s).
              </p>
            </div>
            <div className="p-5 max-h-[300px] overflow-y-auto">
              {pendingOldPOs.map(po => (
                <div key={po.id} className="mb-3 p-3 bg-muted/30 rounded border border-border">
                  <p className="text-sm font-bold">PO No: {po.poNo}</p>
                  <p className="text-xs text-muted-foreground">Item: {po.productName}</p>
                  <p className="text-sm font-semibold text-orange-600">Pending Balance: {getPurchaseOrderBalance(po)}</p>
                </div>
              ))}
              <p className="text-sm font-semibold mt-4">
                Do you want to NIL (Close) these old POs before saving the new one?
              </p>
            </div>
            <div className="p-5 border-t border-border bg-muted/20 flex justify-end gap-3">
              <button 
                onClick={() => { setShowConfirmNil(false); proceedWithSave(validatedDataToSave, false); }}
                className="px-4 py-2 bg-secondary text-secondary-foreground font-bold rounded hover:bg-secondary/80 transition-colors"
                disabled={isSubmitting}
              >
                No, Keep Them Open
              </button>
              <button 
                onClick={() => { setShowConfirmNil(false); proceedWithSave(validatedDataToSave, true); }}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 transition-colors"
                disabled={isSubmitting}
              >
                Yes, NIL Old POs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

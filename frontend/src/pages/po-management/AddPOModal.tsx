import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Loader2, Search, ChevronDown, Sparkles, Building2, Package, Check, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProducts, createProduct } from '../../lib/supabase/productService';
import { getCustomers, createCustomer } from '../../lib/supabase/customerService';
import { createPurchaseOrders, purchaseOrderNumberExists, getExistingPOInfo, type ExistingPOInfo, getPendingPOsForCustomerAndProducts, bulkCloseCustomerPOs, getPurchaseOrderBalance, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { useAuth } from '../../contexts/AuthContext';
import { cn, getCustomerDisplayLabel } from '../../lib/utils';
import RMStatusPanel from './RMStatusPanel';

// ── Searchable Customer Dropdown with Inline Auto-Create ────────────────────────
interface SearchableCustomerSelectProps {
  value: string;
  onChange: (customerId: string, customerName?: string) => void;
  customers: any[];
  hasError?: boolean;
  onCustomerCreated: (newCustomer: any) => void;
}

function SearchableCustomerSelect({ value, onChange, customers, hasError, onCustomerCreated }: SearchableCustomerSelectProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selected = customers.find(c => c.id === value || c.name === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      return name.includes(q);
    }).sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aStarts = aName.startsWith(q) ? 0 : 1;
      const bStarts = bName.startsWith(q) ? 0 : 1;
      return aStarts - bStarts || aName.localeCompare(bName);
    });
  }, [customers, search]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return customers.find(c => (c.name || '').trim().toLowerCase() === q);
  }, [customers, search]);

  const canCreateNew = search.trim().length > 0 && !exactMatch;

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

  const handleCreateCustomer = async () => {
    if (!search.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const trimmedName = search.trim();
      const newId = await createCustomer(trimmedName, user?.name || 'System');
      const newCust = { id: newId, name: trimmedName };
      onCustomerCreated(newCust);
      onChange(newId, trimmedName);
      setOpen(false);
    } catch (err: any) {
      console.error('Failed to create customer:', err);
      alert('Failed to create customer: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { 
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } 
      return; 
    }
    if (e.key === 'ArrowDown') { 
      e.preventDefault(); 
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); 
    }
    else if (e.key === 'ArrowUp') { 
      e.preventDefault(); 
      setHighlightIdx(i => Math.max(i - 1, 0)); 
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) { 
        onChange(filtered[highlightIdx].id, filtered[highlightIdx].name); 
        setOpen(false); 
      } else if (canCreateNew) {
        handleCreateCustomer();
      }
    }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const displayLabel = selected ? (selected.name || '') : '';

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border bg-background transition-colors font-medium text-left shadow-2xs',
          hasError ? 'border-red-500 ring-1 ring-red-500/20' : 'border-input hover:border-primary/50',
          !displayLabel && 'text-muted-foreground'
        )}
      >
        <span className="truncate flex-1 min-w-0 font-bold text-foreground">
          {displayLabel || 'Search or Select Customer...'}
        </span>
        <ChevronDown className={cn('w-4 h-4 ml-1.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-[250] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in"
          style={{ maxHeight: 280 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              type="text"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground font-medium"
              placeholder="Type customer name to search or create..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground text-xs p-1">✕</button>
            )}
          </div>

          <div ref={listRef} className="overflow-y-auto divide-y divide-border/40" style={{ maxHeight: 220 }}>
            {filtered.map((c, idx) => {
              const isSelected = c.id === value || c.name === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-idx={idx}
                  onClick={() => { onChange(c.id, c.name); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-3.5 py-2.5 text-sm transition-colors flex items-center justify-between',
                    isSelected
                      ? 'bg-primary/15 text-primary font-bold'
                      : idx === highlightIdx
                        ? 'bg-muted/70 text-foreground font-semibold'
                        : 'text-foreground hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}

            {canCreateNew && (
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={isCreating}
                className="w-full text-left px-3.5 py-2.5 text-sm bg-primary/10 hover:bg-primary/20 text-primary font-bold flex items-center gap-2 transition-colors border-t border-primary/20 sticky bottom-0"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0" />}
                <span>+ Create New Customer: <b>"{search.trim()}"</b></span>
              </button>
            )}

            {filtered.length === 0 && !canCreateNew && (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                No customers found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable Product Dropdown with Customer Filtering & Inline Auto-Create ──
interface ProductOption {
  id: string;
  name: string;
  itemName?: string;
  artworkNo?: string;
  customerId?: string;
  customerName?: string;
  rate?: number;
  actualCosting?: number;
  length?: number;
  width?: number;
  height?: number;
  size?: string;
}

interface SearchableProductSelectProps {
  value: string;
  onChange: (productId: string, product?: ProductOption) => void;
  products: ProductOption[];
  selectedCustomerId?: string;
  selectedCustomerName?: string;
  hasError?: boolean;
  triggerDataId?: string;
  onProductCreated: (newProduct: ProductOption) => void;
}

function SearchableProductSelect({ 
  value, 
  onChange, 
  products, 
  selectedCustomerId,
  selectedCustomerName,
  hasError, 
  triggerDataId,
  onProductCreated 
}: SearchableProductSelectProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selected = products.find(p => p.id === value);

  // Group & filter products: Prioritize items for the selected customer!
  const { customerItems, otherItems, filteredList } = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    // Check customer match
    const isCustMatch = (p: ProductOption) => {
      if (selectedCustomerId && p.customerId === selectedCustomerId) return true;
      if (selectedCustomerName && (p.customerName || '').trim().toLowerCase() === selectedCustomerName.trim().toLowerCase()) return true;
      return false;
    };

    let custGroup: ProductOption[] = [];
    let otherGroup: ProductOption[] = [];

    products.forEach(p => {
      const name = (p.itemName || p.name || '').toLowerCase();
      const art = (p.artworkNo || '').toLowerCase();
      const matchSearch = !q || name.includes(q) || art.includes(q);

      if (matchSearch) {
        if (selectedCustomerId || selectedCustomerName) {
          if (isCustMatch(p)) {
            custGroup.push(p);
          } else {
            otherGroup.push(p);
          }
        } else {
          custGroup.push(p);
        }
      }
    });

    const sortFn = (a: ProductOption, b: ProductOption) => {
      const aName = (a.itemName || a.name || '').toLowerCase();
      const bName = (b.itemName || b.name || '').toLowerCase();
      if (q) {
        const aStarts = aName.startsWith(q) ? 0 : 1;
        const bStarts = bName.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      return aName.localeCompare(bName);
    };

    custGroup.sort(sortFn);
    otherGroup.sort(sortFn);

    return {
      customerItems: custGroup,
      otherItems: otherGroup,
      filteredList: [...custGroup, ...otherGroup]
    };
  }, [products, search, selectedCustomerId, selectedCustomerName]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return products.find(p => (p.itemName || p.name || '').trim().toLowerCase() === q);
  }, [products, search]);

  const canCreateNew = search.trim().length > 0 && !exactMatch;

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

  const handleCreateNewProduct = async () => {
    if (!search.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const trimmedName = search.trim();
      const payload: Record<string, any> = {
        itemName: trimmedName,
        customerId: selectedCustomerId || null,
        customerName: selectedCustomerName || null,
        artworkNo: '',
        length: 0,
        width: 0,
        height: 0,
        ply: 3,
        reelSize: 0,
        cutSize: 0,
        layers: []
      };

      const newId = await createProduct(payload, user?.name || 'System');
      const newProd: ProductOption = {
        id: newId,
        name: trimmedName,
        itemName: trimmedName,
        customerId: selectedCustomerId,
        customerName: selectedCustomerName,
        artworkNo: '',
      };

      onProductCreated(newProd);
      onChange(newId, newProd);
      setOpen(false);
    } catch (err: any) {
      console.error('Failed to create product:', err);
      alert('Failed to create item: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filteredList.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[highlightIdx]) { 
        onChange(filteredList[highlightIdx].id, filteredList[highlightIdx]); 
        setOpen(false); 
      } else if (canCreateNew) {
        handleCreateNewProduct();
      }
    }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const displayLabel = selected
    ? `${(selected.itemName || selected.name || '').trim()}${selected.artworkNo?.trim() ? ` (${selected.artworkNo.trim()})` : ''}`
    : '';

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        type="button"
        data-item-trigger={triggerDataId}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between px-2.5 py-1.5 text-sm rounded border bg-background transition-colors font-medium text-left shadow-2xs',
          hasError ? 'border-red-500 ring-1 ring-red-500/20' : 'border-input hover:border-primary/50',
          !displayLabel && 'text-muted-foreground'
        )}
      >
        <span className="truncate flex-1 min-w-0">{displayLabel || 'Select or Type Item Name...'}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 ml-1 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-[250] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in"
          style={{ maxHeight: 300, minWidth: 320 }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border bg-muted/40">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              type="text"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground font-medium"
              placeholder="Search or type new item name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground text-xs p-1">✕</button>
            )}
          </div>

          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {/* Customer Items Section */}
            {customerItems.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider sticky top-0 flex items-center justify-between">
                  <span>Items for {selectedCustomerName || 'Selected Customer'}</span>
                  <span>({customerItems.length})</span>
                </div>
                {customerItems.map((p, idx) => {
                  const label = `${(p.itemName || p.name || '').trim()}${p.artworkNo?.trim() ? ` (${p.artworkNo.trim()})` : ''}`;
                  const isSelected = p.id === value;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-idx={idx}
                      onClick={() => { onChange(p.id, p); setOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                        isSelected
                          ? 'bg-primary/15 text-primary font-bold'
                          : idx === highlightIdx
                            ? 'bg-muted/70 text-foreground font-semibold'
                            : 'text-foreground hover:bg-muted/40'
                      )}
                    >
                      <div className="truncate flex-1">
                        <span className="font-semibold block truncate">{label}</span>
                        {p.size && <span className="text-[11px] text-muted-foreground block">{p.size}</span>}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Other Items Section */}
            {otherItems.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-secondary/70 text-muted-foreground text-[10px] font-bold uppercase tracking-wider sticky top-0 flex items-center justify-between border-t border-border">
                  <span>Other Products</span>
                  <span>({otherItems.length})</span>
                </div>
                {otherItems.map((p, idx) => {
                  const globalIdx = customerItems.length + idx;
                  const label = `${(p.itemName || p.name || '').trim()}${p.artworkNo?.trim() ? ` (${p.artworkNo.trim()})` : ''}`;
                  const isSelected = p.id === value;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-idx={globalIdx}
                      onClick={() => { onChange(p.id, p); setOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                        isSelected
                          ? 'bg-primary/15 text-primary font-bold'
                          : globalIdx === highlightIdx
                            ? 'bg-muted/70 text-foreground font-semibold'
                            : 'text-foreground hover:bg-muted/40'
                      )}
                    >
                      <div className="truncate flex-1">
                        <span className="font-medium block truncate">{label}</span>
                        <span className="text-[10px] text-muted-foreground block">{p.customerName || 'No Customer'}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}

            {canCreateNew && (
              <button
                type="button"
                onClick={handleCreateNewProduct}
                disabled={isCreating}
                className="w-full text-left px-3.5 py-2.5 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-300 font-bold flex items-center gap-2 transition-colors border-t border-green-500/20 sticky bottom-0"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0 text-green-600" />}
                <span>+ Create New Item: <b>"{search.trim()}"</b> {selectedCustomerName ? `for ${selectedCustomerName}` : ''}</span>
              </button>
            )}

            {filteredList.length === 0 && !canCreateNew && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No items found. Type a name to create a new item.
              </div>
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

export default function AddPOModal({ 
  onClose, 
  onSuccess,
  initialPoNo,
  initialCustomerId
}: { 
  onClose: () => void; 
  onSuccess: () => void;
  initialPoNo?: string;
  initialCustomerId?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [commonData, setCommonData] = useState({
    poNo: initialPoNo || '',
    poDate: new Date().toISOString().split('T')[0],
    customerId: initialCustomerId || '',
    customerName: '',
    consignee: '',
  });

  const [existingPO, setExistingPO] = useState<ExistingPOInfo | null>(null);
  const [isCheckingPO, setIsCheckingPO] = useState(false);

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
  const { data: dbCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers() as unknown as Promise<any[]>
  });

  const [localCustomers, setLocalCustomers] = useState<any[]>([]);

  useEffect(() => {
    if (dbCustomers.length > 0) {
      setLocalCustomers(dbCustomers);
    }
  }, [dbCustomers]);

  // Fetch Products
  const { data: dbProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const data = await getProducts() as any[];
      return data.map((product: any) => ({ 
        ...product, 
        name: product.itemName || product.name,
        size: `${product.length || ''}x${product.width || ''}x${product.height || ''}`.trim()
      }));
    }
  });

  const [localProducts, setLocalProducts] = useState<any[]>([]);

  useEffect(() => {
    if (dbProducts.length > 0) {
      setLocalProducts(dbProducts);
    }
  }, [dbProducts]);

  // Check if PO exists when poNo changes
  useEffect(() => {
    const trimmed = commonData.poNo.trim();
    if (!trimmed) {
      setExistingPO(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingPO(true);
      try {
        const info = await getExistingPOInfo(trimmed);
        if (info?.exists) {
          setExistingPO(info);
          setCommonData(prev => ({
            ...prev,
            customerId: prev.customerId || info.customerId || '',
            customerName: prev.customerName || info.customerName || '',
            poDate: info.poDate ? info.poDate.split('T')[0] : prev.poDate,
            consignee: prev.consignee || info.consignee || ''
          }));
        } else {
          setExistingPO(null);
        }
      } catch (err) {
        console.error('Error checking existing PO:', err);
      } finally {
        setIsCheckingPO(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [commonData.poNo]);

  const handleCustomerCreated = (newCust: any) => {
    setLocalCustomers(prev => [newCust, ...prev]);
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const handleProductCreated = (newProd: any) => {
    setLocalProducts(prev => [newProd, ...prev]);
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const handleSelectCustomer = (customerId: string, customerName?: string) => {
    const cust = localCustomers.find(c => c.id === customerId || c.name === customerId);
    const resolvedName = customerName || cust?.name || '';
    setCommonData(prev => ({
      ...prev,
      customerId,
      customerName: resolvedName
    }));
    if (errors.customerId) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.customerId;
        return next;
      });
    }
  };

  // Returns the new item's id so callers can focus it
  const handleAddItem = useCallback((): string => {
    const newId = Math.random().toString(36).substring(7);
    setItems(prev => [...prev, { id: newId, productId: '', rate: '', orderQty: '', deliveryDate: commonData.poDate || '' }]);
    return newId;
  }, [commonData.poDate]);

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

  const handleItemChange = (id: string, field: keyof POItem, value: string, productObj?: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // If selecting a product, pre-fill rate if available and rate is currently empty
        if (field === 'productId' && productObj) {
          if (productObj.actualCosting && !item.rate) {
            updated.rate = String(productObj.actualCosting);
          } else if (productObj.rate && !item.rate) {
            updated.rate = String(productObj.rate);
          }
        }
        return updated;
      }
      return item;
    }));

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
      const customer = localCustomers.find(c => c.id === commonData.customerId || c.name === commonData.customerId);
      const customerName = customer?.name || commonData.customerName || commonData.customerId;
      const customerId = customer?.id || commonData.customerId;

      const purchaseOrdersToCreate: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[] = [];

      for (const item of items) {
        const product = localProducts.find(p => p.id === item.productId);
        if (!product) continue;

        const rate = Number(item.rate);
        const opnQty = Number(item.orderQty);
        const inQty = 0;
        const outQty = 0;

        purchaseOrdersToCreate.push({
          poNo: commonData.poNo.trim(),
          poDate: commonData.poDate,
          deliveryDate: item.deliveryDate,
          customerId: customerId,
          customerName: customerName,
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
      const oldPOs = await getPendingPOsForCustomerAndProducts(customerId, productIds);

      // Exclude the current PO itself so we don't ask to NIL the PO we are appending items to
      const filteredOldPOs = oldPOs.filter(p => p.poNo?.trim() !== commonData.poNo.trim());

      if (filteredOldPOs.length > 0) {
        setPendingOldPOs(filteredOldPOs);
        setValidatedDataToSave(purchaseOrdersToCreate);
        setShowConfirmNil(true);
        setIsSubmitting(false);
        return;
      }

      await proceedWithSave(purchaseOrdersToCreate, false);

    } catch (error: any) {
      console.error("Error saving PO:", error);
      setErrors({ general: `A critical database error occurred: ${error?.message || ''}` });
      setIsSubmitting(false);
    }
  };

  const proceedWithSave = async (poToCreate: any[], shouldNilOld: boolean) => {
    setIsSubmitting(true);
    try {
      if (shouldNilOld && pendingOldPOs.length > 0) {
        await bulkCloseCustomerPOs(
          pendingOldPOs.map(p => p.id!), 
          user?.name || 'System',
          {
            date: commonData.poDate || new Date().toISOString().split('T')[0],
            remarks: `NIL Old POs before creating new PO ${commonData.poNo}`
          }
        );
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
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] border border-border overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Create Purchase Order (Bulk Add)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Smart auto-search customer & items with inline auto-creation
              </p>
            </div>
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
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {errors.general && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-800 rounded-xl text-sm font-semibold flex items-center">
               {errors.general}
            </div>
          )}

          <form id="add-po-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Common Details Card */}
            <div className="bg-muted/20 p-5 rounded-2xl border border-border space-y-4">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border pb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                PO Common Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* PO Number */}
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    PO No. <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="e.g. PO-55000089"
                      className={cn(
                        "w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground transition-colors font-bold",
                        errors.poNo ? "border-red-500 ring-1 ring-red-500/20" : "border-input focus:ring-primary/20"
                      )}
                      value={commonData.poNo}
                      onChange={e => {
                        setCommonData({...commonData, poNo: e.target.value});
                        if (errors.poNo) setErrors({...errors, poNo: ''});
                      }}
                    />
                    {isCheckingPO && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-3 text-muted-foreground" />
                    )}
                  </div>
                  {errors.poNo && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.poNo}</p>}
                </div>
                
                {/* Smart Searchable Customer Select */}
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <SearchableCustomerSelect
                    value={commonData.customerId}
                    onChange={handleSelectCustomer}
                    customers={localCustomers}
                    hasError={!!errors.customerId}
                    onCustomerCreated={handleCustomerCreated}
                  />
                  {errors.customerId && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.customerId}</p>}
                </div>

                {/* PO Date */}
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    PO Date <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="date" 
                    className={cn(
                      "w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground transition-colors font-medium",
                      errors.poDate ? "border-red-500 ring-1 ring-red-500/20" : "border-input focus:ring-primary/20"
                    )}
                    value={commonData.poDate}
                    onChange={e => {
                      setCommonData({...commonData, poDate: e.target.value});
                      if (errors.poDate) setErrors({...errors, poDate: ''});
                    }}
                  />
                  {errors.poDate && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.poDate}</p>}
                </div>
                
                {/* Consignee */}
                <div className="md:col-span-1">
                   <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                     Consignee (Optional)
                   </label>
                   <input 
                     type="text" 
                     placeholder="Enter consignee / destination"
                     className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground transition-colors"
                     value={commonData.consignee}
                     onChange={e => setCommonData({...commonData, consignee: e.target.value})}
                   />
                </div>
              </div>

              {existingPO?.exists && (
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5 animate-fade-in">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-blue-950 dark:text-blue-100">
                      Existing PO Found ({existingPO.customerName}) — {existingPO.items.length} item{existingPO.items.length > 1 ? 's' : ''} already in this PO
                    </p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                      Any new item(s) you enter below will be seamlessly <strong>added to this existing PO</strong> without overwriting previous items.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    PO Line Items ({items.length})
                  </h3>
                  {commonData.customerName && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                      Filtering for: {commonData.customerName}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                </button>
              </div>

              <div className="bg-card border border-border rounded-2xl overflow-visible shadow-2xs">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-secondary/70 text-muted-foreground uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">#</th>
                      <th className="px-3 py-2.5 min-w-[280px]">Item Name <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2.5 w-32 text-right">Rate (₹) <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2.5 w-32 text-right">Order Qty <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2.5 w-36">Delivery Date <span className="text-red-500">*</span></th>
                      <th className="px-3 py-2.5 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                     {items.map((item, index) => (
                      <React.Fragment key={item.id}>
                       <tr className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 text-center font-bold text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2" style={{ overflow: 'visible', position: 'relative' }}>
                          <SearchableProductSelect
                            value={item.productId}
                            onChange={(val, prod) => handleItemChange(item.id, 'productId', val, prod)}
                            products={localProducts}
                            selectedCustomerId={commonData.customerId}
                            selectedCustomerName={commonData.customerName}
                            hasError={!!errors[`productId-${item.id}`]}
                            triggerDataId={item.id}
                            onProductCreated={handleProductCreated}
                          />
                          {errors[`productId-${item.id}`] && <span className="text-red-500 text-[10px] font-bold block mt-0.5">{errors[`productId-${item.id}`]}</span>}
                        </td>
                        <td className="px-3 py-2">
                           <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className={cn(
                              "w-full px-2.5 py-1.5 text-sm rounded-lg border bg-background text-foreground transition-colors font-bold text-right",
                              errors[`rate-${item.id}`] ? "border-red-500 ring-1 ring-red-500/20" : "border-input focus:ring-primary/20"
                            )}
                            value={item.rate}
                            onChange={e => handleItemChange(item.id, 'rate', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                           <input 
                            type="number" 
                            min="1"
                            placeholder="0"
                            ref={el => { qtyRefs.current[item.id] = el; }}
                            className={cn(
                              "w-full px-2.5 py-1.5 text-sm rounded-lg border bg-background text-foreground transition-colors font-bold text-right text-primary",
                              errors[`orderQty-${item.id}`] ? "border-red-500 ring-1 ring-red-500/20" : "border-input focus:ring-primary/20"
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
                              "w-full px-2.5 py-1.5 text-sm rounded-lg border bg-background text-foreground transition-colors font-medium",
                              errors[`deliveryDate-${item.id}`] ? "border-red-500 ring-1 ring-red-500/20" : "border-input focus:ring-primary/20"
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
                            className="text-muted-foreground hover:text-red-600 disabled:opacity-20 disabled:cursor-not-allowed p-1 transition-colors rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {/* RM Shortage Panel */}
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
        <div className="p-5 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 bg-secondary border border-border rounded font-mono text-[10px]">Enter</kbd> in Qty field to auto-add next line item
          </div>
          <div className="flex gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50 border border-border"
            >
              Cancel
            </button>
            <button 
              form="add-po-form"
              type="submit" 
              disabled={isSubmitting}
              className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving PO...</>
              ) : existingPO?.exists ? (
                <><Plus className="w-4 h-4" /> Add {items.length} {items.length === 1 ? 'Item' : 'Items'} to PO {commonData.poNo}</>
              ) : (
                <><Plus className="w-4 h-4" /> Save PO with {items.length} {items.length === 1 ? 'Item' : 'Items'}</>
              )}
            </button>
          </div>
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
                <div key={po.id} className="mb-3 p-3 bg-muted/30 rounded-xl border border-border">
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
                className="px-4 py-2 bg-secondary text-secondary-foreground font-bold rounded-xl hover:bg-secondary/80 transition-colors"
                disabled={isSubmitting}
              >
                No, Keep Them Open
              </button>
              <button 
                onClick={() => { setShowConfirmNil(false); proceedWithSave(validatedDataToSave, true); }}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl shadow hover:bg-red-700 transition-colors"
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

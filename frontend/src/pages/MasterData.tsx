import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users, Package, X, CircleDashed, ChevronDown, ChevronUp, Trash2, Edit, FilterX } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { cn, getCustomerDisplayLabel } from '../lib/utils';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, checkCustomerUsage, migrateCustomer } from '../lib/supabase/customerService';
import { getProducts, createProduct, updateProduct, deleteProduct, checkProductUsage, migrateProduct, bulkUpdateProductCustomers } from '../lib/supabase/productService';
import { getFinishGoods } from '../lib/supabase/finishGoodService';
import type { Customer, Product, ProductLayer } from '../lib/types/models';
import { useAuth } from '../contexts/AuthContext';
import RoleGuard from '../components/RoleGuard';
import ExportButtons from '../components/ExportButtons';
import { AddTradingItemModal } from './finish-goods/AddTradingItemModal';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MasterData() {
  const [tab, setTab] = useState<'customers' | 'products'>('customers');
  const [search, setSearch] = useState('');
  
  // Smart Filters State
  const [filterReelSize, setFilterReelSize] = useState('');
  const [filterBF, setFilterBF] = useState('');
  const [filterGSM, setFilterGSM] = useState('');
  const [filterFlute, setFilterFlute] = useState('');
  const [filterCutSize, setFilterCutSize] = useState('');

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal,  setShowProductModal]  = useState(false);
  const [showTradingModal,  setShowTradingModal]  = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Dependency/Migration State
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);
  const [dependencyData, setDependencyData] = useState<{
    entity: Customer | Product;
    type: 'customer' | 'product';
    usage: any;
  } | null>(null);

  // Bulk Selection State
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkActionCustomer, setBulkActionCustomer] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const qc = useQueryClient();
  const { data: customers = [], isLoading: loadingC } = useQuery({ 
    queryKey: ['customers'], 
    queryFn: () => getCustomers() as unknown as Promise<Customer[]> 
  });
  const { data: products  = [], isLoading: loadingP } = useQuery({ 
    queryKey: ['products'],  
    queryFn: () => getProducts() as unknown as Promise<Product[]>  
  });
  const { data: finishGoods = [] } = useQuery({ 
    queryKey: ['finish_goods'], 
    queryFn: () => getFinishGoods() as unknown as Promise<any[]> 
  });
  
  const { user } = useAuth();
  const canDelete = user?.email === 'admin@packwell.com' || user?.email === 'packwell@packwell.com';
  const showCosting = user?.email === 'admin@packwell.com' || user?.email === 'packwell@packwell.com';

  const handleDeleteCustomer = async (customer: Customer) => {
    setIsCheckingUsage(true);
    try {
      const usage = await checkCustomerUsage(customer.id!);
      setIsCheckingUsage(false);
      
      if (usage.total > 0) {
        setDependencyData({ entity: customer, type: 'customer', usage });
        return;
      }
      
      if (!confirm(`Are you sure you want to delete the customer "${customer.name}"?`)) return;
      await deleteCustomer(customer.id!, user?.name);
      qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (err: any) {
      setIsCheckingUsage(false);
      alert(err.message || 'Failed to check or delete customer');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    setIsCheckingUsage(true);
    try {
      const usage = await checkProductUsage(product.id!);
      setIsCheckingUsage(false);
      
      if (usage.total > 0) {
        setDependencyData({ entity: product, type: 'product', usage });
        return;
      }
      
      if (!confirm(`Are you sure you want to delete the product "${product.itemName}"?`)) return;
      await deleteProduct(product.id!, user?.name);
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err: any) {
      setIsCheckingUsage(false);
      alert(err.message || 'Failed to check or delete product');
    }
  };

  // Derived Filtering
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [customers, search]);

  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => {
      // General Search
      const searchMatch = p.itemName.toLowerCase().includes(search.toLowerCase()) ||
                          p.artworkNo.toLowerCase().includes(search.toLowerCase()) ||
                          p.customerName.toLowerCase().includes(search.toLowerCase());
      
      // Smart Filters
      const matchReelSize = filterReelSize ? p.reelSize === Number(filterReelSize) : true;
      const matchCutSize = filterCutSize ? p.cutSize === Number(filterCutSize) : true;
      const matchFlute = filterFlute ? p.flute === filterFlute : true;
      
      // BF and GSM can be on ANY layer
      const matchBF = filterBF ? p.layers.some(l => String(l.bf) === filterBF) : true;
      const matchGSM = filterGSM ? p.layers.some(l => String(l.gsm) === filterGSM) : true;

      return searchMatch && matchReelSize && matchCutSize && matchFlute && matchBF && matchGSM;
    });

    const enriched = filtered.map(p => {
      // Find the corresponding finish good to get the latest rate
      const fg = finishGoods.find(fg => fg.productId === p.id);
      const customerRate = fg?.rate ? Number(fg.rate) : 0;
      const actualCosting = p.actualCosting ? Number(p.actualCosting) : 0;
      const difference = actualCosting - customerRate;
      return { ...p, customerRate, difference };
    });

    enriched.sort((a, b) => {
      // 1. Negative differences first
      const aNeg = a.difference < 0;
      const bNeg = b.difference < 0;
      if (aNeg && !bNeg) return -1;
      if (!aNeg && bNeg) return 1;

      // 2. Customer Name
      const custDiff = a.customerName.localeCompare(b.customerName);
      if (custDiff !== 0) return custDiff;

      // 3. Item Name
      return a.itemName.localeCompare(b.itemName);
    });

    return enriched;
  }, [products, finishGoods, search, filterReelSize, filterBF, filterGSM, filterFlute, filterCutSize]);

  // Unique values for filter dropdowns
  const uniqueReelSizes = Array.from(new Set(products.map(p => p.reelSize))).sort((a,b)=>a-b);
  const uniqueCutSizes = Array.from(new Set(products.map(p => p.cutSize))).sort((a,b)=>a-b);
  const uniqueFlutes = Array.from(new Set(products.map(p => p.flute).filter(Boolean)));
  const uniqueBFs = Array.from(new Set(products.flatMap(p => p.layers.map(l => l.bf)).filter(Boolean)));
  const uniqueGSMs = Array.from(new Set(products.flatMap(p => p.layers.map(l => l.gsm)).filter(Boolean))).sort((a,b)=>Number(a)-Number(b));

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowCustomerModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id!)));
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkActionCustomer) return;
    if (selectedProducts.size === 0) return;
    if (!confirm(`Are you sure you want to reassign ${selectedProducts.size} product(s) to the new customer? This will also update any connected history.`)) return;

    const targetCustomer = customers.find(c => c.id === bulkActionCustomer);
    if (!targetCustomer) return;

    setIsBulkUpdating(true);
    try {
      await bulkUpdateProductCustomers(Array.from(selectedProducts), { id: targetCustomer.id!, name: targetCustomer.name }, user?.name);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['job_cards'] });
      qc.invalidateQueries({ queryKey: ['purchase_orders'] });
      setSelectedProducts(new Set());
      setBulkActionCustomer('');
      alert(`Successfully updated ${selectedProducts.size} product(s)!`);
    } catch (err: any) {
      alert(err.message || 'Failed to bulk update products');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header & Summary Cards */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Master Data</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage customers and products</p>
        </div>
        <div className="flex gap-4">
          <div 
            onClick={() => { setTab('customers'); setSearch(''); setSelectedProducts(new Set()); }}
            className={cn(
              "px-4 py-3 rounded-lg flex flex-col items-center min-w-[140px] shadow-sm cursor-pointer transition-all hover:scale-105",
              tab === 'customers' 
                ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/20" 
                : "bg-primary/5 border border-primary/20 opacity-70 hover:opacity-100"
            )}
          >
            <span className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Total Customers</span>
            <span className="text-2xl font-extrabold text-primary leading-none">{customers.length}</span>
          </div>
          <div 
            onClick={() => { setTab('products'); setSearch(''); setSelectedProducts(new Set()); }}
            className={cn(
              "px-4 py-3 rounded-lg flex flex-col items-center min-w-[140px] shadow-sm cursor-pointer transition-all hover:scale-105",
              tab === 'products' 
                ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/20" 
                : "bg-primary/5 border border-primary/20 opacity-70 hover:opacity-100"
            )}
          >
            <span className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Total Products</span>
            <span className="text-2xl font-extrabold text-primary leading-none">{products.length}</span>
          </div>
        </div>
      </div>

      {/* Removed Redundant Tabs Row */}

      {/* Table Card */}
      <div className="flex-1 bg-card border border-border shadow-sm rounded-lg overflow-hidden flex flex-col">
        
        {/* Top Controls */}
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
            
            <div className="flex gap-4 items-center w-full max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={tab === 'customers' ? 'Search customers...' : 'Search products by name or artwork...'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              
              {/* Customer Filter (Phase 19.2) for Products */}
              {tab === 'products' && (
                <div className="flex-1 flex gap-4 items-center">
                  <select 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="px-3 py-2 w-full text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- All Customers --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{getCustomerDisplayLabel(c, customers)}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <ExportButtons 
                data={tab === 'customers' ? filteredCustomers : filteredProducts.map(p => ({
                  ...p,
                  paper: (p as any).paper || (p.layers ? p.layers.length : '')
                }))} 
                filenamePrefix={tab === 'customers' ? 'Customers' : 'Products'}
                title={tab === 'customers' ? 'Customer Directory' : 'Product Master'}
                columnMap={tab === 'customers' ? {
                  'name': 'Customer Name',
                  'createdAt': 'Added On'
                } : {
                  'customerName': 'Customer Name',
                  'itemName': 'Item Name',
                  'artworkNo': 'Artwork No',
                  'reelSize': 'Reel Size',
                  'cutSize': 'Cut Size',
                  'paper': 'Paper',
                  'ply': 'Ply',
                  'flute': 'Flute'
                }}
              />
              {tab === 'customers' ? (
                <RoleGuard requireRole="ADMIN">
                  <button
                    onClick={() => {
                      setEditingCustomer(null);
                      setShowCustomerModal(true);
                    }}
                    className="bg-primary text-primary-foreground px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Customer
                  </button>
                </RoleGuard>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowTradingModal(true);
                    }}
                    className="bg-secondary text-secondary-foreground border border-border px-4 py-2 flex items-center text-sm font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Trading Item
                  </button>
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setShowProductModal(true);
                    }}
                    className="bg-primary text-primary-foreground px-4 py-2 flex items-center text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Product
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Customer Specific Product Count (Phase 19.2) */}
          {tab === 'products' && search && customers.some(c => c.name.toLowerCase() === search.toLowerCase()) && (
            <div className="bg-secondary/30 px-4 py-3 rounded-md border border-border flex gap-8 items-center max-w-fit shadow-sm">
               <div>
                 <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-0.5">Selected Customer</span>
                 <span className="font-extrabold text-foreground text-sm">{search}</span>
               </div>
               <div className="bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-md flex flex-col items-center justify-center">
                 <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Found</span>
                 <span className="font-extrabold text-primary text-lg leading-none">{filteredProducts.length}</span>
               </div>
            </div>
          )}

          {/* Smart Filters (Products Only) */}
          {tab === 'products' && (
            <div className="flex flex-wrap gap-3 items-center bg-secondary/30 p-3 rounded-lg border border-border/50">
              <span className="text-xs font-semibold uppercase text-muted-foreground mr-1">Smart Filters:</span>
              
              <select className="text-sm rounded border border-input bg-background px-2 py-1.5 focus:ring-1 focus:ring-ring" 
                      value={filterReelSize} onChange={e => setFilterReelSize(e.target.value)}>
                <option value="">All Reel Sizes</option>
                {uniqueReelSizes.map(v => <option key={v} value={v}>{v}"</option>)}
              </select>

              <select className="text-sm rounded border border-input bg-background px-2 py-1.5 focus:ring-1 focus:ring-ring" 
                      value={filterCutSize} onChange={e => setFilterCutSize(e.target.value)}>
                <option value="">All Cut Sizes</option>
                {uniqueCutSizes.map(v => <option key={v} value={v}>{v}"</option>)}
              </select>

              <select className="text-sm rounded border border-input bg-background px-2 py-1.5 focus:ring-1 focus:ring-ring" 
                      value={filterBF} onChange={e => setFilterBF(e.target.value)}>
                <option value="">All BF</option>
                {uniqueBFs.map(v => <option key={v} value={v}>{v} BF</option>)}
              </select>

              <select className="text-sm rounded border border-input bg-background px-2 py-1.5 focus:ring-1 focus:ring-ring" 
                      value={filterGSM} onChange={e => setFilterGSM(e.target.value)}>
                <option value="">All GSM</option>
                {uniqueGSMs.map(v => <option key={v} value={v}>{v} GSM</option>)}
              </select>

              <select className="text-sm rounded border border-input bg-background px-2 py-1.5 focus:ring-1 focus:ring-ring" 
                      value={filterFlute} onChange={e => setFilterFlute(e.target.value)}>
                <option value="">All Flutes</option>
                {uniqueFlutes.map(v => <option key={v} value={v}>{v}</option>)}
              </select>

              {(filterReelSize || filterBF || filterGSM || filterFlute || filterCutSize) && (
                <button 
                  onClick={() => { setFilterReelSize(''); setFilterBF(''); setFilterGSM(''); setFilterFlute(''); setFilterCutSize(''); }}
                  className="ml-auto flex items-center text-xs text-destructive hover:bg-destructive/10 px-2 py-1.5 rounded transition-colors"
                >
                  <FilterX className="w-3.5 h-3.5 mr-1" /> Clear Filters
                </button>
              )}
            </div>
          )}

          {/* Bulk Actions Bar */}
          {tab === 'products' && selectedProducts.size > 0 && (
            <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 flex items-center justify-between gap-4">
              <div className="text-sm font-semibold text-primary">
                {selectedProducts.size} Product(s) Selected
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={bulkActionCustomer}
                  onChange={e => setBulkActionCustomer(e.target.value)}
                  className="text-sm rounded-md border border-input px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring min-w-[200px]"
                >
                  <option value="">-- Select New Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id!}>{getCustomerDisplayLabel(c, customers)}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkUpdate}
                  disabled={!bulkActionCustomer || isBulkUpdating}
                  className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isBulkUpdating ? 'Updating...' : 'Apply to Selected'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {tab === 'customers' ? (
            <CustomersTable data={filteredCustomers} isLoading={loadingC} onEdit={handleEditCustomer} onDelete={canDelete ? handleDeleteCustomer : undefined} />
          ) : (
            <ProductsTable 
              data={filteredProducts} 
              isLoading={loadingP} 
              onEdit={handleEditProduct} 
              onDelete={canDelete ? handleDeleteProduct : undefined}
              selectedProducts={selectedProducts}
              onToggleSelect={toggleProductSelection}
              onToggleSelectAll={toggleSelectAll}
              showCosting={showCosting}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCustomerModal && (
        <CustomerModal
          customer={editingCustomer}
          customers={customers}
          onClose={() => { setShowCustomerModal(false); setEditingCustomer(null); }}
          onSuccess={() => { setShowCustomerModal(false); setEditingCustomer(null); qc.invalidateQueries({ queryKey: ['customers'] }); }}
        />
      )}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          customers={customers}
          onClose={() => { setShowProductModal(false); setEditingProduct(null); }}
          onSuccess={() => { setShowProductModal(false); setEditingProduct(null); qc.invalidateQueries({ queryKey: ['products'] }); }}
        />
      )}
      {showTradingModal && (
        <AddTradingItemModal
          onClose={() => setShowTradingModal(false)}
          onSuccess={() => { setShowTradingModal(false); qc.invalidateQueries({ queryKey: ['products'] }); }}
        />
      )}
      {dependencyData && (
        <DependencyModal
          data={dependencyData}
          customers={customers}
          products={products}
          onClose={() => setDependencyData(null)}
          onSuccess={() => {
            setDependencyData(null);
            qc.invalidateQueries({ queryKey: ['customers'] });
            qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
      {isCheckingUsage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
           <div className="bg-card p-6 rounded-lg shadow-xl flex items-center gap-3">
             <CircleDashed className="w-6 h-6 animate-spin text-primary" />
             <span className="font-medium">Checking usages...</span>
           </div>
        </div>
      )}
    </div>
  );
}

// ─── Customers Table ──────────────────────────────────────────────────────────
function CustomersTable({ data, isLoading, onEdit, onDelete }: { data: Customer[]; isLoading: boolean, onEdit: (c: Customer) => void, onDelete?: (c: Customer) => void }) {
  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
        <tr>
          <th className="px-6 py-3 font-medium">#</th>
          <th className="px-6 py-3 font-medium">Customer Name</th>
          <th className="px-6 py-3 font-medium">Created At</th>
          <th className="px-6 py-3 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {data.map((c, i) => (
          <tr key={c.id} className="hover:bg-muted/50 transition-colors group">
            <td className="px-6 py-4 text-muted-foreground">{i + 1}</td>
            <td className="px-6 py-4 font-semibold text-foreground">{c.name}</td>
            <td className="px-6 py-4 text-muted-foreground">
              {c.createdAt ? new Date(c.createdAt?.toDate ? c.createdAt.toDate() : c.createdAt).toLocaleDateString('en-IN') : 'N/A'}
            </td>
            <td className="px-6 py-4 text-right flex justify-end gap-2">
              <RoleGuard requireRole="ADMIN">
                <button onClick={() => onEdit(c)} className="text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Edit">
                  <Edit className="w-4 h-4" />
                </button>
              </RoleGuard>
              {onDelete && (
                <button onClick={() => onDelete(c)} className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </td>
          </tr>
        ))}
        {data.length === 0 && (
          <tr>
            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto text-muted mb-3" />
              <p>No customers found.</p>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ─── Products Table ───────────────────────────────────────────────────────────
function ProductsTable({ 
  data, isLoading, onEdit, onDelete,
  selectedProducts, onToggleSelect, onToggleSelectAll, showCosting
}: { 
  data: any[]; isLoading: boolean, onEdit: (p: Product) => void, onDelete?: (p: Product) => void,
  selectedProducts?: Set<string>, onToggleSelect?: (id: string) => void, onToggleSelectAll?: () => void, showCosting?: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  
  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border sticky top-0 z-10">
        <tr>
          {selectedProducts && (
            <th className="px-4 py-3 font-medium w-10">
              <input 
                type="checkbox" 
                className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                checked={data.length > 0 && selectedProducts.size === data.length}
                onChange={onToggleSelectAll}
              />
            </th>
          )}
          <th className="px-6 py-3 font-medium">Artwork No</th>
          <th className="px-6 py-3 font-medium">Item Name</th>
          <th className="px-6 py-3 font-medium">Customer</th>
          <th className="px-6 py-3 font-medium">Size (L×W×H)</th>
          <th className="px-6 py-3 font-medium">Ply / Flute</th>
          <th className="px-6 py-3 font-medium">Reel / Cut</th>
          {showCosting && (
            <>
              <th className="px-6 py-3 font-medium">Actual Costing</th>
              <th className="px-6 py-3 font-medium">Customer Rate</th>
              <th className="px-6 py-3 font-medium">Difference</th>
            </>
          )}
          <th className="px-6 py-3 font-medium">Details</th>
          <th className="px-6 py-3 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {data.map((p: any) => (
          <React.Fragment key={p.id}>
            <tr className={cn("transition-colors group", selectedProducts?.has(p.id!) ? "bg-primary/5" : "hover:bg-muted/50")}>
              {selectedProducts && (
                <td className="px-4 py-4">
                  <input 
                    type="checkbox" 
                    className="rounded border-input text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    checked={selectedProducts.has(p.id!)}
                    onChange={() => onToggleSelect && onToggleSelect(p.id!)}
                  />
                </td>
              )}
              <td className="px-6 py-4 font-bold text-primary">{p.artworkNo}</td>
              <td className="px-6 py-4 font-semibold text-foreground">{p.itemName}</td>
              <td className="px-6 py-4 text-muted-foreground">{p.customerName}</td>
              <td className="px-6 py-4">{p.length}×{p.width}×{p.height}</td>
              <td className="px-6 py-4">{p.ply} Ply {p.flute ? `/ ${p.flute}` : ''}</td>
              <td className="px-6 py-4">{p.reelSize}" / {p.cutSize}"</td>
              {showCosting && (
                <>
                  <td className="px-6 py-4 font-medium">₹{Number(p.actualCosting || 0).toFixed(3)}</td>
                  <td className="px-6 py-4 font-medium">₹{Number(p.customerRate || 0).toFixed(3)}</td>
                  <td className={cn("px-6 py-4 font-bold", p.difference < 0 ? "text-destructive" : p.difference > 0 ? "text-green-600 dark:text-green-400" : "")}>
                    {p.difference > 0 ? '+' : ''}₹{Number(p.difference || 0).toFixed(3)}
                  </td>
                </>
              )}
              <td className="px-6 py-4">
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id!)}
                  className="flex items-center text-xs text-primary hover:underline"
                >
                  {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="ml-1">Layers ({p.layers?.length || 0})</span>
                </button>
              </td>
              <td className="px-6 py-4 text-right flex justify-end gap-2">
                <RoleGuard requireRole="ADMIN">
                  <button onClick={() => onEdit(p)} className="text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Edit">
                    <Edit className="w-4 h-4" />
                  </button>
                </RoleGuard>
                {onDelete && (
                  <button onClick={() => onDelete(p)} className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </td>
            </tr>
            {expanded === p.id && p.layers?.length > 0 && (
              <tr>
                <td colSpan={selectedProducts ? (showCosting ? 12 : 9) : (showCosting ? 11 : 8)} className="px-6 py-3 bg-secondary/30 border-b border-border/50 shadow-inner">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Paper Layers</div>
                      <div className="flex gap-3 flex-wrap">
                        {p.layers.map((l: any, i: number) => (
                          <div key={i} className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-sm">
                            <span className="font-semibold text-foreground">{l.layerName}</span>
                            {l.paperType && <span className="ml-2 text-muted-foreground">{l.paperType}</span>}
                            {l.bf && <span className="ml-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">BF: {l.bf}</span>}
                            {l.gsm && <span className="ml-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">GSM: {l.gsm}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {(p.specialRequirement || p.packing) && (
                      <div className="w-64 border-l border-border/50 pl-4">
                        {p.packing && <div className="text-xs mb-1"><span className="font-semibold text-muted-foreground">Packing:</span> {p.packing}</div>}
                        {p.specialRequirement && <div className="text-xs"><span className="font-semibold text-muted-foreground">Special:</span> {p.specialRequirement}</div>}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
        {data.length === 0 && (
          <tr>
            <td colSpan={selectedProducts ? (showCosting ? 12 : 9) : (showCosting ? 11 : 8)} className="px-6 py-12 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto text-muted mb-3" />
              <p>No products found matching filters.</p>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ─── Customer Modal ───────────────────────────────────────────────────────────
function CustomerModal({ customer, customers, onClose, onSuccess }: { customer: Customer | null; customers: Customer[]; onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string }>({
    defaultValues: customer ? { name: customer.name } : {}
  });

  const onSubmit = async (data: { name: string }) => {
    try {
      // Adding a new customer: warn (but don't block) if the same name already exists,
      // so we never silently create another accidental duplicate.
      if (!customer?.id) {
        const normalized = data.name.trim().toLowerCase();
        const existing = customers.filter(c => (c.name || '').trim().toLowerCase() === normalized);
        if (existing.length > 0) {
          const proceed = confirm(
            `A customer named "${data.name.trim()}" already exists (${existing.length} record${existing.length > 1 ? 's' : ''} found).\n\n` +
            `Create another customer with this same name anyway?`
          );
          if (!proceed) return;
        }
      }

      if (customer?.id) {
        await updateCustomer(customer.id, data.name, user?.name);
      } else {
        await createCustomer(data.name, user?.name);
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save customer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-md rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground flex items-center">
            <Users className="w-5 h-5 mr-2 text-primary" /> {customer ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Customer Name <span className="text-destructive">*</span></label>
            <input
              {...register('name', { required: 'Name is required' })}
              className="w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Shakti Foods Ltd."
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center">
              {isSubmitting && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
              {customer ? 'Update' : 'Save'} Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Product Modal ─────────────────────────────────────────────────────────────
type ProductForm = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isArchived'>;

function ProductModal({ product, customers, onClose, onSuccess }: { product: Product | null; customers: Customer[]; onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting } } = useForm<ProductForm>({
    defaultValues: product ? { ...product } : { ply: 3, ups: 1, pinQty: 0, layers: [] }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'layers' });

  const plyValue = Number(watch('ply') || 0);

  React.useEffect(() => {
    if (plyValue) {
      const currentLayers = fields.length;
      if (plyValue > currentLayers) {
        const layersToAdd = [];
        for (let i = currentLayers; i < plyValue; i++) {
          let type = 'Liner';
          if (i % 2 !== 0) type = 'Fluting Medium';
          else if (i === 0) type = 'Top Liner';
          else if (i === plyValue - 1) type = 'Bottom Liner';
          else if (plyValue === 5 && i === 2) type = 'Centre Liner';
          
          const defaultPaper = i % 2 === 0 ? 'VK' : 'SK'; // Liners (Even index) get VK, Flutes (Odd index) get SK
          layersToAdd.push({ layerName: type, paperType: defaultPaper, bf: '', gsm: 0 });
        }
        append(layersToAdd);
      } else if (plyValue < currentLayers) {
        const indexesToRemove = [];
        for (let i = currentLayers - 1; i >= plyValue; i--) {
          indexesToRemove.push(i);
        }
        remove(indexesToRemove);
      }
    }
  }, [plyValue]); // intentionally omitting fields.length to avoid infinite loop on mount

  const onSubmit = async (data: ProductForm) => {
    try {
      // Find customer name to denormalize
      const customer = customers.find(c => c.id === data.customerId);
      if (!customer) throw new Error("Customer not found");

      const enrichedData = {
        ...data,
        customerName: customer.name,
        length: Number(data.length), width: Number(data.width), height: Number(data.height),
        ply: Number(data.ply), reelSize: Number(data.reelSize), cutSize: Number(data.cutSize),
        pinQty: Number(data.pinQty), ups: Number(data.ups),
        actualCosting: data.actualCosting ? Number(data.actualCosting) : undefined,
        layers: data.layers.map(l => ({ ...l, gsm: l.gsm ? Number(l.gsm) : undefined }))
      };

      if (product?.id) {
        await updateProduct(product.id, enrichedData, user?.name);
      } else {
        await createProduct(enrichedData, user?.name);
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save product');
    }
  };

  const inputCls = "w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring";
  const labelCls = "text-sm font-medium text-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-auto">
      <div className="bg-card w-full max-w-4xl rounded-xl shadow-2xl my-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground flex items-center">
            <Package className="w-5 h-5 mr-2 text-primary" /> {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">

            {/* Basic Info */}
            <div className="bg-secondary/20 p-5 rounded-xl border border-border/50">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4 flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Basic Information</h3>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className={labelCls}>Artwork No <span className="text-destructive">*</span></label>
                  <input {...register('artworkNo', { required: true })} className={inputCls} placeholder="e.g. ART-001" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Item Name <span className="text-destructive">*</span></label>
                  <input {...register('itemName', { required: true })} className={inputCls} placeholder="e.g. 5 Ply Printed Box" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Customer <span className="text-destructive">*</span></label>
                  <select {...register('customerId', { required: true })} className={inputCls}>
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.id!}>{getCustomerDisplayLabel(c, customers)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Actual Costing (₹)</label>
                  <input type="number" step="0.01" {...register('actualCosting')} className={inputCls} placeholder="e.g. 15.50" />
                </div>
              </div>
            </div>

            {/* Dimensions & Specs */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Dimensions (mm)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><label className={labelCls}>Length *</label><input type="number" step="0.01" {...register('length', { required: true })} className={inputCls} placeholder="0" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Width *</label><input type="number" step="0.01" {...register('width', { required: true })} className={inputCls} placeholder="0" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Height *</label><input type="number" step="0.01" {...register('height', { required: true })} className={inputCls} placeholder="0" /></div>
                </div>
              </div>
              <div className="space-y-4">
                 <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Reel / Cut</h3>
                 <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className={labelCls}>Reel Size (in) *</label><input type="number" step="0.1" {...register('reelSize', { required: true })} className={inputCls} placeholder="0" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Cut Size (in) *</label><input type="number" step="0.1" {...register('cutSize', { required: true })} className={inputCls} placeholder="0" /></div>
                 </div>
              </div>
            </div>

            {/* Structure & Finishing */}
            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Structure</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Ply *</label>
                      <select {...register('ply', { required: true })} className={inputCls}>
                        {[2, 3, 5, 7, 9].map(n => <option key={n} value={n}>{n} Ply</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Flute</label>
                      <select {...register('flute')} className={inputCls}>
                        <option value="">-- Select --</option>
                        {['A', 'B', 'C', 'E', 'F', 'BC', 'AB'].map(f => <option key={f} value={f}>{f} Flute</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className={labelCls}>UPS</label><input type="number" step="0.1" {...register('ups')} className={inputCls} placeholder="1" /></div>
                    <div className="space-y-1.5"><label className={labelCls}>Creasing</label><input {...register('creasing')} className={inputCls} placeholder="e.g. 2 Lines" /></div>
                    <div className="space-y-1.5 col-span-2"><label className={labelCls}>Die Number</label><input {...register('dieNumber')} className={inputCls} placeholder="e.g. DIE-102" /></div>
                  </div>
               </div>
               <div className="space-y-4">
                 <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Finishing</h3>
                 <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className={labelCls}>Color</label><input {...register('color')} className={inputCls} placeholder="e.g. Brown" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Packing</label><input {...register('packing')} className={inputCls} placeholder="e.g. Bundle of 25" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Pin Qty</label><input type="number" {...register('pinQty')} className={inputCls} placeholder="0" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Pin/Pasting</label><input {...register('pinPasting')} className={inputCls} placeholder="e.g. Stitching" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Pin Type</label><input {...register('pinType')} className={inputCls} placeholder="e.g. Heavy Duty" /></div>
                  <div className="space-y-1.5"><label className={labelCls}>Box Type</label><input {...register('boxType')} className={inputCls} placeholder="e.g. Universal" /></div>
                 </div>
               </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Special Requirements</label>
              <input {...register('specialRequirement')} className={inputCls} placeholder="Any special instructions for production..." />
            </div>

            {/* Layers */}
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center"><div className="w-2 h-2 rounded-full bg-primary mr-2"/> Paper Layers</h3>
                <button type="button" onClick={() => append({ layerName: (fields.length % 2 !== 0 ? 'Fluting Medium' : 'Liner'), paperType: (fields.length % 2 === 0 ? 'VK' : 'SK'), bf: '', gsm: 0 })} className="text-xs flex items-center text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-full">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Layer
                </button>
              </div>
              {fields.length === 0 && (
                <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-6 border border-dashed border-border text-center">
                  No paper layers added. Click "Add Layer" to define the box's paper specifications.
                </div>
              )}
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-3 items-end bg-secondary/20 p-4 rounded-xl border border-border/50 hover:border-border transition-colors">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Layer Name (e.g. Top Liner/Fluting Medium)</label>
                      <input {...register(`layers.${idx}.layerName` as const, { required: true })} className={inputCls} placeholder="Layer Name" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Paper Type</label>
                      <select {...register(`layers.${idx}.paperType` as const)} className={inputCls}>
                        <option value="SK">SK</option>
                        <option value="VK">VK</option>
                        <option value="DUPLEX">DUPLEX</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">BF</label>
                      <input {...register(`layers.${idx}.bf` as const)} className={inputCls} placeholder="16" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">GSM</label>
                      <input type="number" {...register(`layers.${idx}.gsm` as const)} className={inputCls} placeholder="100" />
                    </div>
                    <button type="button" onClick={() => remove(idx)} className="p-2 mb-0.5 text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-md transition-colors self-end border border-destructive/20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3 bg-card rounded-b-xl shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button type="submit" form="product-form" disabled={isSubmitting} className="px-6 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center">
            {isSubmitting && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
            {product ? 'Update' : 'Save'} Product
          </button>
        </div>
      </div>
    </div>
  );
}

function DependencyModal({
  data,
  customers,
  products,
  onClose,
  onSuccess
}: {
  data: { entity: any; type: 'customer' | 'product'; usage: any };
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrate = async () => {
    if (!selectedTargetId) return;
    if (!confirm(`Are you sure you want to transfer all records to the new selection and delete this ${data.type}? This action will permanently update historical data.`)) return;
    
    setIsMigrating(true);
    try {
      if (data.type === 'customer') {
        const target = customers.find(c => c.id === selectedTargetId);
        if (target) {
          await migrateCustomer(data.entity.id, target as any, user?.name);
          await deleteCustomer(data.entity.id, user?.name);
        }
      } else {
        const target = products.find(p => p.id === selectedTargetId);
        if (target) {
          await migrateProduct(data.entity.id, target as any, user?.name);
          await deleteProduct(data.entity.id, user?.name);
        }
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-lg rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground flex items-center text-destructive">
            <Trash2 className="w-5 h-5 mr-2" /> Cannot Delete {data.type === 'customer' ? 'Customer' : 'Product'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm">
            The {data.type} <strong>{data.type === 'customer' ? data.entity.name : data.entity.itemName}</strong> cannot be deleted directly because it is being used in other records.
          </p>
          <div className="bg-secondary/30 p-4 rounded-md text-sm space-y-2 border border-border">
            <div className="font-semibold text-primary mb-2">Current Usages:</div>
            {data.type === 'customer' && data.usage.products > 0 && <div>• Products: {data.usage.products}</div>}
            {data.usage.purchaseOrders > 0 && <div>• Purchase Orders: {data.usage.purchaseOrders}</div>}
            {data.usage.jobCards > 0 && <div>• Job Cards: {data.usage.jobCards}</div>}
            {data.usage.finishGoods > 0 && <div>• Finish Goods: {data.usage.finishGoods}</div>}
            {data.usage.transactions > 0 && <div>• Finish Good Transactions: {data.usage.transactions}</div>}
          </div>
          
          <div className="pt-4 border-t border-border">
            <label className="block text-sm font-medium mb-2">
              Select another {data.type} to transfer these records to:
            </label>
            <select
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              className="w-full text-sm rounded-md border border-input px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">-- Select Replacement --</option>
              {data.type === 'customer'
                ? customers.filter(c => c.id !== data.entity.id).map(c => (
                    <option key={c.id} value={c.id!}>{getCustomerDisplayLabel(c, customers)}</option>
                  ))
                : products.filter(p => p.id !== data.entity.id).map(p => (
                    <option key={p.id} value={p.id!}>{p.itemName} ({p.artworkNo})</option>
                  ))}
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              * By migrating, all historical records will be updated to point to the new selection, and the current {data.type} will be deleted.
            </p>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button
              onClick={handleMigrate}
              disabled={!selectedTargetId || isMigrating}
              className="px-6 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center disabled:opacity-50"
            >
              {isMigrating && <CircleDashed className="w-4 h-4 mr-2 animate-spin" />}
              Migrate & Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

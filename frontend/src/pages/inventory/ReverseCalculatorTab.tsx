import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProducts } from '../../lib/supabase/productService';
import { Calculator, PackageSearch, Layers, Info, Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import RMStatusPanel from '../po-management/RMStatusPanel';

export default function ReverseCalculatorTab() {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [orderQtyStr, setOrderQtyStr] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts() as unknown as Promise<any[]>,
    staleTime: 60000,
  });

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const filteredProducts = useMemo(() => {
    // Show active products only for current estimates
    const activeList = products.filter((p: any) => !p.isLegacy);
    const sourceList = activeList.length > 0 ? activeList : products;
    if (!searchQuery.trim()) return sourceList;
    const q = searchQuery.toLowerCase();
    return sourceList.filter(p => {
      const nameStr = (p.name || p.itemName || '').toLowerCase();
      const artStr = (p.artworkNo || '').toLowerCase();
      return nameStr.includes(q) || artStr.includes(q);
    });
  }, [products, searchQuery]);

  const orderQty = Number(orderQtyStr) || 0;

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Reverse Calculator — Job Estimate
        </h2>
        <p className="text-sm text-amber-700 mt-1">
          Kisi bhi job ka naam aur quantity daalein, aur dekhein ki har layer mein kitna material (paper) lagega, aur kya woh stock mein available hai.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Input Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <h3 className="text-sm font-bold flex items-center gap-2 text-foreground border-b pb-3">
            <PackageSearch className="w-4 h-4 text-primary" /> 
            Job Details Enter Karein
          </h3>
          
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Select Item / Product</label>
            <div 
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg border border-input bg-background font-medium cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className={selectedProduct ? "text-foreground" : "text-muted-foreground"}>
                {selectedProduct 
                  ? `${selectedProduct.itemName || selectedProduct.name || ''} ${selectedProduct.artworkNo ? `(${selectedProduct.artworkNo})` : ''}` 
                  : "-- Item Select Karein (Type to search) --"}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
            
            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-2 border-b border-border bg-muted/10 sticky top-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      autoFocus
                      className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Search by Item Name or Artwork No..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground italic">No products found</div>
                  ) : (
                    filteredProducts.map(p => {
                      const nameStr = p.name?.trim() || p.itemName?.trim() || '';
                      const artworkStr = p.artworkNo?.trim() ? `(${p.artworkNo.trim()})` : '';
                      const isSelected = p.id === selectedProductId;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "px-3 py-2.5 text-sm cursor-pointer hover:bg-primary/5 flex items-center justify-between border-b border-border/40 last:border-0",
                            isSelected ? "bg-primary/10 font-bold text-primary" : "text-foreground"
                          )}
                          onClick={() => {
                            setSelectedProductId(p.id!);
                            setSearchQuery('');
                            setIsDropdownOpen(false);
                          }}
                        >
                          <div>
                            <div>{nameStr} <span className="text-muted-foreground ml-1 font-normal">{artworkStr}</span></div>
                            {p.customerName && <div className="text-xs text-muted-foreground mt-0.5">{p.customerName}</div>}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Quantity (Boxes)</label>
            <input
              type="number"
              min="1"
              value={orderQtyStr}
              onChange={e => setOrderQtyStr(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background font-bold focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>
          
          {selectedProduct && (
            <div className="bg-secondary/30 rounded-lg p-3 mt-4 border border-border/50 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 mb-1.5 font-bold text-foreground">
                <Info className="w-3.5 h-3.5" /> Product Specs:
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                 <div><span className="font-semibold">Size:</span> {selectedProduct.length}×{selectedProduct.width}×{selectedProduct.height}</div>
                 <div><span className="font-semibold">Reel Size:</span> {selectedProduct.reelSize}"</div>
                 <div><span className="font-semibold">Cut Size:</span> {selectedProduct.cutSize}"</div>
                 <div><span className="font-semibold">Ups:</span> {selectedProduct.ups || 1}</div>
                 <div><span className="font-semibold">Ply:</span> {selectedProduct.ply}</div>
              </div>
            </div>
          )}
        </div>

        {/* Output Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm min-h-[300px]">
          <h3 className="text-sm font-bold flex items-center gap-2 text-foreground border-b pb-3 mb-4">
            <Layers className="w-4 h-4 text-emerald-600" /> 
            Material Requirement & Status
          </h3>
          
          {!selectedProductId ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center h-[200px]">
              <PackageSearch className="w-10 h-10 mb-3 text-muted-foreground/30" />
              <p className="font-semibold">Koi Job Select Nahi Ki</p>
              <p className="text-xs mt-1">Left side mein product choose karein</p>
            </div>
          ) : orderQty <= 0 ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center h-[200px]">
              <Calculator className="w-10 h-10 mb-3 text-muted-foreground/30" />
              <p className="font-semibold">Quantity Daalein</p>
              <p className="text-xs mt-1">Calculation dekhne ke liye quantity enter karein</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <RMStatusPanel productId={selectedProductId} orderQty={orderQty} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

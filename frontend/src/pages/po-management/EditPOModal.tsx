import React, { useState } from 'react';
import { X, Loader2, FileEdit, AlertCircle } from 'lucide-react';
import { updatePurchaseOrder, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { useAuth } from '../../contexts/AuthContext';

export default function EditPOModal({ 
  po, 
  onClose, 
  onSuccess 
}: { 
  po: PurchaseOrder, 
  onClose: () => void, 
  onSuccess: () => void 
}) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    poNo: po.poNo || '',
    poDate: po.poDate || '',
    deliveryDate: po.deliveryDate || '',
    customerName: po.customerName || '',
    consignee: po.consignee || '',
    productName: po.productName || '',
    artworkNo: po.artworkNo || '',
    size: po.size || '',
    rate: po.rate?.toString() || '0',
    orderQty: po.orderQty?.toString() || '0',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    try {
      if (!formData.poNo.trim()) {
        setError('PO No. is required.');
        return;
      }
      if (!formData.poDate) {
        setError('PO Date is required.');
        return;
      }
      if (!formData.customerName.trim()) {
        setError('Customer Name is required.');
        return;
      }
      if (!formData.productName.trim()) {
        setError('Item Name is required.');
        return;
      }
      
      const rateNum = Number(formData.rate);
      const qtyNum = Number(formData.orderQty);
      
      if (isNaN(rateNum) || rateNum < 0) {
        setError('Invalid rate value.');
        return;
      }
      
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError('Quantity must be greater than 0.');
        return;
      }

      setIsSubmitting(true);
      await updatePurchaseOrder(po.id!, {
        poNo: formData.poNo.trim(),
        poDate: formData.poDate,
        deliveryDate: formData.deliveryDate,
        customerName: formData.customerName.trim(),
        consignee: formData.consignee.trim(),
        productName: formData.productName.trim(),
        artworkNo: formData.artworkNo.trim(),
        size: formData.size.trim(),
        rate: rateNum,
        orderQty: qtyNum,
      }, user?.name || 'Unknown');
      
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update PO. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileEdit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-foreground">Edit Purchase Order</h2>
              <p className="text-xs text-muted-foreground mt-0.5">PO No: <span className="font-bold text-primary">{po.poNo}</span></p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm font-semibold border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Section: PO Details */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
              PO Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">PO No. *</label>
                <input
                  type="text"
                  value={formData.poNo}
                  onChange={e => handleChange('poNo', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Customer Name *</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={e => handleChange('customerName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">PO Date *</label>
                <input
                  type="date"
                  value={formData.poDate}
                  onChange={e => handleChange('poDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Delivery Date</label>
                <input
                  type="date"
                  value={formData.deliveryDate}
                  onChange={e => handleChange('deliveryDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Consignee</label>
                <input
                  type="text"
                  value={formData.consignee}
                  onChange={e => handleChange('consignee', e.target.value)}
                  placeholder="Enter consignee (optional)"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section: Item Details */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
              Item Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Item Name *</label>
                <input
                  type="text"
                  value={formData.productName}
                  onChange={e => handleChange('productName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Artwork No.</label>
                <input
                  type="text"
                  value={formData.artworkNo}
                  onChange={e => handleChange('artworkNo', e.target.value)}
                  placeholder="e.g. AW-1234"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Size</label>
                <input
                  type="text"
                  value={formData.size}
                  onChange={e => handleChange('size', e.target.value)}
                  placeholder="e.g. 10x20x5 cm"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section: Quantity & Rate */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
              Quantity & Rate
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Rate (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.rate}
                    onChange={e => handleChange('rate', e.target.value)}
                    className={`${inputClass} pl-7 text-right font-bold`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">Opening Qty *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.orderQty}
                  onChange={e => handleChange('orderQty', e.target.value)}
                  className={`${inputClass} text-right font-bold`}
                />
              </div>
            </div>

            {/* Live Value Preview */}
            {Number(formData.rate) > 0 && Number(formData.orderQty) > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <span className="text-xs font-bold text-muted-foreground uppercase">Calculated PO Value</span>
                <span className="text-base font-black text-primary">
                  ₹{Math.round(Number(formData.rate) * Number(formData.orderQty)).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg font-bold text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider rounded-lg shadow-md shadow-primary/20 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:translate-y-0"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

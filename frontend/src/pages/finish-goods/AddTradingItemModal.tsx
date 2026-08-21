import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createProduct } from '../../lib/supabase/productService';

interface AddTradingItemModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddTradingItemModal({ onClose, onSuccess }: AddTradingItemModalProps) {
  const { user } = useAuth();
  const [customerName, setCustomerName] = useState('');
  const [productName, setProductName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !productName.trim()) {
      setError('Please enter both customer name and product name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createProduct({
        customerName: customerName.trim(),
        itemName: productName.trim(),
        artworkNo: productName.trim(), // Use item name as artwork no for mapping
      }, user?.name || 'System');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to add trading item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-xl font-bold text-foreground">Add Trading Item</h2>
            <p className="text-sm text-muted-foreground mt-1">For products we do not manufacture</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Customer Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background"
              placeholder="e.g. ABC Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Item / Product Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background"
              placeholder="e.g. Trading Box 10x10"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-secondary border border-border rounded-md hover:bg-secondary/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 flex items-center text-sm font-medium text-white bg-primary rounded-md shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <><span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Item</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

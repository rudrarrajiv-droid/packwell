import React, { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { addRawMaterialTransaction } from '../../lib/supabase/rmService';
import type { RawMaterial } from '../../lib/types/models';

export default function RMOutModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  selectedRM
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  selectedRM: RawMaterial | null;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !selectedRM) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || Number(quantity) <= 0) {
      setError('Please enter a valid quantity.');
      return;
    }

    if (Number(quantity) > selectedRM.closingBalance) {
      setError(`Cannot issue more than available stock (${selectedRM.closingBalance}).`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await addRawMaterialTransaction({
        rawMaterialId: selectedRM.id!,
        type: 'OUT',
        quantity: Number(quantity),
        date,
        referenceNo: referenceNo || undefined,
        performedBy: user?.name || 'System'
      }, user?.name || 'System');
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to add OUT transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-red-500">Raw Material OUT: {selectedRM.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="mb-4 p-3 bg-secondary/20 border border-border rounded-lg text-sm flex justify-between">
            <span className="text-muted-foreground">Available Stock:</span>
            <span className="font-semibold">{selectedRM.closingBalance}</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quantity (OUT)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                max={selectedRM.closingBalance}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reference / Issued To (Optional)</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. Job Card No, Department"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Submit OUT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Plus, Trash2, FileSpreadsheet, ClipboardPaste, Upload, Download, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { bulkImportRawMaterials } from '../../lib/supabase/rmService';

interface ImportRow {
  id: string;
  name: string;
  openingQty: number | '';
  rate: number | '';
}

export default function RMBulkImportModal({
  isOpen,
  onClose,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'grid' | 'paste'>('grid');
  
  // Grid mode state
  const [rows, setRows] = useState<ImportRow[]>([
    { id: '1', name: '', openingQty: '', rate: '' },
    { id: '2', name: '', openingQty: '', rate: '' },
    { id: '3', name: '', openingQty: '', rate: '' },
  ]);

  // Paste mode state
  const [pasteText, setPasteText] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ created: number; updated: number } | null>(null);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setRows(prev => [
      ...prev,
      { id: Date.now().toString(), name: '', openingQty: '', rate: '' }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) {
      setRows([{ id: '1', name: '', openingQty: '', rate: '' }]);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof ImportRow, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      setError('Please paste some data first.');
      return;
    }

    try {
      const lines = pasteText.trim().split(/\r?\n/);
      const parsedRows: ImportRow[] = [];

      lines.forEach((line, index) => {
        // Skip header if looks like header
        if (index === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('material'))) {
          return;
        }

        // Split by tab or comma
        const cols = line.includes('\t') ? line.split('\t') : line.split(',');
        const name = cols[0]?.trim() || '';
        const openingQty = cols[1] !== undefined && cols[1].trim() !== '' ? Number(cols[1].trim()) : '';
        const rate = cols[2] !== undefined && cols[2].trim() !== '' ? Number(cols[2].trim()) : '';

        if (name) {
          parsedRows.push({
            id: `paste-${Date.now()}-${index}`,
            name,
            openingQty: isNaN(Number(openingQty)) ? '' : Number(openingQty),
            rate: isNaN(Number(rate)) ? '' : Number(rate),
          });
        }
      });

      if (parsedRows.length === 0) {
        setError('Could not find valid data. Format should be: Name, Opening Qty, Rate');
        return;
      }

      setRows(parsedRows);
      setActiveTab('grid');
      setError(null);
    } catch (err: any) {
      setError('Error parsing pasted data: ' + err.message);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = "Material Name,Opening Qty,Rate\nBrown Gum,150,45\nStitching Wire 22G,40,120\nBlack Printing Ink,25,350\nPlastic Strapping Roll,10,480\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'raw_materials_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteText(text);
        // Automatically parse
        try {
          const lines = text.trim().split(/\r?\n/);
          const parsedRows: ImportRow[] = [];

          lines.forEach((line, index) => {
            if (index === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('material'))) {
              return;
            }
            const cols = line.includes('\t') ? line.split('\t') : line.split(',');
            const name = cols[0]?.trim() || '';
            const openingQty = cols[1] !== undefined && cols[1].trim() !== '' ? Number(cols[1].trim()) : '';
            const rate = cols[2] !== undefined && cols[2].trim() !== '' ? Number(cols[2].trim()) : '';

            if (name) {
              parsedRows.push({
                id: `upload-${Date.now()}-${index}`,
                name,
                openingQty: isNaN(Number(openingQty)) ? '' : Number(openingQty),
                rate: isNaN(Number(rate)) ? '' : Number(rate),
              });
            }
          });

          if (parsedRows.length > 0) {
            setRows(parsedRows);
            setActiveTab('grid');
            setError(null);
          }
        } catch (err: any) {
          setError('Error reading file: ' + err.message);
        }
      }
    };
    reader.readAsText(file);
  };

  const validRows = rows.filter(r => r.name.trim().length > 0);
  const totalOpeningValue = validRows.reduce((acc, curr) => {
    const qty = Number(curr.openingQty) || 0;
    const rate = Number(curr.rate) || 0;
    return acc + (qty * rate);
  }, 0);

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      setError('Please add at least one material with a name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = validRows.map(r => ({
        name: r.name.trim(),
        openingQty: Number(r.openingQty) || 0,
        rate: Number(r.rate) || 0,
      }));

      const res = await bulkImportRawMaterials(payload, user?.name || 'System');
      setSuccessResult({ created: res.createdCount, updated: res.updatedCount });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to import materials');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-background w-full max-w-4xl rounded-2xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Bulk Import Raw Materials</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Import multiple raw materials with Opening Stock & Rates. New names will be auto-created!
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tab & Actions Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-secondary/20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('grid')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'grid' 
                  ? 'bg-primary text-primary-foreground shadow-xs' 
                  : 'bg-background hover:bg-muted text-muted-foreground'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Table Grid ({validRows.length})
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'paste' 
                  ? 'bg-primary text-primary-foreground shadow-xs' 
                  : 'bg-background hover:bg-muted text-muted-foreground'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste from Excel / CSV
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-medium cursor-pointer transition-colors text-foreground">
              <Upload className="w-3.5 h-3.5 text-primary" />
              Upload CSV
              <input type="file" accept=".csv, .txt" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-medium transition-colors text-foreground"
              title="Download sample template"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              Sample CSV
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {successResult && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-600">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-bold">Import Successful!</p>
                <p className="text-xs mt-0.5">
                  {successResult.created} new material(s) created, {successResult.updated} material(s) updated.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'grid' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden shadow-2xs">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/70 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-center w-12 font-semibold">#</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Raw Material Name <span className="text-red-500">*</span></th>
                      <th className="px-4 py-2.5 text-right font-semibold w-36">Opening Qty</th>
                      <th className="px-4 py-2.5 text-right font-semibold w-36">Rate (₹)</th>
                      <th className="px-4 py-2.5 text-right font-semibold w-36">Value (₹)</th>
                      <th className="px-3 py-2.5 text-center w-12 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {rows.map((row, idx) => {
                      const qty = Number(row.openingQty) || 0;
                      const rate = Number(row.rate) || 0;
                      const val = qty * rate;
                      return (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground font-mono">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleRowChange(row.id, 'name', e.target.value)}
                              placeholder="e.g. Gum, Stitching Wire, Ink..."
                              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary font-medium"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.openingQty}
                              onChange={(e) => handleRowChange(row.id, 'openingQty', e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.rate}
                              onChange={(e) => handleRowChange(row.id, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm text-right focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-primary">
                            ₹ {val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleRemoveRow(row.id)}
                              className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Delete Row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-xl text-sm font-medium transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  Add More Rows
                </button>
                <div className="text-xs text-muted-foreground">
                  Empty rows without material names will be skipped automatically.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-secondary/30 p-4 rounded-xl border border-border text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">💡 How to paste data directly from Excel:</p>
                <p>1. Excel me apne columns ko is order me arrange karein: <b>Material Name</b>, <b>Opening Qty</b>, <b>Rate (₹)</b></p>
                <p>2. Un rows ko select & copy (Ctrl+C) karein aur neeche box me paste (Ctrl+V) karein.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Paste Excel Data or CSV Text:
                </label>
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`Brown Gum\t150\t45\nStitching Wire 22G\t40\t120\nBlack Printing Ink\t25\t350`}
                  className="w-full p-4 bg-background border border-border rounded-xl font-mono text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePaste}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Parse & Load into Table
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Summary & Submit */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-muted-foreground block font-medium">Valid Items</span>
              <span className="text-lg font-bold text-foreground">{validRows.length} Items</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium">Total Opening Value</span>
              <span className="text-lg font-bold text-primary">₹ {totalOpeningValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 border border-border rounded-xl hover:bg-muted text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || validRows.length === 0}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Import & Auto-Create ({validRows.length})
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

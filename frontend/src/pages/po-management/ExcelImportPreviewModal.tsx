import React, { useState, useMemo } from 'react';
import { X, Upload, AlertTriangle, FileSpreadsheet, CheckCircle2, Copy, Search, Filter, HelpCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../../lib/utils';
import { importPurchaseOrdersBatch, type PurchaseOrder } from '../../lib/supabase/purchaseOrderService';
import { getProducts } from '../../lib/supabase/productService';
import { useQuery } from '@tanstack/react-query';

type PreviewRow = {
  _index: number;
  poNo: string;
  poDate: string;
  deliveryDate: string;
  customerName: string;
  consignee: string;
  artworkNo: string;
  itemName: string;
  size: string;
  rate: string;
  opnQty: string;
  inQty: string;
  outQty: string;
  closingBal: string;
  value: string;
  _status: 'READY TO IMPORT' | 'ERROR' | 'MISSING REQUIRED DATA' | 'DUPLICATE IN EXCEL' | 'ALREADY EXISTS' | 'CONFLICT - NEEDS REVIEW';
  _errorMsg?: string;
  _rawRow?: any[];
};

export default function ExcelImportPreviewModal({ onClose, existingPOs, onSuccess }: { onClose: () => void, existingPOs: PurchaseOrder[], onSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  
  // Phase 17: Import States
  const [isConfirming, setIsConfirming] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number, skipped: number, runId: string } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const data = await getProducts() as any[];
      return data;
    },
  });

  const [filterMode, setFilterMode] = useState<'ALL' | 'READY TO IMPORT' | 'ERROR' | 'MISSING REQUIRED DATA' | 'DUPLICATE IN EXCEL' | 'ALREADY EXISTS' | 'CONFLICT - NEEDS REVIEW'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellFormula: true, cellText: true });
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      if (wb.SheetNames.length > 0) {
        handleSheetSelect(wb.SheetNames[0], wb);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSheetSelect = (sheetName: string, wb: XLSX.WorkBook | null = workbook) => {
    setSelectedSheet(sheetName);
    if (!wb) return;
    const sheet = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    parseSheetData(rawData);
  };

  const parseSheetData = (rawData: any[][]) => {
    let headerRowIndex = -1;
    let colMap: Record<string, number> = {};

    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i];
      const rowString = row.map(c => String(c).toUpperCase()).join('|');
      if (rowString.includes('PO NO') || rowString.includes('CUSTOMER') || rowString.includes('ITEM')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      setPreviewData([]);
      return; 
    }

    const headers = rawData[headerRowIndex].map(h => String(h).toUpperCase().trim());
    headers.forEach((h, idx) => {
      if (h.includes('PO NO')) colMap['poNo'] = idx;
      else if (h.includes('PO DT') || h.includes('PO DATE')) colMap['poDate'] = idx;
      else if (h.includes('DELIVERY')) colMap['deliveryDate'] = idx;
      else if (h.includes('CUSTOMER')) colMap['customerName'] = idx;
      else if (h.includes('CONSIGNEE')) colMap['consignee'] = idx;
      else if (h.includes('ARTWORK')) colMap['artworkNo'] = idx;
      else if (h.includes('ITEM')) colMap['itemName'] = idx;
      else if (h.includes('SIZE')) colMap['size'] = idx;
      else if (h.includes('RATE')) colMap['rate'] = idx;
      else if (h.includes('OPN') || h.includes('OPEN')) colMap['opnQty'] = idx;
      else if (h === 'IN' || h.includes('IN QTY') || h.includes(' IN ')) colMap['inQty'] = idx;
      else if (h === 'OUT' || h.includes('OUT QTY') || h.includes(' OUT ')) colMap['outQty'] = idx;
      else if (h.includes('CLOSING') || h.includes('BAL')) colMap['closingBal'] = idx;
      else if (h.includes('VALUE')) colMap['value'] = idx;
    });

    const parsedData: PreviewRow[] = [];
    const excelPoSet = new Set<string>();

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (row.every(c => c === '' || c === null || c === undefined)) continue;

      const getVal = (key: string) => {
        if (colMap[key] === undefined) return '';
        return String(row[colMap[key]]).trim();
      };

      const poNo = getVal('poNo');
      const poDate = getVal('poDate');
      const deliveryDate = getVal('deliveryDate');
      const customerName = getVal('customerName');
      const itemName = getVal('itemName');
      const rate = getVal('rate');
      const opnQty = getVal('opnQty');
      const inQty = getVal('inQty');
      const outQty = getVal('outQty');
      const closingBal = getVal('closingBal');
      const value = getVal('value');

      if (!poNo && !customerName && !itemName) continue;

      let status: PreviewRow['_status'] = 'READY TO IMPORT';
      let errorMsgs: string[] = [];

      const errorTokens = ['#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#N/A'];
      let hasFormulaError = false;
      const rowVals = [poNo, poDate, deliveryDate, customerName, itemName, rate, opnQty, inQty, outQty, closingBal, value];
      for (const val of rowVals) {
        if (errorTokens.some(err => val.includes(err))) {
          hasFormulaError = true;
          break;
        }
      }

      const numRate = parseFloat(rate) || 0;
      const numOpn = parseFloat(opnQty) || 0;
      const numIn = parseFloat(inQty) || 0;
      const numOut = parseFloat(outQty) || 0;
      const numClosing = parseFloat(closingBal) || 0;
      const numValue = parseFloat(value) || 0;

      if (hasFormulaError) {
        status = 'ERROR';
        errorMsgs.push('Contains Formula Error');
      } 
      else if (!poNo || !poDate || !customerName || !itemName || !opnQty) {
        status = 'MISSING REQUIRED DATA';
        errorMsgs.push('Missing: ' + [!poNo && 'PO NO', !poDate && 'PO DT', !customerName && 'CUSTOMER', !itemName && 'ITEM', !opnQty && 'OPN QTY'].filter(Boolean).join(', '));
      } 
      else if (isNaN(numRate) || isNaN(numOpn) || isNaN(numIn) || isNaN(numOut) || isNaN(numClosing)) {
        status = 'ERROR';
        errorMsgs.push('Invalid numeric data found in Rate/Qty');
      }
      else if (numOpn < 0 || numIn < 0 || numOut < 0 || numClosing < 0) {
        status = 'ERROR';
        errorMsgs.push('Negative quantities are not allowed');
      }
      else if (numClosing !== (numOpn + numIn - numOut)) {
        status = 'ERROR';
        errorMsgs.push(`Balance Mismatch: Expected ${numOpn + numIn - numOut}, got ${numClosing}`);
      }
      else if (numValue > 0 && Math.abs(numValue - (numClosing * numRate)) > 1) { 
        status = 'ERROR';
        errorMsgs.push(`Value Mismatch: Expected ${numClosing * numRate}, got ${numValue}`);
      }
      else if (poDate && deliveryDate && new Date(deliveryDate) < new Date(poDate)) {
        status = 'ERROR';
        errorMsgs.push('Delivery Date is before PO Date');
      }
      else {
        const productExists = products.some((p: any) => p.itemName?.toLowerCase() === itemName.toLowerCase() || p.productName?.toLowerCase() === itemName.toLowerCase());
        if (!productExists) {
          errorMsgs.push('Warning: ITEM NOT FOUND IN MASTER DATA');
        }

        const uniqueKey = (poNo + '_' + itemName + '_' + (deliveryDate || '') + '_' + (opnQty || '')).toLowerCase();
        if (excelPoSet.has(uniqueKey)) {
          status = 'DUPLICATE IN EXCEL';
          errorMsgs.push(`PO NO ${poNo} with Item ${itemName} (Del: ${deliveryDate || 'none'}) appears multiple times in this file`);
        } else {
          excelPoSet.add(uniqueKey);
        }

        if (status === 'READY TO IMPORT') { 
          const existingPo = existingPOs.find(p => 
            p.status !== 'CLOSED' &&
            p.poNo?.toLowerCase() === poNo.toLowerCase() && 
            p.productName?.toLowerCase() === itemName.toLowerCase() &&
            (p.deliveryDate || '') === (deliveryDate || '') &&
            String(p.orderQty || '') === (opnQty || '')
          );
          if (existingPo) {
            const isMatch = 
              existingPo.customerName?.toLowerCase() === customerName.toLowerCase() &&
              existingPo.poDate === poDate;

            if (isMatch) {
              status = 'ALREADY EXISTS';
              errorMsgs.push('Exactly matches an existing PO in database');
            } else {
              status = 'CONFLICT - NEEDS REVIEW';
              errorMsgs.push(`PO NO + Item exists but identity conflicts (Cust: ${existingPo.customerName}, Date: ${existingPo.poDate})`);
            }
          }
        }
      }

      parsedData.push({
        _index: i + 1,
        poNo: poNo || 'MISSING',
        poDate: poDate || 'MISSING',
        deliveryDate: deliveryDate || '-',
        customerName: customerName || 'MISSING',
        consignee: getVal('consignee') || '-',
        artworkNo: getVal('artworkNo') || '-',
        itemName: itemName || 'MISSING',
        size: getVal('size') || '-',
        rate: rate || '0',
        opnQty: opnQty || 'MISSING',
        inQty: inQty || '0',
        outQty: outQty || '0',
        closingBal: closingBal || '-',
        value: value || '-',
        _status: status,
        _errorMsg: errorMsgs.join(' | '),
        _rawRow: row
      });
    }

    setPreviewData(parsedData);
  };

  const filteredPreview = useMemo(() => {
    return previewData.filter(row => {
      if (filterMode !== 'ALL' && row._status !== filterMode) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (row.poNo.toLowerCase().includes(s) || 
                row.customerName.toLowerCase().includes(s) ||
                row.artworkNo.toLowerCase().includes(s) ||
                row.itemName.toLowerCase().includes(s));
      }
      return true;
    });
  }, [previewData, filterMode, searchTerm]);

  const stats = useMemo(() => ({
    total: previewData.length,
    ready: previewData.filter(r => r._status === 'READY TO IMPORT').length,
    error: previewData.filter(r => r._status === 'ERROR').length,
    missing: previewData.filter(r => r._status === 'MISSING REQUIRED DATA').length,
    dupExcel: previewData.filter(r => r._status === 'DUPLICATE IN EXCEL').length,
    exists: previewData.filter(r => r._status === 'ALREADY EXISTS').length,
    conflict: previewData.filter(r => r._status === 'CONFLICT - NEEDS REVIEW').length,
  }), [previewData]);

  // Phase 17: Production Import Logic
  const executeImport = async () => {
    setIsImporting(true);
    const dateStr = new Date().toISOString().split('T')[0];
    const runId = `PO-IMPORT-${dateStr}-${Math.floor(Math.random() * 1000)}`;

    try {
      const rowsToImport = previewData.filter(r => r._status === 'READY TO IMPORT' || r._status === 'CONFLICT - NEEDS REVIEW');
      
      const posToCreate: Omit<PurchaseOrder, 'id'>[] = rowsToImport.map(row => ({
        poNo: row.poNo,
        poDate: row.poDate,
        deliveryDate: row.deliveryDate !== '-' ? row.deliveryDate : '',
        customerId: row.customerName, // Ideally map to ID if you have customer mapping
        customerName: row.customerName,
        consignee: row.consignee !== '-' ? row.consignee : '',
        artworkNo: row.artworkNo !== '-' ? row.artworkNo : '',
        productId: row.itemName, // Ideally map to ID
        productName: row.itemName,
        size: row.size !== '-' ? row.size : '',
        rate: parseFloat(row.rate),
        orderQty: parseFloat(row.opnQty),
        inQty: parseFloat(row.inQty),
        outQty: parseFloat(row.outQty),
        status: 'OPEN', 
        history: [],
        isArchived: false,
      }));

      const result = await importPurchaseOrdersBatch(posToCreate, runId, 'Admin');
      
      setImportResult({
        success: result.successCount,
        skipped: result.skippedCount,
        runId
      });

    } catch (error) {
      console.error('Import failed', error);
      alert('Import failed: ' + (error as Error).message);
    } finally {
      setIsImporting(false);
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    if (importResult && onSuccess) {
      onSuccess();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-auto">
      <div className="bg-card w-full max-w-[95vw] h-[90vh] rounded-xl shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Phase 17: Confirmation Overlay */}
        {isConfirming && !importResult && (
          <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md flex items-center justify-center">
            <div className="bg-card border border-border p-8 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
              <AlertTriangle className="w-16 h-16 text-orange-500 mb-4" />
              <h2 className="text-2xl font-black mb-2 uppercase">Confirm Import</h2>
              <p className="text-muted-foreground mb-6 font-semibold">YOU ARE ABOUT TO IMPORT {stats.ready + stats.conflict} NEW PO RECORDS.</p>
              
              <div className="w-full bg-muted/50 rounded-xl p-4 mb-6 text-left border border-border">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground font-semibold">Records to CREATE:</span>
                  <span className="font-black text-green-600">{stats.ready + stats.conflict}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground font-semibold">Records to UPDATE:</span>
                  <span className="font-black text-foreground">0</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground font-semibold">Records to DELETE:</span>
                  <span className="font-black text-foreground">0</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground font-semibold">Blocked Records:</span>
                  <span className="font-bold text-red-500">{stats.error + stats.missing + stats.dupExcel + stats.conflict}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground font-semibold">Existing Records:</span>
                  <span className="font-bold text-blue-500">{stats.exists}</span>
                </div>
              </div>

              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => setIsConfirming(false)}
                  disabled={isImporting}
                  className="flex-1 bg-secondary text-secondary-foreground font-bold py-3 rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={executeImport}
                  disabled={isImporting}
                  className="flex-1 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center shadow-lg shadow-green-600/20"
                >
                  {isImporting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Importing...</> : 'CONFIRM IMPORT'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 17: Success Overlay */}
        {importResult && (
           <div className="absolute inset-0 z-30 bg-green-50/95 dark:bg-green-950/95 backdrop-blur-md flex items-center justify-center">
             <div className="bg-card border border-green-200 dark:border-green-800 p-8 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
               <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-6">
                 <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
               </div>
               <h2 className="text-3xl font-black mb-2 text-green-700 dark:text-green-400 uppercase tracking-tight">Import Completed</h2>
               <p className="text-sm font-mono text-muted-foreground mb-8 bg-muted px-3 py-1 rounded-md">{importResult.runId}</p>
               
               <div className="w-full space-y-3 mb-8">
                 <div className="flex justify-between bg-background border border-border p-3 rounded-lg">
                   <span className="font-bold text-muted-foreground">Total Validated Rows</span>
                   <span className="font-black">{stats.total}</span>
                 </div>
                 <div className="flex justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                   <span className="font-bold text-green-700 dark:text-green-400">Successfully Created</span>
                   <span className="font-black text-green-700 dark:text-green-400">{importResult.success}</span>
                 </div>
                 <div className="flex justify-between bg-background border border-border p-3 rounded-lg">
                   <span className="font-bold text-muted-foreground">Skipped (Already Existed)</span>
                   <span className="font-black text-blue-500">{importResult.skipped + stats.exists}</span>
                 </div>
                 <div className="flex justify-between bg-background border border-border p-3 rounded-lg">
                   <span className="font-bold text-muted-foreground">Failed / Blocked</span>
                   <span className="font-black text-red-500">{stats.error + stats.missing + stats.conflict + stats.dupExcel}</span>
                 </div>
               </div>

               <button 
                 onClick={handleClose}
                 className="w-full bg-green-600 text-white font-black py-4 rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-600/20 text-lg uppercase tracking-wider"
               >
                 Close & Return
               </button>
             </div>
           </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <FileSpreadsheet className="w-5 h-5 mr-2 text-green-600" />
              Excel Import Validation (Phase 16/17)
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-semibold">Strict Read-Only Validation. Production Database Import available.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsConfirming(true)}
              disabled={(stats.ready === 0 && stats.conflict === 0) || isImporting}
              className={cn("px-5 py-2.5 rounded-lg font-black text-sm uppercase tracking-wider transition-all shadow-md flex items-center", 
                (stats.ready > 0 || stats.conflict > 0)
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-green-600/20 hover:-translate-y-0.5" 
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import / Save To Database
            </button>
            <button onClick={handleClose} className="text-muted-foreground hover:bg-muted p-2 rounded-md transition-colors border border-transparent hover:border-border">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Controls */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between items-center bg-background">
          <div className="flex items-center gap-4 w-full md:w-auto">
            {!file ? (
              <label className="cursor-pointer bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-4 py-2 rounded-md font-bold text-sm flex items-center transition-colors">
                <Upload className="w-4 h-4 mr-2" />
                Select .xlsx File
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            ) : (
              <div className="flex items-center gap-4">
                <div className="bg-secondary px-4 py-2 rounded-md text-sm font-semibold border border-border flex items-center">
                   <FileSpreadsheet className="w-4 h-4 mr-2 text-muted-foreground" />
                  {file.name}
                </div>
                {sheets.length > 0 && (
                  <select 
                    value={selectedSheet}
                    onChange={(e) => handleSheetSelect(e.target.value)}
                    className="border border-input rounded-md px-3 py-2 text-sm bg-background font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
          
          {previewData.length > 0 && (
            <div className="flex gap-2">
               <div className="relative">
                 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                 <input 
                   type="text"
                   placeholder="Search PO, Customer, Item..."
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   className="pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 w-[300px] transition-shadow"
                 />
               </div>
            </div>
          )}
        </div>

        {/* Stats & Filters */}
        {previewData.length > 0 && (
          <div className="p-4 bg-muted/30 border-b border-border flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-muted-foreground mr-2 uppercase">Filters:</span>
            <button 
              onClick={() => setFilterMode('ALL')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'ALL' ? "bg-foreground text-background border-foreground shadow-sm" : "bg-card text-muted-foreground hover:bg-muted border-border")}
            >
              ALL ({stats.total})
            </button>
            <button 
              onClick={() => setFilterMode('READY TO IMPORT')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'READY TO IMPORT' ? "bg-green-600 text-white border-green-700 shadow-sm" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100")}
            >
              <CheckCircle2 className="w-3 h-3 inline mr-1" /> READY ({stats.ready})
            </button>
            <button 
              onClick={() => setFilterMode('ERROR')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'ERROR' ? "bg-red-600 text-white border-red-700 shadow-sm" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100")}
            >
              <AlertTriangle className="w-3 h-3 inline mr-1" /> ERRORS ({stats.error})
            </button>
            <button 
              onClick={() => setFilterMode('MISSING REQUIRED DATA')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'MISSING REQUIRED DATA' ? "bg-orange-500 text-white border-orange-600 shadow-sm" : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100")}
            >
              MISSING ({stats.missing})
            </button>
            <button 
              onClick={() => setFilterMode('ALREADY EXISTS')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'ALREADY EXISTS' ? "bg-blue-600 text-white border-blue-700 shadow-sm" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100")}
            >
              <Copy className="w-3 h-3 inline mr-1" /> EXISTS ({stats.exists})
            </button>
            <button 
              onClick={() => setFilterMode('CONFLICT - NEEDS REVIEW')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'CONFLICT - NEEDS REVIEW' ? "bg-yellow-500 text-white border-yellow-600 shadow-sm" : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100")}
            >
              <HelpCircle className="w-3 h-3 inline mr-1" /> CONFLICTS ({stats.conflict})
            </button>
            <button 
              onClick={() => setFilterMode('DUPLICATE IN EXCEL')}
              className={cn("px-3 py-1 rounded text-xs font-bold border transition-colors", filterMode === 'DUPLICATE IN EXCEL' ? "bg-purple-600 text-white border-purple-700 shadow-sm" : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100")}
            >
              <Copy className="w-3 h-3 inline mr-1" /> DUP. IN EXCEL ({stats.dupExcel})
            </button>
          </div>
        )}

        {/* Data Table */}
        <div className="flex-1 overflow-auto bg-card">
          {!file ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in duration-500">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                 <FileSpreadsheet className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <p className="font-bold text-xl text-foreground mb-2">No File Selected</p>
              <p className="text-sm">Click the upload button above to select an Excel file for strictly controlled validation.</p>
            </div>
          ) : previewData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Filter className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No valid PO data found in this sheet.</p>
              <p className="text-xs mt-1">Make sure the sheet contains header columns like 'PO NO', 'CUSTOMER', etc.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[1700px]">
              <thead className="bg-secondary/80 text-muted-foreground uppercase font-bold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-3 py-3 border-b border-border w-10 text-center">Row</th>
                  <th className="px-3 py-3 border-b border-border w-[180px]">Status & Problems</th>
                  <th className="px-3 py-3 border-b border-border">1. PO NO.</th>
                  <th className="px-3 py-3 border-b border-border">2. PO DT</th>
                  <th className="px-3 py-3 border-b border-border">3. DELIVERY DATE</th>
                  <th className="px-3 py-3 border-b border-border">4. CUSTOMER NAME</th>
                  <th className="px-3 py-3 border-b border-border max-w-[150px] truncate">5. CONSIGNEE</th>
                  <th className="px-3 py-3 border-b border-border">6. ARTWORK NO.</th>
                  <th className="px-3 py-3 border-b border-border max-w-[150px] truncate">7. ITEM NAME</th>
                  <th className="px-3 py-3 border-b border-border">8. SIZE</th>
                  <th className="px-3 py-3 border-b border-border text-right">9. RATE</th>
                  <th className="px-3 py-3 border-b border-border text-right">10. OPN QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right text-green-600/70">11. IN QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right text-red-600/70">12. OUT QTY</th>
                  <th className="px-3 py-3 border-b border-border text-right">13. CLOSING BAL</th>
                  <th className="px-3 py-3 border-b border-border text-right text-orange-600/70">14. VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPreview.map((row, idx) => (
                  <tr key={idx} className={cn(
                    "hover:bg-muted/30 transition-colors group",
                    row._status === 'ERROR' && "bg-red-50/50 dark:bg-red-950/20",
                    row._status === 'MISSING REQUIRED DATA' && "bg-orange-50/50 dark:bg-orange-950/20",
                    row._status === 'ALREADY EXISTS' && "bg-blue-50/50 dark:bg-blue-950/20",
                    row._status === 'DUPLICATE IN EXCEL' && "bg-purple-50/50 dark:bg-purple-950/20",
                    row._status === 'CONFLICT - NEEDS REVIEW' && "bg-yellow-50/50 dark:bg-yellow-950/20",
                    row._status === 'READY TO IMPORT' && "bg-green-50/10 dark:bg-green-950/10"
                  )}>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{row._index}</td>
                    <td className="px-3 py-2 border-r border-border/50">
                      <div className="flex flex-col gap-1">
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded w-max border",
                          row._status === 'READY TO IMPORT' ? "bg-green-100 text-green-700 border-green-200" :
                          row._status === 'ERROR' ? "bg-red-100 text-red-700 border-red-200" :
                          row._status === 'MISSING REQUIRED DATA' ? "bg-orange-100 text-orange-700 border-orange-200" :
                          row._status === 'ALREADY EXISTS' ? "bg-blue-100 text-blue-700 border-blue-200" :
                          row._status === 'DUPLICATE IN EXCEL' ? "bg-purple-100 text-purple-700 border-purple-200" :
                          "bg-yellow-100 text-yellow-700 border-yellow-200"
                        )}>
                          {row._status}
                        </span>
                        {row._errorMsg && (
                          <span className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-tight max-w-[200px]" title={row._errorMsg}>
                            {row._errorMsg}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-bold text-foreground">{row.poNo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.poDate}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.deliveryDate}</td>
                    <td className="px-3 py-2 font-semibold truncate max-w-[150px]" title={row.customerName}>{row.customerName}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]" title={row.consignee}>{row.consignee}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.artworkNo}</td>
                    <td className="px-3 py-2 font-medium truncate max-w-[150px]" title={row.itemName}>{row.itemName}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.size}</td>
                    <td className="px-3 py-2 text-right font-medium">{row.rate}</td>
                    <td className="px-3 py-2 text-right font-bold">{row.opnQty}</td>
                    <td className="px-3 py-2 text-right font-bold text-green-600">{row.inQty}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-600">{row.outQty}</td>
                    <td className="px-3 py-2 text-right font-black text-foreground">{row.closingBal}</td>
                    <td className="px-3 py-2 text-right font-bold text-orange-600">{row.value}</td>
                  </tr>
                ))}
                {filteredPreview.length === 0 && (
                  <tr>
                    <td colSpan={16} className="px-6 py-10 text-center text-muted-foreground">
                      No rows match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

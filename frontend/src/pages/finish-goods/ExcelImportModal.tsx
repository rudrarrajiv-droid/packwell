import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  X, FileSpreadsheet, Upload, Download, CheckCircle2,
  AlertTriangle, Loader2, ArrowDownToLine, Truck, Info, ChevronDown, ChevronUp, Trash2, RefreshCw, Plus
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getProducts } from '../../lib/supabase/productService';
import { executeFinishGoodInwardTransaction, executeFinishGoodOutwardTransaction, resetAllFinishGoods, type FinishGoodInwardPayload, type FinishGoodOutwardPayload, type LogisticsPayload, initializeOpeningBalances } from '../../lib/supabase/finishGoodService';
import { AddTradingItemModal } from './AddTradingItemModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type FGRowParsed = {
  _rowNum: number;
  date: string;
  type: 'IN' | 'OUT';
  artworkNo: string;
  category: string;
  openingBalance: number;
  rate: number;
  quantity: number;
  invoiceNo: string;
  // resolved after matching
  productId?: string;
  productName?: string;
  customerId?: string;
  customerName?: string;
  _status: 'OK' | 'ERROR' | 'WARN';
  _error?: string;
};

type FreightRowParsed = {
  _rowNum: number;
  date: string;
  invoiceNo: string;
  customerName: string;
  place: string;
  transporterName: string;
  vehicleNo: string;
  vehicleSize: string;
  freight: number;
  holding: number;
  point: number;
  others: number;
  _status: 'OK' | 'WARN';
};

// ─── Helper: parse Excel date serial or string ────────────────────────────────
function parseExcelDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
  }
  // string like DD-MM-YYYY or DD/MM/YYYY
  const str = String(val).trim();
  const parts = str.split(/[-\/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) {
      // DD-MM-YYYY
      return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    }
    // YYYY-MM-DD already
    return str;
  }
  return str;
}

function safeNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── Generate Template ────────────────────────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: FinishGoods ──
  const fgHeaders = [
    'Date (DD-MM-YYYY)',
    'Type (IN/OUT)',
    'Artwork No',
    'Category',
    'Opening Balance',
    'Rate (₹)',
    'Quantity',
    'Invoice No (OUT only)',
  ];

  const fgSample = [
    ['01-08-2026', 'IN',  'AW-001', 'REGULAR',   500, 12.50, 200, ''],
    ['01-08-2026', 'IN',  'AW-002', 'REGULAR',   300,  8.00, 100, ''],
    ['02-08-2026', 'OUT', 'AW-001', 'DISPATCH',  '',  12.50, 150, 'INV-001'],
    ['03-08-2026', 'IN',  'AW-003', 'REJECTED',  0,    5.00,  50, ''],
    ['05-08-2026', 'OUT', 'AW-002', 'DISPATCH',  '',   8.00,  80, 'INV-002'],
  ];

  const fgWS = XLSX.utils.aoa_to_sheet([fgHeaders, ...fgSample]);

  // Column widths
  fgWS['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, fgWS, 'FinishGoods');

  // ── Sheet 2: FreightCharges ──
  const frHeaders = [
    'Date (DD-MM-YYYY)',
    'Invoice No',
    'Customer Name',
    'Place',
    'Transporter Name',
    'Vehicle No',
    'Vehicle Size',
    'Freight (₹)',
    'Holding (₹)',
    'Point (₹)',
    'Others (₹)',
  ];

  const frSample = [
    ['02-08-2026', 'INV-001', 'ABC Ltd',  'Mumbai', 'Sharma Transport', 'MH-04-AB-1234', '20FT', 5000, 500, 200, 0],
    ['05-08-2026', 'INV-002', 'XYZ Corp', 'Pune',   'Gupta Transport',  'MH-12-CD-5678', '32FT', 8000, 0,   300, 100],
  ];

  const frWS = XLSX.utils.aoa_to_sheet([frHeaders, ...frSample]);
  frWS['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
    { wch: 20 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, frWS, 'FreightCharges');

  // ── Sheet 3: Instructions ──
  const instrData = [
    ['📋 INSTRUCTIONS — FinishGoods + FreightCharges Import'],
    [''],
    ['SHEET 1: FinishGoods'],
    ['Column', 'Description', 'Valid Values'],
    ['Date', 'Transaction date', 'DD-MM-YYYY format, e.g. 01-08-2026'],
    ['Type', 'IN = goods received, OUT = goods dispatched', 'IN  or  OUT  (capital)'],
    ['Artwork No', 'Exact artwork number from Master Data', 'e.g. AW-001'],
    ['Category', 'Type of stock movement', 'IN: REGULAR or REJECTED | OUT: DISPATCH or NON-MOVING'],
    ['Opening Balance', 'Starting stock (only for first IN of a product)', 'Number, e.g. 500  — leave blank for subsequent entries'],
    ['Rate (₹)', 'Per unit rate', 'Number, e.g. 12.50'],
    ['Quantity', 'Number of units', 'Positive number'],
    ['Invoice No', 'For OUT rows only — links to FreightCharges sheet', 'e.g. INV-001'],
    [''],
    ['SHEET 2: FreightCharges'],
    ['Column', 'Description'],
    ['Date', 'Same date as OUT transaction'],
    ['Invoice No', 'Must match Invoice No in FinishGoods OUT rows'],
    ['Customer Name', 'Customer name'],
    ['Place', 'Delivery destination'],
    ['Transporter Name', 'Transporter/carrier name'],
    ['Vehicle No', 'Vehicle registration number'],
    ['Vehicle Size', 'e.g. 20FT, 32FT, MINI'],
    ['Freight (₹)', 'Freight charges'],
    ['Holding (₹)', 'Holding charges'],
    ['Point (₹)', 'Point charges'],
    ['Others (₹)', 'Any other charges'],
    [''],
    ['⚠️ IMPORTANT NOTES'],
    ['1. Artwork No must exactly match what is in Master Data of the web app'],
    ['2. Opening Balance — fill only for first entry of a product, leave blank for all other rows'],
    ['3. Date format must be DD-MM-YYYY'],
    ['4. Type and Category must be in CAPITAL letters'],
    ['5. OUT rows without freight — leave FreightCharges sheet blank for that Invoice No'],
  ];

  const instrWS = XLSX.utils.aoa_to_sheet(instrData);
  instrWS['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, instrWS, 'Instructions');

  XLSX.writeFile(wb, 'FinishGoods_FreightCharges_Template.xlsx');
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Fuzzy match score (0-1) — higher = more similar ────────────────────────
function fuzzyScore(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  if (t.includes(s) || s.includes(t)) return 0.9;
  // Word overlap
  const sw = new Set(s.split(/\s+/));
  const tw = new Set(t.split(/\s+/));
  const inter = [...sw].filter(w => tw.has(w)).length;
  const union = new Set([...sw, ...tw]).size;
  return union > 0 ? inter / union : 0;
}

// ─── Searchable Dropdown for 500+ Items ─────────────────────────────────────
function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = "Search..."
}: {
  options: { id: string; label: string; group?: string }[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find(o => o.id === value);

  const openMenu = () => {
    setSearch('');
    setIsOpen(true);
  };

  const filtered = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full">
      {!isOpen ? (
        <button 
          type="button"
          onClick={openMenu}
          className="w-full text-left text-xs rounded-md border border-input px-3 py-2 bg-background hover:bg-muted focus:outline-none focus:ring-1 focus:ring-orange-400 font-medium truncate shadow-sm"
        >
          {selectedOption ? (
            <span className="text-emerald-700">✅ {selectedOption.label}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
      ) : (
        <div className="relative z-50">
          <input
            autoFocus
            type="text"
            className="w-full text-xs rounded-md border border-orange-400 px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium shadow-sm"
            placeholder="Type customer or item name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          />
          <div className="absolute top-full left-0 w-full mt-1 bg-white border border-border rounded-md shadow-xl max-h-64 overflow-y-auto z-50">
            {filtered.length > 0 ? (
              filtered.map((opt, i) => {
                const showGroup = i === 0 || filtered[i - 1].group !== opt.group;
                return (
                  <div key={`${opt.group || ''}-${opt.id}`}>
                    {showGroup && opt.group && (
                      <div className="bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase sticky top-0">
                        {opt.group}
                      </div>
                    )}
                    <div
                      onMouseDown={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                      }}
                      className="px-3 py-2 text-xs hover:bg-orange-50 cursor-pointer border-b border-border/50 last:border-0"
                    >
                      <span className={opt.id === value ? "font-bold text-orange-700" : ""}>{opt.label}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExcelImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [fgRows, setFgRows] = useState<FGRowParsed[]>([]);
  const [freightRows, setFreightRows] = useState<FreightRowParsed[]>([]);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importError, setImportError] = useState('');
  const [fileName, setFileName] = useState('');
  const [showFG, setShowFG] = useState(true);
  const [showFreight, setShowFreight] = useState(true);
  // All products from DB (saved for name-mapping)
  const [allProducts, setAllProducts] = useState<any[]>([]);
  // name mapping: artworkNo (from Excel) → productId (from Master Data)
  const [nameMapping, setNameMapping] = useState<Record<string, string>>({});
  // track which mapping rows are marked "skip" by user
  const [skipMapping, setSkipMapping] = useState<Record<string, boolean>>({});
  const [showMappingPanel, setShowMappingPanel] = useState(true);
  // Reset mode: if true, all FG data is cleared before import
  const [resetMode, setResetMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isAddTradingItemOpen, setIsAddTradingItemOpen] = useState(false);

  const handleReloadProducts = async () => {
    setIsReloading(true);
    try {
      const products: any[] = await getProducts();
      setAllProducts(products);
    } catch (err) {
      console.error('Failed to reload products', err);
    } finally {
      setIsReloading(false);
    }
  };

  const handleAutoMap = () => {
    const newMapping = { ...nameMapping };
    const newSkip = { ...skipMapping };
    let mappedCount = 0;
    unmappedGroups.forEach(group => {
      if (group.suggestions && group.suggestions.length > 0) {
        newMapping[group.artworkNo] = group.suggestions[0].id;
        delete newSkip[group.artworkNo];
        mappedCount++;
      }
    });
    setNameMapping(newMapping);
    setSkipMapping(newSkip);
    alert(`${mappedCount} items automatically best match ke sath map ho gaye! Ek baar check zaroor kar lein.`);
  };

  // ── Parse Excel File ──────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });

        // Fetch products from DB for matching
        const products: any[] = await getProducts();
        setAllProducts(products);
        setNameMapping({});
        setSkipMapping({});

        // ── Parse FinishGoods Sheet ──
        const fgSheet = wb.Sheets['FinishGoods'] || wb.Sheets[wb.SheetNames[0]];
        const fgRaw: any[][] = XLSX.utils.sheet_to_json(fgSheet, { header: 1, defval: '' });

        const parsedFG: FGRowParsed[] = [];
        for (let i = 1; i < fgRaw.length; i++) {
          const row = fgRaw[i];
          if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

          const dateStr   = parseExcelDate(row[0]);
          const typeRaw   = String(row[1] || '').trim().toUpperCase();
          const artworkNo = String(row[2] || '').trim();
          const catRaw    = String(row[3] || '').trim().toUpperCase();
          const openingBal= safeNum(row[4]);
          const rate      = safeNum(row[5]);
          const qty       = safeNum(row[6]);
          const invoiceNo = String(row[7] || '').trim();

          // Validate type
          if (typeRaw !== 'IN' && typeRaw !== 'OUT') {
            parsedFG.push({
              _rowNum: i + 1, date: dateStr, type: 'IN', artworkNo, category: catRaw,
              openingBalance: openingBal, rate, quantity: qty, invoiceNo,
              _status: 'ERROR', _error: `Type must be IN or OUT, got: "${row[1]}"`
            });
            continue;
          }

          // Match product by artworkNo
          const product = products.find(
            (p: any) => (p.artworkNo || '').trim().toLowerCase() === artworkNo.toLowerCase()
          );

          // Validate category
          const validCatsIN  = ['REGULAR', 'REJECTED'];
          const validCatsOUT = ['DISPATCH', 'NON-MOVING', 'REJECTED'];
          const validCats    = typeRaw === 'IN' ? validCatsIN : validCatsOUT;

          let status: 'OK' | 'ERROR' | 'WARN' = 'OK';
          let error = '';

          if (!artworkNo) {
            status = 'ERROR'; error = 'Artwork No is required';
          } else if (!product) {
            status = 'ERROR'; error = `Product not found for Artwork No: "${artworkNo}"`;
          } else if (!validCats.includes(catRaw)) {
            status = 'ERROR';
            error = `Invalid Category "${catRaw}" for ${typeRaw}. Use: ${validCats.join(' or ')}`;
          } else if (qty <= 0 && openingBal <= 0) {
            status = 'ERROR'; error = 'Quantity ya Opening Balance me se ek > 0 hona chahiye';
          } else if (!dateStr) {
            status = 'ERROR'; error = 'Date is required';
          } else if (typeRaw === 'OUT' && !invoiceNo) {
            status = 'WARN'; error = 'No Invoice No for OUT row — Freight will not be linked';
          }

          parsedFG.push({
            _rowNum: i + 1, date: dateStr,
            type: typeRaw as 'IN' | 'OUT',
            artworkNo, category: catRaw,
            openingBalance: openingBal, rate, quantity: qty, invoiceNo,
            productId: product?.id,
            productName: product?.itemName || product?.artworkNo || '',
            customerId: product?.customerId || '',
            customerName: product?.customerName || '',
            _status: status, _error: error || undefined
          });
        }

        // ── Parse FreightCharges Sheet ──
        const frSheet = wb.Sheets['FreightCharges'] || wb.Sheets[wb.SheetNames[1]];
        const parsedFR: FreightRowParsed[] = [];

        if (frSheet) {
          const frRaw: any[][] = XLSX.utils.sheet_to_json(frSheet, { header: 1, defval: '' });
          for (let i = 1; i < frRaw.length; i++) {
            const row = frRaw[i];
            if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) continue;
            parsedFR.push({
              _rowNum: i + 1,
              date:            parseExcelDate(row[0]),
              invoiceNo:       String(row[1] || '').trim(),
              customerName:    String(row[2] || '').trim(),
              place:           String(row[3] || '').trim(),
              transporterName: String(row[4] || '').trim(),
              vehicleNo:       String(row[5] || '').trim(),
              vehicleSize:     String(row[6] || '').trim(),
              freight:         safeNum(row[7]),
              holding:         safeNum(row[8]),
              point:           safeNum(row[9]),
              others:          safeNum(row[10]),
              _status: 'OK',
            });
          }
        }

        setFgRows(parsedFG);
        setFreightRows(parsedFR);
        setStep('preview');
      } catch (err: any) {
        alert('File parse error: ' + (err?.message || 'Unknown error'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Submit Import ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    setStep('importing');
    setImportLog([]);
    setImportError('');
    const log: string[] = [];

    try {
      const userName = user?.name || 'System';

      // ─ RESET if resetMode is ON ─
      if (resetMode) {
        log.push('⚠️  Reset mode ON — pehle saara purana data delete ho raha hai...');
        setImportLog([...log]);
        setIsResetting(true);
        try {
          const { deletedTransactions, deletedFGs } = await resetAllFinishGoods(userName);
          log.push(`🗑️  Reset complete: ${deletedFGs} FG records + ${deletedTransactions} transactions deleted.`);
          log.push('');
        } catch (resetErr: any) {
          log.push(`❌ Reset failed: ${resetErr?.message}`);
          setImportLog([...log]);
          setImportError('Reset failed: ' + (resetErr?.message || 'Unknown error'));
          setStep('preview');
          setIsResetting(false);
          return;
        }
        setIsResetting(false);
        setImportLog([...log]);
      }

      // ─ Group IN rows by date ─ (use effectiveFgRows so mappings are respected)
      const inRows    = effectiveFgRows.filter(r => r.type === 'IN'  && r._status !== 'ERROR');
      const outRows   = effectiveFgRows.filter(r => r.type === 'OUT' && r._status !== 'ERROR');

      // ─ Process Opening Balances First ─
      // Any row (IN or OUT) can have an opening balance. We collect them unique by product.
      const openingBalancesToProcess = new Map<string, FinishGoodInwardPayload>();
      effectiveFgRows.filter(r => r._status !== 'ERROR' && r.openingBalance > 0).forEach(r => {
        if (!openingBalancesToProcess.has(r.productId!)) {
          openingBalancesToProcess.set(r.productId!, {
            productId:    r.productId!,
            productName:  r.productName!,
            customerId:   r.customerId!,
            customerName: r.customerName!,
            quantity:     r.openingBalance,
            category:     (r.category === 'REJECTED' || r.category === 'NON-MOVING') ? 'REJECTED' : 'REGULAR',
            date:         r.date,
            rate:         r.rate,
          });
        }
      });

      if (openingBalancesToProcess.size > 0) {
        log.push(`📥 Processing Opening Balances for ${openingBalancesToProcess.size} items...`);
        setImportLog([...log]);
        
        const obPayloads = Array.from(openingBalancesToProcess.values());
        try {
          await initializeOpeningBalances(obPayloads, userName);
          log.push(`   ✅ Opening Balances saved successfully.`);
        } catch (err: any) {
          log.push(`   ❌ Opening Balances failed: ${err?.message || 'Unknown error'}`);
        }
        setImportLog([...log]);
      }

      // Group IN rows by date for batch processing
      const inByDate = new Map<string, typeof inRows>();
      for (const r of inRows) {
        const existing = inByDate.get(r.date) || [];
        existing.push(r);
        inByDate.set(r.date, existing);
      }

      // Process each date's IN batch
      for (const [date, rows] of inByDate) {
        log.push(`📥 Processing IN for date: ${date} (${rows.length} rows)...`);
        setImportLog([...log]);

        // Build payloads
        const payloads: FinishGoodInwardPayload[] = [];

        for (const r of rows) {
          // Add the actual IN quantity (Opening balance already handled)
          if (r.quantity > 0) {
            payloads.push({
              productId:    r.productId!,
              productName:  r.productName!,
              customerId:   r.customerId!,
              customerName: r.customerName!,
              quantity:     r.quantity,
              category:     r.category === 'REJECTED' ? 'REJECTED' : 'REGULAR',
              date:         r.date,
              rate:         r.rate,
            });
            log.push(`   ↳ IN: ${r.artworkNo} — ${r.quantity} qty @ ₹${r.rate}`);
          }
        }

        if (payloads.length > 0) {
          await executeFinishGoodInwardTransaction(payloads, userName);
          log.push(`   ✅ IN batch for ${date} done.`);
        }
        setImportLog([...log]);
      }

      // ─ Ensure all OUT row products exist ─
      // The user requested: "AUR JO ITEM NA TO OPENING ME HAI AUR NA HI IN ME HAI TO USKO NEW CREATE KAR OUT COLUMN ME DAALO"
      const missingOutProducts = new Map<string, FinishGoodInwardPayload>();
      for (const r of outRows) {
        if (!openingBalancesToProcess.has(r.productId!) && !inRows.some(inR => inR.productId === r.productId)) {
          missingOutProducts.set(r.productId!, {
            productId:    r.productId!,
            productName:  r.productName!,
            customerId:   r.customerId!,
            customerName: r.customerName!,
            quantity:     0,
            category:     'REGULAR',
            date:         r.date,
            rate:         r.rate,
          });
        }
      }
      
      if (missingOutProducts.size > 0) {
        log.push(`📥 Creating ${missingOutProducts.size} items that only have OUT transactions...`);
        setImportLog([...log]);
        const missingPayloads = Array.from(missingOutProducts.values());
        try {
          await initializeOpeningBalances(missingPayloads, userName);
        } catch (err: any) {
          log.push(`   ❌ Failed to create missing items: ${err?.message || 'Unknown error'}`);
        }
      }

      // ─ Group OUT rows by invoice ─
      const outByInvoice = new Map<string, typeof outRows>();
      for (const r of outRows) {
        const key = r.invoiceNo || `__NO_INV_${r._rowNum}`;
        const existing = outByInvoice.get(key) || [];
        existing.push(r);
        outByInvoice.set(key, existing);
      }

      // Build freight map grouping by invoice (support multiple vehicles per invoice)
      const freightMap = new Map<string, FreightRowParsed[]>();
      for (const fr of freightRows) {
        if (fr.invoiceNo) {
          const arr = freightMap.get(fr.invoiceNo) || [];
          arr.push(fr);
          freightMap.set(fr.invoiceNo, arr);
        }
      }

      // Process each invoice's OUT batch
      for (const [invoiceKey, rows] of outByInvoice) {
        const invoiceNo  = invoiceKey.startsWith('__NO_INV_') ? '' : invoiceKey;
        const frDatas    = freightMap.get(invoiceKey) || [];

        log.push(`📤 Processing OUT Invoice: ${invoiceNo || '(no invoice)'} (${rows.length} FG rows, ${frDatas.length} vehicles)...`);
        setImportLog([...log]);

        // If no freight, or just 1 freight, process normally.
        // If multiple vehicles, we process the FG rows with the FIRST vehicle,
        // and for subsequent vehicles, we pass a dummy FG row with qty 0 to hold the logistics data.
        const vehiclesToProcess = frDatas.length > 0 ? frDatas : [null];

        for (let i = 0; i < vehiclesToProcess.length; i++) {
          const frData = vehiclesToProcess[i];
          const isFirst = i === 0;

          const logistics: LogisticsPayload = {
            date:            rows[0].date,
            invoiceNo:       invoiceNo,
            place:           frData?.place           || '',
            transporterName: frData?.transporterName || '',
            vehicleNo:       frData?.vehicleNo       || '',
            vehicleSize:     frData?.vehicleSize      || '',
            freight:         frData?.freight          || 0,
            holding:         frData?.holding          || 0,
            point:           String(frData?.point     || 0),
            others:          String(frData?.others    || 0),
          };

          // Only the first vehicle carries the actual FG outward quantities.
          // Additional vehicles get a dummy qty=0 to prevent deducting stock again.
          const payloads: FinishGoodOutwardPayload[] = isFirst 
            ? rows.map(r => ({
                productId: r.productId!,
                quantity:  r.quantity,
                category:  (r.category === 'NON-MOVING' || r.category === 'REJECTED' ? 'NON-MOVING' : 'DISPATCH') as 'DISPATCH' | 'NON-MOVING',
              }))
            : [{
                productId: rows[0].productId!,
                quantity: 0,
                category: 'DISPATCH'
              }];

          try {
            await executeFinishGoodOutwardTransaction(logistics, payloads, userName);
            if (isFirst) log.push(`   ✅ OUT batch done — Invoice: ${invoiceNo || 'N/A'}`);
            if (frData) {
              log.push(`   🚚 Freight linked — Transporter: ${frData.transporterName}, ₹${frData.freight}`);
            }
          } catch (err: any) {
            log.push(`   ❌ OUT failed: ${err?.message || 'Unknown error'}`);
          }
        }
        setImportLog([...log]);
      }

      log.push('');
      log.push('🎉 Import Complete!');
      if (resetMode) log.push('✅ Fresh data successfully loaded. Purana data remove ho gaya.');
      setImportLog([...log]);
      setStep('done');
    } catch (err: any) {
      setImportError(err?.message || 'Import failed. Check console.');
      setStep('preview');
    }
  };

  // ── Effective rows: apply nameMapping to turn ERROR→OK ──────────────────
  const effectiveFgRows = useMemo(() => {
    return fgRows.map(row => {
      if (
        row._status === 'ERROR' &&
        row._error?.includes('not found') &&
        nameMapping[row.artworkNo] &&
        !skipMapping[row.artworkNo]
      ) {
        const mapped = allProducts.find(p => p.id === nameMapping[row.artworkNo]);
        if (mapped) {
          return {
            ...row,
            _status: 'OK' as const,
            productId: mapped.id,
            productName: mapped.itemName || mapped.artworkNo || '',
            customerId: mapped.customerId || '',
            customerName: mapped.customerName || '',
            _error: undefined,
          };
        }
      }
      return row;
    });
  }, [fgRows, nameMapping, skipMapping, allProducts]);

  // Unmatched artwork nos that need mapping (unique, not skipped)
  const unmappedGroups = useMemo(() => {
    const seen = new Map<string, FGRowParsed>();
    effectiveFgRows.forEach(row => {
      if (row._status === 'ERROR' && row._error?.includes('not found') && !skipMapping[row.artworkNo]) {
        if (!seen.has(row.artworkNo)) seen.set(row.artworkNo, row);
      }
    });
    return Array.from(seen.values()).map(row => {
      // Compute fuzzy suggestions from allProducts
      const suggestions = allProducts
        .map(p => ({ p, score: fuzzyScore(row.artworkNo, p.artworkNo || p.itemName || '') }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.p);
      return { artworkNo: row.artworkNo, suggestions };
    });
  }, [effectiveFgRows, allProducts, skipMapping]);

  // ── Stats (use effectiveFgRows) ──────────────────────────────────────────
  const fgOK    = effectiveFgRows.filter(r => r._status === 'OK').length;
  const fgWarn  = effectiveFgRows.filter(r => r._status === 'WARN').length;
  const fgErr   = effectiveFgRows.filter(r => r._status === 'ERROR').length;
  const hasErrors = fgErr > 0;

  const totalFreightSum = freightRows.reduce((acc, row) => acc + (row.freight || 0), 0);

  // ── Download Error Report ──────────────────────────────────────────────────
  const downloadErrorReport = () => {
    const errorRows = fgRows.filter(r => r._status === 'ERROR');
    if (errorRows.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Error Summary — unique missing Artwork Nos
    const missingArtworks = Array.from(
      new Map(errorRows.map(r => [r.artworkNo, r])).values()
    );
    const summaryData = [
      ['❌ Missing / Error Artwork Numbers — Master Data me Add Karo'],
      [''],
      ['Sr No', 'Artwork No', 'Error Reason', 'Action Required'],
      ...missingArtworks.map((r, i) => [
        i + 1,
        r.artworkNo || '(blank)',
        r._error || 'Unknown error',
        r._error?.includes('not found') ? '👉 Master Data → Products me add karo' : '👉 Excel me fix karo'
      ])
    ];
    const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWS['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 55 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Missing Products');

    // Sheet 2: All Error Rows (full detail)
    const detailHeaders = ['Excel Row', 'Date', 'Type', 'Artwork No', 'Category', 'Qty', 'Rate', 'Invoice No', 'Error Reason'];
    const detailData = [
      detailHeaders,
      ...errorRows.map(r => [
        r._rowNum,
        r.date,
        r.type,
        r.artworkNo,
        r.category,
        r.quantity,
        r.rate,
        r.invoiceNo,
        r._error || ''
      ])
    ];
    const detailWS = XLSX.utils.aoa_to_sheet(detailData);
    detailWS['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 30 },
      { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 55 }
    ];
    XLSX.utils.book_append_sheet(wb, detailWS, 'Error Detail');

    XLSX.writeFile(wb, `ErrorReport_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card w-full max-w-6xl max-h-[95vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Excel Bulk Import</h2>
              <p className="text-xs text-muted-foreground">Finish Goods (IN/OUT) + Freight Charges</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div className="p-8 flex flex-col items-center gap-6">

              {/* Template Download Card */}
              <div className="w-full max-w-2xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-emerald-100 dark:bg-emerald-800/50 p-3 rounded-lg shrink-0">
                    <Download className="w-7 h-7 text-emerald-700 dark:text-emerald-300" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                      Step 1 — Template Download Karo
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                      Ready-made Excel template milegi — 2 sheets hogi:
                      <strong> FinishGoods</strong> (IN/OUT + Opening Balance) aur
                      <strong> FreightCharges</strong>. Sample data bhi hoga guide ke liye.
                    </p>
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Template Download (.xlsx)
                    </button>
                  </div>
                </div>
              </div>

              {/* Info box */}
              <div className="w-full max-w-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <p className="font-bold mb-2">📋 Excel Format — Quick Guide:</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div><strong>Sheet 1: FinishGoods</strong></div>
                      <div><strong>Sheet 2: FreightCharges</strong></div>
                      <div>• Date: DD-MM-YYYY</div>
                      <div>• Date: DD-MM-YYYY</div>
                      <div>• Type: IN / OUT</div>
                      <div>• Invoice No (OUT se link)</div>
                      <div>• Artwork No (exact)</div>
                      <div>• Transporter, Vehicle</div>
                      <div>• Category: REGULAR/REJECTED (IN)</div>
                      <div>• Freight, Holding, Point</div>
                      <div>• Category: DISPATCH/NON-MOVING (OUT)</div>
                      <div>• Others charges</div>
                      <div>• Opening Balance (sirf pehli entry)</div>
                      <div></div>
                      <div>• Rate (₹) + Quantity</div>
                      <div></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Zone */}
              <div className="w-full max-w-2xl">
                {/* Reset Mode Toggle */}
                <div className={`mb-4 rounded-xl border-2 p-4 transition-all ${
                  resetMode ? 'border-red-400 bg-red-50' : 'border-border bg-secondary/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${ resetMode ? 'bg-red-100' : 'bg-secondary' }`}>
                        <Trash2 className={`w-5 h-5 ${ resetMode ? 'text-red-600' : 'text-muted-foreground' }`} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${ resetMode ? 'text-red-700' : 'text-foreground' }`}>
                          {resetMode ? 'RESET MODE ON — Purana Data Hatega' : 'Import Mode (Safe)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {resetMode
                            ? 'Import se pehle ALL finish goods + transactions permanently delete honge.'
                            : 'Normal: Purana data rehega, naya data add hoga.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!resetMode) {
                          if (!window.confirm(
                            'KHABARDAR!\n\nReset Mode ON karne se import ke waqt SAARA purana Finish Goods data permanently delete ho jaayega.\n\nKya aap sure hain?'
                          )) return;
                        }
                        setResetMode(v => !v);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        resetMode ? 'bg-red-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        resetMode ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  {resetMode && (
                    <div className="mt-3 text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                      Import button dabate hi ek aur confirmation aayegi — tabhi delete hoga.
                    </div>
                  )}
                </div>

                <h3 className="text-base font-bold text-foreground mb-3">
                  Step 2 — Filled Excel Upload Karo
                </h3>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-primary/40 hover:border-primary rounded-xl p-10 text-center cursor-pointer transition-all hover:bg-primary/5 group"
                >
                  <Upload className="w-12 h-12 mx-auto mb-3 text-primary/50 group-hover:text-primary transition-colors" />
                  <p className="text-base font-semibold text-foreground mb-1">
                    Click here ya drag & drop karo
                  </p>
                  <p className="text-sm text-muted-foreground">
                    .xlsx ya .xls file — FinishGoods + FreightCharges sheets
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <div className="p-4 space-y-4">

              {/* File info bar */}
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5 border border-border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  <span className="truncate max-w-xs">{fileName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    ✅ {fgOK} Ready
                  </span>
                  {fgWarn > 0 && (
                    <span className="text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      ⚠️ {fgWarn} Warning
                    </span>
                  )}
                  {fgErr > 0 && (
                    <span className="text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      ❌ {fgErr} Error
                    </span>
                  )}
                  <span className="text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    🚚 {freightRows.length} Freight
                  </span>
                </div>
              </div>

              {importError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {importError}
                </div>
              )}

              {hasErrors && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{fgErr} rows me errors hain. Neeche list me laal rang me ERROR details dekhein.</span>
                    </div>
                    <button
                      onClick={downloadErrorReport}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shrink-0 ml-4 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Error Report
                    </button>
                  </div>
                </div>
              )}

              {/* ── Name Mapping Panel ── */}
              {unmappedGroups.length > 0 && (
                <div className="border-2 border-orange-300 bg-orange-50/60 rounded-xl">
                  <div className="flex items-center justify-between px-4 py-3 bg-orange-100 border-b border-orange-200 rounded-t-xl">
                    <button
                      className="flex-1 flex items-center gap-2 transition-colors text-sm font-bold text-orange-900 text-left hover:text-orange-700"
                      onClick={() => setShowMappingPanel(v => !v)}
                    >
                      <span className="text-lg">🔗</span>
                      Name Mapping — {unmappedGroups.length} unmatched Artwork Nos
                      <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unmappedGroups.length}</span>
                      {showMappingPanel ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsAddTradingItemOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white border border-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                        title="New item master data me add karein"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Item
                      </button>
                      <button
                        onClick={handleAutoMap}
                        className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white border border-emerald-600 px-3 py-1.5 rounded-md hover:bg-emerald-700 transition-colors shadow-sm"
                        title="Sabhi items ko unke best suggestion se automatically map karein"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Auto-Map All
                      </button>
                      <button
                      onClick={handleReloadProducts}
                      disabled={isReloading}
                      className="flex items-center gap-1.5 text-xs font-bold bg-white text-orange-700 border border-orange-300 px-3 py-1.5 rounded-md hover:bg-orange-50 transition-colors shadow-sm disabled:opacity-50"
                      title="Naya product dusri tab me add karke yaha refresh karo"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
                      Refresh Data
                    </button>
                    </div>
                  </div>

                  {showMappingPanel && (
                    <div className="p-4 space-y-3">
                      <div className="text-xs text-orange-800 bg-orange-100 border border-orange-200 rounded-lg px-3 py-2 space-y-1">
                        <p><strong>💡 Hint:</strong> Har row me sahi Master Data product search karo.</p>
                        <p><strong>Naya Product?</strong> Aap <strong>"Add New Item"</strong> button se yahin par directly naya product master data me add kar sakte hain, ya phir "Refresh Data" karke manually add kiye gaye changes sync kar sakte hain.</p>
                      </div>

                      {unmappedGroups.map(({ artworkNo, suggestions }) => {
                        const mapped = nameMapping[artworkNo];
                        const mappedProduct = mapped ? allProducts.find(p => p.id === mapped) : null;
                        const rowCount = fgRows.filter(r => r.artworkNo === artworkNo && r._error?.includes('not found')).length;

                        return (
                          <div key={artworkNo} className="bg-white border border-orange-200 rounded-lg p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded font-mono font-bold truncate max-w-[200px]" title={artworkNo}>
                                    {artworkNo}
                                  </span>
                                  <span className="text-xs text-muted-foreground">({rowCount} rows)</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground mb-2">Excel / Tally ka naam</div>

                                {/* Searchable Dropdown: select Master Data product */}
                                <SearchableDropdown
                                  options={[
                                    ...suggestions.map(p => ({
                                      id: p.id,
                                      label: `${p.artworkNo} — ${p.itemName || ''} ${p.customerName ? `(${p.customerName})` : ''}`,
                                      group: '🎯 Suggested Matches'
                                    })),
                                    ...allProducts.map(p => ({
                                      id: p.id,
                                      label: `${p.artworkNo} — ${p.itemName || ''} ${p.customerName ? `(${p.customerName})` : ''}`,
                                      group: '📋 All Products'
                                    }))
                                  ]}
                                  value={mapped || ''}
                                  onChange={val => {
                                    setNameMapping(prev => ({ ...prev, [artworkNo]: val }));
                                    if (val) setSkipMapping(prev => { const n = { ...prev }; delete n[artworkNo]; return n; });
                                  }}
                                  placeholder="🔍 Type customer or item name to search..."
                                />

                                {/* Show mapped result */}
                                {mappedProduct && (
                                  <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span>✅ <strong>{mappedProduct.artworkNo}</strong> — {mappedProduct.itemName} {mappedProduct.customerName ? `(${mappedProduct.customerName})` : ''}</span>
                                  </div>
                                )}
                              </div>

                              {/* Skip button */}
                              <button
                                onClick={() => {
                                  setSkipMapping(prev => ({ ...prev, [artworkNo]: true }));
                                  setNameMapping(prev => { const n = { ...prev }; delete n[artworkNo]; return n; });
                                }}
                                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors shrink-0 font-medium"
                                title="Yeh artwork ke saare rows skip karo (import nahi honge)"
                              >
                                Skip ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Skipped items */}
                      {Object.keys(skipMapping).length > 0 && (
                        <div className="border border-dashed border-gray-300 rounded-lg p-2">
                          <p className="text-[11px] text-muted-foreground font-semibold mb-1">Skipped (import nahi honge):</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(skipMapping).map(artNo => (
                              <span
                                key={artNo}
                                className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full"
                              >
                                {artNo}
                                <button
                                  onClick={() => setSkipMapping(prev => { const n = { ...prev }; delete n[artNo]; return n; })}
                                  className="text-gray-400 hover:text-gray-700 ml-0.5"
                                >×</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* FinishGoods Table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors text-sm font-bold text-foreground"
                  onClick={() => setShowFG(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-primary" />
                    Finish Goods Preview ({fgRows.length} rows)
                  </div>
                  {showFG ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showFG && (
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr>
                          {['Row','Date','Type','Artwork No','Category','Op.Bal','Rate','Qty','Invoice No','Product Name','Customer','Status'].map(h => (
                            <th key={h} className="px-3 py-2 font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {effectiveFgRows.map(row => (
                          <tr
                            key={row._rowNum}
                            className={
                              row._status === 'ERROR' ? 'bg-red-50/60 dark:bg-red-900/10' :
                              row._status === 'WARN'  ? 'bg-amber-50/60 dark:bg-amber-900/10' :
                              'bg-card hover:bg-muted/30'
                            }
                          >
                            <td className="px-3 py-2 text-muted-foreground font-mono">{row._rowNum}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium">{row.date}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                row.type === 'IN'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                              }`}>{row.type}</span>
                            </td>
                            <td className="px-3 py-2 font-mono">{row.artworkNo}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.category}</td>
                            <td className="px-3 py-2 text-right">{row.openingBalance || '-'}</td>
                            <td className="px-3 py-2 text-right">₹{row.rate}</td>
                            <td className="px-3 py-2 text-right font-bold">{row.quantity}</td>
                            <td className="px-3 py-2 font-mono text-xs">{row.invoiceNo || '-'}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate" title={row.productName}>{row.productName || '—'}</td>
                            <td className="px-3 py-2 max-w-[100px] truncate" title={row.customerName}>{row.customerName || '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row._status === 'ERROR' ? (
                                <span className="text-red-600 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span title={row._error} className="cursor-help underline decoration-dotted">ERROR</span>
                                </span>
                              ) : row._status === 'WARN' ? (
                                <span className="text-amber-600 font-semibold flex items-center gap-1" title={row._error}>
                                  ⚠️ WARN
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* FreightCharges Table */}
              {freightRows.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors text-sm font-bold text-foreground"
                    onClick={() => setShowFreight(v => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      Freight Charges Preview ({freightRows.length} Gaadiyan) — Total: ₹{totalFreightSum.toLocaleString('en-IN')}
                    </div>
                    {showFreight ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showFreight && (
                    <div className="overflow-auto max-h-60">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                          <tr>
                            {['Row','Date','Invoice No','Customer','Place','Transporter','Vehicle No','Size','Freight','Holding','Point','Others'].map(h => (
                              <th key={h} className="px-3 py-2 font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {freightRows.map(row => (
                            <tr key={row._rowNum} className="bg-card hover:bg-muted/30">
                              <td className="px-3 py-2 text-muted-foreground font-mono">{row._rowNum}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-medium">{row.date}</td>
                              <td className="px-3 py-2 font-mono font-bold text-primary">{row.invoiceNo}</td>
                              <td className="px-3 py-2">{row.customerName}</td>
                              <td className="px-3 py-2">{row.place}</td>
                              <td className="px-3 py-2">{row.transporterName}</td>
                              <td className="px-3 py-2 font-mono">{row.vehicleNo}</td>
                              <td className="px-3 py-2">{row.vehicleSize}</td>
                              <td className="px-3 py-2 text-right font-medium">₹{row.freight}</td>
                              <td className="px-3 py-2 text-right">₹{row.holding}</td>
                              <td className="px-3 py-2 text-right">₹{row.point}</td>
                              <td className="px-3 py-2 text-right">₹{row.others}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === 'importing' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <h3 className="text-base font-bold text-foreground">Import chal raha hai...</h3>
              </div>
              <div className="bg-muted/30 border border-border rounded-xl p-4 font-mono text-xs space-y-1 max-h-72 overflow-auto">
                {importLog.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.includes('✅') ? 'text-emerald-600' :
                      line.includes('❌') ? 'text-red-600' :
                      line.includes('⚠️') ? 'text-amber-600' :
                      line.includes('🎉') ? 'text-primary font-bold text-sm' :
                      'text-muted-foreground'
                    }
                  >
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && (
            <div className="p-10 flex flex-col items-center gap-6 text-center">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-5 rounded-full">
                <CheckCircle2 className="w-14 h-14 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-foreground mb-2">Import Successful! 🎉</h3>
                <p className="text-muted-foreground">
                  Finish Goods aur Freight Charges data successfully import ho gaya.
                </p>
              </div>
              <div className="bg-muted/30 border border-border rounded-xl p-4 font-mono text-xs space-y-1 max-h-52 overflow-auto w-full max-w-xl text-left">
                {importLog.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.includes('✅') ? 'text-emerald-600' :
                      line.includes('❌') ? 'text-red-600' :
                      line.includes('🎉') ? 'text-primary font-bold' :
                      'text-muted-foreground'
                    }
                  >
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold text-base shadow-lg hover:bg-primary/90 transition-all"
              >
                Done — Page Refresh Karo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'upload' || step === 'preview') && (
          <div className="px-6 py-4 border-t border-border bg-card shrink-0 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>

            {step === 'preview' && (
              <div className="flex items-center gap-3">
                {hasErrors && (
                  <button
                    onClick={downloadErrorReport}
                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    title={`${fgErr} error rows ka Excel download karo — missing Artwork Nos dekhne ke liye`}
                  >
                    <Download className="w-4 h-4" />
                    {fgErr} Errors Download
                  </button>
                )}
                <button
                  onClick={() => { setStep('upload'); setFgRows([]); setFreightRows([]); setFileName(''); }}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                >
                  ← Dobara Upload
                </button>
                <button
                  onClick={() => {
                    if (resetMode) {
                      if (!window.confirm(
                        'FINAL WARNING!\n\nReset Mode ON hai.\nImport dabate hi SAARA purana Finish Goods data permanently DELETE ho jaayega.\n\nKya aap 100% sure hain? Yeh undo nahi hoga!'
                      )) return;
                    }
                    handleImport();
                  }}
                  disabled={fgOK + fgWarn === 0 || isResetting}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    resetMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isResetting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</>
                  ) : resetMode ? (
                    <><Trash2 className="w-4 h-4" /> Reset + Import ({fgOK + fgWarn} rows)</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Import Karo ({fgOK + fgWarn} rows + {freightRows.length} freight)</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isAddTradingItemOpen && (
        <AddTradingItemModal 
          onClose={() => setIsAddTradingItemOpen(false)}
          onSuccess={() => {
            setIsAddTradingItemOpen(false);
            handleReloadProducts(); // Reload products to get the newly added item
          }}
        />
      )}
    </div>
  );
}

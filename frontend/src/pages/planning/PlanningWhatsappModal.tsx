import React, { useState, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  X, Download, Share2, Loader2, FileText, 
  Sparkles, Box, Factory, Truck, Check
} from 'lucide-react';
import type { CorrugationPlanningRow, DispatchPlanGroup } from './PlanningTypes';

interface PlanningWhatsappModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'corrugation' | 'dispatch';
  dateStr: string;
  formattedDateStr: string;
  corrugationRows?: CorrugationPlanningRow[];
  dispatchGroups?: DispatchPlanGroup[];
  totalPly?: number;
  totalBoxQty?: number;
  onCopyTextReport: () => void;
}

/**
 * Paginates dispatch customer groups strictly keeping each customer's items intact.
 * Rule 1: NEVER split a customer's items across two pages.
 * Rule 2: If only 1-2 small lines exceed, auto-adjust in compact mode on current page.
 * Rule 3: Otherwise, move the entire customer group to next page.
 * Supports unlimited pages (1, 2, 3, 4, ...).
 */
function paginateDispatchGroups(groups: DispatchPlanGroup[]): { pages: DispatchPlanGroup[][]; isCompact: boolean } {
  const activeGroups = groups.filter(g => 
    (g.customerName && g.customerName.trim().length > 0) || 
    (g.items && g.items.some(i => (i.jobName && i.jobName.trim().length > 0) || i.qty))
  );

  if (activeGroups.length === 0) {
    return { pages: [[]], isCompact: false };
  }

  // A4 Portrait height budget:
  // Page 1 capacity: ~840px (allowing for logo, header, KPI boxes, footer, subtotal)
  // Page 2+ capacity: ~920px
  const PAGE1_CAPACITY = 840;
  const SUBSEQUENT_PAGE_CAPACITY = 920;
  const COMPACT_TOLERANCE = 55; // 1-2 lines tolerance

  const weights = activeGroups.map(grp => {
    const validItems = (grp.items || []).filter(i => (i.jobName && i.jobName.trim().length > 0) || i.qty);
    const count = Math.max(1, validItems.length);
    const stdH = 76 + (count * 28);
    const compH = 62 + (count * 22);
    return { group: grp, stdH, compH, count };
  });

  const totalStdH = weights.reduce((sum, w) => sum + w.stdH, 0);
  const totalCompH = weights.reduce((sum, w) => sum + w.compH, 0);

  // Single page fits normally
  if (totalStdH <= PAGE1_CAPACITY) {
    return { pages: [activeGroups], isCompact: false };
  }

  // Single page fits with compact auto-adjustment (1-2 lines over)
  if (totalCompH <= PAGE1_CAPACITY + COMPACT_TOLERANCE) {
    return { pages: [activeGroups], isCompact: true };
  }

  // Multiple pages (Customer blocks NEVER split)
  const pages: DispatchPlanGroup[][] = [];
  let currentPage: DispatchPlanGroup[] = [];
  let currentHeight = 0;
  let pageLimit = PAGE1_CAPACITY;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];

    if (currentPage.length > 0 && (currentHeight + w.stdH > pageLimit)) {
      // Check if this is the last group and compact mode fits
      const remaining = weights.slice(i);
      const remainingCompH = remaining.reduce((s, r) => s + r.compH, 0);
      const currentCompH = currentPage.reduce((s, g) => {
        const itemW = weights.find(x => x.group.id === g.id);
        return s + (itemW ? itemW.compH : 80);
      }, 0);

      if (currentCompH + remainingCompH <= pageLimit + COMPACT_TOLERANCE) {
        currentPage.push(w.group);
        currentHeight += w.stdH;
        continue;
      }

      // Customer does not fit without cutting -> MOVE ENTIRE CUSTOMER TO NEXT PAGE!
      pages.push(currentPage);
      currentPage = [w.group];
      currentHeight = w.stdH;
      pageLimit = SUBSEQUENT_PAGE_CAPACITY;
    } else {
      currentPage.push(w.group);
      currentHeight += w.stdH;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return { pages, isCompact: false };
}

/**
 * Paginates corrugation rows cleanly for Portrait A4.
 */
function paginateCorrugationRows(rows: CorrugationPlanningRow[]): { pages: CorrugationPlanningRow[][]; isCompact: boolean } {
  const activeRows = rows.filter(r => r.customerName || r.jobName);
  if (activeRows.length <= 18) {
    return { pages: [activeRows], isCompact: false };
  }
  if (activeRows.length <= 22) {
    return { pages: [activeRows], isCompact: true };
  }
  
  // Split into pages of ~18 rows
  const pages: CorrugationPlanningRow[][] = [];
  for (let i = 0; i < activeRows.length; i += 18) {
    pages.push(activeRows.slice(i, i + 18));
  }
  return { pages, isCompact: false };
}

export default function PlanningWhatsappModal({
  isOpen,
  onClose,
  type,
  dateStr,
  formattedDateStr,
  corrugationRows = [],
  dispatchGroups = [],
  totalPly = 0,
  totalBoxQty = 0,
  onCopyTextReport,
}: PlanningWhatsappModalProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // References to rendered Portrait A4 card elements (all kept live in DOM)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isCorrugation = type === 'corrugation';

  // 1. Paginate data
  const dispatchPagination = useMemo(() => {
    return paginateDispatchGroups(dispatchGroups);
  }, [dispatchGroups]);

  const corrugationPagination = useMemo(() => {
    return paginateCorrugationRows(corrugationRows);
  }, [corrugationRows]);

  const pagesCount = isCorrugation 
    ? corrugationPagination.pages.length 
    : dispatchPagination.pages.length;

  const isCompact = isCorrugation
    ? corrugationPagination.isCompact
    : dispatchPagination.isCompact;

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /**
   * Captures an exact Portrait A4 DOM element with crisp DPI.
   */
  const captureElement = async (element: HTMLElement) => {
    const parent = element.parentElement;
    const origScrollTop = parent ? parent.scrollTop : 0;
    if (parent) parent.scrollTop = 0;

    const scrollWidth = element.scrollWidth || element.offsetWidth;
    const scrollHeight = element.scrollHeight || element.offsetHeight;

    try {
      return await html2canvas(element, {
        scale: 2.2, // 2.2x High DPI for crystal-clear readability
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: scrollWidth,
        height: scrollHeight,
        windowWidth: scrollWidth + 100,
        windowHeight: scrollHeight + 100,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (_clonedDoc, clonedEl) => {
          clonedEl.style.transform = 'none';
          clonedEl.style.maxHeight = 'none';
          clonedEl.style.height = 'auto';
          clonedEl.style.overflow = 'visible';
          let p = clonedEl.parentElement;
          while (p) {
            p.style.overflow = 'visible';
            p.style.maxHeight = 'none';
            p.style.height = 'auto';
            p = p.parentElement;
          }
        }
      });
    } finally {
      if (parent) parent.scrollTop = origScrollTop;
    }
  };

  /**
   * 1. Copy Selected Vertical A4 Page Image to Clipboard (Ctrl+V into WhatsApp)
   * Uses Promise<Blob> pattern so Chromium never revokes the user gesture!
   */
  const handleCopyPageImage = async (pageIdx: number) => {
    const targetEl = pageRefs.current[pageIdx];
    if (!targetEl) {
      showToast('❌ Page element not found');
      return;
    }

    setIsCapturing(true);

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        // Standard Chromium Async Clipboard Item with Promise<Blob>
        const clipboardPromise = new Promise<Blob>(async (resolve, reject) => {
          try {
            const canvas = await captureElement(targetEl);
            if (!canvas) return reject(new Error('Canvas capture failed'));
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Blob conversion failed'));
            }, 'image/png');
          } catch (e) {
            reject(e);
          }
        });

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': clipboardPromise })
        ]);

        setCopiedIndex(pageIdx);
        const label = pagesCount > 1 ? `Part ${pageIdx + 1}` : 'Dispatch Plan';
        showToast(`✅ ${label} Image Copied! WhatsApp me jaakar Ctrl + V karein.`);
        setTimeout(() => setCopiedIndex(null), 3500);
      } else {
        // Fallback for browsers without image clipboard support
        await handleDownloadPageImage(pageIdx);
        showToast('📥 Image Downloaded! WhatsApp par attach karke bhein.');
      }
    } catch (clipErr) {
      console.warn('Clipboard write failed, downloading image instead:', clipErr);
      await handleDownloadPageImage(pageIdx);
      showToast('⚠️ Clipboard unsupported. Image downloaded successfully!');
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * 2. Download Image as PNG for a specific page
   */
  const handleDownloadPageImage = async (pageIdx: number) => {
    const targetEl = pageRefs.current[pageIdx];
    if (!targetEl) return;
    setIsCapturing(true);
    try {
      const canvas = await captureElement(targetEl);
      if (!canvas) return;

      const link = document.createElement('a');
      const pageSuffix = pagesCount > 1 ? `_Part${pageIdx + 1}` : '';
      link.download = `Packwell_${isCorrugation ? 'Corrugation' : 'Dispatch'}_${dateStr}${pageSuffix}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`📥 Part ${pageIdx + 1} PNG Downloaded!`);
    } catch (e) {
      console.error(e);
      showToast('❌ Failed to download image');
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * 3. Download True Multi-Page Vertical A4 PDF (Customer-Intact across 1, 2, 3, 4+ pages)
   */
  const handleDownloadPdf = async () => {
    setIsCapturing(true);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 5;
      const usableWidth = pageWidth - (margin * 2); // 200mm
      const usableHeight = pageHeight - (margin * 2); // 287mm

      for (let pIdx = 0; pIdx < pagesCount; pIdx++) {
        const pageEl = pageRefs.current[pIdx];
        if (!pageEl) continue;

        if (pIdx > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const canvas = await captureElement(pageEl);
        if (!canvas) continue;

        const imgData = canvas.toDataURL('image/png');
        const renderedHeight = (canvas.height * usableWidth) / canvas.width;

        if (renderedHeight > usableHeight) {
          const scaledWidth = (usableHeight * canvas.width) / canvas.height;
          const leftOffset = margin + ((usableWidth - scaledWidth) / 2);
          pdf.addImage(imgData, 'PNG', leftOffset, margin, scaledWidth, usableHeight);
        } else {
          pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, renderedHeight);
        }
      }

      pdf.save(`Packwell_${isCorrugation ? 'Corrugation' : 'Dispatch'}_Plan_${dateStr}.pdf`);
      showToast(`📄 ${pagesCount} Page Vertical A4 PDF Downloaded! WhatsApp group me attach karein.`);
    } catch (e) {
      console.error(e);
      showToast('❌ PDF export failed.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Helper to calculate cumulative customer start index for Page N
  const getStartingCustomerIndex = (pIdx: number): number => {
    if (isCorrugation || pIdx === 0) return 0;
    let sum = 0;
    for (let i = 0; i < pIdx; i++) {
      sum += (dispatchPagination.pages[i] || []).length;
    }
    return sum;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 border border-emerald-500/80 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold animate-in slide-in-from-top-3">
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp & PDF Export Center
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Vertical A4 Boxes
                </span>
                {pagesCount > 1 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {pagesCount} Pages (Customer Intact)
                  </span>
                )}
                {isCompact && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Auto-Adjusted 1 Page
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isCorrugation ? 'Corrugation Machine Planning' : 'Dispatch Planning'} • {formattedDateStr}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Action: Download Vertical A4 PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isCapturing}
              title="Download Vertical A4 PDF with all pages ready to attach to WhatsApp"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-950/40 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>Download PDF ({pagesCount} Page{pagesCount > 1 ? 's' : ''} Vertical A4)</span>
            </button>

            {/* Copy Image Buttons */}
            {pagesCount === 1 ? (
              <button
                onClick={() => handleCopyPageImage(0)}
                disabled={isCapturing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedIndex === 0 ? 'Image Copied!' : 'Copy Image (Ctrl+V in WhatsApp)'}</span>
              </button>
            ) : (
              Array.from({ length: pagesCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleCopyPageImage(idx)}
                  disabled={isCapturing}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{copiedIndex === idx ? `Part ${idx + 1} Copied!` : `Copy Part ${idx + 1} Image`}</span>
                </button>
              ))
            )}

            {/* Download PNG Buttons */}
            {pagesCount === 1 ? (
              <button
                onClick={() => handleDownloadPageImage(0)}
                disabled={isCapturing}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download PNG</span>
              </button>
            ) : (
              Array.from({ length: pagesCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleDownloadPageImage(idx)}
                  disabled={isCapturing}
                  className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>PNG Part {idx + 1}</span>
                </button>
              ))
            )}

            {/* Copy Text Option */}
            <button
              onClick={() => {
                onCopyTextReport();
                showToast('📝 Text report copied to clipboard!');
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy Text</span>
            </button>
          </div>

          <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 px-3 py-1 rounded-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>PDF Tip:</strong> Download PDF dabakar direct WhatsApp group me file attach kar dein (100% crisp rahegi).
            </span>
          </div>
        </div>

        {/* Scrollable Preview Area (ALL PAGES RENDERED LIVE) */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex flex-col items-center gap-8">
          {Array.from({ length: pagesCount }).map((_, pIdx) => {
            const startCustIdx = getStartingCustomerIndex(pIdx);

            const pageDispatchGroups = dispatchPagination.pages[pIdx] || [];
            const pageCorrugationRows = corrugationPagination.pages[pIdx] || [];

            const pageItemsCount = isCorrugation
              ? pageCorrugationRows.length
              : pageDispatchGroups.reduce((acc, g) => acc + (g.items || []).filter(i => i.jobName || i.qty).length, 0);

            const pageBoxQty = isCorrugation
              ? pageCorrugationRows.reduce((sum, r) => sum + (Number(r.boxQty) || 0), 0)
              : pageDispatchGroups.reduce((acc, g) => {
                  return acc + (g.items || []).reduce((itemSum, item) => itemSum + (Number(item.qty) || 0), 0);
                }, 0);

            const pagePlyQty = isCorrugation
              ? pageCorrugationRows.reduce((sum, r) => sum + (Number(r.nosOfPly) || 0), 0)
              : 0;

            return (
              <div
                key={pIdx}
                className="w-[820px]"
                style={{ width: '820px', minWidth: '820px' }}
              >
                {/* Visual Page Tag above card */}
                {pagesCount > 1 && (
                  <div className="text-xs font-bold text-slate-400 mb-2 flex items-center justify-between px-1">
                    <span className="uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                      PAGE {pIdx + 1} OF {pagesCount} (PORTRAIT A4)
                    </span>
                    <span className="text-emerald-400">
                      {isCorrugation 
                        ? `${pageCorrugationRows.length} Jobs` 
                        : `${pageDispatchGroups.length} Customer Parties • ${pageItemsCount} Items`}
                    </span>
                  </div>
                )}

                {/* THE VERTICAL A4 CARD RENDERED FOR HTML2CANVAS */}
                <div
                  ref={(el) => { pageRefs.current[pIdx] = el; }}
                  className={`bg-white text-slate-900 w-[820px] min-h-[1140px] p-6 rounded-xl border-2 border-slate-900 shadow-2xl flex flex-col justify-between font-sans ${
                    isCompact ? 'text-[10px]' : 'text-[11px]'
                  }`}
                  style={{ minWidth: '820px', minHeight: '1140px' }}
                >
                  {/* Top Header & Table */}
                  <div>
                    {/* Brand Header */}
                    <div className="border-b-2 border-slate-900 pb-3 mb-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center font-black text-sm">
                            PI
                          </div>
                          <div>
                            <h1 className="text-xl font-black text-blue-950 tracking-tight leading-none">
                              PACKWELL INDIA
                            </h1>
                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
                              Corrugated Packaging Manufacturer
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2.5">
                        {pagesCount > 1 && (
                          <span className="text-xs font-black px-2 py-1 bg-blue-100 text-blue-950 rounded border border-blue-900 uppercase">
                            PAGE {pIdx + 1} OF {pagesCount}
                          </span>
                        )}
                        <span className="text-sm font-black px-3 py-1 bg-amber-400 text-slate-950 rounded-md border border-slate-900 inline-block uppercase tracking-wider">
                          {isCorrugation ? 'CORRUGATION PLANNING' : 'DISPATCH PLANNING'}
                        </span>
                        <div className="text-xs font-bold text-slate-700">
                          DATE: <span className="text-blue-900 text-sm font-black">{formattedDateStr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Metric Badges */}
                    <div className="grid grid-cols-3 gap-2.5 mb-3">
                      <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-blue-700">
                            {isCorrugation ? 'Planned Jobs on Page' : 'Parties on Page'}
                          </span>
                          <span className="text-base font-black text-blue-950 block">
                            {isCorrugation ? pageCorrugationRows.length : pageDispatchGroups.length}
                            {pagesCount > 1 && (
                              <span className="text-[10px] font-semibold text-slate-500 ml-1">
                                (Total: {isCorrugation ? corrugationRows.filter(r => r.customerName || r.jobName).length : dispatchGroups.length})
                              </span>
                            )}
                          </span>
                        </div>
                        <Factory className="w-4 h-4 text-blue-600" />
                      </div>

                      <div className="bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-amber-800">
                            {isCorrugation ? 'Nos of Ply on Page' : 'Items on Page'}
                          </span>
                          <span className="text-base font-black text-amber-950 block">
                            {isCorrugation ? pagePlyQty.toLocaleString() : pageItemsCount}
                          </span>
                        </div>
                        <Box className="w-4 h-4 text-amber-600" />
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-emerald-800">
                            {pagesCount > 1 ? `Page ${pIdx + 1} Box Qty` : 'Total Box Quantity'}
                          </span>
                          <span className="text-base font-black text-emerald-950 block">
                            {pageBoxQty.toLocaleString()}
                            {pagesCount > 1 && (
                              <span className="text-[10px] font-semibold text-slate-500 ml-1">
                                / {totalBoxQty.toLocaleString()}
                              </span>
                            )}
                          </span>
                        </div>
                        <Truck className="w-4 h-4 text-emerald-600" />
                      </div>
                    </div>

                    {/* Table / Customer Groups */}
                    {isCorrugation ? (
                      /* Corrugation Table in Portrait */
                      <table className="w-full border-collapse border border-slate-900 text-[10px]">
                        <thead>
                          <tr className="bg-amber-300 text-slate-950 font-black uppercase text-[9px] text-center border-b-2 border-slate-900">
                            <th className="border border-slate-900 px-1.5 py-1 w-8">#</th>
                            <th className="border border-slate-900 px-2 py-1 text-left w-40">Customer Name</th>
                            <th className="border border-slate-900 px-2 py-1 text-left">Job Name</th>
                            <th className="border border-slate-900 px-1 py-1 w-14">Reel</th>
                            <th className="border border-slate-900 px-1 py-1 w-14">Cut</th>
                            <th className="border border-slate-900 px-1 py-1 w-10">UPS</th>
                            <th className="border border-slate-900 px-1 py-1 w-10">Flute</th>
                            <th className="border border-slate-900 px-1.5 py-1 w-16 text-right">Nos Ply</th>
                            <th className="border border-slate-900 px-1.5 py-1 w-16 text-right bg-amber-400">Box Qty</th>
                            <th className="border border-slate-900 px-1.5 py-1 w-24 text-left">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageCorrugationRows.map((row, rIdx) => {
                            const globalIdx = (pIdx * 18) + rIdx + 1;
                            return (
                              <tr 
                                key={row.id || rIdx}
                                className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                              >
                                <td className="border border-slate-900 px-1 py-0.5 text-center font-bold text-slate-800">
                                  {globalIdx}
                                </td>
                                <td className="border border-slate-900 px-2 py-0.5 font-bold text-blue-900 truncate max-w-[150px]">
                                  {row.customerName || '-'}
                                </td>
                                <td className="border border-slate-900 px-2 py-0.5 font-extrabold text-slate-900 truncate max-w-[180px]">
                                  {row.jobName || '-'}
                                </td>
                                <td className="border border-slate-900 px-1 py-0.5 text-center font-bold font-mono">
                                  {row.reelSize || '-'}
                                </td>
                                <td className="border border-slate-900 px-1 py-0.5 text-center font-bold font-mono">
                                  {row.cutSize || '-'}
                                </td>
                                <td className="border border-slate-900 px-1 py-0.5 text-center font-bold">
                                  {row.ups || '-'}
                                </td>
                                <td className="border border-slate-900 px-1 py-0.5 text-center font-black text-blue-800">
                                  {row.fluteType || '-'}
                                </td>
                                <td className="border border-slate-900 px-1.5 py-0.5 text-right font-black font-mono text-slate-900">
                                  {(Number(row.nosOfPly) || 0).toLocaleString()}
                                </td>
                                <td className="border border-slate-900 px-1.5 py-0.5 text-right font-black font-mono text-emerald-900 bg-amber-100">
                                  {(Number(row.boxQty) || 0).toLocaleString()}
                                </td>
                                <td className="border border-slate-900 px-1.5 py-0.5 text-slate-700 italic truncate max-w-[100px]">
                                  {row.remarks || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200 border-t-2 border-slate-900 font-black text-[10px]">
                            <td colSpan={7} className="border border-slate-900 px-2 py-1 text-right uppercase">
                              {pagesCount > 1 ? `PAGE ${pIdx + 1} SUB-TOTAL:` : 'GRAND TOTAL:'}
                            </td>
                            <td className="border border-slate-900 px-1.5 py-1 text-right font-mono text-blue-950 font-black">
                              {pagePlyQty.toLocaleString()}
                            </td>
                            <td className="border border-slate-900 px-1.5 py-1 text-right font-mono text-emerald-950 font-black bg-amber-300">
                              {pageBoxQty.toLocaleString()}
                            </td>
                            <td className="border border-slate-900 px-1.5 py-1"></td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      /* Dispatch Planning - Intact Customer Groups */
                      <div className={isCompact ? 'space-y-2' : 'space-y-2.5'}>
                        {pageDispatchGroups.map((grp, gIdx) => {
                          const customerNumber = startCustIdx + gIdx + 1;
                          const partyItems = (grp.items || []).filter(i => (i.jobName && i.jobName.trim().length > 0) || i.qty);
                          const partyTotal = partyItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

                          return (
                            <div 
                              key={grp.id || gIdx} 
                              className="border-2 border-slate-900 rounded-lg overflow-hidden shadow-2xs"
                            >
                              {/* Party Header Bar */}
                              <div className={`bg-slate-900 text-white flex justify-between items-center font-black ${
                                isCompact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center shrink-0">
                                    {customerNumber}
                                  </span>
                                  <span className="tracking-wide uppercase font-black text-white">
                                    {grp.customerName || 'CUSTOMER PARTY'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold">
                                  <span className="text-amber-300">
                                    Total: <strong className="text-white font-black font-mono">{partyTotal.toLocaleString()}</strong> Boxes
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-normal">
                                    {grp.dispatchDate || formattedDateStr}
                                  </span>
                                </div>
                              </div>

                              {/* Party Items Table */}
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="bg-slate-100 font-bold border-b border-slate-900 text-[9px] text-slate-800">
                                    <th className="border-r border-slate-900 px-2 py-0.5 w-8 text-center">#</th>
                                    <th className="border-r border-slate-900 px-2.5 py-0.5 text-left">Job / Item Name</th>
                                    <th className="border-r border-slate-900 px-2.5 py-0.5 w-28 text-right bg-amber-100 font-black">
                                      Dispatch Qty
                                    </th>
                                    <th className="px-2.5 py-0.5 w-44 text-left">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {partyItems.map((item, iIdx) => (
                                    <tr 
                                      key={item.id || iIdx} 
                                      className={iIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
                                    >
                                      <td className="border-r border-t border-slate-300 px-2 py-1 text-center font-bold text-slate-700 text-[10px]">
                                        {iIdx + 1}
                                      </td>
                                      <td className="border-r border-t border-slate-300 px-2.5 py-1 font-bold text-slate-900 text-[11px]">
                                        {item.jobName || '-'}
                                      </td>
                                      <td className="border-r border-t border-slate-300 px-2.5 py-1 text-right font-black font-mono text-emerald-950 bg-amber-50 text-[11px]">
                                        {(Number(item.qty) || 0).toLocaleString()}
                                      </td>
                                      <td className="border-t border-slate-300 px-2.5 py-1 text-slate-600 italic text-[10px]">
                                        {(item as any).remarks || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer & Page Totals */}
                  <div className="mt-4 pt-2">
                    {/* Page Subtotal */}
                    <div className="bg-slate-100 border-2 border-slate-900 rounded-lg p-2 flex items-center justify-between font-black text-xs text-slate-900 mb-2">
                      <span className="uppercase tracking-wider">
                        {pagesCount > 1 ? `PAGE ${pIdx + 1} TOTAL BOXES:` : 'GRAND TOTAL DISPATCH BOXES:'}
                      </span>
                      <span className="text-sm font-black font-mono text-emerald-950 px-2.5 py-0.5 rounded bg-amber-300 border border-slate-900">
                        {pageBoxQty.toLocaleString()} Boxes
                      </span>
                    </div>

                    {/* Grand Total on Final Page */}
                    {pagesCount > 1 && pIdx === pagesCount - 1 && (
                      <div className="bg-slate-900 text-white rounded-lg p-2 flex items-center justify-between font-black text-xs mb-2">
                        <span className="uppercase tracking-wider text-amber-300">
                          GRAND TOTAL (ALL PAGES):
                        </span>
                        <span className="text-sm font-black font-mono text-white px-2.5 py-0.5 rounded bg-emerald-600">
                          {totalBoxQty.toLocaleString()} Boxes
                        </span>
                      </div>
                    )}

                    {/* Footer Credits */}
                    <div className="border-t border-slate-400 pt-1.5 flex items-center justify-between text-[9px] text-slate-500 font-medium">
                      <span>Packwell ERP Daily Production Planning • Vertical A4 Customer-Intact Card</span>
                      <span>
                        Page {pIdx + 1} of {pagesCount} • Generated: {new Date().toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

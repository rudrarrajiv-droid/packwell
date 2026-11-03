import React, { useState, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  X, Download, Share2, Loader2, FileText, 
  Sparkles, Box, Factory, Truck, Info, Layers, Eye
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
 * Rule 2: If only 1-2 small lines exceed, auto-adjust in compact mode on Page 1.
 * Rule 3: Otherwise, move the entire customer group to Page 2.
 */
function paginateDispatchGroups(groups: DispatchPlanGroup[]): { pages: DispatchPlanGroup[][]; isCompact: boolean } {
  // Only include groups with a customer name or non-empty items
  const activeGroups = groups.filter(g => 
    (g.customerName && g.customerName.trim().length > 0) || 
    (g.items && g.items.some(i => (i.jobName && i.jobName.trim().length > 0) || i.qty))
  );

  if (activeGroups.length === 0) {
    return { pages: [[]], isCompact: false };
  }

  // Calculate approximate pixel height for each customer party block
  // Standard A4 portrait is ~1130px. Overhead (Header, Badges, Footer, Totals) ~ 260px.
  // Standard usable height: ~870px. Compact usable height: ~940px.
  const PAGE1_STANDARD_CAPACITY = 870;
  const PAGE1_COMPACT_CAPACITY = 940;
  const SUBSEQUENT_PAGE_CAPACITY = 920;

  const weights = activeGroups.map(grp => {
    const validItems = (grp.items || []).filter(i => (i.jobName && i.jobName.trim().length > 0) || i.qty);
    const count = Math.max(1, validItems.length);
    // Standard: header 38px + table-head 26px + count*28px + margin 14px
    const stdH = 78 + (count * 28);
    // Compact: header 32px + table-head 22px + count*22px + margin 10px
    const compH = 64 + (count * 22);
    return { group: grp, stdH, compH, count };
  });

  const totalStdH = weights.reduce((sum, w) => sum + w.stdH, 0);
  const totalCompH = weights.reduce((sum, w) => sum + w.compH, 0);

  // Case 1: Fits comfortably in 1 standard page
  if (totalStdH <= PAGE1_STANDARD_CAPACITY) {
    return { pages: [activeGroups], isCompact: false };
  }

  // Case 2: Auto-adjust: 1-2 lines exceed, squeeze automatically onto Page 1 in compact mode!
  if (totalCompH <= PAGE1_COMPACT_CAPACITY) {
    return { pages: [activeGroups], isCompact: true };
  }

  // Case 3: Needs 2 (or more) pages. Customer groups MUST NEVER BE SPLIT!
  const pages: DispatchPlanGroup[][] = [];
  let currentPage: DispatchPlanGroup[] = [];
  let currentHeight = 0;
  let pageLimit = PAGE1_STANDARD_CAPACITY;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];

    // If adding this group exceeds page limit
    if (currentPage.length > 0 && (currentHeight + w.stdH > pageLimit)) {
      // Check if this is the last remaining group and compact fits on Page 1
      const remaining = weights.slice(i);
      const remainingCompH = remaining.reduce((s, r) => s + r.compH, 0);
      const currentCompH = currentPage.reduce((s, g) => {
        const itemW = weights.find(x => x.group.id === g.id);
        return s + (itemW ? itemW.compH : 80);
      }, 0);

      if (currentCompH + remainingCompH <= PAGE1_COMPACT_CAPACITY) {
        // Auto-adjusted on current page!
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
    // 1-2 lines over -> auto-adjust compact mode
    return { pages: [activeRows], isCompact: true };
  }
  // 2 pages
  return {
    pages: [
      activeRows.slice(0, 18),
      activeRows.slice(18)
    ],
    isCompact: false
  };
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
  const [copiedImage, setCopiedImage] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [showAllPagesView, setShowAllPagesView] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // References to rendered Portrait A4 card elements
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
   * Captures an exact Portrait A4 DOM element without any scroll clipping.
   */
  const captureElement = async (element: HTMLElement) => {
    const parent = element.parentElement;
    const origScrollTop = parent ? parent.scrollTop : 0;
    if (parent) parent.scrollTop = 0;

    const scrollWidth = element.scrollWidth || element.offsetWidth;
    const scrollHeight = element.scrollHeight || element.offsetHeight;

    try {
      return await html2canvas(element, {
        scale: 2.2, // Crisp 2.2x DPI for crystal-clear readability
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

  // 1. Copy Selected Vertical A4 Image to Clipboard (for WhatsApp Ctrl+V)
  const handleCopyImageToClipboard = async () => {
    setIsCapturing(true);
    try {
      const targetEl = pageRefs.current[activePageIndex];
      if (!targetEl) throw new Error('Target page element not found');

      const canvas = await captureElement(targetEl);
      if (!canvas) throw new Error('Canvas capture failed');

      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob conversion failed');

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedImage(true);
            const pageText = pagesCount > 1 ? `Page ${activePageIndex + 1}` : 'Dispatch Plan';
            showToast(`✅ ${pageText} Image Copied! WhatsApp me jakar Ctrl+V karein.`);
            setTimeout(() => setCopiedImage(false), 3500);
          } catch (clipErr) {
            console.warn('Clipboard write failed, downloading image instead:', clipErr);
            handleDownloadImage();
            showToast('⚠️ Clipboard unsupported. Image downloaded!');
          }
        } else {
          handleDownloadImage();
          showToast('Image downloaded! WhatsApp par attach karein.');
        }
        setIsCapturing(false);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      showToast('❌ Image capture failed.');
      setIsCapturing(false);
    }
  };

  // 2. Download Image as Vertical PNG
  const handleDownloadImage = async () => {
    setIsCapturing(true);
    try {
      const targetEl = pageRefs.current[activePageIndex];
      if (!targetEl) return;
      const canvas = await captureElement(targetEl);
      if (!canvas) return;

      const link = document.createElement('a');
      const pageSuffix = pagesCount > 1 ? `_Page${activePageIndex + 1}` : '';
      link.download = `Packwell_${isCorrugation ? 'Corrugation' : 'Dispatch'}_${dateStr}${pageSuffix}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('📥 Image Downloaded successfully!');
    } catch (e) {
      console.error(e);
      showToast('❌ Failed to download image');
    } finally {
      setIsCapturing(false);
    }
  };

  // 3. Download True Vertical A4 PDF (Multi-Page, Customer-Intact)
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
      showToast('📄 Vertical A4 PDF Downloaded! WhatsApp par send karein.');
    } catch (e) {
      console.error(e);
      showToast('❌ PDF export failed.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Helper to calculate cumulative customer start index for Page 2
  const getStartingCustomerIndex = (pIdx: number): number => {
    if (isCorrugation || pIdx === 0) return 0;
    let sum = 0;
    for (let i = 0; i < pIdx; i++) {
      sum += (dispatchPagination.pages[i] || []).length;
    }
    return sum;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 border border-emerald-500/50 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold animate-in slide-in-from-top-3">
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp & PDF Export Center
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Vertical A4 Format
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

        {/* Page Switcher Tabs */}
        {pagesCount > 1 && (
          <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {Array.from({ length: pagesCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActivePageIndex(idx);
                    setShowAllPagesView(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    !showAllPagesView && activePageIndex === idx
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Part {idx + 1} (Page {idx + 1})</span>
                </button>
              ))}

              <button
                onClick={() => setShowAllPagesView(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  showAllPagesView
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Both Pages</span>
              </button>
            </div>

            <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 px-3 py-1 rounded-lg flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Customer Intact Rule:</strong> Ek customer ke items aadhe is page par aur aadhe dusre page par nahi split honge.
              </span>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyImageToClipboard}
              disabled={isCapturing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <span>
                {copiedImage 
                  ? 'Copied to Clipboard!' 
                  : `Copy ${pagesCount > 1 ? `Part ${activePageIndex + 1}` : ''} Image (Ctrl+V in WhatsApp)`}
              </span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isCapturing}
              title="Download Vertical A4 PDF to send directly in WhatsApp"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download PDF (Vertical A4)</span>
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isCapturing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download PNG</span>
            </button>

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

          <span className="text-xs text-slate-400 hidden sm:inline italic">
            Copy button dabayein aur WhatsApp Web par <strong>Ctrl + V</strong> karein!
          </span>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex flex-col items-center gap-8">
          {Array.from({ length: pagesCount }).map((_, pIdx) => {
            const isVisible = showAllPagesView || activePageIndex === pIdx;
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
                className={isVisible ? 'block' : 'hidden'}
                style={{ width: '820px', minWidth: '820px' }}
              >
                {pagesCount > 1 && (
                  <div className="text-xs font-bold text-slate-400 mb-2 flex items-center justify-between px-1">
                    <span className="uppercase tracking-wider">
                      PAGE {pIdx + 1} OF {pagesCount} (PORTRAIT A4)
                    </span>
                    <span className="text-emerald-400">
                      {isCorrugation 
                        ? `${pageCorrugationRows.length} Jobs` 
                        : `${pageDispatchGroups.length} Customer Parties • ${pageItemsCount} Items`}
                    </span>
                  </div>
                )}

                {/* THE ACTUAL VERTICAL A4 CARD RENDERED FOR HTML2CANVAS */}
                <div
                  ref={(el) => { pageRefs.current[pIdx] = el; }}
                  className={`bg-white text-slate-900 w-[820px] min-h-[1140px] p-6 rounded-xl border-2 border-slate-900 shadow-2xl flex flex-col justify-between font-sans ${
                    isCompact ? 'text-[10px]' : 'text-[11px]'
                  }`}
                  style={{ minWidth: '820px', minHeight: '1140px' }}
                >
                  {/* Top Content */}
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
                    {/* Page Subtotal / Grand Total Banner */}
                    <div className="bg-slate-100 border-2 border-slate-900 rounded-lg p-2 flex items-center justify-between font-black text-xs text-slate-900 mb-2">
                      <span className="uppercase tracking-wider">
                        {pagesCount > 1 ? `PAGE ${pIdx + 1} TOTAL BOXES:` : 'GRAND TOTAL DISPATCH BOXES:'}
                      </span>
                      <span className="text-sm font-black font-mono text-emerald-950 px-2.5 py-0.5 rounded bg-amber-300 border border-slate-900">
                        {pageBoxQty.toLocaleString()} Boxes
                      </span>
                    </div>

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

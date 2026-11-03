import React, { useState, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  X, Download, Share2, Loader2, FileText, 
  Sparkles, Box, Factory, Truck, Info, Layers
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
  const [activeTab, setActiveTab] = useState<'full' | 'page-1' | 'page-2'>('full');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isCorrugation = type === 'corrugation';

  // 1. Filter active rows / groups
  const activeCorrugationRows = useMemo(() => {
    return corrugationRows.filter(r => r.customerName || r.jobName);
  }, [corrugationRows]);

  const activeDispatchGroups = useMemo(() => {
    return dispatchGroups.filter(g => 
      (g.customerName && g.customerName.trim().length > 0) || 
      (g.items && g.items.some(i => (i.jobName && i.jobName.trim().length > 0) || i.qty))
    );
  }, [dispatchGroups]);

  // 2. Determine if document needs multi-page pagination (> 1 page)
  const totalDispatchItems = useMemo(() => {
    return activeDispatchGroups.reduce(
      (acc, g) => acc + (g.items || []).filter(i => (i.jobName && i.jobName.trim().length > 0) || i.qty).length,
      0
    );
  }, [activeDispatchGroups]);

  const needsPaging = useMemo(() => {
    if (isCorrugation) {
      return activeCorrugationRows.length > 13;
    } else {
      return activeDispatchGroups.length > 3 || totalDispatchItems > 7;
    }
  }, [isCorrugation, activeCorrugationRows.length, activeDispatchGroups.length, totalDispatchItems]);

  // 3. Compute split groups / rows for Page 1 & Page 2
  const { page1Items, page2Items, splitIndex } = useMemo(() => {
    if (isCorrugation) {
      const split = 13;
      return {
        page1Items: activeCorrugationRows.slice(0, split),
        page2Items: activeCorrugationRows.slice(split),
        splitIndex: split
      };
    } else {
      // Balance dispatch groups across 2 pages based on items
      let split = Math.ceil(activeDispatchGroups.length / 2);
      let cumulativeItems = 0;
      const targetHalf = totalDispatchItems / 2;
      for (let i = 0; i < activeDispatchGroups.length; i++) {
        const count = (activeDispatchGroups[i].items || []).filter(it => it.jobName || it.qty).length;
        cumulativeItems += count;
        if (cumulativeItems >= targetHalf && i < activeDispatchGroups.length - 1) {
          split = i + 1;
          break;
        }
      }
      return {
        page1Items: activeDispatchGroups.slice(0, split),
        page2Items: activeDispatchGroups.slice(split),
        splitIndex: split
      };
    }
  }, [isCorrugation, activeCorrugationRows, activeDispatchGroups, totalDispatchItems]);

  // Rows or groups to display according to activeTab
  const displayedCorrugationRows = useMemo(() => {
    if (!isCorrugation) return [];
    if (activeTab === 'page-1') return page1Items as CorrugationPlanningRow[];
    if (activeTab === 'page-2') return page2Items as CorrugationPlanningRow[];
    return activeCorrugationRows;
  }, [isCorrugation, activeTab, page1Items, page2Items, activeCorrugationRows]);

  const displayedDispatchGroups = useMemo(() => {
    if (isCorrugation) return [];
    if (activeTab === 'page-1') return page1Items as DispatchPlanGroup[];
    if (activeTab === 'page-2') return page2Items as DispatchPlanGroup[];
    return activeDispatchGroups;
  }, [isCorrugation, activeTab, page1Items, page2Items, activeDispatchGroups]);

  // Active metrics
  const displayedBoxQty = useMemo(() => {
    if (isCorrugation) {
      return displayedCorrugationRows.reduce((sum, r) => sum + (Number(r.boxQty) || 0), 0);
    } else {
      return displayedDispatchGroups.reduce((acc, g) => {
        return acc + (g.items || []).reduce((itemSum, item) => itemSum + (Number(item.qty) || 0), 0);
      }, 0);
    }
  }, [isCorrugation, displayedCorrugationRows, displayedDispatchGroups]);

  const displayedPlyQty = useMemo(() => {
    if (!isCorrugation) return 0;
    return displayedCorrugationRows.reduce((sum, r) => sum + (Number(r.nosOfPly) || 0), 0);
  }, [isCorrugation, displayedCorrugationRows]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /**
   * Ultra reliable capture that captures the FULL height of the card,
   * bypassing any modal scroll clipping.
   */
  const captureCanvas = async () => {
    const element = cardRef.current;
    if (!element) return null;

    const parent = element.parentElement;
    const origScrollTop = parent ? parent.scrollTop : 0;
    if (parent) {
      parent.scrollTop = 0;
    }

    const scrollWidth = element.scrollWidth || element.offsetWidth;
    const scrollHeight = element.scrollHeight || element.offsetHeight;

    try {
      return await html2canvas(element, {
        scale: 2, // 2x DPI for crystal-clear readability without blowing up file size
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: scrollWidth,
        height: scrollHeight,
        windowWidth: scrollWidth + 200,
        windowHeight: scrollHeight + 200,
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
      if (parent) {
        parent.scrollTop = origScrollTop;
      }
    }
  };

  // 1. Copy high-res image directly to Clipboard (for WhatsApp Ctrl+V)
  const handleCopyImageToClipboard = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) throw new Error('Canvas capture failed');

      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob conversion failed');

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedImage(true);
            const label = activeTab === 'page-1' ? 'Part 1' : activeTab === 'page-2' ? 'Part 2' : 'Full Plan';
            showToast(`✅ ${label} Image Copied! WhatsApp me Ctrl+V karein.`);
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

  // 2. Download Image as PNG
  const handleDownloadImage = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      const suffix = activeTab === 'full' ? 'Full' : activeTab === 'page-1' ? 'Part1' : 'Part2';
      link.download = `Packwell_${isCorrugation ? 'Corrugation' : 'Dispatch'}_${dateStr}_${suffix}.png`;
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

  // 3. Download True Multi-Page PDF (Landscape A4, crystal-clear, no squishing)
  const handleDownloadPdf = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 297mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 210mm
      const margin = 8;
      const usableWidth = pageWidth - (margin * 2); // 281mm
      const usableHeight = pageHeight - (margin * 2); // 194mm

      const totalRenderedHeight = (canvas.height * usableWidth) / canvas.width;

      if (totalRenderedHeight <= usableHeight) {
        // Fits in 1 single landscape page
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, totalRenderedHeight);
      } else {
        // Multi-page slicing: creates Page 1, Page 2 without squishing text!
        const canvasSliceHeight = (usableHeight / usableWidth) * canvas.width;
        const totalPdfPages = Math.ceil(canvas.height / canvasSliceHeight);

        for (let p = 0; p < totalPdfPages; p++) {
          if (p > 0) pdf.addPage('a4', 'landscape');

          const sY = p * canvasSliceHeight;
          const sH = Math.min(canvasSliceHeight, canvas.height - sY);

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sH;
          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(canvas, 0, sY, canvas.width, sH, 0, 0, canvas.width, sH);

            const sliceData = pageCanvas.toDataURL('image/png');
            const sliceRenderedHeight = (sH * usableWidth) / canvas.width;
            pdf.addImage(sliceData, 'PNG', margin, margin, usableWidth, sliceRenderedHeight);
          }
        }
      }

      pdf.save(`Packwell_${isCorrugation ? 'Corrugation' : 'Dispatch'}_Plan_${dateStr}.pdf`);
      showToast('📄 Multi-Page PDF Downloaded! WhatsApp par send karein.');
    } catch (e) {
      console.error(e);
      showToast('❌ PDF export failed.');
    } finally {
      setIsCapturing(false);
    }
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
        
        {/* 1. Modal Top Bar */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp Share Center
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Exact Screen Boxes
                </span>
                {needsPaging && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    2 Pages
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

        {/* 2. Page View Selector Tabs (Crucial for 2-Page Crystal Clear WhatsApp Sharing) */}
        {needsPaging && (
          <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('page-1')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'page-1'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Part 1 (Page 1)</span>
              </button>

              <button
                onClick={() => setActiveTab('page-2')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'page-2'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Part 2 (Page 2)</span>
              </button>

              <button
                onClick={() => setActiveTab('full')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'full'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Full Sheet (Single)</span>
              </button>
            </div>

            <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 px-3 py-1 rounded-lg flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Best WhatsApp View:</strong> Part 1 copy karein fir Part 2 copy karein (Mobile par ekdum crystal-clear bada aayega).
              </span>
            </div>
          </div>
        )}

        {/* 3. Action Buttons Toolbar */}
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
                  : `Copy ${activeTab === 'page-1' ? 'Part 1' : activeTab === 'page-2' ? 'Part 2' : 'Image'} (Ctrl+V in WhatsApp)`}
              </span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isCapturing}
              title="Download Multi-Page PDF to send directly in WhatsApp"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download PDF (Multi-Page)</span>
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
            Copy karne ke baad WhatsApp me bas <strong>Ctrl + V</strong> dabayein!
          </span>
        </div>

        {/* 4. Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex justify-center">
          {/* THE CARD RENDERED FOR HTML2CANVAS */}
          <div 
            ref={cardRef}
            className="bg-white text-slate-900 w-[960px] p-6 rounded-xl border-2 border-slate-900 shadow-2xl flex flex-col font-sans"
            style={{ minWidth: '960px' }}
          >
            {/* Brand Header */}
            <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
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

              <div className="text-right flex items-center gap-3">
                {needsPaging && activeTab !== 'full' && (
                  <span className="text-xs font-black px-2.5 py-1 bg-blue-100 text-blue-950 rounded border border-blue-900 uppercase">
                    {activeTab === 'page-1' ? 'PAGE 1 OF 2' : 'PAGE 2 OF 2'}
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

            {/* Top Metric Badges */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-700">
                    {isCorrugation ? 'Planned Jobs' : 'Parties on Sheet'}
                  </span>
                  <span className="text-lg font-black text-blue-950 block">
                    {isCorrugation 
                      ? displayedCorrugationRows.length
                      : displayedDispatchGroups.length}
                    {needsPaging && activeTab !== 'full' && (
                      <span className="text-xs font-semibold text-slate-500 ml-1">
                        (Total: {isCorrugation ? activeCorrugationRows.length : activeDispatchGroups.length})
                      </span>
                    )}
                  </span>
                </div>
                <Factory className="w-5 h-5 text-blue-600" />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800">
                    {isCorrugation ? 'Total Nos of Ply' : 'Total Items'}
                  </span>
                  <span className="text-lg font-black text-amber-950 block">
                    {isCorrugation 
                      ? displayedPlyQty.toLocaleString()
                      : displayedDispatchGroups.reduce((acc, g) => acc + (g.items || []).filter(i => i.jobName || i.qty).length, 0)}
                  </span>
                </div>
                <Box className="w-5 h-5 text-amber-600" />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800">
                    {activeTab === 'full' ? 'Grand Box Quantity' : 'Page Box Quantity'}
                  </span>
                  <span className="text-lg font-black text-emerald-950 block">
                    {displayedBoxQty.toLocaleString()}
                    {needsPaging && activeTab !== 'full' && (
                      <span className="text-xs font-semibold text-slate-500 ml-1">
                        / {totalBoxQty.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <Truck className="w-5 h-5 text-emerald-600" />
              </div>
            </div>

            {/* Table Content */}
            {isCorrugation ? (
              /* Corrugation Table */
              <table className="w-full border-collapse border border-slate-900 text-[11px]">
                <thead>
                  <tr className="bg-amber-300 text-slate-950 font-black uppercase text-[10px] text-center border-b-2 border-slate-900">
                    <th className="border border-slate-900 px-2 py-1.5 w-10">S.No</th>
                    <th className="border border-slate-900 px-2.5 py-1.5 text-left w-48">Customer Name</th>
                    <th className="border border-slate-900 px-2.5 py-1.5 text-left">Job Name</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-16">Reel Size</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-16">Cut Size</th>
                    <th className="border border-slate-900 px-1 py-1.5 w-12">UPS</th>
                    <th className="border border-slate-900 px-1 py-1.5 w-12">Flute</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-20 text-right">Nos of Ply</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-20 text-right bg-amber-400">Box Qty</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-32 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCorrugationRows.map((row, idx) => {
                    const rowNumber = activeTab === 'page-2' ? splitIndex + idx + 1 : idx + 1;
                    return (
                      <tr 
                        key={row.id || idx}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        <td className="border border-slate-900 px-2 py-1 text-center font-bold text-slate-800">
                          {rowNumber}
                        </td>
                        <td className="border border-slate-900 px-2.5 py-1 font-bold text-blue-900">
                          {row.customerName || '-'}
                        </td>
                        <td className="border border-slate-900 px-2.5 py-1 font-extrabold text-slate-900">
                          {row.jobName || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-center font-bold font-mono">
                          {row.reelSize || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-center font-bold font-mono">
                          {row.cutSize || '-'}
                        </td>
                        <td className="border border-slate-900 px-1 py-1 text-center font-bold">
                          {row.ups || '-'}
                        </td>
                        <td className="border border-slate-900 px-1 py-1 text-center font-black text-blue-800">
                          {row.fluteType || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-right font-black font-mono text-slate-900">
                          {(Number(row.nosOfPly) || 0).toLocaleString()}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-right font-black font-mono text-emerald-900 bg-amber-100">
                          {(Number(row.boxQty) || 0).toLocaleString()}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-slate-700 italic">
                          {row.remarks || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 border-t-2 border-slate-900 font-black text-[11px]">
                    <td colSpan={7} className="border border-slate-900 px-3 py-1.5 text-right uppercase">
                      {activeTab === 'full' ? 'GRAND TOTAL:' : 'PAGE SUB-TOTAL:'}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-right font-mono text-blue-950 font-black">
                      {displayedPlyQty.toLocaleString()}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-right font-mono text-emerald-950 font-black bg-amber-300">
                      {displayedBoxQty.toLocaleString()}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5"></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* Dispatch Planning Groups Table */
              <div className="space-y-3.5">
                {displayedDispatchGroups.map((grp, gIdx) => {
                  const groupNumber = activeTab === 'page-2' ? splitIndex + gIdx + 1 : gIdx + 1;
                  const groupTotal = (grp.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

                  return (
                    <div key={grp.id || gIdx} className="border-2 border-slate-900 rounded-lg overflow-hidden">
                      <div className="bg-slate-900 text-white px-3.5 py-2 flex justify-between items-center text-xs font-black">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[11px] font-black flex items-center justify-center">
                            {groupNumber}
                          </span>
                          <span className="text-sm tracking-wide">{grp.customerName || 'PARTY'}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-bold">
                          <span className="text-amber-300">
                            Party Total: <strong className="text-white text-sm font-black font-mono">{groupTotal.toLocaleString()}</strong> Boxes
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Date: {grp.dispatchDate || formattedDateStr}
                          </span>
                        </div>
                      </div>

                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 font-bold border-b border-slate-900 text-[10px] text-slate-800">
                            <th className="border-r border-slate-900 px-2 py-1 w-10 text-center">#</th>
                            <th className="border-r border-slate-900 px-3 py-1 text-left">Job / Item Name</th>
                            <th className="border-r border-slate-900 px-3 py-1 w-32 text-right bg-amber-100 font-black">
                              Dispatch Qty
                            </th>
                            <th className="px-3 py-1 text-left">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(grp.items || [])
                            .filter(i => i.jobName || i.qty)
                            .map((item, iIdx) => (
                              <tr key={item.id || iIdx} className={iIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="border-r border-t border-slate-300 px-2 py-1 text-center font-bold">
                                  {iIdx + 1}
                                </td>
                                <td className="border-r border-t border-slate-300 px-3 py-1 font-bold text-slate-900">
                                  {item.jobName || '-'}
                                </td>
                                <td className="border-r border-t border-slate-300 px-3 py-1 text-right font-black font-mono text-emerald-950 bg-amber-50">
                                  {(Number(item.qty) || 0).toLocaleString()}
                                </td>
                                <td className="border-t border-slate-300 px-3 py-1 text-slate-600 italic">
                                  {(item as any).remarks || '-'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {/* Dispatch Bottom Total */}
                <div className="bg-slate-100 border-2 border-slate-900 rounded-lg p-2.5 flex items-center justify-between font-black text-xs text-slate-900">
                  <span className="uppercase tracking-wider">
                    {activeTab === 'full' ? 'Grand Total Dispatch Boxes:' : `Part ${activeTab === 'page-1' ? '1' : '2'} Dispatch Boxes:`}
                  </span>
                  <span className="text-base font-black font-mono text-emerald-950 px-3 py-0.5 rounded bg-amber-300 border border-slate-900">
                    {displayedBoxQty.toLocaleString()} Boxes
                  </span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 pt-2 border-t border-slate-400 flex items-center justify-between text-[10px] text-slate-500 font-medium">
              <span>Packwell ERP Daily Planning System • High-Resolution Dispatch Card</span>
              <span>
                {needsPaging && activeTab !== 'full' ? `Showing ${activeTab === 'page-1' ? 'Page 1' : 'Page 2'} of 2 • ` : ''}
                Generated: {new Date().toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  X, Download, Check, Share2, Printer, 
  Loader2, FileText, Sparkles, Box, Factory, Truck
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const captureCanvas = async () => {
    if (!cardRef.current) return null;
    return await html2canvas(cardRef.current, {
      scale: 2.2, // Ultra crisp high-DPI resolution for mobile & WhatsApp
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
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
            showToast('✅ WhatsApp Image Copied! WhatsApp me jaakar Ctrl+V karein.');
            setTimeout(() => setCopiedImage(false), 3500);
          } catch (clipErr) {
            console.warn('Clipboard write failed, falling back to download:', clipErr);
            handleDownloadImage();
            showToast('⚠️ Direct clipboard unsupported. Image downloaded!');
          }
        } else {
          handleDownloadImage();
          showToast('Image downloaded! WhatsApp par attach karke bhein.');
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
      link.download = `Packwell_${type === 'corrugation' ? 'Corrugation_Plan' : 'Dispatch_Plan'}_${dateStr}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('📥 Image Downloaded successfully!');
    } catch (e) {
      console.error(e);
    } finally {
      setIsCapturing(false);
    }
  };

  // 3. Download Direct PDF
  const handleDownloadPdf = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL('image/png');
      const isLandscape = true;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Fit image into page keeping aspect ratio
      const imgWidth = pageWidth - 16;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight - 16) {
        pdf.addImage(imgData, 'PNG', 8, 8, imgWidth, imgHeight);
      } else {
        // Multi-page or scale to fit
        const scale = (pageHeight - 16) / imgHeight;
        pdf.addImage(imgData, 'PNG', 8, 8, imgWidth * scale, pageHeight - 16);
      }

      pdf.save(`Packwell_${type === 'corrugation' ? 'Corrugation_Plan' : 'Dispatch_Plan'}_${dateStr}.pdf`);
      showToast('📄 PDF Downloaded successfully!');
    } catch (e) {
      console.error(e);
      showToast('❌ PDF export failed.');
    } finally {
      setIsCapturing(false);
    }
  };

  const isCorrugation = type === 'corrugation';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold animate-in slide-in-from-top-3">
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                WhatsApp Image Card
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Exact Screen Boxes
                </span>
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

        {/* Action Buttons Toolbar */}
        <div className="px-6 py-3 bg-slate-900/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyImageToClipboard}
              disabled={isCapturing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-900/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedImage ? 'Image Copied!' : 'Copy Image (Ctrl+V in WhatsApp)'}</span>
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isCapturing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Image</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isCapturing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={() => {
                onCopyTextReport();
                showToast('📝 Text copied to clipboard!');
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy Text</span>
            </button>
          </div>

          <span className="text-xs text-slate-400 italic">
            Copy button dabayein aur WhatsApp Web/Desktop par jaakar <strong>Ctrl + V</strong> karein!
          </span>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex justify-center">
          {/* THE ACTUAL CARD RENDERED FOR HTML2CANVAS */}
          <div 
            ref={cardRef}
            className="bg-white text-slate-900 w-[950px] p-6 rounded-xl border border-slate-300 shadow-2xl flex flex-col font-sans"
            style={{ minWidth: '950px' }}
          >
            {/* 1. Brand Header */}
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
                    <span className="text-[11px] font-bold tracking-widest uppercase text-slate-500">
                      Corrugated Packaging Manufacturer
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-base font-black px-3 py-1 bg-amber-400 text-slate-950 rounded-md border border-slate-900 inline-block uppercase tracking-wider">
                  {isCorrugation ? 'CORRUGATION MACHINE PLANNING' : 'DISPATCH PLANNING'}
                </span>
                <div className="text-xs font-bold text-slate-700 mt-1">
                  DATE: <span className="text-blue-900 text-sm font-black">{formattedDateStr}</span>
                </div>
              </div>
            </div>

            {/* 2. Top Metric Badges */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-700">Planned Jobs</span>
                  <span className="text-lg font-black text-blue-950 block">
                    {isCorrugation 
                      ? corrugationRows.filter(r => r.customerName || r.jobName).length
                      : dispatchGroups.reduce((acc, g) => acc + (g.items || []).filter(i => i.jobName || i.qty).length, 0)}
                  </span>
                </div>
                <Factory className="w-5 h-5 text-blue-600" />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800">
                    {isCorrugation ? 'Total Nos of Ply' : 'Total Parties'}
                  </span>
                  <span className="text-lg font-black text-amber-950 block">
                    {isCorrugation ? totalPly.toLocaleString() : dispatchGroups.length}
                  </span>
                </div>
                <Box className="w-5 h-5 text-amber-600" />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Box Quantity</span>
                  <span className="text-lg font-black text-emerald-950 block">
                    {totalBoxQty.toLocaleString()}
                  </span>
                </div>
                <Truck className="w-5 h-5 text-emerald-600" />
              </div>
            </div>

            {/* 3. The Table with Exact Screen Boxes */}
            {isCorrugation ? (
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
                  {corrugationRows
                    .filter(r => r.customerName || r.jobName)
                    .map((row, idx) => (
                      <tr 
                        key={row.id || idx}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        <td className="border border-slate-900 px-2 py-1 text-center font-bold text-slate-800">
                          {idx + 1}
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
                    ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 border-t-2 border-slate-900 font-black text-[11px]">
                    <td colSpan={7} className="border border-slate-900 px-3 py-1.5 text-right uppercase">
                      TOTAL:
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-right font-mono text-blue-950 font-black">
                      {totalPly.toLocaleString()}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-right font-mono text-emerald-950 font-black bg-amber-300">
                      {totalBoxQty.toLocaleString()}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5"></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* Dispatch Planning Table */
              <div className="space-y-3">
                {dispatchGroups.map((grp, gIdx) => (
                  <div key={grp.id || gIdx} className="border-2 border-slate-900 rounded-lg overflow-hidden">
                    <div className="bg-slate-800 text-white px-3 py-1.5 flex justify-between items-center text-xs font-black">
                      <span>{gIdx + 1}. {grp.customerName || 'PARTY'}</span>
                      <span className="text-[10px] text-amber-300 font-normal">
                        Date: {grp.dispatchDate || formattedDateStr}
                      </span>
                    </div>
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 font-bold border-b border-slate-900 text-[10px] text-slate-800">
                          <th className="border-r border-slate-900 px-2 py-1 w-10 text-center">#</th>
                          <th className="border-r border-slate-900 px-3 py-1 text-left">Job / Item Name</th>
                          <th className="border-r border-slate-900 px-2 py-1 w-28 text-right bg-amber-100 font-black">Dispatch Qty</th>
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
                              <td className="border-r border-t border-slate-300 px-2 py-1 text-right font-black font-mono bg-amber-50">
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
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 pt-2 border-t border-slate-400 flex items-center justify-between text-[10px] text-slate-500 font-medium">
              <span>Packwell ERP Daily Production Planning System</span>
              <span>Generated on: {new Date().toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { 
  X, Download, Check, Share2, Sun, Moon, Crown, Factory,
  Loader2, FileText, Smartphone 
} from 'lucide-react';
import type { PlantMisFullData } from '../../lib/supabase/plantMisService';
import PlantMisWhatsappCard from './PlantMisWhatsappCard';
import type { WhatsappCardTheme } from './PlantMisWhatsappCard';

interface PlantMisWhatsappModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlantMisFullData;
  formattedDateStr: string;
  onCopyTextReport: () => void;
}

export default function PlantMisWhatsappModal({
  isOpen,
  onClose,
  data,
  formattedDateStr,
  onCopyTextReport,
}: PlantMisWhatsappModalProps) {
  const [theme, setTheme] = useState<WhatsappCardTheme>('dark');
  const [isCapturing, setIsCapturing] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getCanvasBackgroundColor = (t: WhatsappCardTheme) => {
    switch (t) {
      case 'light':
        return '#ffffff';
      case 'royal':
        return '#121215';
      case 'industrial':
        return '#0a192f';
      case 'dark':
      default:
        return '#0f172a';
    }
  };

  // 1. Capture HTML2Canvas helper
  const captureCanvas = async () => {
    if (!cardRef.current) return null;
    return await html2canvas(cardRef.current, {
      scale: 2, // 2x Retina resolution for sharp text on mobile screens
      useCORS: true,
      backgroundColor: getCanvasBackgroundColor(theme),
      logging: false,
    });
  };

  // 2. Copy Image directly to Clipboard (Paste in WhatsApp Web with Ctrl+V)
  const handleCopyImageToClipboard = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) throw new Error('Canvas rendering failed');

      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Blob conversion failed');
        }

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedImage(true);
            showToast('✅ Image Copied! WhatsApp me jaakar Ctrl+V karein.');
            setTimeout(() => setCopiedImage(false), 3500);
          } catch (clipErr) {
            console.warn('ClipboardItem direct write failed, falling back to download:', clipErr);
            handleDownloadImage();
            showToast('⚠️ Direct copy unsupported by browser. Image Downloaded!');
          }
        } else {
          handleDownloadImage();
          showToast('Image downloaded! WhatsApp par attach karke bhein.');
        }
        setIsCapturing(false);
      }, 'image/png');
    } catch (err: any) {
      console.error('Error copying card image:', err);
      showToast('❌ Failed to capture image. Please try downloading.');
      setIsCapturing(false);
    }
  };

  // 3. Download Image as PNG file
  const handleDownloadImage = async () => {
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) throw new Error('Canvas rendering failed');

      const dataUrl = canvas.toDataURL('image/png');
      const safeDate = formattedDateStr.replace(/\//g, '-');
      const filename = `Packwell_MIS_${safeDate}_${theme}.png`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccess(true);
      showToast(`⬇️ Image saved: ${filename}`);
      setTimeout(() => setDownloadSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error downloading card image:', err);
      showToast('❌ Failed to download image.');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* MODAL WRAPPER */}
      <div className="bg-card text-foreground border border-border w-full max-w-5xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* HEADER BAR */}
        <div className="px-5 py-3.5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/40">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Smartphone className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-foreground">
                  MD WhatsApp MIS Image Card
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                  Shift-Wise & Category Grouped
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Corrugation ek box me, Pasting ek box me. Day & Night shifts saaf alag dikhenge.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 4 FORMAT / COLOR THEMES SELECTOR */}
            <div className="flex items-center bg-secondary/80 p-1 rounded-xl border border-border text-xs gap-1">
              {/* Theme 1: Dark */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Executive Midnight Navy"
              >
                <Moon className="w-3.5 h-3.5 text-blue-400" />
                <span>Executive Dark</span>
              </button>

              {/* Theme 2: Light */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Classic Clean White"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Classic Light</span>
              </button>

              {/* Theme 3: Royal Gold */}
              <button
                type="button"
                onClick={() => setTheme('royal')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                  theme === 'royal'
                    ? 'bg-amber-500 text-black shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Royal Charcoal & Gold"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Royal Gold</span>
              </button>

              {/* Theme 4: Industrial Blue */}
              <button
                type="button"
                onClick={() => setTheme('industrial')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                  theme === 'industrial'
                    ? 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Industrial Cobalt & Yellow"
              >
                <Factory className="w-3.5 h-3.5 text-cyan-300" />
                <span>Industrial</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition ml-1"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TOAST NOTIFICATION IF ACTIVE */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-inner">
            <Check className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* SCROLLABLE PREVIEW AREA */}
        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-950/25 flex justify-center items-start">
          <div className="transform origin-top scale-[0.60] sm:scale-[0.72] md:scale-[0.85] lg:scale-[0.95] xl:scale-100 transition-transform">
            <PlantMisWhatsappCard
              cardRef={cardRef}
              data={data}
              formattedDateStr={formattedDateStr}
              theme={theme}
            />
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="px-6 py-4 border-t border-border bg-muted/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Selected Color Theme: <strong className="text-foreground uppercase">{theme}</strong> • Image usi theme me generate hogi.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Copy Text Fallback */}
            <button
              type="button"
              onClick={() => {
                onCopyTextReport();
                showToast('📋 Text report copied to clipboard!');
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition shadow-sm"
              title="Copy original text version"
            >
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="hidden sm:inline">Copy Text</span>
            </button>

            {/* Download PNG Button */}
            <button
              type="button"
              disabled={isCapturing}
              onClick={handleDownloadImage}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition shadow-sm disabled:opacity-50"
              title="Download High-Res PNG Image"
            >
              {isCapturing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : downloadSuccess ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Download className="w-4 h-4 text-blue-500" />
              )}
              <span>{downloadSuccess ? 'Downloaded!' : 'Download Image'}</span>
            </button>

            {/* Primary Action: Copy Image to Clipboard */}
            <button
              type="button"
              disabled={isCapturing}
              onClick={handleCopyImageToClipboard}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 text-xs font-extrabold rounded-xl text-white shadow-lg transition-all ${
                copiedImage
                  ? 'bg-emerald-600 shadow-emerald-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98]'
              } disabled:opacity-50`}
            >
              {isCapturing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : copiedImage ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span>
                {isCapturing
                  ? 'Generating Card...'
                  : copiedImage
                  ? 'Copied to Clipboard!'
                  : '📸 Copy WhatsApp Image (Ctrl+V)'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

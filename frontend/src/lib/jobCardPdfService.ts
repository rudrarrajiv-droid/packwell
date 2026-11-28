import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface DownloadJobCardPdfOptions {
  elementId?: string;
  jobCardNo?: string;
  customerName?: string;
}

/**
 * Downloads a pixel-perfect, single-page A4 PDF of the Job Card.
 * Standardized across PurchaseOrders, JobCards, JobCosting, and Inventory.
 */
export async function downloadJobCardPDF({
  elementId = 'job-card-print-area',
  jobCardNo = 'Document',
}: DownloadJobCardPdfOptions): Promise<boolean> {
  const element = document.getElementById(elementId) || document.getElementById('printable-job-card');
  if (!element) {
    console.error(`Job Card print element '#${elementId}' not found.`);
    window.print();
    return false;
  }

  // Preserve styles
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalMinHeight = element.style.minHeight;

  try {
    // Lock explicit width for html2canvas rendering
    element.style.width = '794px';
    element.style.maxWidth = '794px';

    // Wait slightly to ensure any lazy images/fonts are flushed
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 794,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    // Printable margins
    const marginX = 5; // 5mm left and right margin
    const marginY = 5; // 5mm top and bottom margin
    const usableWidth = pageWidth - marginX * 2; // 200mm
    const usableHeight = pageHeight - marginY * 2; // 287mm

    // Proportional height
    let renderWidth = usableWidth;
    let renderHeight = (canvas.height * renderWidth) / canvas.width;

    // If canvas height exceeds usable A4 height, scale down so it fits strictly on 1 page!
    if (renderHeight > usableHeight) {
      const scale = usableHeight / renderHeight;
      renderHeight = usableHeight;
      renderWidth = renderWidth * scale;
    }

    // Center horizontally if renderWidth is smaller than usableWidth
    const offsetX = marginX + (usableWidth - renderWidth) / 2;
    const offsetY = marginY;

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');

    const cleanJobNo = String(jobCardNo || '').replace(/[^a-zA-Z0-9-_]/g, '_');
    pdf.save(`JobCard_${cleanJobNo}.pdf`);

    return true;
  } catch (err) {
    console.error('Failed to generate Job Card PDF with html2canvas:', err);
    // Fallback to native print dialog
    window.print();
    return false;
  } finally {
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.minHeight = originalMinHeight;
  }
}

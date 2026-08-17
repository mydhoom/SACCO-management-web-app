import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to load image asynchronously so jsPDF can use it
const loadImage = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
};

/**
 * generatePDF - Universal PDF generator for SACCO audit reports.
 *
 * Supports two rendering modes:
 *  1. Single table: pass `columns` + `data`
 *  2. Multi-section (P&L): pass `sections` array of { heading, columns, data }
 */
export const generatePDF = async ({
  title,
  subtitle = '',
  filename = 'document.pdf',
  columns,
  data,
  sections, // Array of { heading, columns, data } for multi-section reports
  orientation = 'portrait',
  summaryData = [],
}) => {
  const doc = new jsPDF(orientation, 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  const logo = await loadImage('/logo.png');
  let startY = 40;

  if (logo) doc.addImage(logo, 'PNG', 40, startY - 10, 50, 50);

  const titleX = logo ? 100 : 40;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('MAHADEV SOCIETY', titleX, startY + 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('HPSEBL SHIMLA CITY ELECTRICAL DIVISION', titleX, startY + 25);

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.setFontSize(10);
  doc.text(`Generated: ${today}`, pageWidth - 40, startY + 10, { align: 'right' });

  startY += 50;
  doc.setDrawColor(226, 232, 240);
  doc.line(40, startY, pageWidth - 40, startY);

  startY += 25;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(title, 40, startY);

  if (subtitle) {
    startY += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(subtitle, 40, startY);
  }
  startY += 20;

  const footerFn = (tableData) => {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(
      'This is a system-generated document. © Mahadev Co-operative Thrift & Credit Society.',
      40,
      pageHeight - 30
    );
    doc.text(`Page ${tableData.pageNumber}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
  };

  const tableConfig = {
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: footerFn,
  };

  if (sections && sections.length > 0) {
    // Multi-section mode (P&L, multi-statement)
    let currentY = startY;
    for (const section of sections) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(section.heading, 40, currentY);
      currentY += 6;
      doc.setDrawColor(200, 210, 230);
      doc.line(40, currentY, pageWidth - 40, currentY);
      currentY += 8;

      const isTwoColumn = section.columns && section.columns.length === 2;
      autoTable(doc, {
        ...tableConfig,
        startY: currentY,
        head: [section.columns],
        body: section.data,
        columnStyles: isTwoColumn ? { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 140 } } : undefined,
        headStyles: isTwoColumn ? { ...tableConfig.headStyles, 1: { halign: 'right' } } : tableConfig.headStyles,
      });
      currentY = doc.lastAutoTable.finalY + 20;
    }
  } else {
    // Single table mode (original behavior)
    autoTable(doc, {
      ...tableConfig,
      startY,
      head: [columns],
      body: data,
    });
  }

  if (summaryData && summaryData.length > 0) {
    let finalY = doc.lastAutoTable.finalY + 30;
    if (finalY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      finalY = 40;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Summary / Notes:', 40, finalY);
    finalY += 15;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    summaryData.forEach((note) => {
      doc.text(`• ${note}`, 40, finalY);
      finalY += 15;
    });
  }

  doc.save(filename);
};

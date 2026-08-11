import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to load image asynchronously so jsPDF can use it
const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Use the absolute path if running from a local dev server, 
    // but relative root `/` works in Vite standard configurations
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.warn('Failed to load logo for PDF:', e);
      resolve(null); // Resolve with null so PDF generation doesn't crash entirely
    };
  });
};

export const generatePDF = async ({
  title,
  subtitle = '',
  filename = 'document.pdf',
  columns,
  data,
  orientation = 'portrait', // 'portrait' or 'landscape'
  summaryData = [] // Optional array of strings or objects to put at the bottom
}) => {
  const doc = new jsPDF(orientation, 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Try to load the logo
  const logo = await loadImage('/logo.png');

  // --- HEADER START ---
  let startY = 40;
  
  if (logo) {
    // Draw the logo (x, y, width, height)
    doc.addImage(logo, 'PNG', 40, startY - 10, 50, 50);
  }

  // Society Name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59); // Slate 800
  // If logo exists, indent text, otherwise left align
  const titleX = logo ? 100 : 40;
  doc.text('MAHADEV SOCIETY', titleX, startY + 10);
  
  // Subtitle / Division
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('HPSEBL SHIMLA CITY ELECTRICAL DIVISION', titleX, startY + 25);
  
  // Right Aligned Date
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFontSize(10);
  doc.text(`Generated: ${today}`, pageWidth - 40, startY + 10, { align: 'right' });
  
  // Horizontal Rule
  startY += 50;
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.line(40, startY, pageWidth - 40, startY);

  // Document Title
  startY += 25;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(title, 40, startY);
  
  if (subtitle) {
    startY += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(subtitle, 40, startY);
  }
  
  startY += 20;

  // --- TABLE START ---
  autoTable(doc, {
    startY: startY,
    head: [columns],
    body: data,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 65, 85]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Slate 50
    },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      // --- FOOTER START ---
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate 400
      
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Footer Disclaimer
      doc.text(
        'This is a system-generated document. © Mahadev Co-operative Thrift & Credit Society.',
        40,
        pageHeight - 30
      );
      
      // Page Number
      doc.text(
        `Page ${data.pageNumber}`,
        pageWidth - 40,
        pageHeight - 30,
        { align: 'right' }
      );
    }
  });

  // --- SUMMARY / FOOTER NOTES START ---
  if (summaryData && summaryData.length > 0) {
    let finalY = doc.lastAutoTable.finalY + 30; // 30pt padding below table
    
    // Check if we need to add a new page for the summary
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

  // Download the PDF
  doc.save(filename);
};

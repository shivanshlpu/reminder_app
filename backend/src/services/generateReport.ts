/**
 * PDFKit Financial Report Generator
 * Generates an executive PDF report stream using PDFKit with vector graphics,
 * KPI summary boxes, category progress bars, itemized ledger table, and signature line.
 */
import PDFDocument from 'pdfkit';
import { Response } from 'express';

export interface ExpenseReportItem {
  id?: number;
  date: string;
  category_name?: string;
  category_color?: string;
  amount: number;
  note?: string | null;
}

export function generatePdfReport(
  expenses: ExpenseReportItem[],
  res: Response,
  title: string = 'Executive Expense Statement'
): void {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
  });

  // Pipe PDF output stream to HTTP Response
  doc.pipe(res);

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const transactionCount = expenses.length;
  const avgExpense = transactionCount > 0 ? totalAmount / transactionCount : 0;

  // Category totals
  const categoryTotals: Record<string, { total: number; count: number; color: string }> = {};
  expenses.forEach((e) => {
    const cat = e.category_name || 'Other';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { total: 0, count: 0, color: e.category_color || '#4F46E5' };
    }
    categoryTotals[cat].total += e.amount;
    categoryTotals[cat].count += 1;
  });

  const categoryList = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);
  const topCategoryName = categoryList.length > 0 ? categoryList[0][0] : 'N/A';

  const reportRef = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // --- BRAND HEADER ---
  // Header background banner
  doc.rect(40, 40, 515, 64).fill('#4F46E5');

  // Header Title Text
  doc.fillColor('#FFFFFF')
     .fontSize(20)
     .font('Helvetica-Bold')
     .text('FINANCIAL AUDIT STATEMENT', 56, 52);

  doc.fontSize(10)
     .font('Helvetica')
     .text('Personal Expense Tracker & WhatsApp Notifier', 56, 76);

  // Metadata right column
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .text(`REF: ${reportRef}`, 380, 52, { align: 'right', width: 160 })
     .font('Helvetica')
     .fontSize(9)
     .text(`Date: ${currentDate}`, 380, 68, { align: 'right', width: 160 })
     .text(`Currency: INR (Rs.)`, 380, 82, { align: 'right', width: 160 });

  doc.moveDown(2);

  // --- EXECUTIVE KPI CARDS (4 Summary Boxes) ---
  let startY = 120;
  const boxWidth = 120;
  const boxHeight = 52;
  const gap = 11;

  // Box 1: Total Outflow
  doc.roundedRect(40, startY, boxWidth, boxHeight, 6).fillAndStroke('#EEF2FF', '#C7D2FE');
  doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('TOTAL EXPENDITURE', 48, startY + 8);
  doc.fillColor('#4F46E5').fontSize(13).font('Helvetica-Bold').text(`Rs. ${totalAmount.toLocaleString('en-IN')}`, 48, startY + 24);

  // Box 2: Total Transactions
  doc.roundedRect(40 + boxWidth + gap, startY, boxWidth, boxHeight, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('TRANSACTIONS', 48 + boxWidth + gap, startY + 8);
  doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text(`${transactionCount}`, 48 + boxWidth + gap, startY + 24);

  // Box 3: Average Outflow
  doc.roundedRect(40 + (boxWidth + gap) * 2, startY, boxWidth, boxHeight, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('AVERAGE / EXPENSE', 48 + (boxWidth + gap) * 2, startY + 8);
  doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text(`Rs. ${Math.round(avgExpense).toLocaleString('en-IN')}`, 48 + (boxWidth + gap) * 2, startY + 24);

  // Box 4: Top Category
  doc.roundedRect(40 + (boxWidth + gap) * 3, startY, boxWidth, boxHeight, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('TOP CATEGORY', 48 + (boxWidth + gap) * 3, startY + 8);
  doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text(topCategoryName, 48 + (boxWidth + gap) * 3, startY + 24, { width: boxWidth - 16 });

  // --- CATEGORY DISTRIBUTION BREAKDOWN ---
  startY += 70;
  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('CATEGORY EXPENDITURE SHARE', 40, startY);

  // Divider line
  doc.moveTo(40, startY + 16).lineTo(555, startY + 16).strokeColor('#E2E8F0').stroke();

  startY += 24;
  const colWidth = 245;

  categoryList.slice(0, 6).forEach(([catName, catData], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 40 + col * (colWidth + 25);
    const y = startY + row * 28;

    const percent = totalAmount > 0 ? (catData.total / totalAmount) : 0;
    const percentText = `${Math.round(percent * 100)}%`;

    // Category Dot
    doc.circle(x + 4, y + 5, 4).fill(catData.color);

    // Label & Amount
    doc.fillColor('#1E293B').fontSize(9).font('Helvetica-Bold').text(catName, x + 14, y);
    doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(`Rs. ${catData.total.toLocaleString('en-IN')} (${percentText})`, x + colWidth - 105, y, { align: 'right' });

    // Progress Bar Track
    doc.rect(x + 14, y + 14, colWidth - 14, 4).fill('#F1F5F9');
    // Progress Bar Fill
    if (percent > 0) {
      doc.rect(x + 14, y + 14, Math.max(4, (colWidth - 14) * percent), 4).fill(catData.color);
    }
  });

  const categoryRowsCount = Math.ceil(Math.min(categoryList.length, 6) / 2);
  startY += categoryRowsCount * 28 + 20;

  // --- ITEMIZED TRANSACTION LEDGER TABLE ---
  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('ITEMIZED EXPENSE LEDGER', 40, startY);
  doc.moveTo(40, startY + 16).lineTo(555, startY + 16).strokeColor('#E2E8F0').stroke();

  startY += 24;

  // Table Header Background
  doc.rect(40, startY, 515, 22).fill('#1E293B');

  // Table Header Text
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
  doc.text('DATE', 48, startY + 6);
  doc.text('CATEGORY', 128, startY + 6);
  doc.text('DESCRIPTION / NOTE', 248, startY + 6);
  doc.text('AMOUNT', 440, startY + 6, { align: 'right', width: 105 });

  startY += 22;

  // Table Rows
  expenses.forEach((item, index) => {
    // Page break handling
    if (startY > 740) {
      doc.addPage();
      startY = 50;

      // Repeat Table Header on new page
      doc.rect(40, startY, 515, 22).fill('#1E293B');
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      doc.text('DATE', 48, startY + 6);
      doc.text('CATEGORY', 128, startY + 6);
      doc.text('DESCRIPTION / NOTE', 248, startY + 6);
      doc.text('AMOUNT', 440, startY + 6, { align: 'right', width: 105 });
      startY += 22;
    }

    const isEven = index % 2 === 0;
    if (isEven) {
      doc.rect(40, startY, 515, 20).fill('#F8FAFC');
    }

    doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
    doc.text(item.date, 48, startY + 5);

    doc.fillColor('#334155').font('Helvetica-Bold');
    doc.text(item.category_name || 'Other', 128, startY + 5);

    doc.fillColor('#64748B').font('Helvetica');
    doc.text(item.note || '—', 248, startY + 5, { width: 180, height: 14 });

    doc.fillColor('#0F172A').font('Helvetica-Bold');
    doc.text(`Rs. ${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 440, startY + 5, { align: 'right', width: 105 });

    // Cell divider line
    doc.moveTo(40, startY + 20).lineTo(555, startY + 20).strokeColor('#F1F5F9').stroke();

    startY += 20;
  });

  // Table Total Row
  doc.rect(40, startY, 515, 24).fill('#EEF2FF');
  doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold');
  doc.text('GRAND TOTAL EXPENDITURE:', 248, startY + 7);
  doc.fillColor('#4F46E5').fontSize(10).font('Helvetica-Bold');
  doc.text(`Rs. ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 440, startY + 7, { align: 'right', width: 105 });

  startY += 40;

  // --- FOOTER & SIGNOFF ---
  if (startY > 720) {
    doc.addPage();
    startY = 700;
  }

  doc.moveTo(40, startY).lineTo(160, startY).strokeColor('#94A3B8').stroke();
  doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('Authorized Account Auditor', 40, startY + 4);

  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('Expense Tracker Application • Certified PDFKit Financial Statement', 260, startY + 4, { align: 'right', width: 295 });

  // End and finalize PDF stream
  doc.end();
}

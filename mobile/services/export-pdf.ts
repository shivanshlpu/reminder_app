/**
 * Professional PDF Report Generator
 * Integrates PDFKit backend generator with native expo-print fallback.
 * Generates clean, publication-grade A4 financial statements without text overlaps or formatting issues.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Expense } from '../hooks/useExpenses';
import { whatsappApi } from './whatsapp-api';
import { formatToDDMMYYYY } from '../utils/date';

export async function exportToPdf(
  expenses: Expense[],
  title: string = 'Executive Expense Statement',
  dateRange?: { start: string; end: string }
): Promise<void> {
  const fileName = `Expense_Statement_${new Date().toISOString().split('T')[0]}.pdf`;

  // 1. On Web Platform: Attempt PDFKit backend API download, with seamless client-side fallback
  if (Platform.OS === 'web') {
    try {
      const backendUrl = whatsappApi.getBaseUrl();
      if (backendUrl) {
        const response = await fetch(`${backendUrl}/api/export/pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expenses, title }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          return;
        }
      }
    } catch (e) {
      console.warn('Backend PDFKit API call notice, using client print fallback:', e);
    }
  }

  // 2. Prepare Data for HTML Print Template
  const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const transactionCount = expenses.length;
  const avgExpense = transactionCount > 0 ? totalAmount / transactionCount : 0;

  const categoryTotals: Record<string, { total: number; count: number; color: string }> = {};
  expenses.forEach((e) => {
    const cat = e.category_name || 'Other';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { total: 0, count: 0, color: e.category_color || '#4F46E5' };
    }
    categoryTotals[cat].total += Number(e.amount) || 0;
    categoryTotals[cat].count += 1;
  });

  const categoryList = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);
  const topCategoryName = categoryList.length > 0 ? categoryList[0][0] : 'N/A';

  const dateRangeStr = dateRange
    ? `${dateRange.start} — ${dateRange.end}`
    : 'Complete Recorded Period';

  const reportRef = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Clean, high-precision, print-safe A4 HTML template
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 12mm 12mm 12mm 12mm;
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        body {
          background-color: #FFFFFF;
          color: #0F172A;
          font-size: 11px;
          line-height: 1.4;
          width: 100%;
        }
        .brand-header {
          display: table;
          width: 100%;
          padding-bottom: 16px;
          border-bottom: 2px solid #4F46E5;
          margin-bottom: 20px;
        }
        .brand-left {
          display: table-cell;
          vertical-align: middle;
        }
        .brand-title {
          font-size: 20px;
          font-weight: 800;
          color: #0F172A;
          letter-spacing: -0.3px;
        }
        .brand-subtitle {
          font-size: 10px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
          margin-top: 2px;
        }
        .brand-right {
          display: table-cell;
          vertical-align: middle;
          text-align: right;
        }
        .meta-ref {
          font-size: 12px;
          font-weight: 700;
          color: #4F46E5;
        }
        .meta-text {
          font-size: 10px;
          color: #64748B;
          margin-top: 2px;
        }
        .section-heading {
          font-size: 12px;
          font-weight: 700;
          color: #0F172A;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          padding-bottom: 4px;
          border-bottom: 1px solid #E2E8F0;
        }
        .kpi-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 8px 0;
          margin-left: -8px;
          margin-right: -8px;
          margin-bottom: 22px;
          page-break-inside: avoid;
        }
        .kpi-cell {
          width: 25%;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 10px 12px;
          vertical-align: top;
        }
        .kpi-cell.highlight {
          background: #EEF2FF;
          border-color: #C7D2FE;
        }
        .kpi-label {
          font-size: 9px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .kpi-value {
          font-size: 15px;
          font-weight: 800;
          color: #0F172A;
        }
        .kpi-cell.highlight .kpi-value {
          color: #4F46E5;
        }
        .kpi-sub {
          font-size: 9px;
          color: #94A3B8;
          margin-top: 2px;
        }
        .category-section {
          margin-bottom: 22px;
          page-break-inside: avoid;
        }
        .cat-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 8px;
          margin: -8px;
        }
        .cat-cell {
          width: 50%;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 8px 12px;
          vertical-align: top;
        }
        .cat-header {
          display: table;
          width: 100%;
          margin-bottom: 6px;
        }
        .cat-badge {
          display: table-cell;
          vertical-align: middle;
          font-weight: 700;
          font-size: 11px;
          color: #1E293B;
        }
        .cat-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          margin-right: 5px;
          vertical-align: middle;
        }
        .cat-amount {
          display: table-cell;
          vertical-align: middle;
          text-align: right;
          font-weight: 700;
          font-size: 11px;
          color: #0F172A;
        }
        .progress-track {
          width: 100%;
          height: 5px;
          background: #F1F5F9;
          border-radius: 3px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 3px;
        }
        .ledger-section {
          margin-bottom: 24px;
        }
        .ledger-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .ledger-table th {
          background: #1E293B;
          color: #FFFFFF;
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          text-align: left;
        }
        .ledger-table th:last-child {
          text-align: right;
        }
        .ledger-table td {
          padding: 7px 10px;
          border-bottom: 1px solid #E2E8F0;
          font-size: 10.5px;
          color: #334155;
          vertical-align: middle;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .ledger-table tr:nth-child(even) {
          background-color: #F8FAFC;
        }
        .ledger-table tr {
          page-break-inside: avoid;
        }
        .cell-date {
          font-weight: 600;
          color: #0F172A;
        }
        .cell-cat {
          font-weight: 600;
        }
        .cell-note {
          color: #64748B;
        }
        .cell-amount {
          font-weight: 700;
          text-align: right;
          color: #0F172A;
          white-space: nowrap;
        }
        .total-row {
          background: #EEF2FF !important;
          font-weight: 800 !important;
        }
        .total-row td {
          font-size: 11px !important;
          color: #0F172A !important;
          padding: 10px !important;
          border-top: 2px solid #C7D2FE;
          border-bottom: 2px solid #C7D2FE;
        }
        .report-footer {
          margin-top: 28px;
          padding-top: 14px;
          border-top: 1px solid #E2E8F0;
          display: table;
          width: 100%;
          page-break-inside: avoid;
        }
        .sign-box {
          display: table-cell;
          vertical-align: bottom;
          text-align: left;
        }
        .sign-line {
          width: 130px;
          height: 1px;
          background: #94A3B8;
          margin-bottom: 4px;
        }
        .sign-label {
          font-size: 9px;
          color: #64748B;
          font-weight: 600;
        }
        .footer-note {
          display: table-cell;
          vertical-align: bottom;
          text-align: right;
          font-size: 9px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <div class="brand-header">
        <div class="brand-left">
          <div class="brand-title">Financial Audit Report</div>
          <div class="brand-subtitle">Personal Expense Tracking Statement</div>
        </div>
        <div class="brand-right">
          <div class="meta-ref">REF: ${reportRef}</div>
          <div class="meta-text">Generated: ${currentDate}</div>
          <div class="meta-text">Period: ${dateRangeStr}</div>
        </div>
      </div>

      <table class="kpi-table">
        <tr>
          <td class="kpi-cell highlight">
            <div class="kpi-label">Total Expenditure</div>
            <div class="kpi-value">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div class="kpi-sub">Net Outflow</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Transactions</div>
            <div class="kpi-value">${transactionCount}</div>
            <div class="kpi-sub">Total Recorded</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Average Outflow</div>
            <div class="kpi-value">₹${Math.round(avgExpense).toLocaleString('en-IN')}</div>
            <div class="kpi-sub">Per Transaction</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Top Category</div>
            <div class="kpi-value" style="font-size: 13px;">${topCategoryName}</div>
            <div class="kpi-sub">Highest Spending Share</div>
          </td>
        </tr>
      </table>

      ${
        categoryList.length > 0
          ? `
      <div class="category-section">
        <div class="section-heading">Category Expenditure Share</div>
        <table class="cat-table">
          ${Array.from({ length: Math.ceil(Math.min(categoryList.length, 6) / 2) })
            .map((_, rowIdx) => {
              const item1 = categoryList[rowIdx * 2];
              const item2 = categoryList[rowIdx * 2 + 1];
              const p1 = item1 && totalAmount > 0 ? Math.round((item1[1].total / totalAmount) * 100) : 0;
              const p2 = item2 && totalAmount > 0 ? Math.round((item2[1].total / totalAmount) * 100) : 0;

              return `
                <tr>
                  <td class="cat-cell">
                    ${
                      item1
                        ? `
                      <div class="cat-header">
                        <div class="cat-badge">
                          <span class="cat-dot" style="background-color: ${item1[1].color};"></span>
                          <span>${item1[0]} (${item1[1].count})</span>
                        </div>
                        <div class="cat-amount">₹${item1[1].total.toLocaleString('en-IN')} <span style="font-size:9px; color:#64748B;">(${p1}%)</span></div>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width: ${p1}%; background-color: ${item1[1].color};"></div>
                      </div>
                    `
                        : ''
                    }
                  </td>
                  <td class="cat-cell">
                    ${
                      item2
                        ? `
                      <div class="cat-header">
                        <div class="cat-badge">
                          <span class="cat-dot" style="background-color: ${item2[1].color};"></span>
                          <span>${item2[0]} (${item2[1].count})</span>
                        </div>
                        <div class="cat-amount">₹${item2[1].total.toLocaleString('en-IN')} <span style="font-size:9px; color:#64748B;">(${p2}%)</span></div>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width: ${p2}%; background-color: ${item2[1].color};"></div>
                      </div>
                    `
                        : ''
                    }
                  </td>
                </tr>
              `;
            })
            .join('')}
        </table>
      </div>
      `
          : ''
      }

      <div class="ledger-section">
        <div class="section-heading">Itemized Expense Ledger</div>
        <table class="ledger-table">
          <thead>
            <tr>
              <th style="width: 16%;">Date</th>
              <th style="width: 24%;">Category</th>
              <th style="width: 38%;">Description / Note</th>
              <th style="width: 22%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${expenses
              .map(
                (e) => `
              <tr>
                <td class="cell-date">${formatToDDMMYYYY(e.date)}</td>
                <td class="cell-cat">
                  <span class="cat-dot" style="background-color: ${e.category_color || '#4F46E5'};"></span>
                  <span>${e.category_name || 'Other'}</span>
                </td>
                <td class="cell-note">${e.note ? e.note : '<span style="color:#CBD5E1;">—</span>'}</td>
                <td class="cell-amount">₹${Number(e.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `
              )
              .join('')}
            
            <tr class="total-row">
              <td colspan="3" style="text-align: right; font-weight: 800;">GRAND TOTAL EXPENDITURE:</td>
              <td class="cell-amount" style="font-size: 12px; color: #4F46E5;">
                ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="report-footer">
        <div class="sign-box">
          <div class="sign-line"></div>
          <div class="sign-label">Authorized Account Auditor</div>
        </div>
        <div class="footer-note">
          <div>PocketRadar Application • Certified Financial Statement</div>
          <div>Confidential • Generated automatically on ${currentDate}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  // 3. Web Platform Fallback
  if (Platform.OS === 'web') {
    try {
      await Print.printAsync({ html });
      return;
    } catch (e) {
      console.warn('Web printAsync failed:', e);
    }
  }

  // 4. Native iOS / Android: Print to File & Native Share/Download
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Save Expense Statement PDF',
      UTI: 'com.adobe.pdf',
    });
  }
}

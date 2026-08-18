/**
 * Professional PDF Report Generator
 * Integrates PDFKit backend generator with native expo-print fallback.
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
  // On Web Platform: Call backend PDFKit generator API endpoint to download .pdf report
  if (Platform.OS === 'web') {
    try {
      const backendUrl = whatsappApi.getBaseUrl();
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
        a.download = `Expense_Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (e) {
      console.warn('Backend PDFKit API call failed, using client PDF generator fallback:', e);
    }
  }

  // Native iOS / Android / Fallback: HTML Print to PDF
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const transactionCount = expenses.length;
  const avgExpense = transactionCount > 0 ? totalAmount / transactionCount : 0;

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

  const dateRangeStr = dateRange
    ? `${dateRange.start} — ${dateRange.end}`
    : 'Complete Recorded Period';

  const reportRef = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 14mm 12mm 14mm 12mm;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: #FFFFFF; color: #0F172A; font-size: 12px; line-height: 1.5; padding: 24px; }
        .brand-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 2px solid #4F46E5; margin-bottom: 24px; }
        .logo-area { display: flex; align-items: center; gap: 12px; }
        .logo-icon { width: 44px; height: 44px; background: #4F46E5; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #FFFFFF; font-weight: 800; font-size: 22px; }
        .brand-title { font-size: 22px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px; }
        .brand-subtitle { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .meta-box { text-align: right; }
        .meta-ref { font-size: 13px; font-weight: 700; color: #4F46E5; }
        .meta-text { font-size: 11px; color: #64748B; margin-top: 2px; }
        .section-heading { font-size: 14px; font-weight: 700; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .section-heading::after { content: ''; flex: 1; height: 1px; background: #E2E8F0; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; page-break-inside: avoid; }
        .kpi-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; }
        .kpi-card.highlight { background: #EEF2FF; border-color: #C7D2FE; }
        .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .kpi-value { font-size: 18px; font-weight: 800; color: #0F172A; }
        .kpi-card.highlight .kpi-value { color: #4F46E5; }
        .kpi-sub { font-size: 10px; color: #94A3B8; margin-top: 2px; }
        .category-section { margin-bottom: 28px; page-break-inside: avoid; }
        .cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .cat-item { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; }
        .cat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .cat-badge { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12px; color: #1E293B; }
        .cat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .cat-amount { font-weight: 700; font-size: 12px; color: #0F172A; }
        .progress-track { width: 100%; height: 6px; background: #F1F5F9; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; }
        .ledger-section { margin-bottom: 28px; }
        .ledger-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .ledger-table th { background: #1E293B; color: #FFFFFF; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; }
        .ledger-table th:first-child { border-top-left-radius: 6px; }
        .ledger-table th:last-child { border-top-right-radius: 6px; text-align: right; }
        .ledger-table td { padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-size: 11px; color: #334155; }
        .ledger-table tr:nth-child(even) { background-color: #F8FAFC; }
        .ledger-table tr:last-child td { border-bottom: 2px solid #CBD5E1; }
        .cell-date { font-weight: 600; white-space: nowrap; color: #0F172A; }
        .cell-cat { font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .cell-note { color: #64748B; }
        .cell-amount { font-weight: 700; text-align: right; color: #0F172A; white-space: nowrap; }
        .total-row { background: #F1F5F9 !important; font-weight: 800 !important; }
        .total-row td { font-size: 12px !important; color: #0F172A !important; padding: 12px !important; }
        .report-footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
        .sign-box { text-align: left; }
        .sign-line { width: 140px; height: 1px; background: #94A3B8; margin-bottom: 4px; }
        .sign-label { font-size: 10px; color: #64748B; font-weight: 600; }
        .footer-note { text-align: right; font-size: 10px; color: #94A3B8; }
      </style>
    </head>
    <body>
      <div class="brand-header">
        <div class="logo-area">
          <div class="logo-icon">₹</div>
          <div>
            <div class="brand-title">Financial Audit Report</div>
            <div class="brand-subtitle">Personal Expense Tracking Statement</div>
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-ref">REF: ${reportRef}</div>
          <div class="meta-text">Generated: ${currentDate}</div>
          <div class="meta-text">Period: ${dateRangeStr}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Expenditure</div>
          <div class="kpi-value">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div class="kpi-sub">Net Outflow</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Transactions</div>
          <div class="kpi-value">${transactionCount}</div>
          <div class="kpi-sub">Total Entries</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Average Outflow</div>
          <div class="kpi-value">₹${Math.round(avgExpense).toLocaleString('en-IN')}</div>
          <div class="kpi-sub">Per Transaction</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Top Category</div>
          <div class="kpi-value">${topCategoryName}</div>
          <div class="kpi-sub">Highest Spending Share</div>
        </div>
      </div>

      <div class="category-section">
        <div class="section-heading">Category Expenditure Share</div>
        <div class="cat-grid">
          ${categoryList
            .map(([catName, catData]) => {
              const percent = totalAmount > 0 ? Math.round((catData.total / totalAmount) * 100) : 0;
              return `
                <div class="cat-item">
                  <div class="cat-header">
                    <div class="cat-badge">
                      <div class="cat-dot" style="background-color: ${catData.color}"></div>
                      <span>${catName} (${catData.count})</span>
                    </div>
                    <div class="cat-amount">₹${catData.total.toLocaleString('en-IN')} <span style="font-size:10px; color:#64748B;">(${percent}%)</span></div>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${percent}%; background-color: ${catData.color};"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="ledger-section">
        <div class="section-heading">Itemized Expense Ledger</div>
        <table class="ledger-table">
          <thead>
            <tr>
              <th style="width: 15%;">Date</th>
              <th style="width: 25%;">Category</th>
              <th style="width: 40%;">Description / Purpose</th>
              <th style="width: 20%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${expenses
              .map(
                (e) => `
              <tr>
                <td class="cell-date">${formatToDDMMYYYY(e.date)}</td>
                <td class="cell-cat">
                  <span class="cat-dot" style="background-color: ${e.category_color || '#4F46E5'}"></span>
                  <span>${e.category_name || 'Other'}</span>
                </td>
                <td class="cell-note">${e.note ? e.note : '<span style="color:#CBD5E1;">—</span>'}</td>
                <td class="cell-amount">₹${e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `
              )
              .join('')}
            
            <tr class="total-row">
              <td colspan="3" style="text-align: right; font-weight: 800;">GRAND TOTAL EXPENDITURE:</td>
              <td class="cell-amount" style="font-size: 13px; color: #4F46E5;">
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
          <div>Expense Tracker Application • Certified Financial Statement</div>
          <div>Confidential • Generated automatically on ${currentDate}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Export Executive Expense Statement PDF',
      UTI: 'com.adobe.pdf',
    });
  }
}

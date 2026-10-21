/**
 * Professional PDF Passbook Statement Generator for Shop / Ration Khata
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Shop, ShopEntry } from '../hooks/useShopKhata';
import { formatToDDMMYYYY, getTodayDDMMYYYY } from '../utils/date';

export async function exportShopPdf(shop: Shop, entries: ShopEntry[]): Promise<void> {
  const fileName = `Khata_Statement_${shop.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  const totalPurchases = entries.filter((e) => e.type === 'purchase').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalPayments = entries.filter((e) => e.type === 'payment').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const balanceDue = totalPurchases - totalPayments;

  const rowsHtml = entries
    .map((e) => {
      const isPurchase = e.type === 'purchase';
      const typeLabel = isPurchase ? 'सामान लिया (Purchase)' : 'भुगतान (Payment)';
      const typeColor = isPurchase ? '#EF4444' : '#10B981';
      const amountPrefix = isPurchase ? '+₹' : '-₹';
      const desc = e.items ? e.items : e.note ? e.note : '-';

      return `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 8px; font-size: 13px; color: #334155;">${formatToDDMMYYYY(e.date)}</td>
          <td style="padding: 10px 8px; font-size: 13px; font-weight: 600; color: ${typeColor};">${typeLabel}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #1E293B; max-width: 250px;">${desc}</td>
          <td style="padding: 10px 8px; font-size: 13px; font-weight: 700; text-align: right; color: ${typeColor};">
            ${amountPrefix}${Number(e.amount).toLocaleString('en-IN')}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Khata Statement - ${shop.name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; padding: 28px; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4F46E5; padding-bottom: 16px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 800; color: #4F46E5; margin: 0; }
          .subtitle { font-size: 13px; color: #64748B; margin-top: 4px; }
          .meta-box { background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; }
          .meta-col { flex: 1; }
          .meta-label { font-size: 11px; text-transform: uppercase; color: #64748B; font-weight: 700; margin-bottom: 4px; }
          .meta-value { font-size: 15px; font-weight: 700; color: #0F172A; }
          .balance-box { background: ${balanceDue > 0 ? '#FEF2F2' : '#F0FDF4'}; border: 1.5px solid ${balanceDue > 0 ? '#F87171' : '#4ADE80'}; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px; }
          .balance-title { font-size: 13px; font-weight: 700; color: ${balanceDue > 0 ? '#991B1B' : '#166534'}; text-transform: uppercase; }
          .balance-amount { font-size: 28px; font-weight: 900; color: ${balanceDue > 0 ? '#DC2626' : '#16A34A'}; margin: 6px 0; }
          .balance-status { font-size: 12px; color: ${balanceDue > 0 ? '#B91C1C' : '#15803D'}; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #F1F5F9; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; border-bottom: 2px solid #CBD5E1; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">PocketRadar Khata Book</h1>
            <div class="subtitle">दुकान व राशन खाता बही (Shop & Ration Ledger)</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: #64748B;">Date: ${getTodayDDMMYYYY()}</div>
            <div style="font-size: 12px; font-weight: 700; color: #4F46E5; margin-top: 2px;">Statement #PK-${shop.id}</div>
          </div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">दुकान का नाम (Shop Name)</div>
            <div class="meta-value">${shop.name}</div>
            <div style="font-size: 12px; color: #64748B; margin-top: 2px;">Category: ${shop.category}</div>
          </div>
          <div class="meta-col">
            <div class="meta-label">दुकानदार / व्यक्ति (Person)</div>
            <div class="meta-value">${shop.person_name || 'N/A'}</div>
            <div style="font-size: 12px; color: #64748B; margin-top: 2px;">${shop.phone ? `Phone: +${shop.phone}` : ''}</div>
          </div>
          <div class="meta-col" style="text-align: right;">
            <div class="meta-label">कुल लेन-देन (Entries)</div>
            <div class="meta-value">${entries.length} Transactions</div>
          </div>
        </div>

        <div class="balance-box">
          <div class="balance-title">कुल बकाया हिसाब (Net Outstanding Balance)</div>
          <div class="balance-amount">₹${Math.abs(balanceDue).toLocaleString('en-IN')}</div>
          <div class="balance-status">
            ${balanceDue > 0 ? '⚠️ बकाया राशि — दुकानदार को देना है (You Owe)' : balanceDue === 0 ? '✅ समस्त हिसाब चुकता है (Fully Cleared)' : '🎉 एडवांस जमा राशि (Advance)'}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding: 0 4px;">
          <div><strong>कुल सामान लिया (Purchases):</strong> ₹${totalPurchases.toLocaleString('en-IN')}</div>
          <div><strong>कुल भुगतान (Payments):</strong> ₹${totalPayments.toLocaleString('en-IN')}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 18%;">तारीख</th>
              <th style="width: 22%;">प्रकार</th>
              <th style="width: 42%;">सामान विवरण / नोट</th>
              <th style="width: 18%; text-align: right;">रकम (Amount)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94A3B8;">कोई लेन-देन दर्ज नहीं है</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by PocketRadar App • All records safely encrypted and stored locally
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 350);
      return;
    }
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: fileName });
  }
}

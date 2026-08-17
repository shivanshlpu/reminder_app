/**
 * Excel Export Service.
 * Generates an .xlsx file using SheetJS and shares it.
 */
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Expense } from '../hooks/useExpenses';

/**
 * Generates and shares an Excel expense report.
 */
export async function exportToExcel(
  expenses: Expense[],
  filename: string = 'expense_report'
): Promise<void> {
  // Prepare data rows
  const data = expenses.map((e) => ({
    Date: e.date,
    Category: e.category_name || 'Other',
    Amount: e.amount,
    Note: e.note || '',
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Main sheet with all expenses
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 15 }, // Category
    { wch: 12 }, // Amount
    { wch: 30 }, // Note
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

  // Summary sheet
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  expenses.forEach((e) => {
    const cat = e.category_name || 'Other';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { total: 0, count: 0 };
    }
    categoryTotals[cat].total += e.amount;
    categoryTotals[cat].count += 1;
  });

  const summaryData = Object.entries(categoryTotals).map(([cat, data]) => ({
    Category: cat,
    'Total Amount': data.total,
    'Transaction Count': data.count,
  }));

  // Add total row
  summaryData.push({
    Category: 'TOTAL',
    'Total Amount': expenses.reduce((sum, e) => sum + e.amount, 0),
    'Transaction Count': expenses.length,
  });

  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  summaryWs['!cols'] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Monthly breakdown sheet
  const monthlyData: Record<string, number> = {};
  expenses.forEach((e) => {
    const month = e.date.substring(0, 7); // YYYY-MM
    monthlyData[month] = (monthlyData[month] || 0) + e.amount;
  });

  const monthlyRows = Object.entries(monthlyData)
    .sort()
    .map(([month, total]) => ({
      Month: month,
      Total: total,
    }));

  if (monthlyRows.length > 0) {
    const monthlyWs = XLSX.utils.json_to_sheet(monthlyRows);
    monthlyWs['!cols'] = [{ wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, monthlyWs, 'Monthly');
  }

  // Write to base64
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // Save to file
  const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  const fileUri = `${docDir}${filename}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Share
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Share Expense Report',
    });
  }
}

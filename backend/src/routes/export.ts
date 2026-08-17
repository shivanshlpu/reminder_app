/**
 * Export Routes
 * POST /api/export/pdf — Generates a downloadable PDF report stream via PDFKit.
 */
import { Router, Request, Response } from 'express';
import { generatePdfReport, ExpenseReportItem } from '../services/generateReport';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/export/pdf
 * Generates and streams a PDFKit PDF document.
 *
 * Body:
 * {
 *   expenses: Array<{ date: string; category_name: string; category_color: string; amount: number; note: string }>,
 *   title?: string
 * }
 */
router.post('/pdf', (req: Request, res: Response) => {
  try {
    const { expenses, title } = req.body;

    if (!expenses || !Array.isArray(expenses)) {
      res.status(400).json({ success: false, error: 'expenses array is required' });
      return;
    }

    // Set headers for PDF file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Expense_Audit_Report.pdf"');

    // Generate PDF using PDFKit
    generatePdfReport(expenses as ExpenseReportItem[], res, title || 'Executive Expense Statement');
  } catch (error: any) {
    logger.error({ error }, 'Failed to generate PDFKit report');
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate PDF report' });
    }
  }
});

export default router;

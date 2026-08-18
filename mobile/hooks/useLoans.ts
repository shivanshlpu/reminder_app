/**
 * Hook for managing Loans & Debts (Khata / Udhaar) with automated WhatsApp notifications.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';
import { whatsappApi } from '../services/whatsapp-api';
import {
  createLoanAcknowledgmentMessage,
  createLoanReminderMessage,
  createRepaymentReceiptMessage,
  ReminderStyle,
} from '../services/loan-templates';

export interface Loan {
  id: number;
  user_id: string;
  person_name: string;
  person_phone: string;
  type: 'lent' | 'borrowed'; // 'lent' = I gave (to receive), 'borrowed' = I took (I owe)
  amount: number;
  amount_repaid: number;
  date: string;
  due_date: string | null;
  note: string | null;
  status: 'pending' | 'partially_paid' | 'settled';
  auto_notify: number;
  created_at: number;
  updated_at: number;
}

export function useLoans() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLoans = useCallback(
    async (showSpinner = false) => {
      if (!db || !user) return;
      if (showSpinner || loans.length === 0) {
        setLoading(true);
      }
      try {
        const result = await db.getAllAsync<Loan>(
          'SELECT * FROM loans WHERE user_id = ? ORDER BY date DESC, created_at DESC',
          [user.uid]
        );
        setLoans(result || []);
      } catch (error) {
        console.error('Failed to fetch loans:', error);
      } finally {
        setLoading(false);
      }
    },
    [db, user, loans.length]
  );

  /**
   * Add a new loan entry and automatically send a WhatsApp notification if enabled
   */
  const addLoan = useCallback(
    async (
      personName: string,
      personPhone: string,
      type: 'lent' | 'borrowed',
      amount: number,
      date: string,
      dueDate?: string,
      note?: string,
      autoNotify: boolean = true
    ): Promise<{ loanId: number; messageSent: boolean }> => {
      if (!db || !user) return { loanId: 0, messageSent: false };

      const cleanPhone = personPhone ? String(personPhone).replace(/[^\d+]/g, '') : '';
      const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;

      const res = await db.runAsync(
        `INSERT INTO loans (user_id, person_name, person_phone, type, amount, amount_repaid, date, due_date, note, status, auto_notify) 
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'pending', ?)`,
        [
          user.uid,
          (personName || '').trim(),
          cleanPhone,
          type,
          numAmount,
          date,
          dueDate || null,
          note?.trim() || null,
          autoNotify ? 1 : 0,
        ]
      );

      const loanId = res.lastInsertRowId;
      await fetchLoans(false);

      let messageSent = false;

      // Auto-send professional WhatsApp acknowledgment
      if (autoNotify && cleanPhone) {
        try {
          const messageText = createLoanAcknowledgmentMessage({
            personName: (personName || '').trim(),
            type,
            amount: numAmount,
            amountRepaid: 0,
            date,
            dueDate,
            note,
            userName: user.email ? user.email.split('@')[0] : 'Me',
          });

          await whatsappApi.sendMessage(
            [{ phone: cleanPhone, isGroup: false }],
            personName,
            undefined,
            messageText
          );

          // Log in message_logs
          await db.runAsync(
            `INSERT INTO message_logs (user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status) 
             VALUES (?, NULL, NULL, ?, ?, ?, ?, 'sent')`,
            [user.uid, type === 'lent' ? 'Loan Given' : 'Loan Received', personName, cleanPhone, messageText]
          );

          messageSent = true;
        } catch (err) {
          console.warn('Failed to auto-send WhatsApp loan notification:', err);
        }
      }

      return { loanId, messageSent };
    },
    [db, user, fetchLoans]
  );

  /**
   * Update an existing loan
   */
  const updateLoan = useCallback(
    async (
      id: number,
      personName: string,
      personPhone: string,
      type: 'lent' | 'borrowed',
      amount: number,
      amountRepaid: number,
      date: string,
      dueDate?: string,
      note?: string,
      status?: 'pending' | 'partially_paid' | 'settled'
    ) => {
      if (!db || !user) return;

      const cleanPhone = personPhone ? String(personPhone).replace(/[^\d+]/g, '') : '';
      const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
      const numRepaid = typeof amountRepaid === 'number' ? amountRepaid : parseFloat(String(amountRepaid).replace(/[^0-9.]/g, '')) || 0;

      const calcStatus =
        status ||
        (numRepaid >= numAmount ? 'settled' : numRepaid > 0 ? 'partially_paid' : 'pending');

      await db.runAsync(
        `UPDATE loans SET person_name = ?, person_phone = ?, type = ?, amount = ?, amount_repaid = ?, date = ?, due_date = ?, note = ?, status = ? 
         WHERE id = ? AND user_id = ?`,
        [
          (personName || '').trim(),
          cleanPhone,
          type,
          numAmount,
          numRepaid,
          date,
          dueDate || null,
          note?.trim() || null,
          calcStatus,
          id,
          user.uid,
        ]
      );
      await fetchLoans(false);
    },
    [db, user, fetchLoans]
  );


  /**
   * Delete a loan record
   */
  const deleteLoan = useCallback(
    async (id: number) => {
      if (!db || !user) return;
      await db.runAsync('DELETE FROM loans WHERE id = ? AND user_id = ?', [id, user.uid]);
      await fetchLoans(false);
    },
    [db, user, fetchLoans]
  );

  /**
   * Record a partial or full repayment
   */
  const recordRepayment = useCallback(
    async (
      id: number,
      repaymentAmount: number,
      sendReceipt: boolean = true
    ): Promise<boolean> => {
      if (!db || !user) return false;

      const loan = loans.find((l) => l.id === id);
      if (!loan) return false;

      const newRepaid = (loan.amount_repaid || 0) + Number(repaymentAmount);
      const newStatus = newRepaid >= loan.amount ? 'settled' : 'partially_paid';

      await db.runAsync(
        `UPDATE loans SET amount_repaid = ?, status = ? WHERE id = ? AND user_id = ?`,
        [newRepaid, newStatus, id, user.uid]
      );
      await fetchLoans(false);

      // Send WhatsApp payment receipt
      if (sendReceipt && loan.person_phone) {
        try {
          const receiptText = createRepaymentReceiptMessage(
            {
              personName: loan.person_name,
              type: loan.type,
              amount: loan.amount,
              amountRepaid: loan.amount_repaid,
              date: loan.date,
              dueDate: loan.due_date,
              note: loan.note,
              userName: user.email ? user.email.split('@')[0] : 'Me',
            },
            repaymentAmount
          );

          await whatsappApi.sendMessage(
            [{ phone: loan.person_phone, isGroup: false }],
            loan.person_name,
            undefined,
            receiptText
          );

          await db.runAsync(
            `INSERT INTO message_logs (user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status) 
             VALUES (?, NULL, NULL, ?, ?, ?, ?, 'sent')`,
            [user.uid, 'Loan Repayment Receipt', loan.person_name, loan.person_phone, receiptText]
          );
        } catch (err) {
          console.warn('Failed to send repayment receipt:', err);
        }
      }

      return true;
    },
    [db, user, loans, fetchLoans]
  );

  /**
   * Mark a loan as completely settled
   */
  const markAsSettled = useCallback(
    async (id: number, sendReceipt: boolean = true): Promise<boolean> => {
      const loan = loans.find((l) => l.id === id);
      if (!loan) return false;
      const remaining = loan.amount - loan.amount_repaid;
      return recordRepayment(id, remaining, sendReceipt);
    },
    [loans, recordRepayment]
  );

  /**
   * Send a follow-up WhatsApp reminder
   */
  const sendReminder = useCallback(
    async (loan: Loan, style: ReminderStyle = 'friendly'): Promise<boolean> => {
      if (!loan.person_phone || !db || !user) return false;

      const messageText = createLoanReminderMessage(
        {
          personName: loan.person_name,
          type: loan.type,
          amount: loan.amount,
          amountRepaid: loan.amount_repaid,
          date: loan.date,
          dueDate: loan.due_date,
          note: loan.note,
          userName: user.email ? user.email.split('@')[0] : 'Me',
        },
        style
      );

      const result = await whatsappApi.sendMessage(
        [{ phone: loan.person_phone, isGroup: false }],
        loan.person_name,
        undefined,
        messageText
      );

      if (result) {
        await db.runAsync(
          `INSERT INTO message_logs (user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status) 
           VALUES (?, NULL, NULL, ?, ?, ?, ?, 'sent')`,
          [user.uid, 'Loan Reminder', loan.person_name, loan.person_phone, messageText]
        );
        return true;
      }
      return false;
    },
    [db, user]
  );

  /**
   * Compute aggregate statistics
   */
  const stats = useMemo(() => {
    let totalLentPending = 0;
    let totalBorrowedPending = 0;
    let activeLentCount = 0;
    let activeBorrowedCount = 0;
    let settledCount = 0;

    loans.forEach((l) => {
      const remaining = Math.max(0, l.amount - (l.amount_repaid || 0));
      if (l.status === 'settled' || remaining === 0) {
        settledCount++;
      } else if (l.type === 'lent') {
        totalLentPending += remaining;
        activeLentCount++;
      } else {
        totalBorrowedPending += remaining;
        activeBorrowedCount++;
      }
    });

    const netBalance = totalLentPending - totalBorrowedPending;

    return {
      totalLentPending,
      totalBorrowedPending,
      netBalance,
      activeLentCount,
      activeBorrowedCount,
      settledCount,
      totalCount: loans.length,
    };
  }, [loans]);

  useEffect(() => {
    if (isReady) {
      fetchLoans();
    }
  }, [isReady, fetchLoans]);

  return {
    loans,
    loading,
    stats,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
    recordRepayment,
    markAsSettled,
    sendReminder,
  };
}

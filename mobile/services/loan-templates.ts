/**
 * Professional WhatsApp Message Templates for Loans & Debts (Khata / Udhaar)
 */

import { formatToDDMMYYYY } from '../utils/date';

export interface LoanMessageData {
  personName: string;
  type: 'lent' | 'borrowed'; // 'lent' = I gave loan (they owe me), 'borrowed' = I took loan (I owe them)
  amount: number;
  amountRepaid?: number;
  date: string;
  dueDate?: string | null;
  note?: string | null;
  userName?: string;
}

/**
 * Formats a currency number with Indian Rupee symbol
 */
export function formatINR(amount: number): string {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

/**
 * 1. Initial Loan / Credit Acknowledgment (Sent automatically upon entry)
 */
export function createLoanAcknowledgmentMessage(data: LoanMessageData): string {
  const sender = data.userName || 'Me';
  const remaining = (data.amount || 0) - (data.amountRepaid || 0);
  const formattedDate = formatToDDMMYYYY(data.date);
  const formattedDueDate = data.dueDate ? formatToDDMMYYYY(data.dueDate) : null;

  if (data.type === 'lent') {
    return [
      `🤝 *LOAN / CREDIT ACKNOWLEDGMENT*`,
      ``,
      `Dear *${data.personName}*,`,
      `This is a confirmation record that *${sender}* has provided/transferred a loan of *${formatINR(data.amount)}* on *${formattedDate}*.`,
      ``,
      data.note ? `📝 *Purpose/Note:* ${data.note}` : null,
      formattedDueDate ? `📅 *Agreed Due Date:* ${formattedDueDate}` : null,
      `💰 *Pending Balance:* ${formatINR(remaining)}`,
      ``,
      `_Kindly keep this message for your personal records._`,
      `Thank you!`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  // Borrowed
  return [
    `🤝 *LOAN RECEIPT ACKNOWLEDGMENT*`,
    ``,
    `Dear *${data.personName}*,`,
    `This is to confirm that *${sender}* has received a loan of *${formatINR(data.amount)}* from you on *${formattedDate}*.`,
    ``,
    data.note ? `📝 *Purpose/Note:* ${data.note}` : null,
    formattedDueDate ? `📅 *Agreed Repayment Date:* ${formattedDueDate}` : null,
    ``,
    `_I will ensure timely repayment as agreed. Thank you for your support!_`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export type ReminderStyle = 'friendly' | 'formal' | 'urgent';

/**
 * 2. Follow-up Reminder Message (Sent when clicking "WhatsApp Reminder")
 */
export function createLoanReminderMessage(
  data: LoanMessageData,
  style: ReminderStyle = 'friendly'
): string {
  const sender = data.userName || 'Me';
  const remaining = (data.amount || 0) - (data.amountRepaid || 0);
  const formattedDate = formatToDDMMYYYY(data.date);
  const formattedDueDate = data.dueDate ? formatToDDMMYYYY(data.dueDate) : null;

  if (style === 'formal') {
    return [
      `📢 *PAYMENT REMINDER*`,
      ``,
      `Dear *${data.personName}*,`,
      `This is a formal reminder regarding the pending balance of *${formatINR(remaining)}* (from the original loan of ${formatINR(data.amount)} on ${formattedDate}).`,
      ``,
      formattedDueDate ? `📅 *Due Date:* ${formattedDueDate}` : null,
      data.note ? `📝 *Note:* ${data.note}` : null,
      ``,
      `Kindly arrange the repayment at your earliest convenience.`,
      `Thank you!`,
      `— *${sender}*`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  if (style === 'urgent') {
    return [
      `⚠️ *OVERDUE PAYMENT NOTICE*`,
      ``,
      `Dear *${data.personName}*,`,
      `Your payment of *${formatINR(remaining)}* is now overdue${formattedDueDate ? ` (due since ${formattedDueDate})` : ''}.`,
      ``,
      `Please clear the remaining balance of *${formatINR(remaining)}* today or reach out if you need an extension.`,
      ``,
      `Thank you for your prompt attention.`,
      `— *${sender}*`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  // Default: Friendly
  return [
    `👋 *GENTLE PAYMENT REMINDER*`,
    ``,
    `Hi *${data.personName}*, hope you are doing well!`,
    `Just a gentle reminder regarding the pending balance of *${formatINR(remaining)}* (out of ${formatINR(data.amount)} on ${formattedDate}).`,
    ``,
    formattedDueDate ? `📅 *Expected Date:* ${formattedDueDate}` : null,
    data.note ? `📝 *Note:* ${data.note}` : null,
    ``,
    `Whenever convenient, kindly arrange for the transfer.`,
    `Thank you!`,
    `— *${sender}*`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * 3. Payment Received Receipt
 */
export function createRepaymentReceiptMessage(
  data: LoanMessageData,
  repaymentAmount: number
): string {
  const sender = data.userName || 'Me';
  const prevRemaining = (data.amount || 0) - (data.amountRepaid || 0);
  const newRemaining = Math.max(0, prevRemaining - repaymentAmount);
  const isSettled = newRemaining <= 0;
  const formattedDate = formatToDDMMYYYY(data.date);
  const todayStr = formatToDDMMYYYY(new Date());

  return [
    isSettled ? `🎉 *LOAN FULLY SETTLED & CLEARED*` : `✅ *PAYMENT RECEIVED RECEIPT*`,
    ``,
    `Dear *${data.personName}*,`,
    `Thank you! Received a payment of *${formatINR(repaymentAmount)}* on *${todayStr}*.`,
    ``,
    `💰 *Original Loan:* ${formatINR(data.amount)} (${formattedDate})`,
    `💰 *Payment Received:* ${formatINR(repaymentAmount)}`,
    `📊 *Remaining Balance:* ${formatINR(newRemaining)}`,
    `🔖 *Status:* ${isSettled ? '✅ Fully Settled (Zero Balance)' : '⏳ Partially Paid'}`,
    ``,
    isSettled
      ? `_This loan is now completely settled and closed in our records. Thank you!_`
      : `_Kindly retain this receipt for your records. Thank you!_`,
    `Thank you!`,
    `— *${sender}*`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

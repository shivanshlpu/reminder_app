/**
 * Date Utilities for Standard DD/MM/YYYY formatting & ISO interoperability
 * Ensures user-facing dates always follow Indian standard (DD/MM/YYYY)
 * while database queries can seamlessly process standard ISO (YYYY-MM-DD).
 */

/**
 * Converts any ISO date ("2026-08-18"), Date object, or timestamp to "18/08/2026"
 */
export function formatToDDMMYYYY(input: string | Date | number | null | undefined): string {
  if (!input) return '';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    // Already in DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    // In YYYY-MM-DD or ISO timestamp format
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, yyyy, mm, dd] = match;
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  const d = new Date(input);
  if (isNaN(d.getTime())) return '';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Converts "18/08/2026" (or ISO date) to "2026-08-18" for SQLite / database storage
 */
export function formatToISO(input: string | Date | number | null | undefined): string {
  if (!input) return '';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    // In DD/MM/YYYY format
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyyMatch) {
      const [, dd, mm, yyyy] = ddmmyyyyMatch;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // Already YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      return isoMatch[1];
    }
  }

  const d = new Date(input);
  if (isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns today's date in "DD/MM/YYYY" format (e.g. "18/08/2026")
 */
export function getTodayDDMMYYYY(): string {
  return formatToDDMMYYYY(new Date());
}

/**
 * Returns today's date in "YYYY-MM-DD" format (e.g. "2026-08-18")
 */
export function getTodayISO(): string {
  return formatToISO(new Date());
}

/**
 * Formats a date string for elegant user presentation (e.g. "18 Aug 2026")
 */
export function formatDisplayDate(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const iso = formatToISO(input);
  if (!iso) return String(input);

  const parts = iso.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return formatToDDMMYYYY(input);
}

/**
 * Validates whether a DD/MM/YYYY string is a real calendar date
 */
export function isValidDDMMYYYY(input: string): boolean {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(input)) return false;
  const [ddStr, mmStr, yyyyStr] = input.split('/');
  const dd = parseInt(ddStr, 10);
  const mm = parseInt(mmStr, 10);
  const yyyy = parseInt(yyyyStr, 10);

  if (mm < 1 || mm > 12) return false;
  if (yyyy < 1900 || yyyy > 2100) return false;

  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  return dd >= 1 && dd <= daysInMonth;
}

/**
 * Smart automatic input masker for DD/MM/YYYY as user types
 */
export function applyDateMask(raw: string): string {
  // Keep only digits
  const digits = raw.replace(/\D/g, '').slice(0, 8);

  if (digits.length === 0) return '';
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Returns ISO start and end date for a given week.
 * offsetWeeks: 0 for current week, -1 for last week, etc.
 * Weeks are considered Monday to Sunday (or Sunday to Saturday). Let's use Monday as start of week.
 */
export function getWeekRange(offsetWeeks: number = 0): { start: string; end: string; label: string } {
  const now = new Date();
  const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (currentDay + 6) % 7; // Monday = 0, Sunday = 6
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const start = formatToISO(monday);
  const end = formatToISO(sunday);

  const label = offsetWeeks === 0
    ? 'This Week'
    : offsetWeeks === -1
    ? 'Last Week'
    : `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;

  return { start, end, label };
}

/**
 * Returns ISO start and end date for a given month (0-indexed month)
 */
export function getMonthRange(year: number, monthIndex: number): { start: string; end: string; label: string } {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  const start = formatToISO(firstDay);
  const end = formatToISO(lastDay);
  const label = firstDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return { start, end, label };
}

/**
 * Returns range for the current month
 */
export function getCurrentMonthRange(): { start: string; end: string; label: string } {
  const now = new Date();
  return getMonthRange(now.getFullYear(), now.getMonth());
}

/**
 * Returns range for the previous month
 */
export function getLastMonthRange(): { start: string; end: string; label: string } {
  const now = new Date();
  let prevMonth = now.getMonth() - 1;
  let year = now.getFullYear();
  if (prevMonth < 0) {
    prevMonth = 11;
    year -= 1;
  }
  return getMonthRange(year, prevMonth);
}

/**
 * Returns number of inclusive calendar days between two dates
 */
export function getDaysDifference(startDate: string | Date, endDate: string | Date): number {
  const startIso = formatToISO(startDate);
  const endIso = formatToISO(endDate);
  if (!startIso || !endIso) return 1;
  const d1 = new Date(startIso + 'T00:00:00');
  const d2 = new Date(endIso + 'T00:00:00');
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of both start and end day
  return Math.max(1, diffDays);
}


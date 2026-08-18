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

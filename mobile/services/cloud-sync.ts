/**
 * Cloud Data Sync & Hydration Engine
 * Connects to MongoDB backend to pull, restore, and synchronize all user data.
 * Includes strict concurrency locks and deduplication.
 */
import { IDatabase } from '../db/client';
import { whatsappApi } from './whatsapp-api';

export interface SyncStats {
  expenses: number;
  loans: number;
  locations: number;
  contacts: number;
}

let isSyncing = false;

export async function syncAllCloudData(db: IDatabase, userId: string): Promise<SyncStats> {
  const stats: SyncStats = { expenses: 0, loans: 0, locations: 0, contacts: 0 };
  const baseUrl = whatsappApi.getBaseUrl();
  if (!baseUrl || !userId || isSyncing) return stats;

  isSyncing = true;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    // 1. Sync Expenses
    try {
      const res = await fetch(`${baseUrl}/api/data/expenses?userId=${encodeURIComponent(userId)}`, {
        signal: controller?.signal,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        // Fetch existing local categories
        const localCats = await db.getAllAsync<{ id: number; name: string }>(
          'SELECT id, name FROM categories WHERE user_id = ?',
          [userId]
        );
        const catMap = new Map<string, number>();
        (localCats || []).forEach((c) => catMap.set(c.name.toLowerCase(), c.id));

        // Fetch existing local expenses to build a fast lookup set
        const existingExpenses = await db.getAllAsync<{ id: number; amount: number; date: string; note: string | null }>(
          'SELECT id, amount, date, note FROM expenses WHERE user_id = ?',
          [userId]
        );

        const seenKeys = new Set<string>();
        (existingExpenses || []).forEach((e) => {
          const key = `${e.date}|${Number(e.amount)}|${(e.note || '').trim().toLowerCase()}`;
          seenKeys.add(key);
        });

        for (const exp of json.data) {
          const expDate = String(exp.date || '').split('T')[0];
          const expAmount = Number(exp.amount) || 0;
          const expNote = exp.note || null;
          const expKey = `${expDate}|${expAmount}|${(expNote || '').trim().toLowerCase()}`;

          if (seenKeys.has(expKey)) {
            continue; // Skip existing
          }

          const catName = (exp.categoryName || 'Other').trim();
          let catId = catMap.get(catName.toLowerCase());

          if (!catId) {
            const catIcon = exp.categoryIcon || 'cash';
            const catColor = exp.categoryColor || '#6366F1';
            const catResult = await db.runAsync(
              'INSERT INTO categories (user_id, name, icon, color, is_default) VALUES (?, ?, ?, ?, 0)',
              [userId, catName, catIcon, catColor]
            );
            catId = catResult.lastInsertRowId;
            catMap.set(catName.toLowerCase(), catId);
          }

          await db.runAsync(
            'INSERT INTO expenses (user_id, category_id, amount, date, note) VALUES (?, ?, ?, ?, ?)',
            [userId, catId, expAmount, expDate, expNote]
          );
          seenKeys.add(expKey);
          stats.expenses++;
        }
      }
    } catch (e) {
      console.warn('Failed to sync expenses from cloud:', e);
    }

    // 2. Sync Loans
    try {
      const res = await fetch(`${baseUrl}/api/data/loans?userId=${encodeURIComponent(userId)}`, {
        signal: controller?.signal,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const existingLoans = await db.getAllAsync<{ person_name: string; amount: number; type: string; date: string }>(
          'SELECT person_name, amount, type, date FROM loans WHERE user_id = ?',
          [userId]
        );

        const seenLoanKeys = new Set<string>();
        (existingLoans || []).forEach((l) => {
          seenLoanKeys.add(`${(l.person_name || '').trim().toLowerCase()}|${Number(l.amount)}|${l.type}`);
        });

        for (const loan of json.data) {
          const pName = String(loan.personName || '').trim();
          const pPhone = String(loan.personPhone || '').trim();
          const lType = loan.type || 'lent';
          const lAmount = Number(loan.amount) || 0;
          const lRepaid = Number(loan.amountRepaid) || 0;
          const lDate = String(loan.date || '').split('T')[0] || '2026-08-01';
          const lDueDate = loan.dueDate || null;
          const lNote = loan.note || null;
          const lStatus = loan.status || 'pending';
          const lAutoNotify = loan.autoNotify ? 1 : 0;
          const loanKey = `${pName.toLowerCase()}|${lAmount}|${lType}`;

          if (!seenLoanKeys.has(loanKey) && pName) {
            await db.runAsync(
              'INSERT INTO loans (user_id, person_name, person_phone, type, amount, amount_repaid, date, due_date, note, status, auto_notify) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, pName, pPhone, lType, lAmount, lRepaid, lDate, lDueDate, lNote, lStatus, lAutoNotify]
            );
            seenLoanKeys.add(loanKey);
            stats.loans++;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync loans from cloud:', e);
    }

    // 3. Sync Pinned Locations
    try {
      const res = await fetch(`${baseUrl}/api/data/locations?userId=${encodeURIComponent(userId)}`, {
        signal: controller?.signal,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const existingLocs = await db.getAllAsync<{ name: string; latitude: number; longitude: number }>(
          'SELECT name, latitude, longitude FROM pinned_locations WHERE user_id = ?',
          [userId]
        );

        const seenLocKeys = new Set<string>();
        (existingLocs || []).forEach((l) => seenLocKeys.add((l.name || '').trim().toLowerCase()));

        for (const loc of json.data) {
          const lName = String(loc.name || '').trim();
          const lLat = Number(loc.latitude) || 0;
          const lLng = Number(loc.longitude) || 0;
          const lRadius = Number(loc.radius) || 10;
          const lAutoSend = loc.autoSend ? 1 : 0;
          const lMsg = loc.messageTemplate || 'Reached {location} at {time}.';
          const lActiveDays = Array.isArray(loc.activeDays) ? loc.activeDays.join(',') : 'mon,tue,wed,thu,fri,sat,sun';
          const lResetTime = loc.resetTime || '12:00 AM';

          if (!seenLocKeys.has(lName.toLowerCase()) && lName) {
            await db.runAsync(
              'INSERT INTO pinned_locations (user_id, name, latitude, longitude, radius, auto_send, message_template, active_days, reset_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, lName, lLat, lLng, lRadius, lAutoSend, lMsg, lActiveDays, lResetTime]
            );
            seenLocKeys.add(lName.toLowerCase());
            stats.locations++;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync locations from cloud:', e);
    }

    // 4. Sync Contacts
    try {
      const res = await fetch(`${baseUrl}/api/data/contacts?userId=${encodeURIComponent(userId)}`, {
        signal: controller?.signal,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const existingContacts = await db.getAllAsync<{ name: string; phone: string }>(
          'SELECT name, phone FROM contacts WHERE user_id = ?',
          [userId]
        );

        const seenContactKeys = new Set<string>();
        (existingContacts || []).forEach((c) => {
          seenContactKeys.add((c.phone || '').trim().replace(/[^0-9]/g, ''));
        });

        for (const c of json.data) {
          const cName = String(c.name || '').trim();
          const cPhone = String(c.phone || '').trim();
          const cPhoneKey = cPhone.replace(/[^0-9]/g, '');
          const cIsGroup = c.isGroup ? 1 : 0;
          const cGroupId = c.groupId || null;

          if (!seenContactKeys.has(cPhoneKey) && cName && cPhone) {
            await db.runAsync(
              'INSERT INTO contacts (user_id, name, phone, is_group, group_id) VALUES (?, ?, ?, ?, ?)',
              [userId, cName, cPhone, cIsGroup, cGroupId]
            );
            seenContactKeys.add(cPhoneKey);
            stats.contacts++;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync contacts from cloud:', e);
    }
  } finally {
    isSyncing = false;
    if (timeoutId) clearTimeout(timeoutId);
  }

  return stats;
}

/**
 * Lightweight background mutation dispatcher.
 * Syncs adds, updates, and deletes to MongoDB Atlas immediately in the background without blocking the UI thread.
 */
export function syncMutationWithCloud(endpoint: string, method: 'POST' | 'PUT' | 'DELETE', body?: any) {
  try {
    const baseUrl = whatsappApi.getBaseUrl();
    if (!baseUrl) return;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;

    fetch(`${baseUrl}/api/data/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    })
      .catch(() => {})
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  } catch (e) {}
}


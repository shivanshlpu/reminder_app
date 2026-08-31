/**
 * Cloud Data Sync & Hydration Engine
 * Connects to MongoDB backend to pull, restore, and synchronize all user data.
 */
import { IDatabase } from '../db/client';
import { whatsappApi } from './whatsapp-api';

export interface SyncStats {
  expenses: number;
  loans: number;
  locations: number;
  contacts: number;
}

export async function syncAllCloudData(db: IDatabase, userId: string): Promise<SyncStats> {
  const stats: SyncStats = { expenses: 0, loans: 0, locations: 0, contacts: 0 };
  const baseUrl = whatsappApi.getBaseUrl();
  if (!baseUrl || !userId) return stats;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

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

        // Fetch existing local expenses to prevent duplicates
        const existingExpenses = await db.getAllAsync<{ id: number; amount: number; date: string; note: string | null; category_id: number }>(
          'SELECT id, amount, date, note, category_id FROM expenses WHERE user_id = ?',
          [userId]
        );

        for (const exp of json.data) {
          const catName = (exp.categoryName || 'Other').trim();
          let catId = catMap.get(catName.toLowerCase());

          if (!catId) {
            // Create category if missing
            const catIcon = exp.categoryIcon || 'cash';
            const catColor = exp.categoryColor || '#6366F1';
            const catResult = await db.runAsync(
              'INSERT INTO categories (user_id, name, icon, color, is_default) VALUES (?, ?, ?, ?, 0)',
              [userId, catName, catIcon, catColor]
            );
            catId = catResult.lastInsertRowId;
            catMap.set(catName.toLowerCase(), catId);
          }

          const expDate = String(exp.date || '').split('T')[0];
          const expAmount = Number(exp.amount) || 0;
          const expNote = exp.note || null;

          const exists = (existingExpenses || []).some(
            (e) => e.amount === expAmount && e.date === expDate && (e.note || null) === expNote
          );

          if (!exists) {
            await db.runAsync(
              'INSERT INTO expenses (user_id, category_id, amount, date, note) VALUES (?, ?, ?, ?, ?)',
              [userId, catId, expAmount, expDate, expNote]
            );
            stats.expenses++;
          }
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

          const exists = (existingLoans || []).some(
            (l) => l.person_name.toLowerCase() === pName.toLowerCase() && l.amount === lAmount && l.type === lType
          );

          if (!exists && pName) {
            await db.runAsync(
              'INSERT INTO loans (user_id, person_name, person_phone, type, amount, amount_repaid, date, due_date, note, status, auto_notify) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, pName, pPhone, lType, lAmount, lRepaid, lDate, lDueDate, lNote, lStatus, lAutoNotify]
            );
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

        for (const loc of json.data) {
          const lName = String(loc.name || '').trim();
          const lLat = Number(loc.latitude) || 0;
          const lLng = Number(loc.longitude) || 0;
          const lRadius = Number(loc.radius) || 10;
          const lAutoSend = loc.autoSend ? 1 : 0;
          const lMsg = loc.messageTemplate || 'Reached {location} at {time}.';
          const lActiveDays = Array.isArray(loc.activeDays) ? loc.activeDays.join(',') : 'mon,tue,wed,thu,fri,sat,sun';
          const lResetTime = loc.resetTime || '12:00 AM';

          const exists = (existingLocs || []).some(
            (l) => l.name.toLowerCase() === lName.toLowerCase() || (Math.abs(l.latitude - lLat) < 0.0001 && Math.abs(l.longitude - lLng) < 0.0001)
          );

          if (!exists && lName) {
            await db.runAsync(
              'INSERT INTO pinned_locations (user_id, name, latitude, longitude, radius, auto_send, message_template, active_days, reset_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, lName, lLat, lLng, lRadius, lAutoSend, lMsg, lActiveDays, lResetTime]
            );
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

        for (const c of json.data) {
          const cName = String(c.name || '').trim();
          const cPhone = String(c.phone || '').trim();
          const cIsGroup = c.isGroup ? 1 : 0;
          const cGroupId = c.groupId || null;

          const exists = (existingContacts || []).some(
            (contact) => contact.phone === cPhone || contact.name.toLowerCase() === cName.toLowerCase()
          );

          if (!exists && cName && cPhone) {
            await db.runAsync(
              'INSERT INTO contacts (user_id, name, phone, is_group, group_id) VALUES (?, ?, ?, ?, ?)',
              [userId, cName, cPhone, cIsGroup, cGroupId]
            );
            stats.contacts++;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync contacts from cloud:', e);
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  return stats;
}

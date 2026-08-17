/**
 * Universal Database Client
 * Works seamlessly across Mobile (Native SQLite via expo-sqlite) and Web (AsyncStorage DB Engine).
 * Robust ID-based operations and strict deduplication to ensure 100% reliable state.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { whatsappApi } from '../services/whatsapp-api';

export interface IDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

const STORAGE_DB_PREFIX = '@expense_tracker_db_';

interface LocalStorageDBData {
  users: Array<{ id: string; email: string; display_name?: string; created_at: number }>;
  categories: Array<{ id: number; user_id: string; name: string; icon: string; color: string; is_default: number; created_at: number }>;
  expenses: Array<{ id: number; user_id: string; category_id: number; amount: number; date: string; note: string | null; created_at: number; updated_at: number }>;
  pinned_locations: Array<{ id: number; user_id: string; name: string; latitude: number; longitude: number; radius: number; auto_send: number; message_template: string; created_at: number }>;
  contacts: Array<{ id: number; user_id: string; name: string; phone: string; is_group: number; group_id: string | null; created_at: number }>;
  location_contacts: Array<{ id: number; location_id: number; contact_id: number }>;
  message_logs: Array<{ id: number; user_id: string; location_id: number | null; contact_id: number | null; location_name: string; recipient_name: string; recipient_phone: string; message_content: string; status: string; error_message: string | null; sent_at: number }>;
  autoIncrement: {
    categories: number;
    expenses: number;
    pinned_locations: number;
    contacts: number;
    location_contacts: number;
    message_logs: number;
  };
}

class AsyncStorageDatabase implements IDatabase {
  private data: LocalStorageDBData = {
    users: [],
    categories: [],
    expenses: [],
    pinned_locations: [],
    contacts: [],
    location_contacts: [],
    message_logs: [],
    autoIncrement: {
      categories: 1,
      expenses: 1,
      pinned_locations: 1,
      contacts: 1,
      location_contacts: 1,
      message_logs: 1,
    },
  };
  private isLoaded = false;

  async init(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_DB_PREFIX + 'state');
      if (stored) {
        this.data = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Initializing fresh local storage DB');
    }

    // Automatically deduplicate categories
    if (this.data.categories && this.data.categories.length > 0) {
      const seen = new Set<string>();
      const uniqueCats: typeof this.data.categories = [];
      for (const cat of this.data.categories) {
        const key = `${cat.user_id}_${cat.name.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCats.push(cat);
        }
      }
      this.data.categories = uniqueCats;
      await this.save();
    }

    this.isLoaded = true;
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_DB_PREFIX + 'state', JSON.stringify(this.data));
    } catch (e) {
      console.error('Failed to persist database to storage', e);
    }
  }

  private async syncWithCloud(endpoint: string, method: string, body?: any) {
    try {
      const baseUrl = whatsappApi.getBaseUrl();
      fetch(`${baseUrl}/api/data/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }).catch(() => {});
    } catch (e) {}
  }

  async execAsync(sql: string): Promise<void> {
    await this.init();
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    await this.init();
    const cleanSql = sql.trim();

    // 1. INSERT OR IGNORE INTO users
    if (/^INSERT\s+OR\s+IGNORE\s+INTO\s+users/i.test(cleanSql)) {
      const [id, email] = params;
      if (!this.data.users.some((u) => u.id === id)) {
        this.data.users.push({ id, email, created_at: Date.now() });
        await this.save();
        return { lastInsertRowId: 1, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 2. INSERT INTO categories (Strictly deduplicated by user_id and name)
    if (/^INSERT\s+INTO\s+categories/i.test(cleanSql)) {
      const [user_id, name, icon, color, is_default] = params;
      const existing = this.data.categories.find(
        (c) => c.user_id === String(user_id) && c.name.toLowerCase() === String(name).toLowerCase()
      );
      if (existing) {
        return { lastInsertRowId: existing.id, changes: 0 };
      }

      const id = this.data.autoIncrement.categories++;
      this.data.categories.push({
        id,
        user_id: String(user_id),
        name: String(name),
        icon: String(icon),
        color: String(color),
        is_default: is_default || 0,
        created_at: Date.now(),
      });
      await this.save();
      return { lastInsertRowId: id, changes: 1 };
    }

    // 3. INSERT INTO expenses
    if (/^INSERT\s+INTO\s+expenses/i.test(cleanSql)) {
      const [user_id, category_id, amount, date, note] = params;
      const id = this.data.autoIncrement.expenses++;
      const cat = this.data.categories.find((c) => c.id === Number(category_id));
      this.data.expenses.push({
        id,
        user_id: String(user_id),
        category_id: Number(category_id),
        amount: Number(amount),
        date: String(date),
        note: note || null,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      await this.save();

      this.syncWithCloud('expenses', 'POST', {
        userId: String(user_id),
        categoryId: String(category_id),
        categoryName: cat?.name || 'Other',
        categoryIcon: cat?.icon || 'cash',
        categoryColor: cat?.color || '#4F46E5',
        amount: Number(amount),
        date: String(date),
        note: note || null,
      });

      return { lastInsertRowId: id, changes: 1 };
    }

    // 4. UPDATE expenses
    if (/^UPDATE\s+expenses/i.test(cleanSql)) {
      const [category_id, amount, date, note, id] = params;
      const exp = this.data.expenses.find((e) => e.id === Number(id));
      if (exp) {
        exp.category_id = Number(category_id);
        exp.amount = Number(amount);
        exp.date = String(date);
        exp.note = note || null;
        exp.updated_at = Date.now();
        await this.save();
        return { lastInsertRowId: exp.id, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 5. DELETE FROM expenses
    if (/^DELETE\s+FROM\s+expenses/i.test(cleanSql)) {
      const [id] = params;
      const initialLen = this.data.expenses.length;
      this.data.expenses = this.data.expenses.filter((e) => e.id !== Number(id));
      await this.save();
      return { lastInsertRowId: 0, changes: initialLen - this.data.expenses.length };
    }

    // 6. INSERT INTO pinned_locations
    if (/^INSERT\s+INTO\s+pinned_locations/i.test(cleanSql)) {
      const [user_id, name, latitude, longitude, radius, message_template] = params;
      const id = this.data.autoIncrement.pinned_locations++;
      this.data.pinned_locations.push({
        id,
        user_id: String(user_id),
        name: String(name),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius) || 10,
        auto_send: 1,
        message_template: message_template || 'Reached {location} at {time}.',
        created_at: Date.now(),
      });
      await this.save();

      this.syncWithCloud('locations', 'POST', {
        userId: String(user_id),
        name: String(name),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius) || 10,
        autoSend: true,
        messageTemplate: message_template || 'Reached {location} at {time}.',
      });

      return { lastInsertRowId: id, changes: 1 };
    }

    // 7. UPDATE pinned_locations
    if (/^UPDATE\s+pinned_locations/i.test(cleanSql)) {
      const [name, radius, auto_send, message_template, id] = params;
      const loc = this.data.pinned_locations.find((l) => l.id === Number(id));
      if (loc) {
        loc.name = String(name);
        loc.radius = Number(radius);
        loc.auto_send = Number(auto_send);
        loc.message_template = String(message_template);
        await this.save();
        return { lastInsertRowId: loc.id, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 8. DELETE FROM pinned_locations
    if (/^DELETE\s+FROM\s+pinned_locations/i.test(cleanSql)) {
      const [id] = params;
      const initialLen = this.data.pinned_locations.length;
      this.data.pinned_locations = this.data.pinned_locations.filter((l) => l.id !== Number(id));
      this.data.location_contacts = this.data.location_contacts.filter((lc) => lc.location_id !== Number(id));
      await this.save();
      return { lastInsertRowId: 0, changes: initialLen - this.data.pinned_locations.length };
    }

    // 9. INSERT INTO contacts
    if (/^INSERT\s+INTO\s+contacts/i.test(cleanSql)) {
      const [user_id, name, phone, is_group, group_id] = params;
      const id = this.data.autoIncrement.contacts++;
      this.data.contacts.push({
        id,
        user_id: String(user_id),
        name: String(name),
        phone: String(phone),
        is_group: is_group ? 1 : 0,
        group_id: group_id || null,
        created_at: Date.now(),
      });
      await this.save();

      this.syncWithCloud('contacts', 'POST', {
        userId: String(user_id),
        name: String(name),
        phone: String(phone),
        isGroup: Boolean(is_group),
        groupId: group_id || null,
      });

      return { lastInsertRowId: id, changes: 1 };
    }

    // 10. UPDATE contacts
    if (/^UPDATE\s+contacts/i.test(cleanSql)) {
      const [name, phone, is_group, group_id, id] = params;
      const contact = this.data.contacts.find((c) => c.id === Number(id));
      if (contact) {
        contact.name = String(name);
        contact.phone = String(phone);
        contact.is_group = is_group ? 1 : 0;
        contact.group_id = group_id || null;
        await this.save();
        return { lastInsertRowId: contact.id, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 11. DELETE FROM contacts
    if (/^DELETE\s+FROM\s+contacts/i.test(cleanSql)) {
      const [id] = params;
      const initialLen = this.data.contacts.length;
      this.data.contacts = this.data.contacts.filter((c) => c.id !== Number(id));
      this.data.location_contacts = this.data.location_contacts.filter((lc) => lc.contact_id !== Number(id));
      await this.save();
      return { lastInsertRowId: 0, changes: initialLen - this.data.contacts.length };
    }

    // 12. Location contacts
    if (/^INSERT\s+OR\s+IGNORE\s+INTO\s+location_contacts/i.test(cleanSql)) {
      const [location_id, contact_id] = params;
      if (!this.data.location_contacts.some((lc) => lc.location_id === Number(location_id) && lc.contact_id === Number(contact_id))) {
        this.data.location_contacts.push({
          id: this.data.autoIncrement.location_contacts++,
          location_id: Number(location_id),
          contact_id: Number(contact_id),
        });
        await this.save();
      }
      return { lastInsertRowId: 1, changes: 1 };
    }
    if (/^DELETE\s+FROM\s+location_contacts/i.test(cleanSql)) {
      if (cleanSql.includes('location_id = ? AND contact_id = ?')) {
        const [location_id, contact_id] = params;
        this.data.location_contacts = this.data.location_contacts.filter((lc) => !(lc.location_id === Number(location_id) && lc.contact_id === Number(contact_id)));
      } else if (cleanSql.includes('contact_id = ?')) {
        const [contact_id] = params;
        this.data.location_contacts = this.data.location_contacts.filter((lc) => lc.contact_id !== Number(contact_id));
      }
      await this.save();
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 13. Message Logs
    if (/^INSERT\s+INTO\s+message_logs/i.test(cleanSql)) {
      const [user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status, error_message] = params;
      const id = this.data.autoIncrement.message_logs++;
      this.data.message_logs.push({
        id,
        user_id: String(user_id),
        location_id: location_id ? Number(location_id) : null,
        contact_id: contact_id ? Number(contact_id) : null,
        location_name: String(location_name),
        recipient_name: String(recipient_name),
        recipient_phone: String(recipient_phone),
        message_content: String(message_content),
        status: status || 'pending',
        error_message: error_message || null,
        sent_at: Math.floor(Date.now() / 1000),
      });
      await this.save();
      return { lastInsertRowId: id, changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  async getFirstAsync<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const all = await this.getAllAsync<T>(sql, params);
    return all.length > 0 ? all[0] : null;
  }

  async getAllAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.init();
    const cleanSql = sql.trim();

    // Categories Count
    if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+categories/i.test(cleanSql)) {
      const [user_id] = params;
      const seen = new Set<string>();
      const count = this.data.categories.filter((c) => {
        if (user_id && c.user_id !== user_id) return false;
        const nameKey = c.name.toLowerCase();
        if (seen.has(nameKey)) return false;
        seen.add(nameKey);
        return true;
      }).length;
      return [{ count } as unknown as T];
    }

    // Categories List (Strictly deduplicated by category name)
    if (/SELECT\s+(id,\s*name,\s*icon,\s*color|name)\s+FROM\s+categories/i.test(cleanSql)) {
      const [user_id] = params;
      const seen = new Set<string>();
      const uniqueCats: typeof this.data.categories = [];
      for (const cat of this.data.categories) {
        if (user_id && cat.user_id !== user_id) continue;
        const nameKey = cat.name.toLowerCase();
        if (!seen.has(nameKey)) {
          seen.add(nameKey);
          uniqueCats.push(cat);
        }
      }
      uniqueCats.sort((a, b) => a.name.localeCompare(b.name));
      return uniqueCats as unknown as T[];
    }

    // Monthly sum
    if (/SELECT\s+COALESCE\(SUM\(amount\),\s*0\)\s+as\s+total\s+FROM\s+expenses\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+date\s*>=\s*\?\s+AND\s+date\s*<=\s*\?/i.test(cleanSql)) {
      const [user_id, start, end] = params;
      const total = this.data.expenses
        .filter((e) => (!user_id || e.user_id === user_id) && e.date >= start && e.date <= end)
        .reduce((sum, e) => sum + e.amount, 0);
      return [{ total } as unknown as T];
    }

    // Today sum
    if (/SELECT\s+COALESCE\(SUM\(amount\),\s*0\)\s+as\s+total\s+FROM\s+expenses\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+date\s*=\s*\?/i.test(cleanSql)) {
      const [user_id, today] = params;
      const total = this.data.expenses
        .filter((e) => (!user_id || e.user_id === user_id) && e.date === today)
        .reduce((sum, e) => sum + e.amount, 0);
      return [{ total } as unknown as T];
    }

    // Monthly count
    if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+expenses\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+date\s*>=\s*\?\s+AND\s+date\s*<=\s*\?/i.test(cleanSql)) {
      const [user_id, start, end] = params;
      const count = this.data.expenses.filter((e) => (!user_id || e.user_id === user_id) && e.date >= start && e.date <= end).length;
      return [{ count } as unknown as T];
    }

    // Top category
    if (/SELECT\s+c\.name,\s*COALESCE\(SUM\(e\.amount\),\s*0\)\s+as\s+total/i.test(cleanSql)) {
      const [user_id, start, end] = params;
      const filtered = this.data.expenses.filter((e) => (!user_id || e.user_id === user_id) && e.date >= start && e.date <= end);
      const catTotals: Record<number, number> = {};
      filtered.forEach((e) => {
        catTotals[e.category_id] = (catTotals[e.category_id] || 0) + e.amount;
      });
      const topCatId = Object.keys(catTotals).sort((a, b) => catTotals[Number(b)] - catTotals[Number(a)])[0];
      if (topCatId) {
        const cat = this.data.categories.find((c) => c.id === Number(topCatId));
        return [{ name: cat?.name || '-', total: catTotals[Number(topCatId)] } as unknown as T];
      }
      return [{ name: '-', total: 0 } as unknown as T];
    }

    // Expenses query
    if (/FROM\s+expenses\s+e/i.test(cleanSql)) {
      const [user_id, ...restParams] = params;

      if (/WHERE\s+e\.id\s*=\s*\?/i.test(cleanSql)) {
        const [expId] = params;
        const exp = this.data.expenses.find((e) => e.id === Number(expId));
        if (exp) {
          const cat = this.data.categories.find((c) => c.id === exp.category_id);
          return [{
            ...exp,
            category_name: cat?.name || 'Other',
            category_icon: cat?.icon || 'cash',
            category_color: cat?.color || '#4F46E5',
          } as unknown as T];
        }
        return [];
      }

      let results = this.data.expenses.filter((e) => !user_id || e.user_id === user_id);

      if (cleanSql.includes('e.date >= ?') && cleanSql.includes('e.date <= ?')) {
        const [startDate, endDate] = restParams;
        if (startDate) results = results.filter((e) => e.date >= startDate);
        if (endDate) results = results.filter((e) => e.date <= endDate);
      }
      if (cleanSql.includes('e.category_id = ?')) {
        const catIdParam = restParams.find((p) => typeof p === 'number');
        if (catIdParam !== undefined) results = results.filter((e) => e.category_id === catIdParam);
      }
      if (cleanSql.includes('e.note LIKE ?')) {
        const searchParam = restParams.find((p) => typeof p === 'string' && p.startsWith('%'));
        if (searchParam) {
          const term = searchParam.replace(/%/g, '').toLowerCase();
          results = results.filter((e) => {
            const cat = this.data.categories.find((c) => c.id === e.category_id);
            return (e.note && e.note.toLowerCase().includes(term)) || (cat && cat.name.toLowerCase().includes(term));
          });
        }
      }

      results.sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at);

      if (cleanSql.includes('LIMIT 5') || cleanSql.includes('LIMIT 6')) {
        results = results.slice(0, 6);
      }

      const joined = results.map((e) => {
        const cat = this.data.categories.find((c) => c.id === e.category_id);
        return {
          ...e,
          category_name: cat?.name || 'Other',
          category_icon: cat?.icon || 'cash',
          category_color: cat?.color || '#4F46E5',
        };
      });

      return joined as unknown as T[];
    }

    // Locations query
    if (/FROM\s+pinned_locations/i.test(cleanSql)) {
      const [user_id] = params;
      const locs = this.data.pinned_locations
        .filter((l) => !user_id || l.user_id === user_id)
        .sort((a, b) => b.created_at - a.created_at)
        .map((l) => {
          const contact_count = this.data.location_contacts.filter((lc) => lc.location_id === l.id).length;
          return { ...l, contact_count };
        });
      return locs as unknown as T[];
    }

    // Location assigned contacts query (INNER JOIN)
    if (/FROM\s+contacts\s+c\s+INNER\s+JOIN\s+location_contacts/i.test(cleanSql)) {
      const [location_id] = params;
      const assignedContactIds = this.data.location_contacts
        .filter((lc) => lc.location_id === Number(location_id))
        .map((lc) => lc.contact_id);
      const contacts = this.data.contacts.filter((c) => assignedContactIds.includes(c.id));
      return contacts as unknown as T[];
    }

    // Contacts query
    if (/FROM\s+contacts/i.test(cleanSql)) {
      const [user_id] = params;
      const contacts = this.data.contacts
        .filter((c) => !user_id || c.user_id === user_id)
        .sort((a, b) => a.name.localeCompare(b.name));
      return contacts as unknown as T[];
    }

    // Message logs query
    if (/FROM\s+message_logs/i.test(cleanSql)) {
      const [user_id] = params;
      const logs = this.data.message_logs
        .filter((l) => !user_id || l.user_id === user_id)
        .sort((a, b) => b.sent_at - a.sent_at);
      return logs as unknown as T[];
    }

    return [];
  }
}

/**
 * Universal Database Factory
 */
export async function openDatabase(): Promise<IDatabase> {
  if (Platform.OS !== 'web') {
    try {
      const SQLite = require('expo-sqlite');
      const db = await SQLite.openDatabaseAsync('expense_tracker.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await initializeSqliteSchema(db);
      return db;
    } catch (e) {
      console.warn('Native SQLite open failed, falling back to universal storage DB', e);
    }
  }

  const asyncDb = new AsyncStorageDatabase();
  await asyncDb.init();
  return asyncDb;
}

async function initializeSqliteSchema(db: any): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pinned_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius INTEGER DEFAULT 10,
      auto_send INTEGER DEFAULT 1,
      message_template TEXT DEFAULT 'Reached {location} at {time}.',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      is_group INTEGER DEFAULT 0,
      group_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS location_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      location_id INTEGER,
      contact_id INTEGER,
      location_name TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      message_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      sent_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

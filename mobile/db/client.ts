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
  pinned_locations: Array<{ id: number; user_id: string; name: string; latitude: number; longitude: number; radius: number; auto_send: number; message_template: string; active_days?: string; reset_time?: string; created_at: number }>;
  contacts: Array<{ id: number; user_id: string; name: string; phone: string; is_group: number; group_id: string | null; created_at: number }>;
  location_contacts: Array<{ id: number; location_id: number; contact_id: number }>;
  message_logs: Array<{ id: number; user_id: string; location_id: number | null; contact_id: number | null; location_name: string; recipient_name: string; recipient_phone: string; message_content: string; status: string; error_message: string | null; sent_at: number }>;
  loans: Array<{ id: number; user_id: string; person_name: string; person_phone: string; type: 'lent' | 'borrowed'; amount: number; amount_repaid: number; date: string; due_date: string | null; note: string | null; status: 'pending' | 'partially_paid' | 'settled'; auto_notify: number; created_at: number; updated_at: number }>;
  autoIncrement: {
    categories: number;
    expenses: number;
    pinned_locations: number;
    contacts: number;
    location_contacts: number;
    message_logs: number;
    loans: number;
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
    loans: [],
    autoIncrement: {
      categories: 1,
      expenses: 1,
      pinned_locations: 1,
      contacts: 1,
      location_contacts: 1,
      message_logs: 1,
      loans: 1,
    },
  };
  private isLoaded = false;
  private saveTimeout: any = null;

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
      this.scheduleSave();
    }

    this.isLoaded = true;
  }

  /**
   * Fast write-behind persistence engine.
   * Updates persist in background without blocking the UI thread or entry creation.
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.save().catch(() => {});
    }, 40);
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_DB_PREFIX + 'state', JSON.stringify(this.data));
    } catch (e) {
      console.error('Failed to persist database to storage', e);
    }
  }

  private syncWithCloud(endpoint: string, method: string, body?: any) {
    try {
      const baseUrl = whatsappApi.getBaseUrl();
      if (!baseUrl) return;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;

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
        this.scheduleSave();
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
      this.scheduleSave();
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
      this.scheduleSave();

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
        this.scheduleSave();
        return { lastInsertRowId: exp.id, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 5. DELETE FROM expenses
    if (/^DELETE\s+FROM\s+expenses/i.test(cleanSql)) {
      const [id] = params;
      const initialLen = this.data.expenses.length;
      this.data.expenses = this.data.expenses.filter((e) => e.id !== Number(id));
      this.scheduleSave();
      return { lastInsertRowId: 0, changes: initialLen - this.data.expenses.length };
    }

    // 6. INSERT INTO pinned_locations
    if (/^INSERT\s+INTO\s+pinned_locations/i.test(cleanSql)) {
      const [user_id, name, latitude, longitude, radius, message_template, active_days, reset_time] = params;
      const id = this.data.autoIncrement.pinned_locations++;
      const activeDaysVal = active_days || 'mon,tue,wed,thu,fri,sat,sun';
      const resetTimeVal = reset_time || '12:00 AM';
      this.data.pinned_locations.push({
        id,
        user_id: String(user_id),
        name: String(name),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius) || 10,
        auto_send: 1,
        message_template: message_template || 'Reached {location} at {time}.',
        active_days: activeDaysVal,
        reset_time: resetTimeVal,
        created_at: Date.now(),
      });
      this.scheduleSave();

      this.syncWithCloud('locations', 'POST', {
        userId: String(user_id),
        name: String(name),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius) || 10,
        autoSend: true,
        messageTemplate: message_template || 'Reached {location} at {time}.',
        activeDays: activeDaysVal.split(','),
        resetTime: resetTimeVal,
      });

      return { lastInsertRowId: id, changes: 1 };
    }

    // 7. UPDATE pinned_locations
    if (/^UPDATE\s+pinned_locations/i.test(cleanSql)) {
      const idParam = params[params.length - 2] !== undefined && typeof params[params.length - 1] === 'string' ? params[params.length - 2] : params[params.length - 1];
      const loc = this.data.pinned_locations.find((l) => l.id === Number(idParam));
      if (loc) {
        if (cleanSql.includes('active_days = ?') && cleanSql.includes('reset_time = ?')) {
          const [name, radius, auto_send, message_template, active_days, reset_time] = params;
          loc.name = String(name);
          loc.radius = Number(radius);
          loc.auto_send = Number(auto_send);
          loc.message_template = String(message_template);
          loc.active_days = String(active_days || 'mon,tue,wed,thu,fri,sat,sun');
          loc.reset_time = String(reset_time || '12:00 AM');
        } else {
          const [name, radius, auto_send, message_template] = params;
          loc.name = String(name);
          loc.radius = Number(radius);
          loc.auto_send = Number(auto_send);
          loc.message_template = String(message_template);
        }
        this.scheduleSave();
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
      this.scheduleSave();
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
      this.scheduleSave();

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
        this.scheduleSave();
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
      this.scheduleSave();
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
        this.scheduleSave();
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
      this.scheduleSave();
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
      this.scheduleSave();
      return { lastInsertRowId: id, changes: 1 };
    }

    // 14. INSERT INTO loans
    if (/^INSERT\s+INTO\s+loans/i.test(cleanSql)) {
      const [user_id, person_name, person_phone, type, amount, amount_repaid, date, due_date, note, status, auto_notify] = params;
      if (!this.data.loans) this.data.loans = [];
      if (!this.data.autoIncrement.loans) this.data.autoIncrement.loans = 1;

      const id = this.data.autoIncrement.loans++;
      this.data.loans.push({
        id,
        user_id: String(user_id),
        person_name: String(person_name),
        person_phone: String(person_phone),
        type: type || 'lent',
        amount: Number(amount),
        amount_repaid: Number(amount_repaid) || 0,
        date: String(date),
        due_date: due_date || null,
        note: note || null,
        status: status || 'pending',
        auto_notify: auto_notify !== undefined ? Number(auto_notify) : 1,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      });
      this.scheduleSave();

      this.syncWithCloud('loans', 'POST', {
        userId: String(user_id),
        personName: String(person_name),
        personPhone: String(person_phone),
        type: type || 'lent',
        amount: Number(amount),
        amountRepaid: Number(amount_repaid) || 0,
        date: String(date),
        dueDate: due_date || null,
        note: note || null,
        status: status || 'pending',
        autoNotify: auto_notify !== 0,
      });

      return { lastInsertRowId: id, changes: 1 };
    }

    // 15. UPDATE loans
    if (/^UPDATE\s+loans/i.test(cleanSql)) {
      if (!this.data.loans) this.data.loans = [];

      // Check if it's a full update or partial repayment update
      if (/SET\s+amount_repaid\s*=\s*\?,\s*status\s*=\s*\?/i.test(cleanSql)) {
        const [amount_repaid, status, id, user_id] = params;
        const loan = this.data.loans.find((l) => l.id === Number(id) && (!user_id || l.user_id === String(user_id)));
        if (loan) {
          loan.amount_repaid = Number(amount_repaid);
          loan.status = status;
          loan.updated_at = Math.floor(Date.now() / 1000);
          this.scheduleSave();
          return { lastInsertRowId: loan.id, changes: 1 };
        }
      } else {
        const [person_name, person_phone, type, amount, amount_repaid, date, due_date, note, status, id, user_id] = params;
        const loan = this.data.loans.find((l) => l.id === Number(id) && (!user_id || l.user_id === String(user_id)));
        if (loan) {
          loan.person_name = String(person_name);
          loan.person_phone = String(person_phone);
          loan.type = type || loan.type;
          loan.amount = Number(amount);
          loan.amount_repaid = Number(amount_repaid) || 0;
          loan.date = String(date);
          loan.due_date = due_date || null;
          loan.note = note || null;
          loan.status = status || loan.status;
          loan.updated_at = Math.floor(Date.now() / 1000);
          this.scheduleSave();
          return { lastInsertRowId: loan.id, changes: 1 };
        }
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    // 16. DELETE FROM loans
    if (/^DELETE\s+FROM\s+loans/i.test(cleanSql)) {
      if (!this.data.loans) this.data.loans = [];
      const [id, user_id] = params;
      const initialLen = this.data.loans.length;
      this.data.loans = this.data.loans.filter((l) => !(l.id === Number(id) && (!user_id || l.user_id === String(user_id))));
      this.scheduleSave();
      return { lastInsertRowId: 0, changes: initialLen - this.data.loans.length };
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
        .filter((e) => {
          if (user_id && e.user_id !== user_id) return false;
          const d = (e.date || '').split('T')[0];
          return d >= start && d <= end;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      return [{ total } as unknown as T];
    }

    // Today sum
    if (/SELECT\s+COALESCE\(SUM\(amount\),\s*0\)\s+as\s+total\s+FROM\s+expenses\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+date\s*=\s*\?/i.test(cleanSql)) {
      const [user_id, today] = params;
      const total = this.data.expenses
        .filter((e) => {
          if (user_id && e.user_id !== user_id) return false;
          const d = (e.date || '').split('T')[0];
          return d === today;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      return [{ total } as unknown as T];
    }

    // Monthly count
    if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+expenses\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+date\s*>=\s*\?\s+AND\s+date\s*<=\s*\?/i.test(cleanSql)) {
      const [user_id, start, end] = params;
      const count = this.data.expenses.filter((e) => {
        if (user_id && e.user_id !== user_id) return false;
        const d = (e.date || '').split('T')[0];
        return d >= start && d <= end;
      }).length;
      return [{ count } as unknown as T];
    }

    // Top category
    if (/SELECT\s+c\.name,\s*COALESCE\(SUM\(e\.amount\),\s*0\)\s+as\s+total/i.test(cleanSql)) {
      const [user_id, start, end] = params;
      const filtered = this.data.expenses.filter((e) => {
        if (user_id && e.user_id !== user_id) return false;
        const d = (e.date || '').split('T')[0];
        return d >= start && d <= end;
      });
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
          return {
            ...l,
            active_days: l.active_days || 'mon,tue,wed,thu,fri,sat,sun',
            reset_time: l.reset_time || '12:00 AM',
            contact_count,
          };
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
      const logs = (this.data.message_logs || [])
        .filter((l) => !user_id || l.user_id === user_id)
        .sort((a, b) => b.sent_at - a.sent_at);
      return logs as unknown as T[];
    }

    // Loans query
    if (/FROM\s+loans/i.test(cleanSql)) {
      const [user_id, ...rest] = params;
      let loans = (this.data.loans || []).filter((l) => !user_id || l.user_id === user_id);

      if (/type\s*=\s*\?/i.test(cleanSql) && rest.length > 0) {
        const typeParam = rest[0];
        loans = loans.filter((l) => l.type === typeParam);
      }
      if (/status\s*=\s*\?/i.test(cleanSql) && rest.length > 1) {
        const statusParam = rest[1];
        loans = loans.filter((l) => l.status === statusParam);
      }

      loans.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.created_at - a.created_at));
      return loans as unknown as T[];
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
      await db.execAsync('PRAGMA synchronous = NORMAL;');
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
      active_days TEXT DEFAULT 'mon,tue,wed,thu,fri,sat,sun',
      reset_time TEXT DEFAULT '12:00 AM',
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

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      person_name TEXT NOT NULL,
      person_phone TEXT NOT NULL,
      type TEXT NOT NULL, -- 'lent' | 'borrowed'
      amount REAL NOT NULL,
      amount_repaid REAL DEFAULT 0,
      date TEXT NOT NULL,
      due_date TEXT,
      note TEXT,
      status TEXT DEFAULT 'pending', -- 'pending' | 'partially_paid' | 'settled'
      auto_notify INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- High-Performance Composite Query Indexes
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories (user_id, name);
    CREATE INDEX IF NOT EXISTS idx_pinned_locations_user ON pinned_locations (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts (user_id, name ASC);
    CREATE INDEX IF NOT EXISTS idx_location_contacts_loc ON location_contacts (location_id, contact_id);
    CREATE INDEX IF NOT EXISTS idx_message_logs_user ON message_logs (user_id, sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_loans_user_type ON loans (user_id, type, status);
    CREATE INDEX IF NOT EXISTS idx_loans_user_date ON loans (user_id, date DESC);
  `);

  // Safe schema migrations for existing databases
  try {
    await db.execAsync("ALTER TABLE pinned_locations ADD COLUMN active_days TEXT DEFAULT 'mon,tue,wed,thu,fri,sat,sun';");
  } catch (e) {}
  try {
    await db.execAsync("ALTER TABLE pinned_locations ADD COLUMN reset_time TEXT DEFAULT '12:00 AM';");
  } catch (e) {}
}

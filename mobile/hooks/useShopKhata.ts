/**
 * Hook for managing Shop / Dukandar Khata (दुकान व राशन हिसाब-किताब).
 * Supports itemized goods purchased (सामान लिया) and payments made (पैसे दिए),
 * running balances, WhatsApp statements, and optional sync to monthly expenses.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';
import { whatsappApi } from '../services/whatsapp-api';
import { syncMutationWithCloud } from '../services/cloud-sync';
import { formatDisplayDate, getTodayDDMMYYYY, getTodayISO, formatToDDMMYYYY } from '../utils/date';

export interface Shop {
  id: number;
  user_id: string;
  name: string;
  person_name: string;
  phone: string;
  category: string;
  address?: string;
  created_at: number;
  updated_at: number;
  total_purchases?: number;
  total_payments?: number;
  balance_due?: number;
  last_entry_date?: string;
  last_entry_items?: string;
  entry_count?: number;
}

export interface ShopEntry {
  id: number;
  user_id: string;
  shop_id: number;
  type: 'purchase' | 'payment';
  amount: number;
  date: string;
  items: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export function useShopKhata() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [allEntries, setAllEntries] = useState<ShopEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShopsAndEntries = useCallback(async (showSpinner = false) => {
    if (!db || !user) return;
    if (showSpinner || shops.length === 0) {
      setLoading(true);
    }
    try {
      const [shopsList, entriesList] = await Promise.all([
        db.getAllAsync<Shop>('SELECT * FROM shops WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC', [user.uid]),
        db.getAllAsync<ShopEntry>('SELECT * FROM shop_entries WHERE user_id = ? ORDER BY date DESC, created_at DESC', [user.uid]),
      ]);

      const entriesByShop: Record<number, ShopEntry[]> = {};
      (entriesList || []).forEach((e) => {
        if (!entriesByShop[e.shop_id]) entriesByShop[e.shop_id] = [];
        entriesByShop[e.shop_id].push(e);
      });

      const enrichedShops = (shopsList || []).map((shop) => {
        const sEntries = entriesByShop[shop.id] || [];
        let totalPurchases = 0;
        let totalPayments = 0;
        sEntries.forEach((e) => {
          if (e.type === 'purchase') {
            totalPurchases += Number(e.amount) || 0;
          } else {
            totalPayments += Number(e.amount) || 0;
          }
        });
        const balanceDue = totalPurchases - totalPayments;
        const lastEntry = sEntries.length > 0 ? sEntries[0] : null;

        return {
          ...shop,
          total_purchases: totalPurchases,
          total_payments: totalPayments,
          balance_due: balanceDue,
          last_entry_date: lastEntry?.date,
          last_entry_items: lastEntry?.items || lastEntry?.note || undefined,
          entry_count: sEntries.length,
        };
      });

      setShops(enrichedShops);
      setAllEntries(entriesList || []);
    } catch (e) {
      console.error('Failed to fetch shops and khata entries', e);
    } finally {
      setLoading(false);
    }
  }, [db, user, shops.length]);

  const addShop = useCallback(
    async (
      name: string,
      personName?: string,
      phone?: string,
      category: string = 'Kirana / Ration',
      address?: string
    ): Promise<number> => {
      if (!db || !user) return 0;
      const cleanName = String(name || '').trim();
      const cleanPerson = String(personName || '').trim();
      const cleanPhone = phone ? String(phone).replace(/[^\d+]/g, '') : '';
      const cleanCat = category || 'Kirana / Ration';
      const cleanAddr = String(address || '').trim();

      const res = await db.runAsync(
        'INSERT INTO shops (user_id, name, person_name, phone, category, address) VALUES (?, ?, ?, ?, ?, ?)',
        [user.uid, cleanName, cleanPerson, cleanPhone, cleanCat, cleanAddr]
      );
      const newId = res.lastInsertRowId;
      await fetchShopsAndEntries(false);
      return newId;
    },
    [db, user, fetchShopsAndEntries]
  );

  const updateShop = useCallback(
    async (
      id: number,
      name: string,
      personName?: string,
      phone?: string,
      category: string = 'Kirana / Ration',
      address?: string
    ) => {
      if (!db || !user) return;
      const cleanName = String(name || '').trim();
      const cleanPerson = String(personName || '').trim();
      const cleanPhone = phone ? String(phone).replace(/[^\d+]/g, '') : '';
      const cleanCat = category || 'Kirana / Ration';
      const cleanAddr = String(address || '').trim();

      await db.runAsync(
        'UPDATE shops SET name = ?, person_name = ?, phone = ?, category = ?, address = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [cleanName, cleanPerson, cleanPhone, cleanCat, cleanAddr, id, user.uid]
      );
      await fetchShopsAndEntries(false);
    },
    [db, user, fetchShopsAndEntries]
  );

  const deleteShop = useCallback(
    async (id: number) => {
      if (!db || !user) return;
      await db.runAsync('DELETE FROM shops WHERE id = ? AND user_id = ?', [id, user.uid]);
      await db.runAsync('DELETE FROM shop_entries WHERE shop_id = ? AND user_id = ?', [id, user.uid]);
      await fetchShopsAndEntries(false);
    },
    [db, user, fetchShopsAndEntries]
  );

  const addEntry = useCallback(
    async (
      shopId: number,
      type: 'purchase' | 'payment',
      amount: number,
      date: string,
      items?: string,
      note?: string,
      autoRecordExpense: boolean = false
    ) => {
      if (!db || !user) return;
      const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
      const safeItems = items ? String(items).trim() : null;
      const safeNote = note ? String(note).trim() : null;

      await db.runAsync(
        'INSERT INTO shop_entries (user_id, shop_id, type, amount, date, items, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.uid, shopId, type, numAmount, date, safeItems, safeNote]
      );

      // If user checked "Add to Monthly Expenses", automatically log into expenses
      if (autoRecordExpense && (type === 'purchase' || type === 'payment')) {
        try {
          const shop = shops.find((s) => s.id === shopId);
          const shopName = shop?.name || 'Shop';
          // Find or fallback to Groceries category
          const cats = await db.getAllAsync<{ id: number; name: string }>(
            'SELECT id, name FROM categories WHERE user_id = ? AND (LOWER(name) LIKE "%grocery%" OR LOWER(name) LIKE "%ration%" OR LOWER(name) LIKE "%food%")',
            [user.uid]
          );
          let targetCatId = cats.length > 0 ? cats[0].id : 1;
          const expenseNote = type === 'purchase'
            ? `${shopName} Samaan: ${safeItems || safeNote || 'Ration items'}`
            : `${shopName} Payment: ${safeNote || 'Payment to dukandar'}`;

          await db.runAsync(
            'INSERT INTO expenses (user_id, category_id, amount, date, note) VALUES (?, ?, ?, ?, ?)',
            [user.uid, targetCatId, numAmount, date, expenseNote]
          );
        } catch (expErr) {
          console.warn('Auto-expense log notice:', expErr);
        }
      }

      await fetchShopsAndEntries(false);
    },
    [db, user, shops, fetchShopsAndEntries]
  );

  const updateEntry = useCallback(
    async (
      id: number,
      type: 'purchase' | 'payment',
      amount: number,
      date: string,
      items?: string,
      note?: string
    ) => {
      if (!db || !user) return;
      const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
      const safeItems = items ? String(items).trim() : null;
      const safeNote = note ? String(note).trim() : null;

      await db.runAsync(
        'UPDATE shop_entries SET type = ?, amount = ?, date = ?, items = ?, note = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [type, numAmount, date, safeItems, safeNote, id, user.uid]
      );
      await fetchShopsAndEntries(false);
    },
    [db, user, fetchShopsAndEntries]
  );

  const deleteEntry = useCallback(
    async (id: number) => {
      if (!db || !user) return;
      await db.runAsync('DELETE FROM shop_entries WHERE id = ? AND user_id = ?', [id, user.uid]);
      await fetchShopsAndEntries(false);
    },
    [db, user, fetchShopsAndEntries]
  );

  const getEntriesForShop = useCallback(
    (shopId: number) => {
      return allEntries.filter((e) => e.shop_id === shopId);
    },
    [allEntries]
  );

  const sendWhatsAppStatement = useCallback(
    async (shop: Shop, entries?: ShopEntry[]): Promise<boolean> => {
      if (!shop.phone) return false;
      const sEntries = entries || allEntries.filter((e) => e.shop_id === shop.id);
      const totalPurchases = sEntries.filter((e) => e.type === 'purchase').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const totalPayments = sEntries.filter((e) => e.type === 'payment').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const balanceDue = totalPurchases - totalPayments;

      const top5 = sEntries.slice(0, 5);
      const entryLines = top5.map((e) => {
        const icon = e.type === 'purchase' ? '🛒' : '💵';
        const label = e.type === 'purchase' ? 'सामान लिया' : 'भुगतान किया';
        const desc = e.items ? ` (${e.items})` : e.note ? ` (${e.note})` : '';
        return `• ${icon} ${formatToDDMMYYYY(e.date)}: ${label} ₹${e.amount.toLocaleString('en-IN')}${desc}`;
      }).join('\n');

      const message = `📋 *खाता हिसाब (Khata Statement)*\n` +
        `🏪 *दुकान:* ${shop.name}\n` +
        (shop.person_name ? `👤 *नाम:* ${shop.person_name}\n` : '') +
        `📅 *दिनांक:* ${getTodayDDMMYYYY()}\n\n` +
        `🛒 *कुल सामान लिया:* ₹${totalPurchases.toLocaleString('en-IN')}\n` +
        `💵 *कुल जमा/भुगतान:* ₹${totalPayments.toLocaleString('en-IN')}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 *बकाया हिसाब (Balance Due): ₹${Math.abs(balanceDue).toLocaleString('en-IN')}* ` +
        (balanceDue > 0 ? '(दुकानदार को देना है)' : balanceDue === 0 ? '(हिसाब चुकता)' : '(एडवांस जमा है)') +
        `\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        (top5.length > 0 ? `📝 *हाल का लेन-देन:*\n${entryLines}\n\n` : '') +
        `_PocketRadar Khata Book से भेजा गया_`;

      const cleanPhone = shop.phone.replace(/[^\d+]/g, '');
      const res = await whatsappApi.sendMessage(
        [{ phone: cleanPhone, isGroup: false }],
        shop.name,
        undefined,
        message
      );
      return Boolean(res);
    },
    [allEntries]
  );

  const stats = useMemo(() => {
    let totalOwedAcrossAllShops = 0;
    let totalPurchasesAllTime = 0;
    let totalPaymentsAllTime = 0;
    let activeShopsCount = 0;

    shops.forEach((s) => {
      const bal = s.balance_due || 0;
      if (bal > 0) {
        totalOwedAcrossAllShops += bal;
        activeShopsCount++;
      }
      totalPurchasesAllTime += s.total_purchases || 0;
      totalPaymentsAllTime += s.total_payments || 0;
    });

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let thisMonthPurchases = 0;
    let thisMonthPayments = 0;

    allEntries.forEach((e) => {
      const d = (e.date || '').split('T')[0];
      if (d.startsWith(currentMonthPrefix)) {
        if (e.type === 'purchase') thisMonthPurchases += Number(e.amount) || 0;
        else thisMonthPayments += Number(e.amount) || 0;
      }
    });

    return {
      totalOwedAcrossAllShops,
      activeShopsCount,
      totalShopsCount: shops.length,
      thisMonthPurchases,
      thisMonthPayments,
      totalPurchasesAllTime,
      totalPaymentsAllTime,
    };
  }, [shops, allEntries]);

  useEffect(() => {
    if (isReady) {
      fetchShopsAndEntries();
    }
  }, [isReady, fetchShopsAndEntries]);

  return {
    shops,
    allEntries,
    loading,
    stats,
    fetchShopsAndEntries,
    addShop,
    updateShop,
    deleteShop,
    addEntry,
    updateEntry,
    deleteEntry,
    getEntriesForShop,
    sendWhatsAppStatement,
  };
}

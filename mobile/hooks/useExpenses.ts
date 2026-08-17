/**
 * Hook for expense CRUD operations.
 */
import { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';

export interface Expense {
  id: number;
  user_id: string;
  category_id: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: number;
  searchText?: string;
}

export function useExpenses() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async (filters?: ExpenseFilters, showSpinner = false) => {
    if (!db || !user) return;

    if (showSpinner || expenses.length === 0) {
      setLoading(true);
    }
    try {
      let query = `
        SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = ?
      `;
      const params: any[] = [user.uid];

      if (filters?.startDate) {
        query += ' AND e.date >= ?';
        params.push(filters.startDate);
      }
      if (filters?.endDate) {
        query += ' AND e.date <= ?';
        params.push(filters.endDate);
      }
      if (filters?.categoryId) {
        query += ' AND e.category_id = ?';
        params.push(filters.categoryId);
      }
      if (filters?.searchText) {
        query += ' AND (e.note LIKE ? OR c.name LIKE ?)';
        params.push(`%${filters.searchText}%`, `%${filters.searchText}%`);
      }

      query += ' ORDER BY e.date DESC, e.created_at DESC';

      const result = await db.getAllAsync<Expense>(query, params);
      setExpenses(result || []);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [db, user, expenses.length]);

  const addExpense = useCallback(async (
    categoryId: number,
    amount: number,
    date: string,
    note?: string
  ) => {
    if (!db || !user) return;

    await db.runAsync(
      'INSERT INTO expenses (user_id, category_id, amount, date, note) VALUES (?, ?, ?, ?, ?)',
      [user.uid, categoryId, amount, date, note || null]
    );
    await fetchExpenses(undefined, false);
  }, [db, user, fetchExpenses]);

  const updateExpense = useCallback(async (
    id: number,
    categoryId: number,
    amount: number,
    date: string,
    note?: string
  ) => {
    if (!db || !user) return;

    await db.runAsync(
      'UPDATE expenses SET category_id = ?, amount = ?, date = ?, note = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [categoryId, amount, date, note || null, id, user.uid]
    );
    await fetchExpenses(undefined, false);
  }, [db, user, fetchExpenses]);

  const deleteExpense = useCallback(async (id: number) => {
    if (!db || !user) return;

    await db.runAsync(
      'DELETE FROM expenses WHERE id = ? AND user_id = ?',
      [id, user.uid]
    );
    await fetchExpenses(undefined, false);
  }, [db, user, fetchExpenses]);

  const getMonthlyTotal = useCallback(async (year: number, month: number) => {
    if (!db || !user) return 0;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const result = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
      [user.uid, startDate, endDate]
    );
    return result?.total || 0;
  }, [db, user]);

  const getCategorySummary = useCallback(async (startDate?: string, endDate?: string) => {
    if (!db || !user) return [];

    let query = `
      SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(e.amount), 0) as total, COUNT(e.id) as count
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = ?
    `;
    const params: any[] = [user.uid];

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(endDate);
    }

    query += ' WHERE c.user_id = ? GROUP BY c.id ORDER BY total DESC';
    params.push(user.uid);

    return db.getAllAsync(query, params);
  }, [db, user]);

  useEffect(() => {
    if (isReady) {
      fetchExpenses();
    }
  }, [isReady, fetchExpenses]);

  return {
    expenses,
    loading,
    fetchExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    getMonthlyTotal,
    getCategorySummary,
  };
}

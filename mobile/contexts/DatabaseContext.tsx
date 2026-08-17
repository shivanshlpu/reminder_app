/**
 * Database Context
 * Provides the universal SQLite / AsyncStorage DB instance to the app.
 * Automatically seeds and backfills all default categories (including Grooming & Online Shopping).
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { openDatabase, IDatabase } from '../db/client';
import { useAuth } from './AuthContext';
import { DEFAULT_CATEGORIES } from '../constants/categories';

interface DatabaseContextType {
  db: IDatabase | null;
  isReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextType>({
  db: null,
  isReady: false,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<IDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let isMounted = true;

    async function initDb() {
      try {
        const database = await openDatabase();
        if (isMounted) {
          setDb(database);
          setIsReady(true);
        }

        if (user) {
          await ensureUserAndCategoriesExist(database, user.uid, user.email || 'user@example.com');
        }
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    }

    initDb();

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <DatabaseContext.Provider value={{ db, isReady }}>
      {children}
    </DatabaseContext.Provider>
  );
}

/**
 * Ensures user exists and seamlessly backfills any missing categories (e.g. Grooming, Online Shopping).
 */
async function ensureUserAndCategoriesExist(db: IDatabase, userId: string, email: string) {
  try {
    await db.runAsync(
      'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)',
      [userId, email]
    );

    const existingCats = await db.getAllAsync<{ name: string }>(
      'SELECT name FROM categories WHERE user_id = ?',
      [userId]
    );

    const existingNames = new Set((existingCats || []).map((c) => c.name.toLowerCase()));

    for (const cat of DEFAULT_CATEGORIES) {
      if (!existingNames.has(cat.name.toLowerCase())) {
        await db.runAsync(
          'INSERT INTO categories (user_id, name, icon, color, is_default) VALUES (?, ?, ?, ?, ?)',
          [userId, cat.name, cat.icon, cat.color, cat.isDefault ? 1 : 0]
        );
      }
    }
  } catch (e) {
    console.error('Failed to seed user or categories', e);
  }
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

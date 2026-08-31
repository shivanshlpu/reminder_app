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

// Track seeded users in memory to prevent repeated startup delays
const seededUsers = new Set<string>();

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<IDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let isMounted = true;

    async function initDb() {
      try {
        const database = await openDatabase();
        if (user && !seededUsers.has(user.uid)) {
          await ensureUserAndCategoriesExist(database, user.uid, user.email || 'user@example.com');
          seededUsers.add(user.uid);
        }

        if (isMounted) {
          setDb(database);
          setIsReady(true);
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
 * Ensures user exists, migrates any legacy local entries, and backfills missing categories.
 */
async function ensureUserAndCategoriesExist(db: IDatabase, userId: string, email: string) {
  try {
    // 1. Create or ensure user row
    await db.runAsync(
      'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)',
      [userId, email]
    );

    // 2. Automatically associate any unassigned/legacy local entries with the active user ID
    try {
      await db.runAsync(
        "UPDATE expenses SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'guest' OR user_id = 'local_user'",
        [userId]
      );
      await db.runAsync(
        "UPDATE loans SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'guest' OR user_id = 'local_user'",
        [userId]
      );
      await db.runAsync(
        "UPDATE pinned_locations SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'guest' OR user_id = 'local_user'",
        [userId]
      );
      await db.runAsync(
        "UPDATE contacts SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'guest' OR user_id = 'local_user'",
        [userId]
      );
      await db.runAsync(
        "UPDATE message_logs SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'guest' OR user_id = 'local_user'",
        [userId]
      );
    } catch (e) {}

    // 3. Ensure default categories exist
    const existingCats = await db.getAllAsync<{ name: string }>(
      'SELECT name FROM categories WHERE user_id = ?',
      [userId]
    );

    const existingNames = new Set((existingCats || []).map((c) => c.name.toLowerCase()));
    const missingCats = DEFAULT_CATEGORIES.filter((cat) => !existingNames.has(cat.name.toLowerCase()));

    if (missingCats.length > 0) {
      await Promise.all(
        missingCats.map((cat) =>
          db.runAsync(
            'INSERT INTO categories (user_id, name, icon, color, is_default) VALUES (?, ?, ?, ?, ?)',
            [userId, cat.name, cat.icon, cat.color, cat.isDefault ? 1 : 0]
          )
        )
      );
    }
  } catch (e) {
    console.error('Failed to seed user, migrate data, or seed categories', e);
  }
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

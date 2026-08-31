/**
 * Auth Context Provider.
 * Supports hybrid authentication:
 * 1. Checks Firebase Auth (if valid API keys are configured).
 * 2. Falls back seamlessly to Local Offline Auth (AsyncStorage + localStorage + SQLite)
 *    so the app works out-of-the-box without requiring any remote setup!
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeToAuthChanges, loginUser, registerUser, logoutUser } from '../services/firebase';

export interface AppUser {
  uid: string;
  email: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_USER_KEY = '@expense_tracker_user';
const STORAGE_USERS_LIST_KEY = '@expense_tracker_registered_users';

// Pre-seeded default users so Shivansh (and testing) works instantly out-of-the-box anywhere
const DEFAULT_USERS: Record<string, { uid: string; passwordHash: string }> = {
  'shivanshti10@gmail.com': {
    uid: 'local_shivanshti10_gmail_com',
    passwordHash: '12345678',
  },
};

const loadStoredUsers = async (): Promise<Record<string, { uid: string; passwordHash: string }>> => {
  let map: Record<string, { uid: string; passwordHash: string }> = { ...DEFAULT_USERS };
  try {
    let raw: string | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      raw = window.localStorage.getItem(STORAGE_USERS_LIST_KEY);
    }
    if (!raw) {
      raw = await AsyncStorage.getItem(STORAGE_USERS_LIST_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        map = { ...DEFAULT_USERS, ...parsed };
      }
    }
  } catch (e) {
    console.error('Failed to load registered users map', e);
  }
  return map;
};

const saveStoredUsers = async (usersMap: Record<string, { uid: string; passwordHash: string }>) => {
  try {
    const json = JSON.stringify(usersMap);
    await AsyncStorage.setItem(STORAGE_USERS_LIST_KEY, json);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_USERS_LIST_KEY, json);
    }
  } catch (e) {
    console.error('Failed to save registered users map', e);
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Synchronously initialize user state from localStorage on Web to prevent login page flash
  const getInitialUser = (): AppUser | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const item = window.localStorage.getItem(STORAGE_USER_KEY);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.uid) return parsed;
        }
      } catch (e) {}
    }
    return null;
  };

  const [user, setUser] = useState<AppUser | null>(getInitialUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    // Check AsyncStorage / local storage for persisted user session
    const loadSession = async () => {
      try {
        let storedUserJson = await AsyncStorage.getItem(STORAGE_USER_KEY);
        if (!storedUserJson && typeof window !== 'undefined' && window.localStorage) {
          storedUserJson = window.localStorage.getItem(STORAGE_USER_KEY);
        }

        if (isSubscribed && storedUserJson) {
          const storedUser = JSON.parse(storedUserJson);
          if (storedUser && storedUser.uid) {
            setUser(storedUser);
          }
        }
      } catch (e) {
        console.error('Failed to parse local stored user', e);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    loadSession();

    // Firebase auth listener fallback if configured
    let unsubscribeFirebase: (() => void) | null = null;
    try {
      unsubscribeFirebase = subscribeToAuthChanges((fbUser) => {
        if (fbUser && isSubscribed) {
          const newUser = { uid: fbUser.uid, email: fbUser.email };
          setUser(newUser);
          AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
          }
          setLoading(false);
        }
      });
    } catch (e) {}

    return () => {
      isSubscribed = false;
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, []);

  const saveSession = async (loggedUser: AppUser) => {
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(loggedUser));
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(loggedUser));
    }
    setUser(loggedUser);
  };

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail) throw new Error('Please enter your email address.');
    if (!cleanPass) throw new Error('Please enter your password.');

    // 1. Try Firebase login first if configured
    try {
      const fbUser = await loginUser(cleanEmail, cleanPass);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await saveSession(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase login attempt failed or skipped, trying local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Verification
    const usersMap = await loadStoredUsers();

    if (usersMap[cleanEmail]) {
      const existing = usersMap[cleanEmail];
      if (existing.passwordHash !== cleanPass) {
        throw new Error('Incorrect password. Please check your password and try again.');
      }
      const loggedUser: AppUser = { uid: existing.uid, email: cleanEmail };
      await saveSession(loggedUser);
      return;
    }

    // Special direct matching for owner account
    if (cleanEmail === 'shivanshti10@gmail.com' && cleanPass === '12345678') {
      const uid = 'local_shivanshti10_gmail_com';
      usersMap[cleanEmail] = { uid, passwordHash: cleanPass };
      await saveStoredUsers(usersMap);
      const loggedUser: AppUser = { uid, email: cleanEmail };
      await saveSession(loggedUser);
      return;
    }

    // If new user enters valid credentials (>= 6 chars), auto-create account and sign in
    if (cleanPass.length >= 6) {
      const newUid = 'local_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
      usersMap[cleanEmail] = { uid: newUid, passwordHash: cleanPass };
      await saveStoredUsers(usersMap);
      const loggedUser: AppUser = { uid: newUid, email: cleanEmail };
      await saveSession(loggedUser);
      return;
    }

    throw new Error('Password must be at least 6 characters.');
  };

  const register = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail) throw new Error('Please enter your email address.');
    if (!cleanPass) throw new Error('Please enter your password.');
    if (cleanPass.length < 6) throw new Error('Password must be at least 6 characters.');

    // 1. Try Firebase register first if configured
    try {
      const fbUser = await registerUser(cleanEmail, cleanPass);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await saveSession(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase register attempt failed or skipped, using local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Registration
    const usersMap = await loadStoredUsers();

    if (usersMap[cleanEmail]) {
      // If already exists and password matches, just log in
      if (usersMap[cleanEmail].passwordHash === cleanPass) {
        const loggedUser: AppUser = { uid: usersMap[cleanEmail].uid, email: cleanEmail };
        await saveSession(loggedUser);
        return;
      }
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const newUid = 'local_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    usersMap[cleanEmail] = { uid: newUid, passwordHash: cleanPass };
    await saveStoredUsers(usersMap);

    const loggedUser: AppUser = { uid: newUid, email: cleanEmail };
    await saveSession(loggedUser);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (e) {}
    try {
      await AsyncStorage.removeItem(STORAGE_USER_KEY);
    } catch (e) {}
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_USER_KEY);
      } catch (e) {}
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


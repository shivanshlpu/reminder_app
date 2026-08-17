/**
 * Auth Context Provider.
 * Supports hybrid authentication:
 * 1. Checks Firebase Auth (if valid API keys are configured).
 * 2. Falls back seamlessly to Local Offline Auth (AsyncStorage + SQLite)
 *    so the app works out-of-the-box without requiring a Firebase project setup!
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
        const storedUserJson = await AsyncStorage.getItem(STORAGE_USER_KEY);
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
    // 1. Try Firebase login first if configured
    try {
      const fbUser = await loginUser(email, password);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await saveSession(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase login attempt failed or skipped, trying local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Verification
    const cleanEmail = email.trim().toLowerCase();
    const usersJson = await AsyncStorage.getItem(STORAGE_USERS_LIST_KEY);
    const usersMap: Record<string, { uid: string; passwordHash: string }> = usersJson ? JSON.parse(usersJson) : {};

    if (usersMap[cleanEmail]) {
      const existing = usersMap[cleanEmail];
      if (existing.passwordHash !== password) {
        throw new Error('Incorrect password. Please check your password and try again.');
      }
      const loggedUser: AppUser = { uid: existing.uid, email: cleanEmail };
      await saveSession(loggedUser);
      return;
    }

    // Unregistered email -> throw error
    throw new Error('No registered account found with this email. Please click "Create Account" to register first.');
  };

  const register = async (email: string, password: string) => {
    // 1. Try Firebase register first if configured
    try {
      const fbUser = await registerUser(email, password);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await saveSession(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase register attempt failed or skipped, using local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Registration
    const cleanEmail = email.trim().toLowerCase();
    const usersJson = await AsyncStorage.getItem(STORAGE_USERS_LIST_KEY);
    const usersMap: Record<string, { uid: string; passwordHash: string }> = usersJson ? JSON.parse(usersJson) : {};

    if (usersMap[cleanEmail]) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const newUid = 'local_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    usersMap[cleanEmail] = { uid: newUid, passwordHash: password };
    await AsyncStorage.setItem(STORAGE_USERS_LIST_KEY, JSON.stringify(usersMap));

    const loggedUser: AppUser = { uid: newUid, email: cleanEmail };
    await saveSession(loggedUser);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (e) {}
    await AsyncStorage.removeItem(STORAGE_USER_KEY);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_USER_KEY);
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

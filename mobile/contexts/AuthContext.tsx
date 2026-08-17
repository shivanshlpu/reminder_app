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
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    // First try Firebase auth listener
    let unsubscribeFirebase: (() => void) | null = null;
    try {
      unsubscribeFirebase = subscribeToAuthChanges((fbUser) => {
        if (fbUser && isSubscribed) {
          setUser({ uid: fbUser.uid, email: fbUser.email });
          setLoading(false);
        }
      });
    } catch (e) {
      console.log('Firebase auth listener skipped (using local auth)');
    }

    // Also check local persisted user session
    AsyncStorage.getItem(STORAGE_USER_KEY).then((storedUserJson) => {
      if (isSubscribed && storedUserJson) {
        try {
          const storedUser = JSON.parse(storedUserJson);
          if (storedUser && storedUser.uid) {
            setUser(storedUser);
          }
        } catch (e) {
          console.error('Failed to parse local stored user', e);
        }
      }
      if (isSubscribed) {
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, []);

  const login = async (email: string, password: string) => {
    // 1. Try Firebase login first if configured
    try {
      const fbUser = await loginUser(email, password);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
        setUser(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase login attempt failed or skipped, trying local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Fallback
    const cleanEmail = email.trim().toLowerCase();
    const usersJson = await AsyncStorage.getItem(STORAGE_USERS_LIST_KEY);
    const usersMap: Record<string, { uid: string; passwordHash: string }> = usersJson ? JSON.parse(usersJson) : {};

    if (usersMap[cleanEmail]) {
      const existing = usersMap[cleanEmail];
      if (existing.passwordHash !== password) {
        throw new Error('Incorrect password');
      }
      const loggedUser: AppUser = { uid: existing.uid, email: cleanEmail };
      await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(loggedUser));
      setUser(loggedUser);
      return;
    }

    // If user doesn't exist locally yet, create a local session automatically
    const newUid = 'local_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    usersMap[cleanEmail] = { uid: newUid, passwordHash: password };
    await AsyncStorage.setItem(STORAGE_USERS_LIST_KEY, JSON.stringify(usersMap));

    const loggedUser: AppUser = { uid: newUid, email: cleanEmail };
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(loggedUser));
    setUser(loggedUser);
  };

  const register = async (email: string, password: string) => {
    // 1. Try Firebase register first if configured
    try {
      const fbUser = await registerUser(email, password);
      if (fbUser) {
        const newUser: AppUser = { uid: fbUser.uid, email: fbUser.email };
        await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));
        setUser(newUser);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn('Firebase register attempt failed or skipped, using local auth:', firebaseErr?.message);
    }

    // 2. Local Auth Registration Fallback
    const cleanEmail = email.trim().toLowerCase();
    const usersJson = await AsyncStorage.getItem(STORAGE_USERS_LIST_KEY);
    const usersMap: Record<string, { uid: string; passwordHash: string }> = usersJson ? JSON.parse(usersJson) : {};

    const newUid = 'local_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    usersMap[cleanEmail] = { uid: newUid, passwordHash: password };
    await AsyncStorage.setItem(STORAGE_USERS_LIST_KEY, JSON.stringify(usersMap));

    const loggedUser: AppUser = { uid: newUid, email: cleanEmail };
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(loggedUser));
    setUser(loggedUser);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (e) {
      // ignore
    }
    await AsyncStorage.removeItem(STORAGE_USER_KEY);
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

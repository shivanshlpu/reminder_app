/**
 * Firebase configuration and auth helpers.
 * Uses Firebase JS SDK (works in Expo Go).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  // @ts-ignore - initializeAuth and getReactNativePersistence exist in the firebase package
  initializeAuth,
  // @ts-ignore
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
// Replace these with your Firebase project config if you want remote Firebase Auth
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export function isFirebaseConfigured(): boolean {
  return (
    !!firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
    firebaseConfig.apiKey.length > 10
  );
}

// Lazy/Conditional Firebase initialization to eliminate startup network timeouts
let auth: ReturnType<typeof getAuth> | null = null;

if (isFirebaseConfigured()) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (e) {
      auth = getAuth(app);
    }
  } catch (e) {
    console.warn('Firebase initialization skipped:', e);
  }
}

export { auth };

/**
 * Register a new user with email and password.
 */
export async function registerUser(email: string, password: string) {
  if (!auth) throw new Error('Firebase Auth is not configured');
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Sign in an existing user with email and password.
 */
export async function loginUser(email: string, password: string) {
  if (!auth) throw new Error('Firebase Auth is not configured');
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Sign out the current user.
 */
export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Subscribe to auth state changes.
 */
export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export type { User };

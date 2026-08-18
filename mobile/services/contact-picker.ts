/**
 * Universal Contact Picker Service
 * Allows users to pick contacts directly from their phonebook (native Android/iOS and Web).
 * Automatically cleans & normalizes phone numbers.
 */
import { Platform } from 'react-native';

export interface PickedContact {
  name: string;
  phone: string;
  cleanPhone: string;
}

/**
 * Normalizes phone numbers: removes spaces, dashes, parentheses.
 * Auto-prepends '91' for 10-digit Indian numbers if missing.
 */
export function normalizePhoneNumber(raw: string): { display: string; clean: string } {
  if (!raw) return { display: '', clean: '' };

  // Remove any non-digits (or leading +)
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // If 10 digits, default to Indian country code 91
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  return {
    display: cleaned,
    clean: cleaned,
  };
}

/**
 * Presents native phone contact picker.
 */
export async function pickContactFromDevice(): Promise<{
  success: boolean;
  contact?: PickedContact;
  error?: string;
}> {
  // 1. Native Mobile (iOS / Android) via expo-contacts
  if (Platform.OS !== 'web') {
    try {
      const Contacts = require('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        return {
          success: false,
          error: 'Contacts permission was denied. Please allow access in app settings.',
        };
      }

      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) {
        // User dismissed/canceled
        return { success: false };
      }

      const name =
        contact.name ||
        [contact.firstName, contact.middleName, contact.lastName]
          .filter(Boolean)
          .join(' ') ||
        'Unknown Contact';

      const rawPhone =
        contact.phoneNumbers && contact.phoneNumbers.length > 0
          ? contact.phoneNumbers[0].number || ''
          : '';

      const { clean } = normalizePhoneNumber(rawPhone);

      return {
        success: true,
        contact: {
          name: name.trim(),
          phone: clean,
          cleanPhone: clean,
        },
      };
    } catch (err: any) {
      console.warn('Native contact picker error:', err);
      return {
        success: false,
        error: err?.message || 'Could not open native contact picker',
      };
    }
  }

  // 2. Web / Android Chrome via Contact Picker API
  if (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window
  ) {
    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], {
        multiple: false,
      });

      if (contacts && contacts.length > 0) {
        const item = contacts[0];
        const name = (item.name && item.name[0]) || 'Contact';
        const rawPhone = (item.tel && item.tel[0]) || '';
        const { clean } = normalizePhoneNumber(rawPhone);

        return {
          success: true,
          contact: {
            name: name.trim(),
            phone: clean,
            cleanPhone: clean,
          },
        };
      }
      return { success: false };
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('Web contact picker error:', e);
      }
      return {
        success: false,
        error: 'Contact selection was cancelled or not supported by browser.',
      };
    }
  }

  return {
    success: false,
    error: 'Direct phonebook access is available on mobile devices.',
  };
}

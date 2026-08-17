/**
 * Hook for managing WhatsApp contacts.
 */
import { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';

export interface Contact {
  id: number;
  user_id: string;
  name: string;
  phone: string;
  is_group: number;
  group_id: string | null;
  created_at: number;
}

export function useContacts() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async (showSpinner = false) => {
    if (!db || !user) return;
    if (showSpinner || contacts.length === 0) {
      setLoading(true);
    }
    try {
      const result = await db.getAllAsync<Contact>(
        'SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC',
        [user.uid]
      );
      setContacts(result || []);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [db, user, contacts.length]);

  const addContact = useCallback(async (
    name: string,
    phone: string,
    isGroup: boolean = false,
    groupId?: string
  ) => {
    if (!db || !user) return;
    await db.runAsync(
      'INSERT INTO contacts (user_id, name, phone, is_group, group_id) VALUES (?, ?, ?, ?, ?)',
      [user.uid, name, phone, isGroup ? 1 : 0, groupId || null]
    );
    await fetchContacts(false);
  }, [db, user, fetchContacts]);

  const updateContact = useCallback(async (
    id: number,
    name: string,
    phone: string,
    isGroup: boolean = false,
    groupId?: string
  ) => {
    if (!db || !user) return;
    await db.runAsync(
      'UPDATE contacts SET name = ?, phone = ?, is_group = ?, group_id = ? WHERE id = ? AND user_id = ?',
      [name, phone, isGroup ? 1 : 0, groupId || null, id, user.uid]
    );
    await fetchContacts(false);
  }, [db, user, fetchContacts]);

  const deleteContact = useCallback(async (id: number) => {
    if (!db || !user) return;
    // Also remove from location_contacts
    await db.runAsync('DELETE FROM location_contacts WHERE contact_id = ?', [id]);
    await db.runAsync('DELETE FROM contacts WHERE id = ? AND user_id = ?', [id, user.uid]);
    await fetchContacts(false);
  }, [db, user, fetchContacts]);

  useEffect(() => {
    if (isReady) {
      fetchContacts();
    }
  }, [isReady, fetchContacts]);

  return {
    contacts,
    loading,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact,
  };
}

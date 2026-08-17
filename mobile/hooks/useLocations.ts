/**
 * Hook for managing pinned locations.
 */
import { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';

export interface PinnedLocation {
  id: number;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  auto_send: number;
  message_template: string;
  created_at: number;
  contact_count?: number;
}

export function useLocations() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [locations, setLocations] = useState<PinnedLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async (showSpinner = false) => {
    if (!db || !user) return;
    if (showSpinner || locations.length === 0) {
      setLoading(true);
    }
    try {
      const result = await db.getAllAsync<PinnedLocation>(
        `SELECT pl.*, 
          (SELECT COUNT(*) FROM location_contacts lc WHERE lc.location_id = pl.id) as contact_count
        FROM pinned_locations pl 
        WHERE pl.user_id = ? 
        ORDER BY pl.created_at DESC`,
        [user.uid]
      );
      setLocations(result || []);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setLoading(false);
    }
  }, [db, user, locations.length]);

  const addLocation = useCallback(async (
    name: string,
    latitude: number,
    longitude: number,
    radius: number = 200,
    messageTemplate: string = 'Reached {location} at {time}.'
  ) => {
    if (!db || !user) return;
    await db.runAsync(
      'INSERT INTO pinned_locations (user_id, name, latitude, longitude, radius, message_template) VALUES (?, ?, ?, ?, ?, ?)',
      [user.uid, name, latitude, longitude, radius, messageTemplate]
    );
    await fetchLocations(false);
  }, [db, user, fetchLocations]);

  const updateLocation = useCallback(async (
    id: number,
    name: string,
    radius: number,
    autoSend: boolean,
    messageTemplate: string
  ) => {
    if (!db || !user) return;
    await db.runAsync(
      'UPDATE pinned_locations SET name = ?, radius = ?, auto_send = ?, message_template = ? WHERE id = ? AND user_id = ?',
      [name, radius, autoSend ? 1 : 0, messageTemplate, id, user.uid]
    );
    await fetchLocations(false);
  }, [db, user, fetchLocations]);

  const deleteLocation = useCallback(async (id: number) => {
    if (!db || !user) return;
    await db.runAsync('DELETE FROM pinned_locations WHERE id = ? AND user_id = ?', [id, user.uid]);
    await fetchLocations(false);
  }, [db, user, fetchLocations]);

  const assignContact = useCallback(async (locationId: number, contactId: number) => {
    if (!db) return;
    await db.runAsync(
      'INSERT OR IGNORE INTO location_contacts (location_id, contact_id) VALUES (?, ?)',
      [locationId, contactId]
    );
    await fetchLocations(false);
  }, [db, fetchLocations]);

  const removeContactFromLocation = useCallback(async (locationId: number, contactId: number) => {
    if (!db) return;
    await db.runAsync(
      'DELETE FROM location_contacts WHERE location_id = ? AND contact_id = ?',
      [locationId, contactId]
    );
    await fetchLocations(false);
  }, [db, fetchLocations]);

  const getLocationContacts = useCallback(async (locationId: number) => {
    if (!db) return [];
    return db.getAllAsync(
      `SELECT c.* FROM contacts c 
       INNER JOIN location_contacts lc ON c.id = lc.contact_id 
       WHERE lc.location_id = ?`,
      [locationId]
    );
  }, [db]);

  useEffect(() => {
    if (isReady) {
      fetchLocations();
    }
  }, [isReady, fetchLocations]);

  return {
    locations,
    loading,
    fetchLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    assignContact,
    removeContactFromLocation,
    getLocationContacts,
  };
}

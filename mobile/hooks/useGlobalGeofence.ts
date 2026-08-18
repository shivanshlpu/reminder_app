/**
 * Global Geofence Synchronization & Radar Hook
 * Automatically runs in the background across all tabs & routes.
 * Ensures GPS tracking starts immediately upon app load with permission handling & live radar.
 */
import { useEffect, useState, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';
import {
  startGeofencing,
  stopGeofencing,
  requestLocationPermissions,
  checkLocationPermissionStatus,
  getCurrentProximityStatus,
  onProximityUpdate,
  triggerArrivalAlert,
  resetLocationDailyTrigger,
  GeofenceRegion,
  ProximityStatus,
} from '../services/geofence';
import { Contact } from './useContacts';
import { PinnedLocation } from './useLocations';

export function useGlobalGeofence() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [proximity, setProximity] = useState<ProximityStatus>(getCurrentProximityStatus());
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Subscribe to live proximity radar updates
  useEffect(() => {
    const unsubscribe = onProximityUpdate((status) => {
      setProximity({ ...status });
      setPermissionGranted(status.permissionGranted);
    });
    return unsubscribe;
  }, []);

  // Check initial permission status
  useEffect(() => {
    checkLocationPermissionStatus().then((status) => {
      setPermissionGranted(status.foreground);
    });
  }, []);


  /**
   * Sync all pinned locations from local database and restart geofence watcher
   */
  const syncGeofences = useCallback(async () => {
    if (!db || !user) return;
    setIsInitializing(true);

    try {
      // 1. Fetch all pinned locations for user
      const locations = await db.getAllAsync<PinnedLocation>(
        'SELECT * FROM pinned_locations WHERE user_id = ? ORDER BY created_at DESC',
        [user.uid]
      );

      // 2. Fetch all contacts for user
      const allContacts = await db.getAllAsync<Contact>(
        'SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC',
        [user.uid]
      );

      if (!locations || locations.length === 0) {
        stopGeofencing();
        setIsInitializing(false);
        return;
      }

      // 3. Build GeofenceRegion list with assigned contacts
      const regions: GeofenceRegion[] = await Promise.all(
        locations.map(async (loc) => {
          const assigned = await db.getAllAsync<Contact>(
            `SELECT c.* FROM contacts c 
             INNER JOIN location_contacts lc ON c.id = lc.contact_id 
             WHERE lc.location_id = ? AND c.user_id = ?`,
            [loc.id, user.uid]
          );

          const targetContacts = assigned && assigned.length > 0 ? assigned : allContacts;

          return {
            id: loc.id,
            name: loc.name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            radius: loc.radius || 35,
            autoSend: loc.auto_send === 1,
            messageTemplate: loc.message_template,
            contacts: (targetContacts || []).map((c) => ({
              phone: c.phone,
              isGroup: c.is_group === 1,
              name: c.name,
              contactId: c.id,
            })),
          };
        })
      );

      // 4. Start high-precision continuous watcher
      await startGeofencing(regions);
    } catch (e) {
      console.error('Failed to sync global geofences:', e);
    } finally {
      setIsInitializing(false);
    }
  }, [db, user]);

  // Automatically start geofencing when database is ready and user is logged in
  useEffect(() => {
    if (isReady && user) {
      syncGeofences();
    }
  }, [isReady, user, syncGeofences]);

  /**
   * Request location permissions from user
   */
  const requestPermissions = useCallback(async () => {
    const permResult = await requestLocationPermissions();
    setPermissionGranted(permResult.granted);
    if (permResult.granted) {
      await syncGeofences();
    }
    return permResult.granted;
  }, [syncGeofences]);


  /**
   * Manually test automatic arrival trigger for a location
   */
  const testArrivalAlert = useCallback(
    async (locationId: number) => {
      if (!db || !user) return { success: false, recipientCount: 0, message: 'Database not ready' };

      const loc = await db.getFirstAsync<PinnedLocation>(
        'SELECT * FROM pinned_locations WHERE id = ? AND user_id = ?',
        [locationId, user.uid]
      );
      if (!loc) return { success: false, recipientCount: 0, message: 'Location not found' };

      const assigned = await db.getAllAsync<Contact>(
        `SELECT c.* FROM contacts c 
         INNER JOIN location_contacts lc ON c.id = lc.contact_id 
         WHERE lc.location_id = ? AND c.user_id = ?`,
        [loc.id, user.uid]
      );

      const allContacts = await db.getAllAsync<Contact>(
        'SELECT * FROM contacts WHERE user_id = ?',
        [user.uid]
      );

      const targetContacts = assigned && assigned.length > 0 ? assigned : allContacts;

      const region: GeofenceRegion = {
        id: loc.id,
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius || 35,
        autoSend: true,
        messageTemplate: loc.message_template,
        contacts: (targetContacts || []).map((c) => ({
          phone: c.phone,
          isGroup: c.is_group === 1,
          name: c.name,
          contactId: c.id,
        })),
      };

      return triggerArrivalAlert(region, 0, true);
    },
    [db, user]
  );

  /**
   * Reset daily 1-per-day guard for a location
   */
  const resetDaily = useCallback(
    async (locationId: number) => {
      await resetLocationDailyTrigger(locationId);
      await syncGeofences();
    },
    [syncGeofences]
  );

  return {
    proximity,
    permissionGranted,
    isInitializing,
    syncGeofences,
    requestPermissions,
    testArrivalAlert,
    resetDaily,
  };
}

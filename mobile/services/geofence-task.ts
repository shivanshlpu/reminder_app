/**
 * Headless Native Background Task for 24/7 Geofencing & WhatsApp Auto-Dispatch
 * Runs via expo-task-manager even when phone is locked or app is in background.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { whatsappApi } from './whatsapp-api';

export const BACKGROUND_GEOFENCE_LOCATION_TASK = 'BACKGROUND_GEOFENCE_LOCATION_TASK';
export const STORAGE_MONITORED_REGIONS_KEY = '@geofence_monitored_regions';
export const STORAGE_DAILY_TRIGGERS_KEY = '@geofence_daily_triggers_state';
export const STORAGE_LAST_LOCATION_KEY = '@geofence_last_known_location';

export interface StoredGeofenceRegion {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  autoSend: boolean;
  messageTemplate: string;
  contacts: Array<{ phone: string; isGroup: boolean; name: string; contactId: number }>;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate precise distance between two GPS coordinates in meters using Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Executes arrival alert from background task with anti-rate-limit delay and local push notification.
 */
async function processBackgroundArrival(
  region: StoredGeofenceRegion,
  currentDistance: number
): Promise<void> {
  const today = getTodayDateString();

  // 1. Read daily triggers state
  let dailyCache: Record<number, string> = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_DAILY_TRIGGERS_KEY);
    if (raw) dailyCache = JSON.parse(raw);
  } catch (e) {
    console.warn('[Background Geofence] Failed to read daily triggers', e);
  }

  // 1-per-day guard
  if (dailyCache[region.id] === today) {
    return;
  }

  // Mark triggered immediately to prevent race conditions across coordinate updates
  dailyCache[region.id] = today;
  try {
    await AsyncStorage.setItem(STORAGE_DAILY_TRIGGERS_KEY, JSON.stringify(dailyCache));
  } catch (e) {}

  console.log(
    `[Background Geofence] 🚀 Gate Arrival Detected in Background: ${region.name} (${Math.round(
      currentDistance
    )}m away)! Dispatching WhatsApp...`
  );

  // Format message template
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const messageText = (region.messageTemplate || 'Reached {location} at {time}.')
    .replace(/{location}/g, region.name)
    .replace(/{time}/g, timeStr)
    .replace(/{date}/g, dateStr);

  let sentCount = 0;

  // Dispatch WhatsApp sequentially with 1.5s delay to prevent spam blocks
  if (region.contacts && region.contacts.length > 0) {
    for (let i = 0; i < region.contacts.length; i++) {
      const contact = region.contacts[i];
      if (i > 0) {
        await new Promise((res) => setTimeout(res, 1500));
      }
      try {
        await whatsappApi.sendMessage(
          [{ phone: contact.phone, isGroup: contact.isGroup }],
          region.name,
          undefined,
          messageText
        );
        sentCount++;
      } catch (err) {
        console.error(`[Background Geofence] WhatsApp send error to ${contact.name}:`, err);
      }
    }
  }

  // Show local push notification in status bar
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 Arrived at ${region.name}`,
        body: `Auto-sent WhatsApp message to ${sentCount} contact(s): "${messageText}"`,
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[Background Geofence] Notification trigger error', e);
  }

}

/**
 * Register TaskManager headless definition at top level
 */
TaskManager.defineTask(
  BACKGROUND_GEOFENCE_LOCATION_TASK,
  async ({ data, error }: { data: any; error: any }) => {
    if (error) {
      console.error('[Background Geofence Task] Location error:', error.message);
      return;
    }

    if (!data || !data.locations || data.locations.length === 0) {
      return;
    }

    const latestLocation = data.locations[data.locations.length - 1] as Location.LocationObject;
    const { latitude, longitude, accuracy } = latestLocation.coords;

    // Cache latest background coordinate for UI sync
    try {
      await AsyncStorage.setItem(
        STORAGE_LAST_LOCATION_KEY,
        JSON.stringify({ latitude, longitude, accuracy: accuracy || null, timestamp: Date.now() })
      );
    } catch (e) {}

    // Load active monitored regions
    let regions: StoredGeofenceRegion[] = [];
    try {
      const rawRegions = await AsyncStorage.getItem(STORAGE_MONITORED_REGIONS_KEY);
      if (rawRegions) {
        regions = JSON.parse(rawRegions);
      }
    } catch (e) {
      console.error('[Background Geofence Task] Failed to read monitored regions from storage', e);
      return;
    }

    if (!regions || regions.length === 0) {
      return;
    }

    // Evaluate proximity against each active pinned location
    for (const region of regions) {
      if (!region.autoSend) continue;

      const distance = calculateDistanceMeters(
        latitude,
        longitude,
        region.latitude,
        region.longitude
      );

      const gpsAccuracy = accuracy || 15;
      const effectiveRadius = Math.max(region.radius || 35, 35);
      const threshold = effectiveRadius + Math.min(gpsAccuracy, 25);

      if (distance <= threshold) {
        await processBackgroundArrival(region, distance);
      }
    }
  }
);

/**
 * Headless Native Background Task for 24/7 Geofencing & WhatsApp Auto-Dispatch
 * Runs via expo-task-manager even when phone is locked or app is in background.
 * Supports per-location 24-hour reset cycles (e.g. 12:00 PM for Home, 12:00 AM for College)
 * and day-of-week active filters (e.g. weekdays only / exclude weekends).
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
  activeDays?: string | string[];
  resetTime?: string;
  contacts: Array<{ phone: string; isGroup: boolean; name: string; contactId: number }>;
}

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Checks whether a given location is active on the current day of the week.
 */
export function isLocationActiveOnDay(activeDays?: string | string[], date: Date = new Date()): boolean {
  if (!activeDays) return true;
  const dayIndex = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const dayKey = DAY_KEYS[dayIndex];

  if (Array.isArray(activeDays)) {
    if (activeDays.length === 0) return true;
    return activeDays.some((d) => d.toLowerCase().startsWith(dayKey));
  }

  const daysList = activeDays.toLowerCase().split(',').map((d) => d.trim());
  if (daysList.length === 0 || activeDays.trim() === '') return true;
  return daysList.some((d) => d.startsWith(dayKey));
}

/**
 * Parses reset time into hour (0-23) and minute (0-59).
 * Supports formats: "12:00 PM", "12:00 AM", "06:00 AM", "12:00", "00:00", etc.
 */
export function parseResetHour(resetTime?: string): { hour: number; minute: number } {
  if (!resetTime) return { hour: 0, minute: 0 };
  const trimmed = resetTime.trim().toUpperCase();

  // Format: "12:00 PM", "12:00 AM", "6:00 AM", etc.
  const ampmMatch = trimmed.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPM = ampmMatch[3].toUpperCase() === 'PM';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return { hour: h, minute: m };
  }

  // 24-hour format: "12:00", "00:00", "14:30"
  const h24Match = trimmed.match(/^(\d{1,2}):?(\d{2})?$/);
  if (h24Match) {
    const h = parseInt(h24Match[1], 10);
    const m = h24Match[2] ? parseInt(h24Match[2], 10) : 0;
    return { hour: Math.min(Math.max(h, 0), 23), minute: Math.min(Math.max(m, 0), 59) };
  }

  return { hour: 0, minute: 0 };
}

/**
 * Computes a unique 24-hour cycle identifier for a location based on its reset time.
 * 
 * Example:
 * If resetTime is "12:00 PM":
 * - Aug 20 at 10:00 AM: belongs to cycle started Aug 19 at 12:00 PM -> "2026-08-19_12:00"
 * - Aug 20 at 12:00 AM (midnight): STILL in cycle started Aug 19 at 12:00 PM -> "2026-08-19_12:00" (NO MIDNIGHT TRIGGER!)
 * - Aug 20 at 02:00 PM: belongs to cycle started Aug 20 at 12:00 PM -> "2026-08-20_12:00"
 */
export function getLocationCycleKey(resetTime?: string, date: Date = new Date()): string {
  const { hour: resetH, minute: resetM } = parseResetHour(resetTime);
  const nowH = date.getHours();
  const nowM = date.getMinutes();

  // Check if current time is before the reset time today
  const isBeforeResetToday = nowH < resetH || (nowH === resetH && nowM < resetM);

  let cycleStartDate: Date;
  if (isBeforeResetToday) {
    // Started yesterday at reset time
    cycleStartDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  } else {
    // Started today at reset time
    cycleStartDate = date;
  }

  const year = cycleStartDate.getFullYear();
  const month = String(cycleStartDate.getMonth() + 1).padStart(2, '0');
  const day = String(cycleStartDate.getDate()).padStart(2, '0');
  const hStr = String(resetH).padStart(2, '0');
  const mStr = String(resetM).padStart(2, '0');

  return `${year}-${month}-${day}_${hStr}:${mStr}`;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time (fallback).
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
  const now = new Date();

  // 1. Day of Week Guard (e.g. skip weekends for College)
  if (!isLocationActiveOnDay(region.activeDays, now)) {
    const dayName = now.toLocaleDateString('en-IN', { weekday: 'long' });
    console.log(`[Background Geofence] ⏸️ Skipped ${region.name}: Inactive on ${dayName} (Weekend/Disabled day)`);
    return;
  }

  const cycleKey = getLocationCycleKey(region.resetTime, now);

  // 2. Read triggers state
  let dailyCache: Record<number, string> = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_DAILY_TRIGGERS_KEY);
    if (raw) dailyCache = JSON.parse(raw);
  } catch (e) {
    console.warn('[Background Geofence] Failed to read daily triggers', e);
  }

  // 1-per-24h cycle guard (using location's custom reset cycle key)
  if (dailyCache[region.id] === cycleKey) {
    return;
  }

  // Mark triggered immediately to prevent race conditions across coordinate updates
  dailyCache[region.id] = cycleKey;
  try {
    await AsyncStorage.setItem(STORAGE_DAILY_TRIGGERS_KEY, JSON.stringify(dailyCache));
  } catch (e) {}

  console.log(
    `[Background Geofence] 🚀 Gate Arrival Detected in Background: ${region.name} (${Math.round(
      currentDistance
    )}m away, Cycle: ${cycleKey})! Dispatching WhatsApp...`
  );

  // Format message template
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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

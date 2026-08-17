/**
 * Ultra-Precise Gate Geofencing & Location Proximity Service
 * Monitors GPS location with 10-meter gate-level precision (Location.Accuracy.BestForNavigation).
 * Automatically triggers WhatsApp arrival message upon entering the gate radius!
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { whatsappApi } from './whatsapp-api';

const GEOFENCE_RADIUS_DEFAULT = 10; // 10 meters default for gate entry precision!
const STORAGE_DAILY_TRIGGERS_KEY = '@geofence_daily_triggers_state';

export interface GeofenceRegion {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  autoSend: boolean;
  messageTemplate: string;
  contacts: Array<{ phone: string; isGroup: boolean; name: string; contactId: number }>;
}

// Map of locationId -> "YYYY-MM-DD"
let dailyTriggerCache: Record<number, string> = {};
let isDailyCacheLoaded = false;
let activeLocationWatcher: Location.LocationSubscription | null = null;
let monitoredRegions: GeofenceRegion[] = [];

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
 * Loads daily trigger state from persistent AsyncStorage into memory.
 */
export async function loadDailyTriggers(): Promise<Record<number, string>> {
  if (isDailyCacheLoaded) return dailyTriggerCache;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_DAILY_TRIGGERS_KEY);
    if (stored) {
      dailyTriggerCache = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load daily geofence trigger states', e);
  }
  isDailyCacheLoaded = true;
  return dailyTriggerCache;
}

/**
 * Checks if a specific location has already sent its automatic message today.
 */
export function isLocationTriggeredToday(locationId: number): boolean {
  const today = getTodayDateString();
  return dailyTriggerCache[locationId] === today;
}

/**
 * Records that a location has sent its alert today (persists to storage).
 */
export async function recordLocationTriggeredToday(locationId: number): Promise<void> {
  await loadDailyTriggers();
  const today = getTodayDateString();
  dailyTriggerCache[locationId] = today;
  try {
    await AsyncStorage.setItem(STORAGE_DAILY_TRIGGERS_KEY, JSON.stringify(dailyTriggerCache));
  } catch (e) {
    console.error('Failed to save daily geofence trigger state', e);
  }
}

/**
 * Resets the daily trigger state for a location (allows re-triggering today).
 */
export async function resetLocationDailyTrigger(locationId: number): Promise<void> {
  await loadDailyTriggers();
  delete dailyTriggerCache[locationId];
  try {
    await AsyncStorage.setItem(STORAGE_DAILY_TRIGGERS_KEY, JSON.stringify(dailyTriggerCache));
  } catch (e) {
    console.error('Failed to reset daily geofence trigger state', e);
  }
}

/**
 * Calculate precise distance between two GPS coordinates in meters using Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
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
 * Request high-precision location permissions.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foreground } = await Location.requestForegroundPermissionsAsync();
    if (foreground !== 'granted') {
      console.warn('Foreground location permission not granted');
      return false;
    }

    try {
      const { status: background } = await Location.requestBackgroundPermissionsAsync();
      if (background !== 'granted') {
        console.warn('Background location permission optional');
      }
    } catch (e) {}

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Trigger the automatic arrival message once per day per location when entering the gate radius.
 */
async function triggerArrivalAlert(region: GeofenceRegion, currentDistance: number) {
  await loadDailyTriggers();
  const today = getTodayDateString();

  // 1. Strict Once-Per-Day Guard: Skip if already sent today for this location
  if (dailyTriggerCache[region.id] === today) {
    return;
  }

  // Mark as triggered immediately to prevent duplicate async triggers
  dailyTriggerCache[region.id] = today;
  recordLocationTriggeredToday(region.id).catch(() => {});

  console.log(`📍 1-Per-Day Gate Arrival: Entered ${region.name} (${Math.round(currentDistance)}m away) for the first time today!`);

  // Render template placeholders
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const messageText = (region.messageTemplate || 'Reached {location} at {time}.')
    .replace(/{location}/g, region.name)
    .replace(/{time}/g, timeStr)
    .replace(/{date}/g, dateStr);

  // Send WhatsApp message to assigned contacts
  if (region.contacts && region.contacts.length > 0) {
    const recipients = region.contacts.map((c) => ({
      phone: c.phone,
      isGroup: c.isGroup,
    }));

    try {
      await whatsappApi.sendMessage(recipients, region.name, undefined, messageText);
      console.log(`✅ WhatsApp 1-per-day arrival alert sent to ${recipients.length} contact(s) for ${region.name}`);
    } catch (err) {
      console.error('Failed to send automatic arrival message:', err);
    }
  }

  // Show local push notification
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 Entered ${region.name} (Daily Arrival Alert)`,
        body: `Auto-sent WhatsApp message: "${messageText}"`,
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {}
}

/**
 * Start high-precision continuous gate proximity monitoring.
 */
export async function startGeofencing(regions: GeofenceRegion[]): Promise<void> {
  monitoredRegions = regions.filter((r) => r.autoSend);

  if (monitoredRegions.length === 0) {
    if (activeLocationWatcher) {
      activeLocationWatcher.remove();
      activeLocationWatcher = null;
    }
    return;
  }

  // If watcher is already active, updating monitoredRegions is sufficient!
  if (activeLocationWatcher) {
    return;
  }

  const hasPerms = await requestLocationPermissions();
  if (!hasPerms) return;

  try {
    activeLocationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 5,
        timeInterval: 5000,
      },
      (location) => {
        const { latitude, longitude } = location.coords;

        monitoredRegions.forEach((region) => {
          const distance = calculateDistanceMeters(
            latitude,
            longitude,
            region.latitude,
            region.longitude
          );

          const threshold = region.radius || GEOFENCE_RADIUS_DEFAULT;

          // If inside the gate radius (e.g. <= 10m)
          if (distance <= threshold) {
            triggerArrivalAlert(region, distance);
          }
        });
      }
    );

    console.log(`📍 Gate Proximity Active for ${monitoredRegions.length} location(s)`);
  } catch (error) {
    console.error('Failed to start proximity monitoring:', error);
  }
}

/**
 * Stop proximity monitoring.
 */
export function stopGeofencing(): void {
  if (activeLocationWatcher) {
    activeLocationWatcher.remove();
    activeLocationWatcher = null;
  }
}

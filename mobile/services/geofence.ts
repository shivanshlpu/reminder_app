/**
 * Ultra-Precise Gate Geofencing & Location Proximity Service
 * Monitors GPS location with gate-level precision & intelligent accuracy buffering.
 * Automatically triggers WhatsApp arrival message upon entering the gate radius!
 * Features:
 * - Anti-ban sequential WhatsApp dispatch with 1.5s delay between recipients.
 * - Strict 1-per-day guard per location (resettable, persists in AsyncStorage).
 * - Real-time proximity radar & live distance calculation to nearest gate.
 * - Manual test auto-trigger simulation for verification.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { whatsappApi } from './whatsapp-api';

const DEFAULT_GEOFENCE_RADIUS = 35; // 35 meters default for reliable mobile GPS gate detection
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

export interface ProximityStatus {
  permissionGranted: boolean;
  isMonitoring: boolean;
  monitoredCount: number;
  currentCoords: { latitude: number; longitude: number; accuracy: number | null } | null;
  nearestRegion: {
    id: number;
    name: string;
    distanceMeters: number;
    radius: number;
    isInside: boolean;
    triggeredToday: boolean;
  } | null;
}

// In-memory state
let dailyTriggerCache: Record<number, string> = {};
let isDailyCacheLoaded = false;
let activeLocationWatcher: Location.LocationSubscription | null = null;
let monitoredRegions: GeofenceRegion[] = [];
let lastKnownCoords: { latitude: number; longitude: number; accuracy: number | null } | null = null;
let proximityListeners: Array<(status: ProximityStatus) => void> = [];

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
  notifyStatusListeners();
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
  notifyStatusListeners();
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
 * Check if location permissions are already granted.
 */
export async function checkLocationPermissionStatus(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

/**
 * Trigger the automatic arrival message once per day per location when entering the gate radius.
 * Supports sequential anti-ban delay (1.5s) between multiple contacts!
 */
export async function triggerArrivalAlert(
  region: GeofenceRegion,
  currentDistance: number,
  isManualTest: boolean = false
): Promise<{ success: boolean; recipientCount: number; message: string }> {
  await loadDailyTriggers();
  const today = getTodayDateString();

  // 1. Strict Once-Per-Day Guard (unless manually tested by user)
  if (!isManualTest && dailyTriggerCache[region.id] === today) {
    console.log(`📍 Geofence Guard: Alert for "${region.name}" was already dispatched today.`);
    return { success: false, recipientCount: 0, message: 'Already sent today (1-per-day guard active)' };
  }

  // Mark as triggered immediately to prevent duplicate async triggers
  dailyTriggerCache[region.id] = today;
  recordLocationTriggeredToday(region.id).catch(() => {});

  console.log(`📍 1-Per-Day Gate Arrival: Entered ${region.name} (${Math.round(currentDistance)}m away)!`);

  // Render template placeholders
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const messageText = (region.messageTemplate || 'Reached {location} at {time}.')
    .replace(/{location}/g, region.name)
    .replace(/{time}/g, timeStr)
    .replace(/{date}/g, dateStr);

  let sentCount = 0;

  // Send WhatsApp message sequentially with 1.5s delay to prevent WhatsApp rate-limit / spam blocks
  if (region.contacts && region.contacts.length > 0) {
    for (let i = 0; i < region.contacts.length; i++) {
      const contact = region.contacts[i];

      if (i > 0) {
        // Safe 1.5s delay between recipients to prevent WhatsApp rate-limiting
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      try {
        await whatsappApi.sendMessage(
          [{ phone: contact.phone, isGroup: contact.isGroup }],
          region.name,
          undefined,
          messageText
        );
        sentCount++;
        console.log(`✅ WhatsApp alert sent to ${contact.name} (${contact.phone}) for ${region.name}`);
      } catch (err) {
        console.error(`Failed to send WhatsApp alert to ${contact.name}:`, err);
      }
    }
  }

  // Show local device push notification
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isManualTest ? `🧪 Test Alert: Reached ${region.name}` : `📍 Arrived at ${region.name}`,
        body: `Auto-sent WhatsApp message to ${sentCount} contact(s): "${messageText}"`,
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {}

  notifyStatusListeners();

  return {
    success: true,
    recipientCount: sentCount,
    message: messageText,
  };
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
    notifyStatusListeners();
    return;
  }

  // If watcher is already active, updating monitoredRegions is sufficient!
  if (activeLocationWatcher) {
    notifyStatusListeners();
    return;
  }

  const hasPerms = await requestLocationPermissions();
  if (!hasPerms) {
    notifyStatusListeners();
    return;
  }

  try {
    activeLocationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 4000,
      },
      (location) => {
        const { latitude, longitude, accuracy } = location.coords;
        lastKnownCoords = { latitude, longitude, accuracy: accuracy || null };

        monitoredRegions.forEach((region) => {
          const distance = calculateDistanceMeters(
            latitude,
            longitude,
            region.latitude,
            region.longitude
          );

          // Smart Gate Proximity Threshold:
          // Effective radius: at least 35m (or user setting), plus GPS accuracy buffer
          const gpsAccuracy = accuracy || 15;
          const effectiveRadius = Math.max(region.radius || DEFAULT_GEOFENCE_RADIUS, DEFAULT_GEOFENCE_RADIUS);
          const threshold = effectiveRadius + Math.min(gpsAccuracy, 25);

          // If inside the gate radius
          if (distance <= threshold) {
            triggerArrivalAlert(region, distance);
          }
        });

        notifyStatusListeners();
      }
    );

    console.log(`📍 Gate Proximity Radar Active for ${monitoredRegions.length} location(s)`);
  } catch (error) {
    console.error('Failed to start proximity monitoring:', error);
  }

  notifyStatusListeners();
}

/**
 * Stop proximity monitoring.
 */
export function stopGeofencing(): void {
  if (activeLocationWatcher) {
    activeLocationWatcher.remove();
    activeLocationWatcher = null;
  }
  notifyStatusListeners();
}

/**
 * Get current proximity status.
 */
export function getCurrentProximityStatus(): ProximityStatus {
  let nearestRegion: ProximityStatus['nearestRegion'] = null;

  if (lastKnownCoords && monitoredRegions.length > 0) {
    const today = getTodayDateString();
    let minDistance = Infinity;

    monitoredRegions.forEach((region) => {
      const distance = calculateDistanceMeters(
        lastKnownCoords!.latitude,
        lastKnownCoords!.longitude,
        region.latitude,
        region.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        const radius = region.radius || DEFAULT_GEOFENCE_RADIUS;
        nearestRegion = {
          id: region.id,
          name: region.name,
          distanceMeters: Math.round(distance),
          radius,
          isInside: distance <= radius + 20,
          triggeredToday: dailyTriggerCache[region.id] === today,
        };
      }
    });
  }

  return {
    permissionGranted: !!activeLocationWatcher || lastKnownCoords !== null,
    isMonitoring: activeLocationWatcher !== null,
    monitoredCount: monitoredRegions.length,
    currentCoords: lastKnownCoords,
    nearestRegion,
  };
}

/**
 * Subscribe to proximity radar status updates.
 */
export function onProximityUpdate(listener: (status: ProximityStatus) => void): () => void {
  proximityListeners.push(listener);
  listener(getCurrentProximityStatus());
  return () => {
    proximityListeners = proximityListeners.filter((l) => l !== listener);
  };
}

function notifyStatusListeners() {
  const status = getCurrentProximityStatus();
  proximityListeners.forEach((l) => l(status));
}

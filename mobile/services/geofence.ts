/**
 * Ultra-Precise Gate Geofencing & 24/7 Background Radar Service
 * Keeps running continuously in the background via Android Foreground Service + Sticky Notification.
 * Features:
 * - 24/7 Background native location updates via expo-task-manager & Foreground Service.
 * - Sticky status bar notification ("📍 Auto-Arrival Radar Active").
 * - Anti-ban sequential WhatsApp dispatch with 1.5s delay between recipients.
 * - Strict 1-per-day guard per location (resettable, persists in AsyncStorage).
 * - Real-time proximity radar & live distance calculation to nearest gate in foreground.
 * - Seamless fallback for web & permission state tracking.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { whatsappApi } from './whatsapp-api';
import {
  BACKGROUND_GEOFENCE_LOCATION_TASK,
  STORAGE_MONITORED_REGIONS_KEY,
  STORAGE_DAILY_TRIGGERS_KEY,
  STORAGE_LAST_LOCATION_KEY,
  getTodayDateString,
  calculateDistanceMeters,
} from './geofence-task';

export { getTodayDateString, calculateDistanceMeters };

const DEFAULT_GEOFENCE_RADIUS = 35; // 35 meters default for reliable mobile GPS gate detection

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
  backgroundPermissionGranted: boolean;
  isMonitoring: boolean;
  isBackgroundActive: boolean;
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
let isBackgroundActiveState = false;
let backgroundPermState = false;

/**
 * Configure Android Notification Channels for high-importance alerts and foreground service.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('geofence-radar', {
        name: 'Gate Arrival Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C63FF',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('geofence-service', {
        name: 'Auto-Arrival Background Radar',
        importance: Notifications.AndroidImportance.LOW,
        sound: undefined,
        enableVibrate: false,
        showBadge: false,
      });
    } catch (e) {
      console.warn('Failed to set up Android notification channels:', e);
    }
  }
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
 * Request high-precision foreground and background ("Allow all the time") location permissions.
 */
export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  foreground: boolean;
  background: boolean;
}> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      backgroundPermState = false;
      return { granted: false, foreground: false, background: false };
    }

    let backgroundGranted = false;
    if (Platform.OS !== 'web') {
      try {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        backgroundGranted = bgStatus === 'granted';
        backgroundPermState = backgroundGranted;
      } catch (e) {
        console.warn('Background location permission error/optional on this platform', e);
      }
    }

    return {
      granted: true,
      foreground: true,
      background: backgroundGranted,
    };
  } catch (e) {
    return { granted: false, foreground: false, background: false };
  }
}

/**
 * Check if location permissions are already granted.
 */
export async function checkLocationPermissionStatus(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  try {
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    const fg = fgStatus === 'granted';

    let bg = false;
    if (Platform.OS !== 'web' && fg) {
      try {
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        bg = bgStatus === 'granted';
        backgroundPermState = bg;
      } catch (e) {}
    }

    return { foreground: fg, background: bg };
  } catch (e) {
    return { foreground: false, background: false };
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
 * Start high-precision continuous gate proximity monitoring and 24/7 background foreground service.
 */
export async function startGeofencing(regions: GeofenceRegion[]): Promise<void> {
  monitoredRegions = regions.filter((r) => r.autoSend);

  // Sync to AsyncStorage for headless background task
  try {
    await AsyncStorage.setItem(
      STORAGE_MONITORED_REGIONS_KEY,
      JSON.stringify(monitoredRegions)
    );
  } catch (e) {
    console.warn('Failed to cache monitored regions for background task', e);
  }

  if (monitoredRegions.length === 0) {
    await stopGeofencing();
    return;
  }

  const permStatus = await requestLocationPermissions();
  if (!permStatus.granted) {
    notifyStatusListeners();
    return;
  }

  await setupNotificationChannels();

  // 1. Native Background Location Task with Android Foreground Service
  if (Platform.OS !== 'web') {
    try {
      const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_GEOFENCE_LOCATION_TASK
      );

      const locationCount = monitoredRegions.length;
      const countLabel = `${locationCount} gate${locationCount > 1 ? 's' : ''}`;

      await Location.startLocationUpdatesAsync(BACKGROUND_GEOFENCE_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 8000, // 8s GPS poll
        distanceInterval: 10, // 10m displacement
        deferredUpdatesInterval: 8000,
        deferredUpdatesDistance: 10,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: '📍 Auto-Arrival Radar Active',
          notificationBody: `Monitoring ${countLabel} in background. Messages auto-send upon arrival!`,
          notificationColor: '#6C63FF',
        },
      });

      isBackgroundActiveState = true;
      console.log(`[Geofence] 🚀 24/7 Background Foreground Service started for ${countLabel}`);
    } catch (bgError) {
      console.warn('[Geofence] Background updates initialization notice:', bgError);
    }
  }

  // 2. Foreground Watcher for smooth on-screen UI radar updates
  if (!activeLocationWatcher) {
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

            const gpsAccuracy = accuracy || 15;
            const effectiveRadius = Math.max(region.radius || DEFAULT_GEOFENCE_RADIUS, DEFAULT_GEOFENCE_RADIUS);
            const threshold = effectiveRadius + Math.min(gpsAccuracy, 25);

            if (distance <= threshold) {
              triggerArrivalAlert(region, distance);
            }
          });

          notifyStatusListeners();
        }
      );
    } catch (fgError) {
      console.warn('[Geofence] Foreground watcher initialization error:', fgError);
    }
  }

  notifyStatusListeners();
}

/**
 * Stop proximity monitoring & background foreground service.
 */
export async function stopGeofencing(): Promise<void> {
  if (activeLocationWatcher) {
    activeLocationWatcher.remove();
    activeLocationWatcher = null;
  }

  if (Platform.OS !== 'web') {
    try {
      const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_GEOFENCE_LOCATION_TASK
      );
      if (isTaskRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_GEOFENCE_LOCATION_TASK);
      }
    } catch (e) {}
  }

  try {
    await AsyncStorage.removeItem(STORAGE_MONITORED_REGIONS_KEY);
  } catch (e) {}

  isBackgroundActiveState = false;
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
    backgroundPermissionGranted: backgroundPermState,
    isMonitoring: activeLocationWatcher !== null || isBackgroundActiveState,
    isBackgroundActive: isBackgroundActiveState,
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

/**
 * Ultra-Precise Gate Geofencing & Location Proximity Service
 * Monitors GPS location with 10-meter gate-level precision (Location.Accuracy.BestForNavigation).
 * Automatically triggers WhatsApp arrival message upon entering the gate radius!
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { whatsappApi } from './whatsapp-api';

const GEOFENCE_RADIUS_DEFAULT = 10; // 10 meters default for gate entry precision!
const COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown to prevent duplicate messages

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

// Track last triggered time per location ID
const lastTriggeredTimes: Record<number, number> = {};
let activeLocationWatcher: Location.LocationSubscription | null = null;
let monitoredRegions: GeofenceRegion[] = [];

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
 * Trigger the automatic arrival message when entering the gate radius.
 */
async function triggerArrivalAlert(region: GeofenceRegion, currentDistance: number) {
  const now = Date.now();
  const lastTime = lastTriggeredTimes[region.id] || 0;

  // Check 15-minute entry cooldown
  if (now - lastTime < COOLDOWN_MS) {
    return;
  }

  lastTriggeredTimes[region.id] = now;

  console.log(`📍 Gate Arrival Detected: Entered ${region.name} (${Math.round(currentDistance)}m away)!`);

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
      console.log(`✅ WhatsApp arrival alert sent to ${recipients.length} contact(s) for ${region.name}`);
    } catch (err) {
      console.error('Failed to send automatic arrival message:', err);
    }
  }

  // Show local push notification
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 Entered ${region.name} Gate`,
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

  const hasPerms = await requestLocationPermissions();
  if (!hasPerms) return;

  // Remove previous watcher
  if (activeLocationWatcher) {
    activeLocationWatcher.remove();
    activeLocationWatcher = null;
  }

  try {
    activeLocationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 2, // Check every 2 meters
        timeInterval: 3000,   // Check every 3 seconds
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

    console.log(`📍 Continuous 10m Gate Proximity Active for ${monitoredRegions.length} location(s)`);
  } catch (error) {
    console.error('Failed to start continuous proximity monitoring:', error);
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

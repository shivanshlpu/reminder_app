/**
 * Live Geofence Radar & 24/7 Background Status Banner
 * Provides clear visual feedback on GPS permissions, foreground service status, live distance to nearest gate, and auto-dispatch readiness.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGlobalGeofence } from '../hooks/useGlobalGeofence';
import { showMessage } from '../utils/dialogs';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

interface GeofenceRadarBannerProps {
  onPressManage?: () => void;
  showTestButton?: boolean;
}

export function GeofenceRadarBanner({ onPressManage, showTestButton = true }: GeofenceRadarBannerProps) {
  const {
    proximity,
    permissionGranted,
    requestPermissions,
    testArrivalAlert,
    resetDaily,
    syncGeofences,
  } = useGlobalGeofence();

  const [testing, setTesting] = useState(false);
  const [requestingPerms, setRequestingPerms] = useState(false);

  const handleGrantPermissions = async () => {
    setRequestingPerms(true);
    const granted = await requestPermissions();
    setRequestingPerms(false);
    if (granted) {
      showMessage('Permission Granted', '24/7 GPS gate monitoring is now active!', 'success');
    } else {
      showMessage('Permission Required', 'Please enable Location in device settings for auto-messages.', 'error');
    }
  };

  const handleTestTrigger = async () => {
    if (!proximity.nearestRegion) {
      showMessage('No Pinned Locations', 'Add a pinned location (e.g. College Gate) first!', 'info');
      return;
    }

    setTesting(true);
    try {
      const res = await testArrivalAlert(proximity.nearestRegion.id);
      if (res.success) {
        showMessage(
          '🧪 Test Arrival Sent!',
          `Auto-message dispatched to ${res.recipientCount} recipient(s) for "${proximity.nearestRegion.name}"`,
          'success'
        );
      } else {
        showMessage('Test Notice', res.message, 'info');
      }
    } catch (e: any) {
      showMessage('Test Failed', e?.message || 'Could not send test message', 'error');
    } finally {
      setTesting(false);
    }
  };

  // State 1: Permission Not Granted
  if (permissionGranted === false) {
    return (
      <View style={[styles.container, styles.permWarningCard]}>
        <View style={styles.iconCircleWarning}>
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={Colors.warning} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.permTitle}>Location Permission Needed</Text>
          <Text style={styles.permSubtitle}>
            Enable location ("Allow all the time") so your app can automatically send WhatsApp arrival messages even when your phone is off or in your pocket.
          </Text>
          <TouchableOpacity
            style={styles.grantBtn}
            onPress={handleGrantPermissions}
            disabled={requestingPerms}
            activeOpacity={0.8}
          >
            {requestingPerms ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.grantBtnText}>Grant Location Permission</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // State 2: No Monitored Locations
  if (proximity.monitoredCount === 0) {
    return (
      <View style={[styles.container, styles.inactiveCard]}>
        <View style={styles.iconCircleMuted}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={Colors.textMuted} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.inactiveTitle}>Auto-Arrival Geofencing Inactive</Text>
          <Text style={styles.inactiveSubtitle}>
            Add a pinned location (e.g. College Gate) and turn ON "Auto-Send" to enable automatic 24/7 arrival messages.
          </Text>
        </View>
        {onPressManage && (
          <TouchableOpacity style={styles.outlineBtn} onPress={onPressManage} activeOpacity={0.7}>
            <Text style={styles.outlineBtnText}>Setup</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // State 3: Active Monitoring Radar & 24/7 Background Service
  const nearest = proximity.nearestRegion;

  return (
    <View style={[styles.container, styles.activeCard]}>
      <View style={styles.topRow}>
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusPillText}>
            {Platform.OS === 'web'
              ? `GPS RADAR ACTIVE (${proximity.monitoredCount} GATE${proximity.monitoredCount > 1 ? 'S' : ''})`
              : `24/7 BACKGROUND SERVICE ACTIVE (${proximity.monitoredCount} GATE${proximity.monitoredCount > 1 ? 'S' : ''})`}
          </Text>
        </View>

        <TouchableOpacity onPress={syncGeofences} style={styles.syncIconBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="sync" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Persistent Notification indicator */}
      {Platform.OS !== 'web' && (
        <View style={styles.notificationInfoRow}>
          <MaterialCommunityIcons name="bell-ring-outline" size={13} color="#15803D" />
          <Text style={styles.notificationInfoText}>
            Active in notification bar • Runs when phone is locked & other apps are open
          </Text>
        </View>
      )}

      {nearest ? (
        <View style={styles.nearestWrap}>
          <View style={styles.nearestMain}>
            <MaterialCommunityIcons
              name={nearest.isInside ? 'check-circle' : 'crosshairs-gps'}
              size={20}
              color={nearest.isInside ? Colors.success : Colors.primary}
            />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.nearestName} numberOfLines={1}>
                {nearest.name}
              </Text>
              <Text style={styles.distanceText}>
                {nearest.isInside
                  ? '🎯 Inside gate radius! Auto-trigger ready'
                  : `📍 ${nearest.distanceMeters}m away (radius: ${nearest.radius}m)`}
              </Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                nearest.triggeredToday ? styles.badgeTriggered : styles.badgeReady,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  nearest.triggeredToday ? styles.badgeTextTriggered : styles.badgeTextReady,
                ]}
              >
                {nearest.triggeredToday ? '🔒 Sent Today (1/1)' : '⚡ 1-Per-Day Ready (0/1)'}
              </Text>
            </View>

            {nearest.triggeredToday && (
              <TouchableOpacity
                onPress={() => resetDaily(nearest.id)}
                style={styles.resetBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.searchingText}>📡 Searching GPS coordinates for nearest gate...</Text>
      )}

      {showTestButton && nearest && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTestTrigger}
            disabled={testing}
            activeOpacity={0.8}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.testBtnText}>Test Auto-Trigger Simulation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    ...Shadows.small,
  },
  permWarningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  iconCircleWarning: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permTitle: {
    fontSize: Fonts.sizes.md,
    fontWeight: '800',
    color: '#92400E',
  },
  permSubtitle: {
    fontSize: Fonts.sizes.xs,
    color: '#B45309',
    marginTop: 2,
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  grantBtnText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inactiveCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircleMuted: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveTitle: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  inactiveSubtitle: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  outlineBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  outlineBtnText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  activeCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  notificationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
    marginTop: 2,
  },
  notificationInfoText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '500',
  },
  syncIconBtn: {
    padding: 4,
  },
  nearestWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: Spacing.xs,
  },
  nearestMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nearestName: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  distanceText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeReady: {
    backgroundColor: '#DCFCE7',
  },
  badgeTriggered: {
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextReady: {
    color: '#15803D',
  },
  badgeTextTriggered: {
    color: '#64748B',
  },
  resetBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resetBtnText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '700',
  },
  searchingText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  actionsRow: {
    marginTop: Spacing.xs,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: BorderRadius.md,
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
  },
  testBtnText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  textWrap: {
    flex: 1,
  },
});

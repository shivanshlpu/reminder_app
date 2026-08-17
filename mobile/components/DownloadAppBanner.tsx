/**
 * DownloadAppBanner Component
 * Displays a top floating banner/popup on Web to prompt users to download the Android APK.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

export function DownloadAppBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Only render on web platforms when not dismissed
  if (Platform.OS !== 'web' || dismissed) {
    return null;
  }

  const apkUrl = process.env.EXPO_PUBLIC_APK_URL || '#';

  const handleDownload = () => {
    if (apkUrl && apkUrl !== '#') {
      Linking.openURL(apkUrl);
    } else {
      alert('APK download link will be available once built via Expo EAS.');
    }
  };

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.contentRow}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="android" size={24} color="#FFFFFF" />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.titleText}>Get the Android App 📱</Text>
          <Text style={styles.descText}>
            Install the native app for background geofence alerts & automated WhatsApp reminders.
          </Text>
        </View>

        <TouchableOpacity style={styles.downloadButton} onPress={handleDownload} activeOpacity={0.8}>
          <MaterialCommunityIcons name="download" size={18} color={Colors.primary} />
          <Text style={styles.downloadButtonText}>Download APK</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.closeButton} onPress={() => setDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: '#0F172A', // Dark sleek banner
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    zIndex: 9999,
    ...Shadows.medium,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
  },
  descText: {
    color: '#94A3B8',
    fontSize: Fonts.sizes.xs,
    marginTop: 2,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  downloadButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: Fonts.sizes.xs,
  },
  closeButton: {
    padding: 4,
  },
});

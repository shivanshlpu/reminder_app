/**
 * Responsive Screen Container
 * Fluid layout for both mobile phones and desktop/laptop screens:
 * - On Mobile Phones: 100% full width, edge-to-edge native layout.
 * - On Desktop/Laptop Screens: Max-width 1200px container centered on screen with clean padding.
 */
import React, { ReactNode } from 'react';
import { View, StyleSheet, Platform, SafeAreaView } from 'react-native';
import { Colors } from '../constants/theme';
import { DownloadAppBanner } from './DownloadAppBanner';

export function ResponsiveContainer({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrapper}>
        <DownloadAppBanner />
        <View style={styles.webContainer}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.nativeContainer}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    width: '100%',
  },
  webContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    backgroundColor: Colors.background,
  },
  nativeContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});

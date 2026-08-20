/**
 * PWA Install Prompt Banner Component
 * Detects browser PWA install event and provides a 1-click "Install App to Home Screen" button.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Register Service Worker & Manifest dynamically
    if (typeof document !== 'undefined') {
      if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest.json';
        document.head.appendChild(link);
      }

      const metaTags = [
        { name: 'theme-color', content: '#6C63FF' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'PocketRadar' },
      ];

      metaTags.forEach(({ name, content }) => {
        if (!document.querySelector(`meta[name="${name}"]`)) {
          const meta = document.createElement('meta');
          meta.name = name;
          meta.content = content;
          document.head.appendChild(meta);
        }
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    }

    // Capture beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert('To install, tap your browser menu (⋮ or Share) and select "Add to Home Screen" or "Install App".');
      return;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (Platform.OS !== 'web' || !showPrompt) {
    return null;
  }

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.contentRow}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={24} color="#FFFFFF" />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.titleText}>Install ExpenseTracker App 📲</Text>
          <Text style={styles.descText}>
            Add to your phone home screen for instant full-screen app access!
          </Text>
        </View>

        <TouchableOpacity style={styles.installButton} onPress={handleInstallClick} activeOpacity={0.8}>
          <MaterialCommunityIcons name="download-box-outline" size={18} color={Colors.primary} />
          <Text style={styles.installButtonText}>Install App</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.closeButton} onPress={() => setShowPrompt(false)}>
          <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: '#0F172A',
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
    backgroundColor: Colors.primary,
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
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  installButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: Fonts.sizes.xs,
  },
  closeButton: {
    padding: 4,
  },
});

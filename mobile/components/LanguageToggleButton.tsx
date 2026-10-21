/**
 * Language Toggle Button Component
 * Sleek, one-tap switcher between English and Hindi.
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Colors, BorderRadius, Shadows } from '../constants/theme';

interface Props {
  variant?: 'pill' | 'header' | 'card';
}

export function LanguageToggleButton({ variant = 'header' }: Props) {
  const { language, toggleLanguage } = useLanguage();

  if (variant === 'card') {
    return (
      <TouchableOpacity
        style={styles.cardContainer}
        onPress={toggleLanguage}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          <MaterialCommunityIcons name="translate" size={24} color={Colors.primary} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.cardTitle}>App Language / भाषा</Text>
            <Text style={styles.cardSub}>
              {language === 'en' ? 'Currently English • हिंदी में बदलने के लिए टैप करें' : 'वर्तमान: हिंदी • Tap to switch to English'}
            </Text>
          </View>
        </View>
        <View style={styles.switchBadge}>
          <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
          <Text style={styles.divider}>|</Text>
          <Text style={[styles.langText, language === 'hi' && styles.langTextActive]}>हिंदी</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Header / Pill style (Top Right Corner or Bar)
  return (
    <TouchableOpacity
      style={styles.headerBtn}
      onPress={toggleLanguage}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Current language: ${language === 'en' ? 'English' : 'Hindi'}. Tap to switch language.`}
    >
      <MaterialCommunityIcons name="translate" size={16} color={Colors.primary} />
      <View style={styles.pillSegmentContainer}>
        <View style={[styles.pillSegment, language === 'en' && styles.pillSegmentActive]}>
          <Text style={[styles.pillText, language === 'en' && styles.pillTextActive]}>
            EN
          </Text>
        </View>
        <Text style={styles.pillDivider}>|</Text>
        <View style={[styles.pillSegment, language === 'hi' && styles.pillSegmentActive]}>
          <Text style={[styles.pillText, language === 'hi' && styles.pillTextActive]}>
            हिन्दी
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginRight: 12,
    ...Shadows.small,
  },
  pillSegmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pillSegment: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pillSegmentActive: {
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pillDivider: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.border,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 12,
    ...Shadows.small,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  switchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  langText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  langTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  divider: {
    fontSize: 12,
    color: Colors.border,
  },
});

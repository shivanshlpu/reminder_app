/**
 * Tab Navigation Layout — Light Theme & Clean Mobile Structure
 */
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../constants/theme';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalGeofence } from '../../hooks/useGlobalGeofence';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageToggleButton } from '../../components/LanguageToggleButton';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 12);
  const tabBarHeight = 54 + bottomPadding;
  const { t } = useLanguage();

  // Initialize global GPS geofencing & proximity watcher across all tabs
  useGlobalGeofence();

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <LanguageToggleButton variant="header" />,
        headerStyle: {
          backgroundColor: Colors.surface,
          elevation: 0,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: Fonts.sizes.lg,
          color: Colors.text,
        },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: Fonts.sizes.xs,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_dashboard'),
          headerTitle: t('header_dashboard'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('tab_expenses'),
          headerTitle: t('header_expenses'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-multiple" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: t('tab_khata'),
          headerTitle: t('header_khata'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: t('tab_locations'),
          headerTitle: t('header_locations'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t('tab_contacts'),
          headerTitle: t('header_contacts'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tab_settings'),
          headerTitle: t('header_settings'),
          headerRight: () => <LanguageToggleButton variant="header" />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

/**
 * Locations & Message Rules Screen
 * - Interactive Pin-Point Map Selection (Leaflet OpenStreetMap)
 * - Custom Message Editor with Quick Templates for College, Hostel, Home, Gym, Library
 * - Per-Location 24-Hour Reset Timing (12:00 PM Home vs 12:00 AM College)
 * - Weekend / Active Days Selector (e.g. Exclude Sat & Sun for College)
 * - Per-Contact Custom Message Assignment & Gate Geofencing
 * - In-App Floating Toast Notifications for all actions
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FAB, Modal, Portal, TextInput, Button, Switch, Checkbox, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocations, PinnedLocation } from '../../hooks/useLocations';
import { useContacts, Contact } from '../../hooks/useContacts';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useAuth } from '../../contexts/AuthContext';
import { whatsappApi } from '../../services/whatsapp-api';
import {
  startGeofencing,
  GeofenceRegion,
  getTodayDateString,
  loadDailyTriggers,
  recordLocationTriggeredToday,
  resetLocationDailyTrigger,
  isLocationActiveOnDay,
  getLocationCycleKey,
} from '../../services/geofence';
import { MapPickerModal } from '../../components/MapPickerModal';
import { GeofenceRadarBanner } from '../../components/GeofenceRadarBanner';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

const ALL_DAYS = [
  { key: 'mon', label: 'Mon', full: 'Monday' },
  { key: 'tue', label: 'Tue', full: 'Tuesday' },
  { key: 'wed', label: 'Wed', full: 'Wednesday' },
  { key: 'thu', label: 'Thu', full: 'Thursday' },
  { key: 'fri', label: 'Fri', full: 'Friday' },
  { key: 'sat', label: 'Sat', full: 'Saturday' },
  { key: 'sun', label: 'Sun', full: 'Sunday' },
];

const RESET_TIME_OPTIONS = [
  { value: '12:00 PM', label: '☀️ 12:00 PM (Noon - Home)', desc: 'Resets at noon. Will NOT reset at midnight 12 AM while sleeping at home!' },
  { value: '12:00 AM', label: '🌙 12:00 AM (Midnight - College)', desc: 'Resets overnight for morning college arrivals' },
  { value: '06:00 AM', label: '🌅 06:00 AM (Morning)', desc: 'Resets early morning before heading out' },
];

const PRESET_TEMPLATES = [
  {
    label: '🎓 College Arrival',
    template: 'Hey, I have safely reached college for lectures at {time}.',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri'], // Weekdays only
    defaultReset: '12:00 AM',
  },
  {
    label: '🏠 Home Arrival',
    template: 'Reached home safely at {time}.',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    defaultReset: '12:00 PM', // 12 PM Noon reset
  },
  {
    label: '🏢 Hostel Room',
    template: 'Reached hostel room at {time}. Calling you shortly!',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    defaultReset: '12:00 PM',
  },
  {
    label: '🚪 Hostel Gate',
    template: 'Reached hostel main gate at {time}.',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    defaultReset: '12:00 PM',
  },
  {
    label: '🍽️ Cafeteria / Lunch',
    template: 'At college canteen having lunch at {time}.',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    defaultReset: '12:00 AM',
  },
  {
    label: '📚 Library Study',
    template: 'Reached library at {time} for study session.',
    defaultDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    defaultReset: '12:00 AM',
  },
];

export default function LocationsScreen() {
  const { locations, fetchLocations, addLocation, updateLocation, deleteLocation, assignContact, removeContactFromLocation, getLocationContacts } = useLocations();
  const { contacts, fetchContacts } = useContacts();
  const { db } = useDatabase();
  const { user } = useAuth();
  const { isWide } = useResponsiveLayout();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeLocation, setActiveLocation] = useState<PinnedLocation | null>(null);
  const [assignedContactsMap, setAssignedContactsMap] = useState<Record<number, boolean>>({});
  const [dailyTriggerMap, setDailyTriggerMap] = useState<Record<number, string>>({});

  const [editingLocId, setEditingLocId] = useState<number | null>(null);
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('10');
  const [messageTemplate, setMessageTemplate] = useState('Reached {location} at {time}.');
  const [selectedDays, setSelectedDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [resetTime, setResetTime] = useState('12:00 AM');

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [sendingAlertId, setSendingAlertId] = useState<number | null>(null);

  // Re-fetch automatically on tab focus
  useFocusEffect(
    useCallback(() => {
      fetchLocations(false);
      fetchContacts(false);
      loadDailyTriggers().then((map) => setDailyTriggerMap({ ...map }));
    }, [fetchLocations, fetchContacts])
  );

  useEffect(() => {
    async function syncAndStartGeofences() {
      if (!locations || locations.length === 0) return;

      const regions: GeofenceRegion[] = await Promise.all(
        locations.map(async (loc) => {
          let assigned = (await getLocationContacts(loc.id)) as Contact[];
          if (!assigned || assigned.length === 0) {
            assigned = contacts;
          }

          return {
            id: loc.id,
            name: loc.name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            radius: loc.radius || 10,
            autoSend: loc.auto_send === 1,
            messageTemplate: loc.message_template,
            activeDays: loc.active_days || 'mon,tue,wed,thu,fri,sat,sun',
            resetTime: loc.reset_time || '12:00 AM',
            contacts: (assigned || []).map((c) => ({
              phone: c.phone,
              isGroup: c.is_group === 1,
              name: c.name,
              contactId: c.id,
            })),
          };
        })
      );

      await startGeofencing(regions);
    }

    syncAndStartGeofences();
  }, [locations, contacts]);

  const getCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showMessage('Permission Denied', 'Location permission is required to pin your gate location.', 'error');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      setLatitude(loc.coords.latitude.toFixed(6));
      setLongitude(loc.coords.longitude.toFixed(6));
      showMessage('GPS Acquired', `Lat: ${loc.coords.latitude.toFixed(4)}, Lng: ${loc.coords.longitude.toFixed(4)}`, 'info');
    } catch (error) {
      showMessage('GPS Error', 'Failed to acquire current location', 'error');
    } finally {
      setGettingLocation(false);
    }
  };

  const openAddModal = (loc?: PinnedLocation) => {
    if (loc) {
      setEditingLocId(loc.id);
      setLocationName(loc.name);
      setLatitude(loc.latitude.toString());
      setLongitude(loc.longitude.toString());
      setRadius((loc.radius || 10).toString());
      setMessageTemplate(loc.message_template || 'Reached {location} at {time}.');
      const days = loc.active_days ? loc.active_days.split(',').map((d) => d.trim().toLowerCase()) : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      setSelectedDays(days);
      setResetTime(loc.reset_time || (loc.name.toLowerCase().includes('home') ? '12:00 PM' : '12:00 AM'));
    } else {
      setEditingLocId(null);
      setLocationName('');
      setLatitude('');
      setLongitude('');
      setRadius('10');
      setMessageTemplate('Reached {location} at {time}.');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      setResetTime('12:00 AM');
    }
    setShowAddModal(true);
  };

  const openMapStudio = async () => {
    setShowAddModal(false);
    if (!latitude || !longitude) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setLatitude(loc.coords.latitude.toFixed(6));
          setLongitude(loc.coords.longitude.toFixed(6));
        }
      } catch (e) {}
    }
    setShowMapPicker(true);
  };

  const handleMapPinSelected = (lat: number, lng: number, placeName?: string) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    if (placeName && placeName.trim()) {
      setLocationName(placeName.trim());
      if (placeName.toLowerCase().includes('home')) {
        setResetTime('12:00 PM');
      } else if (placeName.toLowerCase().includes('college')) {
        setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
        setResetTime('12:00 AM');
      }
    }
    setShowMapPicker(false);
    setShowAddModal(true);
    showMessage('Pin Point Selected', placeName ? `Marked "${placeName}"` : `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`, 'info');
  };

  const handleMapPickerDismiss = () => {
    setShowMapPicker(false);
    setShowAddModal(true);
  };

  const openAssignModal = async (loc: PinnedLocation) => {
    setActiveLocation(loc);
    const assigned = await getLocationContacts(loc.id);
    const map: Record<number, boolean> = {};
    (assigned as any[]).forEach((c) => {
      map[c.id] = true;
    });
    setAssignedContactsMap(map);
    setShowAssignModal(true);
  };

  const toggleContactAssignment = async (contactId: number) => {
    if (!activeLocation) return;
    const isAssigned = !!assignedContactsMap[contactId];
    if (isAssigned) {
      await removeContactFromLocation(activeLocation.id, contactId);
      setAssignedContactsMap((prev) => ({ ...prev, [contactId]: false }));
      showMessage('Contact Unassigned', 'Removed recipient from alert', 'info');
    } else {
      await assignContact(activeLocation.id, contactId);
      setAssignedContactsMap((prev) => ({ ...prev, [contactId]: true }));
      showMessage('Contact Assigned', 'Will receive alert upon gate arrival', 'whatsapp');
    }
  };

  const toggleDaySelection = (dayKey: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) {
          showMessage('Keep 1 Day', 'At least one active day is required.', 'info');
          return prev;
        }
        return prev.filter((d) => d !== dayKey);
      } else {
        return [...prev, dayKey];
      }
    });
  };

  const applyLocationPreset = (type: 'college' | 'home' | 'hostel' | 'office') => {
    if (type === 'college') {
      setLocationName('College Gate');
      setMessageTemplate('Hey, I have safely reached college for lectures at {time}.');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
      setResetTime('12:00 AM');
      showMessage('Preset Applied', 'College Gate (Weekdays only, 12 AM reset)', 'info');
    } else if (type === 'home') {
      setLocationName('Home');
      setMessageTemplate('Reached home safely at {time}.');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      setResetTime('12:00 PM');
      showMessage('Preset Applied', 'Home (All 7 Days, 12 PM Noon reset)', 'info');
    } else if (type === 'hostel') {
      setLocationName('Hostel Gate');
      setMessageTemplate('Reached hostel room at {time}. Calling you shortly!');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      setResetTime('12:00 PM');
      showMessage('Preset Applied', 'Hostel (All 7 Days, 12 PM reset)', 'info');
    } else if (type === 'office') {
      setLocationName('Office');
      setMessageTemplate('Reached office safely at {time}.');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
      setResetTime('12:00 AM');
      showMessage('Preset Applied', 'Office (Weekdays only, 12 AM reset)', 'info');
    }
  };

  const applyPresetTemplate = (item: typeof PRESET_TEMPLATES[0]) => {
    setMessageTemplate(item.template);
    if (item.defaultDays) {
      setSelectedDays(item.defaultDays);
    }
    if (item.defaultReset) {
      setResetTime(item.defaultReset);
    }
    if (!locationName || locationName === 'Hostel Gate' || locationName === 'College' || locationName === 'Home') {
      if (item.label.includes('College')) setLocationName('College Gate');
      else if (item.label.includes('Home')) setLocationName('Home');
      else if (item.label.includes('Hostel')) setLocationName('Hostel Gate');
    }
    showMessage('Template Selected', `Applied preset: ${item.label}`, 'info');
  };

  const handleSave = async () => {
    const trimmedName = locationName.trim();
    if (!trimmedName) {
      showMessage('Missing Name', 'Please enter a location name (e.g. "Hostel Gate", "College", "Home")', 'error');
      return;
    }
    const lat = parseFloat(latitude) || 28.6139;
    const lng = parseFloat(longitude) || 77.2090;
    const daysStr = selectedDays.join(',');
    const resetTimeStr = resetTime || '12:00 AM';

    setSaving(true);
    try {
      if (editingLocId) {
        await updateLocation(
          editingLocId,
          trimmedName,
          parseInt(radius) || 10,
          true,
          messageTemplate,
          daysStr,
          resetTimeStr
        );
        showMessage('Location Updated', `Saved "${trimmedName}" (Resets ${resetTimeStr})`, 'success');
      } else {
        await addLocation(
          trimmedName,
          lat,
          lng,
          parseInt(radius) || 10,
          messageTemplate,
          daysStr,
          resetTimeStr
        );
        showMessage('Location Pinned', `Pinned "${trimmedName}" with ${selectedDays.length} active day(s)`, 'success');
      }
      setShowAddModal(false);
    } catch (error: any) {
      showMessage('Error', error?.message || 'Failed to save location', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    confirmAction('Delete Location', `Remove "${name}" from pinned locations?`, async () => {
      await deleteLocation(id);
      showMessage('Location Removed', `"${name}" deleted`, 'info');
    });
  };

  const toggleAutoSend = async (loc: PinnedLocation) => {
    const nextState = loc.auto_send === 0;
    await updateLocation(
      loc.id,
      loc.name,
      loc.radius,
      nextState,
      loc.message_template,
      loc.active_days || 'mon,tue,wed,thu,fri,sat,sun',
      loc.reset_time || '12:00 AM'
    );
    showMessage(
      nextState ? 'Auto-Send Enabled' : 'Auto-Send Disabled',
      nextState ? `Will auto-send WhatsApp alert upon entering ${loc.name}` : `Auto-alert turned off for ${loc.name}`,
      nextState ? 'whatsapp' : 'info'
    );
  };

  const handleSendAlertNow = async (loc: PinnedLocation) => {
    setSendingAlertId(loc.id);
    try {
      let targetContacts = (await getLocationContacts(loc.id)) as Contact[];
      if (!targetContacts || targetContacts.length === 0) {
        targetContacts = contacts;
      }

      if (!targetContacts || targetContacts.length === 0) {
        showMessage(
          'No Contacts Found',
          'Please add at least one WhatsApp contact in the Contacts tab first.',
          'error'
        );
        setSendingAlertId(null);
        return;
      }

      const recipients = targetContacts.map((c) => ({
        phone: c.is_group && c.group_id ? c.group_id : c.phone,
        isGroup: c.is_group === 1,
      }));

      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const messageText = (loc.message_template || 'Reached {location} at {time}.')
        .replace(/{location}/g, loc.name)
        .replace(/{time}/g, timeStr)
        .replace(/{date}/g, dateStr);

      const result = await whatsappApi.sendMessage(recipients, loc.name, undefined, messageText);

      if (result && result.results) {
        const successful = result.results.filter((r) => r.success).length;

        if (db && user) {
          for (const c of targetContacts) {
            await db.runAsync(
              'INSERT INTO message_logs (user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [user.uid, loc.id, c.id, loc.name, c.name, c.phone, messageText, 'sent']
            );
          }
        }

        await recordLocationTriggeredToday(loc.id, loc.reset_time);
        const updated = await loadDailyTriggers();
        setDailyTriggerMap({ ...updated });

        showMessage(
          'WhatsApp Alert Sent!',
          `Delivered to ${successful} recipient(s): "${messageText}"`,
          'whatsapp'
        );
      } else {
        await recordLocationTriggeredToday(loc.id, loc.reset_time);
        const updated = await loadDailyTriggers();
        setDailyTriggerMap({ ...updated });
        showMessage('Alert Dispatched', 'Message queued to WhatsApp service', 'info');
      }
    } catch (error: any) {
      showMessage('Send Failed', error?.message || 'Check WhatsApp connection in Settings', 'error');
    } finally {
      setSendingAlertId(null);
    }
  };

  const handleResetDailyTrigger = async (loc: PinnedLocation) => {
    await resetLocationDailyTrigger(loc.id);
    const updated = await loadDailyTriggers();
    setDailyTriggerMap({ ...updated });
    showMessage('Alert Cycle Reset', `"${loc.name}" can auto-trigger once more in this cycle`, 'info');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLocations();
    await fetchContacts();
    const triggers = await loadDailyTriggers();
    setDailyTriggerMap({ ...triggers });
    setRefreshing(false);
  };

  const insertPlaceholder = (tag: string) => {
    setMessageTemplate((prev) => `${prev} ${tag}`);
  };

  const formatDaysSummary = (activeDaysStr?: string) => {
    if (!activeDaysStr) return 'All 7 Days';
    const days = activeDaysStr.split(',').map((d) => d.trim().toLowerCase());
    if (days.length === 7) return 'All 7 Days';
    if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
      return 'Mon–Fri (No Weekends)';
    }
    if (days.length === 2 && days.includes('sat') && days.includes('sun')) {
      return 'Weekends Only';
    }
    return days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
  };

  const renderLocationCard = (item: PinnedLocation) => {
    const cycleKey = getLocationCycleKey(item.reset_time);
    const isTriggeredInCycle = dailyTriggerMap[item.id] === cycleKey;
    const isActiveToday = isLocationActiveOnDay(item.active_days);
    const daysSummary = formatDaysSummary(item.active_days);

    return (
      <View key={item.id} style={[styles.locationCard, isWide && styles.locationCardDesktop]}>
        <View style={styles.locationHeader}>
          <View style={styles.locationIconWrap}>
            <MaterialCommunityIcons
              name={item.name.toLowerCase().includes('home') ? 'home-map-marker' : 'map-marker-radius'}
              size={24}
              color={Colors.secondary}
            />
          </View>
          <View style={styles.locationInfo}>
            <Text style={styles.locationName}>{item.name}</Text>
            <Text style={styles.locationCoords}>
              📍 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} • {item.radius || 10}m Gate Radius
            </Text>
          </View>
          <TouchableOpacity onPress={() => openAddModal(item)} style={styles.editBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteBtn}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Configuration Summary Pills */}
        <View style={styles.configPillsRow}>
          <View style={styles.configPill}>
            <MaterialCommunityIcons name="calendar-week" size={13} color={Colors.secondary} />
            <Text style={styles.configPillText}>{daysSummary}</Text>
          </View>
          <View style={styles.configPill}>
            <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.secondary} />
            <Text style={styles.configPillText}>Resets {item.reset_time || '12:00 AM'}</Text>
          </View>
        </View>

        {/* Cycle & Day Trigger Status Indicator */}
        <View style={styles.dailyStatusRow}>
          <View
            style={[
              styles.dailyStatusBadge,
              !isActiveToday
                ? styles.dailyStatusBadgeInactive
                : isTriggeredInCycle
                ? styles.dailyStatusBadgeSent
                : styles.dailyStatusBadgeReady,
            ]}
          >
            <MaterialCommunityIcons
              name={!isActiveToday ? 'pause-circle-outline' : isTriggeredInCycle ? 'check-decagram' : 'clock-check-outline'}
              size={14}
              color={!isActiveToday ? '#B45309' : isTriggeredInCycle ? Colors.success : Colors.secondary}
            />
            <Text
              style={[
                styles.dailyStatusText,
                !isActiveToday
                  ? { color: '#B45309' }
                  : isTriggeredInCycle
                  ? { color: Colors.success }
                  : { color: Colors.secondary },
              ]}
            >
              {!isActiveToday
                ? 'Inactive Today (Weekend / Off-day)'
                : isTriggeredInCycle
                ? 'Sent in this 24h Cycle (1/1 Done)'
                : '24h Cycle Ready (0/1 Auto-Alert)'}
            </Text>
          </View>
          {isTriggeredInCycle && (
            <TouchableOpacity onPress={() => handleResetDailyTrigger(item)} style={styles.resetDailyBtn}>
              <MaterialCommunityIcons name="refresh" size={13} color={Colors.textSecondary} />
              <Text style={styles.resetDailyText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.locationFooter}>
          <TouchableOpacity style={styles.contactBadge} onPress={() => openAssignModal(item)}>
            <MaterialCommunityIcons name="account-group-outline" size={16} color={Colors.secondary} />
            <Text style={styles.contactCount}>
              {item.contact_count || 0} assigned • <Text style={{ color: Colors.secondary, fontWeight: '700' }}>Manage</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.autoSendRow}>
            <Text style={styles.autoSendLabel}>Auto-send</Text>
            <Switch
              value={item.auto_send === 1}
              onValueChange={() => toggleAutoSend(item)}
              color={Colors.secondary}
            />
          </View>
        </View>

        <View style={styles.templateBox}>
          <Text style={styles.templateHeader}>Custom WhatsApp Message:</Text>
          <Text style={styles.templateText} numberOfLines={3}>
            "{item.message_template}"
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Button
            mode="contained"
            icon="send"
            buttonColor={Colors.secondary}
            textColor="#FFFFFF"
            loading={sendingAlertId === item.id}
            disabled={sendingAlertId === item.id}
            onPress={() => handleSendAlertNow(item)}
            style={styles.sendAlertBtn}
            labelStyle={{ fontSize: 13, fontWeight: '700' }}
          >
            Send "{item.name}" Alert Now
          </Button>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} colors={[Colors.secondary]} />}
      >
        {/* Live GPS Proximity Radar & Auto-Dispatch Status */}
        <GeofenceRadarBanner />

        {locations.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-marker-plus-outline" size={54} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No locations pinned</Text>
            <Text style={styles.emptySubtext}>
              Pin your College, Home, or Hostel with 10-meter gate precision, custom active days, and 24-hour reset cycles.
            </Text>
            <Button mode="contained" buttonColor={Colors.secondary} onPress={() => openAddModal()} style={{ marginTop: Spacing.md }}>
              + Pin "College Gate" / "Home"
            </Button>
          </View>
        ) : (
          <View style={isWide ? styles.gridDesktop : undefined}>
            {locations.map(renderLocationCard)}
          </View>
        )}
      </ScrollView>

      <FAB icon="plus" style={styles.fab} onPress={() => openAddModal()} color="#FFFFFF" customSize={56} />

      {/* Interactive Map Pin-Point Studio */}
      <MapPickerModal
        visible={showMapPicker}
        onDismiss={handleMapPickerDismiss}
        onSelectLocation={handleMapPinSelected}
        initialLat={latitude ? parseFloat(latitude) : undefined}
        initialLng={longitude ? parseFloat(longitude) : undefined}
        initialName={locationName}
        radius={parseInt(radius) || 10}
      />

      {/* Add / Edit Location & Custom Message Rules Modal */}
      <Portal>
        <Modal
          visible={showAddModal}
          onDismiss={() => setShowAddModal(false)}
          contentContainerStyle={styles.addLocationModalContainer}
        >
          <View style={styles.modalBox}>
            {/* 1. Sticky Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingLocId ? 'Edit Geofence & Rules' : 'Pin New Gate Location'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Configure 10-meter gate radar & auto-WhatsApp alerts
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 2. Scrollable Form Content */}
            <ScrollView
              style={styles.modalScrollBody}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* STEP 1: Location Name */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="tag-outline" size={18} color={Colors.secondary} />
                  <Text style={styles.sectionTitle}>1. Location Name & Preset</Text>
                </View>

                {/* Quick Presets */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetNameScroll}>
                  <TouchableOpacity
                    style={[styles.presetChip, locationName.toLowerCase().includes('college') && styles.presetChipActive]}
                    onPress={() => applyLocationPreset('college')}
                  >
                    <Text style={[styles.presetChipText, locationName.toLowerCase().includes('college') && styles.presetChipTextActive]}>
                      🎓 College Gate
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetChip, locationName.toLowerCase().includes('home') && styles.presetChipActive]}
                    onPress={() => applyLocationPreset('home')}
                  >
                    <Text style={[styles.presetChipText, locationName.toLowerCase().includes('home') && styles.presetChipTextActive]}>
                      🏠 Home
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetChip, (locationName.toLowerCase().includes('hostel') || locationName.toLowerCase().includes('pg')) && styles.presetChipActive]}
                    onPress={() => applyLocationPreset('hostel')}
                  >
                    <Text style={[styles.presetChipText, (locationName.toLowerCase().includes('hostel') || locationName.toLowerCase().includes('pg')) && styles.presetChipTextActive]}>
                      🏢 Hostel / PG
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetChip, locationName.toLowerCase().includes('office') && styles.presetChipActive]}
                    onPress={() => applyLocationPreset('office')}
                  >
                    <Text style={[styles.presetChipText, locationName.toLowerCase().includes('office') && styles.presetChipTextActive]}>
                      💼 Office
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                <TextInput
                  label="Location Name / Label *"
                  value={locationName}
                  onChangeText={setLocationName}
                  mode="outlined"
                  placeholder='e.g. "College Gate", "Home", "Hostel Gate"'
                  left={<TextInput.Icon icon="map-marker-outline" color={Colors.secondary} />}
                  style={styles.modalInput}
                  outlineColor={Colors.border}
                  activeOutlineColor={Colors.secondary}
                  textColor={Colors.text}
                  theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                />
              </View>

              {/* STEP 2: GPS Gate Coordinates & Radius */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={18} color={Colors.secondary} />
                  <Text style={styles.sectionTitle}>2. GPS Coordinates & Gate Radius</Text>
                </View>

                <View style={styles.mapButtonsRow}>
                  <Button
                    mode="contained"
                    onPress={openMapStudio}
                    icon="map-search"
                    buttonColor={Colors.secondary}
                    textColor="#FFFFFF"
                    style={[styles.pickerBtn, { flex: 1.2 }]}
                  >
                    Pick on Map 🗺️
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={getCurrentLocation}
                    loading={gettingLocation}
                    icon="crosshairs-gps"
                    style={[styles.pickerBtn, { flex: 1 }]}
                    textColor={Colors.secondary}
                  >
                    Current GPS
                  </Button>
                </View>

                <View style={styles.coordRow}>
                  <TextInput
                    label="Latitude *"
                    value={latitude}
                    onChangeText={setLatitude}
                    mode="outlined"
                    placeholder="e.g. 28.6139"
                    keyboardType="decimal-pad"
                    style={[styles.modalInput, { flex: 1 }]}
                    outlineColor={Colors.border}
                    activeOutlineColor={Colors.secondary}
                    textColor={Colors.text}
                    theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                  />
                  <TextInput
                    label="Longitude *"
                    value={longitude}
                    onChangeText={setLongitude}
                    mode="outlined"
                    placeholder="e.g. 77.2090"
                    keyboardType="decimal-pad"
                    style={[styles.modalInput, { flex: 1 }]}
                    outlineColor={Colors.border}
                    activeOutlineColor={Colors.secondary}
                    textColor={Colors.text}
                    theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                  />
                  <TextInput
                    label="Radius (m)"
                    value={radius}
                    onChangeText={setRadius}
                    mode="outlined"
                    keyboardType="number-pad"
                    style={[styles.modalInput, { width: 95 }]}
                    outlineColor={Colors.border}
                    activeOutlineColor={Colors.secondary}
                    textColor={Colors.text}
                    theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                  />
                </View>
              </View>

              {/* STEP 3: WhatsApp Message Content */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="whatsapp" size={18} color={Colors.secondary} />
                  <Text style={styles.sectionTitle}>3. WhatsApp Message Content</Text>
                </View>
                <Text style={styles.sectionSubtext}>Choose a quick message preset or customize:</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateChipsScroll}>
                  {PRESET_TEMPLATES.map((item, idx) => (
                    <Chip
                      key={idx}
                      mode="outlined"
                      onPress={() => applyPresetTemplate(item)}
                      style={styles.templateChip}
                      textStyle={{ fontSize: 11, fontWeight: '600' }}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </ScrollView>

                <TextInput
                  label="WhatsApp Message to Send *"
                  value={messageTemplate}
                  onChangeText={setMessageTemplate}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  left={<TextInput.Icon icon="message-text-outline" color={Colors.secondary} />}
                  style={styles.modalInput}
                  outlineColor={Colors.border}
                  activeOutlineColor={Colors.secondary}
                  textColor={Colors.text}
                  theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                />

                <View style={styles.tagsRow}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Insert tag:</Text>
                  <TouchableOpacity onPress={() => insertPlaceholder('{location}')} style={styles.tagBadge}>
                    <Text style={styles.tagText}>{'{location}'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertPlaceholder('{time}')} style={styles.tagBadge}>
                    <Text style={styles.tagText}>{'{time}'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertPlaceholder('{date}')} style={styles.tagBadge}>
                    <Text style={styles.tagText}>{'{date}'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* STEP 4: Active Days & 24h Reset Schedule */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="calendar-clock" size={18} color={Colors.secondary} />
                  <Text style={styles.sectionTitle}>4. Active Days & Reset Schedule</Text>
                </View>

                {/* Active Days */}
                <View style={styles.subSectionBox}>
                  <View style={styles.sectionHeaderRow}>
                    <MaterialCommunityIcons name="calendar-check" size={16} color={Colors.secondary} />
                    <Text style={styles.subSectionTitle}>Active Days (When Messages Can Send):</Text>
                  </View>
                  <Text style={styles.sectionSubtext}>
                    Uncheck Saturday & Sunday for College so messages won't send on weekends.
                  </Text>

                  <View style={styles.quickDayRow}>
                    <TouchableOpacity
                      style={[styles.quickDayBtn, selectedDays.length === 5 && !selectedDays.includes('sat') && !selectedDays.includes('sun') && styles.quickDayBtnActive]}
                      onPress={() => setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri'])}
                    >
                      <Text style={[styles.quickDayBtnText, selectedDays.length === 5 && !selectedDays.includes('sat') && !selectedDays.includes('sun') && styles.quickDayBtnTextActive]}>
                        💼 Weekdays Only (Mon-Fri)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickDayBtn, selectedDays.length === 7 && styles.quickDayBtnActive]}
                      onPress={() => setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])}
                    >
                      <Text style={[styles.quickDayBtnText, selectedDays.length === 7 && styles.quickDayBtnTextActive]}>
                        🌟 All 7 Days
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.daysChipsGrid}>
                    {ALL_DAYS.map((d) => {
                      const isSelected = selectedDays.includes(d.key);
                      const isWeekend = d.key === 'sat' || d.key === 'sun';
                      return (
                        <TouchableOpacity
                          key={d.key}
                          style={[
                            styles.dayChip,
                            isSelected ? styles.dayChipSelected : styles.dayChipUnselected,
                            isWeekend && isSelected ? styles.dayChipWeekend : undefined,
                          ]}
                          onPress={() => toggleDaySelection(d.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dayChipText, isSelected ? styles.dayChipTextSelected : styles.dayChipTextUnselected]}>
                            {d.label}
                          </Text>
                          {isSelected && (
                            <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" style={{ marginLeft: 2 }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 24-Hour Reset Schedule */}
                <View style={[styles.subSectionBox, { marginTop: Spacing.sm }]}>
                  <View style={styles.sectionHeaderRow}>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.subSectionTitle}>24-Hour Reset Schedule:</Text>
                  </View>
                  <Text style={styles.sectionSubtext}>
                    Set Home to 12:00 PM (Noon) so it won't reset at 12:00 AM midnight while you are at home!
                  </Text>

                  <View style={styles.resetOptionsContainer}>
                    {RESET_TIME_OPTIONS.map((opt) => {
                      const isSelected = resetTime === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.resetOptionCard, isSelected && styles.resetOptionCardSelected]}
                          onPress={() => setResetTime(opt.value)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.resetOptionHeader}>
                            <MaterialCommunityIcons
                              name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                              size={18}
                              color={isSelected ? Colors.secondary : Colors.textMuted}
                            />
                            <Text style={[styles.resetOptionLabel, isSelected && styles.resetOptionLabelSelected]}>
                              {opt.label}
                            </Text>
                          </View>
                          <Text style={styles.resetOptionDesc}>{opt.desc}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* 3. Sticky Footer */}
            <View style={styles.modalFooter}>
              <Button
                mode="outlined"
                onPress={() => setShowAddModal(false)}
                textColor={Colors.textSecondary}
                style={styles.footerBtn}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                buttonColor={Colors.secondary}
                style={[styles.footerBtn, { flex: 1.4 }]}
                labelStyle={{ fontWeight: '700' }}
              >
                {editingLocId ? 'Update Location' : 'Save & Pin Gate'}
              </Button>
            </View>
          </View>
        </Modal>

        {/* Assign Contacts Modal */}
        <Modal visible={showAssignModal} onDismiss={() => setShowAssignModal(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalTitle}>Assign Contacts to "{activeLocation?.name}"</Text>
          <Text style={styles.modalSubtitle}>Select which contacts will receive the message upon gate entry:</Text>

          <ScrollView style={{ maxHeight: 240, marginVertical: Spacing.md }}>
            {contacts.length === 0 ? (
              <Text style={{ color: Colors.textMuted, textAlign: 'center', padding: Spacing.md }}>
                No saved contacts found. Add contacts in the Contacts tab.
              </Text>
            ) : (
              contacts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.contactCheckRow}
                  onPress={() => toggleContactAssignment(c.id)}
                >
                  <Checkbox
                    status={assignedContactsMap[c.id] ? 'checked' : 'unchecked'}
                    color={Colors.secondary}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.contactRowName}>{c.name}</Text>
                    <Text style={styles.contactRowPhone}>+{c.phone}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <Button mode="contained" onPress={() => setShowAssignModal(false)} buttonColor={Colors.secondary} style={{ borderRadius: BorderRadius.md }}>
            Done
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.lg, paddingBottom: 100 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  locationCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
    ...Shadows.small,
  },
  locationCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  locationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  locationIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.secondaryBg,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  locationInfo: { flex: 1 },
  locationName: { fontSize: Fonts.sizes.lg, fontWeight: '700', color: Colors.text },
  locationCoords: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  editBtn: { padding: 6, marginRight: 2 },
  deleteBtn: { padding: 6 },
  configPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  configPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  configPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dailyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingVertical: 2,
  },
  dailyStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  dailyStatusBadgeSent: {
    backgroundColor: '#DCFCE7', // light green tint
  },
  dailyStatusBadgeReady: {
    backgroundColor: Colors.secondaryBg,
  },
  dailyStatusBadgeInactive: {
    backgroundColor: '#FEF3C7', // light amber
  },
  dailyStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resetDailyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
  },
  resetDailyText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  locationFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  contactBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  contactCount: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: '500' },
  autoSendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  autoSendLabel: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: '600' },
  templateBox: { backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.md, marginTop: 4, marginBottom: Spacing.md },
  templateHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  templateText: { fontSize: Fonts.sizes.xs, color: Colors.text, fontStyle: 'italic' },
  actionRow: { marginTop: 4 },
  sendAlertBtn: { borderRadius: BorderRadius.md },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: Fonts.sizes.lg, color: Colors.text, fontWeight: '700' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xxl },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, backgroundColor: Colors.secondary, borderRadius: 28, ...Shadows.large },
  
  // Structured Add/Edit Location Modal Styles
  addLocationModalContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalBox: {
    backgroundColor: Colors.surface,
    width: '100%',
    maxWidth: 580,
    maxHeight: '92%',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: Fonts.sizes.lg, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  modalCloseBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
  },
  modalScrollBody: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardSection: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.small,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '800',
    color: Colors.text,
  },
  subSectionBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  presetNameScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginRight: 6,
  },
  presetChipActive: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryBg,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  presetChipTextActive: {
    color: Colors.secondary,
    fontWeight: '700',
  },
  modalInput: { backgroundColor: Colors.surface, marginBottom: Spacing.xs, marginTop: Spacing.xs },
  mapButtonsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs, marginBottom: Spacing.xs },
  pickerBtn: { borderRadius: BorderRadius.md },
  coordRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  sectionDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: Colors.text },
  sectionSubtext: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.xs },
  quickDayRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs, marginTop: Spacing.xs },
  quickDayBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  quickDayBtnActive: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryBg,
  },
  quickDayBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  quickDayBtnTextActive: {
    color: Colors.secondary,
  },
  daysChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  dayChipSelected: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  dayChipWeekend: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  dayChipUnselected: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  dayChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayChipTextSelected: {
    color: '#FFFFFF',
  },
  dayChipTextUnselected: {
    color: Colors.textSecondary,
  },
  resetOptionsContainer: {
    gap: 6,
    marginTop: Spacing.xs,
  },
  resetOptionCard: {
    padding: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  resetOptionCardSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryBg,
  },
  resetOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  resetOptionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.text,
  },
  resetOptionLabelSelected: {
    color: Colors.secondary,
  },
  resetOptionDesc: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: 24,
  },
  templatesLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.xs },
  templateChipsScroll: { flexDirection: 'row', marginBottom: Spacing.xs, marginTop: Spacing.xs },
  templateChip: { marginRight: Spacing.xs, backgroundColor: Colors.background },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  tagBadge: { backgroundColor: Colors.secondaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 11, color: Colors.secondary, fontWeight: '700' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  footerBtn: {
    borderRadius: BorderRadius.md,
  },
  
  // Generic Modal (Assign Contacts)
  modal: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    maxWidth: 520,
    maxHeight: '88%',
    alignSelf: 'center',
    width: '92%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  contactCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  contactRowName: { fontSize: Fonts.sizes.md, fontWeight: '600', color: Colors.text },
  contactRowPhone: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
});

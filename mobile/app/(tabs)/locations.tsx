/**
 * Locations & Message Rules Screen
 * - Interactive Pin-Point Map Selection (Leaflet OpenStreetMap)
 * - Custom Message Editor with Quick Templates for College, Hostel, Home, Gym, Library
 * - Per-Contact Custom Message Assignment & 10m Gate Geofencing
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
} from '../../services/geofence';
import { MapPickerModal } from '../../components/MapPickerModal';
import { GeofenceRadarBanner } from '../../components/GeofenceRadarBanner';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

const PRESET_TEMPLATES = [
  { label: '🎓 College Arrival', template: 'Hey, I have safely reached college for morning lectures at {time}.' },
  { label: '🏢 Hostel Room', template: 'Reached hostel room at {time}. Calling you shortly!' },
  { label: '🚪 Hostel Gate', template: 'Reached hostel main gate at {time}.' },
  { label: '🏠 Home Arrival', template: 'Reached home safely at {time}.' },
  { label: '🍽️ Cafeteria / Lunch', template: 'At college canteen having lunch at {time}.' },
  { label: '📚 Library Study', template: 'Reached library at {time} for study session.' },
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
    } else {
      setEditingLocId(null);
      setLocationName('');
      setLatitude('');
      setLongitude('');
      setRadius('10');
      setMessageTemplate('Reached {location} at {time}.');
    }
    setShowAddModal(true);
  };

  const openMapStudio = () => {
    setShowAddModal(false);
    setShowMapPicker(true);
  };

  const handleMapPinSelected = (lat: number, lng: number, placeName?: string) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    if (placeName && placeName.trim()) {
      setLocationName(placeName.trim());
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

  const handleSave = async () => {
    const trimmedName = locationName.trim();
    if (!trimmedName) {
      showMessage('Missing Name', 'Please enter a location name (e.g. "Hostel Gate", "College")', 'error');
      return;
    }
    const lat = parseFloat(latitude) || 28.6139;
    const lng = parseFloat(longitude) || 77.2090;

    setSaving(true);
    try {
      if (editingLocId) {
        await updateLocation(editingLocId, trimmedName, parseInt(radius) || 10, true, messageTemplate);
        showMessage('Location Updated', `Saved "${trimmedName}" with ${radius}m gate radius`, 'success');
      } else {
        await addLocation(trimmedName, lat, lng, parseInt(radius) || 10, messageTemplate);
        showMessage('Location Pinned', `Pinned "${trimmedName}" with 10m gate precision`, 'success');
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
      loc.message_template
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

        await recordLocationTriggeredToday(loc.id);
        const updated = await loadDailyTriggers();
        setDailyTriggerMap({ ...updated });

        showMessage(
          'WhatsApp Alert Sent!',
          `Delivered to ${successful} recipient(s): "${messageText}"`,
          'whatsapp'
        );
      } else {
        await recordLocationTriggeredToday(loc.id);
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
    showMessage('Daily Alert Reset', `"${loc.name}" can auto-trigger once more today`, 'info');
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

  const renderLocationCard = (item: PinnedLocation) => {
    const isTriggeredToday = dailyTriggerMap[item.id] === getTodayDateString();

    return (
      <View key={item.id} style={[styles.locationCard, isWide && styles.locationCardDesktop]}>
        <View style={styles.locationHeader}>
          <View style={styles.locationIconWrap}>
            <MaterialCommunityIcons name="map-marker-radius" size={24} color={Colors.secondary} />
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

        {/* 1-Per-Day Trigger Status Indicator */}
        <View style={styles.dailyStatusRow}>
          <View style={[styles.dailyStatusBadge, isTriggeredToday ? styles.dailyStatusBadgeSent : styles.dailyStatusBadgeReady]}>
            <MaterialCommunityIcons
              name={isTriggeredToday ? "check-decagram" : "clock-check-outline"}
              size={14}
              color={isTriggeredToday ? Colors.success : Colors.secondary}
            />
            <Text style={[styles.dailyStatusText, isTriggeredToday ? { color: Colors.success } : { color: Colors.secondary }]}>
              {isTriggeredToday ? 'Sent Today (1/1 Auto-Alert Done)' : '1-Per-Day Ready (0/1 Auto-Alert)'}
            </Text>
          </View>
          {isTriggeredToday && (
            <TouchableOpacity onPress={() => handleResetDailyTrigger(item)} style={styles.resetDailyBtn}>
              <MaterialCommunityIcons name="refresh" size={13} color={Colors.textSecondary} />
              <Text style={styles.resetDailyText}>Reset Today</Text>
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
            <Text style={styles.emptySubtext}>Pin your Hostel, College, or Home with 10-meter gate precision to auto-send customized WhatsApp messages</Text>
            <Button mode="contained" buttonColor={Colors.secondary} onPress={() => openAddModal()} style={{ marginTop: Spacing.md }}>
              + Pin "Hostel Gate" (10m)
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
        initialLat={parseFloat(latitude) || 28.6139}
        initialLng={parseFloat(longitude) || 77.2090}
        initialName={locationName}
        radius={parseInt(radius) || 10}
      />

      {/* Add / Edit Location & Custom Message Rules Modal */}
      <Portal>
        <Modal visible={showAddModal} onDismiss={() => setShowAddModal(false)} contentContainerStyle={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingLocId ? 'Edit Location & Message' : 'Pin Location & Set Custom Message'}
              </Text>

              <TextInput
                label="Location Name / Label"
                value={locationName}
                onChangeText={setLocationName}
                mode="outlined"
                placeholder='e.g. "Hostel Gate", "College Campus", "Home"'
                left={<TextInput.Icon icon="map-marker-outline" color={Colors.textSecondary} />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              {/* Map and GPS Buttons Row */}
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
                  label="Latitude"
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
                  label="Longitude"
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
                  style={[styles.modalInput, { width: 90 }]}
                  outlineColor={Colors.border}
                  activeOutlineColor={Colors.secondary}
                  textColor={Colors.text}
                  theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                />
              </View>

              {/* Quick Message Templates Section */}
              <Text style={styles.templatesLabel}>Choose or Customize Message Template:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateChipsScroll}>
                {PRESET_TEMPLATES.map((item, idx) => (
                  <Chip
                    key={idx}
                    mode="outlined"
                    onPress={() => setMessageTemplate(item.template)}
                    style={styles.templateChip}
                    textStyle={{ fontSize: 11, fontWeight: '600' }}
                  >
                    {item.label}
                  </Chip>
                ))}
              </ScrollView>

              {/* Custom Message Editor */}
              <TextInput
                label="WhatsApp Message to Send"
                value={messageTemplate}
                onChangeText={setMessageTemplate}
                mode="outlined"
                multiline
                numberOfLines={3}
                left={<TextInput.Icon icon="message-text-outline" color={Colors.textSecondary} />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              {/* Variable Placeholders */}
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

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setShowAddModal(false)} textColor={Colors.textSecondary} style={styles.modalBtn}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} buttonColor={Colors.secondary} style={styles.modalBtn}>
                  {editingLocId ? 'Update Location & Message' : 'Pin Location & Save'}
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
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
  locationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
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
  modal: { backgroundColor: Colors.surface, margin: Spacing.md, maxWidth: 580, maxHeight: '85%', alignSelf: 'center', width: '92%', borderRadius: BorderRadius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.md },
  modalSubtitle: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  contactCheckRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  contactRowName: { fontSize: Fonts.sizes.md, fontWeight: '600', color: Colors.text },
  contactRowPhone: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  modalInput: { backgroundColor: Colors.surface, marginBottom: Spacing.md },
  mapButtonsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  pickerBtn: { borderRadius: BorderRadius.md },
  coordRow: { flexDirection: 'row', gap: Spacing.sm },
  templatesLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.xs },
  templateChipsScroll: { flexDirection: 'row', marginBottom: Spacing.md },
  templateChip: { marginRight: Spacing.xs, backgroundColor: Colors.background },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md, marginTop: -Spacing.xs },
  tagBadge: { backgroundColor: Colors.secondaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 11, color: Colors.secondary, fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md },
  modalBtn: { borderRadius: BorderRadius.md },
});

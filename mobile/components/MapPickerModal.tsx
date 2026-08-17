/**
 * Full-Focus Interactive Map Pin-Point Picker
 * Allows clicking/tapping on a live interactive map (OpenStreetMap / Leaflet) to drop a pin,
 * search places, mark as College/Hostel/Home/Cafe, adjust gate radius, and capture precise GPS.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Modal, Portal, TextInput, Button, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

interface MapPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectLocation: (lat: number, lng: number, placeName?: string) => void;
  initialLat?: number;
  initialLng?: number;
  initialName?: string;
  radius?: number;
}

const PLACE_TAGS = [
  { label: '🏢 Hostel Room', name: 'Hostel Room' },
  { label: '🚪 Hostel Gate', name: 'Hostel Gate' },
  { label: '🎓 College Gate', name: 'College Main Gate' },
  { label: '🏫 College Campus', name: 'College Campus' },
  { label: '🏠 Home', name: 'Home' },
  { label: '📚 Library', name: 'Library' },
  { label: '🍽️ Cafeteria', name: 'Cafeteria' },
];

export function MapPickerModal({
  visible,
  onDismiss,
  onSelectLocation,
  initialLat = 28.6139,
  initialLng = 77.2090,
  initialName = '',
  radius = 10,
}: MapPickerModalProps) {
  const [selectedLat, setSelectedLat] = useState(initialLat);
  const [selectedLng, setSelectedLng] = useState(initialLng);
  const [placeLabel, setPlaceLabel] = useState(initialName);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedLat(initialLat || 28.6139);
      setSelectedLng(initialLng || 77.2090);
      setPlaceLabel(initialName || '');
    }
  }, [visible, initialLat, initialLng, initialName]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.trim())}&limit=1`,
        { headers: { 'User-Agent': 'ExpenseTrackerReminderApp/1.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setSelectedLat(parseFloat(lat.toFixed(6)));
        setSelectedLng(parseFloat(lon.toFixed(6)));
        if (!placeLabel) {
          setPlaceLabel(data[0].display_name.split(',')[0]);
        }
      }
    } catch (e) {
      console.warn('Map search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirm = () => {
    onSelectLocation(selectedLat, selectedLng, placeLabel);
    onDismiss();
  };

  // Generate interactive Leaflet Map HTML embed
  const leafletMapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        #map { width: 100%; height: 100vh; }
        .pin-popup { font-weight: bold; font-size: 12px; color: #10B981; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var lat = ${selectedLat};
        var lng = ${selectedLng};
        var radius = ${radius};

        var map = L.map('map', { zoomControl: true }).setView([lat, lng], 17);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        var marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.bindPopup("<div class='pin-popup'>📍 Pin Location (Drag to Move)</div>").openPopup();

        var circle = L.circle([lat, lng], {
          color: '#10B981',
          fillColor: '#10B981',
          fillOpacity: 0.2,
          radius: radius
        }).addTo(map);

        function updateCoords(newLat, newLng) {
          lat = newLat;
          lng = newLng;
          marker.setLatLng([lat, lng]);
          circle.setLatLng([lat, lng]);
          window.parent.postMessage({ type: 'PIN_MOVED', lat: lat, lng: lng }, '*');
        }

        marker.on('dragend', function(e) {
          var position = marker.getLatLng();
          updateCoords(position.lat, position.lng);
        });

        map.on('click', function(e) {
          updateCoords(e.latlng.lat, e.latlng.lng);
        });
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'PIN_MOVED') {
          setSelectedLat(parseFloat(event.data.lat.toFixed(6)));
          setSelectedLng(parseFloat(event.data.lng.toFixed(6)));
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="map-marker-radius" size={24} color={Colors.secondary} />
            </View>
            <View>
              <Text style={styles.modalTitle}>Mark Pin Point on Map</Text>
              <Text style={styles.subtitle}>Click or drag pin to mark your Hotel, Hostel, College gate, or Room</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Quick Place Label Chips */}
        <View style={styles.tagsContainer}>
          <Text style={styles.tagsHeading}>Mark as:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll}>
            {PLACE_TAGS.map((tag, idx) => (
              <Chip
                key={idx}
                mode={placeLabel === tag.name ? 'flat' : 'outlined'}
                selected={placeLabel === tag.name}
                onPress={() => setPlaceLabel(tag.name)}
                style={[
                  styles.placeChip,
                  placeLabel === tag.name && { backgroundColor: Colors.secondaryBg, borderColor: Colors.secondary }
                ]}
                textStyle={{ fontSize: 11, fontWeight: '700', color: placeLabel === tag.name ? Colors.secondary : Colors.text }}
              >
                {tag.label}
              </Chip>
            ))}
          </ScrollView>
        </View>

        {/* Search Bar & Location Name */}
        <View style={styles.topControlRow}>
          <TextInput
            placeholder="Search landmark, campus, area..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            mode="outlined"
            dense
            style={styles.searchInput}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.secondary}
            textColor={Colors.text}
            left={<TextInput.Icon icon="magnify" color={Colors.textSecondary} />}
            theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
          />
          <Button
            mode="contained"
            buttonColor={Colors.secondary}
            textColor="#FFFFFF"
            onPress={handleSearch}
            loading={isSearching}
            style={styles.searchBtn}
          >
            Find
          </Button>
        </View>

        {/* Live Interactive Map Canvas */}
        <View style={styles.mapCanvas}>
          {Platform.OS === 'web' ? (
            <iframe
              key={`${selectedLat}-${selectedLng}-${visible}`}
              srcDoc={leafletMapHtml}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Interactive Pin Point Map"
            />
          ) : (
            <View style={styles.mobileFallback}>
              <MaterialCommunityIcons name="map-marker-check" size={54} color={Colors.secondary} />
              <Text style={styles.coordDisplay}>
                📍 Lat: {selectedLat.toFixed(6)} | Lng: {selectedLng.toFixed(6)}
              </Text>
            </View>
          )}
        </View>

        {/* Coordinates Readout & Place Tag Bar */}
        <View style={styles.infoBar}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>LOCATION NAME</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {placeLabel ? `📍 ${placeLabel}` : 'Tap a tag above or type in form'}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>COORDINATES</Text>
            <Text style={styles.infoValue}>{selectedLat.toFixed(4)}, {selectedLng.toFixed(4)}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>GATE RADIUS</Text>
            <Text style={[styles.infoValue, { color: Colors.secondary }]}>{radius}m Precision</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} textColor={Colors.textSecondary} style={styles.btn}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={Colors.secondary}
            textColor="#FFFFFF"
            onPress={handleConfirm}
            style={styles.btn}
            icon="check-circle"
            labelStyle={{ fontSize: 14, fontWeight: '700' }}
          >
            Confirm & Save Pin
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    maxWidth: 820,
    width: '94%',
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.large,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.secondaryBg, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  closeBtn: { padding: 4 },
  tagsContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.xs, gap: Spacing.xs },
  tagsHeading: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  tagsScroll: { flexDirection: 'row' },
  placeChip: { marginRight: Spacing.xs, backgroundColor: Colors.background },
  topControlRow: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.xs },
  searchInput: { flex: 1, backgroundColor: Colors.surface },
  searchBtn: { justifyContent: 'center', borderRadius: BorderRadius.md },
  mapCanvas: {
    height: 360,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginVertical: Spacing.sm,
    backgroundColor: '#F8FAFC',
  },
  mobileFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  coordDisplay: { fontSize: Fonts.sizes.sm, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  infoBar: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoItem: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  infoValue: { fontSize: Fonts.sizes.sm, fontWeight: '800', color: Colors.text, marginTop: 2 },
  infoDivider: { width: 1, height: '100%', backgroundColor: Colors.border },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.sm },
  btn: { borderRadius: BorderRadius.md },
});

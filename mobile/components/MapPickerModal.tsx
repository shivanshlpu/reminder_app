/**
 * Full-Focus Interactive Map Pin-Point Picker
 * Fast, ultra-responsive Leaflet + CartoDB map for Web, Mobile Web & PWA.
 * Features stable iframe lifecycle (no re-renders on drag), instant tile loading,
 * location search, and 1-tap "Use Current GPS Location".
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

  const iframeRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      const lat = initialLat || 28.6139;
      const lng = initialLng || 77.2090;
      setSelectedLat(lat);
      setSelectedLng(lng);
      setPlaceLabel(initialName || '');
    }
  }, [visible, initialLat, initialLng, initialName]);

  // Notify map iframe when coordinates are updated via search or GPS
  const updateMapCenter = (lat: number, lng: number) => {
    setSelectedLat(lat);
    setSelectedLng(lng);
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'SET_CENTER', lat, lng }, '*');
    }
  };

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
        const lat = parseFloat(parseFloat(data[0].lat).toFixed(6));
        const lng = parseFloat(parseFloat(data[0].lon).toFixed(6));
        updateMapCenter(lat, lng);
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

  const handleUseCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          updateMapCenter(lat, lng);
        },
        (err) => {
          alert('Could not access GPS location. Please check browser location permissions.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const handleConfirm = () => {
    onSelectLocation(selectedLat, selectedLng, placeLabel);
    onDismiss();
  };

  // Generate Leaflet Map HTML string statically (only once per modal open)
  const leafletMapHtml = useMemo(() => {
    const lat = initialLat || 28.6139;
    const lng = initialLng || 77.2090;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; touch-action: manipulation; }
          html, body, #map { width: 100%; height: 100%; overflow: hidden; background: #E2E8F0; }
          .pin-popup { font-weight: bold; font-size: 13px; color: #6C63FF; padding: 2px; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var lat = ${lat};
          var lng = ${lng};
          var radius = ${radius};

          var map = L.map('map', {
            zoomControl: true,
            tap: true,
            touchZoom: true
          }).setView([lat, lng], 17);

          // Fast CartoDB Voyager tiles optimized for mobile retina displays
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '© OpenStreetMap, © CARTO'
          }).addTo(map);

          var marker = L.marker([lat, lng], { draggable: true }).addTo(map);
          marker.bindPopup("<div class='pin-popup'>📍 Pin Location (Drag to move)</div>").openPopup();

          var circle = L.circle([lat, lng], {
            color: '#6C63FF',
            fillColor: '#6C63FF',
            fillOpacity: 0.25,
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
            var pos = marker.getLatLng();
            updateCoords(pos.lat, pos.lng);
          });

          map.on('click', function(e) {
            updateCoords(e.latlng.lat, e.latlng.lng);
          });

          window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'SET_CENTER') {
              lat = e.data.lat;
              lng = e.data.lng;
              map.setView([lat, lng], 17);
              marker.setLatLng([lat, lng]);
              circle.setLatLng([lat, lng]);
            }
          });
        </script>
      </body>
      </html>
    `;
  }, [visible]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'PIN_MOVED') {
          setSelectedLat(parseFloat(parseFloat(event.data.lat).toFixed(6)));
          setSelectedLng(parseFloat(parseFloat(event.data.lng).toFixed(6)));
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
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Mark Pin Point on Map</Text>
              <Text style={styles.subtitle}>Tap or drag pin to mark your Hostel, Gate, or Campus</Text>
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

        {/* Search Bar & My Location Button */}
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
            Search
          </Button>
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleUseCurrentLocation}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Live Interactive Map Canvas */}
        <View style={styles.mapCanvas}>
          {Platform.OS === 'web' ? (
            <iframe
              ref={iframeRef}
              key={`map-iframe-${visible ? 'visible' : 'hidden'}`}
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
              {placeLabel ? `📍 ${placeLabel}` : 'Tap a tag above'}
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
            <Text style={[styles.infoValue, { color: Colors.secondary }]}>{radius}m Radius</Text>
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
    margin: Spacing.sm,
    maxWidth: 820,
    width: '95%',
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    maxHeight: '92%',
    ...Shadows.large,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  iconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.secondaryBg, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: Fonts.sizes.lg, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  closeBtn: { padding: 4 },
  tagsContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: Spacing.xs },
  tagsHeading: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  tagsScroll: { flexDirection: 'row' },
  placeChip: { marginRight: Spacing.xs, backgroundColor: Colors.background },
  topControlRow: { flexDirection: 'row', gap: Spacing.xs, marginVertical: 4, alignItems: 'center' },
  searchInput: { flex: 1, backgroundColor: Colors.surface, height: 40 },
  searchBtn: { justifyContent: 'center', borderRadius: BorderRadius.md, height: 40 },
  gpsBtn: {
    width: 40,
    height: 40,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapCanvas: {
    height: 320,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginVertical: Spacing.xs,
    backgroundColor: '#E2E8F0',
  },
  mobileFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  coordDisplay: { fontSize: Fonts.sizes.sm, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  infoBar: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoItem: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  infoValue: { fontSize: Fonts.sizes.xs, fontWeight: '800', color: Colors.text, marginTop: 2 },
  infoDivider: { width: 1, height: '100%', backgroundColor: Colors.border },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  btn: { borderRadius: BorderRadius.md },
});

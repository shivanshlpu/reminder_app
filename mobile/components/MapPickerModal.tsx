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
    const rad = radius || 10;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; touch-action: manipulation; }
          html, body { width: 100%; height: 100%; min-height: 100%; overflow: hidden; background: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          #map { width: 100%; height: 100%; min-height: 100%; position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; }
          #loading {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: #F8FAFC; z-index: 10; display: flex; flex-direction: column;
            align-items: center; justify-content: center; color: #475569; font-size: 13px; font-weight: 600;
          }
          .spinner {
            width: 28px; height: 28px; border: 3px solid #E2E8F0; border-top-color: #10B981;
            border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 8px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .pin-popup { font-weight: 700; font-size: 12px; color: #0F172A; text-align: center; }
          .leaflet-popup-content-wrapper { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
      </head>
      <body>
        <div id="loading"><div class="spinner"></div>Loading interactive map...</div>
        <div id="map"></div>
        <script>
          function initMap() {
            if (typeof L === 'undefined') {
              // Fallback CDN if CDNJS fails
              var script = document.createElement('script');
              script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
              script.onload = runLeaflet;
              script.onerror = function() {
                document.getElementById('loading').innerHTML = '⚠️ Map could not be loaded. Please check your internet connection.';
              };
              document.head.appendChild(script);
            } else {
              runLeaflet();
            }
          }

          function runLeaflet() {
            try {
              var lat = ${lat};
              var lng = ${lng};
              var radius = ${rad};

              var map = L.map('map', {
                zoomControl: true,
                tap: true,
                touchZoom: true,
                scrollWheelZoom: true
              }).setView([lat, lng], 17);

              // Standard OpenStreetMap Tile Layer with CartoDB fallback
              var tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
              });
              tileLayer.on('tileerror', function() {
                L.tileLayer('https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
              });
              tileLayer.addTo(map);

              // Custom SVG Marker (no external PNG asset required, prevents 404s inside iframe)
              var customPinIcon = L.divIcon({
                className: 'custom-map-pin',
                html: '<div style="position:relative; width:34px; height:34px; transform:translate(-50%, -100%); cursor:grab;">' +
                      '<div style="width:34px; height:34px; background:#10B981; border:3px solid #FFFFFF; border-radius:50% 50% 50% 0; transform:rotate(-45deg); box-shadow:0 4px 12px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center;">' +
                      '<div style="width:10px; height:10px; background:#FFFFFF; border-radius:50%;"></div>' +
                      '</div></div>',
                iconSize: [0, 0],
                iconAnchor: [0, 0],
                popupAnchor: [0, -36]
              });

              var marker = L.marker([lat, lng], { icon: customPinIcon, draggable: true }).addTo(map);
              marker.bindPopup("<div class='pin-popup'>📍 Selected Pin<br><span style='color:#64748B; font-size:11px; font-weight:normal;'>Drag or tap anywhere to move</span></div>").openPopup();

              var circle = L.circle([lat, lng], {
                color: '#10B981',
                fillColor: '#10B981',
                fillOpacity: 0.2,
                weight: 2,
                radius: radius
              }).addTo(map);

              function updateCoords(newLat, newLng) {
                lat = parseFloat(newLat.toFixed(6));
                lng = parseFloat(newLng.toFixed(6));
                marker.setLatLng([lat, lng]);
                circle.setLatLng([lat, lng]);
                try {
                  window.parent.postMessage({ type: 'PIN_MOVED', lat: lat, lng: lng }, '*');
                } catch(e) {}
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
                  lat = parseFloat(e.data.lat);
                  lng = parseFloat(e.data.lng);
                  map.setView([lat, lng], 17);
                  marker.setLatLng([lat, lng]);
                  circle.setLatLng([lat, lng]);
                  map.invalidateSize();
                }
              });

              // Multiple invalidateSize passes to guarantee full tile coverage upon modal animation
              setTimeout(function() { map.invalidateSize(); }, 60);
              setTimeout(function() { map.invalidateSize(); }, 200);
              setTimeout(function() { map.invalidateSize(); }, 500);
              window.addEventListener('resize', function() { map.invalidateSize(); });

              // Hide loading indicator
              var loadingEl = document.getElementById('loading');
              if (loadingEl) loadingEl.style.display = 'none';

              try {
                window.parent.postMessage({ type: 'MAP_READY' }, '*');
              } catch(e) {}
            } catch(err) {
              console.error('Leaflet initialization error:', err);
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMap);
          } else {
            initMap();
          }
        </script>
      </body>
      </html>
    `;
  }, [visible, initialLat, initialLng, radius]);

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
              style={{ width: '100%', height: '100%', minHeight: 320, border: 0 }}
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

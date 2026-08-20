/**
 * Settings Screen — Fluid Multi-Device Responsive (Mobile & Laptop)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Updates from 'expo-updates';
import { Switch, Button, Modal, Portal, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { whatsappApi, WhatsAppStatus } from '../../services/whatsapp-api';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { isWide } = useResponsiveLayout();
  const router = useRouter();

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [autoSendGlobal, setAutoSendGlobal] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [backendUrl, setBackendUrlInput] = useState(whatsappApi.getBaseUrl());

  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pollIntervalRef = useRef<any>(null);

  const checkWhatsAppStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const status = await whatsappApi.getStatus();
      setWaStatus(status);
      if (status?.qrCodeDataUrl) {
        setQrDataUrl(status.qrCodeDataUrl);
      }
      return status;
    } catch (error) {
      setWaStatus(null);
      return null;
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkWhatsAppStatus();
    return () => {
      stopQrPolling();
    };
  }, [checkWhatsAppStatus]);

  const stopQrPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startQrPolling = () => {
    stopQrPolling();
    pollIntervalRef.current = setInterval(async () => {
      const qrResult = await whatsappApi.getQrCode();
      if (qrResult?.connected) {
        stopQrPolling();
        setShowQrModal(false);
        checkWhatsAppStatus();
        Alert.alert('Success 🎉', 'WhatsApp connected successfully!');
      } else if (qrResult?.qrCodeDataUrl) {
        setQrDataUrl(qrResult.qrCodeDataUrl);
        setQrLoading(false);
      }
    }, 2000);
  };

  const handleInitWhatsApp = async () => {
    setQrLoading(true);
    setShowQrModal(true);
    setQrDataUrl(null);

    try {
      await whatsappApi.initialize();
      startQrPolling();
    } catch (error) {
      Alert.alert('Error', 'Failed to initialize WhatsApp connection. Make sure backend server is running.');
      setShowQrModal(false);
      setQrLoading(false);
    }
  };

  const handleCloseQrModal = () => {
    stopQrPolling();
    setShowQrModal(false);
  };

  const handleDisconnectWhatsApp = async () => {
    Alert.alert('Disconnect WhatsApp', 'This will log out your current WhatsApp session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await whatsappApi.disconnect();
          checkWhatsAppStatus();
        },
      },
    ]);
  };

  const handleSaveBackendUrl = () => {
    if (backendUrl.trim()) {
      whatsappApi.setBaseUrl(backendUrl.trim());
      checkWhatsAppStatus();
      Alert.alert('Backend Updated', `Backend API URL set to ${backendUrl.trim()}`);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckForUpdates = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Web App', 'The web application updates automatically when reloaded.');
      return;
    }
    setCheckingUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update Ready! 🎉',
          'A new update has been downloaded. Restart the app now to apply changes?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart & Apply',
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      } else {
        Alert.alert('Up to Date ✨', 'You are running the latest version of ExpenseTracker.');
      }
    } catch (error: any) {
      Alert.alert('Check Complete', 'App is up to date.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info Header */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <MaterialCommunityIcons name="account-circle-outline" size={52} color={Colors.primary} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {user?.email?.toLowerCase().includes('shivansh')
              ? 'Shivansh'
              : user?.email?.split('@')[0]?.replace(/[0-9_.-]/g, '') || 'Shivansh'}
          </Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>
      </View>

      {/* Grid wrapper for Desktop / Stacked for Mobile */}
      <View style={isWide ? styles.gridDesktop : undefined}>
        {/* WhatsApp Connection Section */}
        <View style={[styles.section, isWide && styles.colDesktop]}>
          <Text style={styles.sectionTitle}>WhatsApp Connection</Text>
          <View style={styles.waCard}>
            <View style={styles.waStatus}>
              <View style={[styles.statusDot, { backgroundColor: waStatus?.connected ? Colors.success : Colors.error }]} />
              <Text style={styles.waStatusText}>
                {waStatus?.connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>

            {waStatus?.phoneNumber && (
              <Text style={styles.waPhone}>📱 Linked Number: +{waStatus.phoneNumber}</Text>
            )}

            {waStatus?.lastConnected && (
              <Text style={styles.waLastConn}>
                Last synced: {new Date(waStatus.lastConnected).toLocaleString('en-IN')}
              </Text>
            )}

            <View style={styles.waActions}>
              {!waStatus?.connected ? (
                <Button
                  mode="contained"
                  onPress={handleInitWhatsApp}
                  buttonColor={Colors.secondary}
                  icon="qrcode-scan"
                  style={styles.waBtn}
                >
                  Connect WhatsApp & Scan QR
                </Button>
              ) : (
                <Button
                  mode="outlined"
                  onPress={handleDisconnectWhatsApp}
                  textColor={Colors.accent}
                  icon="logout"
                  style={styles.waBtn}
                >
                  Disconnect Session
                </Button>
              )}
              <Button
                mode="text"
                onPress={checkWhatsAppStatus}
                loading={checkingStatus}
                textColor={Colors.textSecondary}
                icon="refresh"
              >
                Check Sync Status
              </Button>
            </View>
          </View>
        </View>

        {/* Server Configuration */}
        <View style={[styles.section, isWide && styles.colDesktop]}>
          <Text style={styles.sectionTitle}>Server Configuration</Text>
          <View style={styles.settingCard}>
            <TextInput
              label="Backend API Endpoint"
              value={backendUrl}
              onChangeText={setBackendUrlInput}
              mode="outlined"
              left={<TextInput.Icon icon="server-network" color={Colors.textSecondary} />}
              style={styles.input}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              textColor={Colors.text}
              theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
            />
            <Button
              mode="outlined"
              onPress={handleSaveBackendUrl}
              textColor={Colors.primary}
              style={{ borderRadius: BorderRadius.md, marginTop: Spacing.xs }}
            >
              Update Endpoint
            </Button>
          </View>
        </View>
      </View>

      {/* Preferences & Logs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences & History</Text>

        <TouchableOpacity style={styles.settingRow} onPress={() => setAutoSendGlobal(!autoSendGlobal)}>
          <View style={styles.settingInfo}>
            <MaterialCommunityIcons name="send-check-outline" size={22} color={Colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Auto-send Messages</Text>
              <Text style={styles.settingDesc}>Send WhatsApp when entering pinned locations</Text>
            </View>
          </View>
          <Switch value={autoSendGlobal} onValueChange={setAutoSendGlobal} color={Colors.secondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/logs')}>
          <View style={styles.settingInfo}>
            <MaterialCommunityIcons name="history" size={22} color={Colors.info} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Message History Logs</Text>
              <Text style={styles.settingDesc}>Audit all auto-sent WhatsApp notifications</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Account Actions */}
      <View style={styles.section}>
        <Button
          mode="outlined"
          onPress={handleSignOut}
          textColor={Colors.accent}
          icon="logout"
          style={styles.signOutBtn}
        >
          Sign Out of App
        </Button>
      </View>

      <Text style={styles.version}>PocketRadar v1.0.0</Text>

      {/* Live QR Code Modal */}
      <Portal>
        <Modal
          visible={showQrModal}
          onDismiss={handleCloseQrModal}
          contentContainerStyle={styles.qrModal}
        >
          <View style={styles.qrHeader}>
            <MaterialCommunityIcons name="qrcode-scan" size={36} color={Colors.primary} />
            <Text style={styles.qrTitle}>Pair WhatsApp</Text>
            <Text style={styles.qrSubtitle}>
              Open WhatsApp on your phone → Linked Devices → Link a Device, then scan this code:
            </Text>
          </View>

          <View style={styles.qrContainer}>
            {qrDataUrl ? (
              <Image
                source={{ uri: qrDataUrl }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.qrLoadingBox}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.qrLoadingText}>Generating QR Code from server...</Text>
              </View>
            )}
          </View>

          <View style={styles.qrFooter}>
            <Text style={styles.qrStatusHint}>
              {qrDataUrl ? '🔄 Live updating... Scan with WhatsApp camera' : 'Connecting to Baileys engine...'}
            </Text>
            <Button
              mode="contained"
              onPress={handleCloseQrModal}
              buttonColor={Colors.background}
              textColor={Colors.text}
              style={{ marginTop: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border }}
            >
              Close Window
            </Button>
          </View>
        </Modal>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  gridDesktop: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'stretch' },
  colDesktop: { flex: 1 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  userAvatar: { marginRight: Spacing.md },
  userInfo: { flex: 1 },
  userName: { fontSize: Fonts.sizes.lg, fontWeight: '700', color: Colors.text },
  userEmail: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  waCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  waStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  waStatusText: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text },
  waPhone: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, marginBottom: 4 },
  waLastConn: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginBottom: Spacing.md },
  waActions: { gap: Spacing.sm },
  waBtn: { borderRadius: BorderRadius.md },
  settingCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  input: { backgroundColor: Colors.surface },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  settingInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  settingLabel: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text },
  settingDesc: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  signOutBtn: { borderColor: Colors.accent, borderRadius: BorderRadius.md },
  version: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md },

  qrModal: {
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  qrHeader: { alignItems: 'center', marginBottom: Spacing.md },
  qrTitle: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.text, marginTop: Spacing.xs },
  qrSubtitle: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, paddingHorizontal: Spacing.xs },
  qrContainer: {
    width: 250,
    height: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
    marginVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  qrImage: { width: '100%', height: '100%' },
  qrLoadingBox: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  qrLoadingText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  qrFooter: { alignItems: 'center', width: '100%' },
  qrStatusHint: { fontSize: Fonts.sizes.xs, color: Colors.textMuted },
});

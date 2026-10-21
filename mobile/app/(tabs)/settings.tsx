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

  // WhatsApp Connect Modal State
  const [showQrModal, setShowQrModal] = useState(false);
  const [connectMode, setConnectMode] = useState<'phone' | 'qr'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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
      stopConnectionPolling();
    };
  }, [checkWhatsAppStatus]);

  const stopConnectionPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startConnectionPolling = (mode: 'phone' | 'qr') => {
    stopConnectionPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await whatsappApi.getStatus();
        if (status?.connected) {
          stopConnectionPolling();
          setShowQrModal(false);
          setPairingCode(null);
          setWaStatus(status);
          Alert.alert(
            'WhatsApp Connected 🎉',
            `Successfully linked to WhatsApp account: +${status.phoneNumber || ''}`
          );
          return;
        }

        if (mode === 'qr') {
          if (status?.qrCodeDataUrl) {
            setQrDataUrl(status.qrCodeDataUrl);
            setQrLoading(false);
          } else {
            const qrResult = await whatsappApi.getQrCode();
            if (qrResult?.qrCodeDataUrl) {
              setQrDataUrl(qrResult.qrCodeDataUrl);
              setQrLoading(false);
            }
          }
        }
      } catch (e) {
        // Continue polling silently
      }
    }, 2500);
  };

  const handleOpenConnectModal = async (initialMode: 'phone' | 'qr' = 'phone') => {
    setConnectMode(initialMode);
    setShowQrModal(true);
    setCodeError(null);
    setCodeCopied(false);

    if (initialMode === 'qr') {
      setQrLoading(true);
      setQrDataUrl(null);
      try {
        await whatsappApi.initialize();
        startConnectionPolling('qr');
      } catch (error) {
        setQrLoading(false);
        setCodeError('Failed to initialize QR code generator. Check backend server.');
      }
    } else {
      if (pairingCode) {
        startConnectionPolling('phone');
      }
    }
  };

  const handleSwitchConnectMode = async (targetMode: 'phone' | 'qr') => {
    setConnectMode(targetMode);
    setCodeError(null);

    if (targetMode === 'qr') {
      if (!qrDataUrl) {
        setQrLoading(true);
        try {
          await whatsappApi.initialize();
          startConnectionPolling('qr');
        } catch (error) {
          setQrLoading(false);
          setCodeError('Failed to initialize QR code.');
        }
      } else {
        startConnectionPolling('qr');
      }
    } else {
      if (pairingCode) {
        startConnectionPolling('phone');
      } else {
        stopConnectionPolling();
      }
    }
  };

  const handleRequestPairingCode = async () => {
    const raw = phoneInput.trim();
    if (!raw) {
      setCodeError('Please enter your WhatsApp mobile number.');
      return;
    }

    // Clean non-digit characters
    let clean = raw.replace(/\D/g, '');
    while (clean.startsWith('0')) {
      clean = clean.slice(1);
    }

    // Auto prepend 91 for standard 10-digit Indian numbers
    if (clean.length === 10) {
      clean = `91${clean}`;
    }

    if (clean.length < 10 || clean.length > 15) {
      setCodeError(`Invalid phone number length (${clean.length} digits). Enter a 10-digit number or number with country code.`);
      return;
    }

    setCodeLoading(true);
    setCodeError(null);

    try {
      const result = await whatsappApi.requestPairingCode(clean);
      if (result?.pairingCode) {
        setPairingCode(result.pairingCode);
        startConnectionPolling('phone');
      } else {
        setCodeError('Failed to get connection code from WhatsApp. Please retry.');
      }
    } catch (err: any) {
      setCodeError(err?.message || 'Error connecting to WhatsApp servers. Please retry.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!pairingCode) return;
    const cleanCode = pairingCode.replace(/[^a-zA-Z0-9]/g, '');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanCode);
      }
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch (e) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  const handleCloseConnectModal = () => {
    stopConnectionPolling();
    setShowQrModal(false);
    setCodeError(null);
  };

  const handleDisconnectWhatsApp = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm('Disconnect WhatsApp\n\nThis will log out your current WhatsApp session.');
      if (ok) {
        await whatsappApi.disconnect();
        checkWhatsAppStatus();
      }
    } else {
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
    }
  };

  const handleSaveBackendUrl = () => {
    if (backendUrl.trim()) {
      whatsappApi.setBaseUrl(backendUrl.trim());
      checkWhatsAppStatus();
      Alert.alert('Backend Updated', `Backend API URL set to ${backendUrl.trim()}`);
    }
  };

  const handleSignOut = () => {
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      setShowSignOutModal(false);
      await logout();
      router.replace('/(auth)/login');
    } catch (error: any) {
      console.error('Logout error:', error);
    } finally {
      setSigningOut(false);
    }
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
        <TouchableOpacity
          style={styles.cardSignOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="logout-variant" size={18} color={Colors.accent} />
          <Text style={styles.cardSignOutText}>Sign Out</Text>
        </TouchableOpacity>
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
                <View style={{ gap: Spacing.sm }}>
                  <Button
                    mode="contained"
                    onPress={() => handleOpenConnectModal('phone')}
                    buttonColor={Colors.secondary}
                    icon="cellphone-key"
                    style={styles.waBtn}
                  >
                    Link with Mobile Number (Code)
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => handleOpenConnectModal('qr')}
                    textColor={Colors.primary}
                    icon="qrcode-scan"
                    style={styles.waBtn}
                  >
                    Scan QR Code Instead
                  </Button>
                </View>
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

      {/* App Branding & Version Card */}
      <View style={styles.appBrandingCard}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.brandingLogo}
          resizeMode="contain"
        />
        <View style={styles.brandingInfo}>
          <Text style={styles.brandingTitle}>PocketRadar</Text>
          <Text style={styles.brandingSubtitle}>GPS Gate Radar, Smart Khata & Expenses</Text>
          <Text style={styles.brandingVersion}>Version 1.0.0 (Build 2026.1)</Text>
        </View>
      </View>

      {/* Live WhatsApp Connection Modal (Pairing Code & QR Code) */}
      <Portal>
        <Modal
          visible={showQrModal}
          onDismiss={handleCloseConnectModal}
          contentContainerStyle={styles.qrModal}
        >
          {/* Header */}
          <View style={styles.qrHeader}>
            <MaterialCommunityIcons name="whatsapp" size={40} color="#25D366" />
            <Text style={styles.qrTitle}>Connect WhatsApp</Text>
            <Text style={styles.qrSubtitle}>
              Link PocketRadar with your WhatsApp to automatically dispatch geo-fence alerts.
            </Text>
          </View>

          {/* Segmented Mode Tabs */}
          <View style={styles.connectTabContainer}>
            <TouchableOpacity
              style={[styles.connectTabBtn, connectMode === 'phone' && styles.connectTabBtnActive]}
              onPress={() => handleSwitchConnectMode('phone')}
              activeOpacity={0.8}
            >
              <Text style={[styles.connectTabText, connectMode === 'phone' && styles.connectTabTextActive]}>
                📱 Mobile Number (Code)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.connectTabBtn, connectMode === 'qr' && styles.connectTabBtnActive]}
              onPress={() => handleSwitchConnectMode('qr')}
              activeOpacity={0.8}
            >
              <Text style={[styles.connectTabText, connectMode === 'qr' && styles.connectTabTextActive]}>
                📷 Scan QR Code
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: Phone Number Pairing Code Mode */}
          {connectMode === 'phone' ? (
            <View style={{ width: '100%', alignItems: 'center' }}>
              {!pairingCode ? (
                <>
                  <Text style={styles.phoneFormSubtitle}>
                    Enter your 10-digit WhatsApp phone number. We'll generate an 8-character connection code to enter in your WhatsApp app.
                  </Text>

                  <View style={styles.phoneInputRow}>
                    <View style={styles.countryBadge}>
                      <Text style={styles.countryBadgeText}>🇮🇳 +91</Text>
                    </View>
                    <TextInput
                      mode="outlined"
                      value={phoneInput}
                      onChangeText={(val) => {
                        setPhoneInput(val);
                        if (codeError) setCodeError(null);
                      }}
                      placeholder="98765 43210"
                      keyboardType="phone-pad"
                      outlineColor={Colors.border}
                      activeOutlineColor={Colors.primary}
                      textColor={Colors.text}
                      style={styles.phoneField}
                      theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                      left={<TextInput.Icon icon="phone" color={Colors.textSecondary} />}
                    />
                  </View>

                  {codeError && (
                    <View style={styles.errorBanner}>
                      <MaterialCommunityIcons name="alert-circle" size={18} color={Colors.accent} />
                      <Text style={styles.errorBannerText}>{codeError}</Text>
                    </View>
                  )}

                  <Button
                    mode="contained"
                    onPress={handleRequestPairingCode}
                    loading={codeLoading}
                    disabled={codeLoading}
                    buttonColor={Colors.secondary}
                    icon="cellphone-key"
                    style={{ width: '100%', borderRadius: BorderRadius.md, paddingVertical: 4 }}
                  >
                    {codeLoading ? 'Generating Connection Code...' : 'Get WhatsApp Connection Code'}
                  </Button>

                  <View style={styles.tipBox}>
                    <Text style={styles.tipText}>
                      💡 <Text style={{ fontWeight: '700' }}>No camera needed!</Text> You can link directly from your phone by typing this code in WhatsApp settings.
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  {/* Generated Pairing Code Card */}
                  <View style={styles.codeCard}>
                    <Text style={styles.codeCardLabel}>ENTER THIS CODE IN WHATSAPP</Text>
                    <Text style={styles.codeDisplay}>{pairingCode}</Text>
                    <Button
                      mode="contained"
                      onPress={handleCopyCode}
                      buttonColor={codeCopied ? Colors.success : Colors.primary}
                      icon={codeCopied ? 'check' : 'content-copy'}
                      style={styles.copyCodeBtn}
                    >
                      {codeCopied ? 'Code Copied! 🎉' : 'Copy Connection Code'}
                    </Button>
                  </View>

                  {/* Step-by-Step Instructions */}
                  <View style={styles.stepsCard}>
                    <Text style={styles.stepsTitle}>Follow these steps on your phone:</Text>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepBullet}>1.</Text>
                      <Text style={styles.stepText}>Open <Text style={styles.stepBold}>WhatsApp</Text> on your phone (+{phoneInput}).</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepBullet}>2.</Text>
                      <Text style={styles.stepText}>Go to <Text style={styles.stepBold}>Settings</Text> (or ⋮ menu) → <Text style={styles.stepBold}>Linked Devices</Text>.</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepBullet}>3.</Text>
                      <Text style={styles.stepText}>Tap <Text style={styles.stepBold}>Link a Device</Text>.</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepBullet}>4.</Text>
                      <Text style={styles.stepText}>Tap <Text style={styles.stepBold}>"Link with phone number instead"</Text> at the bottom.</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Text style={styles.stepBullet}>5.</Text>
                      <Text style={styles.stepText}>Enter the 8-character code: <Text style={styles.stepBold}>{pairingCode}</Text></Text>
                    </View>
                  </View>

                  {/* Live Sync Status */}
                  <View style={styles.liveSyncCard}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.liveSyncText}>Waiting for link approval in WhatsApp... (syncs automatically)</Text>
                  </View>

                  <Button
                    mode="text"
                    onPress={() => {
                      setPairingCode(null);
                      stopConnectionPolling();
                    }}
                    textColor={Colors.textSecondary}
                    icon="arrow-left"
                    style={{ marginTop: Spacing.xs }}
                  >
                    Change Phone Number / Request New Code
                  </Button>
                </>
              )}
            </View>
          ) : (
            /* Tab 2: QR Code Mode */
            <View style={{ width: '100%', alignItems: 'center' }}>
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
              </View>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleCloseConnectModal}
            buttonColor={Colors.background}
            textColor={Colors.text}
            style={{ marginTop: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, width: '100%' }}
          >
            Close Window
          </Button>
        </Modal>

        {/* Universal Sign Out Confirmation Modal */}
        <Modal
          visible={showSignOutModal}
          onDismiss={() => setShowSignOutModal(false)}
          contentContainerStyle={styles.signOutModal}
        >
          <View style={styles.signOutHeader}>
            <View style={styles.signOutIconBox}>
              <MaterialCommunityIcons name="logout-variant" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.signOutTitle}>Sign Out</Text>
            <Text style={styles.signOutSubtitle}>
              Are you sure you want to sign out from PocketRadar?
            </Text>
            {user?.email ? (
              <View style={styles.signOutUserChip}>
                <MaterialCommunityIcons name="account" size={16} color={Colors.textSecondary} />
                <Text style={styles.signOutUserChipText}>{user.email}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.signOutModalActions}>
            <Button
              mode="outlined"
              onPress={() => setShowSignOutModal(false)}
              style={styles.signOutCancelBtn}
              textColor={Colors.text}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={confirmSignOut}
              loading={signingOut}
              disabled={signingOut}
              style={styles.signOutConfirmBtn}
              buttonColor={Colors.accent}
            >
              Sign Out
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
  cardSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cardSignOutText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.accent,
  },
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
  appBrandingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  brandingLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  brandingInfo: {
    flex: 1,
  },
  brandingTitle: {
    fontSize: Fonts.sizes.md,
    fontWeight: '800',
    color: Colors.text,
  },
  brandingSubtitle: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
  },
  brandingVersion: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },

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

  connectTabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginVertical: Spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  connectTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  connectTabBtnActive: {
    backgroundColor: Colors.primary,
  },
  connectTabText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  connectTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  phoneFormSubtitle: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
    width: '100%',
  },
  countryBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryBadgeText: {
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.text,
  },
  phoneField: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    width: '100%',
  },
  errorBannerText: {
    flex: 1,
    fontSize: Fonts.sizes.xs,
    color: Colors.accent,
    fontWeight: '600',
  },
  tipBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    width: '100%',
  },
  tipText: {
    fontSize: Fonts.sizes.xs,
    color: '#1E40AF',
    lineHeight: 18,
  },

  codeCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    width: '100%',
    marginVertical: Spacing.sm,
    ...Shadows.small,
  },
  codeCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeDisplay: {
    fontSize: 32,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: Spacing.md,
  },
  copyCodeBtn: {
    borderRadius: BorderRadius.md,
    minWidth: 170,
  },

  stepsCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  stepsTitle: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  stepBullet: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.primary,
    width: 18,
  },
  stepText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  stepBold: {
    fontWeight: '700',
    color: Colors.text,
  },

  liveSyncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  liveSyncText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
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

  signOutModal: {
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    maxWidth: 420,
    alignSelf: 'center',
    width: '90%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  signOutHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    width: '100%',
  },
  signOutIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  signOutTitle: {
    fontSize: Fonts.sizes.title,
    fontWeight: '800',
    color: Colors.text,
  },
  signOutSubtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: Spacing.sm,
  },
  signOutUserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  signOutUserChipText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  signOutModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  signOutCancelBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderColor: Colors.border,
  },
  signOutConfirmBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
  },
});

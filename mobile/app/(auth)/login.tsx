/**
 * Login Screen — Light Theme & Mobile Optimized
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('shivanshti10@gmail.com');
  const [password, setPassword] = useState('12345678');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email.trim() || !password.trim()) {
      const msg = 'Please enter both email and password';
      setErrorMessage(msg);
      Alert.alert('Error', msg);
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (error: any) {
      const msg = error?.message || 'Invalid credentials. Please check and try again.';
      setErrorMessage(msg);
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFillShivansh = () => {
    setEmail('shivanshti10@gmail.com');
    setPassword('12345678');
    setErrorMessage(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Logo / Header */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appLogo}
              resizeMode="contain"
            />
            <Text style={styles.title}>PocketRadar</Text>
            <Text style={styles.subtitle}>GPS Gate Radar, Smart Khata & Expenses</Text>
          </View>

          {/* Quick Credential Chip */}
          <TouchableOpacity
            style={styles.quickChip}
            onPress={handleQuickFillShivansh}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="account-check-outline" size={18} color={Colors.primary} />
            <Text style={styles.quickChipText}>Owner ID: <Text style={{ fontWeight: '700' }}>shivanshti10@gmail.com</Text></Text>
          </TouchableOpacity>

          {/* Error Banner */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.error} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <TextInput
              label="Email Address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errorMessage) setErrorMessage(null);
              }}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              left={<TextInput.Icon icon="email-outline" color={Colors.textSecondary} />}
              style={styles.input}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              textColor={Colors.text}
              theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              mode="outlined"
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock-outline" color={Colors.textSecondary} />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  color={Colors.textSecondary}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              style={styles.input}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              textColor={Colors.text}
              theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
            />

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={Colors.primary}
            >
              Sign In
            </Button>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              style={styles.linkContainer}
            >
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkHighlight}>Create Account</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    ...Shadows.medium,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  appLogo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    marginBottom: Spacing.md,
    ...Shadows.medium,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Fonts.sizes.title,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  form: {
    gap: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.surface,
    fontSize: Fonts.sizes.md,
  },
  button: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    ...Shadows.small,
  },
  buttonContent: {
    paddingVertical: Spacing.sm,
  },
  buttonLabel: {
    fontSize: Fonts.sizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  linkContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: Fonts.sizes.sm,
  },
  linkHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryBg,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  quickChipText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.text,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.error,
    fontWeight: '600',
    flex: 1,
  },
});

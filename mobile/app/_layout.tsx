/**
 * Root Layout
 * Light Theme + Responsive Mobile Viewport Frame + Auth guard + Global Toast Banner
 */
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { DatabaseProvider } from '../contexts/DatabaseContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { Colors } from '../constants/theme';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const customTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.primary,
    secondary: Colors.secondary,
    background: Colors.background,
    surface: Colors.surface,
    surfaceVariant: Colors.surfaceElevated,
    error: Colors.error,
    onPrimary: Colors.textOnPrimary,
    onBackground: Colors.text,
    onSurface: Colors.text,
    outline: Colors.border,
  },
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="expense/[id]"
          options={{
            headerShown: true,
            title: 'Edit Expense',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="logs"
          options={{
            headerShown: true,
            title: 'Message History',
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <PaperProvider theme={customTheme}>
      <AuthProvider>
        <DatabaseProvider>
          <ToastProvider>
            <ResponsiveContainer>
              <RootLayoutNav />
            </ResponsiveContainer>
          </ToastProvider>
        </DatabaseProvider>
      </AuthProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});

/**
 * Modern In-App Toast & Floating Notification Banner
 * Replaces intrusive browser popups with sleek, modern animated pills that auto-dismiss in 3 seconds.
 */
import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, BorderRadius, Fonts, Shadows, Spacing } from '../constants/theme';

export type ToastType = 'success' | 'error' | 'info' | 'whatsapp';

interface ToastState {
  visible: boolean;
  message: string;
  subtitle?: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, subtitle?: string, type?: ToastType) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalShowToast: ((message: string, subtitle?: string, type?: ToastType) => void) | null = null;

export function showGlobalToast(message: string, subtitle?: string, type: ToastType = 'success') {
  if (globalShowToast) {
    globalShowToast(message, subtitle, type);
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'success',
  });

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    });
  };

  const showToast = (message: string, subtitle?: string, type: ToastType = 'success') => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setToast({ visible: true, message, subtitle, type });

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 9,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    // Auto dismiss in 3.5 seconds
    timerRef.current = setTimeout(() => {
      hideToast();
    }, 3500);
  };

  globalShowToast = showToast;

  const getIcon = () => {
    switch (toast.type) {
      case 'whatsapp':
        return { name: 'whatsapp', color: '#10B981', bg: '#D1FAE5' };
      case 'error':
        return { name: 'alert-circle', color: '#EF4444', bg: '#FEE2E2' };
      case 'info':
        return { name: 'information', color: '#3B82F6', bg: '#DBEAFE' };
      default:
        return { name: 'check-circle', color: '#10B981', bg: '#D1FAE5' };
    }
  };

  const iconInfo = getIcon();

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast.visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY }],
              opacity,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hideToast}
            style={styles.toastCard}
          >
            <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
              <MaterialCommunityIcons name={iconInfo.name as any} size={22} color={iconInfo.color} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.titleText}>{toast.message}</Text>
              {toast.subtitle ? (
                <Text style={styles.subtitleText} numberOfLines={2}>
                  {toast.subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={hideToast} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: showGlobalToast,
      hideToast: () => {},
    };
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 24 : 50,
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    maxWidth: 520,
    width: '100%',
    ...Shadows.large,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  textContainer: {
    flex: 1,
    paddingRight: Spacing.xs,
  },
  titleText: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitleText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
});

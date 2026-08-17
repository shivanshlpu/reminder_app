/**
 * Universal Dialogs & In-App Toast Notifications
 * Replaces disruptive browser alerts with non-blocking, sleek floating notification pills.
 */
import { Alert, Platform } from 'react-native';
import { showGlobalToast, ToastType } from '../contexts/ToastContext';

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText: string = 'Delete'
): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmText,
        style: 'destructive',
        onPress: onConfirm,
      },
    ]);
  }
}

export function showMessage(title: string, message: string, type: ToastType = 'success'): void {
  showGlobalToast(title, message, type);
}

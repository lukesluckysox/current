// Cross-platform confirm dialog. react-native-web ships a no-op Alert, so
// destructive flows (release a line, release every line, sign out) silently
// did nothing in the browser. On web we fall through to window.confirm; on
// native we keep Alert.alert so iOS/Android get the styled sheet.

import { Alert, Platform } from 'react-native';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const cancelLabel = opts.cancelLabel ?? 'Cancel';

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const body = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
      return Promise.resolve(window.confirm(body));
    }
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

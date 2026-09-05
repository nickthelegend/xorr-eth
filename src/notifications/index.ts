/**
 * Push notifications — PLAN.md 12.19, closing [G30].
 *
 * screens.md screen 18 lists five alerts and a rule that matters more than any of them:
 * "Circuit breakers stay on even when notifications are muted. They stop trading, not just your
 * phone." So the toggles here govern INTERRUPTION ONLY. The breakers that stop trading live in the
 * server's rule engine and are deliberately unreachable from this file.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../data/api';

export { MUTABLE, routeFor, type AlertKind } from './routes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // copy.md's restraint applies to sound too: a trading app that pings all day gets muted.
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export type RegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'denied' | 'unsupported' | 'error'; detail: string };

/**
 * Ask for permission and register the device with the executor.
 *
 * A simulator cannot produce a push token. The caller is told that plainly rather than handed a
 * fake one — a fake token would make the feature look wired when nothing would ever arrive.
 */
export async function register(): Promise<RegistrationResult> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('xorr', {
        name: 'xorr',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        vibrationPattern: [0, 120],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { ok: false, reason: 'denied', detail: 'Notification permission was not granted.' };
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/devices/register', { token, platform: Platform.OS });
    return { ok: true, token };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (/simulator|emulator|must be a physical/i.test(detail)) {
      return { ok: false, reason: 'unsupported', detail: 'Push needs a physical device.' };
    }
    return { ok: false, reason: 'error', detail };
  }
}

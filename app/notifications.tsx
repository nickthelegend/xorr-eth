/**
 * Which events are worth interrupting you for.
 *
 * The preferences table has been honoured by the push sender since it existed and had no screen, so
 * every kind was on and stayed on. That is a worse default than it sounds: a notification you
 * cannot turn off is one you learn to ignore, and the one that matters here — a trade your limits
 * refused — is the one you would then miss.
 *
 * The server owns the labels and the explanations, because it owns which kinds exist. Hardcoding
 * them here would let the list drift from what actually sends.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  SheetCard,
  SwitchRow,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';
import { useRegisterDevice } from '@/notifications/useRegisterDevice';

export default function Notifications() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => system.notificationPrefs(), []);
  /*
   * Whether this device can actually be reached.
   *
   * Four switches that decide which pushes to send are worth nothing if none can arrive, and that
   * failure used to exist only as a line in a console — the one place a user will never look. It
   * is the same "nothing versus not yet" problem as everywhere else in this app: a screen of
   * enabled toggles and a screen of enabled toggles on a device that never registered look
   * identical and mean opposite things.
   */
  const device = useRegisterDevice();

  /*
   * Local overrides on top of the fetched list, so a toggle responds immediately rather than after
   * a round trip. The write still happens; this only decides what the switch looks like while it
   * is in flight.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const enabledFor = (kind: string, fallback: boolean) => pending[kind] ?? fallback;

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Notifications</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={4} height={size.rowLg} />
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30 }}
          >
            {/*
              Stated before the switches, because it governs all of them. Web has no push token at
              all, which is a fact about the platform rather than a failure, and says so.
            */}
            {device && !device.ok ? (
              <SheetCard
                bordered
                borderRadius={radius.panel}
                padding={space.s14}
                style={{ marginBottom: space.s14 }}
              >
                <Text variant="rowPrimary" color={colors.warn}>
                  {device.reason === 'denied'
                    ? 'Notifications are turned off for this app'
                    : device.reason === 'unsupported'
                      ? 'This device cannot receive push'
                      : device.reason === 'unconfigured'
                        ? 'Push is not configured in this build'
                        : 'This device could not be registered'}
                </Text>
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  {device.detail} Nothing below will arrive until that is fixed.
                </Text>
              </SheetCard>
            ) : null}

            {data.map((p) => (
              <SwitchRow
                key={p.kind}
                label={p.label}
                on={enabledFor(p.kind, p.enabled)}
                caption={() => p.detail}
                onChange={(on) => {
                  setPending((s) => ({ ...s, [p.kind]: on }));
                  void system.setNotificationPref(p.kind, on);
                }}
              />
            ))}
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s16 }}>
              {/*
                Said out loud because it is the one people turn off first and regret. The trade that
                did not happen is the one you need to hear about.
              */}
              Turning off &quot;a trade was stopped&quot; means the limits can refuse something and
              you will not hear about it until you open the app.
            </Text>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

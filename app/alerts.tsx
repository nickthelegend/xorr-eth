/**
 * Screen 18 — Alerts. screens.md Group D.
 *
 * "{n} of 5 on". Five 70px switch rows. Note strip:
 * "Circuit breakers stay on even when notifications are muted. They stop trading, not just your
 * phone." Ghost "Add custom alert".
 */
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  LoadingRows,
  NoteStrip,
  Screen,
  ScreenHeader,
  SwitchRow,
} from '@/design/components';
import { ink } from '@/design/colors';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { alertsOnCount, useStore } from '@/state/store';

export default function Alerts() {
  const router = useRouter();
  const alerts = useStore((s) => s.alerts);
  const toggleAlert = useStore((s) => s.toggleAlert);
  const { data, loading } = useAsync(() => repos.alerts.list(), []);

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Alerts</Text>}
        right={
          <Text style={[type.footnote, { color: ink.i28 }]}>
            {alertsOnCount(alerts)} of {data?.length ?? 5} on
          </Text>
        }
      />

      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        The agents watch everything. These are the moments they interrupt you for.
      </Text>

      <Screen.Content style={{ marginTop: 14 }}>
        {loading && !data ? (
          <LoadingRows count={5} height={70} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {(data ?? []).map((a) => {
              const on = alerts[a.name] ?? a.default;
              return (
                <SwitchRow
                  key={a.id}
                  label={a.name}
                  // The caption changes with state, as design.md §5 requires.
                  caption={on ? a.detail : 'Off — you will not be interrupted for this'}
                  value={on}
                  onValueChange={() => {
                    toggleAlert(a.name);
                    void repos.alerts.setEnabled(a.id, !on);
                  }}
                  height={70}
                  size="alerts"
                />
              );
            })}

            <NoteStrip kind="risk" style={{ marginTop: 16 }}>
              Circuit breakers stay on even when notifications are muted. They stop trading, not
              just your phone.
            </NoteStrip>
          </ScrollView>
        )}
      </Screen.Content>

      <Button
        label="Add custom alert"
        variant="ghost"
        onPress={() => router.push('/alerts/new')}
        style={{ marginTop: 14 }}
      />
    </Screen>
  );
}

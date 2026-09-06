/**
 * Screen 18 — Alerts. screens.md Group D.
 *
 * "{n} of 5 on". Five 70px switch rows. Note strip:
 * "Circuit breakers stay on even when notifications are muted. They stop trading, not just your
 * phone." Ghost "Add custom alert".
 */
import React, { useState } from 'react';
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
import { useStore } from '@/state/store';
import { api } from '@/data/api';
import type { Alert } from '@/data/types';

/**
 * What this alert is doing right now, in one line.
 *
 * There are three states behind a switch that is on, not one: watching, fired-and-waiting, and
 * fired-before-but-watching-again. Collapsing them into the alert's own description was fine while
 * nothing evaluated alerts; now that they fire, "already went off" is the most useful thing this
 * row can say, and an alert that has gone off once but is armed again is not the same as one that
 * has never gone off at all.
 */
function firedCaption(a: Alert): string {
  if (a.armed === false && a.lastFiredAt) {
    return `Went off ${when(a.lastFiredAt)} — quiet until the condition clears`;
  }
  if (a.fireCount && a.lastFiredAt) {
    return `Watching · last went off ${when(a.lastFiredAt)}`;
  }
  return a.detail;
}

/** Relative where it reads better, absolute once "hours ago" stops meaning anything. */
function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Alerts() {
  const router = useRouter();
  const alerts = useStore((s) => s.alerts);
  const toggleAlert = useStore((s) => s.toggleAlert);
  const { data, loading } = useAsync(() => repos.alerts.list(), []);
  const prefs = useAsync(
    () =>
      api.get<{ kind: string; label: string; detail: string; enabled: boolean }[]>(
        '/notifications/prefs',
      ),
    [],
  );
  /** Optimistic local state, reverted if the server disagrees. */
  const [pushOn, setPushOn] = useState<Record<string, boolean>>({});

  /*
   * Count the alerts that EXIST, not the toggle map.
   *
   * `alertsOnCount` counts every key the local store has ever written, which still held entries
   * for the fixture catalogue this account replaced — so a wallet with one alert read "2 of 1 on".
   * A count larger than the list it counts is the kind of small wrongness that makes a user stop
   * believing the rest of the screen.
   */
  const onCount = (data ?? []).filter((a) => alerts[a.name] ?? a.default).length;

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Alerts</Text>}
        right={
          <Text style={[type.footnote, { color: ink.i28 }]}>
            {onCount} of {data?.length ?? 0} on
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
                  caption={!on ? 'Off — you will not be interrupted for this' : firedCaption(a)}
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

            {/*
              What the BOT interrupts you for, as opposed to what you asked it to watch.
              The switches above are alerts you set. These are the app's own notifications, and
              `send()` has carried a kind since it was written with nothing reading it — so muting
              the app meant losing "your cap stopped a trade" along with the routine fills. Those
              are not the same thing and should not share one switch.
            */}
            <Text style={[type.cardTitleSm, { color: ink.full, marginTop: 26, marginBottom: 4 }]}>
              What the bot tells you
            </Text>
            {(prefs.data ?? []).map((p) => (
              <SwitchRow
                key={p.kind}
                label={p.label}
                caption={p.detail}
                value={pushOn[p.kind] ?? p.enabled}
                onValueChange={() => {
                  const next = !(pushOn[p.kind] ?? p.enabled);
                  setPushOn((m) => ({ ...m, [p.kind]: next }));
                  void api.post('/notifications/prefs', { kind: p.kind, enabled: next }).catch(() => {
                    // Put it back. A switch that stays where you left it while the server never
                    // agreed is the failure this whole screen used to be.
                    setPushOn((m) => ({ ...m, [p.kind]: !next }));
                  });
                }}
                height={70}
                size="alerts"
              />
            ))}

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

/**
 * Notification inbox — PLAN.md 10.10 [G14].
 *
 * A push can be missed, dismissed, or muted. The inbox is where the thing the push was about
 * still lives, and every row deep-links to the same place the notification would have.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  IconButton,
  LoadingRows,
  Row,
  Screen,
  ScreenHeader,
} from '@/design/components';
import { eventDotColor } from '@/design/components/NoteStrip';
import { ink } from '@/design/colors';
import { type } from '@/design/type';
import { activityDot } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { routeFor, type AlertKind } from '@/notifications/routes';

/** Which alert an audit row corresponds to, so a tap lands where the push would have. */
function kindFor(action: string, kind: string): AlertKind {
  if (/proposal/i.test(action)) return 'proposal-awaiting';
  if (/skipped|blocked|could not/i.test(action)) return 'strategy-blocked';
  if (/bought|sold|filled/i.test(action)) return 'dca-executed';
  if (kind === 'risk') return 'daily-cap';
  return 'price';
}

export default function Inbox() {
  const router = useRouter();
  const { data, loading } = useAsync(() => repos.activity.list(), []);

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              name="back"
              accessibilityLabel="Back"
              background="transparent"
              color={ink.i55}
              onPress={() => router.back()}
            />
            <Text style={[type.screenTitle, { color: ink.full }]}>Inbox</Text>
          </View>
        }
      />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Everything the bot would have interrupted you for, whether or not it reached your phone.
      </Text>

      <Screen.Content style={{ marginTop: 14 }}>
        {loading && !data ? (
          <LoadingRows count={5} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState text="Nothing to catch up on." />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {(data ?? []).map((r) => (
              <Row
                key={r.id}
                mark={
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: eventDotColor[activityDot(r.kind)],
                    }}
                  />
                }
                primary={r.action}
                secondary={`${r.detail} · ${r.t}`}
                height={68}
                onPress={() => router.push(routeFor(kindFor(r.action, r.kind)) as never)}
              />
            ))}
          </ScrollView>
        )}
      </Screen.Content>
    </Screen>
  );
}

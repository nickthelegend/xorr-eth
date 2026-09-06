/**
 * Notification inbox — PLAN.md 10.10 [G14].
 *
 * A push can be missed, dismissed, or muted. The inbox is where the thing the push was
 * about still lives, and every row deep-links to the same place the notification would have.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  Fill,
  IconButton,
  LoadingRows,
  Row,
  Screen,
  Text,
  noteDotColor,
  radius,
  space,
} from '@/ui';
import { activityDot } from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { routeFor, type AlertKind } from '@/notifications/routes';

const DOT = 8;

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle">Inbox</Text>
      </View>
      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Everything the bot would have interrupted you for, whether or not it reached your
        phone.
      </Text>

      <Fill style={{ marginTop: space.s14 }}>
        {loading && !data ? (
          <LoadingRows count={5} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            text="Nothing to catch up on. The bot only writes here when something needs you."
            actionLabel="See what it is allowed to do"
            onAction={() => router.push('/safety')}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {(data ?? []).map((r) => (
              <Row
                key={r.id}
                left={
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: radius.full,
                      backgroundColor: noteDotColor[activityDot(r.kind)],
                    }}
                  />
                }
                title={r.action}
                secondary={`${r.detail} · ${r.t}`}
                height={68}
                onPress={() => router.push(routeFor(kindFor(r.action, r.kind)) as never)}
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

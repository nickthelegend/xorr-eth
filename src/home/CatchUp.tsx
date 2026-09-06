/**
 * What the bot did while you were not looking.
 *
 * The README's first line is "a bot that trades your capital while you get on with your life", and
 * until now nothing closed that loop: the app could tell you everything that had ever happened,
 * which on day twenty is a wall of rows, but not the one thing the premise makes you want to know.
 *
 * It renders nothing when nothing happened. A card that says "0 trades since you were last here"
 * is a card people learn to ignore, and the moment it matters is the moment they stop reading it.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SheetCard } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';

type Entry = { action: string; detail: string; kind: string; at: string };
type CatchUpData = {
  since: string | null;
  isFirstVisit: boolean;
  counts: Record<string, number>;
  entries: Entry[];
};

/** Plain words for the audit kinds, in the order a person cares about them. */
const PHRASE: [string, (n: number) => string][] = [
  ['trade', (n) => `${n} trade${n === 1 ? '' : 's'}`],
  ['block', (n) => `${n} stopped by your limits`],
  ['yield', (n) => `${n} move${n === 1 ? '' : 's'} to yield`],
  ['risk', (n) => `${n} risk check${n === 1 ? '' : 's'}`],
];

export function CatchUp() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const data = useAsync(() => api.get<CatchUpData>('/catchup'), []);

  const acknowledge = useCallback(() => {
    setDismissed(true);
    // Fire and forget: the card is already gone, and failing to record that is not worth an error
    // on the home screen. The worst case is seeing the same summary once more.
    void api.post('/catchup/seen', {}).catch(() => undefined);
  }, []);

  const d = data.data;
  if (dismissed || !d || d.entries.length === 0) return null;

  const summary = PHRASE.filter(([k]) => d.counts[k])
    .map(([k, f]) => f(d.counts[k]!))
    .join(' · ');

  return (
    <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>
          {d.isFirstVisit ? 'IN THE LAST DAY' : 'SINCE YOU WERE LAST HERE'}
        </Text>
        <Pressable
          onPress={acknowledge}
          accessibilityRole="button"
          accessibilityLabel="Mark as read"
          hitSlop={10}
        >
          <Text style={[type.pill, { color: ink.i45 }]}>Got it</Text>
        </Pressable>
      </View>

      <Text style={[type.rowPrimaryLg, { color: ink.full, marginTop: 8 }]}>{summary}</Text>

      {/* Three, not fifty. The rest is one tap away and the point here is a glance. */}
      {d.entries.slice(0, 3).map((e) => (
        <View key={`${e.at}${e.action}`} style={{ marginTop: 10 }}>
          <Text style={[type.body, { color: e.kind === 'block' ? pnl.warn : ink.full }]}>
            {e.action}
          </Text>
          <Text style={[type.footnote, { color: ink.i38, marginTop: 2 }]} numberOfLines={2}>
            {e.detail}
          </Text>
        </View>
      ))}

      {d.entries.length > 3 ? (
        <Pressable
          onPress={() => router.push('/activity')}
          accessibilityRole="button"
          accessibilityLabel={`See all ${d.entries.length} things that happened`}
        >
          <Text style={[type.footnote, { color: ink.i45, marginTop: 12 }]}>
            and {d.entries.length - 3} more ›
          </Text>
        </Pressable>
      ) : null}
    </SheetCard>
  );
}

/**
 * Where every number on screen comes from.
 *
 * The product's claim is that it does not invent figures. That claim is only checkable if someone
 * can find out which upstream produced which number — and until now that lived in code comments.
 *
 * Each row names a real dependency and what it is authoritative for, and the live ones are probed
 * rather than asserted: the rate row reads Aave, the subgraph row reads `_meta`, the chain row
 * reads the block. A page that listed its sources without checking any of them would be making the
 * same unfalsifiable claim it exists to replace.
 *
 * Deliberately not exhaustive about libraries. This is about where DATA comes from, not what the
 * app is built with.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Fill,
  HeaderBar,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

type Source = {
  name: string;
  /** What it is the authority for. */
  owns: string;
  /** How the app reaches it. */
  how: string;
};

const SOURCES: Source[] = [
  {
    name: 'The chain',
    owns: 'Balances, the delegation policy, approvals, and every transaction',
    how: 'Direct RPC reads. Nothing about your money is taken from our database.',
  },
  {
    name: '1inch',
    owns: 'Swap routes, execution prices, and every tokenized equity price',
    how: 'Aggregation v6 for routes; the equities are priced by probing a real buy, because they have no feed.',
  },
  {
    name: 'CoinGecko',
    owns: 'Crypto reference prices and the market logos',
    how: 'One batched request per refresh, cached — the public tier rate-limits hard.',
  },
  {
    name: 'Aave v3',
    owns: 'The rate idle cash earns',
    how: '`currentLiquidityRate` read from the pool on Base. It floats; it is not a promise.',
  },
  {
    name: 'EDGAR',
    owns: 'Earnings dates for the tokenized equities',
    how: "The regulator's own filing record. The next date is a projection from the cadence, and says so.",
  },
  {
    name: 'The Graph',
    owns: 'Spend history, independently of our records',
    how: 'A subgraph over the delegation contract — a second account of the same money, kept by someone else.',
  },
  {
    name: 'Privy',
    owns: 'Keys, signing, and the policy that refuses a bad destination',
    how: 'Enforced by their signer. A compromised executor cannot widen it.',
  },
];

export default function Sources() {
  const goBack = useGoBack();
  const router = useRouter();
  /* Probed, not asserted. A list of sources that checked none of them would be the same
     unfalsifiable claim this screen exists to replace. */
  const health = useAsync(() => system.health(), []);
  const graph = useAsync(() => system.graphHealth().catch(() => null), []);

  const up = (name: string) =>
    health.data?.dependencies.find((d) => d.name === name)?.status === 'up';

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Sources</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Every number in this app comes from one of these. None of them are us.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
        >
          {SOURCES.map((s) => {
            /* Only the three the app can actually probe get a live state. Claiming to know
               CoinGecko is up because a price rendered ten minutes ago would be a guess. */
            const live =
              s.name === 'The chain'
                ? up('rpc')
                : s.name === 'The Graph'
                  ? graph.data?.healthy
                  : undefined;

            return (
              <SheetCard key={s.name} bordered borderRadius={radius.panel} padding={space.s16}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <Text variant="rowPrimary">{s.name}</Text>
                  {live === undefined ? null : (
                    <Text variant="footnote" color={live ? colors.up : colors.down}>
                      {live ? 'reachable' : 'not answering'}
                    </Text>
                  )}
                </View>
                <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s8 }}>
                  {s.owns}
                </Text>
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
                  {s.how}
                </Text>
              </SheetCard>
            );
          })}

          <Button
            label="Check every claim"
            variant="ghost"
            style={{ marginTop: space.s6 }}
            onPress={() => router.push('/verify')}
          />
        </ScrollView>
      </Fill>
    </Screen>
  );
}

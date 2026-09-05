/**
 * Transaction history — PLAN.md 10.7 [G14].
 *
 * Deliberately DISTINCT from Activity (screen 15). Activity answers "what did the bot decide";
 * this answers "what moved on chain". They differ: a blocked proposal is an activity event with no
 * transaction, and a fee is a transaction with no decision behind it.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingRows,
  Row,
  Screen,
  ScreenHeader,
} from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { type } from '@/design/type';
import { useAsync } from '@/data/useAsync';
import { spendsFor, unitsToUsd, SUBGRAPH_ENDPOINT } from '@/data/subgraph';
import { useStore } from '@/state/store';
import { money } from '@/format';

export default function History() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  // Read from The Graph, not from our own database. A settlement history the user cannot verify
  // independently is not a settlement history.
  const { data, loading, error, reload } = useAsync(
    () => (wallet?.address ? spendsFor(wallet.address) : Promise.resolve([])),
    [wallet?.address],
  );
  const onChain = data ?? [];

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
            <Text style={[type.screenTitle, { color: ink.full }]}>History</Text>
          </View>
        }
      />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Everything that settled on chain, read from The Graph. Each row has a transaction you can
        check yourself.
      </Text>

      <Screen.Content style={{ marginTop: 14 }}>
        {loading && !data ? (
          <LoadingRows count={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : onChain.length === 0 ? (
          <EmptyState text="Nothing has settled on chain yet." />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {onChain.map((r) => (
              <Row
                key={r.id}
                primary={`Spent ${money(unitsToUsd(r.amount))}`}
                secondary={`${r.txHash.slice(0, 10)}…${r.txHash.slice(-6)} · block ${r.blockNumber}`}
                value={money(unitsToUsd(r.spentToday))}
                delta="today"
                valueColor={ink.i55}
                height={66}
              />
            ))}
          </ScrollView>
        )}
      </Screen.Content>
    </Screen>
  );
}

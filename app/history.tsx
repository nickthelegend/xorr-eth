/**
 * Transaction history — PLAN.md 10.7 [G14].
 *
 * Deliberately DISTINCT from Activity (screen 15). Activity answers "what did the bot
 * decide"; this answers "what settled on chain". They differ: a blocked proposal is an
 * activity event with no transaction, and a fee is a transaction with no decision behind it.
 *
 * The rows come from **The Graph**, not from our own database. A settlement history the user
 * cannot verify independently is not a settlement history — it is our word for it.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  Fill,
  IconButton,
  LoadingRows,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  size,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { spendsFor, unitsToUsd } from '@/data/subgraph';
import { useStore } from '@/state/store';

export default function History() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const { data, loading, error, reload } = useAsync(
    () => (wallet?.address ? spendsFor(wallet.address) : Promise.resolve([])),
    [wallet?.address],
  );
  const onChain = data ?? [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <IconButton
          name="back"
          accessibilityLabel="Back"
          background="none"
          onPress={() => router.back()}
        />
        <Text variant="screenTitle">History</Text>
      </View>
      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Everything that settled on chain, read from The Graph. Each row has a transaction you
        can check yourself.
      </Text>

      <Fill style={{ marginTop: space.s14 }}>
        {loading && !data ? (
          <LoadingRows count={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : onChain.length === 0 ? (
          <EmptyState
            text="Nothing has settled on chain yet. This reads from the index, not from us."
            actionLabel="Check every claim yourself"
            onAction={() => router.push('/judge')}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {onChain.map((r) => (
              <Row
                key={r.id}
                title={`Spent ${money(unitsToUsd(r.amount))}`}
                secondary={`${r.txHash.slice(0, 10)}…${r.txHash.slice(-6)} · block ${r.blockNumber}`}
                value={<Price color={colors.ink55}>{money(unitsToUsd(r.spentToday))}</Price>}
                delta="today"
                height={size.rowLg}
              />
            ))}
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

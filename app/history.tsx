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
import { useGoBack } from '@/nav/useGoBack';
import {
  BackButton,
  EmptyState,
  ErrorState,
  Fill,
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
import { system } from '@/data/system';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { spendsFor, unitsToUsd } from '@/data/subgraph';
import { useStore } from '@/state/store';

export default function History() {
  const router = useRouter();
  const goBack = useGoBack();
  const wallet = useStore((s) => s.wallet);
  const { data, loading, error, reload } = useAsync(
    () => (wallet?.address ? spendsFor(wallet.address) : Promise.resolve([])),
    [wallet?.address],
  );
  /*
   * Whether the index this screen reads covers the contract this build trades through.
   *
   * Without it, an empty answer has two very different causes and one sentence. On the fork
   * deployment — 33 filled runs, every one of them on chain — this screen said "Nothing has
   * settled on chain yet", because the subgraph indexes the Sepolia contract and the fork trades
   * chain 8453. The index was not wrong; the question was never about it.
   */
  const index = useAsync(() => system.graphHealth().catch(() => null), []);
  const covers = index.data?.indexesThisDeployment !== false;
  // Pulling down is the gesture people already try on a list of things that keep changing.
  const refresh = useRefreshControl(reload);
  const onChain = data ?? [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        <BackButton onPress={() => goBack()} />
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
            text={
              covers
                ? 'Nothing has settled on chain yet. This reads from the index, not from us.'
                : 'The subgraph does not index the contract this build trades through, so it has nothing to say about this wallet — settled or not. Activity is read from the executor and is unaffected.'
            }
            actionLabel={covers ? 'Check every claim yourself' : 'See what the index does cover'}
            onAction={() => router.push(covers ? '/judge' : '/graph')}
          />
        ) : (
          <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false}>
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

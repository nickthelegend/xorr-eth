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
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

export default function History() {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(() => repos.activity.list(), []);

  // Only events that produced a signature actually touched the chain.
  const onChain = (data ?? []).filter((r) => r.signature);

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
        Everything that settled on chain. Each row has a signature you can check yourself.
      </Text>

      <Screen.Content style={{ marginTop: 14 }}>
        {loading && !data ? (
          <LoadingRows count={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : onChain.length === 0 ? (
          <EmptyState text="Nothing has settled yet." />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {onChain.map((r) => (
              <Row
                key={r.id}
                primary={r.action}
                secondary={`${r.signature!.slice(0, 10)}…${r.signature!.slice(-6)} · ${r.t}`}
                value={r.amount || undefined}
                valueColor={r.amount.startsWith('+') ? pnl.up : ink.i55}
                height={66}
              />
            ))}
          </ScrollView>
        )}
      </Screen.Content>
    </Screen>
  );
}

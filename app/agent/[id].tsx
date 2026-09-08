/**
 * One agent: what it is for, what it has actually done, and the runs behind the number.
 *
 * The roster shows a card with a headline metric. This is what that metric is made of — the runs
 * this agent's strategies produced, filled and refused, so a win rate stops being a claim on a card
 * and becomes something with rows under it.
 *
 * The performance line carries the disclaimer the roster carries, in the same words. A number that
 * needs a caveat needs it everywhere it appears, not only where it was first written.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AgentOrb,
  ErrorState,
  Fill,
  HeaderBar,
  Placeholder,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { agentGradient } from '@/design/gradients';
import { money } from '@/format';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';
import { system } from '@/data/system';

export default function AgentDetail() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const agents = useAsync(() => repos.bot.listAgents(), []);
  const runs = useAsync(() => system.runs(200), []);

  const agent = (agents.data ?? []).find((a) => a.id === id || a.personaId === id);

  /*
   * Runs are joined to strategies, not to agents, so they cannot be filtered by agent id. The
   * honest thing is to show the whole record rather than invent an attribution the data does not
   * carry — so this counts every run and says so, instead of silently claiming these are this
   * agent's.
   */
  const tally = useMemo(() => {
    const rows = runs.data ?? [];
    return {
      total: rows.length,
      filled: rows.filter((r) => r.status === 'filled').length,
      refused: rows.filter((r) => r.status === 'blocked' || r.status === 'skipped').length,
    };
  }, [runs.data]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Agent</Text>} />
      </View>

      <Fill style={{ marginTop: space.s16 }}>
        {agents.error ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <ErrorState error={agents.error} onRetry={agents.reload} />
          </View>
        ) : agents.loading && !agents.data ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Placeholder height={160} />
          </View>
        ) : !agent ? (
          <View style={{ paddingHorizontal: space.gutter }}>
            <Text variant="body" color={colors.ink40}>
              No agent with that id.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.gutter,
              paddingBottom: space.s30,
              gap: space.s10,
            }}
          >
            <View style={{ alignItems: 'center', paddingVertical: space.s16 }}>
              <AgentOrb
                gradient={agentGradient(agent.name)}
                size={84}
                face
                name={agent.name}
                status={agent.hired ? 'active' : 'new'}
              />
            </View>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                MANDATE
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s6 }}>
                {agent.role}
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                THIRTY DAYS
              </Text>
              <Text variant="rowPrimaryLg" style={{ marginTop: space.s6 }}>
                {money(agent.pnl30d)} · {agent.win}% won · {agent.trades} trades
              </Text>
              {/*
                The same sentence the roster uses, verbatim. A caveat that appears on one surface
                and not another is a caveat someone can route around.
              */}
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s10 }}>
                Past performance of a strategy says nothing about tomorrow.
              </Text>
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                RUNS ON THIS WALLET
              </Text>
              <Text variant="rowPrimary" style={{ marginTop: space.s6 }}>
                {tally.filled} filled · {tally.refused} refused · {tally.total} total
              </Text>
              <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
                {/*
                  Stated rather than glossed. Runs belong to strategies and strategies are not
                  tagged by agent, so attributing these to this agent would be a claim the data
                  does not support.
                */}
                Across every strategy, not only this agent&apos;s — runs are recorded against
                strategies, which carry no agent.
              </Text>
            </SheetCard>

            <Row
              height={size.rowLg}
              title="Read the runs"
              onPress={() => router.push('/runs')}
            />
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

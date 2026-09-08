/**
 * The limits each agent is holding itself to.
 *
 * `riskLimits` is persisted per agent and shaped by the agent — a momentum agent caps its position
 * size, a drawdown guard has a threshold it acts at. The settings screen edits one agent's at a
 * time; nothing showed all four together, which is the only way to notice that one of them is
 * carrying a limit far looser than the rest.
 *
 * Rendered key by key rather than through a layout written for one agent's fields, because the
 * shape differs per agent and a fixed layout would silently drop whatever it did not expect.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  AgentOrb,
  EmptyState,
  ErrorState,
  Fill,
  HeaderBar,
  LoadingRows,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { agentGradient } from '@/design/gradients';
import { useAsync } from '@/data/useAsync';
import { repos } from '@/data';

export default function Risk() {
  const goBack = useGoBack();
  const { data, loading, error, reload } = useAsync(() => repos.bot.listAgents(), []);

  const agents = data ?? [];
  const withLimits = agents.filter((a) => Object.keys(a.riskLimits ?? {}).length > 0);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Risk limits</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          What each agent holds itself to, on top of the cap the contract enforces.
        </Text>
      </View>

      <Fill style={{ marginTop: space.s16, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingRows count={4} height={size.rowLg} />
        ) : withLimits.length === 0 ? (
          <EmptyState
            text="No agent carries its own limits. The daily cap and the venue allowlist are the only things constraining them, and those are enforced on-chain."
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            {withLimits.map((a) => (
              <SheetCard key={a.id} bordered borderRadius={radius.panel} padding={space.s16}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
                  <AgentOrb gradient={agentGradient(a.name)} size={52} face />
                  <Text variant="rowPrimary" style={{ flex: 1 }}>
                    {a.name}
                  </Text>
                </View>

                {/*
                  Key by key. The shape is per-agent, and a layout written for one would drop the
                  fields it did not expect without saying so.
                */}
                {Object.entries(a.riskLimits ?? {}).map(([k, v]) => (
                  <View
                    key={k}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s10,
                    }}
                  >
                    <Text variant="secondarySm" color={colors.ink65}>
                      {k}
                    </Text>
                    <Text variant="secondarySm">{String(v)}</Text>
                  </View>
                ))}
              </SheetCard>
            ))}

            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
              These are the agent&apos;s own rules and it can be wrong about them. The daily cap and
              the venue allowlist are enforced by the contract, which cannot.
            </Text>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}

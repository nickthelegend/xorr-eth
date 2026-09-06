/**
 * Screen 11 — Agent roster / hire. screens.md Group C.
 *
 * "Agents" + "{n} of {m} hired". Cards (surface, radius 24, padding 16): 52pt orb, name,
 * role, `up` metric, Hire/Hired pill.
 * Footnote "Past performance of a strategy says nothing about tomorrow."
 *
 * Hire and fire go to the SERVER. This used to flip a boolean in zustand, so the roster
 * survived a refresh and nothing else — reinstall the app and the agents trading your money
 * were gone. The server is the source of truth, and the screen reloads from it rather than
 * guessing what the write did.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { agentGradient } from '@/design/gradients';
import {
  AgentOrb,
  Fill,
  IconButton,
  LoadingRows,
  Press,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  size,
  space,
} from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

/** screens.md gives this one: 40pt, radius 20. Taller than a filter pill — it is a decision. */
const HIRE_H = 40;

export default function Roster() {
  const router = useRouter();
  const { data, loading, reload } = useAsync(() => repos.bot.listAgents(), []);
  // Which card is mid-flight. Hiring is a write, and a button that does nothing visible
  // while it travels reads as broken.
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const agents = data ?? [];
  const hiredCount = agents.filter((a) => a.hired).length;

  async function toggle(agent: (typeof agents)[number]) {
    setBusy(agent.id);
    setError(undefined);
    try {
      if (agent.hired) await repos.bot.fire(agent.id);
      else await repos.bot.hire(agent.personaId ?? agent.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
          <IconButton
            name="back"
            accessibilityLabel="Back"
            background="none"
            onPress={() => router.back()}
          />
          <Text variant="screenTitle">Agents</Text>
        </View>
        <Text variant="footnote" color={colors.ink28}>
          {hiredCount} of {agents.length || 4} hired
        </Text>
      </View>

      {error ? (
        <Text variant="footnote" color={colors.down} style={{ marginTop: space.s8 }}>
          {`That did not go through: ${error}`}
        </Text>
      ) : null}

      <Fill style={{ marginTop: space.s20 }}>
        {loading && !data ? (
          <LoadingRows count={4} height={92} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: space.s12 }}
          >
            {agents.map((a) => {
              const isHired = !!a.hired;
              const inFlight = busy === a.id;
              return (
                <SheetCard key={a.id} borderRadius={radius.panelLg} padding={space.s16}>
                  <Press
                    onPress={() => router.push(`/bot/${a.id}/intro`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, ${a.role}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.s14 }}
                  >
                    <AgentOrb gradient={agentGradient(a.name)} size={size.orb52} face specular />
                    <View style={{ flex: 1, gap: space.s4 }}>
                      <Text variant="cardTitle">{a.name}</Text>
                      <Text variant="secondarySm">{a.role}</Text>
                      <Text variant="orbStatus">{a.metric}</Text>
                    </View>
                  </Press>
                  <Press
                    onPress={() => void toggle(a)}
                    disabled={inFlight}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isHired, disabled: inFlight }}
                    accessibilityLabel={isHired ? `Fire ${a.name}` : `Hire ${a.name}`}
                    style={{
                      marginTop: space.s14,
                      height: HIRE_H,
                      borderRadius: radius.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isHired ? colors.hiredBg : colors.ink,
                    }}
                  >
                    <Text variant="control" color={isHired ? colors.up : colors.bg}>
                      {inFlight ? '…' : isHired ? 'Hired' : 'Hire'}
                    </Text>
                  </Press>
                </SheetCard>
              );
            })}
          </ScrollView>
        )}
      </Fill>

      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s14 }}
      >
        Past performance of a strategy says nothing about tomorrow.
      </Text>
    </Screen>
  );
}

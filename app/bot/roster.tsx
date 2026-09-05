/**
 * Screen 11 — Agent roster / hire. screens.md Group C.
 *
 * "Agents" + "{n} of 4 hired". Four cards (surface, radius 24, padding 16): 52px orb, name, role,
 * `up` metric, Hire/Hired pill (white/#000 -> rgba(43,216,122,.15)/#2BD87A).
 * Footnote "Past performance of a strategy says nothing about tomorrow."
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AgentOrb, IconButton, LoadingRows, Screen, ScreenHeader, SheetCard } from '@/design/components';
import { ink, pnl } from '@/design/colors';
import { agentGradient } from '@/design/gradients';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
export default function Roster() {
  const router = useRouter();
  const { data, loading, reload } = useAsync(() => repos.bot.listAgents(), []);
  // Which card is mid-flight. Hiring is a write, and a button that does nothing visible while it
  // travels reads as broken.
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const agents = data ?? [];
  const hiredCount = agents.filter((a) => a.hired).length;

  /**
   * Hire and fire go to the SERVER.
   *
   * This used to flip a boolean in zustand, so the roster survived a refresh and nothing else —
   * reinstall the app and the agents trading your money were gone. The server is the source of
   * truth now, and the screen reloads from it rather than guessing what the write did.
   */
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
            <Text style={[type.screenTitle, { color: ink.full }]}>Agents</Text>
          </View>
        }
        right={
          <Text style={[type.footnote, { color: ink.i28 }]}>
            {hiredCount} of {agents.length || 4} hired
          </Text>
        }
      />

      {error ? (
        <Text style={[type.footnote, { color: pnl.down, marginTop: 8 }]}>
          {`That did not go through: ${error}`}
        </Text>
      ) : null}

      <Screen.Content style={{ marginTop: 20 }}>
        {loading && !data ? (
          <LoadingRows count={4} height={92} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {agents.map((a) => {
              const isHired = !!a.hired;
              return (
                <SheetCard key={a.id} radius={radius.xl2} padding={16}>
                  <Pressable
                    onPress={() => router.push(`/bot/${a.id}/intro`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, ${a.role}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  >
                    <AgentOrb
                      gradient={agentGradient(a.name)}
                      size={52}
                      face
                      specular
                      breathe={isHired}
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[type.cardTitleSm, { color: ink.full }]}>{a.name}</Text>
                      <Text style={[type.secondary, { color: ink.i38 }]}>{a.role}</Text>
                      <Text style={[type.footnote, { color: pnl.up, fontWeight: '600' }]}>
                        {a.metric}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void toggle(a)}
                    disabled={busy === a.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isHired }}
                    accessibilityLabel={isHired ? `Fire ${a.name}` : `Hire ${a.name}`}
                    style={({ pressed }) => ({
                      marginTop: 14,
                      height: 40,
                      borderRadius: radius.lg2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isHired ? pnl.hiredBg : ink.full,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={[type.pill, { color: isHired ? pnl.up : '#000000' }]}>
                      {busy === a.id ? '…' : isHired ? 'Hired' : 'Hire'}
                    </Text>
                  </Pressable>
                </SheetCard>
              );
            })}
          </ScrollView>
        )}
      </Screen.Content>

      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 14 }]}>
        Past performance of a strategy says nothing about tomorrow.
      </Text>
    </Screen>
  );
}

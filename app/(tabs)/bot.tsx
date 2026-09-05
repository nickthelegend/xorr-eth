/**
 * Screen 12 — Bot chat. THE centre tab after the pivot (PLAN.md §3.5).
 *
 * Header: 34px orb, name, "Watching 14 markets" in `up`.
 * Thread: date divider, bot bubble (#111214, radius 20 20 20 6, maxWidth 78%), then the
 * proposed-trade card — "PROPOSED TRADE" eyebrow in `up` + a LIVE countdown, action 21/700 +
 * notional, three 14px stat tiles (Entry / Stop in `down` / Target in `up`), rationale,
 * Skip (flex:1, control) / Approve (flex:1.4, white).
 * On decision the buttons are REPLACED by a reply bubble. Composer at the foot.
 *
 * [G27] The expiry is real: a countdown that expires the proposal, disables the buttons and posts
 * a system line. The handoff shipped the static string "expires 4:12".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AgentOrb, Button, ButtonRow, Screen, SheetCard } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { agentGradient } from '@/design/gradients';
import { DURATION } from '@/design/motion';
import { EASING } from '@/design/easing';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { useReducedMotion, motionDuration } from '@/design/useReducedMotion';
import { mmss } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { renderSegments, type ThreadMessage } from '@/bot/message';
import {
  botProse,
  declinedMessage,
  expiredMessage,
  proposalMessage,
  useThread,
  userMessage,
  withDividers,
} from '@/bot/thread';
import { voice } from '@/bot/message';
import { useTone } from '@/bot/tone';
import type { Proposal } from '@/data/types';

export default function BotChat() {
  const scroller = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const { tone } = useTone();
  const { messages, proposal, decided, hydrated, hydrate, append, setProposal, setDecided, markRead } =
    useThread();

  // Ask for an open proposal; if there is none, ask the agent to CONSIDER one. Without this the
  // approve-before-execute pipeline had no producer and the thread was permanently empty.
  const { data } = useAsync(async () => {
    const open = await repos.bot.currentProposal();
    if (open) return { proposal: open, declined: undefined as string | undefined };
    return repos.bot.generateProposal();
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  // Seed the thread once, from whatever the agent actually decided.
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || !data || seeded.current) return;
    seeded.current = true;

    if (data.proposal) {
      setProposal(data.proposal);
      append(botProse(data.proposal.agent, [voice(data.proposal.opening)]));
      append(proposalMessage(data.proposal.id));
      return;
    }
    // A decline is a message, not a blank screen. "What it chose not to do" is the product.
    if (data.declined) {
      append(
        botProse(agentNameFallback, [
          voice(stripNumbers(data.declined)),
        ]),
      );
    }
  }, [hydrated, data, append, setProposal]);

  const items = useMemo(() => withDividers(messages), [messages]);
  const agentName = proposal?.agent ?? agentNameFallback;

  return (
    <Screen tabbed>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AgentOrb gradient={agentGradient(agentName)} size={34} face breathe />
        <View style={{ gap: 2 }}>
          <Text style={[type.cardTitleSm, { color: ink.full }]}>{agentName}</Text>
          <Text style={[type.footnote, { color: pnl.up, fontWeight: '600' }]}>
            {proposal?.status ?? 'Watching 14 markets'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <Screen.Content>
          <ScrollView
            ref={scroller}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ paddingTop: 20, gap: 14 }}
          >
            {items.map((item, i) =>
              'divider' in item ? (
                <Text
                  key={`d${i}`}
                  style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 6 }]}
                >
                  {item.divider}
                </Text>
              ) : item.type === 'proposal' ? (
                <ProposalCard
                  key={item.id}
                  proposal={proposal}
                  decided={decided}
                  onDecide={async (d) => {
                    setDecided(d);
                    const res = await repos.bot.decideProposal(proposal!.id, d);
                    append(
                      d === 'approve'
                        ? {
                            id: `${item.id}-r`,
                            at: Date.now(),
                            author: 'bot',
                            type: 'fill',
                            agent: agentName,
                            outcome: 'filled',
                            segments: [voice(res.message)],
                          }
                        : declinedMessage(agentName, 'SOL'),
                    );
                  }}
                  onExpire={() => {
                    if (decided) return;
                    setDecided('skip');
                    append(expiredMessage());
                  }}
                />
              ) : (
                <Bubble key={item.id} message={item} />
              ),
            )}
          </ScrollView>
        </Screen.Content>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: surfaces.inputBg,
            borderWidth: hairlineWidth,
            borderColor: borders.input,
            borderRadius: radius.xl,
            paddingHorizontal: 16,
            height: 48,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about this trade…"
            placeholderTextColor={ink.i35}
            style={[type.body, { flex: 1, color: ink.full }]}
            accessibilityLabel="Message the bot"
            editable={!thinking}
            onSubmitEditing={() => {
              const text = draft.trim();
              if (!text || thinking) return;
              append(userMessage(text));
              setDraft('');
              setThinking(true);
              // PLAN.md 11.7: a real question to the real agent. The reply is PROSE ONLY —
              // anything numeric is rejected server-side before it can reach this thread.
              void repos.bot
                .ask({ agentId: agentIdFor(agentName), question: text, tone })
                .then((reply) => append(botProse(agentName, [voice(reply.text)])))
                .catch(() =>
                  append(
                    botProse(agentName, [
                      voice('I could not answer that just now, so I will not guess.'),
                    ]),
                  ),
                )
                .finally(() => setThinking(false));
            }}
            returnKeyType="send"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const agentNameFallback = 'Momentum Scout';

/**
 * The server's decline reasons name a symbol but sometimes a figure too. A voice segment may not
 * carry a number (src/bot/message.ts), so any digits are dropped rather than the message.
 */
function stripNumbers(text: string): string {
  const cleaned = text.replace(/[$]?[\d,.]+%?/g, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length > 4 ? cleaned : 'There is nothing worth proposing right now.';
}

/** The roster ids the server's persona registry uses. */
function agentIdFor(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function Bubble({ message }: { message: ThreadMessage }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(message.type === 'fill' ? 0.96 : 1);

  useEffect(() => {
    // animations.md "If you add motion" #2: a single 250ms scale-in on the filled-order bubble,
    // once, on arrival. Nothing else in the thread animates.
    if (message.type === 'fill') {
      scale.value = withTiming(1, {
        duration: motionDuration(DURATION.slow, reduced),
        easing: EASING,
      });
    }
  }, [message.type, reduced, scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (message.type === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
        <View
          style={{
            backgroundColor: ink.full,
            borderRadius: radius.lg2,
            borderBottomRightRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={[type.body, { color: '#000000' }]}>{message.text}</Text>
        </View>
      </View>
    );
  }

  const segments = 'segments' in message ? message.segments : [];
  const color =
    message.type === 'fill' ? pnl.up : message.type === 'declined' ? pnl.down : ink.full;

  return (
    <Animated.View style={[{ alignSelf: 'flex-start', maxWidth: '78%' }, anim]}>
      <View
        style={{
          backgroundColor: '#111214',
          borderRadius: radius.lg2,
          borderBottomLeftRadius: 6,
          paddingHorizontal: 14,
          paddingVertical: 11,
        }}
      >
        <Text style={[type.body, { color }]}>{renderSegments(segments)}</Text>
      </View>
    </Animated.View>
  );
}

function ProposalCard({
  proposal,
  decided,
  onDecide,
  onExpire,
}: {
  proposal: Proposal | null;
  decided: null | 'approve' | 'skip';
  onDecide: (d: 'approve' | 'skip') => void;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!proposal) return;
    const tick = () => {
      const left = Math.max(0, Math.round((proposal.expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [proposal, onExpire]);

  if (!proposal) return null;
  const expired = remaining === 0;

  return (
    <SheetCard radius={radius.xl} padding={16} style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.eyebrowSm, { color: pnl.up }]}>Proposed trade</Text>
        <Text style={[type.footnote, { color: expired ? pnl.down : ink.i40 }]}>
          {expired ? 'expired' : `expires ${mmss(remaining)}`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
        <Text style={[type.proposalAction, { color: ink.full }]}>{proposal.action}</Text>
        <Text style={[type.body, { color: ink.i40 }]}>{proposal.notional}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <StatTile label="Entry" value={proposal.entry} color={ink.full} />
        <StatTile label="Stop" value={proposal.stop} color={pnl.down} />
        <StatTile label="Target" value={proposal.target} color={pnl.up} />
      </View>

      <Text style={[type.noteBody, { color: ink.i45, marginTop: 14 }]}>{proposal.rationale}</Text>

      {decided ? null : (
        <ButtonRow
          style={{ marginTop: 16 }}
          affirmativeFlex={1.4}
          secondary={
            <Button
              label="Skip"
              variant="secondary"
              height={46}
              disabled={expired}
              onPress={() => onDecide('skip')}
            />
          }
          affirmative={
            <Button
              label="Approve"
              height={46}
              disabled={expired}
              onPress={() => onDecide('approve')}
            />
          }
        />
      )}
    </SheetCard>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: surfaces.surfaceAlt,
        borderRadius: radius.md,
        padding: 10,
        gap: 4,
      }}
    >
      <Text style={[type.footnoteSm, { color: ink.i32 }]}>{label}</Text>
      <Text style={[type.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

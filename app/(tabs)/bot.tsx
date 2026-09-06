/**
 * Screen 12 — Bot chat. THE centre tab after the pivot (PLAN.md §3.5).
 *
 * Rebuilt on `src/ui` and re-checked against the prototype, which corrected three things:
 * the header carries a rule and a "···" control, the composer is a 52pt field with a real
 * 38pt send button (it had none — the only way to send was the keyboard's return key), and
 * the proposal card's stat tiles sit on `surfaceAlt` so they read against the card rather
 * than disappearing into it.
 *
 * The two-button row keeps design.md §5's `flex:1 / flex:1.3`. The prototype drew this one
 * at 1.4; §5 is the rule and `ButtonRow` is where it lives.
 *
 * [G27] The expiry is real: a countdown that expires the proposal, disables the buttons and
 * posts a system line. The handoff shipped the static string "expires 4:12".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '@/design/Icon';
import { agentGradient } from '@/design/gradients';
import {
  AssetMark,
  Button,
  ButtonRow,
  Eyebrow,
  Fill,
  IconButton,
  Press,
  Screen,
  SheetCard,
  StatTile,
  Text,
  border,
  colors,
  divider,
  duration,
  radius,
  size,
  space,
  timing,
  typeScale,
  useReducedMotion,
} from '@/ui';
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
import { DEFAULT_BUY } from '@/data/tradable';
import type { Proposal } from '@/data/types';

/** Prototype metrics local to the chat: bubble tail, thread gutter, composer, send button. */
const TAIL = 6;
const BUBBLE_MAX = '78%' as const;
const THREAD_PAD_H = space.s16;
const COMPOSER_H = 52;
const SEND = 38;

/** A tile inside the proposal card. The card is `surface`, so its tiles step up a shade. */
const TILE_ON_CARD = { backgroundColor: colors.surfaceAlt, borderRadius: radius.tileSm } as const;

export default function BotChat() {
  const scroller = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const { tone } = useTone();
  const { messages, proposal, decided, hydrated, hydrate, append, setProposal, setDecided, markRead } =
    useThread();

  // Ask for an open proposal; if there is none, ask the agent to CONSIDER one. Without this
  // the approve-before-execute pipeline had no producer and the thread was permanently empty.
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
  //
  // The `seeded` ref only guards one mount, and the thread is persisted — so every fresh
  // load appended the same proposal again and the chat showed it two, three, four times.
  // The real guard is the thread's own contents: a proposal already in the thread is
  // already seeded.
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || !data || seeded.current) return;
    seeded.current = true;

    if (data.proposal) {
      const already = messages.some(
        (m) => m.type === 'proposal' && m.proposalId === data.proposal!.id,
      );
      if (already) {
        setProposal(data.proposal);
        return;
      }
    }

    if (data.proposal) {
      setProposal(data.proposal);
      append(botProse(data.proposal.agent, [voice(data.proposal.opening)]));
      append(proposalMessage(data.proposal.id));
      return;
    }
    // A decline is a message, not a blank screen. "What it chose not to do" is the product.
    if (data.declined) {
      append(botProse(agentNameFallback, [voice(stripNumbers(data.declined))]));
    }
  }, [hydrated, data, messages, append, setProposal]);

  const items = useMemo(() => withDividers(messages), [messages]);
  const agentName = proposal?.agent ?? agentNameFallback;

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || thinking) return;
    append(userMessage(text));
    setDraft('');
    setThinking(true);
    // PLAN.md 11.7: a real question to the real agent. The reply is PROSE ONLY — anything
    // numeric is rejected server-side before it can reach this thread.
    void repos.bot
      .ask({ agentId: agentIdFor(agentName), question: text, tone })
      .then((reply) => append(botProse(agentName, [voice(reply.text)])))
      .catch(() =>
        append(
          botProse(agentName, [voice('I could not answer that just now, so I will not guess.')]),
        ),
      )
      .finally(() => setThinking(false));
  }, [draft, thinking, append, agentName, tone]);

  return (
    <Screen tabBar gutter="none">
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s12,
            paddingHorizontal: space.gutter,
            paddingBottom: space.s16,
          },
          divider,
        ]}
      >
        <AssetMark gradient={agentGradient(agentName)} size={size.mark} />
        <View style={{ flex: 1 }}>
          <Text variant="rowPrimaryLg">{agentName}</Text>
          <Text variant="footnote" color={proposal ? colors.up : colors.ink40}>
            {/*
              The agent's real status, or nothing.

              This said "Watching 14 markets" whenever there was no proposal — a specific number
              from the design mock, in profit-green, describing work no part of this app had
              done. Fourteen was never counted; the crypto class has nine. A confident invented
              figure under an agent's name is exactly the claim this product exists to argue
              against, so when there is no proposal the line says so plainly instead.
            */}
            {proposal?.status ?? 'No proposal right now'}
          </Text>
        </View>
        <IconButton
          name="more"
          accessibilityLabel="Conversation options"
          background="none"
          color={colors.ink40}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <Fill>
          <ScrollView
            ref={scroller}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{
              paddingTop: space.s18,
              paddingHorizontal: THREAD_PAD_H,
              gap: space.s12,
            }}
          >
            {items.map((item, i) =>
              'divider' in item ? (
                <Text key={`d${i}`} variant="footnoteSm" color={colors.ink28} align="center">
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
                        : declinedMessage(agentName, DEFAULT_BUY),
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
        </Fill>

        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s10,
              marginHorizontal: THREAD_PAD_H,
              backgroundColor: colors.inputBg,
              borderRadius: radius.sheet,
              paddingLeft: space.s18,
              paddingRight: space.s8,
              height: COMPOSER_H,
            },
            border.input,
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about this trade…"
            placeholderTextColor={colors.ink35}
            style={[typeScale.bodyLg, { flex: 1, color: colors.ink }]}
            accessibilityLabel="Message the bot"
            editable={!thinking}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          {/* The prototype's send button. Without it the only way to send was the keyboard's
              return key, which is invisible to anyone who has dismissed the keyboard. */}
          <Press
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: thinking || draft.trim().length === 0 }}
            disabled={thinking || draft.trim().length === 0}
            onPress={send}
            style={{
              width: SEND,
              height: SEND,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: draft.trim().length === 0 ? colors.control : colors.ink,
            }}
          >
            <Icon
              name="send"
              size={16}
              color={draft.trim().length === 0 ? colors.ink35 : colors.bg}
            />
          </Press>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const agentNameFallback = 'Momentum Scout';

/**
 * The server's decline reasons name a symbol but sometimes a figure too. A voice segment may
 * not carry a number (src/bot/message.ts), so any digits are dropped rather than the message.
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
    // animations.md "If you add motion" #2: a single 250ms scale-in on the filled-order
    // bubble, once, on arrival. Nothing else in the thread animates.
    if (message.type === 'fill') {
      scale.value = withTiming(1, timing(duration.slow, reduced));
    }
  }, [message.type, reduced, scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (message.type === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: BUBBLE_MAX }}>
        <View
          style={{
            backgroundColor: colors.ink,
            borderRadius: radius.card,
            borderBottomRightRadius: TAIL,
            paddingHorizontal: space.s14,
            paddingVertical: space.s10,
          }}
        >
          <Text variant="bodySm" color={colors.bg}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  const segments = 'segments' in message ? message.segments : [];
  const color =
    message.type === 'fill' ? colors.up : message.type === 'declined' ? colors.down : colors.ink70;

  return (
    <Animated.View style={[{ alignSelf: 'flex-start', maxWidth: BUBBLE_MAX }, anim]}>
      <View
        style={{
          backgroundColor: colors.bubble,
          borderRadius: radius.card,
          borderBottomLeftRadius: TAIL,
          paddingHorizontal: space.s14,
          paddingVertical: space.s12,
        }}
      >
        <Text variant="bodySm" color={color}>
          {renderSegments(segments)}
        </Text>
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
    <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow color={colors.up}>Proposed trade</Eyebrow>
        <Text variant="footnote" color={expired ? colors.down : colors.ink35}>
          {expired ? 'expired' : `expires ${mmss(remaining)}`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s8, marginTop: space.s10 }}>
        <Text variant="screenTitle">{proposal.action}</Text>
        <Text variant="bodySm">{proposal.notional}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space.s8, marginTop: space.s12 }}>
        <StatTile label="Entry" value={proposal.entry} compact style={TILE_ON_CARD} />
        <StatTile label="Stop" value={proposal.stop} color={colors.down} compact style={TILE_ON_CARD} />
        <StatTile label="Target" value={proposal.target} color={colors.up} compact style={TILE_ON_CARD} />
      </View>

      <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s12 }}>
        {proposal.rationale}
      </Text>

      {decided ? null : (
        <ButtonRow
          style={{ marginTop: space.s14 }}
          secondary={
            <Button
              label="Skip"
              variant="secondary"
              color={colors.ink70}
              height={size.hit}
              disabled={expired}
              onPress={() => onDecide('skip')}
            />
          }
          primary={
            <Button label="Approve" height={size.hit} disabled={expired} onPress={() => onDecide('approve')} />
          }
        />
      )}
    </SheetCard>
  );
}

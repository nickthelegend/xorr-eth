/**
 * The conversation — thread, proposal card and composer.
 *
 * Lifted out of `app/(tabs)/bot.tsx` whole, because it now has two callers: the `/bot` route (still
 * the target of the `proposal-awaiting` push and the briefing's button) and the sheet that comes up
 * from the tab bar. Two copies of an approve-before-execute flow is two places for the expiry, the
 * decline path and the fallback-is-not-an-answer rule to drift apart, so there is one.
 *
 * The shape is the one people already know from ChatGPT: the agent speaks plainly at full width
 * with no bubble, your own words sit in a rounded bubble on the right, and the composer is a pill
 * with a circular send. The bot's own sentences are the content here — putting them in a narrow
 * bubble was costing a third of the line length for decoration.
 *
 * What is NOT ChatGPT is the proposal card. It stays a card with real Approve and Skip buttons and
 * a real countdown, because that is the one message in the thread that spends money.
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
  IconButton,
  Press,
  SheetCard,
  StatTile,
  Text,
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
import { AgentRail } from './AgentRail';
import { Thinking } from './Thinking';
import { DEFAULT_AGENT, agentByName, type ChatAgent } from './agents';

/** Thread gutter, composer and send button. */
const THREAD_PAD_H = space.s16;
const COMPOSER_MIN_H = 46;
const COMPOSER_MAX_H = 132;
const SEND = 34;
/** Your own words. Wide enough to read, short enough that the ragged right edge still says "mine". */
const USER_MAX = '84%' as const;

/** A tile inside the proposal card. The card is `surface`, so its tiles step up a shade. */
const TILE_ON_CARD = { backgroundColor: colors.surfaceAlt, borderRadius: radius.tileSm } as const;

export interface ChatProps {
  /**
   * Renders a close control in the header instead of the conversation-options button.
   *
   * The sheet needs a way out that is not the tab bar it covers; the route does not, because it
   * has the back gesture and the bar.
   */
  onClose?: () => void;
  /** Extra top padding. The sheet puts its drag handle above the header. */
  headerTop?: number;
  /**
   * Space under the composer.
   *
   * The route gets this from `<Screen tabBar>`; the sheet has no `Screen` around it, so it passes
   * its own — without it the composer sat on the home indicator, which on a device with a gesture
   * bar means the send button and the swipe-up gesture share the same 20 points.
   */
  footerInset?: number;
}

export function Chat({ onClose, headerTop = 0, footerInset = 0 }: ChatProps) {
  const scroller = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const { tone } = useTone();
  const {
    messages,
    proposal,
    decided,
    hydrated,
    hydrate,
    append,
    setProposal,
    setDecided,
    markRead,
  } = useThread();

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
    /*
     * A decline is a message, not a blank screen. "What it chose not to do" is the product.
     *
     * Guarded on the thread's contents, the same way the proposal above is. The proposal got that
     * guard and the decline did not, so every fresh mount appended another identical line — and
     * with the chat now mounted from two places, "No live market for WETH" stacked up four deep in
     * a thread whose whole claim is that it is a record of what happened.
     */
    if (data.declined) {
      const line = stripNumbers(data.declined);
      const said = messages.some(
        (m) =>
          m.type === 'prose' &&
          m.segments.some((seg) => seg.kind === 'voice' && seg.text === line),
      );
      if (!said) append(botProse(agentNameFallback, [voice(line)]));
    }
  }, [hydrated, data, messages, append, setProposal]);

  const items = useMemo(() => withDividers(messages), [messages]);

  /*
   * Who you are talking to, chosen rather than inherited.
   *
   * This used to be `proposal?.agent ?? 'Momentum Scout'` — whichever agent happened to own the
   * open proposal, and Momentum Scout the rest of the time. Four personas existed on the server,
   * each with its own mandate and its own refusals, and three of them were unreachable.
   *
   * Seeded from the proposal when there is one, because if an agent has just asked you for
   * something, that is who you are about to reply to.
   */
  const [agent, setAgent] = useState<ChatAgent>(
    () => (proposal ? agentByName(proposal.agent) : DEFAULT_AGENT),
  );
  const accent = agentGradient(agent.name).c1;
  const agentName = agent.name;
  const empty = draft.trim().length === 0;

  /*
   * `override` is what lets an opener send itself. Routing a starter through `setDraft` and a
   * second tap would make the chips a way to fill in the box rather than a way to ask.
   */
  const send = useCallback((override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || thinking) return;
    append(userMessage(text));
    setDraft('');
    setThinking(true);
    // PLAN.md 11.7: a real question to the real agent. The reply is PROSE ONLY — anything
    // numeric is rejected server-side before it can reach this thread.
    void repos.bot
      .ask({ agentId: agent.id, question: text, tone })
      /*
       * A fallback line is not an answer, and must not be dressed as one.
       *
       * `ask` returns `{ text, source }` and this used only `text`. With no language model
       * configured the server answers `source: 'fallback'` with a stock market remark, so asking
       * "why did the CBBTC buy fail?" got back "Nothing worth chasing today. Ranges are thin and
       * the tape is quiet." — a confident non-sequitur in the agent's own voice, which is exactly
       * the canned-content-as-real-output this project refuses everywhere else.
       *
       * The reply still arrives; it just says what it is.
       */
      .then((reply) =>
        append(
          botProse(agentName, [
            voice(
              reply.source === 'fallback'
                ? 'I cannot answer that here — no language model is configured in this build, and I will not read you a stock line as though it were an answer.'
                : reply.text,
            ),
          ]),
        ),
      )
      .catch(() =>
        append(
          botProse(agentName, [voice('I could not answer that just now, so I will not guess.')]),
        ),
      )
      .finally(() => setThinking(false));
  }, [draft, thinking, append, agent, agentName, tone]);

  return (
    <>
      <View style={[{ paddingTop: headerTop, paddingBottom: space.s16 }, divider]}>
        {/*
          The close control sits above the rail rather than beside a name, because the rail is four
          things wide and a control at the end of it lands under a thumb reaching for an agent.
        */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: space.gutter,
            minHeight: size.mark,
            marginBottom: space.s6,
          }}
        >
          {proposal ? (
            <Text variant="footnote" color={colors.up} style={{ flex: 1 }}>
              {proposal.status}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onClose ? (
            <IconButton
              name="close"
              accessibilityLabel="Close chat"
              onPress={onClose}
              background="none"
              color={colors.ink40}
            />
          ) : (
            <IconButton
              name="more"
              accessibilityLabel="Conversation options"
              background="none"
              color={colors.ink40}
            />
          )}
        </View>

        <AgentRail selected={agent} onSelect={setAgent} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, minHeight: 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{
            paddingTop: space.s18,
            paddingBottom: space.s12,
            paddingHorizontal: THREAD_PAD_H,
            gap: space.s16,
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
              <Turn key={item.id} message={item} speakerBefore={speakerAt(items, i)} />
            ),
          )}

          {/*
            Openers, only on an empty thread and only for the agent selected right now.
            
            They are QUESTIONS. A starter that asserted a position or a number would put words in
            the agent's mouth before it had said anything, which on this product is the one thing a
            convenience must not do.
          */}
          {items.length === 0 && !thinking ? (
            <View style={{ gap: space.s10, marginTop: space.s6 }}>
              <Text variant="secondary" color={colors.ink40}>
                {agent.role}. Ask it something.
              </Text>
              {agent.openers.map((q) => (
                <Press
                  key={q}
                  onPress={() => send(q)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask: ${q}`}
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: radius.card,
                    paddingHorizontal: space.s14,
                    paddingVertical: space.s10,
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Text variant="bodySm" color={colors.ink65}>
                    {q}
                  </Text>
                </Press>
              ))}
            </View>
          ) : null}

          {/* Where the answer is about to land, not in the header twelve lines above it. */}
          {thinking ? <Thinking color={accent} /> : null}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.s8,
            paddingHorizontal: THREAD_PAD_H,
            paddingTop: space.s8,
            paddingBottom: footerInset,
          }}
        >
          <View
            style={{
              flex: 1,
              minHeight: COMPOSER_MIN_H,
              justifyContent: 'center',
              backgroundColor: colors.inputBg,
              borderRadius: radius.sheet,
              paddingHorizontal: space.s18,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Ask ${agent.name}…`}
              placeholderTextColor={colors.ink35}
              accessibilityLabel="Message the bot"
              editable={!thinking}
              multiline
              onSubmitEditing={() => send()}
              /*
               * Enter sends on web, where there is a hardware keyboard and a newline costs a
               * modifier. On a phone the return key on a multiline field inserts a newline, which
               * is what it is for — the send button is right there.
               */
              blurOnSubmit={Platform.OS === 'web'}
              returnKeyType="send"
              style={[
                typeScale.bodyLg,
                {
                  color: colors.ink,
                  paddingTop: space.s12,
                  paddingBottom: space.s12,
                  maxHeight: COMPOSER_MAX_H,
                },
              ]}
            />
          </View>
          {/* Without this the only way to send was the keyboard's return key, which is invisible
              to anyone who has dismissed the keyboard. */}
          <Press
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: thinking || empty }}
            disabled={thinking || empty}
            onPress={() => send()}
            hitHeight={SEND}
            hitWidth={SEND}
            style={{
              width: SEND,
              height: SEND,
              marginBottom: (COMPOSER_MIN_H - SEND) / 2,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: empty ? colors.control : colors.ink,
            }}
          >
            <Icon name="send" size={15} color={empty ? colors.ink35 : colors.bg} />
          </Press>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const agentNameFallback = 'Momentum Scout';

/**
 * Who spoke immediately before position `i`, skipping day dividers.
 *
 * Used to decide whether a bot message needs a name over it. Once the rail exists, a thread can
 * contain four voices, and an unattributed wall of prose is worse than the single-agent version it
 * replaced — you would be reading Drawdown Guard's answer under Momentum Scout's orb.
 *
 * Dividers are skipped rather than treated as a speaker change, or every morning would re-label a
 * continuing conversation.
 */
function speakerAt(
  items: (ThreadMessage | { divider: string })[],
  i: number,
): string | undefined {
  for (let j = i - 1; j >= 0; j--) {
    const prev = items[j];
    if (!prev || 'divider' in prev) continue;
    return prev.type === 'user' ? 'user' : ('agent' in prev ? prev.agent : undefined);
  }
  return undefined;
}

/**
 * The server's decline reasons name a symbol but sometimes a figure too. A voice segment may
 * not carry a number (src/bot/message.ts), so any digits are dropped rather than the message.
 */
function stripNumbers(text: string): string {
  const cleaned = text.replace(/[$]?[\d,.]+%?/g, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length > 4 ? cleaned : 'There is nothing worth proposing right now.';
}

/**
 * One turn in the thread.
 *
 * Yours is a bubble; the agent's is not. The asymmetry is the whole reason this layout reads as a
 * chat rather than a transcript — a bubble on both sides makes two speakers of equal weight, and
 * here one of them is answering the other.
 */
function Turn({
  message,
  speakerBefore,
}: {
  message: ThreadMessage;
  speakerBefore?: string;
}) {
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
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: USER_MAX,
          backgroundColor: colors.control,
          borderRadius: radius.card,
          paddingHorizontal: space.s16,
          paddingVertical: space.s12,
        }}
      >
        <Text variant="bodyLg">{message.text}</Text>
      </View>
    );
  }

  const segments = 'segments' in message ? message.segments : [];
  /*
   * A fill is green and a decline is red because both are outcomes with a direction. Everything
   * else the agent says is ordinary prose and takes ordinary ink — colouring the whole side of the
   * conversation would spend the P&L palette on tone of voice.
   */
  const color =
    message.type === 'fill' ? colors.up : message.type === 'declined' ? colors.down : colors.ink;

  const who = 'agent' in message ? message.agent : undefined;
  /*
   * A name only when the voice changes. Stamping every message with its author turns a
   * conversation into a log; stamping none of them makes four agents look like one.
   */
  const newVoice = !!who && who !== speakerBefore;

  return (
    <Animated.View style={[{ alignSelf: 'stretch' }, anim]}>
      {newVoice ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s8,
            marginBottom: space.s8,
          }}
        >
          <AssetMark gradient={agentGradient(who!)} size={size.noteOrb} />
          <Text variant="footnote" color={colors.ink40}>
            {who}
          </Text>
        </View>
      ) : null}
      <Text variant="bodyLg" color={color}>
        {renderSegments(segments)}
      </Text>
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

      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s8, marginTop: space.s10 }}
      >
        <Text variant="screenTitle">{proposal.action}</Text>
        <Text variant="bodySm">{proposal.notional}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space.s8, marginTop: space.s12 }}>
        <StatTile label="Entry" value={proposal.entry} compact style={TILE_ON_CARD} />
        <StatTile
          label="Stop"
          value={proposal.stop}
          color={colors.down}
          compact
          style={TILE_ON_CARD}
        />
        <StatTile
          label="Target"
          value={proposal.target}
          color={colors.up}
          compact
          style={TILE_ON_CARD}
        />
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
            <Button
              label="Approve"
              height={size.hit}
              disabled={expired}
              onPress={() => onDecide('approve')}
            />
          }
        />
      )}
    </SheetCard>
  );
}

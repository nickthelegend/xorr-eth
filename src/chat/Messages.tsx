/**
 * Messages — the agents, listed as a messenger lists its chats (2026-09-15).
 *
 * Opened from the tab bar's Messages button, in the drawer that rises from the bottom (`ChatSheet`), and drawn to the
 * product owner's reference: you at the top left, search and add at the top right, the agents across the top as large
 * orbs, then one row per conversation — the agent, its last line, when, and a mark when something in it is new. A row
 * or an orb opens that agent's conversation in the same drawer.
 *
 * Nothing here is written for the screen. The rows are the thread (`conversations.ts`); who is added comes from the
 * executor's `/agents`, and adding an agent hires it there.
 */
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/design/Icon';
import { agentGradient } from '@/design/gradients';
import { AgentOrb, Press, Text, signIn, space } from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { NotSignedIn, errorText } from '@/data/apiError';
import { usePrivyIdentity } from '@/auth/usePrivyIdentity';
import { useSignedOut } from '@/auth/useSignedOut';
import { useStore } from '@/state/store';
import { useNow } from '@/state/useNow';
import { useThread } from '@/bot/thread';
import type { ThreadMessage } from '@/bot/message';
import { CHAT_AGENTS, type ChatAgent } from './agents';
import { listTime, searchMessages, summaries, type ConversationSummary } from './conversations';
import { AgentAvatar, GLASS, GlassButton } from './parts';
import { chat, chatShadow, chatType } from './theme';

const AVATAR = GLASS;
const ORB = 56 as const;
const ORB_TILE = 84;
const ROW_AVATAR = 46;
/** A conversation row's orb: the smallest size the orb is drawn at. */
const ROW_ORB = 52 as const;
const DOT = 11;
const PILL_H = 32;
const AGENT_NAMES = CHAT_AGENTS.map((a) => a.name);
/** A browser draws its own focus ring inside the field; the glass pill is the focus here. */
const NO_WEB_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

type Mode = 'list' | 'search' | 'add';

export interface MessagesProps {
  /** Lowers the drawer. */
  onClose: () => void;
  /** Opens one agent's conversation in the drawer. */
  onOpen: (agent: string) => void;
  /** Space under the list — the drawer's home-indicator inset. */
  footerInset: number;
}

export function Messages({ onClose, onOpen, footerInset }: MessagesProps) {
  const router = useRouter();
  const signedOut = useSignedOut();
  const { email } = usePrivyIdentity();
  const address = useStore((s) => s.wallet?.address);
  const messages = useThread((s) => s.messages);
  const read = useThread((s) => s.read);
  const now = useNow();
  const roster = useAsync(() => repos.bot.listAgents(), []);
  const [mode, setMode] = useState<Mode>('list');
  const [query, setQuery] = useState('');

  const list = useMemo(() => summaries(messages, AGENT_NAMES, read), [messages, read]);
  const added = useMemo(
    () => new Set((roster.data ?? []).filter((a) => a.hired).map((a) => a.name)),
    [roster.data],
  );
  // Added agents first across the top: they are the ones allowed to act for you.
  const featured = useMemo(
    () => [...CHAT_AGENTS].sort((a, b) => Number(added.has(b.name)) - Number(added.has(a.name))),
    [added],
  );
  const initial = (email ?? address?.replace(/^0x/i, '') ?? '').charAt(0).toUpperCase();

  /* The drawer goes down first, so the screen it opens is not underneath it. */
  const goSignIn = () => {
    onClose();
    signIn();
  };
  const openProfile = () => {
    onClose();
    router.push('/profile');
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[chat.groundTop, chat.groundMid, chat.groundBottom]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {mode === 'search' ? (
        <SearchHeader
          query={query}
          onChange={setQuery}
          onCancel={() => {
            setQuery('');
            setMode('list');
          }}
        />
      ) : mode === 'add' ? (
        <View style={HEADER}>
          <GlassButton icon="back" label="Back to messages" onPress={() => setMode('list')} />
          <Text color={chat.heading} style={[chatType.title, { flex: 1 }]} numberOfLines={1}>
            Add an agent
          </Text>
        </View>
      ) : (
        <View style={HEADER}>
          <Press
            onPress={signedOut ? goSignIn : openProfile}
            accessibilityRole="button"
            accessibilityLabel={signedOut ? 'Sign in' : 'Your profile'}
            hitWidth={44}
            hitHeight={44}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: chat.heading,
              boxShadow: chatShadow,
            }}
          >
            {initial ? (
              <Text color="#FFFFFF" style={chatType.title}>
                {initial}
              </Text>
            ) : null}
          </Press>
          <View style={{ flex: 1 }} />
          <GlassButton icon="search" label="Search agents and messages" onPress={() => setMode('search')} />
          <GlassButton icon="plus" label="Add an agent" onPress={() => setMode('add')} />
        </View>
      )}

      <ScrollView
        // Clipped at its own top edge, so a scrolled list never slides under the header's controls.
        style={{ flex: 1, overflow: 'hidden' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: footerInset + space.s12 }}
      >
        {mode === 'search' ? (
          <SearchResults query={query} messages={messages} now={now} onOpen={onOpen} />
        ) : mode === 'add' ? (
          <AddAgents roster={roster} added={added} onOpen={onOpen} onSignIn={goSignIn} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space.s12, paddingTop: space.s14, paddingBottom: space.s18 }}
            >
              {featured.map((agent) => (
                <Press
                  key={agent.id}
                  onPress={() => onOpen(agent.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`${agent.name}. Open the conversation`}
                  style={{ width: ORB_TILE, alignItems: 'center', gap: space.s8 }}
                >
                  <AgentOrb gradient={agentGradient(agent.name)} size={ORB} face identity={agent.name} />
                  <Text color={chat.inkSoft} style={chatType.small} align="center" numberOfLines={2}>
                    {agent.name}
                  </Text>
                </Press>
              ))}
            </ScrollView>

            {signedOut ? (
              <SignInCard text="Sign in to talk to your agents." onPress={goSignIn} />
            ) : (
              list.map((summary) => (
                <ConversationRow
                  key={summary.agent}
                  summary={summary}
                  role={roleOf(summary.agent)}
                  now={now}
                  onPress={() => onOpen(summary.agent)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const HEADER = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.s10,
  minHeight: GLASS,
  paddingHorizontal: space.gutter,
  paddingBottom: space.s6,
} as const;

function roleOf(name: string): string {
  return CHAT_AGENTS.find((a) => a.name === name)?.role ?? '';
}

/** One conversation: the agent, its last line, when it moved, and a mark when something in it is new. */
function ConversationRow({
  summary,
  role,
  now,
  onPress,
}: {
  summary: ConversationSummary;
  role: string;
  now: number;
  onPress: () => void;
}) {
  const { agent, last, unread } = summary;
  const line = last ? (last.fromYou ? `You: ${last.text}` : last.text) : role;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${agent}${unread > 0 ? `, ${unread} new` : ''}. ${line}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, paddingLeft: space.gutter }}
    >
      <View>
        {/* The same face as the orb across the top, smaller: an agent is one character wherever it appears. */}
        <AgentOrb gradient={agentGradient(agent)} size={ROW_ORB} face identity={agent} />
        {unread > 0 ? (
          <View
            style={{
              position: 'absolute',
              left: -1,
              bottom: 1,
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: chat.accentDeep,
              borderWidth: 2,
              borderColor: chat.groundMid,
            }}
          />
        ) : null}
      </View>
      <View
        style={{
          flex: 1,
          paddingVertical: space.s12,
          paddingRight: space.gutter,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: chat.hairline,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s8 }}>
          <Text color={chat.ink} style={[chatType.rowTitle, { flex: 1 }]} numberOfLines={1}>
            {agent}
          </Text>
          {last ? (
            <Text color={unread > 0 ? chat.accentDeep : chat.muted} style={chatType.small}>
              {listTime(last.at, now)}
            </Text>
          ) : null}
        </View>
        <Text color={chat.muted} style={[chatType.body, { marginTop: space.s2 }]} numberOfLines={1}>
          {line}
        </Text>
      </View>
    </Press>
  );
}

function SearchHeader({
  query,
  onChange,
  onCancel,
}: {
  query: string;
  onChange: (text: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={HEADER}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s8,
          height: GLASS,
          borderRadius: GLASS / 2,
          paddingHorizontal: space.s14,
          backgroundColor: chat.glass,
          borderWidth: 1,
          borderColor: chat.glassBorder,
        }}
      >
        <Icon name="search" size={16} color={chat.muted} strokeWidth={2.1} />
        <TextInput
          value={query}
          onChangeText={onChange}
          autoFocus
          placeholder="Search"
          placeholderTextColor={chat.faint}
          accessibilityLabel="Search agents and messages"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[chatType.input, { flex: 1, color: chat.ink, paddingVertical: 0 }, NO_WEB_OUTLINE]}
        />
      </View>
      <Press onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel search" hitHeight={44}>
        <Text color={chat.accentDeep} style={chatType.button}>
          Cancel
        </Text>
      </Press>
    </View>
  );
}

/** Agents by name or mandate, and what was said by its words — each a way into that agent's conversation. */
function SearchResults({
  query,
  messages,
  now,
  onOpen,
}: {
  query: string;
  messages: readonly ThreadMessage[];
  now: number;
  onOpen: (agent: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => searchMessages(messages, query).slice(0, 40), [messages, query]);
  const agents = q
    ? CHAT_AGENTS.filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q))
    : CHAT_AGENTS;

  if (q && agents.length === 0 && hits.length === 0) {
    return (
      <Text color={chat.muted} style={[chatType.body, { marginTop: space.s30 }]} align="center">
        {`Nothing matches “${query.trim()}”.`}
      </Text>
    );
  }

  return (
    <View style={{ paddingTop: space.s10 }}>
      <Section label="Agents" />
      {agents.map((a) => (
        <ResultRow key={a.id} agent={a.name} line={a.role} onPress={() => onOpen(a.name)} />
      ))}
      {hits.length > 0 ? (
        <>
          <Section label="Messages" />
          {hits.map((h) => (
            <ResultRow key={h.id} agent={h.agent} line={h.text} time={listTime(h.at, now)} onPress={() => onOpen(h.agent)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Section({ label }: { label: string }) {
  return (
    <Text
      color={chat.muted}
      style={[chatType.label, { paddingHorizontal: space.gutter, paddingTop: space.s12, paddingBottom: space.s4 }]}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function ResultRow({ agent, line, time, onPress }: { agent: string; line: string; time?: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${agent}. ${line}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, paddingHorizontal: space.gutter, paddingVertical: space.s10 }}
    >
      <AgentAvatar name={agent} size={36} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s8 }}>
          <Text color={chat.ink} style={[chatType.rowTitle, { flex: 1 }]} numberOfLines={1}>
            {agent}
          </Text>
          {time ? (
            <Text color={chat.muted} style={chatType.small}>
              {time}
            </Text>
          ) : null}
        </View>
        <Text color={chat.muted} style={chatType.body} numberOfLines={2}>
          {line}
        </Text>
      </View>
    </Press>
  );
}

/** The four agents, and adding one: `POST /agents` hires it, and its conversation opens. */
function AddAgents({
  roster,
  added,
  onOpen,
  onSignIn,
}: {
  roster: { data?: unknown; loading: boolean; error?: Error; reload: () => void };
  added: ReadonlySet<string>;
  onOpen: (agent: string) => void;
  onSignIn: () => void;
}) {
  const [adding, setAdding] = useState<string>();
  const [failed, setFailed] = useState<Readonly<Record<string, string>>>({});

  if (roster.error instanceof NotSignedIn) return <SignInCard text="Sign in to add agents." onPress={onSignIn} />;

  async function add(agent: ChatAgent) {
    if (adding) return;
    setAdding(agent.name);
    setFailed((all) => withoutKey(all, agent.name));
    try {
      await repos.bot.hire(agent.id);
      roster.reload();
      onOpen(agent.name);
    } catch (e) {
      setFailed((all) => ({ ...all, [agent.name]: errorText(e) }));
    } finally {
      setAdding(undefined);
    }
  }

  const reading = roster.loading && roster.data === undefined;

  return (
    <View style={{ paddingTop: space.s10 }}>
      <Text color={chat.muted} style={[chatType.body, { paddingHorizontal: space.gutter, paddingBottom: space.s8 }]}>
        An agent you add can trade inside your limits.
      </Text>
      {CHAT_AGENTS.map((a) => {
        const isAdded = added.has(a.name);
        return (
          <View
            key={a.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, paddingHorizontal: space.gutter, paddingVertical: space.s10 }}
          >
            <AgentAvatar name={a.name} size={ROW_AVATAR} />
            <View style={{ flex: 1 }}>
              <Text color={chat.ink} style={chatType.rowTitle} numberOfLines={1}>
                {a.name}
              </Text>
              <Text color={chat.muted} style={chatType.body} numberOfLines={2}>
                {a.role}
              </Text>
              {failed[a.name] ? (
                <Text color={chat.down} style={[chatType.small, { marginTop: space.s4 }]}>
                  {failed[a.name]}
                </Text>
              ) : null}
            </View>
            {reading ? (
              <Text color={chat.faint} style={chatType.small}>
                · · ·
              </Text>
            ) : roster.error ? (
              <Text color={chat.faint} style={chatType.small}>
                —
              </Text>
            ) : isAdded ? (
              <Press
                onPress={() => onOpen(a.name)}
                accessibilityRole="button"
                accessibilityLabel={`${a.name} is added. Open the conversation`}
                hitHeight={44}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s4 }}
              >
                <Icon name="check" size={15} color={chat.accentDeep} strokeWidth={2.2} />
                <Text color={chat.accentDeep} style={chatType.chip}>
                  Added
                </Text>
              </Press>
            ) : (
              <PrimaryPill
                label={adding === a.name ? 'Adding' : 'Add'}
                disabled={adding !== undefined}
                accessibilityLabel={`Add ${a.name}`}
                onPress={() => void add(a)}
              />
            )}
          </View>
        );
      })}
      {roster.error ? (
        <View style={{ alignItems: 'center', gap: space.s10, marginTop: space.s14 }}>
          <Text color={chat.muted} style={chatType.body}>
            Couldn’t read which agents are added.
          </Text>
          <PrimaryPill label="Try again" onPress={roster.reload} />
        </View>
      ) : null}
    </View>
  );
}

function withoutKey(all: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const next = { ...all };
  delete next[key];
  return next;
}

function SignInCard({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <View
      style={{
        marginHorizontal: space.gutter,
        marginTop: space.s6,
        padding: space.s18,
        borderRadius: 22,
        alignItems: 'center',
        gap: space.s12,
        backgroundColor: chat.card,
        borderWidth: 1,
        borderColor: chat.cardBorder,
        boxShadow: chatShadow,
      }}
    >
      <Text color={chat.inkSoft} style={chatType.body} align="center">
        {text}
      </Text>
      <PrimaryPill label="Sign in" onPress={onPress} />
    </View>
  );
}

function PrimaryPill({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      hitHeight={44}
      style={{
        height: PILL_H,
        paddingHorizontal: space.s16,
        borderRadius: PILL_H / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <LinearGradient
        colors={[chat.primaryTop, chat.primaryBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Above the gradient: on web an absolute layer paints over its in-flow siblings. */}
      <View style={{ zIndex: 1 }}>
        <Text color="#FFFFFF" style={chatType.chip}>
          {label}
        </Text>
      </View>
    </Press>
  );
}

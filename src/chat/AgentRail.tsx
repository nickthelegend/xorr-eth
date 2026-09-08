/**
 * Who you are talking to, and how to change it.
 *
 * Four orbs in a row: the selected one at full size with its gradient lit, the rest dimmed to a
 * smaller disc. The gradient IS the identity — the roster, the proposal card and the thread all
 * draw the same one — so switching agent visibly changes the colour of the conversation rather
 * than only a label.
 *
 * Deliberately not a dropdown. A dropdown hides three of four options behind a tap and gives the
 * chat no sense of who else is there; a rail makes the roster part of the screen, which is the
 * point — the product is four specialists, and a chat with one name at the top looked like one.
 *
 * The dimming is opacity on the orb, not a grey palette. An agent's colour should not change
 * because it is not selected; it should just be quieter.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { AgentOrb, Press, Text, colors, space } from '@/ui';
import { agentGradient } from '@/design/gradients';
import { CHAT_AGENTS, type ChatAgent } from './agents';

/** Selected and unselected orb sizes. Both are `OrbSize` values from the design system. */
const ON = 56;
const OFF = 52;
/** How far the unselected agents recede. Enough to rank them, not enough to hide them. */
const OFF_OPACITY = 0.38;

export function AgentRail({
  selected,
  onSelect,
}: {
  selected: ChatAgent;
  onSelect: (agent: ChatAgent) => void;
}) {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s14,
          paddingHorizontal: space.gutter,
        }}
      >
        {CHAT_AGENTS.map((a) => {
          const on = a.id === selected.id;
          return (
            <Press
              key={a.id}
              onPress={() => onSelect(a)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${a.name}. ${a.role}`}
              style={{ alignItems: 'center', opacity: on ? 1 : OFF_OPACITY }}
            >
              <AgentOrb
                gradient={agentGradient(a.name)}
                size={on ? ON : OFF}
                face
                /* The bloom only on the selected one — four glowing orbs is a light show, not a
                   selection. */
                bloom={on}
              />
            </Press>
          );
        })}
      </ScrollView>

      {/*
        The mandate, under the rail rather than inside each orb. It changes as you switch, which is
        what tells you the switch did something beyond changing a colour.
      */}
      <View style={{ paddingHorizontal: space.gutter, marginTop: space.s12 }}>
        <Text variant="rowPrimaryLg">{selected.name}</Text>
        <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s2 }}>
          {selected.role}
        </Text>
      </View>
    </View>
  );
}

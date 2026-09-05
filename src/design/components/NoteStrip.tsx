/**
 * NoteStrip — design.md §5 "Note strip — agent commentary".
 *
 * flex row · gap 10 · background #0C0C0D · radius 18 · padding 13
 * [16-22px orb or dot, flex:none, margin-top 1] [11.5/1.5 ink45]
 *
 * "The dot color encodes the event class: #2BD87A acted, #E8C64A adjusted risk, #FF453A blocked."
 */
import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { ink, pnl, surfaces } from '../colors';
import { radius } from '../space';
import { type } from '../type';

/** The three event classes design.md defines, plus the dot color each maps to. */
export type EventClass = 'acted' | 'risk' | 'blocked';

export const eventDotColor: Record<EventClass, string> = {
  acted: pnl.up,
  risk: pnl.warn,
  blocked: pnl.down,
};

export type NoteStripProps = {
  children: React.ReactNode;
  /** Pass an AgentOrb for agent commentary, or omit and use `kind` for a plain dot. */
  orb?: React.ReactNode;
  kind?: EventClass;
  dotSize?: number;
  style?: ViewStyle;
};

export function NoteStrip({ children, orb, kind = 'acted', dotSize = 8, style }: NoteStripProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 10,
          backgroundColor: surfaces.surface,
          borderRadius: radius.lg,
          padding: 13,
        },
        style,
      ]}
    >
      <View style={{ flexShrink: 0, marginTop: 1 }}>
        {orb ?? (
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: eventDotColor[kind],
              marginTop: 4,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? (
          <Text style={[type.noteBody, { color: ink.i45 }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

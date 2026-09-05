/**
 * The tone dial — PLAN.md §3.2 / 11.4.
 *
 * Changes VOICE segments only. It cannot change a single number, label, or button: facts are
 * rendered by src/format from structured values, and the tone never reaches them. Asserted by
 * src/bot/tone.test.ts, which renders the same message under all three tones and requires the
 * facts to come back byte-identical.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ToneId = 'dry' | 'sharp' | 'flat';

export const TONES: { id: ToneId; label: string; description: string; instruction: string }[] = [
  {
    id: 'dry',
    label: 'Dry',
    description: 'Understated. States what it did and why, with the occasional flat aside.',
    instruction:
      'Write plainly with dry understatement. One short aside at most, and only about the market — never about the user or their money.',
  },
  {
    id: 'sharp',
    label: 'Sharp',
    description: 'More opinionated about the market. Same restraint about your money.',
    instruction:
      'Be more opinionated and direct about market conditions. Stay factual about positions, sizes and limits. Never mock the user.',
  },
  {
    id: 'flat',
    label: 'Flat',
    description: 'No personality at all. Just what happened.',
    instruction: 'No personality. State only what happened and what will happen next.',
  },
];

const KEY = 'xorr-tone';
export const DEFAULT_TONE: ToneId = 'dry';

export function toneInstruction(tone: ToneId): string {
  return TONES.find((t) => t.id === tone)?.instruction ?? TONES[0]!.instruction;
}

export function useTone() {
  const [tone, setToneState] = useState<ToneId>(DEFAULT_TONE);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'dry' || v === 'sharp' || v === 'flat') setToneState(v);
      })
      .catch(() => undefined);
  }, []);

  const setTone = useCallback((t: ToneId) => {
    setToneState(t);
    void AsyncStorage.setItem(KEY, t).catch(() => undefined);
  }, []);

  return { tone, setTone };
}

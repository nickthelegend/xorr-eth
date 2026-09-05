/**
 * The bot's message model — PLAN.md §3.2 and 11.3.
 *
 * THE RULE: the bot may be funny about the market. It is never funny about your money.
 *
 * Enforced structurally, not by prompting. Every message is a list of segments:
 *   - `voice` — model prose. Personality lives here. MAY NOT CONTAIN A NUMBER.
 *   - `facts` — rendered by formatting code from a structured value. The model never writes these.
 *
 * A model that hallucinates a fill price physically cannot get it on screen, because the only
 * path to a rendered number is through `fact()` with a typed value and a formatter.
 */
import { compactMoney, money, percent, price, quantity, signedMoney } from '../format';

export type VoiceSegment = { kind: 'voice'; text: string };

export type FactKind = 'money' | 'signedMoney' | 'price' | 'percent' | 'quantity' | 'compact' | 'raw';

export type FactSegment = {
  kind: 'facts';
  /** The structured value. The renderer formats it; nobody hands us a pre-formatted string. */
  value: number | string;
  format: FactKind;
  /** Where the number came from. A fact with no source is a bug, not a message. */
  source: string;
};

export type Segment = VoiceSegment | FactSegment;

/**
 * Digits are banned in voice. So are the words for small numbers, which is how a model smuggles a
 * quantity past a digit check ("about twelve SOL").
 */
const DIGIT = /\d/;
const NUMBER_WORDS = new RegExp(
  '\\b(' +
    // cardinals
    'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|' +
    'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|' +
    // fractions and multipliers, with their inflections ("doubled", "halves", "tripling")
    'half|halves|quarter|quarters|third|thirds|double|doubled|doubles|doubling|' +
    'triple|tripled|triples|tripling' +
    ')\\b',
  'i',
);

export class VoiceContainsNumberError extends Error {
  constructor(text: string) {
    super(
      `A voice segment may not contain a number — route it through fact() so a formatter owns it. Got: ${JSON.stringify(text)}`,
    );
    this.name = 'VoiceContainsNumberError';
  }
}

/** Build a voice segment. Throws if the text carries a number. */
export function voice(text: string): VoiceSegment {
  if (DIGIT.test(text) || NUMBER_WORDS.test(text)) throw new VoiceContainsNumberError(text);
  return { kind: 'voice', text };
}

/** Build a fact segment from a structured value plus the source it came from. */
export function fact(value: number | string, format: FactKind, source: string): FactSegment {
  if (!source) throw new Error('A fact must name its source.');
  return { kind: 'facts', value, format, source };
}

export function renderFact(f: FactSegment): string {
  const v = f.value;
  if (f.format === 'raw' || typeof v === 'string') return String(v);
  switch (f.format) {
    case 'money':
      return money(v);
    case 'signedMoney':
      return signedMoney(v);
    case 'price':
      return price(v);
    case 'percent':
      return percent(v);
    case 'quantity':
      return quantity(v);
    case 'compact':
      return compactMoney(v);
  }
}

export function renderSegments(segments: readonly Segment[]): string {
  return segments
    .map((s) => (s.kind === 'voice' ? s.text : renderFact(s)))
    .join(' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Thread messages — PLAN.md 6.3 message-type registry ──────────────────────

export type MessageBase = { id: string; at: number; author: 'bot' | 'user' | 'system' };

export type ThreadMessage =
  | (MessageBase & { type: 'prose'; agent: string; segments: Segment[] })
  | (MessageBase & { type: 'proposal'; proposalId: string })
  | (MessageBase & { type: 'fill'; agent: string; segments: Segment[]; outcome: 'filled' })
  | (MessageBase & { type: 'declined'; agent: string; segments: Segment[] })
  | (MessageBase & { type: 'expired'; segments: Segment[] })
  | (MessageBase & { type: 'dca-receipt'; agent: string; segments: Segment[]; signature?: string })
  | (MessageBase & { type: 'strategy-created'; agent: string; segments: Segment[]; strategyId: string })
  | (MessageBase & { type: 'blocked'; agent: string; segments: Segment[]; reason: string })
  | (MessageBase & { type: 'briefing'; agent: string; segments: Segment[] })
  | (MessageBase & { type: 'user'; text: string });

export const MESSAGE_TYPES = [
  'prose',
  'proposal',
  'fill',
  'declined',
  'expired',
  'dca-receipt',
  'strategy-created',
  'blocked',
  'briefing',
  'user',
] as const;

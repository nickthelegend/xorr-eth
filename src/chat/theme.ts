/**
 * The chat's light room.
 *
 * Everything else in the app is true black (`src/ui/tokens.ts`). The conversation is drawn from the
 * reference chosen for it: a lavender ground, white message cards, glass controls and one iridescent
 * orb. It is its own palette rather than overrides scattered through the screen, so the room can be
 * read — and changed — in one place.
 *
 * Green and red keep their one meaning here too — profit and loss, a fill and a stop — only deepened
 * so they hold against white.
 */
import { familyFor } from '@/ui';

export const chat = Object.freeze({
  groundTop: '#F6F4FD',
  groundMid: '#EEEBF9',
  groundBottom: '#E4E0F3',
  heading: '#3B2E52',
  ink: '#2D2540',
  inkSoft: '#524868',
  muted: '#8A839E',
  faint: '#ABA4BF',
  card: 'rgba(255,255,255,0.94)',
  cardBorder: '#FFFFFF',
  glass: 'rgba(255,255,255,0.58)',
  glassBorder: 'rgba(255,255,255,0.9)',
  tile: '#F2EFFA',
  toolActive: 'rgba(134,112,224,0.14)',
  accentDeep: '#6A56C8',
  primaryTop: '#B7A5F6',
  primaryBottom: '#8670E0',
  handle: 'rgba(59,46,82,0.18)',
  /** The rule between rows in the Messages list. */
  hairline: 'rgba(59,46,82,0.08)',
  brandGreen: '#19C97A',
  up: '#17935C',
  down: '#D23E4B',
} as const);

/** A lavender shadow, never a grey one: on this ground a black shadow reads as dirt. */
export const chatShadow = '0 6px 18px rgba(92, 72, 160, 0.09)';
export const chatShadowLg = '0 14px 34px rgba(92, 72, 160, 0.14)';

export const chatType = Object.freeze({
  heading: { fontFamily: familyFor(600), fontSize: 29, lineHeight: 35, letterSpacing: -0.5 },
  subtitle: { fontFamily: familyFor(500), fontSize: 13, lineHeight: 19 },
  title: { fontFamily: familyFor(600), fontSize: 16, lineHeight: 21 },
  rowTitle: { fontFamily: familyFor(600), fontSize: 14.5, lineHeight: 19 },
  message: { fontFamily: familyFor(400), fontSize: 14, lineHeight: 20 },
  input: { fontFamily: familyFor(400), fontSize: 15, lineHeight: 21 },
  body: { fontFamily: familyFor(400), fontSize: 13.5, lineHeight: 19 },
  chip: { fontFamily: familyFor(500), fontSize: 13, lineHeight: 17 },
  small: { fontFamily: familyFor(500), fontSize: 11.5, lineHeight: 15 },
  label: { fontFamily: familyFor(700), fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  button: { fontFamily: familyFor(600), fontSize: 14.5, lineHeight: 18 },
  value: { fontFamily: familyFor(700), fontSize: 14.5, lineHeight: 19 },
  action: { fontFamily: familyFor(700), fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
});

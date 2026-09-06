/**
 * Phase 13 audits — PLAN.md 13.2 / 13.3 / 13.4 / 13.6 / 13.7.
 *
 * These read the ACTUAL source of every screen and component. They are the mechanism that stops
 * the handoff's rules decaying as the app grows, which is the only way a rule survives contact
 * with a second contributor.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const APP = path.join(ROOT, 'app');
const DESIGN = path.join(ROOT, 'src/design');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/**
 * User-facing screens. `app/_dev/` is excluded on purpose: the fidelity harness and the component
 * gallery are DEVELOPER tools, and a gallery whose whole job is to show sample values would fail
 * the "no hardcoded money" rule for the exact reason it exists. The rules protect what a user
 * sees; they are not loosened for anything a user can reach.
 */
const screenFiles = walk(APP).filter((f) => !f.includes('_layout') && !f.includes(`${path.sep}_dev${path.sep}`));
const allFiles = [...screenFiles, ...walk(DESIGN)];
const rel = (f: string) => path.relative(ROOT, f);

/**
 * Extract complete JSX opening tags for a component.
 *
 * A naive /<Tag[\s\S]*?>/ stops at the first ">", which in React Native is almost always the
 * one inside an inline `onPress={() => …}` arrow — so it silently reports every handler-bearing
 * component as unlabelled. This walks the tag and tracks brace depth instead.
 */
function openingTags(src: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b`, 'g');
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe('13.6 motion audit — animations.md', () => {
  const animated = allFiles.filter((f) => /withTiming|withRepeat/.test(fs.readFileSync(f, 'utf8')));

  it('finds the animated surfaces', () => {
    expect(animated.length).toBeGreaterThan(4);
  });

  it('every duration comes from the DURATION scale — no magic numbers', () => {
    const offenders: string[] = [];
    for (const f of animated) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      // A literal ms value passed to withTiming is the failure mode we care about.
      for (const m of src.matchAll(/duration:\s*(\d+)/g)) {
        offenders.push(`${rel(f)} duration: ${m[1]}`);
      }
    }
    expect(offenders, `hardcoded durations:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no spring, bounce or overshoot anywhere — animations.md §4', () => {
    const offenders: string[] = [];
    for (const f of allFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      if (/withSpring|withBounce|withDecay|Easing\.bounce|Easing\.elastic|Easing\.back/.test(src)) {
        offenders.push(rel(f));
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no custom cubic-bezier — the platform default is the only easing', () => {
    const offenders: string[] = [];
    for (const f of allFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      if (/Easing\.bezier|cubic-bezier/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every animation respects reduced motion — animations.md §6', () => {
    const offenders: string[] = [];
    for (const f of animated) {
      const src = fs.readFileSync(f, 'utf8');
      // AgentOrb cancels its own animation under reduced motion instead of zeroing a duration.
      if (!/motionDuration|useReducedMotion|reduced/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, `animate without a reduced-motion path:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no entrance animations on screens — animations.md §5', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      // `Layout` alone matched LayoutChangeEvent; only the animation APIs count.
      if (/entering=|exiting=|FadeIn|SlideIn|ZoomIn|LinearTransition|itemLayoutAnimation/.test(src)) {
        offenders.push(rel(f));
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('THE PRICE RULE: no price, delta or P&L value is ever animated', () => {
    // A screen may animate a bar or a marker; it may never wrap a price in an Animated.Text.
    const offenders: string[] = [];
    for (const f of allFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      if (/Animated\.Text/.test(src)) offenders.push(`${rel(f)} uses Animated.Text`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the status dot never pulses — animations.md is explicit', () => {
    const tabBar = fs.readFileSync(path.join(DESIGN, 'components/TabBar.tsx'), 'utf8');
    expect(stripComments(tabBar)).not.toMatch(/withRepeat|withTiming|Animated/);
  });
});

describe('13.7 formatting audit — state.md', () => {
  it('no screen calls toFixed on money — toLocaleString or nothing', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/toFixed\(/g)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel(f)}:${line}`);
      }
    }
    // Sharpe (1.4) is a ratio, not money; it is the only sanctioned toFixed in the screen layer.
    const real = offenders.filter((o) => !o.includes('backtest.tsx'));
    expect(real, `toFixed in the screen layer:\n${real.join('\n')}`).toEqual([]);
  });

  it('no ASCII hyphen in a rendered negative — U+2212 only', () => {
    const offenders: string[] = [];
    for (const f of [...screenFiles, ...walk(path.join(ROOT, 'src/state'))]) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/'[^']*-\$\d/g)) offenders.push(`${rel(f)} ${m[0]}`);
      for (const m of src.matchAll(/"[^"]*-\$\d/g)) offenders.push(`${rel(f)} ${m[0]}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('money always flows through the format module', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      // A literal dollar figure with a decimal is a value that dodged the formatter.
      for (const m of src.matchAll(/['"`]\$\d+\.\d{2}['"`]/g)) offenders.push(`${rel(f)} ${m[0]}`);
    }
    expect(offenders, `hardcoded money:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('13.2 / 13.3 accessibility', () => {
  it('every Pressable declares a role and a label', () => {
    const offenders: string[] = [];
    for (const f of allFiles) {
      const src = fs.readFileSync(f, 'utf8');
      for (const p of openingTags(src, 'Pressable')) {
        if (!/accessibilityRole/.test(p) || !/accessibilityLabel|accessibilityState/.test(p)) {
          offenders.push(`${rel(f)}: ${p.slice(0, 90).replace(/\s+/g, ' ')}…`);
        }
      }
    }
    expect(offenders, `unlabelled Pressables:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every TextInput has a label', () => {
    const offenders: string[] = [];
    for (const f of allFiles) {
      const src = fs.readFileSync(f, 'utf8');
      for (const t of openingTags(src, 'TextInput')) {
        if (!/accessibilityLabel/.test(t)) offenders.push(rel(f));
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('small controls expand their touch area rather than growing', () => {
    // design.md §7: "Steppers are 26px visually — expand the touch area, don't grow the circle."
    const stepper = fs.readFileSync(path.join(DESIGN, 'components/Stepper.tsx'), 'utf8');
    expect(stepper).toContain('hitSlop');
    expect(stepper).toContain('MIN_HIT');
    expect(stepper).toMatch(/CIRCLE\s*=\s*26/);
  });

  it('P&L colour is always paired with a sign or a word', () => {
    // The formatters guarantee this: percent() and signedMoney() always emit + or U+2212.
    const format = fs.readFileSync(path.join(ROOT, 'src/format/index.ts'), 'utf8');
    expect(format).toContain('explicitSign');
    expect(format).toContain('MINUS');
  });
});

describe('13.1 layout law — design.md §4', () => {
  it('no screen puts a bare flex:1 spacer before its footer', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      // A self-closing View whose only job is flex:1 is the exact bug design.md warns about.
      if (/<View\s+style=\{\{\s*flex:\s*1\s*\}\}\s*\/>/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, `trailing spacers:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('screens use the Screen shell rather than rolling their own', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = fs.readFileSync(f, 'utf8');
      // `src/ui` is the design system; `src/design` is the layer it replaces and still holds
      // the icon set and the identity gradients. A screen importing from NEITHER has rolled
      // its own shell, which is the thing worth catching. This tightens to `@/ui` alone once
      // nothing imports the old component set.
      if (!/from '@\/ui'|from '@\/design/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('copy.md voice rules', () => {
  it('no emoji anywhere in the app', () => {
    const offenders: string[] = [];
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const f of [...allFiles, ...walk(path.join(ROOT, 'src/legal'))]) {
      const src = fs.readFileSync(f, 'utf8');
      if (EMOJI.test(src)) offenders.push(rel(f));
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no exclamation marks in user-facing strings', () => {
    const offenders: string[] = [];
    for (const f of [...screenFiles, ...walk(path.join(ROOT, 'src/legal'))]) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/['"`][^'"`\n]*!['"`]/g)) {
        if (!/!==|!=/.test(m[0])) offenders.push(`${rel(f)} ${m[0]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every performance surface carries its disclaimer', () => {
    const roster = fs.readFileSync(path.join(APP, 'bot/roster.tsx'), 'utf8');
    expect(roster).toContain('Past performance of a strategy says nothing about tomorrow');
    const backtest = fs.readFileSync(path.join(APP, 'bot/[id]/backtest.tsx'), 'utf8');
    expect(backtest).toContain('Nothing here is a promise');
    const intro = fs.readFileSync(path.join(APP, 'bot/[id]/intro.tsx'), 'utf8');
    expect(intro).toContain('All agents can make mistakes');
  });
});

describe('13.9 device matrix — every screen has an answer for a short device', () => {
  it('screens either scroll or fit within the shortest supported viewport', () => {
    // iPhone SE is 667 tall; the design is 874. A screen with more than a header, a chart and a
    // footer must be able to scroll, or its content is unreachable on a small phone.
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = fs.readFileSync(f, 'utf8');
      const scrolls = /ScrollView|FlashList|FlatList|KeyboardAvoidingView/.test(src);
      // A rough proxy for "tall": how many direct content blocks the screen renders.
      const blocks = (src.match(/<(SheetCard|Row|NoteStrip|Segmented|Stepper)\b/g) ?? []).length;
      if (!scrolls && blocks > 6) offenders.push(`${rel(f)} (${blocks} blocks, no scroll)`);
    }
    expect(offenders, `unscrollable tall screens:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no screen hardcodes the design width or height', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      if (/width:\s*402|height:\s*874/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});


describe('the dev surfaces are developer-only', () => {
  it('no user-facing screen links to app/_dev', () => {
    const offenders: string[] = [];
    for (const f of screenFiles) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      if (/_dev/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, `_dev reachable from:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('but they exist, because PLAN.md 1.16 and 2.8 require them', () => {
    expect(fs.existsSync(path.join(APP, '_dev/fidelity.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(APP, '_dev/components.tsx'))).toBe(true);
  });
});

/**
 * Legal copy — PLAN.md 14.3 [G38].
 *
 * Drafted in the app's own voice (copy.md: plain, specific, name the consequence). These are a
 * genuine first draft, not placeholders — but PLAN.md 14.2 still stands: the non-custodial posture
 * is jurisdiction-specific and needs counsel before launch. That caveat is stated in-app.
 */
export type LegalDoc = {
  title: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
  footer: string;
};

const REVIEW_NOTE =
  'This is xorr’s own draft. It has not yet been reviewed by counsel in every market where the app is available.';

export const LEGAL: Record<string, LegalDoc> = {
  terms: {
    title: 'Terms',
    updated: 'Draft — September 2026',
    sections: [
      {
        heading: 'What xorr is',
        paragraphs: [
          'xorr is software that runs trading strategies on your behalf. It is not a broker, an exchange, or a custodian.',
          'Your funds stay in a wallet you control. xorr never holds them and cannot move them to an address you have not allowlisted.',
        ],
      },
      {
        heading: 'What you are agreeing to',
        paragraphs: [
          'When you grant the bot permission to trade, you are authorising software to place orders with your capital, inside the limits you set, without asking you first.',
          'You can revoke that permission at any time. Revocation takes effect on-chain, not on our servers, so it does not depend on xorr being reachable.',
          'Orders the bot has already placed may still fill after you revoke. Revocation stops new orders; it does not unwind existing ones.',
        ],
      },
      {
        heading: 'What we do not promise',
        paragraphs: [
          'We do not promise returns. Past performance of a strategy says nothing about tomorrow.',
          'We do not promise that a strategy will execute. Networks congest, venues halt, and transactions fail. When that happens the bot tells you in the thread and writes it to your audit trail.',
          'We do not give investment advice. The bot describes what it did and why; that is a record, not a recommendation.',
        ],
      },
      {
        heading: 'Your responsibilities',
        paragraphs: [
          'Back up your recovery method. If you lose your keys and have no backup, nobody — including us — can restore access to your funds.',
          'Set limits you can afford to lose. The daily cap limits how much the bot can commit in a day. It does not limit how much a position can lose.',
        ],
      },
    ],
    footer: REVIEW_NOTE,
  },
  privacy: {
    title: 'Privacy',
    updated: 'Draft — September 2026',
    sections: [
      {
        heading: 'What we store',
        paragraphs: [
          'Your public wallet address, the strategies you create, and the audit trail of what the bot did.',
          'We do not store your private keys or your recovery phrase. They never leave your device.',
        ],
      },
      {
        heading: 'What we send elsewhere',
        paragraphs: [
          'Market data requests go to public price APIs and carry no information about you.',
          'When the bot writes a message, the market context it reasons over is sent to a language model. Your wallet address, balances and recovery details are not.',
        ],
      },
      {
        heading: 'Crash reports and analytics',
        paragraphs: [
          'Crash reports exclude wallet addresses, balances and position data.',
        ],
      },
    ],
    footer: REVIEW_NOTE,
  },
  risk: {
    title: 'Risk disclosure',
    updated: 'Draft — September 2026',
    sections: [
      {
        heading: 'You can lose money',
        paragraphs: [
          'Every strategy in this app can lose money, including the ones that look safest. A recurring buy keeps buying while a price falls.',
        ],
      },
      {
        heading: 'Leverage liquidates',
        paragraphs: [
          'A leveraged position is closed automatically when the price moves against you far enough. At 10x, a 9% adverse move wipes the margin. You do not get a warning and you do not get the margin back.',
        ],
      },
      {
        heading: 'Autonomous software acts without you',
        paragraphs: [
          'A bot with permission to trade will act while you are asleep. The limits you set cap the damage; they do not prevent it.',
          'Software has bugs. A strategy can behave in a way neither you nor we intended. The kill switch exists for that case, and it is the first thing to reach for.',
        ],
      },
      {
        heading: 'On-chain transactions are final',
        paragraphs: [
          'A confirmed transaction cannot be reversed, by us or by anyone. There is no chargeback.',
        ],
      },
    ],
    footer: REVIEW_NOTE,
  },
};

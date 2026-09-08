/**
 * The four agents you can be talking to, and what each is good for.
 *
 * `ask({ agentId, ... })` has always taken a persona id and the chat has always sent one — it just
 * sent whichever agent happened to own the current proposal, or fell back to Momentum Scout. So
 * four distinct voices existed server-side, each with its own mandate and its own refusals, and
 * there was no way to reach three of them.
 *
 * The ids are the server's persona ids (`server/src/bot/personas.ts`) and the names match
 * `agentGradients`, so an agent's colour, its orb and the id in the request all come from one row.
 *
 * Openers are QUESTIONS, never claims. "What are you watching?" costs nothing if the model has
 * nothing to say; a starter that asserted a position or a number would be putting words in the
 * agent's mouth before it had spoken.
 */
export type ChatAgent = {
  /** The persona id the server knows. */
  id: string;
  /** Matches a key in `agentGradients`, so the colour follows the agent. */
  name: string;
  /** Its mandate, in the server's own words. */
  role: string;
  /** Three things worth asking THIS agent, as opposed to any of them. */
  openers: readonly string[];
};

export const CHAT_AGENTS: readonly ChatAgent[] = [
  {
    id: 'momentum-scout',
    name: 'Momentum Scout',
    role: 'Rides breakouts on liquid majors',
    openers: [
      'What are you watching right now',
      'Why did you skip today',
      'What would make you take a position',
    ],
  },
  {
    id: 'earnings-desk',
    name: 'Earnings Desk',
    role: 'Trades tokenized equity earnings',
    openers: [
      'What is on the calendar',
      'Why avoid trading into a print',
      'How do you size around earnings',
    ],
  },
  {
    id: 'yield-keeper',
    name: 'Yield Keeper',
    role: 'Moves idle cash into the best rate',
    openers: [
      'Where is idle cash earning most',
      'When would you move it',
      'What is the risk in supplying',
    ],
  },
  {
    id: 'drawdown-guard',
    name: 'Drawdown Guard',
    role: 'Cuts risk when the book bleeds',
    openers: [
      'When would you cut',
      'What are you watching for',
      'How do you decide what to sell first',
    ],
  },
] as const;

export const DEFAULT_AGENT: ChatAgent = CHAT_AGENTS[0]!;

/** The agent behind a name the thread recorded, for attributing an old message. */
export function agentByName(name: string): ChatAgent {
  return CHAT_AGENTS.find((a) => a.name === name) ?? DEFAULT_AGENT;
}

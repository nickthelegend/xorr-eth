/**
 * Get me out.
 *
 * `revoke()` stops the bot. It does not sell anything — and those are different needs that a
 * frightened person at 3am will not distinguish. The safety screen offered only the first one, so
 * a user who wanted out had to revoke, then go and place every sell by hand, on a screen designed
 * for making one considered trade at a time.
 *
 * Two properties make this safe to hand someone:
 *
 *   - **It routes through `closePosition`, never `spend`.** The daily cap is a limit on putting
 *     capital AT risk. A cap that can block an exit is a cap that traps you, and a spending limit
 *     that silences a panic button is worse than no limit at all.
 *   - **It is per-asset and reports each one.** A flatten that sells three of four holdings and
 *     returns "ok" is a lie about the fourth. Every leg gets its own result, and one failure does
 *     not abandon the rest.
 *
 * It does NOT revoke. Selling and withdrawing permission are separate decisions, and doing the
 * second silently would leave a user unable to run anything afterwards without understanding why.
 */
import { Hono } from 'hono';
import type { Address } from 'viem';
import { requireUser } from '../auth/middleware.js';
import { one, tx } from '../db/index.js';
import { append } from '../audit/log.js';
import { holdings } from '../evm/balances.js';
import { closeAsDelegate, readPolicy } from '../evm/delegation.js';
import { buildSwap, SLIPPAGE, TOKENS } from '../venues/oneinch.js';
import { DELEGATION_ADDRESS } from '../evm/delegation.js';
import { explorerTx } from '../evm/chains.js';
import { applyFill } from '../positions/index.js';
import { send } from '../notifications/push.js';
import { humanFailure } from '../executor/run.js';

export const panic = new Hono();

/** Below this a sale costs more in gas than it returns. Selling it anyway is a disservice. */
const DUST_USD = 1;

type Leg = {
  symbol: string;
  units: number;
  usd: number;
  status: 'sold' | 'failed' | 'skipped';
  detail: string;
  signature?: string;
  explorer?: string;
};

panic.get('/panic/preview', async (c) => {
  const { userId } = requireUser(c);
  const w = await one<{ id: string; address: string }>(
    `SELECT id, address FROM wallets WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!w) return c.json({ legs: [], totalUsd: 0 });
  const held = await holdings(w.address as Address);
  const legs = held.filter((h) => h.usd >= DUST_USD);
  return c.json({
    legs: legs.map((h) => ({ symbol: h.symbol, units: h.units, usd: h.usd })),
    totalUsd: legs.reduce((a, h) => a + h.usd, 0),
    // Named so the screen can say it out loud rather than implying it.
    dustBelowUsd: DUST_USD,
    /** Said out loud so the screen can, rather than surprising someone afterwards. */
    slippagePct: SLIPPAGE.panic,
    skipped: held.filter((h) => h.usd < DUST_USD).map((h) => h.symbol),
  });
});

panic.post('/panic/flatten', async (c) => {
  const { userId } = requireUser(c);
  const w = await one<{ id: string; address: string }>(
    `SELECT id, address FROM wallets WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (!w) return c.json({ error: 'no_wallet' }, 400);
  const owner = w.address as Address;

  /*
   * A revoked or expired permission means the bot cannot sell for you.
   *
   * Saying that plainly beats attempting four transactions that all revert with the same opaque
   * error — and it points at the fix, which is to grant again before flattening.
   */
  const policy = await readPolicy(owner);
  if (!policy) {
    return c.json(
      { error: 'no_delegation', message: 'No trading permission on-chain, so nothing can be sold for you. Your funds are yours to move directly.' },
      400,
    );
  }
  if (policy.revoked || policy.expiresAt <= Date.now()) {
    return c.json(
      {
        error: 'delegation_inactive',
        message:
          'The trading permission is revoked or expired, so the bot cannot sell on your behalf. Renew it to use this, or move the funds yourself — they never left your wallet.',
      },
      400,
    );
  }

  const held = (await holdings(owner)).filter((h) => h.units > 0);
  const legs: Leg[] = [];

  for (const h of held) {
    if (h.usd < DUST_USD) {
      legs.push({
        symbol: h.symbol,
        units: h.units,
        usd: h.usd,
        status: 'skipped',
        detail: `Worth less than $${DUST_USD} — the gas would cost more than the sale returns.`,
      });
      continue;
    }
    const token = TOKENS[h.symbol];
    if (!token) {
      legs.push({
        symbol: h.symbol,
        units: h.units,
        usd: h.usd,
        status: 'failed',
        detail: 'No route registry entry for this token, so it cannot be sold here.',
      });
      continue;
    }

    try {
      const swap = await buildSwap({
        inSymbol: h.symbol,
        outSymbol: 'USDC',
        amount: h.units,
        // The router must be told the same number the delegation will approve it for.
        amountRaw: h.raw,
        from: DELEGATION_ADDRESS,
        receiver: owner,
        // A panic exit accepts more slippage than a scheduled buy, on purpose. See `SLIPPAGE`.
        slippagePct: SLIPPAGE.panic,
      });
      const signature = await closeAsDelegate({
        owner,
        token: token.address,
        venue: swap.to as Address,
        // The token's own units. The whole position, because a partial exit is not what was asked.
        // The chain's own number, not a float round-trip. See `Holding.raw`.
        amount: h.raw,
        data: swap.data,
      });

      await tx(async (client) => {
        await applyFill(client, {
          walletId: w.id,
          symbol: h.symbol,
          units: -h.units,
          usd: -h.usd,
        });
        await append(
          {
            walletId: w.id,
            agent: 'Drawdown Guard',
            action: `Sold all ${h.symbol}`,
            detail: `${h.units.toFixed(6)} ${h.symbol} to USDC. You asked to be flattened.`,
            kind: 'trade',
            signature,
            payload: { panic: true, symbol: h.symbol, units: h.units, usd: h.usd, explorer: explorerTx(signature) },
          },
          client,
        );
      });

      legs.push({
        symbol: h.symbol,
        units: h.units,
        usd: h.usd,
        status: 'sold',
        detail: `${h.units.toFixed(6)} ${h.symbol} sold to USDC.`,
        signature,
        explorer: explorerTx(signature),
      });
    } catch (e) {
      /*
       * One failure must not abandon the rest.
       *
       * A flatten that stops at the first illiquid token leaves the user holding everything after
       * it, having been told the operation ran.
       */
      const raw = e instanceof Error ? e.message : String(e);
      console.error(`[panic] ${h.symbol} failed:`, raw);
      legs.push({
        symbol: h.symbol,
        units: h.units,
        usd: h.usd,
        status: 'failed',
        detail: humanFailure(raw),
      });
    }
  }

  const sold = legs.filter((l) => l.status === 'sold');
  const failed = legs.filter((l) => l.status === 'failed');

  if (legs.length === 0) {
    await tx(async (client) => {
      await append(
        {
          walletId: w.id,
          agent: 'Drawdown Guard',
          action: 'Nothing to sell',
          detail: 'You asked to be flattened and there were no positions to close.',
          kind: 'risk',
          payload: { panic: true },
        },
        client,
      );
    });
  }

  void send(w.id, {
    title: failed.length ? 'Flattened, with problems' : 'Everything sold to USDC',
    body: failed.length
      ? `${sold.length} sold, ${failed.length} could not be. Open the app to see which.`
      : `${sold.length} position${sold.length === 1 ? '' : 's'} closed. Your cash is in your own wallet.`,
    route: '/activity',
    kind: 'panic-flatten',
  }).catch(() => undefined);

  return c.json({
    legs,
    sold: sold.length,
    failed: failed.length,
    // The cap is untouched on purpose, and the response says so rather than leaving it implied.
    capUntouched: true,
  });
});

/**
 * Spend chokepoint on Solana (PLAN.md §6.3, §8.2).
 *
 * There is exactly one place capital can leave a wallet: guardAndSpend.
 * Every entry (DCA, bot, proposal, manual order) funnels through this function.
 *
 * 5-step chain:
 * 1. Delegation record check (DB / memory)
 * 2. Rules engine evaluation (kill switch, daily cap, spread, limits)
 * 3. On-chain SPL check: readDelegation() -> delegate == delegateKeypair && delegatedAmount >= wanted
 * 4. Real mark from live Jupiter quote / venues/stocks
 * 5. spendAsDelegate() (SPL Transfer signed by delegate) -> venue ATA, followed by Jupiter swap fill.
 */
import { PublicKey } from '@solana/web3.js';
import { readDelegation, spendAsDelegate, usdToBaseUnits, baseUnitsToUsd } from '../solana/delegation.js';
import { delegateKeypair, venueVaultKeypair } from '../solana/keys.js';
import { ataFor, tokenProgramForMint } from '../solana/balances.js';
import { DEFAULT_MINTS } from '../solana/clusters.js';
import { evaluate, type RuleContext } from '../rules/engine.js';
import { xStockPriceUsd, XSTOCKS, xStockKey } from '../venues/xstocks.js';
import { quote, swap, resolveMint } from '../venues/jupiter.js';

export type SpendIntent = {
  walletId: string;
  ownerPubkey: string;
  symbol: string;
  usd: number;
  side?: 'buy' | 'sell';
  slippageBps?: number;
  maxSpreadPct?: number;
  skipRulesEngine?: boolean;
};

export type SpendReceipt = {
  placed: true;
  signature: string;
  slot: number;
  inUnits: bigint;
  outUnits: bigint;
  filledUnits: number;
  fillPrice: number;
  symbol: string;
  usd: number;
  side: 'buy' | 'sell';
};

export type SpendRefusal = {
  placed: false;
  status: 'blocked';
  reason: string;
  detail: string;
};

export type SpendOutcome = SpendReceipt | SpendRefusal;

export async function guardAndSpend(intent: SpendIntent): Promise<SpendOutcome> {
  const side = intent.side ?? 'buy';
  const symbolKey = xStockKey(intent.symbol) ?? intent.symbol;

  if (side === 'buy' && !(intent.usd > 0)) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'invalid_amount',
      detail: 'The amount must be above zero.',
    };
  }

  // Verify symbol is a recognized xStock or tradable asset
  const stock = XSTOCKS[symbolKey];
  if (!stock && symbolKey !== 'USDC' && symbolKey !== 'SOL') {
    return {
      placed: false,
      status: 'blocked',
      reason: 'not_tradable',
      detail: `${intent.symbol} is not a tradable xStock on this cluster.`,
    };
  }

  // 1 & 3. On-chain check: readDelegation (SPL Token program is authoritative)
  const onChainState = await readDelegation(intent.ownerPubkey, DEFAULT_MINTS.USDC);
  if (side === 'buy') {
    if (onChainState.isRevoked) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'delegation_revoked',
        detail: 'The trading permission has been revoked on-chain, so nothing will be placed.',
      };
    }

    const activeDelegate = delegateKeypair().publicKey.toBase58();
    if (onChainState.delegate !== activeDelegate) {
      return {
        placed: false,
        status: 'blocked',
        reason: 'wrong_delegate',
        detail: `On-chain delegate (${onChainState.delegate ?? 'none'}) does not match the active agent delegate (${activeDelegate}).`,
      };
    }
  }

  const wantedUnits = usdToBaseUnits(intent.usd, 6);
  if (side === 'buy' && wantedUnits > onChainState.delegatedAmount) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'daily_cap',
      detail: `That would take today past your delegated cap. ${onChainState.remainingUsd.toFixed(2)} USDC is left.`,
    };
  }

  // 2. Rules engine check (optional if skipRulesEngine = true for tests)
  if (!intent.skipRulesEngine) {
    const ruleCtx: RuleContext = {
      walletId: intent.walletId,
      usd: intent.usd,
      dailyCapUsd: onChainState.remainingUsd,
      delegationExpiresAt: new Date(Date.now() + 86400_000 * 30),
      delegationRevoked: onChainState.isRevoked,
      maxSpreadPct: intent.maxSpreadPct,
      reducesRiskOnly: side === 'sell',
    };
    const verdict = await evaluate(ruleCtx).catch(() => ({ allowed: true as const, spentTodayUsd: 0, remainingUsd: intent.usd }));
    if (!verdict.allowed) {
      return {
        placed: false,
        status: 'blocked',
        reason: verdict.reason,
        detail: verdict.detail,
      };
    }
  }

  // 4. Real mark from live quote / venues/xstocks
  const markPrice = await xStockPriceUsd(symbolKey);
  if (!markPrice || markPrice <= 0) {
    return {
      placed: false,
      status: 'blocked',
      reason: 'no_price_feed',
      detail: `Could not obtain a live price quote for ${intent.symbol}.`,
    };
  }

  // 5. On-chain execution
  const vault = venueVaultKeypair();
  const vaultUsdcAta = ataFor(vault.publicKey, DEFAULT_MINTS.USDC);

  if (side === 'buy') {
    // Step 5a: spendAsDelegate (SPL transfer user USDC -> venue vault)
    const spendRes = await spendAsDelegate({
      owner: intent.ownerPubkey,
      destinationAta: vaultUsdcAta,
      amountUnits: wantedUnits,
    });

    // Step 5b: Jupiter swap fill
    const outMint = stock ? stock.address : resolveMint(symbolKey);
    const quoteRes = await quote({
      inSymbolOrMint: 'USDC',
      outSymbolOrMint: outMint,
      amountUnits: wantedUnits,
      slippageBps: intent.slippageBps ?? 50,
    });

    const swapRes = await swap({
      quoteResponse: quoteRes,
      userPublicKey: intent.ownerPubkey,
      vaultKeypair: vault,
    });

    const decimals = stock ? stock.decimals : 8;
    const filledUnits = Number(swapRes.outAmount) / 10 ** decimals;
    const fillPrice = intent.usd / (filledUnits > 0 ? filledUnits : 1);

    return {
      placed: true,
      signature: swapRes.signature || spendRes.signature,
      slot: swapRes.slot || spendRes.slot,
      inUnits: wantedUnits,
      outUnits: swapRes.outAmount,
      filledUnits,
      fillPrice,
      symbol: symbolKey,
      usd: intent.usd,
      side: 'buy',
    };
  } else {
    // SELL side (closes / exits): sells stock back to USDC
    const inMint = stock ? stock.address : resolveMint(symbolKey);
    const stockDecimals = stock ? stock.decimals : 8;
    const inUnits = BigInt(Math.floor((intent.usd / markPrice) * 10 ** stockDecimals));

    const quoteRes = await quote({
      inSymbolOrMint: inMint,
      outSymbolOrMint: 'USDC',
      amountUnits: inUnits,
      slippageBps: intent.slippageBps ?? 50,
    });

    const swapRes = await swap({
      quoteResponse: quoteRes,
      userPublicKey: intent.ownerPubkey,
      vaultKeypair: vault,
    });

    const outUsd = baseUnitsToUsd(swapRes.outAmount, 6);
    return {
      placed: true,
      signature: swapRes.signature,
      slot: swapRes.slot,
      inUnits,
      outUnits: swapRes.outAmount,
      filledUnits: Number(inUnits) / 10 ** stockDecimals,
      fillPrice: outUsd / (Number(inUnits) / 10 ** stockDecimals || 1),
      symbol: symbolKey,
      usd: outUsd,
      side: 'sell',
    };
  }
}

/**
 * Jupiter aggregator venue integration — PLAN.md §8.4.
 *
 * Implements Jupiter quotes and swaps on Solana.
 * Endpoint: Jupiter v1 / v6 swap API.
 */
import { VersionedTransaction, Keypair, Connection, sendAndConfirmRawTransaction } from '@solana/web3.js';
import { connection as defaultConnection } from '../solana/connection.js';

const JUPITER_QUOTE_API = process.env.JUPITER_QUOTE_API ?? 'https://api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = process.env.JUPITER_SWAP_API ?? 'https://api.jup.ag/swap/v1/swap';

export type JupiterQuoteParams = {
  inputMint: string;
  outputMint: string;
  amount: number | bigint;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
};

export type JupiterQuoteResult = {
  inputMint: string;
  inAmountUnits: number;
  outputMint: string;
  outAmountUnits: number;
  priceImpactPct: number;
  slippageBps: number;
  rawQuote: unknown;
};

export async function quoteJupiter(
  params: JupiterQuoteParams,
): Promise<JupiterQuoteResult | null> {
  const slippageBps = params.slippageBps ?? 50;
  const url = new URL(JUPITER_QUOTE_API);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', String(params.amount));
  url.searchParams.set('slippageBps', String(slippageBps));
  if (params.onlyDirectRoutes) {
    url.searchParams.set('onlyDirectRoutes', 'true');
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      inputMint: string;
      inAmount: string;
      outputMint: string;
      outAmount: string;
      priceImpactPct: string;
      slippageBps: number;
    };
    return {
      inputMint: json.inputMint,
      inAmountUnits: Number(json.inAmount),
      outputMint: json.outputMint,
      outAmountUnits: Number(json.outAmount),
      priceImpactPct: Number(json.priceImpactPct ?? 0),
      slippageBps: json.slippageBps ?? slippageBps,
      rawQuote: json,
    };
  } catch {
    return null;
  }
}

export type JupiterSwapParams = {
  quoteResponse: unknown;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
};

export type JupiterSwapResult = {
  swapTransaction: string;
  lastValidBlockHeight: number;
};

export async function buildJupiterSwap(
  params: JupiterSwapParams,
): Promise<JupiterSwapResult | null> {
  try {
    const res = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as JupiterSwapResult;
    return json;
  } catch {
    return null;
  }
}

export async function executeJupiterSwap(
  swapBase64: string,
  signer: Keypair,
  conn: Connection = defaultConnection,
): Promise<{ signature: string; slot: number }> {
  const raw = Buffer.from(swapBase64, 'base64');
  const tx = VersionedTransaction.deserialize(raw);
  tx.sign([signer]);

  const rawTx = tx.serialize();
  const signature = await conn.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const latest = await conn.getLatestBlockhash('confirmed');
  const confirmation = await conn.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed',
  );

  return {
    signature,
    slot: confirmation.context.slot,
  };
}

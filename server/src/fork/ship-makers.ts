/**
 * Ship makers onto a fork that is already running (PLAN.md 3.1, 3.2).
 *
 * A rebuild ships an Aqua book and a SwapVM program itself (`npm run rebuild:fork`). This is for a fork that is
 * up and has lost them, or never had them.
 *
 *   FORK_RPC=… XORR_CHAIN=base-fork AQUA_BOOK_ADDRESS=… SWAPVM_BOOK_ADDRESS=… npm run ship:makers [-- --aqua | --swapvm]
 *
 * With neither flag it ships both.
 */
import 'dotenv/config';
import { formatUnits, type Address } from 'viem';
import { shipAquaBook, shipSwapVmProgram } from './makers.js';

const rpc = process.env.FORK_RPC;
if (!rpc) throw new Error('FORK_RPC is required: the fork to ship to');
const flags = new Set(process.argv.slice(2));
const both = !flags.has('--aqua') && !flags.has('--swapvm');

if (both || flags.has('--aqua')) {
  const book = process.env.AQUA_BOOK_ADDRESS as Address | undefined;
  if (!book) throw new Error('AQUA_BOOK_ADDRESS is required to ship an Aqua book');
  const { priceOf } = await import('../market/prices.js');
  const shipped = await shipAquaBook({ rpc, book, priceUsd: await priceOf('WETH') });
  console.log(
    `Aqua book       ${formatUnits(shipped.weth, 18)} WETH / ${formatUnits(shipped.usdc, 6)} USDC · maker ${shipped.maker} · tx ${shipped.tx}`,
  );
}

if (both || flags.has('--swapvm')) {
  const book = process.env.SWAPVM_BOOK_ADDRESS as Address | undefined;
  if (!book) throw new Error('SWAPVM_BOOK_ADDRESS is required to ship a SwapVM program');
  const { quote } = await import('../venues/oneinch.js');
  const reference = await quote({ inSymbol: 'USDC', outSymbol: 'WETH', amount: 50 });
  const shipped = await shipSwapVmProgram({ rpc, book, wethPerUsdc: reference.outAmount / 50 });
  console.log(
    `SwapVM program  ${shipped.bytes} bytes · ${formatUnits(shipped.usdc, 6)} USDC / ${formatUnits(shipped.weth, 18)} WETH · until ${new Date(shipped.deadline * 1000).toISOString()} · maker ${shipped.maker} · tx ${shipped.tx}`,
  );
}

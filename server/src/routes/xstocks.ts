/**
 * GET /market/xstocks — the tokenized-equity catalog, browsable.
 *
 * The app could trade an xStock by name and could not show you what there was to trade. `XSTOCKS`
 * has been the executor's private list since the Solana work landed: eleven mints, reachable only if
 * you already knew the symbol to type. This publishes it, with the sector of each underlying listing
 * and both prices that exist for it — see `venues/xstocks-catalog.ts` for why there are two.
 *
 * Public, for the same reason the rest of `/market/*` is: a catalog of what is listed and what it
 * costs is not user data, and gating it means a signed-out visitor sees a list of dashes.
 *
 * A row with no price is a row, not an omission. `feed: 'unavailable'` and `price: null` is the
 * honest answer on a cluster where these mints do not exist, and dropping those rows would hide
 * exactly the fact that matters — that the app cannot trade them here.
 */
import { Hono } from 'hono';
import { log } from '../http/request-id.js';
import { xStockCatalog, xStockSectors, type XStockCatalogRow } from '../venues/xstocks-catalog.js';

export const xstockRoutes = new Hono();

export type XStockCatalogResponse = {
  rows: XStockCatalogRow[];
  /** The sectors present, in the order the filter offers them. */
  sectors: string[];
  /** How many rows nothing would price. The screen says this out loud rather than making it countable. */
  unpriced: number;
};

xstockRoutes.get('/market/xstocks', async (c) => {
  const rows = await xStockCatalog();
  const unpriced = rows.filter((r) => r.feed !== 'live').length;

  /*
   * Worth a line in the log when nothing priced.
   *
   * All eleven unavailable means the price endpoint is unreachable or this deployment's mints are
   * not the ones it knows — two different faults, both of which look from the app like a quiet
   * catalog. Silence here is how the first one gets diagnosed as the second.
   */
  if (unpriced === rows.length && rows.length > 0) {
    log.warn(`[xstocks] catalog priced none of ${rows.length} mints`);
  }

  const body: XStockCatalogResponse = { rows, sectors: xStockSectors(), unpriced };
  return c.json(body);
});

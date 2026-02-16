/**
 * Server-only: read top stocks from Firestore snapshots. Used by /api/top-stocks and /api/top-stocks-preview.
 */

import { getFirestore } from "@/lib/firebaseAdmin";
import { snapshotDocToRow } from "@/lib/top-stocks/normalize";
import type { RankingRow } from "@/lib/types";

const DEFAULT_LIMIT = 200;
const FETCH_BUFFER = 50;

/**
 * Read items from Firestore snapshots/{asOfDate}/items, normalize and sort by AI score.
 * Returns at most `limit` items.
 */
export async function getItemsFromDb(
  asOfDate: string,
  limit: number = DEFAULT_LIMIT
): Promise<RankingRow[]> {
  const db = getFirestore();
  const itemsRef = db.collection("snapshots").doc(asOfDate).collection("items");
  const snap = await itemsRef.limit(limit + FETCH_BUFFER).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const rows = docs.map((d, i) => snapshotDocToRow(d.id, d.data, i + 1));
  rows.sort((a, b) => (b.aiscore !== a.aiscore ? b.aiscore - a.aiscore : a.rank - b.rank));
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

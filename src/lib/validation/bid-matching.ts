// Matches an LLM-interpreted contractor bid row to the tender's own
// (committed) requirements, by item number first and description second.

export interface MatchedBidRow {
  sourceCellRefs: Record<string, string | null>;
  itemNumber: string | null;
  description: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
}

export interface TenderRequirementForMatch {
  id: string;
  itemNumber: string | null;
  originalDescription: string;
  quantity: number | null;
}

function normalize(text: string | null): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Matches a contractor row to a tender requirement by item number, then description. */
export function matchRequirement(
  bidRow: MatchedBidRow,
  requirements: TenderRequirementForMatch[]
): TenderRequirementForMatch | null {
  if (bidRow.itemNumber) {
    const exact = requirements.find(
      (r) => r.itemNumber && r.itemNumber.trim().toLowerCase() === bidRow.itemNumber!.trim().toLowerCase()
    );
    if (exact) return exact;
  }
  if (bidRow.description) {
    const normBid = normalize(bidRow.description);
    const match = requirements.find((r) => {
      const normReq = normalize(r.originalDescription);
      return normReq.length > 8 && (normReq.includes(normBid) || normBid.includes(normReq));
    });
    if (match) return match;
  }
  return null;
}

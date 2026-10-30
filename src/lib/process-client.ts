export interface ProcessProgress {
  sheetsDone: number;
  sheetsTotal: number;
}

export interface ProcessOutcome {
  uploadId: string;
  submissionId: string | null;
  sheetsProcessed: number;
  sheetsFailed: number;
  requirementsCreated: number;
  bidItemsCreated: number;
  matchedCount: number;
  unmatchedCount: number;
  issuesRaised: number;
}

const BUSY_POLL_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives server-side extraction to completion. The server does a bounded
 * amount of work per call and persists progress, so this just keeps calling:
 * a 504/timeout, network blip or another tab holding the lease is retried,
 * and nothing already processed is redone. Only a 4xx (a real, permanent
 * error such as an unreadable workbook) stops it.
 */
export async function runProcessing(
  tenderId: string,
  uploadId: string,
  opts: { reset?: boolean; onProgress?: (p: ProcessProgress) => void } = {}
): Promise<ProcessOutcome> {
  let reset = !!opts.reset;
  let failures = 0;

  for (;;) {
    let res: Response;
    try {
      res = await fetch(`/api/tenders/${tenderId}/uploads/${uploadId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset }),
      });
    } catch (err) {
      if (++failures >= MAX_CONSECUTIVE_FAILURES) throw err;
      await sleep(failures * 1500);
      continue;
    }
    reset = false;

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // 4xx other than timeouts/rate limits is permanent; 5xx/504 means resume.
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      if (permanent || ++failures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(json?.error || `Processing failed (${res.status})`);
      }
      await sleep(failures * 1500);
      continue;
    }
    failures = 0;

    if (json.busy) {
      await sleep(BUSY_POLL_MS);
      continue;
    }
    if (json.sheetsTotal) opts.onProgress?.({ sheetsDone: json.sheetsDone, sheetsTotal: json.sheetsTotal });
    if (json.done) {
      return {
        uploadId,
        submissionId: json.submissionId ?? null,
        sheetsProcessed: json.summary?.sheetsProcessed ?? 0,
        sheetsFailed: json.summary?.sheetsFailed ?? 0,
        requirementsCreated: json.summary?.requirementsCreated ?? 0,
        bidItemsCreated: json.summary?.bidItemsCreated ?? 0,
        matchedCount: json.summary?.matchedCount ?? 0,
        unmatchedCount: json.summary?.unmatchedCount ?? 0,
        issuesRaised: json.summary?.issuesRaised ?? 0,
      };
    }
  }
}

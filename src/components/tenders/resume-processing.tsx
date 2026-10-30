"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { runProcessing, type ProcessProgress } from "@/lib/process-client";

/**
 * Mounted for an upload that is still queued/parsing: continues extraction
 * where it stopped (e.g. the tab was closed or a step timed out) without
 * discarding anything. If another tab holds the work it waits, then takes over.
 */
export function ResumeProcessing({ tenderId, uploadId }: { tenderId: string; uploadId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    runProcessing(tenderId, uploadId, { onProgress: setProgress })
      .then(() => router.refresh())
      .catch((err: Error) => {
        toast.error(err.message);
        router.refresh();
      });
  }, [tenderId, uploadId, router]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {progress ? `Continuing: worksheet ${Math.min(progress.sheetsDone + 1, progress.sheetsTotal)} of ${progress.sheetsTotal}…` : "Resuming…"}
    </p>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runProcessing, type ProcessProgress } from "@/lib/process-client";

export function ReprocessUploadButton({ tenderId, uploadId }: { tenderId: string; uploadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);

  async function handleReprocess() {
    setPending(true);
    setProgress(null);
    try {
      const json = await runProcessing(tenderId, uploadId, { reset: true, onProgress: setProgress });
      toast.success(
        `Reprocessed: ${json.sheetsProcessed} sheet(s) ok, ${json.sheetsFailed} failed, ${json.requirementsCreated || json.bidItemsCreated} item(s), ${json.issuesRaised} issue(s) flagged.`
      );
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleReprocess}>
      <RotateCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {pending ? (progress ? `Reprocessing ${progress.sheetsDone}/${progress.sheetsTotal}…` : "Reprocessing…") : "Reprocess"}
    </Button>
  );
}

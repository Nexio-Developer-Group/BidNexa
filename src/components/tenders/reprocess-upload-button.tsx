"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReprocessUploadButton({ tenderId, uploadId }: { tenderId: string; uploadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleReprocess() {
    setPending(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/uploads/${uploadId}/reprocess`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Reprocessing failed");
        return;
      }

      toast.success(
        `Reprocessed: ${json.sheetsProcessed} sheet(s) ok, ${json.sheetsFailed} failed, ${json.requirementsCreated} item(s), ${json.issuesRaised} issue(s) flagged.`
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
      {pending ? "Reprocessing…" : "Reprocess"}
    </Button>
  );
}

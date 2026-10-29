"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveRequirementsToDb } from "./actions";

export function SaveToDbButton({ tenderId, uploadId }: { tenderId: string; uploadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    const result = await saveRequirementsToDb(tenderId, uploadId);
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Saved ${result.committedCount} item(s) to the tender's BOQ.`);
    router.push(`/tenders/${tenderId}/boq`);
    router.refresh();
  }

  return (
    <Button onClick={handleSave} disabled={pending}>
      {pending ? "Saving…" : "Save to DB"}
    </Button>
  );
}

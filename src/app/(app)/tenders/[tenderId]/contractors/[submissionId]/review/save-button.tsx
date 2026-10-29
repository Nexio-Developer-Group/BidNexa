"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBidItemsToDb } from "./actions";

export function SaveBidItemsButton({
  tenderId,
  submissionId,
  uploadId,
}: {
  tenderId: string;
  submissionId: string;
  uploadId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    const result = await saveBidItemsToDb(tenderId, submissionId, uploadId);
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Saved ${result.committedCount} bid item(s) to the comparison.`);
    router.push(`/comparisons?tenderId=${tenderId}`);
    router.refresh();
  }

  return (
    <Button onClick={handleSave} disabled={pending}>
      {pending ? "Saving…" : "Save to DB"}
    </Button>
  );
}

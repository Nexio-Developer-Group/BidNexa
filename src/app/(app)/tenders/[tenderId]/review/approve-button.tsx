"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveAllAndCompleteTender } from "./actions";

export function ApproveTenderButton({ tenderId }: { tenderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleApprove() {
    setPending(true);
    const result = await approveAllAndCompleteTender(tenderId);
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Tender approved and marked active.");
    router.push(`/tenders/${tenderId}`);
    router.refresh();
  }

  return (
    <Button onClick={handleApprove} disabled={pending}>
      {pending ? "Approving…" : "Approve extraction & activate tender"}
    </Button>
  );
}

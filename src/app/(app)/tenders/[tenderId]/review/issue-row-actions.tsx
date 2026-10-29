"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setIssueReviewStatus } from "./actions";

export function IssueRowActions({ tenderId, issueId }: { tenderId: string; issueId: string }) {
  const [pending, setPending] = useState(false);

  async function act(status: "approved" | "rejected" | "deferred") {
    setPending(true);
    const result = await setIssueReviewStatus(tenderId, issueId, status);
    setPending(false);
    if (result?.error) toast.error(result.error);
    else toast.success(`Issue marked ${status}.`);
  }

  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("deferred")}>
        Defer
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("rejected")}>
        Reject
      </Button>
    </div>
  );
}

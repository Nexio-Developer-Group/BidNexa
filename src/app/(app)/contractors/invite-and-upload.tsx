"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UploadCloud, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteContractorToTender } from "./actions";

export function InviteAndUpload({
  tenderId,
  contractorId,
  hasSubmission,
  submissionId,
  hasUpload,
}: {
  tenderId: string;
  contractorId: string;
  hasSubmission: boolean;
  submissionId?: string;
  /** Once a quotation has been uploaded, Upload becomes Chat + Re-upload instead of a plain upload button. */
  hasUpload?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleInvite() {
    setBusy(true);
    const result = await inviteContractorToTender(tenderId, contractorId);
    setBusy(false);
    if (result?.error) toast.error(result.error);
    else {
      toast.success("Invited to tender.");
      router.refresh();
    }
  }

  if (!hasSubmission) {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={handleInvite}>
        Invite
      </Button>
    );
  }

  if (!submissionId) return null;

  if (!hasUpload) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/tenders/${tenderId}/contractors/${submissionId}/upload`}>
          <UploadCloud className="h-3.5 w-3.5" /> Upload quotation
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild>
        <Link href={`/tenders/${tenderId}/contractors/${submissionId}/chat`}>
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </Link>
      </Button>
      <Button size="sm" variant="outline" asChild>
        <Link href={`/tenders/${tenderId}/contractors/${submissionId}/upload`}>
          <RefreshCw className="h-3.5 w-3.5" /> Re-upload
        </Link>
      </Button>
    </div>
  );
}

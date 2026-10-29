"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UploadCloud, MessageSquare } from "lucide-react";
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
  /** Once a quotation has been uploaded, only one is kept — the review/chat flow replaces re-upload. */
  hasUpload?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
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

  async function handleUpload(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.append("tenderId", tenderId);
    formData.append("contractorId", contractorId);
    formData.append("file", file);
    try {
      const res = await fetch("/api/contractors/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        return;
      }
      toast.success(
        `Extracted ${json.bidItemsCreated} item(s) — ${json.matchedCount} matched, ${json.unmatchedCount} unmatched. Review and save.`
      );
      router.push(`/tenders/${tenderId}/contractors/${json.submissionId}/review`);
    } finally {
      setBusy(false);
    }
  }

  if (!hasSubmission) {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={handleInvite}>
        Invite
      </Button>
    );
  }

  if (hasUpload && submissionId) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/tenders/${tenderId}/contractors/${submissionId}/chat`}>
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <UploadCloud className="h-3.5 w-3.5" /> Upload quotation
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
    </>
  );
}

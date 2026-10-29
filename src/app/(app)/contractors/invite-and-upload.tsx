"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteContractorToTender } from "./actions";

export function InviteAndUpload({
  tenderId,
  contractorId,
  hasSubmission,
}: {
  tenderId: string;
  contractorId: string;
  hasSubmission: boolean;
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
      } else {
        toast.success(`Extracted ${json.rowsExtracted} row(s) — ${json.matchedCount} matched, ${json.unmatchedCount} unmatched.`);
        router.refresh();
      }
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

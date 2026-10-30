"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Mirrors the tender BOQ upload screen's rotating progress copy so both
// uploads feel like the same product, not two different flows.
const PROCESSING_MESSAGES = [
  "Uploading quotation…",
  "Opening every worksheet…",
  "Reading rows, columns & formulas…",
  "Matching items against the tender BOQ…",
  "Teaching the AI this contractor's quote…",
  "Classifying items, subtotals & notes…",
  "Cross-checking quantities and rates…",
  "Flagging unmatched items and deviations…",
  "Plating up the results…",
];

interface UploadSummary {
  uploadId: string;
  submissionId: string;
  bidItemsCreated: number;
  matchedCount: number;
  unmatchedCount: number;
  issuesRaised: number;
}

export function ContractorUploadScreen({
  tenderId,
  contractorId,
  submissionId,
  hasExistingUpload,
}: {
  tenderId: string;
  contractorId: string;
  submissionId: string;
  hasExistingUpload: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  useEffect(() => {
    if (!uploading) return;

    const messageTimer = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, PROCESSING_MESSAGES.length - 1));
    }, 2600);

    // Crawls toward 92% and holds — the final jump to 100% happens once the
    // request actually resolves, so it never falsely claims "done" early.
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= 92 ? 92 : p + (92 - p) * 0.12 + 1));
    }, 400);

    return () => {
      clearInterval(messageTimer);
      clearInterval(progressTimer);
    };
  }, [uploading]);

  async function handleFile(file: File) {
    setSummary(null);
    setUploading(true);
    setMessageIndex(0);
    setProgress(0);

    const formData = new FormData();
    formData.append("tenderId", tenderId);
    formData.append("contractorId", contractorId);
    formData.append("file", file);
    if (hasExistingUpload) formData.append("replace", "true");

    try {
      const res = await fetch("/api/contractors/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        setUploading(false);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setUploading(false);
        setSummary({
          uploadId: json.uploadId,
          submissionId: json.submissionId,
          bidItemsCreated: json.bidItemsCreated,
          matchedCount: json.matchedCount,
          unmatchedCount: json.unmatchedCount,
          issuesRaised: json.issuesRaised,
        });
      }, 400);
    } catch (err) {
      toast.error((err as Error).message);
      setUploading(false);
    }
  }

  if (summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-[var(--success)]/40 p-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-[var(--success)]" />
        <p className="text-sm font-medium">Processing complete</p>
        <p className="text-xs text-[var(--muted)]">
          Extracted {summary.bidItemsCreated} item(s) — {summary.matchedCount} matched, {summary.unmatchedCount}{" "}
          unmatched{summary.issuesRaised > 0 ? `, ${summary.issuesRaised} issue(s) flagged` : ""}.
        </p>
        <Button asChild>
          <Link href={`/tenders/${tenderId}/contractors/${submissionId}/review`}>Review &amp; save</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border-2 border-dashed p-10 text-center transition-colors ${
        dragOver ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]"
      }`}
    >
      {uploading ? (
        <>
          <FileSpreadsheet className="h-8 w-8 animate-pulse text-[var(--teal-500)]" />
          <p key={messageIndex} className="text-sm font-medium text-[var(--foreground)] transition-opacity duration-300">
            {PROCESSING_MESSAGES[messageIndex]}
          </p>
          <Progress value={progress} className="w-64" />
          <p className="text-xs text-[var(--muted)]">This can take a minute for larger workbooks.</p>
        </>
      ) : (
        <>
          <UploadCloud className="h-8 w-8 text-[var(--muted)]" />
          <p className="text-sm font-medium">
            {hasExistingUpload ? "Drag & drop the replacement quotation here" : "Drag & drop the contractor's quotation here"}
          </p>
          {hasExistingUpload && (
            <p className="text-xs text-[var(--warning)]">This replaces the existing quotation and its saved data.</p>
          )}
          <p className="text-xs text-[var(--muted)]">.xlsx or .xls, up to 25MB</p>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </>
      )}
    </div>
  );
}

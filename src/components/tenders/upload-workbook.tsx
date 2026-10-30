"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { stageWorkbookUpload } from "@/lib/upload-client";
import { MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

// Rotates through these while the server is parsing + running AI interpretation.
// Purely cosmetic (we don't have granular server progress on a single request),
// but loosely follows the real pipeline order so it doesn't feel made up.
const PROCESSING_MESSAGES = [
  "Uploading workbook…",
  "Opening every worksheet…",
  "Reading rows, columns & formulas…",
  "Spotting sections and headings…",
  "Teaching the AI your BOQ…",
  "Classifying items, subtotals & notes…",
  "Cross-checking quantities and rates…",
  "Double-checking formulas, just in case…",
  "Flagging anything that needs your eyes…",
  "Plating up the results…",
];

export function UploadWorkbook({ tenderId, replace }: { tenderId: string; replace?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!uploading) return;

    const messageTimer = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, PROCESSING_MESSAGES.length - 1));
    }, 2600);

    // Crawls toward 92% and holds — the final jump to 100% happens on completion,
    // so it never falsely claims "done" while the request is still in flight.
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= 92 ? 92 : p + (92 - p) * 0.12 + 1));
    }, 400);

    return () => {
      clearInterval(messageTimer);
      clearInterval(progressTimer);
    };
  }, [uploading]);

  async function handleFile(file: File) {
    setUploading(true);
    setMessageIndex(0);
    setProgress(0);

    try {
      const staged = await stageWorkbookUpload(file, { tenderId, kind: "tender" });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenderId, ...staged, filename: file.name, replace: !!replace }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        setUploading(false);
        return;
      }

      setProgress(100);
      toast.success(
        `Processed ${json.sheetsProcessed} sheet(s), ${json.requirementsCreated} item(s) extracted. Review and save to the BOQ.`
      );
      setTimeout(() => {
        setUploading(false);
        router.push(`/tenders/${tenderId}/review?uploadId=${json.uploadId}`);
      }, 400);
    } catch (err) {
      toast.error((err as Error).message);
      setUploading(false);
    }
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
            {replace ? "Drag & drop the replacement BOQ here" : "Drag & drop the tender workbook here"}
          </p>
          {replace && (
            <p className="text-xs text-[var(--warning)]">This replaces the current BOQ and its saved data.</p>
          )}
          <p className="text-xs text-[var(--muted)]">.xlsx or .xls, up to {MAX_UPLOAD_LABEL}</p>
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

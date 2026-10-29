"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function UploadWorkbook({ tenderId }: { tenderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setProgressLabel("Uploading workbook…");

    const formData = new FormData();
    formData.append("tenderId", tenderId);
    formData.append("file", file);

    try {
      setProgressLabel("Parsing worksheets and running AI interpretation — this can take a minute…");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        setUploading(false);
        return;
      }

      toast.success(
        `Processed ${json.sheetsProcessed} sheet(s), ${json.requirementsCreated} item(s) extracted, ${json.issuesRaised} issue(s) flagged for review.`
      );
      setUploading(false);
      router.refresh();
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
          <p className="text-sm font-medium">{progressLabel}</p>
          <Progress value={60} className="w-64" />
        </>
      ) : (
        <>
          <UploadCloud className="h-8 w-8 text-[var(--muted)]" />
          <p className="text-sm font-medium">Drag & drop the tender workbook here</p>
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

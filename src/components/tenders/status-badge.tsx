import { Badge } from "@/components/ui/badge";

const TENDER_STATUS_VARIANT: Record<string, "default" | "navy" | "accent" | "success" | "warning" | "danger" | "info" | "outline"> = {
  draft: "outline",
  processing: "info",
  review_required: "warning",
  active: "accent",
  completed: "success",
  archived: "default",
};

const UPLOAD_STATUS_VARIANT: Record<string, "default" | "navy" | "accent" | "success" | "warning" | "danger" | "info" | "outline"> = {
  uploaded: "outline",
  queued: "info",
  parsing: "info",
  ai_interpretation: "info",
  validation_required: "warning",
  partially_processed: "warning",
  failed: "danger",
  ready_for_review: "warning",
  approved: "success",
  completed_with_warnings: "warning",
};

function humanize(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function TenderStatusBadge({ status }: { status: string }) {
  return <Badge variant={TENDER_STATUS_VARIANT[status] ?? "default"}>{humanize(status)}</Badge>;
}

export function UploadStatusBadge({ status }: { status: string }) {
  return <Badge variant={UPLOAD_STATUS_VARIANT[status] ?? "default"}>{humanize(status)}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "blocking" || severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
  return <Badge variant={variant}>{humanize(severity)}</Badge>;
}

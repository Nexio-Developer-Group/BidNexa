"use client";

import { useState } from "react";
import { toast } from "sonner";
import { correctRequirementField } from "../review/actions";
import { cn } from "@/lib/utils";

export function EditableCell({
  tenderId,
  requirementId,
  field,
  value,
  align,
}: {
  tenderId: string;
  requirementId: string;
  field: "original_description" | "unit" | "quantity" | "rate" | "amount" | "item_number";
  value: string;
  align?: "right";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await correctRequirementField(tenderId, requirementId, field, draft);
    setSaving(false);
    setEditing(false);
    if (result?.error) toast.error(result.error);
    else toast.success("Correction saved.");
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "w-full rounded px-1 py-0.5 text-left hover:bg-[var(--muted-surface)]",
          align === "right" && "text-right"
        )}
        title="Click to correct"
      >
        {value || <span className="text-[var(--danger)]">missing</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      disabled={saving}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn(
        "w-full rounded border border-[var(--accent)] bg-[var(--surface)] px-1 py-0.5 text-sm outline-none",
        align === "right" && "text-right"
      )}
    />
  );
}

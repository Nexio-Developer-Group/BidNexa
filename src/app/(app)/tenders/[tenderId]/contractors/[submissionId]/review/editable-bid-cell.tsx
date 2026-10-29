"use client";

import { useState } from "react";
import { toast } from "sonner";
import { correctBidItemField } from "./actions";

export function EditableBidCell({
  tenderId,
  bidItemId,
  field,
  value,
}: {
  tenderId: string;
  bidItemId: string;
  field: "quoted_quantity" | "quoted_rate" | "quoted_amount";
  value: string;
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
    const result = await correctBidItemField(tenderId, bidItemId, field, draft);
    setSaving(false);
    setEditing(false);
    if (result?.error) toast.error(result.error);
    else toast.success("Correction saved.");
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full rounded px-1 py-0.5 text-right hover:bg-[var(--muted-surface)]"
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
      className="w-full rounded border border-[var(--accent)] bg-[var(--surface)] px-1 py-0.5 text-right text-sm outline-none"
    />
  );
}

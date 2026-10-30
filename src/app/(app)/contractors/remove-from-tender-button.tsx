"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeContractorFromTender } from "./actions";

export function RemoveFromTenderButton({
  tenderId,
  contractorId,
  contractorName,
}: {
  tenderId: string;
  contractorId: string;
  contractorName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRemove() {
    if (!window.confirm(`Remove ${contractorName} from this tender? Their quotation and chat history for this tender will be deleted. This can't be undone.`)) {
      return;
    }
    setBusy(true);
    const result = await removeContractorFromTender(tenderId, contractorId);
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${contractorName} removed from this tender.`);
    router.refresh();
  }

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={handleRemove} title="Remove from this tender">
      <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
    </Button>
  );
}

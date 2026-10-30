"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadWorkbook } from "./upload-workbook";

export function ReplaceBoq({ tenderId }: { tenderId: string }) {
  const [active, setActive] = useState(false);

  if (active) {
    return <UploadWorkbook tenderId={tenderId} replace />;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (
          window.confirm(
            "Replace the current BOQ workbook? This clears all extracted and saved BOQ data for this tender before processing the new file. This can't be undone."
          )
        ) {
          setActive(true);
        }
      }}
    >
      <RefreshCw className="h-3.5 w-3.5" /> Replace BOQ
    </Button>
  );
}

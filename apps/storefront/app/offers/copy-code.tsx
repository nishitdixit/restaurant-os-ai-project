"use client";
import { Copy } from "lucide-react";
import { Button, toast } from "@restaurant-os/ui";

export function CopyCode({ code }: { code: string }) {
  return (
    <Button variant="outline" icon={<Copy className="size-4" aria-hidden />} aria-label={`Copy code ${code}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(code); toast.success(`${code} copied`); } catch { toast(`Your code is ${code}`); }
      }}>
      <span className="font-mono font-semibold">{code}</span>
    </Button>
  );
}

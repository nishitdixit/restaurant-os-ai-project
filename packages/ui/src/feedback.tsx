"use client";
// Overlays, states and status display. Status colours are shared across order, payment, delivery
// and availability so the same word always looks the same (ui/DESIGN_SYSTEM.md "Status colors").
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Inbox, X } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { Button } from "./primitives.tsx";
import { cx, DELIVERY, ORDER, PAYMENT, type Tone } from "./utils.ts";

export { toast };

export function Toaster({ theme = "light" }: { theme?: "light" | "dark" } = {}) {
  // Offset clears the sticky header (64px; 105px on phones, where the storefront adds a row of section links)
  // so a toast never covers the cart, menu or page actions.
  return <SonnerToaster theme={theme} position="top-center" richColors closeButton offset={{ top: 76 }} mobileOffset={{ top: 112 }} toastOptions={{ duration: 4000 }} />;
}

export function Modal({ open, onOpenChange, title, description, children, footer, size = "md" }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ros-overlay fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className={cx("ros-modal fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--ros-radius-xl)] bg-surface shadow-[var(--ros-shadow-lg)] focus:outline-none",
          size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl")}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Dialog</Dialog.Description>}
            </div>
            <Dialog.Close asChild><button className="-m-1 rounded-md p-1 text-muted hover:bg-subtle" aria-label="Close"><X className="size-5" /></button></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Side drawer on desktop, bottom sheet on mobile. */
export function Drawer({ open, onOpenChange, title, description, children, footer, width = "md" }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ros-overlay fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className={cx(
          "fixed z-50 flex flex-col bg-surface shadow-[var(--ros-shadow-lg)] focus:outline-none",
          "ros-drawer-bottom inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--ros-radius-xl)]",
          "sm:ros-drawer-right sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:rounded-none sm:rounded-l-[var(--ros-radius-xl)]",
          width === "lg" ? "sm:w-[min(720px,100vw)]" : "sm:w-[min(480px,100vw)]",
        )}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Panel</Dialog.Description>}
            </div>
            <Dialog.Close asChild><button className="-m-1 rounded-md p-1 text-muted hover:bg-subtle" aria-label="Close"><X className="size-5" /></button></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", tone = "primary", loading, onConfirm, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; tone?: "primary" | "danger";
  loading?: boolean; onConfirm: () => void; children?: ReactNode;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Back</Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      {children ?? null}
    </Modal>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 rounded-[var(--ros-radius-lg)] border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <div>
        <p className="font-semibold text-text">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry, requestId }: { title?: ReactNode; description?: ReactNode; onRetry?: () => void; requestId?: string | null }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--ros-radius-lg)] border border-danger/30 bg-danger-soft px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <div>
        <p className="font-semibold text-text">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {requestId && <p className="mt-2 font-mono text-xs text-faint">Reference: {requestId}</p>}
      </div>
      {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, action, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex flex-wrap items-start justify-between gap-3 rounded-[var(--ros-radius-md)] border px-4 py-3 text-sm", toneBox[tone], className)}>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "text-text/80")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("ros-skeleton rounded-[var(--ros-radius-md)] bg-subtle", className)} aria-hidden />;
}


const toneBox: Record<Tone, string> = {
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
  neutral: "border-border bg-neutral-soft text-muted",
  primary: "border-primary/25 bg-primary-soft text-primary",
};

const pillTone: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  neutral: "bg-neutral-soft text-muted ring-border",
  primary: "bg-primary-soft text-primary ring-primary/20",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pillTone[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusPill({ kind, status }: { kind: "order" | "payment" | "delivery" | "availability" | "publish"; status: string | boolean }) {
  let entry: [string, Tone] | undefined;
  if (kind === "order") entry = ORDER[String(status)];
  if (kind === "payment") entry = PAYMENT[String(status)];
  if (kind === "delivery") entry = DELIVERY[String(status)];
  if (kind === "availability") entry = status ? ["In stock", "success"] : ["Out of stock", "danger"];
  if (kind === "publish") entry = status === "ACTIVE" ? ["Published", "success"] : status === "ARCHIVED" ? ["Archived", "neutral"] : ["Draft", "warning"];
  const [label, tone] = entry ?? [String(status), "neutral" as Tone];
  return <Badge tone={tone} dot>{label}</Badge>;
}


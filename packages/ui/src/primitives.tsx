"use client";
// Core form and layout primitives. Every control has a visible label, a 44px touch target on mobile
// and an explicit error state (ui/DESIGN_SYSTEM.md "Accessibility").
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixTabs from "@radix-ui/react-tabs";
import { Loader2 } from "lucide-react";
import { buttonBase, buttonSizes, buttonVariants, cx, type ButtonSize, type ButtonVariant } from "./utils.ts";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], block && "w-full", className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});


const controlBase = "w-full rounded-[var(--radius-md)] border bg-surface px-3 text-[15px] text-text placeholder:text-faint transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-subtle disabled:text-muted";
const controlState = (invalid?: boolean) => (invalid ? "border-danger" : "border-border-strong");

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; prefix?: ReactNode }>(function Input(
  { className, invalid, prefix, ...rest }, ref,
) {
  if (prefix) {
    return (
      <div className={cx("relative flex items-center", className)}>
        <span className="pointer-events-none absolute left-3 text-muted text-[15px]">{prefix}</span>
        <input ref={ref} className={cx(controlBase, controlState(invalid || rest["aria-invalid"] === true), "h-11", typeof prefix === "string" && prefix.length > 1 ? "pl-12" : "pl-8")} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={cx(controlBase, controlState(invalid || rest["aria-invalid"] === true), "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, rows = 3, ...rest }, ref,
) {
  return <textarea ref={ref} rows={rows} className={cx(controlBase, controlState(invalid || rest["aria-invalid"] === true), "py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest }, ref,
) {
  return (
    <select ref={ref} className={cx(controlBase, controlState(invalid || rest["aria-invalid"] === true), "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235b6370%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 rounded border-border-strong accent-[var(--brand-primary)]" {...rest} />
      <label htmlFor={id} className="text-sm leading-snug">
        <span className="font-medium text-text">{label}</span>
        {description && <span className="block text-muted">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, ariaLabel, description, disabled, size = "md" }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; label?: ReactNode;
  /** Accessible name when there is no visible string label (e.g. a switch in a table row). */
  ariaLabel?: string; description?: ReactNode; disabled?: boolean; size?: "sm" | "md";
}) {
  const id = useId();
  const control = (
    <RadixSwitch.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={cx("relative shrink-0 rounded-full transition-colors data-[state=checked]:bg-success data-[state=unchecked]:bg-border-strong disabled:opacity-50",
        size === "sm" ? "h-5 w-9" : "h-6 w-11")}>
      <RadixSwitch.Thumb className={cx("block rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform",
        size === "sm" ? "size-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]" : "size-5 translate-x-0.5 data-[state=checked]:translate-x-[22px]")} />
    </RadixSwitch.Root>
  );
  if (!label) return control;
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-text">{label}</span>
        {description && <span className="block text-muted">{description}</span>}
      </label>
      {control}
    </div>
  );
}

export function Card({ className, children, padded = true, as: Tag = "section" }: { className?: string; children: ReactNode; padded?: boolean; as?: "section" | "div" | "article" }) {
  return <Tag className={cx("rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]", padded && "p-4 sm:p-5", className)}>{children}</Tag>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs({ value, onValueChange, items, className }: {
  value: string; onValueChange: (value: string) => void; items: { value: string; label: ReactNode; count?: number }[]; className?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Views">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value}
            className="-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-text data-[state=active]:border-primary data-[state=active]:text-text">
            {item.label}
            {item.count !== undefined && item.count > 0 && <span className="rounded-full bg-subtle px-1.5 text-xs text-muted">{item.count}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} aria-label={label} role="status" />;
}

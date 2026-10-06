"use client";
// Team & roles (docs/ROLE_PERMISSION_MATRIX.md). Invited people join when they first sign in with
// that email; role changes are audited and the last owner can't be removed.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import type { TeamMember } from "@restaurant-os/types";
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, Field, Input, Modal, Select, Skeleton, formatDateTime, toast } from "@restaurant-os/ui";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

const ROLES = [
  { value: "OWNER", label: "Owner", description: "Everything, including team, billing and settings" },
  { value: "MANAGER", label: "Manager", description: "Orders, menu, offers, delivery, customers and analytics" },
  { value: "KITCHEN", label: "Kitchen", description: "Order board and stock on/off" },
  { value: "STAFF", label: "Staff", description: "Order board only" },
] as const;

export default function TeamPage() {
  const { request, can } = useSession();
  const qc = useQueryClient();
  const key = useTenantKey("team");
  const team = useQuery({ queryKey: key, queryFn: () => request<{ items: TeamMember[] }>("/v1/admin/team").then((r) => r.items) });
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("KITCHEN");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const invite = useMutation({
    mutationFn: () => request("/v1/admin/team", { body: { email, role } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setInviting(false); setEmail(""); toast.success(`Invited ${email}. They get access when they sign in with that email.`); },
    onError: (e) => setError(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: string; active?: boolean } }) => request(`/v1/admin/team/${id}`, { method: "PATCH", body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setRemoving(null); toast.success("Team updated"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const manage = can("tenant.manage");
  if (team.isLoading) return <Skeleton className="h-64" />;
  if (team.error) return <ErrorState description={errorMessage(team.error)} onRetry={() => void team.refetch()} />;
  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="text-base font-semibold">Team</h2><p className="text-sm text-muted">People who can sign in to this restaurant.</p></div>
          {manage && <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => { setError(null); setInviting(true); }}>Invite</Button>}
        </div>
        <ul className="divide-y divide-border">
          {(team.data ?? []).map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.email ?? "Unknown"} {m.isYou && <Badge tone="info">You</Badge>} {m.invited && <Badge tone="warning">Invited</Badge>} {m.status === "DEACTIVATED" && <Badge tone="danger">Removed</Badge>}</p>
                <p className="text-xs text-muted">Added {formatDateTime(m.createdAt, { dateStyle: "medium" })}</p>
              </div>
              {manage && !m.isYou ? (
                <>
                  <Select aria-label={`Role for ${m.email}`} value={m.role} className="w-36" disabled={update.isPending || m.status === "DEACTIVATED"} onChange={(e) => update.mutate({ id: m.membershipId, body: { role: e.target.value } })}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Select>
                  {m.status === "ACTIVE"
                    ? <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(m)}>Remove</Button>
                    : <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.membershipId, body: { active: true } })}>Restore</Button>}
                </>
              ) : <Badge>{ROLES.find((r) => r.value === m.role)?.label ?? m.role}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-6">
        <h2 className="text-base font-semibold">What each role can do</h2>
        <dl className="mt-3 space-y-2 text-sm">{ROLES.map((r) => <div key={r.value} className="flex gap-3"><dt className="w-20 font-medium">{r.label}</dt><dd className="text-muted">{r.description}</dd></div>)}</dl>
      </Card>
      <Modal open={inviting} onOpenChange={setInviting} title="Invite a team member" size="sm"
        footer={<><Button variant="ghost" onClick={() => setInviting(false)}>Cancel</Button><Button loading={invite.isPending} onClick={() => { setError(null); invite.mutate(); }}>Send invite</Button></>}>
        <div className="space-y-4">
          <Field label="Email" required hint="They sign in (or sign up) with this email to get access">{(p) => <Input {...p} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Role">{(p) => <Select {...p} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.description}</option>)}</Select>}</Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </Modal>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove ${removing?.email}?`} tone="danger" confirmLabel="Remove access"
        description="They lose access immediately. You can restore them later." loading={update.isPending} onConfirm={() => removing && update.mutate({ id: removing.membershipId, body: { active: false } })} />
    </>
  );
}

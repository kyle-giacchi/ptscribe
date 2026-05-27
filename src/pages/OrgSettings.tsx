import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgConfig, type OrgPolicy } from '@/contexts/OrgConfigProvider';
import { useTemplates } from '@/contexts/TemplatesProvider';
import { useExercises } from '@/contexts/ExercisesProvider';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import type { OrgRole } from '@/lib/auth/types';

// ── Server response shapes (worker/org.ts → handleListMembers) ──────────────

interface OrgInfo {
  id: string;
  name: string;
  contactEmail: string;
  phone: string;
}
interface Member {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  isYou: boolean;
}
interface PendingInvite {
  id: string;
  email: string;
  role: OrgRole;
  createdAt: number;
  expiresAt: number;
  expired: boolean;
}
export interface MembersResponse {
  org: OrgInfo;
  yourRole: OrgRole;
  canManage: boolean;
  members: Member[];
  invites: PendingInvite[];
}

// Roles a manager may assign (owner is never assignable post-creation).
const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'manager', 'standard', 'student'];
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  standard: 'Standard',
  student: 'Student',
};

async function orgFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T & { code?: string; error?: string } }> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { code?: string; error?: string };
  return { ok: res.ok, status: res.status, data };
}

type LoadState =
  | { status: 'loading' }
  | { status: 'no-org' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MembersResponse };

export function OrgSettings() {
  const { currentUser } = useAuth();
  // Derive the initial state from the session so the no-org case needs no
  // synchronous setState inside the effect (which triggers cascading renders).
  const [state, setState] = useState<LoadState>(() =>
    currentUser?.orgId ? { status: 'loading' } : { status: 'no-org' },
  );

  const load = useCallback(async () => {
    const { ok, status, data } = await orgFetch<MembersResponse>('/api/org/members');
    if (ok) {
      setState({ status: 'ready', data });
    } else if (status === 403 && data.code === 'NOT_IN_ORG') {
      setState({ status: 'no-org' });
    } else {
      setState({ status: 'error', message: data.error ?? 'Could not load your organization.' });
    }
  }, []);

  useEffect(() => {
    // No org on the client session → skip the round-trip (no-org is the
    // initial state already). Only members of a real org hit the API. The
    // fetch runs in an inline async fn so setState lands after the await,
    // never synchronously in the effect body.
    if (!currentUser?.orgId) return;
    void (async () => {
      await load();
    })();
  }, [currentUser?.orgId, load]);

  if (state.status === 'loading') {
    return (
      <PageFrame>
        <SurfaceCard padding={20}>
          <div style={{ color: 'var(--color-pt-text-3)', fontSize: 13 }}>Loading organization…</div>
        </SurfaceCard>
      </PageFrame>
    );
  }

  if (state.status === 'no-org') {
    return (
      <PageFrame>
        <SurfaceCard padding={24}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-pt-text)', margin: '0 0 8px' }}>
            You're not part of an organization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.55, margin: '0 0 16px' }}>
            Organizations let a practice manage clinicians and shared settings. If you have an invite
            link, open it to join. Account-only settings live in{' '}
            <Link to="/account" style={{ color: 'var(--color-pt-accent-fg)' }}>
              Account Settings
            </Link>
            .
          </p>
        </SurfaceCard>
      </PageFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <PageFrame>
        <SurfaceCard padding={24}>
          <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', margin: '0 0 16px' }}>
            {state.message}
          </p>
          <PtButton variant="ghost" onClick={() => void load()}>
            Try again
          </PtButton>
        </SurfaceCard>
      </PageFrame>
    );
  }

  return <OrgSettingsLoaded data={state.data} reload={load} />;
}

function OrgSettingsLoaded({ data, reload }: { data: MembersResponse; reload: () => Promise<void> }) {
  const { org, members, invites, canManage } = data;
  const [busy, setBusy] = useState(false);

  // Run a mutation, surface errors via toast, refetch on success.
  const mutate = useCallback(
    async (path: string, body: unknown, successMsg: string) => {
      setBusy(true);
      try {
        const { ok, data: res } = await orgFetch(path, { method: 'POST', body: JSON.stringify(body) });
        if (!ok) {
          toast.error(res.error ?? 'Something went wrong.');
          return false;
        }
        toast.success(successMsg);
        await reload();
        return true;
      } catch {
        toast.error('Network error — please try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return (
    <PageFrame>
      <div style={{ display: 'grid', gap: 4 }}>
        <Eyebrow>Organization</Eyebrow>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-pt-text)', letterSpacing: '-0.01em', margin: 0 }}>
          {org.name}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          {org.contactEmail} · {org.phone}
          {!canManage && ' · You have view-only access'}
        </p>
      </div>

      <MembersCard
        members={members}
        canManage={canManage}
        busy={busy}
        onChangeRole={(userId, role) => mutate('/api/org/member/role', { userId, role }, 'Role updated.')}
        onRemove={(userId) => mutate('/api/org/member/remove', { userId }, 'Member removed.')}
      />

      <InvitesCard
        invites={invites}
        canManage={canManage}
        busy={busy}
        onInvite={(email, role) => mutate('/api/org/invite', { email, role }, 'Invite sent.')}
        onResend={(inviteId) => mutate('/api/org/invite/resend', { inviteId }, 'Invite resent.')}
        onRevoke={(inviteId) => mutate('/api/org/invite/revoke', { inviteId }, 'Invite revoked.')}
      />

      <OrgConfigCard />
    </PageFrame>
  );
}

// ── Org config (policy + shared library) ─────────────────────────────────────

function OrgConfigCard() {
  const { loading, policy } = useOrgConfig();

  if (loading) {
    return (
      <SurfaceCard padding={20}>
        <div style={{ color: 'var(--color-pt-text-3)', fontSize: 13 }}>
          Loading organization settings…
        </div>
      </SurfaceCard>
    );
  }

  // Key on the server-seeded retention value so the form's useState initializer
  // re-runs whenever a fresh policy loads — no setState-in-effect needed.
  return <OrgConfigForm key={`ret:${policy.retentionDays ?? ''}`} />;
}

function OrgConfigForm() {
  const { policy, sharedTemplates, sharedExercises, canManage, updateOrgConfig } = useOrgConfig();
  const { templates } = useTemplates();
  const { exercises } = useExercises();
  const [busy, setBusy] = useState(false);
  const [retentionDays, setRetentionDays] = useState<string>(() =>
    policy.retentionDays != null ? String(policy.retentionDays) : '',
  );

  const localCustomTemplates = templates.filter((t) => !t.builtin);
  const localCustomExercises = exercises.filter((e) => !e.builtin);

  const buildPolicy = useCallback((): OrgPolicy => {
    const days = parseInt(retentionDays, 10);
    return {
      ...policy,
      retentionDays: Number.isFinite(days) && days > 0 ? days : undefined,
    };
  }, [policy, retentionDays]);

  const savePolicy = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await updateOrgConfig({
        policy: buildPolicy(),
        templates: sharedTemplates,
        exercises: sharedExercises,
      });
      if (ok) toast.success('Organization policy saved.');
      else toast.error('Could not save policy.');
    } finally {
      setBusy(false);
    }
  }, [buildPolicy, updateOrgConfig, sharedTemplates, sharedExercises]);

  const publishLibrary = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await updateOrgConfig({
        policy: buildPolicy(),
        templates: localCustomTemplates,
        exercises: localCustomExercises,
      });
      if (ok) toast.success('Shared library published to your organization.');
      else toast.error('Could not publish the shared library.');
    } finally {
      setBusy(false);
    }
  }, [buildPolicy, updateOrgConfig, localCustomTemplates, localCustomExercises]);

  return (
    <SurfaceCard padding={20}>
      <div style={{ display: 'grid', gap: 4, marginBottom: 16 }}>
        <Eyebrow>Organization settings</Eyebrow>
        <p style={{ fontSize: 12, color: 'var(--color-pt-text-3)', margin: 0 }}>
          {canManage
            ? 'Policy and the shared library apply to everyone in your organization.'
            : 'Set by your organization’s owners and admins. View-only.'}
        </p>
      </div>

      {/* Policy: audio retention ceiling */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--color-pt-text)', minWidth: 180 }}>
          Audio retention (days)
        </label>
        {canManage ? (
          <input
            type="number"
            min={1}
            value={retentionDays}
            placeholder="No limit"
            onChange={(e) => setRetentionDays(e.target.value)}
            aria-label="Audio retention days"
            style={{
              width: 120,
              padding: '6px 10px',
              fontSize: 13,
              border: '1px solid var(--color-pt-border)',
              borderRadius: 8,
              background: 'var(--color-pt-surface)',
              color: 'var(--color-pt-text)',
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-pt-text-2)' }}>
            {policy.retentionDays != null ? `${policy.retentionDays} days` : 'No limit'}
          </span>
        )}
      </div>

      {/* Shared library summary */}
      <div style={{ fontSize: 13, color: 'var(--color-pt-text-2)', marginBottom: 16 }}>
        Shared library: <strong>{sharedTemplates.length}</strong> template
        {sharedTemplates.length === 1 ? '' : 's'}, <strong>{sharedExercises.length}</strong> exercise
        {sharedExercises.length === 1 ? '' : 's'} available to every member.
      </div>

      {canManage && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PtButton onClick={() => void savePolicy()} disabled={busy}>
            Save policy
          </PtButton>
          <PtButton variant="ghost" onClick={() => void publishLibrary()} disabled={busy}>
            Publish my custom library ({localCustomTemplates.length + localCustomExercises.length})
          </PtButton>
        </div>
      )}
    </SurfaceCard>
  );
}

// ── Members ─────────────────────────────────────────────────────────────────

function MembersCard({
  members,
  canManage,
  busy,
  onChangeRole,
  onRemove,
}: {
  members: Member[];
  canManage: boolean;
  busy: boolean;
  onChangeRole: (userId: string, role: OrgRole) => void;
  onRemove: (userId: string) => void;
}) {
  return (
    <SurfaceCard padding={18}>
      <SectionTitle>Members ({members.length})</SectionTitle>
      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {members.map((m) => {
          const isOwner = m.role === 'owner';
          // Managers can edit anyone who isn't the owner and isn't themselves.
          const editable = canManage && !isOwner && !m.isYou;
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 4px',
                borderBottom: '1px solid var(--color-pt-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-pt-text)' }}>
                  {m.name || m.email}
                  {m.isYou && <span style={{ color: 'var(--color-pt-text-3)', fontWeight: 400 }}> (you)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>{m.email}</div>
              </div>
              {editable ? (
                <RoleSelect value={m.role} disabled={busy} onChange={(role) => onChangeRole(m.id, role)} />
              ) : (
                <RolePill role={m.role} />
              )}
              {editable && (
                <IconButton label={`Remove ${m.email}`} disabled={busy} onClick={() => onRemove(m.id)}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

// ── Invites ─────────────────────────────────────────────────────────────────

function InvitesCard({
  invites,
  canManage,
  busy,
  onInvite,
  onResend,
  onRevoke,
}: {
  invites: PendingInvite[];
  canManage: boolean;
  busy: boolean;
  onInvite: (email: string, role: OrgRole) => Promise<boolean>;
  onResend: (inviteId: string) => void;
  onRevoke: (inviteId: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('standard');

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit() {
    const ok = await onInvite(email.trim(), role);
    if (ok) {
      setEmail('');
      setRole('standard');
    }
  }

  return (
    <SurfaceCard padding={18}>
      <SectionTitle>Pending invites ({invites.length})</SectionTitle>

      {canManage && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={email}
            disabled={busy}
            placeholder="teammate@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && emailOk) void submit();
            }}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '8px 10px',
              fontSize: 13,
              borderRadius: 8,
              border: '1.5px solid var(--color-pt-border)',
              background: 'var(--color-pt-surface)',
              color: 'var(--color-pt-text)',
            }}
          />
          <RoleSelect value={role} disabled={busy} onChange={setRole} />
          <PtButton
            variant="primary"
            disabled={!emailOk || busy}
            onClick={() => void submit()}
            iconLeft={<Plus size={14} strokeWidth={2} />}
          >
            Invite
          </PtButton>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {invites.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-pt-text-3)', fontStyle: 'italic' }}>
            No pending invites.
          </div>
        ) : (
          invites.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 4px',
                borderBottom: '1px solid var(--color-pt-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-pt-text)' }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: inv.expired ? 'var(--color-pt-red)' : 'var(--color-pt-text-3)' }}>
                  {inv.expired ? 'Expired' : `Invited · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                </div>
              </div>
              <RolePill role={inv.role} />
              {canManage && (
                <>
                  <IconButton label={`Resend invite to ${inv.email}`} disabled={busy} onClick={() => onResend(inv.id)}>
                    <RefreshCw size={13} />
                  </IconButton>
                  <IconButton label={`Revoke invite to ${inv.email}`} disabled={busy} onClick={() => onRevoke(inv.id)}>
                    <X size={14} />
                  </IconButton>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </SurfaceCard>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 22,
        display: 'grid',
        gap: 14,
        alignContent: 'start',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: OrgRole;
  disabled: boolean;
  onChange: (role: OrgRole) => void;
}) {
  return (
    <select
      aria-label="Role"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as OrgRole)}
      style={{
        padding: '7px 10px',
        fontSize: 12.5,
        borderRadius: 8,
        border: '1.5px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface)',
        color: 'var(--color-pt-text)',
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
      }}
    >
      {ASSIGNABLE_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function RolePill({ role }: { role: OrgRole }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
        background: 'var(--color-pt-surface-mut)',
        borderRadius: 999,
        padding: '2px 9px',
        flexShrink: 0,
      }}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 8,
        color: 'var(--color-pt-text-3)',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

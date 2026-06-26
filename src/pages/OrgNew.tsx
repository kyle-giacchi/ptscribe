// src/pages/OrgNew.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Check, Plus, X, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Field, TextInput } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { duration, ease } from '@/lib/motion';
import { parseCsvInvites } from '@/lib/csvParser';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgDraft = { name: string; contactEmail: string; phone: string };
export type InviteRole = 'admin' | 'manager' | 'standard' | 'student';
export type InviteRow = { id: string; email: string; role: InviteRole };

type GateState =
  | { status: 'loading' }
  | { status: 'valid'; orgName?: string }
  | { status: 'invalid'; message: string }
  | { status: 'network-error' };

type Step = 'details' | 'invites' | 'review';
const STEPS: Step[] = ['details', 'invites', 'review'];
const STEP_LABELS = ['Org Details', 'Invite Team', 'Review'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 10;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrgNew() {
  const { isAuthenticated, isLoading: authLoading, currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  // Synchronously gate on "no token in URL" — the effect only runs the async
  // validate() call. This keeps setState out of the effect body for the trivial
  // missing-token case.
  const [gate, setGate] = useState<GateState>(() =>
    token
      ? { status: 'loading' }
      : { status: 'invalid', message: 'No invite token found in this URL.' },
  );
  const [step, setStep] = useState<Step>('details');
  const [org, setOrg] = useState<OrgDraft>({
    name: '',
    contactEmail: currentUser?.email ?? '',
    phone: '',
  });
  const [invites, setInvites] = useState<InviteRow[]>([
    { id: crypto.randomUUID(), email: '', role: 'standard' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?from=${encodeURIComponent(`/org/new?token=${token}`)}`, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    async function validate() {
      try {
        const res = await fetch('/api/org/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as {
          valid: boolean;
          consumed: boolean;
          orgName?: string;
          alreadyInOrg?: boolean;
        };
        if (cancelled) return;
        if (data.alreadyInOrg) {
          setGate({
            status: 'invalid',
            message: 'Your account is already associated with an organization.',
          });
        } else if (!data.valid && data.consumed) {
          setGate({
            status: 'invalid',
            message:
              'This invite link has already been used. Contact support if you believe this is an error.',
          });
        } else if (!data.valid) {
          setGate({ status: 'invalid', message: 'This invite link is invalid or has expired.' });
        } else {
          setGate({ status: 'valid', orgName: data.orgName });
          if (data.orgName) setOrg((prev) => ({ ...prev, name: data.orgName! }));
        }
      } catch {
        if (!cancelled) setGate({ status: 'network-error' });
      }
    }
    validate();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/org/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          org: { name: org.name, contactEmail: org.contactEmail, phone: org.phone },
          invites: invites
            .filter((r) => r.email.trim().length > 0)
            .map((r) => ({ email: r.email, role: r.role })),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; code?: string };
      if (!res.ok || !data.ok) {
        if (data.code === 'TOKEN_CONSUMED') {
          setSubmitError('This invite link was already used.');
        } else if (data.code === 'ALREADY_IN_ORG') {
          setSubmitError('Your account is already associated with an organization.');
        } else {
          setSubmitError(
            'Something went wrong — your invite link is still valid, please try again.',
          );
        }
        setSubmitting(false);
        return;
      }
      toast.success('Organization created — invites sent.');
      navigate('/today', { replace: true });
    } catch {
      setSubmitError('Network error — your invite link is still valid, please try again.');
      setSubmitting(false);
    }
  }

  if (authLoading || (gate.status === 'loading' && !isAuthenticated)) return <PageSpinner />;
  if (gate.status === 'loading') return <PageSpinner />;

  if (gate.status === 'network-error') {
    return (
      <ErrorGate
        message="Could not reach the server. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (gate.status === 'invalid') {
    return (
      <ErrorGate
        message={gate.message}
        actionLabel="Go to dashboard"
        onAction={() => navigate('/today')}
      />
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div
      style={{ minHeight: '100vh', background: 'var(--color-pt-landing-bg)', padding: '48px 24px' }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--color-pt-accent)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            P
          </div>
          <div>
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.02em',
              }}
            >
              PTScribe
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
              Set up your organization
            </div>
          </div>
        </header>

        <OrgStepper labels={STEP_LABELS} current={stepIndex} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease: ease.enter }}
          >
            {step === 'details' && (
              <StepOrgDetails
                org={org}
                onChange={(patch) => setOrg((prev) => ({ ...prev, ...patch }))}
                onNext={() => setStep('invites')}
              />
            )}
            {step === 'invites' && (
              <StepInviteTeam
                invites={invites}
                onChange={setInvites}
                onBack={() => setStep('details')}
                onNext={() => setStep('review')}
              />
            )}
            {step === 'review' && (
              <StepReview
                org={org}
                invites={invites.filter((r) => r.email.trim().length > 0)}
                onBack={() => setStep('invites')}
                onSubmit={handleSubmit}
                submitting={submitting}
                submitError={submitError}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Step 1: Org Details ───────────────────────────────────────────────────────

function StepOrgDetails({
  org,
  onChange,
  onNext,
}: {
  org: OrgDraft;
  onChange: (patch: Partial<OrgDraft>) => void;
  onNext: () => void;
}) {
  const canProceed =
    org.name.trim().length > 0 && isValidEmail(org.contactEmail) && isValidPhone(org.phone);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Organization details"
        subtitle="Core information about your practice. You can update these later in Settings."
      />
      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Organization name">
            <TextInput
              placeholder="Coastline Physical Therapy"
              value={org.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>
          <Field label="Contact email" hint="Primary email for the organization">
            <TextInput
              type="email"
              placeholder="admin@yourpractice.com"
              value={org.contactEmail}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
            />
          </Field>
          <Field label="Owner phone number">
            <TextInput
              type="tel"
              placeholder="(555) 000-0000"
              value={org.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
          </Field>
        </div>
      </SurfaceCard>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PtButton
          variant="primary"
          disabled={!canProceed}
          onClick={onNext}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          Next
        </PtButton>
      </div>
    </div>
  );
}

// ── Step 2: Invite Team ───────────────────────────────────────────────────────

function StepInviteTeam({
  invites,
  onChange,
  onBack,
  onNext,
}: {
  invites: InviteRow[];
  onChange: (rows: InviteRow[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emailSet = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of invites) {
    const e = row.email.trim().toLowerCase();
    if (e) {
      if (emailSet.has(e)) duplicates.add(e);
      else emailSet.add(e);
    }
  }

  const nonEmptyRows = invites.filter((r) => r.email.trim().length > 0);
  const allValid = nonEmptyRows.every((r) => isValidEmail(r.email));
  const canProceed = allValid;

  function addRow() {
    onChange([...invites, { id: crypto.randomUUID(), email: '', role: 'standard' }]);
  }

  function removeRow(id: string) {
    const next = invites.filter((r) => r.id !== id);
    onChange(next.length > 0 ? next : [{ id: crypto.randomUUID(), email: '', role: 'standard' }]);
  }

  function updateRow(id: string, patch: Partial<InviteRow>) {
    onChange(invites.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content !== 'string') return;
      const parsed = parseCsvInvites(content);
      if (parsed.length === 0) {
        toast.error('No email addresses found. Make sure the file has an "email" column header.');
        return;
      }
      const existingNonEmpty = invites.filter((r) => r.email.trim().length > 0);
      const newRows: InviteRow[] = parsed.map((p) => ({
        id: crypto.randomUUID(),
        email: p.email,
        role: 'standard' as InviteRole,
      }));
      onChange([...existingNonEmpty, ...newRows]);
      toast.success(`Added ${newRows.length} invite${newRows.length !== 1 ? 's' : ''} from file.`);
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Invite your team"
        subtitle="Add team members by email. They'll receive a magic link to join. You can skip this step and invite from Settings later."
      />

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 8 }}>
          {invites.map((row, i) => {
            const isDupe = duplicates.has(row.email.trim().toLowerCase());
            const isInvalid = row.email.trim().length > 0 && !isValidEmail(row.email);
            return (
              <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                  <TextInput
                    type="email"
                    placeholder={`team${i + 1}@example.com`}
                    value={row.email}
                    onChange={(e) => updateRow(row.id, { email: e.target.value })}
                    style={{
                      borderColor: isInvalid || isDupe ? 'var(--color-pt-red)' : undefined,
                    }}
                  />
                  {isDupe && (
                    <div style={{ fontSize: 11, color: 'var(--color-pt-amber-fg)' }}>
                      Duplicate email — this person will only receive one invite.
                    </div>
                  )}
                </div>
                <select
                  value={row.role}
                  onChange={(e) => updateRow(row.id, { role: e.target.value as InviteRole })}
                  style={{
                    padding: '10px 12px',
                    border: '1.5px solid var(--color-pt-border)',
                    borderRadius: 10,
                    fontSize: 13,
                    color: 'var(--color-pt-text)',
                    background: 'var(--color-pt-surface)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="standard">Standard</option>
                  <option value="student">Student</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove invite"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 42,
                    flexShrink: 0,
                    color: 'var(--color-pt-text-3)',
                    borderRadius: 8,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            <Plus size={14} />
            Add another
          </button>
          <span style={{ color: 'var(--color-pt-border)', fontSize: 13 }}>·</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-pt-text-3)',
            }}
          >
            <Upload size={14} />
            Upload CSV / spreadsheet
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
      </SurfaceCard>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <PtButton variant="ghost" onClick={onBack}>
          ← Back
        </PtButton>
        <PtButton
          variant="primary"
          disabled={!canProceed}
          onClick={onNext}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          Review
        </PtButton>
      </div>
    </div>
  );
}

// ── Step 3: Review & Confirm ──────────────────────────────────────────────────

function StepReview({
  org,
  invites,
  onBack,
  onSubmit,
  submitting,
  submitError,
}: {
  org: OrgDraft;
  invites: InviteRow[];
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Review & confirm"
        subtitle="Double-check the details below. Invites are sent when you click Create Organization."
      />

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 16 }}>
          <ReviewSection label="Organization">
            <ReviewRow field="Name" value={org.name} />
            <ReviewRow field="Contact email" value={org.contactEmail} />
            <ReviewRow field="Owner phone" value={org.phone} />
          </ReviewSection>

          <div style={{ borderTop: '1px solid var(--color-pt-border)', paddingTop: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-pt-text-3)',
                marginBottom: 10,
              }}
            >
              Team invites ({invites.length})
            </div>
            {invites.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-pt-text-3)', fontStyle: 'italic' }}>
                No invites — you can add team members from Settings.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {invites.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--color-pt-text)' }}>{row.email}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-pt-text-3)',
                        background: 'var(--color-pt-surface-mut)',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {row.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      {submitError && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--color-pt-amber-soft)',
            border: '1px solid var(--color-pt-amber-border)',
            borderRadius: 10,
            fontSize: 13,
            color: 'var(--color-pt-amber-fg)',
          }}
        >
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <PtButton variant="ghost" disabled={submitting} onClick={onBack}>
          ← Back
        </PtButton>
        <PtButton variant="primary" disabled={submitting} onClick={onSubmit}>
          {submitting ? 'Creating…' : 'Create Organization'}
        </PtButton>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <Eyebrow>Step</Eyebrow>
      <h1
        style={{
          marginTop: 4,
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--color-pt-text)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h1>
      <p style={{ marginTop: 6, fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.55 }}>
        {subtitle}
      </p>
    </div>
  );
}

function OrgStepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                fontSize: 12,
                fontWeight: 600,
                background:
                  done || active ? 'var(--color-pt-accent)' : 'var(--color-pt-surface-mut)',
                color: done || active ? '#ffffff' : 'var(--color-pt-text-3)',
                flexShrink: 0,
                transition: 'background 120ms ease',
              }}
            >
              {done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            <span
              style={{
                fontSize: 12,
                color: active ? 'var(--color-pt-text)' : 'var(--color-pt-text-3)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span
                aria-hidden
                style={{ marginLeft: 4, height: 1, flex: 1, background: 'var(--color-pt-border)' }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PageSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
    </div>
  );
}

function ErrorGate({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-pt-landing-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          background: 'var(--color-pt-surface)',
          borderRadius: 20,
          border: '1px solid var(--color-pt-border)',
          padding: '48px 56px',
          textAlign: 'center',
          maxWidth: 400,
          width: '100%',
          boxShadow: 'var(--shadow-banner)',
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--color-pt-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 800,
            margin: '0 auto 20px',
          }}
        >
          P
        </div>
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--color-pt-text)',
            letterSpacing: '-0.02em',
          }}
        >
          Unable to continue
        </h1>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: 14,
            color: 'var(--color-pt-text-2)',
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
        <PtButton variant="primary" onClick={onAction}>
          {actionLabel}
        </PtButton>
      </div>
    </div>
  );
}

function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-pt-text-3)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  );
}

function ReviewRow({ field, value }: { field: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-pt-text-3)' }}>{field}</span>
      <span style={{ color: 'var(--color-pt-text)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

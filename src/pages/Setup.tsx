import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Check } from 'lucide-react';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard, SegmentedControl } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { ProviderKeyCard } from '@/components/settings/ProviderKeyCard';
import { useUsableKey } from '@/hooks/useUsableKey';
import { useProviderCatalog, defaultModelFor } from '@/services/ai/providerCatalog';
import { isDemoMode } from '@/lib/demoMode';
import type { KeyProvider, KeyStatus } from '@/services/ai/keysClient';
import { duration, ease } from '@/lib/motion';
import { DISCLOSURE_VERSION, type FirstRunRole } from '@/types';

type Step = 'welcome' | 'role' | 'profile' | 'connect-key' | 'owner-tips' | 'done';
const FLOW: Step[] = ['role', 'profile', 'connect-key', 'owner-tips', 'done'];
// BYOK key entry is meaningless in demo (shared key) — drop the step there.
const SHOW_KEY_STEP = !isDemoMode();

export function Setup() {
  const [step, setStep] = useState<Step>('welcome');
  const { settings, updateFirstRun } = useSettings();
  const { clinician, setClinician } = useClinician();
  const [searchParams] = useSearchParams();
  const role = settings.firstRun.role;

  // D14: URL pre-fill — runs once on mount, gated by onboardingUrlConsumed.
  useEffect(() => {
    if (settings.firstRun.onboardingUrlConsumed) return;
    const urlRole = searchParams.get('role');
    const urlClinic = searchParams.get('clinic');
    let consumed = false;
    const patch: Partial<typeof settings.firstRun> = {};

    if (urlRole === 'owner' || urlRole === 'clinician') {
      patch.role = urlRole as FirstRunRole;
      consumed = true;
    }

    if (urlClinic && !clinician.practiceName?.trim()) {
      try {
        const decoded = decodeURIComponent(urlClinic);
        if (decoded.trim()) {
          setClinician({ practiceName: decoded });
          consumed = true;
        }
      } catch {
        // Malformed URI — silently ignore.
      }
    }

    if (consumed) {
      patch.onboardingUrlConsumed = true;
      updateFirstRun(patch);
      // If a role came from the URL, jump straight into profile.
      if (patch.role) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStep('profile');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After profile, route to the (skippable) key step in non-demo, else straight on.
  const afterProfile: Step = SHOW_KEY_STEP
    ? 'connect-key'
    : settings.firstRun.role === 'owner'
      ? 'owner-tips'
      : 'done';
  const afterKey: Step = settings.firstRun.role === 'owner' ? 'owner-tips' : 'done';

  const flowIndex = FLOW.indexOf(step);
  // Hide owner-tips from clinicians and the key step from demo builds.
  const visibleSteps: Step[] = FLOW.filter(
    (s) => (s !== 'owner-tips' || role === 'owner') && (s !== 'connect-key' || SHOW_KEY_STEP),
  ) as Step[];
  const visibleIndex = visibleSteps.indexOf(step);
  const stepperLabels = visibleSteps
    .filter((s) => s !== 'done')
    .map((s) => stepLabel(s))
    .concat('Done');
  const stepperCurrent = visibleIndex;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-pt-landing-bg)',
        padding: '48px 24px',
      }}
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
              {step === 'welcome'
                ? 'A clinical scribe that lives in your browser.'
                : "Tell us your role and we'll tailor the rest."}
            </div>
          </div>
        </header>

        {flowIndex >= 0 && step !== 'done' && (
          <Stepper labels={stepperLabels} current={stepperCurrent} />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease: ease.enter }}
          >
            {step === 'welcome' && <WelcomeStep onStart={() => setStep('role')} />}
            {step === 'role' && (
              <RoleStep
                onPick={(picked) => {
                  updateFirstRun({ role: picked });
                  setStep('profile');
                }}
              />
            )}
            {step === 'profile' && <ProfileStep onNext={() => setStep(afterProfile)} />}
            {step === 'connect-key' && <ConnectKeyStep onNext={() => setStep(afterKey)} />}
            {step === 'owner-tips' && <OwnerTipsStep onContinue={() => setStep('done')} />}
            {step === 'done' && <DoneStep />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'role':
      return 'Role';
    case 'profile':
      return 'Profile';
    case 'connect-key':
      return 'AI key';
    case 'owner-tips':
      return 'Next steps';
    case 'done':
      return 'Done';
    default:
      return '';
  }
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: 'var(--color-pt-text)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Welcome.
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 13.5,
            color: 'var(--color-pt-text-2)',
            lineHeight: 1.55,
          }}
        >
          Record a session, get a structured note. Patients, sessions, notes, templates, and
          exercises live in this browser. Audio and transcripts are sent to AI providers through a
          hosted proxy on this testing build.
        </p>
      </div>

      <HipaaDisclosure variant="full" />

      <div>
        <PtButton
          variant="primary"
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
          onClick={onStart}
        >
          Get started
        </PtButton>
      </div>
    </div>
  );
}

function RoleStep({ onPick }: { onPick: (role: FirstRunRole) => void }) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Which best describes you?"
        subtitle="We'll surface the right next steps after setup. You can change this later in Settings."
      />
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <RoleCard
          title="I run this practice"
          description="Owner or admin. After setup we'll point you at templates and the security/encryption settings so the rest of your team can come online."
          cta="I'm the owner"
          onClick={() => onPick('owner')}
        />
        <RoleCard
          title="I record sessions"
          description="Clinician using PTScribe day-to-day. After setup we'll drop you into the patient list so you can start a session."
          cta="I'm a clinician"
          onClick={() => onPick('clinician')}
        />
      </div>
    </div>
  );
}

function RoleCard({
  title,
  description,
  cta,
  onClick,
}: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12, height: '100%' }}>
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--color-pt-text)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </div>
          <p
            style={{
              marginTop: 6,
              fontSize: 13,
              color: 'var(--color-pt-text-2)',
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <PtButton
            variant="primary"
            onClick={onClick}
            iconRight={<ArrowRight size={14} strokeWidth={2} />}
          >
            {cta}
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const { clinician, setClinician } = useClinician();
  const { updateFirstRun } = useSettings();
  const [name, setName] = useState(clinician.name);
  const [credentials, setCredentials] = useState(clinician.credentials);
  const [practiceName, setPracticeName] = useState(clinician.practiceName ?? '');
  const [npi, setNpi] = useState(clinician.npi ?? '');
  const [acknowledged, setAcknowledged] = useState(
    typeof clinician.acknowledgedDisclosureAt === 'number',
  );

  function handleNext() {
    setClinician({
      name: name.trim() || 'Clinician',
      credentials: credentials.trim(),
      practiceName: practiceName.trim() || undefined,
      npi: npi.trim() || undefined,
      acknowledgedDisclosureAt: Date.now(),
    });
    updateFirstRun({ disclosureVersion: DISCLOSURE_VERSION, onboardingDoneAt: Date.now() });
    onNext();
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Your profile"
        subtitle="Used to label notes and the top bar. You can edit this later in Settings."
      />
      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Your name">
            <TextInput
              placeholder="e.g., Dr. Alex Rivera"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Credentials" hint="Shown after your name (e.g., DPT, OCS)">
            <TextInput
              placeholder="DPT, OCS"
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
            />
          </Field>
          <Field label="Practice name" hint="Optional">
            <TextInput
              placeholder="Coastline Physical Therapy"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
            />
          </Field>
          <Field label="NPI" hint="Optional">
            <TextInput
              placeholder="10-digit NPI"
              value={npi}
              onChange={(e) => setNpi(e.target.value)}
            />
          </Field>
        </div>
      </SurfaceCard>

      <HipaaDisclosure variant="full" />

      <label
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontSize: 13,
          color: 'var(--color-pt-text-2)',
          cursor: 'pointer',
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span>
          I have read the disclosure above and understand that PTScribe is not HIPAA-certified, that
          audio and transcripts are sent to third-party AI providers, and that I am responsible for
          obtaining patient consent and for confirming any BAA arrangements.
        </span>
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PtButton
          variant="primary"
          disabled={!name.trim() || !acknowledged}
          onClick={handleNext}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          Finish setup
        </PtButton>
      </div>
    </div>
  );
}

const KEY_PROVIDERS: KeyProvider[] = ['anthropic', 'openai', 'google'];

function ConnectKeyStep({ onNext }: { onNext: () => void }) {
  const { settings, updateAi } = useSettings();
  const { state, orgSet } = useUsableKey();
  // The active generation provider; coerce 'none' to anthropic for the picker.
  const provider: KeyProvider =
    settings.ai.generation.provider === 'none' ? 'anthropic' : settings.ai.generation.provider;
  const [keyStatus, setKeyStatus] = useState<KeyStatus | undefined>(undefined);

  function pickProvider(next: KeyProvider) {
    setKeyStatus(undefined);
    updateAi({ generation: { provider: next, model: defaultModelFor(next) } });
  }

  const catalog = useProviderCatalog();
  const descriptor = catalog[provider];
  // Org key already covers this provider — the clinician is ready without a personal key.
  const orgReady = state === 'ready' && orgSet;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Connect your AI provider"
        subtitle="Notes are generated with your own provider key, billed to your account. You can add or change this anytime in Settings."
      />

      {orgReady ? (
        <SurfaceCard padding={18}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-pt-text)' }}>
              Your organization provides an AI key
            </div>
            <p
              style={{ margin: 0, fontSize: 13, color: 'var(--color-pt-text-2)', lineHeight: 1.5 }}
            >
              You&apos;re ready to generate notes — no personal key needed. You can still add your
              own key in Settings to use a different provider.
            </p>
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard padding={18}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Provider">
              <div>
                <SegmentedControl<KeyProvider>
                  value={provider}
                  onChange={pickProvider}
                  items={KEY_PROVIDERS.map((p) => ({ value: p, label: catalog[p].label }))}
                />
              </div>
            </Field>
            <Field label="Model" className="max-w-sm">
              <Select
                value={settings.ai.generation.model}
                onChange={(e) =>
                  updateAi({ generation: { ...settings.ai.generation, model: e.target.value } })
                }
              >
                {descriptor.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <ProviderKeyCard
              descriptor={descriptor}
              status={keyStatus}
              onStatusChange={setKeyStatus}
            />
          </div>
        </SurfaceCard>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {!orgReady && (
          <PtButton variant="ghost" onClick={onNext}>
            I&apos;ll add this later
          </PtButton>
        )}
        <PtButton
          variant="primary"
          onClick={onNext}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          {keyStatus?.set || orgReady ? 'Continue' : 'Skip for now'}
        </PtButton>
      </div>
    </div>
  );
}

function OwnerTipsStep({ onContinue }: { onContinue: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="Two quick next steps"
        subtitle="As the owner, these are the two areas worth visiting before clinicians log in."
      />
      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.01em',
              }}
            >
              Templates
            </div>
            <p
              style={{
                marginTop: 4,
                fontSize: 13,
                color: 'var(--color-pt-text-2)',
                lineHeight: 1.5,
              }}
            >
              Clone a built-in note template and tune it to match your documentation style. Every
              clinician in your practice will use the templates you set up here.
            </p>
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.01em',
              }}
            >
              Settings &rarr; Security
            </div>
            <p
              style={{
                marginTop: 4,
                fontSize: 13,
                color: 'var(--color-pt-text-2)',
                lineHeight: 1.5,
              }}
            >
              Enable at-rest encryption with a passphrase before any real patient data lands in this
              browser. Tab close evicts the key &mdash; there is no recovery.
            </p>
          </div>
        </div>
      </SurfaceCard>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PtButton variant="primary" onClick={() => navigate('/templates')}>
          Open Templates
        </PtButton>
        <PtButton variant="ghost" onClick={() => navigate('/settings')}>
          Open Settings
        </PtButton>
        <PtButton
          variant="ghost"
          onClick={onContinue}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          Continue
        </PtButton>
      </div>
    </div>
  );
}

function DoneStep() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="You're all set"
        subtitle="Add your first patient from the Patients page, or jump straight into a session."
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <PtButton
          variant="primary"
          onClick={() => {
            toast.success('Setup complete');
            navigate('/patients', { replace: true });
          }}
        >
          Add a patient
        </PtButton>
        <PtButton variant="ghost" onClick={() => navigate('/today', { replace: true })}>
          Go to dashboard
        </PtButton>
      </div>
    </div>
  );
}

function Stepper({ labels, current }: { labels: string[]; current: number }) {
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
                style={{
                  marginLeft: 4,
                  height: 1,
                  flex: 1,
                  background: 'var(--color-pt-border)',
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

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

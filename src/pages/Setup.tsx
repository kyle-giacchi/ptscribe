import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Stethoscope,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { Field, TextInput } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { duration, ease } from '@/lib/motion';

type Step = 'welcome' | 'profile' | 'ai' | 'done';
const FLOW: Step[] = ['profile', 'ai', 'done'];

export function Setup() {
  const [step, setStep] = useState<Step>('welcome');
  const flowIndex = FLOW.indexOf(step);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-pt-bg)',
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
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--color-pt-accent-soft)',
              color: 'var(--color-pt-accent-fg)',
            }}
          >
            <Stethoscope size={20} strokeWidth={1.75} />
          </div>
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--color-pt-text)',
                letterSpacing: '-0.01em',
              }}
            >
              PT <span style={{ color: 'var(--color-pt-accent-fg)' }}>Scribe</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
              {step === 'welcome'
                ? 'A clinical scribe that lives in your browser.'
                : 'A few quick questions and you’re ready to record.'}
            </div>
          </div>
        </header>

        {flowIndex >= 0 && step !== 'done' && <Stepper current={flowIndex} />}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease: ease.enter }}
          >
            {step === 'welcome' && <WelcomeStep onStart={() => setStep('profile')} />}
            {step === 'profile' && <ProfileStep onNext={() => setStep('ai')} />}
            {step === 'ai' && (
              <AIStep onBack={() => setStep('profile')} onNext={() => setStep('done')} />
            )}
            {step === 'done' && <DoneStep />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
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
        <p style={{ marginTop: 8, fontSize: 13.5, color: 'var(--color-pt-text-2)', lineHeight: 1.55 }}>
          Record a session, get a structured note. Patients, sessions, notes, templates, and
          exercises all live in this browser. Nothing is sent to a server we operate.
        </p>
      </div>

      <DisclaimerCard />

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

function ProfileStep({ onNext }: { onNext: () => void }) {
  const { clinician, setClinician } = useClinician();
  const [name, setName] = useState(clinician.name);
  const [credentials, setCredentials] = useState(clinician.credentials);
  const [practiceName, setPracticeName] = useState(clinician.practiceName ?? '');
  const [npi, setNpi] = useState(clinician.npi ?? '');

  function handleNext() {
    setClinician({
      name: name.trim() || 'Clinician',
      credentials: credentials.trim(),
      practiceName: practiceName.trim() || undefined,
      npi: npi.trim() || undefined,
    });
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

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PtButton
          variant="primary"
          disabled={!name.trim()}
          onClick={handleNext}
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
        >
          Next: AI providers
        </PtButton>
      </div>
    </div>
  );
}

function AIStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { settings, updateAi } = useSettings();
  const [cloudflareAccountId, setCloudflareAccountId] = useState(
    settings.ai.transcription.accountId ?? '',
  );
  const [cloudflareToken, setCloudflareToken] = useState(settings.ai.transcription.apiKey ?? '');
  const [anthropicKey, setAnthropicKey] = useState(settings.ai.generation.apiKey ?? '');

  function handleNext() {
    const cloudflareReady = cloudflareAccountId && cloudflareToken;
    updateAi({
      transcription: {
        ...settings.ai.transcription,
        provider: cloudflareReady ? 'cloudflare' : 'webspeech',
        accountId: cloudflareAccountId || undefined,
        apiKey: cloudflareToken || undefined,
      },
      generation: {
        ...settings.ai.generation,
        provider: anthropicKey ? 'anthropic' : 'none',
        apiKey: anthropicKey || undefined,
      },
    });
    onNext();
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <StepHeading
        title="AI providers (optional)"
        subtitle="Paste your credentials if you want server-quality transcription and AI-drafted notes. You can skip this and use the live web transcription, or add keys later."
      />

      <SurfaceCard padding={18}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field
            label="Cloudflare account ID — for Whisper transcription"
            hint="Found in your Cloudflare dashboard. Required to call Workers AI."
          >
            <TextInput
              placeholder="32-character account ID"
              value={cloudflareAccountId}
              onChange={(e) => setCloudflareAccountId(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Cloudflare API token — for Whisper transcription"
            hint="A Workers AI–scoped API token. If either field is empty, the app falls back to the browser’s built-in speech recognition."
          >
            <TextInput
              type="password"
              placeholder="Workers AI API token"
              value={cloudflareToken}
              onChange={(e) => setCloudflareToken(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Anthropic API key — for note generation"
            hint="Used to turn the transcript into a structured SOAP / Eval / Progress note. If empty, you can still type notes manually."
          >
            <TextInput
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
      </SurfaceCard>

      <DisclaimerCard />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <PtButton
          variant="ghost"
          iconLeft={<ArrowLeft size={14} strokeWidth={2} />}
          onClick={onBack}
        >
          Back
        </PtButton>
        <PtButton
          variant="primary"
          iconRight={<ArrowRight size={14} strokeWidth={2} />}
          onClick={handleNext}
        >
          Finish setup
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
        title="You’re all set"
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
        <PtButton variant="ghost" onClick={() => navigate('/', { replace: true })}>
          Go to dashboard
        </PtButton>
      </div>
    </div>
  );
}

function DisclaimerCard() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--color-pt-border)',
        background: 'var(--color-pt-surface-mut)',
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--color-pt-text-2)',
      }}
    >
      <ShieldAlert
        size={16}
        strokeWidth={1.75}
        style={{ marginTop: 2, flexShrink: 0, color: 'var(--color-pt-amber)' }}
      />
      <div style={{ display: 'grid', gap: 6 }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: 'var(--color-pt-text)' }}>Privacy &amp; HIPAA.</strong> PTScribe
          runs entirely in your browser. Patient data lives in this device’s local storage. Enabling
          AI transcription or note generation sends audio and transcripts directly to the provider
          you configured (Cloudflare / Anthropic) using your credentials.
        </p>
        <p style={{ margin: 0 }}>
          Nothing is sent to a server we operate.{' '}
          <strong style={{ color: 'var(--color-pt-text)' }}>
            PTScribe is not HIPAA-certified software
          </strong>{' '}
          — confirm BAA terms with your providers before using it with PHI.
        </p>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ['Profile', 'AI', 'Done'];
  return (
    <ol style={{ display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((label, i) => {
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
            {i < steps.length - 1 && (
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

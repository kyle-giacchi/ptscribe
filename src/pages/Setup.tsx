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
import { duration, ease } from '@/lib/motion';

type Step = 'welcome' | 'profile' | 'ai' | 'done';
const FLOW: Step[] = ['profile', 'ai', 'done'];

export function Setup() {
  const [step, setStep] = useState<Step>('welcome');
  const flowIndex = FLOW.indexOf(step);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-deep)' }}
          >
            <Stethoscope size={18} strokeWidth={1.75} />
          </div>
          <div>
            <div className="font-display text-xl" style={{ color: 'var(--color-fg)' }}>
              PT <span style={{ color: 'var(--color-accent-deep)' }}>Notes</span>
            </div>
            <div className="text-xs" style={{ color: 'var(--color-fg-subtle)' }}>
              {step === 'welcome'
                ? 'A clinical scribe that lives in your browser.'
                : 'A few quick questions and you’re ready to record.'}
            </div>
          </div>
        </header>

        {flowIndex >= 0 && step !== 'done' && <Stepper current={flowIndex} />}

        <div className="mt-8">
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
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl leading-tight" style={{ color: 'var(--color-fg)' }}>
          Welcome.
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
          Record a session, get a structured note. Patients, sessions, notes, templates, and
          exercises all live in this browser. Nothing is sent to a server we operate.
        </p>
      </div>

      <DisclaimerCard />

      <button type="button" className="btn btn-primary" onClick={onStart}>
        Get started <ArrowRight size={14} strokeWidth={2} />
      </button>
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
    <div className="space-y-6">
      <StepHeading
        title="Your profile"
        subtitle="Used to label notes and the top bar. You can edit this later in Settings."
      />
      <div className="card space-y-4">
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

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={handleNext}>
          Next: AI providers <ArrowRight size={14} strokeWidth={2} />
        </button>
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
    <div className="space-y-6">
      <StepHeading
        title="AI providers (optional)"
        subtitle="Paste your credentials if you want server-quality transcription and AI-drafted notes. You can skip this and use the live web transcription, or add keys later."
      />

      <div className="card space-y-4">
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

      <DisclaimerCard />

      <div className="flex justify-between">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={2} /> Back
        </button>
        <button type="button" className="btn btn-primary" onClick={handleNext}>
          Finish setup <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function DoneStep() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <StepHeading
        title="You’re all set"
        subtitle="Add your first patient from the Patients page, or jump straight into a session."
      />
      <div className="flex gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            toast.success('Setup complete');
            navigate('/patients', { replace: true });
          }}
        >
          Add a patient
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate('/', { replace: true })}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}

function DisclaimerCard() {
  return (
    <div
      className="flex gap-3 rounded-xl border p-4 text-xs leading-relaxed"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <ShieldAlert
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
        style={{ color: 'var(--color-caution)' }}
      />
      <div className="space-y-1.5">
        <p>
          <strong style={{ color: 'var(--color-fg)' }}>Privacy &amp; HIPAA.</strong> PTScribe runs
          entirely in your browser. Patient data lives in this device’s local storage. Enabling AI
          transcription or note generation sends audio and transcripts directly to the provider you
          configured (Cloudflare / Anthropic) using your credentials.
        </p>
        <p>
          Nothing is sent to a server we operate. <strong>PTScribe is not HIPAA-certified
          software</strong> — confirm BAA terms with your providers before using it with PHI.
        </p>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ['Profile', 'AI', 'Done'];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors"
              style={{
                background: done || active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                color: done || active ? 'white' : 'var(--color-fg-subtle)',
              }}
            >
              {done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            <span
              className="text-xs"
              style={{ color: active ? 'var(--color-fg)' : 'var(--color-fg-subtle)' }}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span
                className="ml-1 h-px flex-1"
                style={{ background: 'var(--color-border)' }}
                aria-hidden
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
      <h1 className="font-display text-2xl" style={{ color: 'var(--color-fg)' }}>
        {title}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        {subtitle}
      </p>
    </div>
  );
}

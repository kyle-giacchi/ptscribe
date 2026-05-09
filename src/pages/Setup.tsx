import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Check } from 'lucide-react';
import { useClinician } from '@/contexts/ClinicianProvider';
import { useSettings } from '@/contexts/SettingsProvider';
import { Field, TextInput } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { HipaaDisclosure } from '@/components/disclosures/HipaaDisclosure';
import { duration, ease } from '@/lib/motion';
import { DISCLOSURE_VERSION } from '@/types';

type Step = 'welcome' | 'profile' | 'done';
const FLOW: Step[] = ['profile', 'done'];

export function Setup() {
  const [step, setStep] = useState<Step>('welcome');
  const flowIndex = FLOW.indexOf(step);

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
                : "A few quick questions and you're ready to record."}
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
            {step === 'profile' && <ProfileStep onNext={() => setStep('done')} />}
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

function Stepper({ current }: { current: number }) {
  const steps = ['Profile', 'Done'];
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

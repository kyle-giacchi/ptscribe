import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Field, TextInput } from '@/components/ui/Field';
import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { useClinician } from '@/contexts/ClinicianProvider';

function buildOnboardingLink(origin: string, practiceName: string | undefined): string {
  const base = `${origin}/setup?role=clinician`;
  return practiceName ? `${base}&clinic=${encodeURIComponent(practiceName)}` : base;
}

export function ClinicianProfileCard() {
  const { clinician, setClinician } = useClinician();

  // D14 — Copy onboarding link. Practice name is optional; we omit the param
  // when missing rather than disabling the button.
  function handleCopyOnboardingLink() {
    const url = buildOnboardingLink(window.location.origin, clinician.practiceName);
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Onboarding link copied'))
      .catch(() => toast.error('Could not copy link'));
  }

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Clinician profile</Eyebrow>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <Field label="Name">
            <TextInput
              value={clinician.name}
              onChange={(e) => setClinician({ name: e.target.value })}
            />
          </Field>
          <Field label="Credentials" hint="DPT, OCS, etc.">
            <TextInput
              value={clinician.credentials}
              onChange={(e) => setClinician({ credentials: e.target.value })}
            />
          </Field>
          <Field label="Practice name">
            <TextInput
              value={clinician.practiceName ?? ''}
              onChange={(e) => setClinician({ practiceName: e.target.value })}
            />
          </Field>
          <Field label="NPI">
            <TextInput
              value={clinician.npi ?? ''}
              onChange={(e) => setClinician({ npi: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <TextInput
              value={clinician.phone ?? ''}
              onChange={(e) => setClinician({ phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <TextInput
              value={clinician.email ?? ''}
              onChange={(e) => setClinician({ email: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Practice address">
          <TextInput
            value={clinician.practiceAddress ?? ''}
            onChange={(e) => setClinician({ practiceAddress: e.target.value })}
          />
        </Field>
        <Field label="Signature block" hint="Appended to exported notes.">
          <textarea
            className="input"
            style={{ minHeight: 80, fontSize: 13 }}
            value={clinician.signatureBlock ?? ''}
            onChange={(e) => setClinician({ signatureBlock: e.target.value })}
          />
        </Field>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PtButton
            variant="ghost"
            iconLeft={<Copy size={14} strokeWidth={2} />}
            onClick={handleCopyOnboardingLink}
          >
            Copy clinician onboarding link
          </PtButton>
        </div>
      </div>
    </SurfaceCard>
  );
}

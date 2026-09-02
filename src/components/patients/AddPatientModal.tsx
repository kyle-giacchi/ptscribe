import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { PtButton, randomAvatarColor } from '@/components/design';
import { parseIsoDate, fmtIsoDateOptional } from '@/utils/dates';
import type { Patient, Sex } from '@/types';

export function AddPatientModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: Patient) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [mrn, setMrn] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [icd10, setIcd10] = useState('');
  const [referring, setReferring] = useState('');

  function reset() {
    setFirstName('');
    setLastName('');
    setDob('');
    setSex('');
    setMrn('');
    setDiagnosis('');
    setIcd10('');
    setReferring('');
  }

  function handleSave() {
    const now = Date.now();
    const patient: Patient = {
      id: crypto.randomUUID(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dob: parseIsoDate(dob),
      sex: sex || undefined,
      mrn: mrn.trim() || undefined,
      primaryDiagnosis: diagnosis.trim() || undefined,
      icd10: icd10.trim() || undefined,
      referringProvider: referring.trim() || undefined,
      color: randomAvatarColor(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    onSave(patient);
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Add patient" size="lg">
      <FormSection title="Identity" hint="Required to create a chart.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <TextInput
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name">
            <TextInput
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Demographics" hint="Optional — used in note headers and PDFs.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of birth" hint={fmtIsoDateOptional(parseIsoDate(dob)) || undefined}>
            <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label="Sex">
            <Select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="X">Other / unspecified</option>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Clinical" hint="Optional — fill what you know now.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="MRN">
            <TextInput value={mrn} onChange={(e) => setMrn(e.target.value)} />
          </Field>
          <Field label="Referring provider">
            <TextInput value={referring} onChange={(e) => setReferring(e.target.value)} />
          </Field>
          <Field label="Primary diagnosis" className="sm:col-span-2">
            <TextInput
              placeholder="e.g., Right rotator cuff tendinopathy"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </Field>
          <Field label="ICD-10">
            <TextInput
              placeholder="M75.101"
              value={icd10}
              onChange={(e) => setIcd10(e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 pt-2">
        <PtButton variant="ghost" onClick={handleClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" disabled={!canSave} onClick={handleSave}>
          Save patient
        </PtButton>
      </div>
    </Modal>
  );
}

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-pt-text-2)',
          }}
        >
          {title}
        </h3>
        {hint && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-3)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

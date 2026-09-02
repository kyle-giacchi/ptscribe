import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { AVATAR_COLORS, PtButton } from '@/components/design';
import { fmtIsoDateOptional, parseIsoDate } from '@/utils/dates';
import type { Patient, PatientStatus, Sex } from '@/types';

export function EditPatientModal({
  open,
  patient,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  patient: Patient;
  onClose: () => void;
  onSave: (patch: Partial<Patient>) => void;
  onDelete: () => void;
}) {
  const [firstName, setFirstName] = useState(patient.firstName);
  const [lastName, setLastName] = useState(patient.lastName);
  const [dob, setDob] = useState(fmtIsoDateOptional(patient.dob));
  const [sex, setSex] = useState<Sex | ''>(patient.sex ?? '');
  const [mrn, setMrn] = useState(patient.mrn ?? '');
  const [diagnosis, setDiagnosis] = useState(patient.primaryDiagnosis ?? '');
  const [icd10, setIcd10] = useState(patient.icd10 ?? '');
  const [referring, setReferring] = useState(patient.referringProvider ?? '');
  const [status, setStatus] = useState<PatientStatus>(patient.status);
  const [notes, setNotes] = useState(patient.notes ?? '');
  const [color, setColor] = useState(patient.color ?? AVATAR_COLORS[0].hex);

  function handleSave() {
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dob: parseIsoDate(dob),
      sex: sex || undefined,
      mrn: mrn.trim() || undefined,
      primaryDiagnosis: diagnosis.trim() || undefined,
      icd10: icd10.trim() || undefined,
      referringProvider: referring.trim() || undefined,
      notes: notes.trim() || undefined,
      color,
      status,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit patient" size="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Sex">
          <Select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
            <option value="">—</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="X">Other</option>
          </Select>
        </Field>
        <Field label="MRN">
          <TextInput value={mrn} onChange={(e) => setMrn(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as PatientStatus)}>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="discharged">Discharged</option>
          </Select>
        </Field>
        <Field label="Primary diagnosis">
          <TextInput value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </Field>
        <Field label="ICD-10">
          <TextInput value={icd10} onChange={(e) => setIcd10(e.target.value)} />
        </Field>
        <Field label="Referring provider" className="sm:col-span-2">
          <TextInput value={referring} onChange={(e) => setReferring(e.target.value)} />
        </Field>
        <Field
          label="Chart color"
          className="sm:col-span-2"
          hint="Quick visual identifier on lists and headers."
        >
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-label={c.label}
                aria-pressed={color.toLowerCase() === c.hex}
                onClick={() => setColor(c.hex)}
                className="h-8 w-8 cursor-pointer rounded-full transition-transform hover:scale-110"
                style={{
                  background: c.hex,
                  border:
                    color.toLowerCase() === c.hex
                      ? '2px solid var(--color-pt-text)'
                      : '1px solid rgba(0,0,0,0.08)',
                }}
              />
            ))}
            <label
              className="ml-1 inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-pt-border)] pr-3 pl-1"
              title="Custom color"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-6 cursor-pointer rounded-full border-none bg-transparent p-0"
                aria-label="Custom color"
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-pt-text-2)' }}>
                Custom
              </span>
            </label>
          </div>
        </Field>
        <Field label="Internal notes" className="sm:col-span-2" hint="Visible only to you.">
          <textarea
            className="input min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onDelete}
          className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-sm font-semibold text-[var(--color-pt-red)] transition-colors hover:bg-[var(--color-pt-surface-mut)]"
        >
          <Trash2 size={12} strokeWidth={2} /> Remove patient
        </button>
        <PtButton variant="ghost" onClick={onClose}>
          Cancel
        </PtButton>
        <PtButton variant="primary" onClick={handleSave}>
          Save changes
        </PtButton>
      </div>
    </Modal>
  );
}

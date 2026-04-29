import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { PtButton } from '@/components/design';
import { fmtIsoDateOptional, parseIsoDate } from '@/utils/dates';
import type { Patient, PatientStatus, Sex } from '@/types';

export function EditPatientModal({
  open,
  patient,
  onClose,
  onSave,
}: {
  open: boolean;
  patient: Patient;
  onClose: () => void;
  onSave: (patch: Partial<Patient>) => void;
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
        <Field label="Internal notes" className="sm:col-span-2" hint="Visible only to you.">
          <textarea
            className="input min-h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-3">
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

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { Clinician, Note, NoteTemplate, Patient } from '@/types';

interface NotePDFProps {
  note: Note;
  template: NoteTemplate | undefined;
  patient: Patient;
  clinician: Clinician;
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 48,
    paddingVertical: 56,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#0f172a',
    lineHeight: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 10,
    marginBottom: 18,
  },
  practice: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  practiceMeta: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  docMeta: {
    fontSize: 9,
    color: '#475569',
    textAlign: 'right',
  },
  docMetaStrong: {
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  patientBlock: {
    marginBottom: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 10,
  },
  patientName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  patientMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  patientMeta: {
    fontSize: 9,
    color: '#475569',
    marginRight: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  sectionBody: {
    fontSize: 11,
    color: '#0f172a',
  },
  signature: {
    marginTop: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  signatureLabel: {
    fontSize: 9,
    color: '#475569',
  },
  signatureName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function fmtDob(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

export function NotePDF({ note, template, patient, clinician }: NotePDFProps) {
  return (
    <Document title={`${patient.lastName}_${patient.firstName}_${template?.name ?? note.format}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderRow clinician={clinician} note={note} template={template} />
        <PatientBlock patient={patient} />
        {note.sections.map((s) => (
          <View key={s.key} wrap={false}>
            <Text style={styles.sectionTitle}>{s.label}</Text>
            <Text style={styles.sectionBody}>{s.body || '(no entry)'}</Text>
          </View>
        ))}
        <SignatureBlock clinician={clinician} />
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

function HeaderRow({
  clinician,
  note,
  template,
}: Pick<NotePDFProps, 'clinician' | 'note' | 'template'>) {
  const practiceLine = [clinician.practiceName, clinician.practiceAddress, clinician.phone]
    .filter(Boolean)
    .join(' · ');
  const finalizedLine =
    note.finalized && note.finalizedAt
      ? `Finalized · ${fmtDate(note.finalizedAt)}`
      : note.finalized
        ? 'Finalized'
        : 'Draft';
  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.practice}>{clinician.practiceName || 'Physical Therapy Note'}</Text>
        {practiceLine && <Text style={styles.practiceMeta}>{practiceLine}</Text>}
      </View>
      <View>
        <Text style={styles.docMeta}>
          <Text style={styles.docMetaStrong}>{template?.name ?? note.format.toUpperCase()}</Text>
        </Text>
        <Text style={styles.docMeta}>{fmtDate(note.createdAt)}</Text>
        <Text style={styles.docMeta}>{finalizedLine}</Text>
      </View>
    </View>
  );
}

function PatientBlock({ patient }: { patient: NotePDFProps['patient'] }) {
  const fields: Array<[string, string | undefined]> = [
    ['DOB', fmtDob(patient.dob)],
    ['Sex', patient.sex],
    ['MRN', patient.mrn],
    ['ICD-10', patient.icd10],
    ['Dx', patient.primaryDiagnosis],
  ];
  return (
    <View style={styles.patientBlock}>
      <Text style={styles.patientName}>
        {patient.firstName} {patient.lastName}
      </Text>
      <View style={styles.patientMetaRow}>
        {fields
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <Text key={label} style={styles.patientMeta}>
              {label}: {v}
            </Text>
          ))}
      </View>
    </View>
  );
}

function SignatureBlock({ clinician }: { clinician: NotePDFProps['clinician'] }) {
  const credentialLine = [clinician.name, clinician.credentials].filter(Boolean).join(', ');
  return (
    <View style={styles.signature}>
      <Text style={styles.signatureLabel}>Signed by</Text>
      <Text style={styles.signatureName}>{credentialLine || 'Treating clinician'}</Text>
      {clinician.npi && <Text style={styles.patientMeta}>NPI: {clinician.npi}</Text>}
      {clinician.signatureBlock && (
        <Text style={styles.patientMeta}>{clinician.signatureBlock}</Text>
      )}
    </View>
  );
}

export async function downloadNotePDF(props: NotePDFProps, fileName: string): Promise<void> {
  const blob = await pdf(<NotePDF {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
    fontSize: 'var(--text-xs)',
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
    fontSize: 'var(--text-md)',
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  practiceMeta: {
    fontSize: 'var(--text-2xs)',
    color: '#475569',
    marginTop: 2,
  },
  docMeta: {
    fontSize: 'var(--text-2xs)',
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
    fontSize: 'var(--text-base)',
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  patientMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  patientMeta: {
    fontSize: 'var(--text-2xs)',
    color: '#475569',
    marginRight: 14,
  },
  sectionTitle: {
    fontSize: 'var(--text-2xs)',
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  sectionBody: {
    fontSize: 'var(--text-xs)',
    color: '#0f172a',
  },
  signature: {
    marginTop: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  signatureLabel: {
    fontSize: 'var(--text-2xs)',
    color: '#475569',
  },
  signatureName: {
    fontSize: 'var(--text-xs)',
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 'var(--text-2xs)',
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
    // PDF metadata title — shows up in the browser's print-preview header, the
    // viewer tab title, and file properties. Pseudonymous on purpose; the page
    // body below still prints the full identity block.
    <Document title={`PT-${patient.id.slice(0, 8).toUpperCase()}_${template?.name ?? note.format}`}>
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

async function buildNotePDFBlob(props: NotePDFProps): Promise<Blob> {
  return pdf(<NotePDF {...props} />).toBlob();
}

export async function downloadNotePDF(props: NotePDFProps, fileName: string): Promise<void> {
  const blob = await buildNotePDFBlob(props);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Open the rendered PDF in a new tab so the clinician can print it from the
 * browser's native PDF viewer (Ctrl/Cmd+P). Reuses the same @react-pdf
 * document as the download path. Returns false if the tab was blocked by a
 * popup blocker so the caller can surface a hint.
 */
export async function printNotePDF(props: NotePDFProps): Promise<boolean> {
  const blob = await buildNotePDFBlob(props);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  // Keep the object URL alive long enough for the new tab to load it, then
  // release it. Revoking immediately would break the opened document.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

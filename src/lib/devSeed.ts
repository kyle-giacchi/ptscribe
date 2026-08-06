import { DAY_MS } from '@/utils/dates';
import type { Measurement, Note, Patient, PlanOfCare, Session, SessionType } from '@/types';

/**
 * Five-patient caseload for the local dev (Test User) profile.
 *
 * Deterministic ids (`dev…`) rather than `crypto.randomUUID()`: the seeder can
 * then ask "is `dev1` already here?" and skip, so a reload never duplicates the
 * caseload. Everything else in the app uses randomUUID — this is the one place
 * idempotency is worth more than uniqueness.
 *
 * Dates are all relative to seed time so the caseload never looks stale.
 *
 * DEV-ONLY. Never seeded in demo mode or for a real signed-in profile.
 */

export const DEV_SEED_MARKER_ID = 'dev1';

interface Spec {
  n: number;
  first: string;
  last: string;
  sex: Patient['sex'];
  ageYears: number;
  dx: string;
  icd10: string;
  referrer: string;
  status: Patient['status'];
  /** Days ago the episode started. */
  startedDaysAgo: number;
  /** Days ago each visit occurred, newest last. */
  visitDaysAgo: number[];
  goals: string[];
  /** `[measureId, side?, values oldest→newest]` — one entry per tracked measure. */
  measures: [string, 'left' | 'right' | undefined, number[]][];
  /** Sections for the most recent signed note. */
  note: [string, string][];
}

const SPECS: Spec[] = [
  {
    n: 1,
    first: 'Marcus',
    last: 'Delgado',
    sex: 'M',
    ageYears: 47,
    dx: 'Right shoulder impingement — supraspinatus tendinopathy',
    icd10: 'M75.41',
    referrer: 'Dr. A. Whitfield',
    status: 'active',
    startedDaysAgo: 52,
    visitDaysAgo: [52, 45, 38, 31, 24, 17, 10, 3],
    goals: [
      'Reach overhead to a top shelf without pain',
      'Return to recreational tennis serve',
      'NPRS ≤ 2/10 with all work tasks',
    ],
    measures: [
      ['nprs', undefined, [7, 6, 6, 5, 4, 3, 3, 2]],
      ['rom_shoulder_flexion', 'right', [112, 118, 126, 134, 141, 150, 156, 162]],
      ['rom_shoulder_abduction', 'right', [98, 104, 115, 124, 133, 142, 150, 158]],
      ['mmt_shoulder_abduction', 'right', [3, 3, 3.5, 3.5, 4, 4, 4.5, 4.5]],
      ['quickdash', undefined, [59, 52, 45, 39, 30, 25, 18, 14]],
    ],
    note: [
      [
        'Subjective',
        'Reports pain is now "only at the very end of reaching up." Slept through the night 6 of 7 nights. Denies night pain when side-lying on the left. Has been consistent with the band program 5x/week.',
      ],
      [
        'Objective',
        'Shoulder flexion 162° (from 156°), abduction 158°. MMT abduction 4+/5, no painful arc through mid-range. Negative Hawkins-Kennedy this visit (previously positive). Scapular upward rotation symmetric on wall slide.',
      ],
      [
        'Assessment',
        'Continued steady improvement. QuickDASH 14 — a 45-point change from eval, well beyond MCID. Now limited primarily by end-range endurance rather than pain.',
      ],
      [
        'Plan',
        'Progress to overhead loading. Add serve-simulation eccentrics. Reassess in 2 weeks; anticipate discharge within 3–4 visits.',
      ],
    ],
  },
  {
    n: 2,
    first: 'Dana',
    last: 'Okafor',
    sex: 'F',
    ageYears: 34,
    dx: 'Left knee — post-op ACL reconstruction (hamstring autograft), week 9',
    icd10: 'S83.512A',
    referrer: 'Dr. R. Nakamura',
    status: 'active',
    startedDaysAgo: 40,
    visitDaysAgo: [40, 33, 26, 19, 12, 5],
    goals: [
      'Full active knee extension symmetric to right',
      'Single-leg squat to 60° with no valgus collapse',
      'Return to jogging at week 14 per protocol',
    ],
    measures: [
      ['nprs', undefined, [4, 3, 3, 2, 2, 1]],
      ['rom_knee_flexion', 'left', [96, 108, 118, 126, 132, 138]],
      ['rom_knee_ext_lag', 'left', [8, 6, 4, 3, 1, 0]],
      ['mmt_knee_extension', 'left', [3, 3.5, 3.5, 4, 4, 4]],
      ['lefs', undefined, [34, 41, 48, 55, 62, 68]],
      ['five_times_sit_to_stand', undefined, [18.2, 16.4, 14.9, 13.1, 12.0, 10.8]],
    ],
    note: [
      [
        'Subjective',
        'Feels "solid" on stairs both directions for the first time. No swelling after last session. Asking about return-to-run timeline.',
      ],
      [
        'Objective',
        'Knee flexion 138°, extension lag resolved (0°). Quad MMT 4/5, no extensor lag on SLR. 5x sit-to-stand 10.8s. Single-leg squat to 45° with mild dynamic valgus at 30°+.',
      ],
      [
        'Assessment',
        'On protocol for week 9. Extension deficit fully resolved — the key milestone. Residual frontal-plane control deficit is now the rate limiter, not strength or ROM.',
      ],
      [
        'Plan',
        'Add lateral hip loading and step-down eccentrics. Hold on impact loading until quad index >80% at week 12 testing.',
      ],
    ],
  },
  {
    n: 3,
    first: 'Eleanor',
    last: 'Prince',
    sex: 'F',
    ageYears: 71,
    dx: 'Chronic low back pain with lumbar stenosis; deconditioning',
    icd10: 'M48.062',
    referrer: 'Dr. S. Chaudhry',
    status: 'active',
    startedDaysAgo: 63,
    visitDaysAgo: [63, 56, 49, 42, 35, 28, 14],
    goals: [
      'Walk 20 minutes continuously without sitting rest',
      'Carry groceries from car to kitchen in one trip',
      'Independent with home program',
    ],
    measures: [
      ['nprs', undefined, [6, 6, 5, 5, 4, 4, 4]],
      ['odi', undefined, [48, 46, 42, 40, 36, 34, 32]],
      ['tug', undefined, [14.8, 14.1, 13.5, 12.9, 12.2, 11.8, 11.4]],
      ['gait_speed', undefined, [0.78, 0.82, 0.86, 0.9, 0.95, 0.98, 1.02]],
      ['six_minute_walk', undefined, [244, 268, 291, 315, 342, 360, 378]],
      ['single_leg_stance', 'right', [4, 5, 6, 8, 9, 11, 12]],
    ],
    note: [
      [
        'Subjective',
        'Missed two weeks — daughter visiting. Reports she "kept up with the walking, mostly." Pain unchanged at 4/10, described as a band across the low back after 10 minutes on her feet.',
      ],
      [
        'Objective',
        '6MWT 378m (up from 360m). Gait speed 1.02 m/s — above the 1.0 m/s community-ambulation threshold for the first time. TUG 11.4s. Single-leg stance R 12s. Lumbar flexion unchanged, extension remains guarded.',
      ],
      [
        'Assessment',
        'Function continues to improve despite a plateau in pain report — an expected pattern in chronic stenosis. Gait speed crossing 1.0 m/s is clinically meaningful for fall risk and community access.',
      ],
      [
        'Plan',
        'Reinforce that pain score is not the target here; function is. Progress walking program to 20 min. Reassess ODI in 4 weeks.',
      ],
    ],
  },
  {
    n: 4,
    first: 'Tobias',
    last: 'Renner',
    sex: 'M',
    ageYears: 29,
    dx: 'Right ankle inversion sprain, grade II — 3 weeks post-injury',
    icd10: 'S93.401A',
    referrer: 'Self-referred',
    status: 'active',
    startedDaysAgo: 16,
    visitDaysAgo: [16, 11, 6, 1],
    goals: [
      'Full weight-bearing gait without antalgia',
      'Return to 5-a-side football at 8 weeks',
      'Single-leg hop symmetry ≥ 90%',
    ],
    measures: [
      ['nprs', undefined, [6, 4, 3, 2]],
      ['rom_ankle_dorsiflexion', 'right', [4, 8, 11, 14]],
      ['rom_ankle_dorsiflexion', 'left', [16, 16, 16, 17]],
      ['single_leg_stance', 'right', [6, 12, 21, 30]],
    ],
    note: [
      [
        'Subjective',
        'Walking without the boot for 4 days. Occasional "twinge" on uneven ground. No giving way.',
      ],
      [
        'Objective',
        'Ankle DF right 14° vs left 17° — asymmetry narrowing. Single-leg stance right 30s (eyes open). No lateral ligament laxity change on anterior drawer. Mild residual swelling at the lateral malleolus.',
      ],
      [
        'Assessment',
        'Grade II sprain progressing ahead of typical timeline. Dorsiflexion deficit is 3° and closing — the main remaining objective gap.',
      ],
      [
        'Plan',
        'Begin hop progression and multi-directional agility. Hold return-to-sport clearance pending hop symmetry testing at week 6.',
      ],
    ],
  },
  {
    n: 5,
    first: 'Priya',
    last: 'Raghunathan',
    sex: 'F',
    ageYears: 41,
    dx: 'Cervicogenic headache with upper cervical hypomobility',
    icd10: 'M54.2',
    referrer: 'Dr. L. Ferreira',
    status: 'on_hold',
    startedDaysAgo: 88,
    visitDaysAgo: [88, 81, 74, 67],
    goals: [
      'Headache frequency ≤ 1 per week',
      'Tolerate a full workday at the desk without symptoms',
    ],
    measures: [
      ['nprs', undefined, [5, 4, 4, 3]],
      ['nprs_worst', undefined, [8, 7, 6, 6]],
      ['rom_cervical_rotation', 'left', [52, 58, 62, 66]],
      ['rom_cervical_rotation', 'right', [48, 54, 58, 61]],
      ['ndi', undefined, [38, 34, 30, 26]],
    ],
    note: [
      [
        'Subjective',
        'Headaches down to 2 per week from 5. Reports the workstation changes made "the biggest difference." Travelling for work over the next several weeks — requesting to pause care.',
      ],
      [
        'Objective',
        'Cervical rotation L 66° / R 61°. NDI 26 (from 38 at eval). Upper cervical flexion-rotation test less restrictive bilaterally. No reproduction of headache with C1-2 PA mobilisation this visit.',
      ],
      [
        'Assessment',
        'Meaningful improvement across every domain. NDI change of 12 points exceeds MCID. Reasonable candidate for a self-management hold.',
      ],
      [
        'Plan',
        'Place on hold at patient request. Home program continued independently. Return in 6 weeks or sooner if headache frequency increases.',
      ],
    ],
  },
];

/** Rough enough: only used to render an age in the header. */
function dobFor(ageYears: number, now: number): number {
  return now - ageYears * 365.25 * DAY_MS;
}

function visitType(index: number, total: number): SessionType {
  if (index === 0) return 'evaluation';
  if (index === total - 1) return 'follow_up';
  // A progress note roughly every fourth visit, which is what re-authorisation
  // cycles look like in practice.
  return index % 4 === 0 ? 'progress' : 'follow_up';
}

export interface DevSeed {
  patients: Patient[];
  sessions: Session[];
  notes: Note[];
  plans: PlanOfCare[];
  measurements: Measurement[];
}

/**
 * Build the full caseload. Pure — the caller decides whether and how to persist,
 * so this is testable without a provider tree.
 */
export function buildDevSeed(now = Date.now()): DevSeed {
  const patients: Patient[] = [];
  const sessions: Session[] = [];
  const notes: Note[] = [];
  const plans: PlanOfCare[] = [];
  const measurements: Measurement[] = [];

  for (const spec of SPECS) {
    const pid = `dev${spec.n}`;
    const createdAt = now - spec.startedDaysAgo * DAY_MS;

    patients.push({
      id: pid,
      firstName: spec.first,
      lastName: spec.last,
      dob: dobFor(spec.ageYears, now),
      sex: spec.sex,
      mrn: `MRN-${1000 + spec.n}`,
      primaryDiagnosis: spec.dx,
      icd10: spec.icd10,
      referringProvider: spec.referrer,
      status: spec.status,
      createdAt,
      updatedAt: now,
    });

    const visitTs = spec.visitDaysAgo.map((d) => now - d * DAY_MS);

    visitTs.forEach((ts, i) => {
      const sid = `dev${spec.n}-s${i + 1}`;
      const isLatest = i === visitTs.length - 1;
      // Only the most recent visit of the two active-est patients is left
      // unsigned — enough to exercise the "Unsigned" filter without making the
      // whole caseload look like a documentation backlog.
      const unsigned = isLatest && (spec.n === 2 || spec.n === 4);

      sessions.push({
        id: sid,
        patientId: pid,
        type: visitType(i, visitTs.length),
        date: ts,
        durationMin: 45,
        status: unsigned ? 'ready' : 'finalized',
        clips: [],
        noteId: `${sid}-n`,
        createdAt: ts,
        updatedAt: ts,
      });

      notes.push({
        id: `${sid}-n`,
        sessionId: sid,
        patientId: pid,
        format: 'soap',
        // Only the newest visit carries the hand-written narrative; earlier
        // visits get a short stub so the history reads as real without five
        // pages of invented prose per patient.
        sections: isLatest
          ? spec.note.map(([label, body]) => ({ key: label.toLowerCase(), label, body }))
          : [
              {
                key: 'subjective',
                label: 'Subjective',
                body: 'Tolerated the session well. Home program reviewed.',
              },
              {
                key: 'plan',
                label: 'Plan',
                body: 'Continue current plan of care.',
              },
            ],
        finalized: !unsigned,
        finalizedAt: unsigned ? undefined : ts + 30 * 60_000,
        createdAt: ts,
        updatedAt: ts,
      });
    });

    plans.push({
      id: `dev${spec.n}-plan`,
      patientId: pid,
      startDate: createdAt,
      expectedDischargeDate: createdAt + 84 * DAY_MS,
      goals: spec.goals.map((text, gi) => ({
        id: `dev${spec.n}-g${gi + 1}`,
        text,
        targetDate: createdAt + (gi + 1) * 28 * DAY_MS,
        met: gi === 0 && spec.n !== 4,
      })),
      // Prescriptions reference exercise ids we can't know here (they're
      // per-profile). Left empty on purpose — the Plan tab's picker fills them
      // from whatever exercise library the dev profile actually has.
      prescriptions: [],
      active: spec.status === 'active',
      createdAt,
      updatedAt: now,
    });

    for (const [measureId, side, values] of spec.measures) {
      values.forEach((value, vi) => {
        // Readings land on visit days. If a measure has fewer readings than
        // visits, anchor them to the most recent visits.
        const ts = visitTs[visitTs.length - values.length + vi] ?? visitTs[vi];
        measurements.push({
          id: `dev${spec.n}-${measureId}-${side ?? 'x'}-${vi}`,
          patientId: pid,
          sessionId: sessions.find((s) => s.patientId === pid && s.date === ts)?.id,
          measureId,
          side,
          value,
          takenAt: ts,
          createdAt: ts,
          updatedAt: ts,
        });
      });
    }
  }

  return { patients, sessions, notes, plans, measurements };
}

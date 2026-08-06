import type { MeasureDef, MeasureKind } from '@/types';

/**
 * Built-in catalog of objective measures a PT or general clinician records at
 * eval, re-eval, and discharge.
 *
 * This is data, not configuration — a `Measurement` stores only `{measureId, value}`,
 * so without a definition there is no way to know the unit, the plausible range, or
 * whether a rise is improvement. `higherIsBetter` is what lets the UI render a raw
 * delta as better/worse: +15° of knee flexion is progress, +3 on the NPRS is not.
 *
 * `mcid` is the published minimal clinically important difference where one exists —
 * the threshold below which a change is noise. ROM and MMT are deliberately left
 * without one; there is no single accepted value across joints.
 *
 * Not user-editable. Custom measures would need a `measures` slice; nothing asks
 * for that yet, and an unrecognized `measureId` still renders (see `measureDef`).
 */
export const MEASURE_CATALOG: MeasureDef[] = [
  // ── Pain ──
  {
    id: 'nprs',
    label: 'Pain (NPRS)',
    kind: 'pain',
    unit: '/10',
    min: 0,
    max: 10,
    higherIsBetter: false,
    mcid: 2,
    hint: '0 = no pain, 10 = worst imaginable',
  },
  {
    id: 'nprs_worst',
    label: 'Pain at worst (NPRS)',
    kind: 'pain',
    unit: '/10',
    min: 0,
    max: 10,
    higherIsBetter: false,
    mcid: 2,
  },

  // ── Range of motion (goniometry, degrees) ──
  {
    id: 'rom_shoulder_flexion',
    label: 'Shoulder flexion',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 180,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 180°',
  },
  {
    id: 'rom_shoulder_abduction',
    label: 'Shoulder abduction',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 180,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 180°',
  },
  {
    id: 'rom_shoulder_er',
    label: 'Shoulder external rotation',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 90,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 90°',
  },
  {
    id: 'rom_knee_flexion',
    label: 'Knee flexion',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 150,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 135°',
  },
  {
    id: 'rom_knee_ext_lag',
    label: 'Knee extension lag',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 40,
    higherIsBetter: false,
    bilateral: true,
    hint: 'Degrees short of full extension — 0 is the goal',
  },
  {
    id: 'rom_hip_flexion',
    label: 'Hip flexion',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 130,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 120°',
  },
  {
    id: 'rom_ankle_dorsiflexion',
    label: 'Ankle dorsiflexion',
    kind: 'rom',
    unit: '°',
    min: -20,
    max: 30,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 20°',
  },
  {
    id: 'rom_cervical_rotation',
    label: 'Cervical rotation',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 90,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Norm ≈ 80°',
  },
  {
    id: 'rom_lumbar_flexion',
    label: 'Lumbar flexion',
    kind: 'rom',
    unit: '°',
    min: 0,
    max: 90,
    higherIsBetter: true,
    hint: 'Norm ≈ 60°',
  },

  // ── Strength ──
  {
    id: 'mmt_shoulder_abduction',
    label: 'MMT shoulder abduction',
    kind: 'strength',
    unit: '/5',
    min: 0,
    max: 5,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Oxford scale 0–5 (half grades allowed)',
  },
  {
    id: 'mmt_knee_extension',
    label: 'MMT knee extension',
    kind: 'strength',
    unit: '/5',
    min: 0,
    max: 5,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Oxford scale 0–5 (half grades allowed)',
  },
  {
    id: 'mmt_hip_abduction',
    label: 'MMT hip abduction',
    kind: 'strength',
    unit: '/5',
    min: 0,
    max: 5,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Oxford scale 0–5 (half grades allowed)',
  },
  {
    id: 'grip_strength',
    label: 'Grip strength',
    kind: 'strength',
    unit: 'kg',
    min: 0,
    max: 100,
    higherIsBetter: true,
    bilateral: true,
    hint: 'Dynamometer, best of 3',
  },

  // ── Patient-reported outcome measures ──
  {
    id: 'lefs',
    label: 'LEFS',
    kind: 'outcome',
    unit: 'pts',
    min: 0,
    max: 80,
    higherIsBetter: true,
    mcid: 9,
    hint: 'Lower Extremity Functional Scale — 80 = full function',
  },
  {
    id: 'quickdash',
    label: 'QuickDASH',
    kind: 'outcome',
    unit: 'pts',
    min: 0,
    max: 100,
    higherIsBetter: false,
    mcid: 15,
    hint: 'Upper-limb disability — 0 = no disability',
  },
  {
    id: 'ndi',
    label: 'Neck Disability Index',
    kind: 'outcome',
    unit: '%',
    min: 0,
    max: 100,
    higherIsBetter: false,
    mcid: 10,
    hint: '0% = no disability',
  },
  {
    id: 'odi',
    label: 'Oswestry (ODI)',
    kind: 'outcome',
    unit: '%',
    min: 0,
    max: 100,
    higherIsBetter: false,
    mcid: 10,
    hint: 'Low-back disability — 0% = no disability',
  },
  {
    id: 'koos_jr',
    label: 'KOOS, JR.',
    kind: 'outcome',
    unit: 'pts',
    min: 0,
    max: 100,
    higherIsBetter: true,
    mcid: 14,
    hint: 'Knee injury & osteoarthritis — 100 = no symptoms',
  },

  // ── Functional / performance tests ──
  {
    id: 'tug',
    label: 'Timed Up & Go',
    kind: 'functional',
    unit: 's',
    min: 0,
    max: 120,
    higherIsBetter: false,
    mcid: 3.4,
    hint: '≥13.5s indicates elevated fall risk',
  },
  {
    id: 'five_times_sit_to_stand',
    label: '5× Sit-to-Stand',
    kind: 'functional',
    unit: 's',
    min: 0,
    max: 120,
    higherIsBetter: false,
    mcid: 2.3,
    hint: '≥12s indicates lower-limb weakness',
  },
  {
    id: 'gait_speed',
    label: 'Gait speed (10MWT)',
    kind: 'functional',
    unit: 'm/s',
    min: 0,
    max: 3,
    higherIsBetter: true,
    mcid: 0.1,
    hint: '<0.8 m/s indicates limited community ambulation',
  },
  {
    id: 'six_minute_walk',
    label: '6-Minute Walk',
    kind: 'functional',
    unit: 'm',
    min: 0,
    max: 900,
    higherIsBetter: true,
    mcid: 50,
  },
  {
    id: 'single_leg_stance',
    label: 'Single-leg stance',
    kind: 'functional',
    unit: 's',
    min: 0,
    max: 60,
    higherIsBetter: true,
    bilateral: true,
    hint: '<10s indicates elevated fall risk',
  },
];

export const MEASURE_KIND_LABELS: Record<MeasureKind, string> = {
  pain: 'Pain',
  rom: 'Range of motion',
  strength: 'Strength',
  outcome: 'Outcome measures',
  functional: 'Functional tests',
};

/** Display order for grouped views. */
export const MEASURE_KIND_ORDER: MeasureKind[] = [
  'pain',
  'rom',
  'strength',
  'outcome',
  'functional',
];

const BY_ID = new Map(MEASURE_CATALOG.map((m) => [m.id, m]));

/**
 * Look up a definition, falling back to a permissive stand-in so a Measurement
 * whose `measureId` left the catalog still renders its value instead of crashing
 * or vanishing from the chart.
 */
export function measureDef(id: string): MeasureDef {
  return (
    BY_ID.get(id) ?? {
      id,
      label: id,
      kind: 'outcome',
      unit: '',
      min: 0,
      max: 100,
      higherIsBetter: true,
    }
  );
}

import type { Exercise } from '@/types';

type Seed = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'builtin'>;

export const BUILTIN_EXERCISES: Seed[] = [
  // ── Cervical ───────────────────────────────────────────────────────────────
  {
    name: 'Chin Tucks',
    region: 'cervical',
    category: 'mobility',
    instructions: 'Sitting tall, gently retract chin straight back. Hold 5s.',
    defaultDosage: '2x10, 3x/day',
    cues: 'Imagine a string pulling top of head up; eyes stay level.',
  },
  {
    name: 'Cervical Retraction in Supine',
    region: 'cervical',
    category: 'stability',
    instructions: 'Lying on back, gently nod chin and press back of head into surface.',
    defaultDosage: '3x10, daily',
  },
  // ── Thoracic ───────────────────────────────────────────────────────────────
  {
    name: 'Thoracic Foam Roller Extension',
    region: 'thoracic',
    category: 'mobility',
    instructions: 'Foam roller perpendicular under mid-back, hands behind head, extend over roller.',
    defaultDosage: '3 sets x 30s, daily',
    cues: 'Avoid extending through the lumbar spine.',
  },
  {
    name: 'Wall Angels',
    region: 'thoracic',
    category: 'mobility',
    instructions: 'Back to wall, arms in W, slide arms up and down keeping contact.',
    defaultDosage: '2x10, daily',
  },
  // ── Lumbar / Core ──────────────────────────────────────────────────────────
  {
    name: 'Dead Bug',
    region: 'core',
    category: 'stability',
    instructions: 'Supine, opposite arm and leg lower while maintaining neutral spine.',
    defaultDosage: '3x10/side, daily',
    cues: 'Ribs down, low back flat against floor.',
  },
  {
    name: 'Bird Dog',
    region: 'core',
    category: 'stability',
    instructions: 'Quadruped, extend opposite arm and leg, hold 3s.',
    defaultDosage: '3x10/side',
  },
  {
    name: 'Glute Bridge',
    region: 'lumbar',
    category: 'strength',
    instructions: 'Supine, knees bent, drive through heels and lift hips.',
    defaultDosage: '3x12, daily',
    cues: 'Squeeze glutes; avoid arching low back.',
  },
  {
    name: 'McKenzie Press-Up',
    region: 'lumbar',
    category: 'mobility',
    instructions: 'Prone, press chest up while hips stay on floor.',
    defaultDosage: '2x10, every 2-3 hours',
  },
  // ── Shoulder ───────────────────────────────────────────────────────────────
  {
    name: 'Scapular Retraction with Band',
    region: 'shoulder',
    category: 'strength',
    instructions: 'Band anchored at chest height, pull elbows back squeezing shoulder blades.',
    defaultDosage: '3x12, daily',
  },
  {
    name: 'External Rotation at 0°',
    region: 'shoulder',
    category: 'strength',
    instructions: 'Band, elbow at side bent 90°, rotate forearm away from body.',
    defaultDosage: '3x15',
  },
  {
    name: 'Pendulums',
    region: 'shoulder',
    category: 'mobility',
    instructions: 'Lean forward supported, let arm dangle, swing in circles.',
    defaultDosage: '2 min, 3x/day',
  },
  {
    name: 'Sleeper Stretch',
    region: 'shoulder',
    category: 'mobility',
    instructions: 'Sidelying, arm 90°, gently rotate forearm toward floor.',
    defaultDosage: '3x30s',
  },
  // ── Hip ────────────────────────────────────────────────────────────────────
  {
    name: 'Clamshells',
    region: 'hip',
    category: 'strength',
    instructions: 'Sidelying, knees bent, lift top knee while keeping feet together.',
    defaultDosage: '3x15/side',
  },
  {
    name: 'Sidelying Hip Abduction',
    region: 'hip',
    category: 'strength',
    instructions: 'Sidelying, lift top leg straight up keeping pelvis stacked.',
    defaultDosage: '3x12/side',
  },
  {
    name: '90/90 Hip Switches',
    region: 'hip',
    category: 'mobility',
    instructions: 'Seated, both legs at 90°, switch sides keeping torso upright.',
    defaultDosage: '2x10',
  },
  // ── Knee ───────────────────────────────────────────────────────────────────
  {
    name: 'Quad Set',
    region: 'knee',
    category: 'strength',
    instructions: 'Long sitting, press knee into floor activating quads. Hold 5s.',
    defaultDosage: '3x10, hourly',
  },
  {
    name: 'Straight Leg Raise',
    region: 'knee',
    category: 'strength',
    instructions: 'Supine, opposite knee bent, lift straight leg to height of bent knee.',
    defaultDosage: '3x10/side',
  },
  {
    name: 'Step-Ups',
    region: 'knee',
    category: 'strength',
    instructions: 'Step up onto box leading with affected leg; control descent.',
    defaultDosage: '3x10/side',
    cues: 'Knee tracks over second toe; no valgus collapse.',
  },
  // ── Ankle / Foot ───────────────────────────────────────────────────────────
  {
    name: 'Heel Raises',
    region: 'ankle_foot',
    category: 'strength',
    instructions: 'Standing, rise onto toes, control descent.',
    defaultDosage: '3x15, daily',
  },
  {
    name: 'Ankle Alphabet',
    region: 'ankle_foot',
    category: 'mobility',
    instructions: 'Trace each letter of the alphabet with the foot.',
    defaultDosage: '1 alphabet, 3x/day',
  },
  // ── Gait / Balance ─────────────────────────────────────────────────────────
  {
    name: 'Single-Leg Balance',
    region: 'gait_balance',
    category: 'stability',
    instructions: 'Stand on one leg near support; progress eyes-closed when steady.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Tandem Walking',
    region: 'gait_balance',
    category: 'neuro',
    instructions: 'Walk heel-to-toe along a line.',
    defaultDosage: '3x20 steps',
  },
];

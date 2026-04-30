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
  {
    name: 'Cervical AROM (Flexion / Extension)',
    region: 'cervical',
    category: 'mobility',
    instructions: 'Slowly tuck chin to chest, then look up to ceiling, within pain-free range.',
    defaultDosage: '2x10, 2x/day',
  },
  {
    name: 'Cervical AROM (Rotation)',
    region: 'cervical',
    category: 'mobility',
    instructions: 'Sit tall, turn head to look over each shoulder.',
    defaultDosage: '2x10/side',
    cues: 'Keep shoulders level; lead with the chin, not the trunk.',
  },
  {
    name: 'Cervical AROM (Sidebending)',
    region: 'cervical',
    category: 'mobility',
    instructions: 'Sit tall, ear toward shoulder without lifting the shoulder.',
    defaultDosage: '2x10/side',
  },
  {
    name: 'Upper Trapezius Stretch',
    region: 'cervical',
    category: 'mobility',
    instructions:
      'Sit on hand of side being stretched; tilt opposite ear toward shoulder, light overpressure with free hand.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Levator Scapulae Stretch',
    region: 'cervical',
    category: 'mobility',
    instructions:
      'Look down toward armpit on opposite side; gentle overpressure with hand on back of head.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Deep Neck Flexor Activation',
    region: 'cervical',
    category: 'stability',
    instructions:
      'Supine with small towel roll under neck. Subtle nod (chin tuck) without lifting head; hold 10s.',
    defaultDosage: '10 reps x 10s, daily',
    cues: 'Motion is small — nod only, no head lift.',
  },
  {
    name: 'Cervical Isometrics (Multi-Direction)',
    region: 'cervical',
    category: 'strength',
    instructions:
      'Press head gently into hand in flexion, extension, sidebending, and rotation; no movement occurs.',
    defaultDosage: '5s hold x 5 reps each direction',
  },
  // ── Thoracic ───────────────────────────────────────────────────────────────
  {
    name: 'Thoracic Foam Roller Extension',
    region: 'thoracic',
    category: 'mobility',
    instructions:
      'Foam roller perpendicular under mid-back, hands behind head, extend over roller.',
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
  {
    name: 'Open Books',
    region: 'thoracic',
    category: 'mobility',
    instructions:
      'Sidelying with knees bent and stacked, arms extended together. Rotate top arm open, following hand with eyes.',
    defaultDosage: '2x10/side',
    cues: 'Keep knees stacked; let breath drive end-range rotation.',
  },
  {
    name: 'Thread the Needle',
    region: 'thoracic',
    category: 'mobility',
    instructions:
      'Quadruped, slide one arm under and across the body, lowering shoulder toward floor.',
    defaultDosage: '2x10/side',
  },
  {
    name: 'Cat-Camel',
    region: 'thoracic',
    category: 'mobility',
    instructions:
      'Quadruped, alternate rounding and arching the spine through full pain-free range.',
    defaultDosage: '2x10, daily',
  },
  {
    name: 'Prone Y / T / W / I',
    region: 'thoracic',
    category: 'strength',
    instructions:
      'Prone on bench or floor, perform scapular retraction in Y, T, W, and I positions.',
    defaultDosage: '2x10 each position',
    cues: 'Initiate from scapula, not arms; thumbs up in Y and T.',
  },
  {
    name: 'Thoracic Extension Over Bench',
    region: 'thoracic',
    category: 'mobility',
    instructions: 'Seated with mid-back against bench edge, hands behind head, extend over bench.',
    defaultDosage: '3x10, daily',
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
    name: 'Front Plank',
    region: 'core',
    category: 'stability',
    instructions: 'Forearms and toes (or knees), body in straight line from heels to head.',
    defaultDosage: '3x30-60s',
    cues: 'No hip sag or pike; brace abdominals throughout.',
  },
  {
    name: 'Pallof Press',
    region: 'core',
    category: 'stability',
    instructions:
      'Anchor band at chest height, stand perpendicular, press band straight out and resist rotation.',
    defaultDosage: '3x10/side',
  },
  {
    name: 'Hollow Hold',
    region: 'core',
    category: 'stability',
    instructions:
      'Supine, low back pressed into floor, arms overhead and legs lifted in shallow dish position.',
    defaultDosage: '3x20-30s',
  },
  {
    name: 'Supine Marching',
    region: 'core',
    category: 'stability',
    instructions:
      'Supine, knees bent, alternate lifting one foot off floor while maintaining neutral spine.',
    defaultDosage: '3x10/side, daily',
  },
  {
    name: 'Bear Crawl Hold',
    region: 'core',
    category: 'stability',
    instructions: 'Quadruped, lift knees ~1 inch off floor and hold neutral spine.',
    defaultDosage: '3x20-30s',
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
  {
    name: 'Posterior Pelvic Tilt',
    region: 'lumbar',
    category: 'stability',
    instructions: 'Supine, knees bent, flatten low back into floor by tilting pelvis. Hold 5s.',
    defaultDosage: '3x10, daily',
  },
  {
    name: 'Single Knee to Chest',
    region: 'lumbar',
    category: 'mobility',
    instructions: 'Supine, draw one knee toward chest with both hands; opposite leg stays bent.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Double Knee to Chest',
    region: 'lumbar',
    category: 'mobility',
    instructions: 'Supine, draw both knees toward chest, hold gently.',
    defaultDosage: '3x30s',
  },
  {
    name: 'Lower Trunk Rotation',
    region: 'lumbar',
    category: 'mobility',
    instructions:
      'Supine, knees bent and together, lower knees side to side within pain-free range.',
    defaultDosage: '2x10/side',
  },
  {
    name: 'Side Plank',
    region: 'lumbar',
    category: 'stability',
    instructions:
      'Forearm and knees (or feet) supporting, lift hips so body forms a straight line.',
    defaultDosage: '3x20-30s/side',
    cues: 'No hip sag; ribs stacked over pelvis.',
  },
  {
    name: 'Prone Hip Extension',
    region: 'lumbar',
    category: 'strength',
    instructions: 'Prone with pillow under hips. Lift one straight leg, leading from glute.',
    defaultDosage: '3x10/side',
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
  {
    name: 'Internal Rotation at 0° with Band',
    region: 'shoulder',
    category: 'strength',
    instructions:
      'Band anchored at elbow height, elbow at side bent 90°, rotate forearm across body.',
    defaultDosage: '3x15',
  },
  {
    name: 'External Rotation at 90° Abduction',
    region: 'shoulder',
    category: 'strength',
    instructions:
      'Shoulder abducted 90°, elbow bent 90° supported on table or in 90/90 position. Rotate forearm up against resistance.',
    defaultDosage: '3x12',
  },
  {
    name: 'Prone Y',
    region: 'shoulder',
    category: 'strength',
    instructions: 'Prone on bench, arms in Y overhead, thumbs up, lift arms toward ceiling.',
    defaultDosage: '3x10',
    cues: 'Lead with scapula; do not shrug.',
  },
  {
    name: 'Prone T',
    region: 'shoulder',
    category: 'strength',
    instructions: 'Prone, arms straight out to sides forming a T, thumbs up, lift toward ceiling.',
    defaultDosage: '3x10',
  },
  {
    name: 'Full Can',
    region: 'shoulder',
    category: 'strength',
    instructions:
      'Standing, thumbs up, raise arms in scapular plane (~30° forward of frontal) to shoulder height.',
    defaultDosage: '3x12',
  },
  {
    name: 'Cross-Body Posterior Capsule Stretch',
    region: 'shoulder',
    category: 'mobility',
    instructions:
      'Bring affected arm across chest, opposite hand applies gentle overpressure above elbow.',
    defaultDosage: '3x30s',
  },
  {
    name: 'Doorway Pec Stretch',
    region: 'shoulder',
    category: 'mobility',
    instructions: 'Forearm on doorframe, elbow at shoulder height, step forward to stretch chest.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Shoulder Flexion AAROM with Cane',
    region: 'shoulder',
    category: 'mobility',
    instructions:
      'Supine, hold cane in both hands, use unaffected arm to assist affected arm overhead.',
    defaultDosage: '2x10',
  },
  {
    name: 'Wall Slides',
    region: 'shoulder',
    category: 'mobility',
    instructions:
      'Forearms on wall in W position, slide arms up and overhead while maintaining wall contact.',
    defaultDosage: '3x10',
    cues: 'Avoid arching low back or shrugging.',
  },
  {
    name: 'Scapular Wall Push-Up',
    region: 'shoulder',
    category: 'strength',
    instructions:
      'Hands on wall in push-up start. Without bending elbows, protract and retract scapulae.',
    defaultDosage: '3x12',
  },
  // ── Elbow ──────────────────────────────────────────────────────────────────
  {
    name: 'Elbow AROM (Flexion / Extension)',
    region: 'elbow',
    category: 'mobility',
    instructions: 'Seated, fully bend and straighten elbow within pain-free range.',
    defaultDosage: '2x10, 3x/day',
  },
  {
    name: 'Forearm Pronation / Supination',
    region: 'elbow',
    category: 'mobility',
    instructions: 'Elbow at side bent 90°, rotate palm up and palm down.',
    defaultDosage: '2x10',
  },
  {
    name: 'Wrist Extensor Stretch',
    region: 'elbow',
    category: 'mobility',
    instructions: 'Arm straight, palm down, gently pull fingers down and toward body.',
    defaultDosage: '3x30s',
    cues: 'Common adjunct for lateral epicondylalgia.',
  },
  {
    name: 'Wrist Flexor Stretch',
    region: 'elbow',
    category: 'mobility',
    instructions: 'Arm straight, palm up, gently pull fingers down and back toward body.',
    defaultDosage: '3x30s',
  },
  {
    name: 'Eccentric Wrist Extension',
    region: 'elbow',
    category: 'strength',
    instructions:
      'Forearm supported, palm down with light weight or resistance device. Use other hand to assist into extension, then slowly lower (3-4s) into flexion.',
    defaultDosage: '3x15, daily',
    cues: 'Slow eccentric phase is the loading dose.',
  },
  {
    name: 'Biceps Curl',
    region: 'elbow',
    category: 'strength',
    instructions: 'Standing or seated with light weight, curl from full extension to flexion.',
    defaultDosage: '3x12',
  },
  {
    name: 'Triceps Extension',
    region: 'elbow',
    category: 'strength',
    instructions:
      'Light weight or band overhead, bend and straighten elbow keeping upper arm vertical.',
    defaultDosage: '3x12',
  },

  // ── Wrist / Hand ───────────────────────────────────────────────────────────
  {
    name: 'Wrist AROM (All Planes)',
    region: 'wrist_hand',
    category: 'mobility',
    instructions:
      'Forearm supported. Move wrist through flexion/extension, radial/ulnar deviation, and circumduction.',
    defaultDosage: '2x10 each direction, 3x/day',
  },
  {
    name: 'Tendon Glides',
    region: 'wrist_hand',
    category: 'mobility',
    instructions:
      'Cycle through five hand positions: straight, hook fist, full fist, table-top, straight fist.',
    defaultDosage: '2x10 cycles, 3x/day',
  },
  {
    name: 'Grip Strengthening',
    region: 'wrist_hand',
    category: 'strength',
    instructions: 'Squeeze putty or stress ball to fatigue.',
    defaultDosage: '3x10-15',
  },
  {
    name: 'Thumb Opposition',
    region: 'wrist_hand',
    category: 'mobility',
    instructions: 'Touch thumb to tip of each finger sequentially.',
    defaultDosage: '2x10 cycles, daily',
  },
  {
    name: 'Finger Abduction / Adduction',
    region: 'wrist_hand',
    category: 'strength',
    instructions:
      'Spread fingers apart and bring together; can use rubber band around fingers for resistance.',
    defaultDosage: '3x15',
  },
  {
    name: 'Wrist Flexion Strengthening',
    region: 'wrist_hand',
    category: 'strength',
    instructions: 'Forearm supported palm up with light weight; curl wrist up against gravity.',
    defaultDosage: '3x15',
  },
  {
    name: 'Wrist Extension Strengthening',
    region: 'wrist_hand',
    category: 'strength',
    instructions:
      'Forearm supported palm down with light weight; lift back of hand against gravity.',
    defaultDosage: '3x15',
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
  {
    name: 'Single-Leg Bridge',
    region: 'hip',
    category: 'strength',
    instructions:
      'Supine, one knee bent, opposite leg extended. Drive through heel and lift hips, keeping pelvis level.',
    defaultDosage: '3x10/side',
  },
  {
    name: 'Monster Walks',
    region: 'hip',
    category: 'strength',
    instructions:
      'Mini band around knees or ankles, athletic stance, step laterally and forward/back maintaining tension.',
    defaultDosage: '3x10 steps each direction',
  },
  {
    name: 'Pelvic Drop (Hip Hike)',
    region: 'hip',
    category: 'strength',
    instructions:
      'Stand on a step with one foot off the edge. Drop opposite pelvis down, then lift up using stance-leg glute med.',
    defaultDosage: '3x10/side',
    cues: 'Motion comes from pelvis, not knee bend.',
  },
  {
    name: 'Half-Kneeling Hip Flexor Stretch',
    region: 'hip',
    category: 'mobility',
    instructions: 'Half-kneel position, tuck pelvis under, gently shift weight forward.',
    defaultDosage: '3x30s/side',
    cues: 'Posterior pelvic tilt before lunging forward.',
  },
  {
    name: 'Figure-4 Piriformis Stretch',
    region: 'hip',
    category: 'mobility',
    instructions:
      'Supine, ankle of affected leg crossed over opposite knee, pull opposite thigh toward chest.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Standing Hip Abduction',
    region: 'hip',
    category: 'strength',
    instructions:
      'Stand near support, lift one leg out to the side keeping knee straight and pelvis level.',
    defaultDosage: '3x12/side',
  },
  {
    name: 'Fire Hydrants',
    region: 'hip',
    category: 'strength',
    instructions: 'Quadruped, lift one bent knee out to the side without rotating trunk.',
    defaultDosage: '3x12/side',
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
  {
    name: 'Terminal Knee Extension (TKE)',
    region: 'knee',
    category: 'strength',
    instructions:
      'Band anchored behind knee, slight knee bend in stance. Press knee back into full extension against band.',
    defaultDosage: '3x15',
  },
  {
    name: 'Wall Sit',
    region: 'knee',
    category: 'strength',
    instructions: 'Back against wall, slide down to ~60-90° knee flexion, hold.',
    defaultDosage: '3x30-60s',
  },
  {
    name: 'Lateral Step-Down',
    region: 'knee',
    category: 'strength',
    instructions:
      'Stand on edge of step on one leg. Slowly lower opposite heel to floor with control, then return.',
    defaultDosage: '3x10/side',
    cues: 'Pelvis level; knee tracks over toes.',
  },
  {
    name: 'Mini Squat',
    region: 'knee',
    category: 'strength',
    instructions: 'Feet shoulder-width, squat to ~30-45° knee flexion with neutral spine.',
    defaultDosage: '3x12',
  },
  {
    name: 'Hamstring Curl (Prone or Standing)',
    region: 'knee',
    category: 'strength',
    instructions:
      'Prone with ankle weight or standing with band, bend knee to bring heel toward glute.',
    defaultDosage: '3x12/side',
  },
  {
    name: 'Forward Lunge',
    region: 'knee',
    category: 'strength',
    instructions:
      'Step forward into lunge, lower back knee toward floor, push off front leg to return.',
    defaultDosage: '3x10/side',
  },
  {
    name: 'Reverse Lunge',
    region: 'knee',
    category: 'strength',
    instructions:
      'Step backward into lunge, lower back knee toward floor, push off front leg to return.',
    defaultDosage: '3x10/side',
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
  {
    name: 'Ankle Eversion with Band',
    region: 'ankle_foot',
    category: 'strength',
    instructions:
      'Long sitting, band around forefoot anchored medially. Turn sole outward against resistance.',
    defaultDosage: '3x15',
  },
  {
    name: 'Ankle Inversion with Band',
    region: 'ankle_foot',
    category: 'strength',
    instructions:
      'Long sitting, band around forefoot anchored laterally. Turn sole inward against resistance.',
    defaultDosage: '3x15',
  },
  {
    name: 'Ankle Dorsiflexion with Band',
    region: 'ankle_foot',
    category: 'strength',
    instructions:
      'Long sitting, band around forefoot anchored away from body. Pull foot toward shin against resistance.',
    defaultDosage: '3x15',
  },
  {
    name: 'Gastrocnemius Stretch',
    region: 'ankle_foot',
    category: 'mobility',
    instructions:
      'Stand facing wall, affected leg back with knee straight, heel down. Lean forward.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Soleus Stretch',
    region: 'ankle_foot',
    category: 'mobility',
    instructions: 'Same setup as gastroc stretch but bend the back knee while keeping heel down.',
    defaultDosage: '3x30s/side',
  },
  {
    name: 'Single-Leg Heel Raise',
    region: 'ankle_foot',
    category: 'strength',
    instructions: 'Stand on one leg near support; rise onto toes, control 3s descent.',
    defaultDosage: '3x10-15/side',
  },
  {
    name: 'Towel Scrunches',
    region: 'ankle_foot',
    category: 'strength',
    instructions: 'Seated with towel under foot. Use toes to scrunch the towel toward you.',
    defaultDosage: '3x30s, daily',
  },
  {
    name: 'Knee-to-Wall Dorsiflexion',
    region: 'ankle_foot',
    category: 'mobility',
    instructions: 'Stand a few inches from wall, drive knee forward toward wall keeping heel down.',
    defaultDosage: '3x10/side',
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
  {
    name: 'Sit-to-Stand',
    region: 'gait_balance',
    category: 'strength',
    instructions: 'From standard chair, stand up and sit down with control, ideally without arms.',
    defaultDosage: '3x10, daily',
    cues: 'Drive through heels; nose over toes on stand.',
  },
  {
    name: 'Standing Weight Shifts',
    region: 'gait_balance',
    category: 'stability',
    instructions:
      'Stand with feet shoulder-width, shift weight side to side, then forward and back.',
    defaultDosage: '3x10 each direction',
  },
  {
    name: 'Y-Balance Reach',
    region: 'gait_balance',
    category: 'stability',
    instructions:
      'Stand on one leg, reach opposite foot anterior, posteromedial, and posterolateral, returning to center between reaches.',
    defaultDosage: '3x5/direction/side',
  },
  {
    name: 'Marching in Place',
    region: 'gait_balance',
    category: 'neuro',
    instructions:
      'Stand near support, lift knees alternately to hip height with controlled cadence.',
    defaultDosage: '3x30s, daily',
  },
  {
    name: 'Lateral Walking',
    region: 'gait_balance',
    category: 'neuro',
    instructions:
      'Step sideways with control, leading with same foot for set distance, then reverse.',
    defaultDosage: '3x20 steps each direction',
  },
  {
    name: 'Heel Walking',
    region: 'gait_balance',
    category: 'neuro',
    instructions: 'Walk on heels with toes lifted off the floor.',
    defaultDosage: '3x20 steps',
  },
  {
    name: 'Toe Walking',
    region: 'gait_balance',
    category: 'neuro',
    instructions: 'Walk on toes with heels lifted off the floor.',
    defaultDosage: '3x20 steps',
  },
  {
    name: 'Stance Progression (Eyes Open → Eyes Closed)',
    region: 'gait_balance',
    category: 'stability',
    instructions:
      'Progress through narrow → semi-tandem → tandem → single-leg, first eyes open then eyes closed near a stable surface.',
    defaultDosage: '3x30s per stance',
  },
  {
    name: 'Foam Surface Standing',
    region: 'gait_balance',
    category: 'stability',
    instructions: 'Stand on foam pad with progression of stance widths and visual conditions.',
    defaultDosage: '3x30-60s',
  },
];

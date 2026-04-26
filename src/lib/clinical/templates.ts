import type { NoteTemplate } from '@/types';

type Seed = Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt' | 'builtin'>;

const SOAP_PROMPT = `You are a physical therapist's clinical scribe. Given a session transcript and patient context, produce a SOAP-format progress note.

Output JSON ONLY, with this exact shape:
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}

Rules:
- Subjective: patient-reported symptoms, pain levels, function changes since last visit. Use the patient's voice when quoted.
- Objective: measured findings — ROM, MMT, special tests, gait, posture, interventions performed today (modalities, manual techniques, exercises).
- Assessment: clinical reasoning, progress toward goals, response to treatment, prognosis.
- Plan: next visit focus, HEP changes, frequency/duration, any referrals or precautions.
- Use therapist-style shorthand where appropriate (R/L, AROM, PROM, MMT 4/5, etc.) but keep prose readable.
- Do not invent measurements that are not in the transcript.
- If a section has no data, write a brief honest sentence (e.g. "No new objective measurements taken this visit.").`;

const EVAL_PROMPT = `You are a physical therapist's clinical scribe. Given a session transcript and patient context, produce an Initial Evaluation note.

Output JSON ONLY, with this exact shape:
{
  "history": "...",
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "...",
  "goals": "..."
}

Rules:
- History: mechanism of injury, prior episodes, surgeries, imaging, relevant medical history, medications, work/sport demands.
- Subjective: chief complaint, pain (location/quality/intensity/aggravating/easing factors), functional limitations, patient goals.
- Objective: posture, observation, AROM/PROM, MMT, special tests, palpation, neuro screen, functional movement.
- Assessment: PT diagnosis, ICD-10 if mentioned, clinical impressions, prognosis, rehab potential.
- Plan: frequency × duration, interventions planned (manual therapy, neuro re-ed, therapeutic exercise, modalities), HEP, expected outcomes.
- Goals: 2-4 measurable short-term goals (2-4 weeks) and long-term goals (8-12 weeks). Use SMART format.
- Do not invent findings not in the transcript.`;

const PROGRESS_PROMPT = `You are a physical therapist's clinical scribe. Given a session transcript and patient context, produce a Progress Note for the chart.

Output JSON ONLY, with this exact shape:
{
  "interval_history": "...",
  "objective": "...",
  "progress_toward_goals": "...",
  "plan": "..."
}

Rules:
- Interval history: changes since last visit / re-eval, current symptoms, function changes.
- Objective: re-measured ROM/MMT/tests where applicable, current interventions.
- Progress toward goals: state each goal and whether met / progressing / no change / regressed.
- Plan: continue, modify, or progress the program; any updated frequency or discharge planning.`;

const DISCHARGE_PROMPT = `You are a physical therapist's clinical scribe. Given a session transcript and patient context, produce a Discharge Summary.

Output JSON ONLY, with this exact shape:
{
  "reason_for_discharge": "...",
  "outcome_summary": "...",
  "final_status": "...",
  "home_program": "...",
  "recommendations": "..."
}

Rules:
- Reason for discharge: goals met, plateau, self-discharge, referral, etc.
- Outcome summary: ROM/strength/function gains vs initial eval.
- Final status: independence with HEP, return to work / sport / prior level of function.
- Home program: exercises being continued and dosing.
- Recommendations: when to return to PT, MD follow-up, activity precautions.`;

export const BUILTIN_TEMPLATES: Seed[] = [
  {
    name: 'SOAP — Follow-up',
    format: 'soap',
    sections: [
      { key: 'subjective', label: 'Subjective', promptHint: 'Patient report' },
      { key: 'objective', label: 'Objective', promptHint: 'Measurements & interventions' },
      { key: 'assessment', label: 'Assessment', promptHint: 'Clinical reasoning' },
      { key: 'plan', label: 'Plan', promptHint: 'Next steps' },
    ],
    systemPrompt: SOAP_PROMPT,
  },
  {
    name: 'Initial Evaluation',
    format: 'evaluation',
    sections: [
      { key: 'history', label: 'History' },
      { key: 'subjective', label: 'Subjective' },
      { key: 'objective', label: 'Objective' },
      { key: 'assessment', label: 'Assessment' },
      { key: 'plan', label: 'Plan' },
      { key: 'goals', label: 'Goals' },
    ],
    systemPrompt: EVAL_PROMPT,
  },
  {
    name: 'Progress Note',
    format: 'progress',
    sections: [
      { key: 'interval_history', label: 'Interval history' },
      { key: 'objective', label: 'Objective' },
      { key: 'progress_toward_goals', label: 'Progress toward goals' },
      { key: 'plan', label: 'Plan' },
    ],
    systemPrompt: PROGRESS_PROMPT,
  },
  {
    name: 'Discharge Summary',
    format: 'discharge',
    sections: [
      { key: 'reason_for_discharge', label: 'Reason for discharge' },
      { key: 'outcome_summary', label: 'Outcome summary' },
      { key: 'final_status', label: 'Final status' },
      { key: 'home_program', label: 'Home program' },
      { key: 'recommendations', label: 'Recommendations' },
    ],
    systemPrompt: DISCHARGE_PROMPT,
  },
];

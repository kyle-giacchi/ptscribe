export type PlanTier = 'demo' | 'starter' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxPatients: number;
  maxSessionsPerMonth: number;
  maxStorageGb: number;
  transcriptionMinutesPerMonth: number;
  aiGenerationsPerMonth: number;
  teamMembers: number;
}

// -1 means unlimited
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  demo: {
    maxPatients: 10,
    maxSessionsPerMonth: 20,
    maxStorageGb: 1,
    transcriptionMinutesPerMonth: 60,
    aiGenerationsPerMonth: 30,
    teamMembers: 1,
  },
  starter: {
    maxPatients: 50,
    maxSessionsPerMonth: 100,
    maxStorageGb: 5,
    transcriptionMinutesPerMonth: 300,
    aiGenerationsPerMonth: 200,
    teamMembers: 1,
  },
  pro: {
    maxPatients: -1,
    maxSessionsPerMonth: -1,
    maxStorageGb: 25,
    transcriptionMinutesPerMonth: -1,
    aiGenerationsPerMonth: -1,
    teamMembers: 5,
  },
  enterprise: {
    maxPatients: -1,
    maxSessionsPerMonth: -1,
    maxStorageGb: -1,
    transcriptionMinutesPerMonth: -1,
    aiGenerationsPerMonth: -1,
    teamMembers: -1,
  },
};

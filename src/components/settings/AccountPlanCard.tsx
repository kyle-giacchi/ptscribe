import { Field, Select } from '@/components/ui/Field';
import { Eyebrow, SurfaceCard } from '@/components/design';
import { useSettings } from '@/contexts/SettingsProvider';
import { usePlan } from '@/hooks/usePlan';
import type { PlanTier } from '@/types/plans';

const TIER_LABELS: Record<PlanTier, string> = {
  demo: 'Demo',
  'personal-free': 'Personal · Free',
  'personal-premium': 'Personal · Premium',
  'enterprise-free': 'Enterprise · Free',
  'enterprise-premium': 'Enterprise · Premium',
};

const TIER_DESCRIPTIONS: Record<PlanTier, string> = {
  demo: 'Limited access for evaluation. Upgrade to unlock full features.',
  'personal-free': 'Solo clinician plan with generous monthly limits.',
  'personal-premium': 'Unlimited patients, sessions, and AI generations for individual clinicians.',
  'enterprise-free': 'Team plan with high monthly limits across up to 10 members.',
  'enterprise-premium': 'Unlimited everything for large teams and enterprise practices.',
};

const TIER_STYLE: Record<PlanTier, { bg: string; fg: string; border: string }> = {
  demo: { bg: '#fef9c3', fg: '#92400e', border: '#fde68a' },
  'personal-free': {
    bg: 'var(--color-pt-surface-mut)',
    fg: 'var(--color-pt-text-2)',
    border: 'var(--color-pt-border)',
  },
  'personal-premium': { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  'enterprise-free': { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  'enterprise-premium': { bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' },
};

const TIMEZONE_GROUPS = [
  {
    label: 'United States',
    zones: [
      { label: 'Eastern Time (New York)', value: 'America/New_York' },
      { label: 'Central Time (Chicago)', value: 'America/Chicago' },
      { label: 'Mountain Time (Denver)', value: 'America/Denver' },
      { label: 'Mountain Time – Arizona (no DST)', value: 'America/Phoenix' },
      { label: 'Pacific Time (Los Angeles)', value: 'America/Los_Angeles' },
      { label: 'Alaska Time', value: 'America/Anchorage' },
      { label: 'Hawaii Time', value: 'Pacific/Honolulu' },
    ],
  },
  {
    label: 'Canada',
    zones: [
      { label: 'Atlantic Time (Halifax)', value: 'America/Halifax' },
      { label: 'Eastern Time (Toronto)', value: 'America/Toronto' },
      { label: 'Central Time (Winnipeg)', value: 'America/Winnipeg' },
      { label: 'Mountain Time (Edmonton)', value: 'America/Edmonton' },
      { label: 'Pacific Time (Vancouver)', value: 'America/Vancouver' },
    ],
  },
  {
    label: 'Europe',
    zones: [
      { label: 'London (GMT/BST)', value: 'Europe/London' },
      { label: 'Paris / Berlin / Rome (CET)', value: 'Europe/Paris' },
      { label: 'Helsinki / Kyiv (EET)', value: 'Europe/Helsinki' },
      { label: 'Moscow (MSK)', value: 'Europe/Moscow' },
    ],
  },
  {
    label: 'Asia & Pacific',
    zones: [
      { label: 'Dubai (GST)', value: 'Asia/Dubai' },
      { label: 'India (IST)', value: 'Asia/Kolkata' },
      { label: 'Singapore / Kuala Lumpur (SGT)', value: 'Asia/Singapore' },
      { label: 'China / Hong Kong (CST)', value: 'Asia/Shanghai' },
      { label: 'Japan / Korea (JST)', value: 'Asia/Tokyo' },
      { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
      { label: 'Auckland (NZST)', value: 'Pacific/Auckland' },
    ],
  },
  {
    label: 'South America',
    zones: [
      { label: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
      { label: 'Buenos Aires (ART)', value: 'America/Argentina/Buenos_Aires' },
    ],
  },
  {
    label: 'Africa',
    zones: [
      { label: 'Cairo (EET)', value: 'Africa/Cairo' },
      { label: 'Lagos / West Africa (WAT)', value: 'Africa/Lagos' },
      { label: 'Johannesburg (SAST)', value: 'Africa/Johannesburg' },
    ],
  },
  {
    label: 'UTC',
    zones: [{ label: 'UTC', value: 'UTC' }],
  },
];

export function AccountPlanCard() {
  const { settings, updateUi } = useSettings();
  const { tier } = usePlan();
  const tierStyle = TIER_STYLE[tier];
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <SurfaceCard padding={18}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Eyebrow>Plan &amp; locale</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: tierStyle.bg,
              color: tierStyle.fg,
              border: `1px solid ${tierStyle.border}`,
            }}
          >
            {TIER_LABELS[tier]}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>
            {TIER_DESCRIPTIONS[tier]}
          </span>
        </div>
        <div style={{ maxWidth: 360 }}>
          <Field
            label="Display time zone"
            hint="Controls how session dates and times are shown throughout the app."
          >
            <Select
              value={settings.ui.timezone ?? ''}
              onChange={(e) => updateUi({ timezone: e.target.value || undefined })}
            >
              <option value="">Browser default ({browserTz})</option>
              {TIMEZONE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </SurfaceCard>
  );
}

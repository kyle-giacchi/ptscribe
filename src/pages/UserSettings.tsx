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

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-pt-surface)',
  border: '1px solid var(--color-pt-border)',
  borderRadius: 12,
  padding: '20px 20px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-pt-text)',
  marginBottom: 4,
};

const DESC_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-pt-text-3)',
  marginBottom: 12,
};

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 7,
  border: '1px solid var(--color-pt-border)',
  background: 'var(--color-pt-surface)',
  color: 'var(--color-pt-text)',
  cursor: 'pointer',
  outline: 'none',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--color-pt-text-3)',
        marginBottom: 8,
      }}
    >
      {children}
    </h2>
  );
}

interface RadioCardProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}

function RadioCard({ selected, onClick, title, description }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 8,
        border: `1.5px solid ${selected ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
        background: selected ? 'var(--color-pt-accent-soft)' : 'var(--color-pt-surface)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <span
        style={{
          marginTop: 2,
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: `1.5px solid ${selected ? 'var(--color-pt-accent-border)' : 'var(--color-pt-border)'}`,
          background: selected ? 'var(--color-pt-accent-fg)' : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--color-pt-surface)',
              display: 'block',
            }}
          />
        )}
      </span>
      <span>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: selected ? 'var(--color-pt-accent-fg)' : 'var(--color-pt-text)',
            marginBottom: 2,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-pt-text-3)' }}>{description}</span>
      </span>
    </button>
  );
}

export function UserSettings() {
  const { settings, updateUi, updateSession } = useSettings();
  const { tier } = usePlan();

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tierStyle = TIER_STYLE[tier];
  const webSpeechEnabled = settings.session.webSpeechEnabled;

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '24px 16px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Plan tier */}
      <div>
        <SectionHeading>Plan</SectionHeading>
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-pt-text-2)', margin: 0 }}>
            {TIER_DESCRIPTIONS[tier]}
          </p>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <SectionHeading>Time Zone</SectionHeading>
        <div style={CARD_STYLE}>
          <p style={LABEL_STYLE}>Display time zone</p>
          <p style={DESC_STYLE}>
            Controls how session dates and times are shown throughout the app.
          </p>
          <select
            style={SELECT_STYLE}
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
          </select>
        </div>
      </div>

      {/* Live transcription provider */}
      <div>
        <SectionHeading>Live Transcription</SectionHeading>
        <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...LABEL_STYLE, marginBottom: 2 }}>Transcription source</p>
          <p style={DESC_STYLE}>
            How the live preview transcript is generated while you record. Takes effect on the next
            recording.
          </p>
          <RadioCard
            selected={!webSpeechEnabled}
            onClick={() => updateSession({ webSpeechEnabled: false })}
            title="Local PC Processing"
            description="Whisper AI runs in your browser — segments arrive after each natural pause. Works offline, no extra API calls."
          />
          <RadioCard
            selected={webSpeechEnabled}
            onClick={() => updateSession({ webSpeechEnabled: true })}
            title="Google Web Speech"
            description="Uses your browser's built-in speech recognition for word-by-word captions. Requires an internet connection; accuracy varies by browser."
          />
        </div>
      </div>
    </div>
  );
}

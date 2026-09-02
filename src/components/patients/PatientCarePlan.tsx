import { Eyebrow, PtButton, SurfaceCard } from '@/components/design';
import { PlanEditor } from '@/components/patients/PlanEditor';
import { fmtIsoDateOptional, parseIsoDate } from '@/utils/dates';
import type { Exercise, PlanOfCare } from '@/types';

/**
 * Plan of care — episode dates, goals, and the home exercise program.
 *
 * This used to be one card buried at the bottom of Overview. It gets its own tab
 * because it is the thing a clinician reviews at every visit and the thing a payer
 * asks for: goals with target dates and an expected discharge.
 */
export function PatientCarePlan({
  plan,
  exercises,
  onStartPlan,
  onUpdatePlan,
}: {
  plan: PlanOfCare | undefined;
  exercises: Exercise[];
  onStartPlan: () => void;
  onUpdatePlan: (patch: Partial<PlanOfCare>) => void;
}) {
  if (!plan) {
    return (
      <SurfaceCard padding={40} style={{ maxWidth: 980, textAlign: 'center' }}>
        <div
          style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-pt-text-2)' }}
        >
          No active plan of care
        </div>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-pt-text-3)',
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          Start one to set goals, target dates, and a home exercise program.
        </div>
        <PtButton variant="primary" onClick={onStartPlan}>
          Start plan of care
        </PtButton>
      </SurfaceCard>
    );
  }

  const met = plan.goals.filter((g) => g.met).length;
  const pct = plan.goals.length ? Math.round((met / plan.goals.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 980, display: 'grid', gap: 16 }}>
      <SurfaceCard padding="16px 18px">
        <Eyebrow>Episode</Eyebrow>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 18,
            alignItems: 'end',
          }}
        >
          <DateField
            label="Start of care"
            value={fmtIsoDateOptional(plan.startDate)}
            onChange={(iso) => {
              const ts = parseIsoDate(iso);
              if (ts !== undefined) onUpdatePlan({ startDate: ts });
            }}
          />
          <DateField
            label="Expected discharge"
            value={fmtIsoDateOptional(plan.expectedDischargeDate)}
            onChange={(iso) => onUpdatePlan({ expectedDischargeDate: parseIsoDate(iso) })}
          />
          <div>
            <FieldLabel>Goals met</FieldLabel>
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--color-pt-surface-mut)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--color-pt-accent)',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-pt-text-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {met}/{plan.goals.length}
              </span>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard padding="16px 18px">
        <Eyebrow>Goals &amp; home exercise program</Eyebrow>
        <PlanEditor plan={plan} exercises={exercises} onChange={onUpdatePlan} />
      </SurfaceCard>

      <SurfaceCard padding="16px 18px">
        <Eyebrow>Plan status</Eyebrow>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-pt-text-2)', margin: 0 }}>
            {plan.active
              ? 'This plan is active. Close it when the patient is discharged — the record stays, it just stops showing as the current plan.'
              : 'This plan is closed. Reopening makes it the active plan again.'}
          </p>
          <PtButton
            variant={plan.active ? 'ghost' : 'accent-soft'}
            onClick={() => onUpdatePlan({ active: !plan.active })}
          >
            {plan.active ? 'Close plan' : 'Reopen plan'}
          </PtButton>
        </div>
      </SurfaceCard>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-pt-text-2)',
      }}
    >
      {children}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 6,
          width: '100%',
          background: 'var(--color-pt-surface)',
          border: '1px solid var(--color-pt-border)',
          borderRadius: 8,
          padding: '7px 10px',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-pt-text)',
        }}
      />
    </div>
  );
}

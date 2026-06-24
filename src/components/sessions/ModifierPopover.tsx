import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { newId } from '@/utils/ids';
import type {
  SessionModifiers,
  CustomInstruction,
  ModifierVoice,
  ModifierLength,
  ModifierLanguage,
  ModifierClinicalDetail,
  ModifierCodingBilling,
  ModifierBeyondNote,
} from '@/types';

interface ModifierPopoverProps {
  modifiers: SessionModifiers;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onApply: (next: SessionModifiers) => void;
}

const SAGE = '#5e7e62';
const SAGE_TINT = 'rgba(212,223,207,0.4)';
const SAGE_BORDER = 'rgba(94,126,98,0.35)';
const SAGE_BG_BLOCK = 'rgba(212,223,207,0.12)';

interface PresetGroupDef {
  label: string;
  field: string;
  type: 'radio' | 'checkbox';
  options: { value: string; name: string; desc: string }[];
}

const PRESET_GROUPS: PresetGroupDef[] = [
  {
    label: 'Voice',
    field: 'voice',
    type: 'radio',
    options: [
      { value: '1st_person', name: '1st person', desc: '"I noted…"' },
      { value: '2nd_person', name: '2nd person', desc: '"You reported…"' },
      { value: '3rd_person', name: '3rd person', desc: '"Patient reports…"' },
    ],
  },
  {
    label: 'Length',
    field: 'length',
    type: 'radio',
    options: [
      { value: 'concise', name: 'Concise', desc: 'Tight clinical prose' },
      { value: 'balanced', name: 'Balanced', desc: 'Default length' },
      { value: 'detailed', name: 'Detailed', desc: 'HPI in full sentences, exam by system' },
    ],
  },
  {
    label: 'Language',
    field: 'language',
    type: 'radio',
    options: [
      {
        value: 'medical_terminology',
        name: 'Medical terminology',
        desc: 'ICD-10 friendly phrasing',
      },
      { value: 'plain_language', name: 'Plain language', desc: '7th-grade reading level' },
      { value: 'spanish_output', name: 'Spanish output', desc: 'Translate plan + patient summary' },
    ],
  },
  {
    label: 'Clinical detail',
    field: 'clinicalDetail',
    type: 'checkbox',
    options: [
      {
        value: 'pertinent_negatives',
        name: 'Include pertinent negatives',
        desc: '"Denies…" line per system',
      },
      { value: 'include_ros', name: 'Include ROS', desc: 'Review of systems' },
      {
        value: 'quote_verbatim',
        name: 'Quote patient verbatim',
        desc: 'Preserve key patient phrases in HPI',
      },
      {
        value: 'differential_diagnosis',
        name: 'Differential diagnosis',
        desc: 'Append DDx for new problems',
      },
      {
        value: 'risk_scores',
        name: 'Auto-calculate risk scores',
        desc: 'ASCVD, CHA₂DS₂-VASc, etc.',
      },
    ],
  },
  {
    label: 'Coding & billing',
    field: 'codingBilling',
    type: 'checkbox',
    options: [
      {
        value: 'icd10_suggestions',
        name: 'ICD-10 suggestions',
        desc: 'Inline code hints in Assessment',
      },
      {
        value: 'em_level',
        name: 'E/M level suggestion',
        desc: 'Recommend 99213 / 99214 from complexity',
      },
      {
        value: 'hcc_flags',
        name: 'Flag HCC opportunities',
        desc: 'Surface chronic conditions for risk adjustment',
      },
    ],
  },
  {
    label: 'Beyond the note',
    field: 'beyondNote',
    type: 'checkbox',
    options: [
      {
        value: 'suggested_orders',
        name: 'Suggested orders',
        desc: 'Labs, imaging, referrals based on Plan',
      },
      {
        value: 'med_rec_check',
        name: 'Med reconciliation check',
        desc: 'Flag interactions, dose, gaps',
      },
      {
        value: 'patient_education',
        name: 'Patient education paragraph',
        desc: 'Appended after Plan',
      },
      {
        value: 'transcript_timestamps',
        name: 'Cite transcript timestamps',
        desc: 'Inline [mm:ss] references',
      },
    ],
  },
];

function isRowActive(draft: SessionModifiers, field: string, value: string): boolean {
  switch (field) {
    case 'voice':
      return draft.voice === value;
    case 'length':
      return draft.length === value;
    case 'language':
      return draft.language === value;
    case 'clinicalDetail':
      return draft.clinicalDetail.includes(value as ModifierClinicalDetail);
    case 'codingBilling':
      return draft.codingBilling.includes(value as ModifierCodingBilling);
    case 'beyondNote':
      return draft.beyondNote.includes(value as ModifierBeyondNote);
    default:
      return false;
  }
}

function toggleRow(
  setDraft: React.Dispatch<React.SetStateAction<SessionModifiers>>,
  field: string,
  value: string,
): void {
  setDraft((d) => {
    switch (field) {
      case 'voice':
        return { ...d, voice: d.voice === value ? undefined : (value as ModifierVoice) };
      case 'length':
        return { ...d, length: d.length === value ? undefined : (value as ModifierLength) };
      case 'language':
        return { ...d, language: d.language === value ? undefined : (value as ModifierLanguage) };
      case 'clinicalDetail': {
        const v = value as ModifierClinicalDetail;
        return {
          ...d,
          clinicalDetail: d.clinicalDetail.includes(v)
            ? d.clinicalDetail.filter((x) => x !== v)
            : [...d.clinicalDetail, v],
        };
      }
      case 'codingBilling': {
        const v = value as ModifierCodingBilling;
        return {
          ...d,
          codingBilling: d.codingBilling.includes(v)
            ? d.codingBilling.filter((x) => x !== v)
            : [...d.codingBilling, v],
        };
      }
      case 'beyondNote': {
        const v = value as ModifierBeyondNote;
        return {
          ...d,
          beyondNote: d.beyondNote.includes(v)
            ? d.beyondNote.filter((x) => x !== v)
            : [...d.beyondNote, v],
        };
      }
      default:
        return d;
    }
  });
}

export function ModifierPopover({ modifiers, anchorRef, onClose, onApply }: ModifierPopoverProps) {
  const [draft, setDraft] = useState<SessionModifiers>(() => ({
    ...modifiers,
    clinicalDetail: [...modifiers.clinicalDetail],
    codingBilling: [...modifiers.codingBilling],
    beyondNote: [...modifiers.beyondNote],
    customInstructions: modifiers.customInstructions.map((c) => ({ ...c })),
  }));
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [anchorRef, onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (composerOpen) {
          cancelComposer();
        } else {
          onClose();
        }
      }
      if (composerOpen && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        saveInstruction();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpen, composerText, onClose]);

  useEffect(() => {
    if (composerOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [composerOpen]);

  const presetActiveCount =
    (draft.voice ? 1 : 0) +
    (draft.length ? 1 : 0) +
    (draft.language ? 1 : 0) +
    draft.clinicalDetail.length +
    draft.codingBilling.length +
    draft.beyondNote.length;
  const customActiveCount = draft.customInstructions.filter((c) => c.active).length;

  function openComposer() {
    setEditingId(null);
    setComposerText('');
    setComposerOpen(true);
  }

  function openEdit(instruction: CustomInstruction) {
    setEditingId(instruction.id);
    setComposerText(instruction.text);
    setComposerOpen(true);
  }

  function saveInstruction() {
    const text = composerText.trim();
    if (!text) return;
    if (editingId) {
      setDraft((d) => ({
        ...d,
        customInstructions: d.customInstructions.map((c) =>
          c.id === editingId ? { ...c, text } : c,
        ),
      }));
    } else {
      const next: CustomInstruction = { id: newId(), text, active: true };
      setDraft((d) => ({
        ...d,
        customInstructions: [...d.customInstructions, next],
      }));
    }
    setComposerOpen(false);
    setEditingId(null);
    setComposerText('');
  }

  function cancelComposer() {
    setComposerOpen(false);
    setEditingId(null);
    setComposerText('');
  }

  function removeInstruction(id: string) {
    setDraft((d) => ({
      ...d,
      customInstructions: d.customInstructions.filter((c) => c.id !== id),
    }));
    if (editingId === id) cancelComposer();
  }

  function toggleInstruction(id: string) {
    setDraft((d) => ({
      ...d,
      customInstructions: d.customInstructions.map((c) =>
        c.id === id ? { ...c, active: !c.active } : c,
      ),
    }));
  }

  const showCustomBlock = draft.customInstructions.length > 0 || composerOpen;

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-pt-text-2)',
  };

  const ghostBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 6px',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-pt-text-2)',
    fontSize: 11,
    cursor: 'pointer',
  };

  const checkboxStyle = (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: 14,
    height: 14,
    borderRadius: 4,
    border: `1px solid ${active ? SAGE : 'var(--color-pt-text-2)'}`,
    background: active ? SAGE : 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        zIndex: 200,
        width: 408,
        background: 'var(--color-pt-surface)',
        border: '1px solid var(--color-pt-border)',
        borderRadius: 10,
        boxShadow: '0 14px 30px rgba(0,0,0,0.14)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={labelStyle}>modifier · prompt add-ons</div>
          <div style={{ fontSize: 11, color: 'var(--color-pt-text-2)' }}>
            {presetActiveCount} preset{presetActiveCount !== 1 ? 's' : ''}
            {customActiveCount > 0
              ? ` · ${customActiveCount} custom rule${customActiveCount !== 1 ? 's' : ''}`
              : ''}
          </div>
        </div>
        <button type="button" onClick={onClose} style={ghostBtnStyle} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {/* Scroll area */}
      <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Custom instructions block */}
        {showCustomBlock && (
          <div
            style={{
              padding: '12px 14px',
              background: SAGE_BG_BLOCK,
              borderBottom: '1px solid var(--color-pt-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Sparkles size={11} style={{ color: SAGE }} />
                <span style={labelStyle}>your custom instructions</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-2)' }}>
                applied before presets
              </span>
            </div>

            {draft.customInstructions
              .filter((c) => c.id !== editingId)
              .map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${c.active ? SAGE_BORDER : 'var(--color-pt-border)'}`,
                    borderLeft: `3px solid ${c.active ? SAGE : 'var(--color-pt-border)'}`,
                    borderRadius: 8,
                    background: c.active ? SAGE_TINT : 'var(--color-pt-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => toggleInstruction(c.id)}
                      style={{
                        ...checkboxStyle(c.active),
                        cursor: 'pointer',
                        padding: 0,
                        marginTop: 2,
                      }}
                      aria-label={c.active ? 'Deactivate' : 'Activate'}
                    >
                      {c.active && <Check size={9} color="white" strokeWidth={3} />}
                    </button>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        fontStyle: 'italic',
                        color: 'var(--color-pt-text)',
                      }}
                    >
                      <span
                        style={{
                          fontStyle: 'normal',
                          color: 'var(--color-pt-text-2)',
                          marginRight: 2,
                        }}
                      >
                        "
                      </span>
                      {c.text}
                      <span
                        style={{
                          fontStyle: 'normal',
                          color: 'var(--color-pt-text-2)',
                          marginLeft: 2,
                        }}
                      >
                        "
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, paddingLeft: 22 }}>
                    <button type="button" style={ghostBtnStyle} onClick={() => openEdit(c)}>
                      <Pencil size={10} /> Edit
                    </button>
                    <button
                      type="button"
                      style={ghostBtnStyle}
                      onClick={() => removeInstruction(c.id)}
                    >
                      <Trash2 size={10} /> Remove
                    </button>
                  </div>
                </div>
              ))}

            {composerOpen && (
              <div
                style={{
                  padding: '10px 12px',
                  border: `1px dashed ${SAGE}`,
                  borderRadius: 8,
                  background: 'var(--color-pt-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span style={{ ...labelStyle, color: SAGE }}>
                    {editingId ? 'edit instruction' : 'new instruction'}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-pt-text-2)' }}>
                    plain English · max 240 chars
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value.slice(0, 240))}
                  placeholder="e.g. Always include the patient's most recent A1c when documenting diabetes."
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'none',
                    borderRadius: 6,
                    border: '1px solid var(--color-pt-border)',
                    background: '#ffffff',
                    color: 'var(--color-pt-text)',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    padding: '8px 10px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    minHeight: 64,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={cancelComposer}
                    className="btn btn-ghost"
                    style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveInstruction}
                    disabled={!composerText.trim()}
                    className="btn btn-primary"
                    style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preset groups */}
        {PRESET_GROUPS.map((group, gi) => (
          <div
            key={group.label}
            style={{
              borderBottom:
                gi < PRESET_GROUPS.length - 1 ? '1px solid var(--color-pt-border)' : 'none',
            }}
          >
            <div style={{ ...labelStyle, padding: '10px 14px 4px' }}>{group.label}</div>
            {group.options.map((opt) => {
              const active = isRowActive(draft, group.field, opt.value);
              return (
                <div
                  key={opt.value}
                  style={{
                    borderLeft: `3px solid ${active ? SAGE : 'transparent'}`,
                    background: active ? SAGE_TINT : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleRow(setDraft, group.field, opt.value)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px 8px 11px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={checkboxStyle(active)}>
                      {active && <Check size={9} color="white" strokeWidth={3} />}
                    </span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: active ? 600 : 500,
                          color: 'var(--color-pt-text)',
                        }}
                      >
                        {opt.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-pt-text-2)' }}>
                        {opt.desc}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderTop: '1px solid var(--color-pt-border)',
          background: 'var(--color-pt-surface)',
        }}
      >
        <button
          type="button"
          onClick={openComposer}
          disabled={composerOpen}
          className="btn btn-ghost"
          style={{ height: 30, padding: '0 10px', fontSize: 12, gap: 5 }}
        >
          <Plus size={12} /> Add custom instruction
        </button>
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="btn btn-primary"
          style={{ height: 30, padding: '0 12px', fontSize: 12 }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

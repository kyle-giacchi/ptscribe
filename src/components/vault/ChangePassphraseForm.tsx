import { useState } from 'react';
import { toast } from 'sonner';
import { Field, TextInput } from '@/components/ui/Field';
import { PtButton } from '@/components/design';
import { vault } from '@/lib/vault/vault';
import { PASSPHRASE_MIN_CHARS } from '@/lib/vault/crypto';

export function ChangePassphraseForm() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (!vault.isUnlocked()) return null;

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error('New passphrases do not match');
      return;
    }
    if (next.length < PASSPHRASE_MIN_CHARS) {
      toast.error(`New passphrase must be at least ${PASSPHRASE_MIN_CHARS} characters`);
      return;
    }
    setBusy(true);
    try {
      const result = await vault.changePassphrase(current, next);
      if (!result.ok) {
        if (result.reason === 'bad_passphrase') {
          toast.error('Current passphrase is incorrect');
        } else {
          toast.error(`Passphrase change failed: ${result.reason}`);
        }
        return;
      }
      toast.success('Passphrase changed — use the new passphrase next time you unlock.');
      reset();
    } catch (err) {
      toast.error(`Passphrase change failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <PtButton variant="ghost" onClick={() => setOpen(true)}>
        Change passphrase
      </PtButton>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10, maxWidth: 320 }}>
      <Field label="Current passphrase">
        <TextInput
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />
      </Field>
      <Field label="New passphrase" hint={`Minimum ${PASSPHRASE_MIN_CHARS} characters`}>
        <TextInput
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          disabled={busy}
        />
      </Field>
      <Field label="Confirm new passphrase">
        <TextInput
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          disabled={busy}
        />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <PtButton type="submit" variant="primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update passphrase'}
        </PtButton>
        <PtButton type="button" variant="ghost" onClick={reset} disabled={busy}>
          Cancel
        </PtButton>
      </div>
    </form>
  );
}

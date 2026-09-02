import { describe, it, expect, beforeEach } from 'vitest';
import {
  projectUserConfig,
  hashUserConfig,
  reconcile,
  readSyncRecord,
  restoreEndpointKeys,
  writeSyncRecord,
  configSyncKey,
  type ServerUserConfig,
} from './configSync';
import { defaultAppData } from '@/schemas';
import type { AppData, NoteTemplate, Exercise } from '@/types';

function customTemplate(id: string): NoteTemplate {
  return {
    id,
    name: `T-${id}`,
    format: 'soap',
    sections: [],
    systemPrompt: '',
    builtin: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function customExercise(id: string): Exercise {
  return {
    id,
    name: `E-${id}`,
    region: 'knee',
    category: 'strength',
    instructions: '',
    builtin: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function appDataWithClinicalData(): AppData {
  const base = defaultAppData();
  return {
    ...base,
    clinician: { ...base.clinician, name: 'Dr Test' },
    templates: [...base.templates, customTemplate('custom-1')],
    exercises: [...base.exercises, customExercise('custom-1')],
    patients: [
      {
        id: 'p1',
        firstName: 'Jane',
        lastName: 'Doe',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    sessions: [{ id: 's1' } as AppData['sessions'][number]],
    notes: [{ id: 'n1' } as AppData['notes'][number]],
    plans: [{ id: 'pl1' } as AppData['plans'][number]],
  };
}

describe('projectUserConfig (the clinical-exclusion boundary)', () => {
  const projection = projectUserConfig(appDataWithClinicalData());

  it('includes only the four non-clinical keys', () => {
    expect(Object.keys(projection).sort()).toEqual([
      'clinician',
      'exercises',
      'settings',
      'templates',
    ]);
  });

  it('NEVER includes patient data', () => {
    const blob = JSON.stringify(projection);
    expect(projection).not.toHaveProperty('patients');
    expect(projection).not.toHaveProperty('sessions');
    expect(projection).not.toHaveProperty('notes');
    expect(projection).not.toHaveProperty('plans');
    // Defense in depth: the serialized payload contains none of the PHI ids.
    expect(blob).not.toContain('Jane');
    expect(blob).not.toContain('"s1"');
    expect(blob).not.toContain('"n1"');
    expect(blob).not.toContain('"pl1"');
  });

  it('drops built-in templates and exercises, keeps custom', () => {
    expect(projection.templates.every((t) => !t.builtin)).toBe(true);
    expect(projection.exercises.every((e) => !e.builtin)).toBe(true);
    expect(projection.templates.some((t) => t.id === 'custom-1')).toBe(true);
    expect(projection.exercises.some((e) => e.id === 'custom-1')).toBe(true);
  });

  it('carries the clinician profile', () => {
    expect(projection.clinician.name).toBe('Dr Test');
  });
});

describe('hashUserConfig', () => {
  it('is stable regardless of object key order', () => {
    const a = projectUserConfig(appDataWithClinicalData());
    const b = projectUserConfig(appDataWithClinicalData());
    expect(hashUserConfig(a)).toBe(hashUserConfig(b));
  });

  it('changes when content changes', () => {
    const base = appDataWithClinicalData();
    const h1 = hashUserConfig(projectUserConfig(base));
    const h2 = hashUserConfig(
      projectUserConfig({ ...base, clinician: { ...base.clinician, name: 'Other' } }),
    );
    expect(h1).not.toBe(h2);
  });
});

describe('reconcile (last-write-wins)', () => {
  const server: ServerUserConfig = {
    settings: defaultAppData().settings,
    clinician: defaultAppData().clinician,
    templates: [],
    exercises: [],
    updatedAt: 100,
  };

  it('pushes to seed when the server has no row', () => {
    expect(reconcile(0, null)).toEqual({ action: 'push' });
    expect(reconcile(50, null)).toEqual({ action: 'push' });
  });

  it('applies when the server is newer (fresh device: localUpdatedAt 0)', () => {
    expect(reconcile(0, server)).toEqual({ action: 'apply', server });
  });

  it('applies when the server is strictly newer', () => {
    expect(reconcile(50, server)).toEqual({ action: 'apply', server });
  });

  it('pushes when local is newer', () => {
    expect(reconcile(200, server)).toEqual({ action: 'push' });
  });

  it('noops when versions match', () => {
    expect(reconcile(100, server)).toEqual({ action: 'noop' });
  });
});

describe('sync record persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a record per user', () => {
    writeSyncRecord('u1', { hash: 'h', localUpdatedAt: 5, serverUpdatedAt: 5 });
    expect(readSyncRecord('u1')).toEqual({ hash: 'h', localUpdatedAt: 5, serverUpdatedAt: 5 });
  });

  it('returns null for an unknown user', () => {
    expect(readSyncRecord('nobody')).toBeNull();
  });

  it('namespaces by user id', () => {
    expect(configSyncKey('abc')).toBe('ptscribe-config-sync:abc');
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem(configSyncKey('u2'), '{bad');
    expect(readSyncRecord('u2')).toBeNull();
  });
});

describe('self-hosted endpoint apiKey never reaches the server', () => {
  // user_config.settings is a plaintext D1 column. AppData is vault-encrypted on
  // disk, so the endpoint bearer token is only protected while it stays local.
  // strip (push) and restore (pull) are a pair — one without the other either
  // leaks the token or deletes the user's own key on next sync.
  function appDataWithEndpointKey(): AppData {
    const base = defaultAppData();
    return {
      ...base,
      settings: {
        ...base.settings,
        ai: {
          ...base.settings.ai,
          generation: {
            ...base.settings.ai.generation,
            endpoints: {
              local: { baseUrl: 'http://localhost:11434', model: 'llama3', apiKey: 'sk-secret' },
              network: { baseUrl: 'https://lan-box:8000', model: 'qwen' },
            },
          },
        },
      },
    };
  }

  it('strips apiKey from the sync payload', () => {
    const { settings } = projectUserConfig(appDataWithEndpointKey());
    const endpoints = settings.ai.generation.endpoints!;

    expect(endpoints.local?.apiKey).toBeUndefined();
    // Non-secret endpoint config still syncs.
    expect(endpoints.local?.baseUrl).toBe('http://localhost:11434');
    expect(endpoints.local?.model).toBe('llama3');
  });

  it('leaves no trace of the token anywhere in the serialized payload', () => {
    const serialized = JSON.stringify(projectUserConfig(appDataWithEndpointKey()));

    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('apiKey');
  });

  it('restores the local apiKey when applying a server payload', () => {
    const local = appDataWithEndpointKey().settings;
    const fromServer = projectUserConfig(appDataWithEndpointKey()).settings;

    const applied = restoreEndpointKeys(fromServer, local);

    expect(applied.ai.generation.endpoints?.local?.apiKey).toBe('sk-secret');
    // An endpoint that never had a key stays keyless.
    expect(applied.ai.generation.endpoints?.network?.apiKey).toBeUndefined();
  });

  it('does not invent a key when the local side has none', () => {
    const localNoKey = defaultAppData().settings;
    const fromServer = projectUserConfig(appDataWithEndpointKey()).settings;

    const applied = restoreEndpointKeys(fromServer, localNoKey);

    expect(applied.ai.generation.endpoints?.local?.apiKey).toBeUndefined();
  });

  it('keeps a server-side baseUrl change while preserving the local key', () => {
    const local = appDataWithEndpointKey().settings;
    const fromServer = projectUserConfig(appDataWithEndpointKey()).settings;
    fromServer.ai.generation.endpoints!.local!.baseUrl = 'http://localhost:9999';

    const applied = restoreEndpointKeys(fromServer, local);

    expect(applied.ai.generation.endpoints?.local?.baseUrl).toBe('http://localhost:9999');
    expect(applied.ai.generation.endpoints?.local?.apiKey).toBe('sk-secret');
  });
});

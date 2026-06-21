import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAMBER, CHAMBERS, DEFAULT_FIXED_CONDITION_CONFIG, DEFAULT_USER_MANAGED_CONFIG } from '../src/domain/chamber';
import type { BlockId, CycleCount, PlacementMode, TemperatureCycleConfig } from '../src/domain/types';
import { buildCycleWindow, canCommitCandidate } from '../src/domain/reservationRules';
import { listChambers, listConfigRevisions, listReservations, listSuspensions, openDatabase, type ChamberReserveDatabase } from './db.ts';
import {
  archiveChamberConfig,
  createChamberConfigRevision,
  createReservationFromCandidate,
  createSuspension,
  deleteReservationByPin,
  lookupReservationByPin,
  patchChamberConfigRevision,
  previewSuspension,
  publishChamberConfig,
  searchCandidateResult,
  searchCandidates,
} from './service.ts';

let dbHandle: ChamberReserveDatabase | null = null;
let tempDir: string | null = null;

function openTempDb() {
  tempDir = mkdtempSync(join(tmpdir(), 'chamberreserve-server-'));
  dbHandle = openDatabase(join(tempDir, 'test.sqlite'));
  return dbHandle.db;
}

function closeTempDb() {
  dbHandle?.close();
  dbHandle = null;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
}

function defaultCreateInput(overrides: Partial<{
  desiredDate: string;
  selectedBlocks: BlockId[];
  placementMode: PlacementMode;
  cycleCount: CycleCount;
  candidateId: string;
}> = {}) {
  return {
    desiredDate: overrides.desiredDate ?? '2026-06-24',
    selectedBlocks: overrides.selectedBlocks ?? ['r2c2', 'r2c3'],
    placementMode: overrides.placementMode ?? 'size',
    cycleCount: overrides.cycleCount ?? 1,
    candidateId: overrides.candidateId,
    requester: {
      name: 'Tanaka',
      department: 'Reliability',
    },
    testName: 'Server persistence check',
    contactNote: 'API flow',
    nowIso: '2026-06-21T11:00:00+09:00',
  };
}

afterEach(() => {
  closeTempDb();
});

describe('ChamberReserve server persistence service', () => {
  it('seeds multiple chambers, active config revisions, and reservations into SQLite', () => {
    const db = openTempDb();

    expect(listChambers(db).map((chamber) => chamber.id)).toEqual(['tc-01', 'tc-02', 'tc-03']);
    expect(listChambers(db).every((chamber) => chamber.activeConfigRevision.config.type === 'temperature_cycle')).toBe(true);
    expect(listConfigRevisions(db).filter((revision) => revision.status === 'active')).toHaveLength(3);
    expect(listReservations(db).map((reservation) => reservation.id)).toContain('CR-260624-001');
    expect(listReservations(db).map((reservation) => reservation.chamberId)).toEqual(
      expect.arrayContaining(['tc-01', 'tc-02', 'tc-03']),
    );
    expect(listSuspensions(db)).toHaveLength(0);
  });

  it('returns only commit-ready candidates for contiguous block requests', () => {
    const db = openTempDb();

    const candidates = searchCandidates(db, {
      desiredDate: '2026-06-24',
      selectedBlocks: ['r2c2', 'r2c3'],
      placementMode: 'size',
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(new Set(candidates.map((candidate) => candidate.chamberId)).size).toBeGreaterThan(1);
    expect(candidates.every((candidate) => candidate.blocks.length === 2)).toBe(true);
    expect(candidates.every((candidate) => candidate.requestedCycleSpan === 10)).toBe(true);
    expect(candidates).toHaveLength(new Set(candidates.map((candidate) => `${candidate.chamberId}-${candidate.occupiedStartAt}`)).size);
    expect(candidates.every((candidate) => canCommitCandidate(candidate, listReservations(db), listSuspensions(db), CHAMBERS))).toBe(true);
  });

  it('returns a structured candidate result with requested date and alternatives split', () => {
    const db = openTempDb();
    for (const chamber of CHAMBERS) {
      const requestedWindow = buildCycleWindow('2026-06-26', chamber.activeConfigRevision.config as TemperatureCycleConfig);
      createSuspension(db, {
        chamberId: chamber.id,
        reason: 'full requested date',
        startAt: requestedWindow.loadStart,
        endAt: requestedWindow.unloadEnd,
        blocks: 'all',
      });
    }

    const result = searchCandidateResult(db, {
      desiredDate: '2026-06-26',
      selectedBlocks: ['r2c2'],
      placementMode: 'size',
      cycleCount: 1,
    });

    expect(result.requestedDateAvailable).toBe(false);
    expect(result.requestedDateCandidates).toHaveLength(0);
    expect(result.alternativeDateCandidates.length).toBeGreaterThan(0);
    expect(result.candidates).toEqual(result.alternativeDateCandidates);
  });

  it('persists a created reservation and resolves it by 4 digit PIN after reopening', () => {
    const db = openTempDb();
    const result = createReservationFromCandidate(db, defaultCreateInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { id, pin } = result.reservation;

    dbHandle?.close();
    dbHandle = openDatabase(join(tempDir as string, 'test.sqlite'));
    const lookup = lookupReservationByPin(dbHandle.db, { reservationId: id, pin });

    expect(pin).toMatch(/^\d{4}$/);
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.reservation.id).toBe(id);
      expect(lookup.reservation.testName).toBe('Server persistence check');
    }
  });

  it('persists only the occupied window from the selected cycle span', () => {
    const db = openTempDb();
    const result = createReservationFromCandidate(db, defaultCreateInput({ cycleCount: 2 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.occupiedEndAt).toBe(new Date('2026-06-26T09:00:00').toISOString());
    expect('cycleCount' in result.reservation).toBe(false);
    expect('window' in result.reservation).toBe(false);
  });

  it('rejects a stale candidate when the same placement was already committed', () => {
    const db = openTempDb();
    const input = defaultCreateInput({
      placementMode: 'exact',
      selectedBlocks: ['r2c2', 'r2c3'],
      candidateId: 'tc-01-2026-06-24-tc01configr1-c1-exact-1',
    });

    const first = createReservationFromCandidate(db, input);
    const second = createReservationFromCandidate(db, input);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, status: 409, error: 'candidate_unavailable' });
  });

  it('allows the same block placement on different chambers', () => {
    const db = openTempDb();
    const first = createReservationFromCandidate(db, defaultCreateInput({
      placementMode: 'exact',
      selectedBlocks: ['r2c2', 'r2c3'],
      candidateId: 'tc-01-2026-06-24-tc01configr1-c1-exact-1',
    }));
    const second = createReservationFromCandidate(db, {
      ...defaultCreateInput({
        placementMode: 'exact',
        selectedBlocks: ['r2c2', 'r2c3'],
        candidateId: 'tc-02-2026-06-24-tc02configr1-c1-exact-1',
      }),
      testName: 'Second chamber same blocks',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.reservation.chamberId).toBe('tc-01');
      expect(second.reservation.chamberId).toBe('tc-02');
      expect(first.reservation.blocks).toEqual(second.reservation.blocks);
    }
  });

  it('requires the correct PIN and blocks completed reservation deletion', () => {
    const db = openTempDb();

    expect(lookupReservationByPin(db, { reservationId: 'CR-260624-001', pin: '0000' })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(deleteReservationByPin(db, 'CR-260618-001', { pin: '2468' })).toMatchObject({
      ok: false,
      status: 409,
      error: 'completed_reservation_delete_blocked',
    });
  });

  it('previews and persists admin suspension impacts', () => {
    const db = openTempDb();
    const window = buildCycleWindow('2026-06-24', CHAMBER.activeConfigRevision.config as TemperatureCycleConfig);
    const draft = {
      chamberId: CHAMBER.id,
      reason: 'maintenance',
      startAt: window.loadStart,
      endAt: window.unloadEnd,
      blocks: 'all' as const,
    };

    const preview = previewSuspension(db, draft);
    const created = createSuspension(db, draft);
    const impacted = listReservations(db).find((reservation) => reservation.id === 'CR-260624-001');

    expect(preview.map((reservation) => reservation.id)).toContain('CR-260624-001');
    expect(created.suspension.affectedReservationIds).toContain('CR-260624-001');
    expect(impacted?.impactedBySuspensionIds).toContain(created.suspension.id);
  });

  it('publishes fixed-condition chamber config and applies it to candidate search', () => {
    const db = openTempDb();
    const draft = createChamberConfigRevision(db, {
      chamberId: 'tc-01',
      config: {
        ...DEFAULT_FIXED_CONDITION_CONFIG,
        condition: { temperatureC: 40, humidityRh: 80 },
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    publishChamberConfig(db, draft.revision.id);
    const chamber = listChambers(db).find((item) => item.id === 'tc-01');
    expect(chamber?.activeConfigRevision.config.type).toBe('fixed_condition');

    const noMatch = searchCandidates(db, {
      desiredDate: '2026-06-28',
      selectedBlocks: ['r2c2'],
      placementMode: 'exact',
      requestedCondition: { temperatureC: 25, humidityRh: 93 },
    });
    const match = searchCandidates(db, {
      desiredDate: '2026-06-28',
      selectedBlocks: ['r2c2'],
      placementMode: 'exact',
      requestedCondition: { temperatureC: 40, humidityRh: 80 },
      environmentStartTime: '13:30',
      environmentDurationHours: 5.5,
    });
    expect(noMatch.some((candidate) => candidate.chamberId === 'tc-01')).toBe(false);
    expect(match.some((candidate) => candidate.chamberId === 'tc-01')).toBe(true);
    const tc01Candidate = match.find((candidate) => candidate.chamberId === 'tc-01');
    expect(tc01Candidate?.occupiedStartAt).toBe(new Date('2026-06-28T13:30:00').toISOString());
    expect(tc01Candidate?.occupiedEndAt).toBe(new Date('2026-06-28T19:00:00').toISOString());
  });

  it('keeps config revisions in draft, active, and archived states with guarded transitions', () => {
    const db = openTempDb();
    const draft = createChamberConfigRevision(db, {
      chamberId: 'tc-01',
      config: {
        ...DEFAULT_FIXED_CONDITION_CONFIG,
        condition: { temperatureC: 35, humidityRh: 75 },
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.revision.status).toBe('draft');

    const patched = patchChamberConfigRevision(db, draft.revision.id, {
      chamberId: 'tc-01',
      config: {
        ...DEFAULT_FIXED_CONDITION_CONFIG,
        condition: { temperatureC: 40, humidityRh: 80 },
      },
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.revision.status).toBe('draft');

    const published = publishChamberConfig(db, patched.revision.id);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.revision.status).toBe('active');
    expect(listChambers(db).find((chamber) => chamber.id === 'tc-01')?.activeConfigRevisionId).toBe(patched.revision.id);
    expect(listConfigRevisions(db, 'tc-01').find((revision) => revision.id === 'tc-01-config-r1')?.status).toBe('archived');

    expect(archiveChamberConfig(db, published.revision.id)).toMatchObject({
      ok: false,
      status: 409,
      error: 'active_config_revision_archive_blocked',
    });
    expect(patchChamberConfigRevision(db, published.revision.id, {
      chamberId: 'tc-01',
      config: DEFAULT_USER_MANAGED_CONFIG,
    })).toMatchObject({
      ok: false,
      status: 409,
      error: 'config_revision_not_draft',
    });

    const unusedDraft = createChamberConfigRevision(db, {
      chamberId: 'tc-01',
      config: DEFAULT_USER_MANAGED_CONFIG,
    });
    expect(unusedDraft.ok).toBe(true);
    if (!unusedDraft.ok) return;
    const archived = archiveChamberConfig(db, unusedDraft.revision.id);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.revision.status).toBe('archived');
    }
    expect(publishChamberConfig(db, 'missing-config-revision')).toMatchObject({
      ok: false,
      status: 404,
      error: 'config_revision_not_found',
    });
  });

  it('stores requested condition only for user-managed chamber reservations', () => {
    const db = openTempDb();
    const draft = createChamberConfigRevision(db, {
      chamberId: 'tc-01',
      config: DEFAULT_USER_MANAGED_CONFIG,
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    publishChamberConfig(db, draft.revision.id);

    const result = createReservationFromCandidate(db, {
      ...defaultCreateInput({
        desiredDate: '2026-06-29',
        selectedBlocks: ['r2c2'],
        placementMode: 'exact',
      }),
      requestedCondition: { temperatureC: 30, humidityRh: 60 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservation.requestedCondition).toEqual({ temperatureC: 30, humidityRh: 60 });
    }
  });
});

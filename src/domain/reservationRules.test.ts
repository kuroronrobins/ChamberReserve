import { describe, expect, it } from 'vitest';
import { CHAMBER, CHAMBERS, DEFAULT_USER_MANAGED_CONFIG } from './chamber';
import { DEMO_NOW_ISO, INITIAL_RESERVATIONS } from './mockData';
import type { Chamber, Reservation, SuspensionDraft, TemperatureCycleConfig } from './types';
import {
  buildCycleWindow,
  canDeleteReservation,
  createReservation,
  getAffectedReservations,
  hasSteadyAccessWindows,
  isContiguousBlockSet,
  normalizeCycleCount,
  resolveReservationStatus,
  validateCycleProgram,
} from './reservationRules';
import { searchReservationCandidates } from './searchEngine';

const cycleConfig = CHAMBER.activeConfigRevision.config as TemperatureCycleConfig;

function reservationWithWindow(id: string, blocks: Reservation['blocks'], dateKey = '2026-06-24'): Reservation {
  const window = buildCycleWindow(dateKey, cycleConfig);
  return {
    ...INITIAL_RESERVATIONS[0],
    id,
    blocks,
    occupiedStartAt: window.loadStart,
    occupiedEndAt: window.unloadEnd,
    deletedAt: undefined,
    impactedBySuspensionIds: undefined,
  };
}

describe('reservationRules', () => {
  it('detects fragmented block selections', () => {
    expect(isContiguousBlockSet(['r1c1', 'r1c2', 'r2c1'])).toBe(true);
    expect(isContiguousBlockSet(['r1c1', 'r3c4'])).toBe(false);
  });

  it('generates only contiguous placements for size-only search', () => {
    const reservations: Reservation[] = [
      reservationWithWindow('blocking-left', ['r1c1', 'r2c1', 'r3c1']),
      reservationWithWindow('blocking-mid', ['r1c2', 'r2c2', 'r3c2']),
      reservationWithWindow('blocking-right', ['r1c3', 'r2c3', 'r3c3']),
    ];

    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-24',
        selectedBlocks: ['r1c1', 'r1c2'],
        placementMode: 'size',
        cycleCount: 1,
      },
      { reservations, suspensions: [], searchWindowDays: 1, chambers: [CHAMBER] },
    );

    expect(candidates).toHaveLength(0);
  });

  it('uses the selected location when exact placement is requested', () => {
    const exactCandidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-24',
        selectedBlocks: ['r1c1', 'r1c2'],
        placementMode: 'exact',
        cycleCount: 1,
      },
      { reservations: INITIAL_RESERVATIONS, suspensions: [], searchWindowDays: 1, chambers: [CHAMBER] },
    );
    const sizeCandidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-24',
        selectedBlocks: ['r1c1', 'r1c2'],
        placementMode: 'size',
        cycleCount: 1,
      },
      { reservations: INITIAL_RESERVATIONS, suspensions: [], searchWindowDays: 1, chambers: [CHAMBER] },
    );

    expect(exactCandidates).toHaveLength(0);
    expect(sizeCandidates.length).toBeGreaterThan(0);
    expect(sizeCandidates.every((candidate) => candidate.blocks.join(',') !== 'r1c1,r1c2')).toBe(true);
  });

  it('generates cross-chamber candidates for the same search condition', () => {
    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: ['r2c2', 'r2c3'],
        placementMode: 'exact',
        cycleCount: 1,
      },
      { reservations: [], suspensions: [], searchWindowDays: 1, chambers: CHAMBERS },
    );

    expect(candidates.map((candidate) => candidate.chamberId).sort()).toEqual(['tc-01', 'tc-02', 'tc-03']);
    expect(candidates.every((candidate) => candidate.blocks.join(',') === 'r2c2,r2c3')).toBe(true);
  });

  it('validates cycle access window order and cycle program steps', () => {
    const window = buildCycleWindow('2026-06-24', cycleConfig);
    expect(hasSteadyAccessWindows(window)).toBe(true);
    expect(
      hasSteadyAccessWindows({
        ...window,
        runStart: new Date(new Date(window.loadEnd).getTime() + 60_000).toISOString(),
      }),
    ).toBe(false);
    expect(validateCycleProgram(cycleConfig)).toEqual([]);
  });

  it('normalizes cycle counts to whole completed cycles and real access windows', () => {
    const decimalWindow = buildCycleWindow('2026-06-24', cycleConfig, 10.1);

    expect(normalizeCycleCount(10.1)).toBe(10);
    expect(normalizeCycleCount(10.6)).toBe(11);
    expect(normalizeCycleCount(0.5)).toBe(1);
    expect(decimalWindow.loadStart).toBe(new Date('2026-06-24T07:30:00').toISOString());
    expect(decimalWindow.loadEnd).toBe(new Date('2026-06-24T09:00:00').toISOString());
    expect(decimalWindow.unloadStart).toBe(new Date('2026-07-04T07:30:00').toISOString());
    expect(decimalWindow.unloadEnd).toBe(new Date('2026-07-04T09:00:00').toISOString());
  });

  it('uses selected cycle count for candidate occupancy but not reservation cycle persistence', () => {
    const minimumWindow = buildCycleWindow('2026-06-24', cycleConfig, 0.5);
    const extendedWindow = buildCycleWindow('2026-06-24', cycleConfig, 2);
    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-24',
        selectedBlocks: ['r2c2', 'r2c3'],
        placementMode: 'size',
        cycleCount: 2,
      },
      { reservations: [], suspensions: [], searchWindowDays: 1, chambers: [CHAMBER] },
    );

    expect(minimumWindow.unloadStart).toBe(new Date('2026-06-25T07:30:00').toISOString());
    expect(minimumWindow.unloadEnd).toBe(new Date('2026-06-25T09:00:00').toISOString());
    expect(extendedWindow.unloadStart).toBe(new Date('2026-06-26T07:30:00').toISOString());
    expect(extendedWindow.unloadEnd).toBe(new Date('2026-06-26T09:00:00').toISOString());
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.requestedCycleSpan === 2)).toBe(true);
    expect(candidates.every((candidate) => candidate.id.includes('-c2-'))).toBe(true);

    const reservation = createReservation({
      candidate: candidates[0],
      requester: { name: '田中', department: '評価技術' },
      testName: '占有時間確認',
    }, [], DEMO_NOW_ISO);
    expect(reservation.occupiedStartAt).toBe(candidates[0].occupiedStartAt);
    expect(reservation.occupiedEndAt).toBe(candidates[0].occupiedEndAt);
    expect('cycleCount' in reservation).toBe(false);
    expect('window' in reservation).toBe(false);
  });

  it('prevents completed reservations from being deleted', () => {
    const completed = INITIAL_RESERVATIONS.find((reservation) => reservation.id === 'CR-260618-001');
    const inUse: Reservation = {
      ...INITIAL_RESERVATIONS[0],
      id: 'in-use-now',
      occupiedStartAt: '2026-06-21T10:00:00+09:00',
      occupiedEndAt: '2026-06-21T12:00:00+09:00',
    };

    expect(completed).toBeDefined();
    expect(resolveReservationStatus(completed as Reservation, DEMO_NOW_ISO)).toBe('completed');
    expect(canDeleteReservation(completed as Reservation, DEMO_NOW_ISO)).toBe(false);
    expect(resolveReservationStatus(inUse, DEMO_NOW_ISO)).toBe('in_use');
    expect(canDeleteReservation(inUse, DEMO_NOW_ISO)).toBe(true);
  });

  it('previews reservations affected by an admin suspension', () => {
    const window = buildCycleWindow('2026-06-24', cycleConfig);
    const suspension: SuspensionDraft = {
      chamberId: CHAMBER.id,
      reason: '点検',
      startAt: window.loadStart,
      endAt: window.unloadEnd,
      blocks: ['r1c1'],
    };

    const affected = getAffectedReservations(suspension, INITIAL_RESERVATIONS);
    expect(affected.map((reservation) => reservation.id)).toEqual(['CR-260624-001']);
  });

  it('requires exact condition sharing for user-managed chambers', () => {
    const userManagedChamber: Chamber = {
      ...CHAMBER,
      type: 'user_managed_condition',
      activeConfigRevisionId: 'tc-01-config-user',
      activeConfigRevision: {
        ...CHAMBER.activeConfigRevision,
        id: 'tc-01-config-user',
        ownership: 'user_managed',
        adminManagedKind: undefined,
        config: DEFAULT_USER_MANAGED_CONFIG,
      },
    };
    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-24',
        selectedBlocks: ['r2c2', 'r2c3'],
        placementMode: 'exact',
        cycleCount: 1,
        conditionMode: 'environment',
        environmentStartTime: '14:15',
        environmentDurationHours: 3.75,
        requestedCondition: { temperatureC: 25, humidityRh: 93 },
      },
      { reservations: [], suspensions: [], searchWindowDays: 1, chambers: [userManagedChamber] },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].requestedCondition).toEqual({ temperatureC: 25, humidityRh: 93 });
    expect(candidates[0].occupiedStartAt).toBe(new Date('2026-06-24T14:15:00').toISOString());
    expect(candidates[0].occupiedEndAt).toBe(new Date('2026-06-24T18:00:00').toISOString());
  });
});

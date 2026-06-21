import { describe, expect, it } from 'vitest';
import { CHAMBER, CHAMBERS, DEFAULT_FIXED_CONDITION_CONFIG } from './chamber';
import { INITIAL_RESERVATIONS } from './mockData';
import { buildCycleWindow } from './reservationRules';
import type { Chamber, Reservation, SearchRequest, TemperatureCycleConfig } from './types';
import {
  buildCandidateId,
  buildSearchDateKeys,
  DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS,
  searchReservationCandidateResult,
  searchReservationCandidates,
} from './searchEngine';

const exactSearchRequest: SearchRequest = {
  desiredDate: '2026-06-26',
  selectedBlocks: ['r2c2', 'r2c3'],
  placementMode: 'exact',
  cycleCount: 1,
};

const cycleConfig = CHAMBER.activeConfigRevision.config as TemperatureCycleConfig;

function chamberWithActiveConfig(chamber: Chamber, config: Chamber['activeConfigRevision']['config']): Chamber {
  const revision = {
    ...chamber.activeConfigRevision,
    id: `${chamber.id}-test-config`,
    chamberId: chamber.id,
    status: 'active' as const,
    ownership: config.type === 'user_managed_condition' ? 'user_managed' as const : 'admin_managed' as const,
    adminManagedKind: config.type === 'user_managed_condition' ? undefined : config.type,
    config,
    cyclePeriodMinutes: config.type === 'temperature_cycle' ? config.cyclePeriodMinutes : undefined,
  };
  return {
    ...chamber,
    type: config.type,
    activeConfigRevisionId: revision.id,
    activeConfigRevision: revision,
  };
}

function reservationWithWindow(id: string, blocks: Reservation['blocks'], dateKey = '2026-06-26'): Reservation {
  const window = buildCycleWindow(dateKey, cycleConfig);
  return {
    ...INITIAL_RESERVATIONS[0],
    id,
    chamberId: CHAMBER.id,
    blocks,
    occupiedStartAt: window.loadStart,
    occupiedEndAt: window.unloadEnd,
    deletedAt: undefined,
    impactedBySuspensionIds: undefined,
  };
}

describe('searchEngine', () => {
  it('keeps empty block intent separate from fragmented block intent', () => {
    const emptyResult = searchReservationCandidateResult(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: [],
        placementMode: 'size',
        cycleCount: 1,
      },
      { reservations: [], suspensions: [], chambers: [CHAMBER], searchWindowDays: 1 },
    );
    const fragmentedResult = searchReservationCandidateResult(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: ['r1c1', 'r3c4'],
        placementMode: 'size',
        cycleCount: 1,
      },
      { reservations: [], suspensions: [], chambers: [CHAMBER], searchWindowDays: 1 },
    );

    expect(emptyResult.candidates).toHaveLength(0);
    expect(emptyResult.unavailableReasons[0]?.code).toBe('empty_blocks');
    expect(fragmentedResult.candidates).toHaveLength(0);
    expect(fragmentedResult.unavailableReasons[0]?.code).toBe('non_contiguous_blocks');
  });

  it('keeps search window expansion explicit and configurable', () => {
    expect(buildSearchDateKeys('2026-06-24')).toHaveLength(DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS);
    expect(buildSearchDateKeys('2026-06-24', 2)).toEqual(['2026-06-24', '2026-06-25']);

    const oneDay = searchReservationCandidates(exactSearchRequest, {
      reservations: [],
      suspensions: [],
      chambers: [CHAMBER],
      searchWindowDays: 1,
    });
    const twoDayResult = searchReservationCandidateResult(exactSearchRequest, {
      reservations: [],
      suspensions: [],
      chambers: [CHAMBER],
      searchWindowDays: 2,
    });

    expect(oneDay.map((candidate) => candidate.id)).toEqual([
      buildCandidateId(exactSearchRequest, CHAMBER, '2026-06-26', 1, 1),
    ]);
    expect(twoDayResult.requestedDateCandidates).toHaveLength(1);
    expect(twoDayResult.alternativeDateCandidates).toHaveLength(1);
    expect(twoDayResult.candidates).toEqual(twoDayResult.requestedDateCandidates);
  });

  it('allows the chamber scope to be replaced without changing reservation rules', () => {
    const candidates = searchReservationCandidates(exactSearchRequest, {
      reservations: [],
      suspensions: [],
      chambers: [CHAMBERS[1]],
      searchWindowDays: 1,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].chamberId).toBe('tc-02');
  });

  it('allows display ranking and result caps to be customized outside the UI', () => {
    const candidates = searchReservationCandidates(exactSearchRequest, {
      reservations: [],
      suspensions: [],
      chambers: CHAMBERS,
      searchWindowDays: 1,
      maxResults: 2,
      rankCandidates: (items) => [...items].reverse(),
    });

    expect(candidates.map((candidate) => candidate.chamberId)).toEqual(['tc-03', 'tc-02']);
  });

  it('collapses size-only placements to one representative per chamber and date', () => {
    const request: SearchRequest = {
      desiredDate: '2026-06-26',
      selectedBlocks: ['r2c2', 'r2c3'],
      placementMode: 'size',
      cycleCount: 1,
    };

    const candidates = searchReservationCandidates(request, {
      reservations: [],
      suspensions: [],
      chambers: [CHAMBER],
      searchWindowDays: 1,
    });
    const allPlacements = searchReservationCandidates(request, {
      reservations: [],
      suspensions: [],
      chambers: [CHAMBER],
      searchWindowDays: 1,
      sizeModeCandidatePolicy: 'all-placements',
    });

    expect(candidates).toHaveLength(1);
    expect(allPlacements.length).toBeGreaterThan(candidates.length);
    expect(candidates[0].blocks).toEqual(['r2c2', 'r2c3']);
    expect(candidates[0].availablePlacementCount).toBe(allPlacements.length);
    expect(candidates[0].representativeReason).toBe('requested_location');
  });

  it('uses the nearest available placement when the requested size-only location is occupied', () => {
    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: ['r1c1', 'r1c2'],
        placementMode: 'size',
        cycleCount: 1,
      },
      {
        reservations: [reservationWithWindow('requested-location-blocked', ['r1c1', 'r1c2'])],
        suspensions: [],
        chambers: [CHAMBER],
        searchWindowDays: 1,
      },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].blocks).toEqual(['r2c1', 'r2c2']);
    expect(candidates[0].representativeReason).toBe('nearest_available');
  });

  it('keeps one size-only representative candidate per available chamber', () => {
    const candidates = searchReservationCandidates(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: ['r2c2', 'r2c3'],
        placementMode: 'size',
        cycleCount: 1,
      },
      { reservations: [], suspensions: [], chambers: CHAMBERS, searchWindowDays: 1 },
    );

    expect(candidates).toHaveLength(CHAMBERS.length);
    expect(candidates.map((candidate) => candidate.chamberId).sort()).toEqual(['tc-01', 'tc-02', 'tc-03']);
  });

  it('separates requested-date misses from nearby alternative-date candidates', () => {
    const result = searchReservationCandidateResult(
      {
        desiredDate: '2026-06-26',
        selectedBlocks: ['r2c2'],
        placementMode: 'size',
        cycleCount: 1,
      },
      {
        reservations: [
          reservationWithWindow(
            'full-day-block',
            ['r1c1', 'r1c2', 'r1c3', 'r1c4', 'r2c1', 'r2c2', 'r2c3', 'r2c4', 'r3c1', 'r3c2', 'r3c3', 'r3c4'],
          ),
        ],
        suspensions: [],
        chambers: [CHAMBER],
        searchWindowDays: 3,
      },
    );

    expect(result.requestedDateAvailable).toBe(false);
    expect(result.requestedDateCandidates).toHaveLength(0);
    expect(result.alternativeDateCandidates).toHaveLength(1);
    expect(result.candidates).toEqual(result.alternativeDateCandidates);
    expect(result.unavailableReasons[0]?.code).toBe('no_contiguous_placement');
  });

  it('requires explicit matching conditions for fixed-condition chambers', () => {
    const fixedChamber = chamberWithActiveConfig(CHAMBER, {
      ...DEFAULT_FIXED_CONDITION_CONFIG,
      condition: { temperatureC: 40, humidityRh: 80 },
    });
    const baseRequest: SearchRequest = {
      desiredDate: '2026-06-26',
      selectedBlocks: ['r2c2'],
      placementMode: 'exact',
      cycleCount: 1,
      conditionMode: 'environment',
      environmentStartTime: '10:00',
      environmentDurationHours: 2,
    };

    const missingCondition = searchReservationCandidates(baseRequest, {
      reservations: [],
      suspensions: [],
      chambers: [fixedChamber],
      searchWindowDays: 1,
    });
    const mismatchedCondition = searchReservationCandidates(
      { ...baseRequest, requestedCondition: { temperatureC: 25, humidityRh: 93 } },
      { reservations: [], suspensions: [], chambers: [fixedChamber], searchWindowDays: 1 },
    );
    const matchedCondition = searchReservationCandidates(
      { ...baseRequest, requestedCondition: { temperatureC: 40, humidityRh: 80 } },
      { reservations: [], suspensions: [], chambers: [fixedChamber], searchWindowDays: 1 },
    );

    expect(missingCondition).toHaveLength(0);
    expect(mismatchedCondition).toHaveLength(0);
    expect(matchedCondition).toHaveLength(1);
    expect(matchedCondition[0].conditionSummary).toContain('40C');
  });
});

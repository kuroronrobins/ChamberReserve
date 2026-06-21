import { DatabaseSync } from 'node:sqlite';
import type {
  BlockId,
  ChamberConfigRevision,
  ChamberConditionConfig,
  PlacementMode,
  Reservation,
  ReservationDraft,
  SearchRequest,
  SearchConditionMode,
  Suspension,
  SuspensionDraft,
  UserManagedReservationCondition,
} from '../src/domain/types.ts';
import {
  canCommitCandidate,
  canDeleteReservation,
  createReservation,
  getAffectedReservations,
  normalizeCycleCount,
  normalizeTemperatureCycleConfig,
  parseDateKey,
  resolveReservationStatus,
  validateCycleProgram,
  windowsOverlap,
} from '../src/domain/reservationRules.ts';
import { searchReservationCandidateResult, searchReservationCandidates } from '../src/domain/searchEngine.ts';
import {
  archiveConfigRevision,
  getChamber,
  getConfigRevision,
  getReservation,
  insertConfigRevision,
  insertReservation,
  insertSuspension,
  listChambers,
  listConfigRevisions,
  listReservations,
  listSuspensions,
  markReservationDeleted,
  nextConfigRevisionNumber,
  publishConfigRevision,
  updateConfigRevision,
  updateReservation,
} from './db.ts';

export const DEFAULT_NOW_ISO = '2026-06-21T11:00:00+09:00';

export function getChambers(db: DatabaseSync) {
  return listChambers(db);
}

export function getAdminChambers(db: DatabaseSync) {
  return {
    chambers: listChambers(db),
    configRevisions: listConfigRevisions(db),
  };
}

export function searchCandidates(
  db: DatabaseSync,
  input: {
    desiredDate: string;
    selectedBlocks: BlockId[];
    placementMode: PlacementMode;
    conditionMode?: SearchConditionMode;
    cycleCount?: unknown;
    environmentStartTime?: string;
    environmentDurationHours?: number;
    requestedCondition?: UserManagedReservationCondition;
  },
) {
  const request: SearchRequest = {
    desiredDate: input.desiredDate,
    selectedBlocks: input.selectedBlocks,
    placementMode: input.placementMode,
    conditionMode: input.conditionMode,
    cycleCount: normalizeCycleCount(input.cycleCount),
    environmentStartTime: input.environmentStartTime,
    environmentDurationHours: input.environmentDurationHours,
    requestedCondition: input.requestedCondition,
  };
  return searchReservationCandidates(request, {
    reservations: listReservations(db),
    suspensions: listSuspensions(db),
    chambers: listChambers(db),
  });
}

export function searchCandidateResult(
  db: DatabaseSync,
  input: {
    desiredDate: string;
    selectedBlocks: BlockId[];
    placementMode: PlacementMode;
    conditionMode?: SearchConditionMode;
    cycleCount?: unknown;
    environmentStartTime?: string;
    environmentDurationHours?: number;
    requestedCondition?: UserManagedReservationCondition;
  },
) {
  const request: SearchRequest = {
    desiredDate: input.desiredDate,
    selectedBlocks: input.selectedBlocks,
    placementMode: input.placementMode,
    conditionMode: input.conditionMode,
    cycleCount: normalizeCycleCount(input.cycleCount),
    environmentStartTime: input.environmentStartTime,
    environmentDurationHours: input.environmentDurationHours,
    requestedCondition: input.requestedCondition,
  };
  return searchReservationCandidateResult(request, {
    reservations: listReservations(db),
    suspensions: listSuspensions(db),
    chambers: listChambers(db),
  });
}

export function createReservationFromCandidate(
  db: DatabaseSync,
  input: {
    candidateId?: string;
    desiredDate: string;
    selectedBlocks: BlockId[];
    placementMode: PlacementMode;
    conditionMode?: SearchConditionMode;
    cycleCount?: unknown;
    environmentStartTime?: string;
    environmentDurationHours?: number;
    requestedCondition?: UserManagedReservationCondition;
    requester: Reservation['requester'];
    testName: string;
    contactNote?: string;
    nowIso?: string;
  },
) {
  const candidates = searchCandidates(db, input);
  const candidate = input.candidateId
    ? candidates.find((item) => item.id === input.candidateId)
    : candidates[0];
  if (!candidate) {
    return { ok: false as const, status: 409, error: 'candidate_unavailable' };
  }
  const reservations = listReservations(db);
  const suspensions = listSuspensions(db);
  if (!canCommitCandidate(candidate, reservations, suspensions, listChambers(db))) {
    return { ok: false as const, status: 409, error: 'candidate_conflict' };
  }
  const draft: ReservationDraft = {
    candidate,
    requester: input.requester,
    testName: input.testName,
    contactNote: input.contactNote,
    requestedCondition: candidate.requestedCondition ? input.requestedCondition ?? candidate.requestedCondition : undefined,
  };
  const reservation = createReservation(draft, reservations, input.nowIso ?? DEFAULT_NOW_ISO);
  insertReservation(db, reservation);
  return { ok: true as const, reservation };
}

export function lookupReservationByPin(db: DatabaseSync, input: { reservationId: string; pin: string }) {
  const reservation = getReservation(db, input.reservationId);
  if (!reservation || reservation.deletedAt || reservation.pin !== input.pin) {
    return { ok: false as const, status: 404, error: 'reservation_not_found' };
  }
  return { ok: true as const, reservation };
}

export function updateReservationByPin(
  db: DatabaseSync,
  reservationId: string,
  input: {
    pin: string;
    testName: string;
    requester: Reservation['requester'];
    contactNote?: string;
    nowIso?: string;
  },
) {
  const lookup = lookupReservationByPin(db, { reservationId, pin: input.pin });
  if (!lookup.ok) {
    return lookup;
  }
  const reservation = updateReservation(db, reservationId, {
    testName: input.testName,
    requester: input.requester,
    contactNote: input.contactNote,
    updatedAt: input.nowIso ?? DEFAULT_NOW_ISO,
  });
  return { ok: true as const, reservation };
}

export function deleteReservationByPin(
  db: DatabaseSync,
  reservationId: string,
  input: {
    pin: string;
    nowIso?: string;
  },
) {
  const lookup = lookupReservationByPin(db, { reservationId, pin: input.pin });
  if (!lookup.ok) {
    return lookup;
  }
  if (!canDeleteReservation(lookup.reservation, input.nowIso ?? DEFAULT_NOW_ISO)) {
    return { ok: false as const, status: 409, error: 'completed_reservation_delete_blocked' };
  }
  const reservation = markReservationDeleted(db, reservationId, input.nowIso ?? DEFAULT_NOW_ISO);
  return { ok: true as const, reservation };
}

export function getReservationBoard(db: DatabaseSync, date: string) {
  const dateStart = parseDateKey(date).toISOString();
  const dateEnd = new Date(parseDateKey(date).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const boardWindow = {
    loadStart: dateStart,
    loadEnd: dateStart,
    runStart: dateStart,
    runEnd: dateEnd,
    unloadStart: dateEnd,
    unloadEnd: dateEnd,
  };
  const chambers = listChambers(db);
  const reservations = listReservations(db).filter((reservation) => {
    return windowsOverlap(
      { startAt: dateStart, endAt: dateEnd },
      { startAt: reservation.occupiedStartAt, endAt: reservation.occupiedEndAt },
    );
  });
  const suspensions = listSuspensions(db).filter((suspension) => {
    return windowsOverlap(
      { startAt: dateStart, endAt: dateEnd },
      { startAt: suspension.startAt, endAt: suspension.endAt },
    );
  });
  return { chambers, window: boardWindow, reservations, suspensions };
}

export function previewSuspension(db: DatabaseSync, draft: SuspensionDraft) {
  return getAffectedReservations(draft, listReservations(db));
}

export function createSuspension(
  db: DatabaseSync,
  draft: SuspensionDraft & {
    nowIso?: string;
  },
) {
  const affected = previewSuspension(db, draft);
  const suspension: Suspension = {
    id: `SP-${String(listSuspensions(db).length + 1).padStart(3, '0')}`,
    chamberId: draft.chamberId,
    reason: draft.reason,
    startAt: draft.startAt,
    endAt: draft.endAt,
    blocks: draft.blocks,
    createdAt: draft.nowIso ?? DEFAULT_NOW_ISO,
    affectedReservationIds: affected.map((reservation) => reservation.id),
  };
  insertSuspension(db, suspension);

  return { suspension, affectedReservations: affected };
}

export function reservationStatus(reservation: Reservation, nowIso = DEFAULT_NOW_ISO) {
  return resolveReservationStatus(reservation, nowIso);
}

function normalizeConfig(config: ChamberConditionConfig): ChamberConditionConfig {
  return config.type === 'temperature_cycle' ? normalizeTemperatureCycleConfig(config) : config;
}

export function validateChamberConfig(config: ChamberConditionConfig): string[] {
  if (config.type === 'temperature_cycle') {
    return validateCycleProgram(config);
  }
  if (config.type === 'fixed_condition') {
    return Number.isFinite(config.condition.temperatureC) ? [] : ['一定温湿度の温度を入力してください。'];
  }
  const errors: string[] = [];
  if (config.temperatureRange.minC > config.temperatureRange.maxC) {
    errors.push('ユーザー温度範囲の最小値が最大値を超えています。');
  }
  if (config.humidityRange && config.humidityRange.minRh > config.humidityRange.maxRh) {
    errors.push('ユーザー湿度範囲の最小値が最大値を超えています。');
  }
  return errors;
}

export function createChamberConfigRevision(
  db: DatabaseSync,
  input: {
    chamberId: string;
    config: ChamberConditionConfig;
    nowIso?: string;
  },
) {
  const chamber = getChamber(db, input.chamberId);
  if (!chamber) {
    return { ok: false as const, status: 404, error: 'chamber_not_found' };
  }
  const config = normalizeConfig(input.config);
  const errors = validateChamberConfig(config);
  if (errors.length > 0) {
    return { ok: false as const, status: 400, error: 'invalid_chamber_config', details: errors };
  }
  const nowIso = input.nowIso ?? DEFAULT_NOW_ISO;
  const revisionNumber = nextConfigRevisionNumber(db, input.chamberId);
  const revision: ChamberConfigRevision = {
    id: `${input.chamberId}-config-r${revisionNumber}`,
    chamberId: input.chamberId,
    revision: revisionNumber,
    status: 'draft',
    ownership: config.type === 'user_managed_condition' ? 'user_managed' : 'admin_managed',
    adminManagedKind: config.type === 'user_managed_condition' ? undefined : config.type,
    effectiveFrom: nowIso,
    config,
    cyclePeriodMinutes: config.type === 'temperature_cycle' ? config.cyclePeriodMinutes : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  insertConfigRevision(db, revision);
  return { ok: true as const, revision };
}

export function patchChamberConfigRevision(
  db: DatabaseSync,
  revisionId: string,
  input: {
    config: ChamberConditionConfig;
    nowIso?: string;
  },
) {
  const revision = getConfigRevision(db, revisionId);
  if (!revision) {
    return { ok: false as const, status: 404, error: 'config_revision_not_found' };
  }
  const config = normalizeConfig(input.config);
  const errors = validateChamberConfig(config);
  if (errors.length > 0) {
    return { ok: false as const, status: 400, error: 'invalid_chamber_config', details: errors };
  }
  const updated: ChamberConfigRevision = {
    ...revision,
    ownership: config.type === 'user_managed_condition' ? 'user_managed' : 'admin_managed',
    adminManagedKind: config.type === 'user_managed_condition' ? undefined : config.type,
    config,
    cyclePeriodMinutes: config.type === 'temperature_cycle' ? config.cyclePeriodMinutes : undefined,
    updatedAt: input.nowIso ?? DEFAULT_NOW_ISO,
  };
  updateConfigRevision(db, updated);
  return { ok: true as const, revision: updated };
}

export function publishChamberConfig(db: DatabaseSync, revisionId: string, nowIso = DEFAULT_NOW_ISO) {
  const revision = publishConfigRevision(db, revisionId, nowIso);
  return {
    revision,
    chambers: listChambers(db),
    configRevisions: listConfigRevisions(db),
  };
}

export function archiveChamberConfig(db: DatabaseSync, revisionId: string, nowIso = DEFAULT_NOW_ISO) {
  const revision = archiveConfigRevision(db, revisionId, nowIso);
  return {
    revision,
    chambers: listChambers(db),
    configRevisions: listConfigRevisions(db),
  };
}

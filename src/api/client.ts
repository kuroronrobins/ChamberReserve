import type {
  BlockId,
  Candidate,
  Chamber,
  ChamberConditionConfig,
  ChamberConfigRevision,
  CycleCount,
  PlacementMode,
  Reservation,
  Requester,
  SearchConditionMode,
  Suspension,
  SuspensionDraft,
  UserManagedReservationCondition,
} from '../domain/types';
import type { CandidateSearchResult } from '../domain/searchEngine';

const API_BASE = (import.meta.env.VITE_CHAMBERRESERVE_API_BASE_URL ?? '/api').replace(/\/$/, '');

interface ApiState {
  chambers: Chamber[];
  configRevisions?: ChamberConfigRevision[];
  reservations: Reservation[];
  suspensions: Suspension[];
  nowIso: string;
}

interface ApiBoard {
  chambers: Chamber[];
  reservations: Reservation[];
  suspensions: Suspension[];
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error ?? `request_failed_${response.status}`);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  return payload as T;
}

export function fetchServerState(): Promise<ApiState & { ok: true }> {
  return requestJson<ApiState & { ok: true }>('/state');
}

export async function fetchReservationBoard(date: string): Promise<ApiBoard> {
  const payload = await requestJson<{ ok: true; board: ApiBoard }>(`/reservation-board?date=${encodeURIComponent(date)}`);
  return payload.board;
}

export async function fetchCandidates(input: {
  desiredDate: string;
  selectedBlocks: BlockId[];
  placementMode: PlacementMode;
  conditionMode?: SearchConditionMode;
  cycleCount: CycleCount;
  environmentStartTime?: string;
  environmentDurationHours?: number;
  requestedCondition?: UserManagedReservationCondition;
}): Promise<Candidate[]> {
  const payload = await requestJson<{ ok: true; candidates: Candidate[] }>('/reservation-candidates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.candidates;
}

export async function fetchCandidateResult(input: {
  desiredDate: string;
  selectedBlocks: BlockId[];
  placementMode: PlacementMode;
  conditionMode?: SearchConditionMode;
  cycleCount: CycleCount;
  environmentStartTime?: string;
  environmentDurationHours?: number;
  requestedCondition?: UserManagedReservationCondition;
}): Promise<CandidateSearchResult> {
  const payload = await requestJson<{
    ok: true;
    candidates: Candidate[];
    result?: CandidateSearchResult;
  }>('/reservation-candidates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.result ?? {
    requestedDate: input.desiredDate,
    requestedDateCandidates: payload.candidates,
    alternativeDateCandidates: [],
    candidates: payload.candidates,
    requestedDateAvailable: payload.candidates.length > 0,
    unavailableReasons: [],
  };
}

export async function createReservationApi(input: {
  candidateId: string;
  desiredDate: string;
  selectedBlocks: BlockId[];
  placementMode: PlacementMode;
  conditionMode?: SearchConditionMode;
  cycleCount: CycleCount;
  environmentStartTime?: string;
  environmentDurationHours?: number;
  requestedCondition?: UserManagedReservationCondition;
  requester: Requester;
  testName: string;
  contactNote?: string;
}): Promise<Reservation> {
  const payload = await requestJson<{ ok: true; reservation: Reservation }>('/reservations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.reservation;
}

export async function lookupReservationApi(input: { reservationId: string; pin: string }): Promise<Reservation> {
  const payload = await requestJson<{ ok: true; reservation: Reservation }>('/reservations/lookup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.reservation;
}

export async function updateReservationApi(input: {
  reservationId: string;
  pin: string;
  requester: Requester;
  testName: string;
  contactNote?: string;
}): Promise<Reservation> {
  const payload = await requestJson<{ ok: true; reservation: Reservation }>(`/reservations/${encodeURIComponent(input.reservationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pin: input.pin,
      requester: input.requester,
      testName: input.testName,
      contactNote: input.contactNote,
    }),
  });
  return payload.reservation;
}

export async function deleteReservationApi(input: { reservationId: string; pin: string }): Promise<Reservation> {
  const payload = await requestJson<{ ok: true; reservation: Reservation }>(`/reservations/${encodeURIComponent(input.reservationId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ pin: input.pin }),
  });
  return payload.reservation;
}

export async function previewSuspensionApi(draft: SuspensionDraft): Promise<Reservation[]> {
  const payload = await requestJson<{ ok: true; affectedReservations: Reservation[] }>('/suspensions/preview', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return payload.affectedReservations;
}

export async function createSuspensionApi(draft: SuspensionDraft): Promise<{
  suspension: Suspension;
  affectedReservations: Reservation[];
}> {
  const payload = await requestJson<{
    ok: true;
    suspension: Suspension;
    affectedReservations: Reservation[];
  }>('/suspensions', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return {
    suspension: payload.suspension,
    affectedReservations: payload.affectedReservations,
  };
}

export async function fetchAdminChambersApi(): Promise<{
  chambers: Chamber[];
  configRevisions: ChamberConfigRevision[];
}> {
  const payload = await requestJson<{
    ok: true;
    chambers: Chamber[];
    configRevisions: ChamberConfigRevision[];
  }>('/admin/chambers');
  return {
    chambers: payload.chambers,
    configRevisions: payload.configRevisions,
  };
}

export async function validateChamberConfigApi(config: ChamberConditionConfig): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const payload = await requestJson<{ ok: true; valid: boolean; errors: string[] }>('/admin/chamber-config/validate', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  return {
    valid: payload.valid,
    errors: payload.errors,
  };
}

export async function createChamberConfigRevisionApi(
  chamberId: string,
  config: ChamberConditionConfig,
): Promise<ChamberConfigRevision> {
  const payload = await requestJson<{ ok: true; revision: ChamberConfigRevision }>(
    `/admin/chambers/${encodeURIComponent(chamberId)}/config-revisions`,
    {
      method: 'POST',
      body: JSON.stringify({ config }),
    },
  );
  return payload.revision;
}

export async function patchChamberConfigRevisionApi(
  chamberId: string,
  revisionId: string,
  config: ChamberConditionConfig,
): Promise<ChamberConfigRevision> {
  const payload = await requestJson<{ ok: true; revision: ChamberConfigRevision }>(
    `/admin/chambers/${encodeURIComponent(chamberId)}/config-revisions/${encodeURIComponent(revisionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ config }),
    },
  );
  return payload.revision;
}

export async function publishChamberConfigRevisionApi(
  chamberId: string,
  revisionId: string,
): Promise<{
  revision: ChamberConfigRevision;
  chambers: Chamber[];
  configRevisions: ChamberConfigRevision[];
}> {
  const payload = await requestJson<{
    ok: true;
    revision: ChamberConfigRevision;
    chambers: Chamber[];
    configRevisions: ChamberConfigRevision[];
  }>(
    `/admin/chambers/${encodeURIComponent(chamberId)}/config-revisions/${encodeURIComponent(revisionId)}/publish`,
    { method: 'POST' },
  );
  return {
    revision: payload.revision,
    chambers: payload.chambers,
    configRevisions: payload.configRevisions,
  };
}

export async function archiveChamberConfigRevisionApi(
  chamberId: string,
  revisionId: string,
): Promise<{
  revision: ChamberConfigRevision;
  chambers: Chamber[];
  configRevisions: ChamberConfigRevision[];
}> {
  const payload = await requestJson<{
    ok: true;
    revision: ChamberConfigRevision;
    chambers: Chamber[];
    configRevisions: ChamberConfigRevision[];
  }>(
    `/admin/chambers/${encodeURIComponent(chamberId)}/config-revisions/${encodeURIComponent(revisionId)}/archive`,
    { method: 'POST' },
  );
  return {
    revision: payload.revision,
    chambers: payload.chambers,
    configRevisions: payload.configRevisions,
  };
}

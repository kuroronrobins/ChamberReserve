import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { openDatabase, listReservations, listSuspensions } from './db.ts';
import type { ChamberConditionConfig, UserManagedReservationCondition } from '../src/domain/types.ts';
import {
  archiveChamberConfig,
  createChamberConfigRevision,
  createReservationFromCandidate,
  createSuspension,
  DEFAULT_NOW_ISO,
  deleteReservationByPin,
  getAdminChambers,
  getChambers,
  getReservationBoard,
  lookupReservationByPin,
  patchChamberConfigRevision,
  previewSuspension,
  publishChamberConfig,
  searchCandidateResult,
  updateReservationByPin,
  validateChamberConfig,
} from './service.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '8798';
const JSON_LIMIT_BYTES = 1024 * 1024;

const host = process.env.CHAMBERRESERVE_API_HOST ?? DEFAULT_HOST;
const port = Number(process.env.CHAMBERRESERVE_API_PORT ?? DEFAULT_PORT);
const dbPath = process.env.CHAMBERRESERVE_DB_PATH ?? 'data/chamberreserve.sqlite';
const { db, close } = openDatabase(dbPath);

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, code: string, detail?: string) {
  sendJson(res, status, { ok: false, error: code, detail });
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > JSON_LIMIT_BYTES) {
        reject(new Error('request_body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRequestedCondition(value: unknown): UserManagedReservationCondition | undefined {
  const body = asRecord(value);
  const temperatureC = Number(body.temperatureC);
  if (!Number.isFinite(temperatureC)) {
    return undefined;
  }
  const humidityRh = body.humidityRh === undefined || body.humidityRh === null || body.humidityRh === ''
    ? undefined
    : Number(body.humidityRh);
  return {
    temperatureC,
    ...(humidityRh === undefined || !Number.isFinite(humidityRh) ? {} : { humidityRh }),
  };
}

function readConfig(value: unknown): ChamberConditionConfig | null {
  const config = asRecord(value);
  if (
    config.type === 'temperature_cycle'
    || config.type === 'fixed_condition'
    || config.type === 'user_managed_condition'
  ) {
    return config as unknown as ChamberConditionConfig;
  }
  return null;
}

function reservationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/reservations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function adminConfigCreatePath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/admin\/chambers\/([^/]+)\/config-revisions$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function adminConfigRevisionPath(pathname: string): { chamberId: string; revisionId: string } | null {
  const match = pathname.match(/^\/api\/admin\/chambers\/([^/]+)\/config-revisions\/([^/]+)$/);
  return match ? { chamberId: decodeURIComponent(match[1]), revisionId: decodeURIComponent(match[2]) } : null;
}

function adminConfigActionPath(pathname: string): { chamberId: string; revisionId: string; action: 'publish' | 'archive' } | null {
  const match = pathname.match(/^\/api\/admin\/chambers\/([^/]+)\/config-revisions\/([^/]+)\/(publish|archive)$/);
  return match
    ? {
      chamberId: decodeURIComponent(match[1]),
      revisionId: decodeURIComponent(match[2]),
      action: match[3] as 'publish' | 'archive',
    }
    : null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const requestUrl = new URL(req.url ?? '/', `http://${host}:${port}`);
  const pathname = requestUrl.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        app: 'ChamberReserve',
        mode: 'phase2-api',
        dbPath,
        nowIso: DEFAULT_NOW_ISO,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/chambers') {
      sendJson(res, 200, { ok: true, chambers: getChambers(db) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const adminState = getAdminChambers(db);
      sendJson(res, 200, {
        ok: true,
        chambers: adminState.chambers,
        configRevisions: adminState.configRevisions,
        reservations: listReservations(db),
        suspensions: listSuspensions(db),
        nowIso: DEFAULT_NOW_ISO,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/reservation-board') {
      const date = requestUrl.searchParams.get('date');
      if (!date) {
        sendError(res, 400, 'missing_date');
        return;
      }
      sendJson(res, 200, { ok: true, board: getReservationBoard(db, date) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/reservation-candidates') {
      const body = asRecord(await readJson(req));
      const result = searchCandidateResult(db, {
        desiredDate: String(body.desiredDate ?? ''),
        selectedBlocks: Array.isArray(body.selectedBlocks) ? body.selectedBlocks as never[] : [],
        placementMode: body.placementMode === 'exact' ? 'exact' : 'size',
        conditionMode: body.conditionMode === 'environment' ? 'environment' : 'cycle',
        cycleCount: body.cycleCount,
        environmentStartTime: typeof body.environmentStartTime === 'string' ? body.environmentStartTime : undefined,
        environmentDurationHours: body.environmentDurationHours === undefined ? undefined : Number(body.environmentDurationHours),
        requestedCondition: readRequestedCondition(body.requestedCondition),
      });
      sendJson(res, 200, { ok: true, candidates: result.candidates, result });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/reservations') {
      const body = asRecord(await readJson(req));
      const requester = asRecord(body.requester);
      const result = createReservationFromCandidate(db, {
        candidateId: typeof body.candidateId === 'string' ? body.candidateId : undefined,
        desiredDate: String(body.desiredDate ?? ''),
        selectedBlocks: Array.isArray(body.selectedBlocks) ? body.selectedBlocks as never[] : [],
        placementMode: body.placementMode === 'exact' ? 'exact' : 'size',
        conditionMode: body.conditionMode === 'environment' ? 'environment' : 'cycle',
        cycleCount: body.cycleCount,
        environmentStartTime: typeof body.environmentStartTime === 'string' ? body.environmentStartTime : undefined,
        environmentDurationHours: body.environmentDurationHours === undefined ? undefined : Number(body.environmentDurationHours),
        requestedCondition: readRequestedCondition(body.requestedCondition),
        requester: {
          name: String(requester.name ?? ''),
          department: String(requester.department ?? ''),
          contact: typeof requester.contact === 'string' ? requester.contact : undefined,
        },
        testName: String(body.testName ?? ''),
        contactNote: typeof body.contactNote === 'string' ? body.contactNote : undefined,
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      if (!result.ok) {
        sendError(res, result.status, result.error);
        return;
      }
      sendJson(res, 201, { ok: true, reservation: result.reservation });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/reservations/lookup') {
      const body = asRecord(await readJson(req));
      const result = lookupReservationByPin(db, {
        reservationId: String(body.reservationId ?? ''),
        pin: String(body.pin ?? ''),
      });
      if (!result.ok) {
        sendError(res, result.status, result.error);
        return;
      }
      sendJson(res, 200, { ok: true, reservation: result.reservation });
      return;
    }

    const reservationId = reservationIdFromPath(pathname);
    if (reservationId && req.method === 'PATCH') {
      const body = asRecord(await readJson(req));
      const requester = asRecord(body.requester);
      const result = updateReservationByPin(db, reservationId, {
        pin: String(body.pin ?? ''),
        testName: String(body.testName ?? ''),
        requester: {
          name: String(requester.name ?? ''),
          department: String(requester.department ?? ''),
          contact: typeof requester.contact === 'string' ? requester.contact : undefined,
        },
        contactNote: typeof body.contactNote === 'string' ? body.contactNote : undefined,
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      if (!result.ok) {
        sendError(res, result.status, result.error);
        return;
      }
      sendJson(res, 200, { ok: true, reservation: result.reservation });
      return;
    }

    if (reservationId && req.method === 'DELETE') {
      const body = asRecord(await readJson(req));
      const result = deleteReservationByPin(db, reservationId, {
        pin: String(body.pin ?? ''),
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      if (!result.ok) {
        sendError(res, result.status, result.error);
        return;
      }
      sendJson(res, 200, { ok: true, reservation: result.reservation });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/suspensions/preview') {
      const body = asRecord(await readJson(req));
      const affectedReservations = previewSuspension(db, {
        chamberId: String(body.chamberId ?? ''),
        reason: String(body.reason ?? ''),
        startAt: String(body.startAt ?? ''),
        endAt: String(body.endAt ?? ''),
        blocks: body.blocks === 'all' ? 'all' : Array.isArray(body.blocks) ? body.blocks as never[] : [],
      });
      sendJson(res, 200, { ok: true, affectedReservations });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/suspensions') {
      const body = asRecord(await readJson(req));
      const result = createSuspension(db, {
        chamberId: String(body.chamberId ?? ''),
        reason: String(body.reason ?? ''),
        startAt: String(body.startAt ?? ''),
        endAt: String(body.endAt ?? ''),
        blocks: body.blocks === 'all' ? 'all' : Array.isArray(body.blocks) ? body.blocks as never[] : [],
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      sendJson(res, 201, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/chambers') {
      sendJson(res, 200, { ok: true, ...getAdminChambers(db) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/chamber-config/validate') {
      const body = asRecord(await readJson(req));
      const config = readConfig(body.config);
      if (!config) {
        sendJson(res, 400, { ok: false, error: 'invalid_chamber_config', details: ['設定種別を選択してください。'] });
        return;
      }
      const errors = validateChamberConfig(config);
      sendJson(res, 200, { ok: true, valid: errors.length === 0, errors });
      return;
    }

    const createConfigChamberId = adminConfigCreatePath(pathname);
    if (createConfigChamberId && req.method === 'POST') {
      const body = asRecord(await readJson(req));
      const config = readConfig(body.config);
      if (!config) {
        sendJson(res, 400, { ok: false, error: 'invalid_chamber_config', details: ['設定種別を選択してください。'] });
        return;
      }
      const result = createChamberConfigRevision(db, {
        chamberId: createConfigChamberId,
        config,
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error, details: 'details' in result ? result.details : undefined });
        return;
      }
      sendJson(res, 201, { ok: true, revision: result.revision });
      return;
    }

    const configRevision = adminConfigRevisionPath(pathname);
    if (configRevision && req.method === 'PATCH') {
      const body = asRecord(await readJson(req));
      const config = readConfig(body.config);
      if (!config) {
        sendJson(res, 400, { ok: false, error: 'invalid_chamber_config', details: ['設定種別を選択してください。'] });
        return;
      }
      const result = patchChamberConfigRevision(db, configRevision.revisionId, {
        config,
        nowIso: typeof body.nowIso === 'string' ? body.nowIso : undefined,
      });
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error, details: 'details' in result ? result.details : undefined });
        return;
      }
      sendJson(res, 200, { ok: true, revision: result.revision });
      return;
    }

    const configAction = adminConfigActionPath(pathname);
    if (configAction && req.method === 'POST') {
      const result = configAction.action === 'publish'
        ? publishChamberConfig(db, configAction.revisionId, DEFAULT_NOW_ISO)
        : archiveChamberConfig(db, configAction.revisionId, DEFAULT_NOW_ISO);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendError(res, 404, 'not_found');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'invalid_json' ? 400 : message === 'request_body_too_large' ? 413 : 500;
    sendError(res, status, message);
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

function shutdown() {
  server.close(() => {
    close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, host, () => {
  console.log(`ChamberReserve API listening at http://${host}:${port}/api/health`);
});

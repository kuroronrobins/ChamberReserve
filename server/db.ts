import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BLOCK_COLUMNS, BLOCK_ROWS, CHAMBER, CHAMBERS, buildInitialConfigRevision } from '../src/domain/chamber.ts';
import { buildCycleWindow } from '../src/domain/reservationRules.ts';
import type {
  BlockId,
  Chamber,
  ChamberConfigRevision,
  ChamberConditionConfig,
  Reservation,
  Suspension,
  UserManagedReservationCondition,
} from '../src/domain/types.ts';

function initialReservationWindow(chamber: Chamber, dateKey: string) {
  const config = chamber.activeConfigRevision.config;
  if (config.type === 'temperature_cycle') {
    const window = buildCycleWindow(dateKey, config);
    return { occupiedStartAt: window.loadStart, occupiedEndAt: window.unloadEnd };
  }
  const startAt = new Date(`${dateKey}T09:00:00`).toISOString();
  const endAt = new Date(`${dateKey}T17:00:00`).toISOString();
  return { occupiedStartAt: startAt, occupiedEndAt: endAt };
}

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'CR-260620-001',
    chamberId: CHAMBER.id,
    testName: '電源基板サイクル評価',
    requester: {
      name: '佐藤',
      department: '信頼性評価',
      contact: 'sato@example.local',
    },
    blocks: ['r2c1', 'r2c2'],
    ...initialReservationWindow(CHAMBER, '2026-06-20'),
    pin: '1357',
    createdAt: '2026-06-20T08:15:00+09:00',
  },
  {
    id: 'CR-260618-001',
    chamberId: CHAMBER.id,
    testName: 'センサー湿度確認',
    requester: {
      name: '山本',
      department: '品質保証',
      contact: 'yamamoto@example.local',
    },
    blocks: ['r1c1', 'r1c2'],
    ...initialReservationWindow(CHAMBER, '2026-06-18'),
    pin: '2468',
    createdAt: '2026-06-18T08:25:00+09:00',
  },
  {
    id: 'CR-260624-001',
    chamberId: CHAMBER.id,
    testName: '通信モジュール高温起動',
    requester: {
      name: '鈴木',
      department: '製品開発',
      contact: 'suzuki@example.local',
    },
    blocks: ['r1c1', 'r1c2'],
    ...initialReservationWindow(CHAMBER, '2026-06-24'),
    pin: '8642',
    createdAt: '2026-06-20T16:40:00+09:00',
  },
  {
    id: 'CR-260624-002',
    chamberId: 'tc-02',
    testName: '電源ユニット温湿度サイクル',
    requester: {
      name: '高橋',
      department: '製品開発',
      contact: 'takahashi@example.local',
    },
    blocks: ['r3c1', 'r3c2'],
    ...initialReservationWindow(CHAMBERS[1], '2026-06-24'),
    pin: '9753',
    createdAt: '2026-06-20T17:05:00+09:00',
  },
  {
    id: 'CR-260625-001',
    chamberId: 'tc-03',
    testName: '量産前サイクル',
    requester: {
      name: '伊藤',
      department: '信頼性評価',
      contact: 'ito@example.local',
    },
    blocks: ['r1c3', 'r1c4'],
    ...initialReservationWindow(CHAMBERS[2], '2026-06-25'),
    pin: '6420',
    createdAt: '2026-06-20T17:20:00+09:00',
  },
];

export interface ChamberReserveDatabase {
  db: DatabaseSync;
  close: () => void;
}

export function openDatabase(dbPath = 'data/chamberreserve.sqlite'): ChamberReserveDatabase {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  applySchema(db);
  seedInitialData(db);
  return {
    db,
    close: () => db.close(),
  };
}

function applySchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chambers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      block_rows INTEGER NOT NULL DEFAULT 3,
      block_columns INTEGER NOT NULL DEFAULT 4,
      active_config_revision_id TEXT,
      standard_cycle_json TEXT
    );

    CREATE TABLE IF NOT EXISTS chamber_config_revisions (
      id TEXT PRIMARY KEY,
      chamber_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      ownership TEXT NOT NULL,
      admin_managed_kind TEXT,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      config_json TEXT NOT NULL,
      cycle_period_minutes INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      FOREIGN KEY (chamber_id) REFERENCES chambers(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      chamber_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_department TEXT NOT NULL,
      requester_contact TEXT NOT NULL DEFAULT '',
      contact_note TEXT NOT NULL DEFAULT '',
      occupied_start_at TEXT NOT NULL DEFAULT '',
      occupied_end_at TEXT NOT NULL DEFAULT '',
      requested_condition_json TEXT,
      pin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (chamber_id) REFERENCES chambers(id)
    );

    CREATE TABLE IF NOT EXISTS reservation_blocks (
      reservation_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      PRIMARY KEY (reservation_id, block_id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suspensions (
      id TEXT PRIMARY KEY,
      chamber_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      all_blocks INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chamber_id) REFERENCES chambers(id)
    );

    CREATE TABLE IF NOT EXISTS suspension_blocks (
      suspension_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      PRIMARY KEY (suspension_id, block_id),
      FOREIGN KEY (suspension_id) REFERENCES suspensions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservation_suspension_impacts (
      reservation_id TEXT NOT NULL,
      suspension_id TEXT NOT NULL,
      PRIMARY KEY (reservation_id, suspension_id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (suspension_id) REFERENCES suspensions(id) ON DELETE CASCADE
    );
  `);
  ensureChamberColumns(db);
  ensureReservationColumns(db);
}

function tableColumns(db: DatabaseSync, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string) {
  if (!tableColumns(db, tableName).includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureChamberColumns(db: DatabaseSync) {
  ensureColumn(db, 'chambers', 'block_rows', 'INTEGER NOT NULL DEFAULT 3');
  ensureColumn(db, 'chambers', 'block_columns', 'INTEGER NOT NULL DEFAULT 4');
  ensureColumn(db, 'chambers', 'active_config_revision_id', 'TEXT');
  ensureColumn(db, 'chambers', 'standard_cycle_json', 'TEXT');
}

function ensureReservationColumns(db: DatabaseSync) {
  ensureColumn(db, 'reservations', 'requester_contact', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'reservations', 'contact_note', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'reservations', 'occupied_start_at', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'reservations', 'occupied_end_at', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'reservations', 'requested_condition_json', 'TEXT');

  const columns = tableColumns(db, 'reservations');
  if (columns.includes('window_json')) {
    const rows = db.prepare(`
      SELECT id, window_json, occupied_start_at, occupied_end_at
      FROM reservations
      WHERE (occupied_start_at = '' OR occupied_end_at = '') AND window_json IS NOT NULL
    `).all() as Array<{ id: string; window_json: string; occupied_start_at: string; occupied_end_at: string }>;
    for (const row of rows) {
      try {
        const window = JSON.parse(row.window_json) as { loadStart?: string; unloadEnd?: string };
        if (window.loadStart && window.unloadEnd) {
          db.prepare('UPDATE reservations SET occupied_start_at = ?, occupied_end_at = ? WHERE id = ?')
            .run(window.loadStart, window.unloadEnd, row.id);
        }
      } catch {
        // Leave malformed legacy rows untouched; rowToReservation has a safe fallback.
      }
    }
  }
}

function seedInitialData(db: DatabaseSync) {
  for (const chamber of CHAMBERS) {
    const chamberExists = db.prepare('SELECT id FROM chambers WHERE id = ?').get(chamber.id);
    if (!chamberExists) {
      db.prepare(`
        INSERT INTO chambers (
          id, name, type, location, block_rows, block_columns, active_config_revision_id, standard_cycle_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chamber.id,
        chamber.name,
        chamber.type,
        chamber.location,
        chamber.blockLayout.rows,
        chamber.blockLayout.columns,
        chamber.activeConfigRevisionId,
        JSON.stringify(chamber.activeConfigRevision.config),
      );
    } else {
      db.prepare(`
        UPDATE chambers
        SET name = ?, type = ?, location = ?, block_rows = ?, block_columns = ?,
            active_config_revision_id = COALESCE(active_config_revision_id, ?)
        WHERE id = ?
      `).run(
        chamber.name,
        chamber.type,
        chamber.location,
        chamber.blockLayout.rows,
        chamber.blockLayout.columns,
        chamber.activeConfigRevisionId,
        chamber.id,
      );
    }

    if (!getConfigRevision(db, chamber.activeConfigRevision.id)) {
      insertConfigRevision(db, chamber.activeConfigRevision);
    }
    db.prepare('UPDATE chambers SET active_config_revision_id = ? WHERE id = ?')
      .run(chamber.activeConfigRevision.id, chamber.id);
  }

  for (const reservation of INITIAL_RESERVATIONS) {
    if (db.prepare('SELECT id FROM reservations WHERE id = ?').get(reservation.id)) {
      continue;
    }
    insertReservation(db, reservation);
  }
}

export function listChambers(db: DatabaseSync): Chamber[] {
  const rows = db.prepare(`
    SELECT id, name, type, location, block_rows, block_columns, active_config_revision_id
    FROM chambers
    ORDER BY id
  `).all() as unknown as ChamberRow[];
  return rows.map((row) => rowToChamber(db, row));
}

export function getChamber(db: DatabaseSync, chamberId: string): Chamber | null {
  const row = db.prepare(`
    SELECT id, name, type, location, block_rows, block_columns, active_config_revision_id
    FROM chambers
    WHERE id = ?
  `).get(chamberId) as ChamberRow | undefined;
  return row ? rowToChamber(db, row) : null;
}

export function listConfigRevisions(db: DatabaseSync, chamberId?: string): ChamberConfigRevision[] {
  const rows = chamberId
    ? db.prepare(`
      SELECT * FROM chamber_config_revisions
      WHERE chamber_id = ?
      ORDER BY revision DESC
    `).all(chamberId)
    : db.prepare(`
      SELECT * FROM chamber_config_revisions
      ORDER BY chamber_id, revision DESC
    `).all();
  return (rows as unknown as ChamberConfigRevisionRow[]).map(rowToConfigRevision);
}

export function getConfigRevision(db: DatabaseSync, revisionId: string): ChamberConfigRevision | null {
  const row = db.prepare('SELECT * FROM chamber_config_revisions WHERE id = ?').get(revisionId) as ChamberConfigRevisionRow | undefined;
  return row ? rowToConfigRevision(row) : null;
}

export function insertConfigRevision(db: DatabaseSync, revision: ChamberConfigRevision) {
  db.prepare(`
    INSERT INTO chamber_config_revisions (
      id, chamber_id, revision, status, ownership, admin_managed_kind, effective_from, effective_to,
      config_json, cycle_period_minutes, created_at, updated_at, published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    revision.id,
    revision.chamberId,
    revision.revision,
    revision.status,
    revision.ownership,
    revision.adminManagedKind ?? null,
    revision.effectiveFrom,
    revision.effectiveTo ?? null,
    JSON.stringify(revision.config),
    revision.cyclePeriodMinutes ?? null,
    revision.createdAt,
    revision.updatedAt,
    revision.publishedAt ?? null,
  );
}

export function updateConfigRevision(db: DatabaseSync, revision: ChamberConfigRevision) {
  db.prepare(`
    UPDATE chamber_config_revisions
    SET status = ?, ownership = ?, admin_managed_kind = ?, effective_from = ?, effective_to = ?,
        config_json = ?, cycle_period_minutes = ?, updated_at = ?, published_at = ?
    WHERE id = ?
  `).run(
    revision.status,
    revision.ownership,
    revision.adminManagedKind ?? null,
    revision.effectiveFrom,
    revision.effectiveTo ?? null,
    JSON.stringify(revision.config),
    revision.cyclePeriodMinutes ?? null,
    revision.updatedAt,
    revision.publishedAt ?? null,
    revision.id,
  );
}

export function publishConfigRevision(db: DatabaseSync, revisionId: string, publishedAt: string): ChamberConfigRevision {
  const revision = getConfigRevision(db, revisionId);
  if (!revision) {
    throw new Error(`Config revision not found: ${revisionId}`);
  }
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE chamber_config_revisions
      SET status = 'archived', effective_to = ?, updated_at = ?
      WHERE chamber_id = ? AND status = 'active' AND id <> ?
    `).run(publishedAt, publishedAt, revision.chamberId, revisionId);
    const activeRevision: ChamberConfigRevision = {
      ...revision,
      status: 'active',
      effectiveFrom: revision.effectiveFrom || publishedAt,
      updatedAt: publishedAt,
      publishedAt,
    };
    updateConfigRevision(db, activeRevision);
    db.prepare('UPDATE chambers SET active_config_revision_id = ?, type = ? WHERE id = ?')
      .run(activeRevision.id, activeRevision.config.type, activeRevision.chamberId);
    db.exec('COMMIT');
    return activeRevision;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function archiveConfigRevision(db: DatabaseSync, revisionId: string, archivedAt: string): ChamberConfigRevision {
  const revision = getConfigRevision(db, revisionId);
  if (!revision) {
    throw new Error(`Config revision not found: ${revisionId}`);
  }
  const archived: ChamberConfigRevision = {
    ...revision,
    status: 'archived',
    effectiveTo: archivedAt,
    updatedAt: archivedAt,
  };
  updateConfigRevision(db, archived);
  return archived;
}

export function nextConfigRevisionNumber(db: DatabaseSync, chamberId: string): number {
  const row = db.prepare('SELECT MAX(revision) AS max_revision FROM chamber_config_revisions WHERE chamber_id = ?')
    .get(chamberId) as { max_revision: number | null } | undefined;
  return (row?.max_revision ?? 0) + 1;
}

function rowToChamber(db: DatabaseSync, row: ChamberRow): Chamber {
  const activeConfigRevision = row.active_config_revision_id
    ? getConfigRevision(db, row.active_config_revision_id)
    : null;
  const fallback = buildInitialConfigRevision(row.id);
  const revision = activeConfigRevision ?? fallback;
  return {
    id: row.id,
    name: row.name,
    type: revision.config.type,
    location: row.location,
    blockLayout: {
      rows: row.block_rows ?? BLOCK_ROWS,
      columns: row.block_columns ?? BLOCK_COLUMNS,
    },
    activeConfigRevisionId: revision.id,
    activeConfigRevision: revision,
  };
}

function rowToConfigRevision(row: ChamberConfigRevisionRow): ChamberConfigRevision {
  const config = JSON.parse(row.config_json) as ChamberConditionConfig;
  return {
    id: row.id,
    chamberId: row.chamber_id,
    revision: row.revision,
    status: row.status,
    ownership: row.ownership,
    adminManagedKind: row.admin_managed_kind ?? undefined,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    config,
    cyclePeriodMinutes: row.cycle_period_minutes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
  };
}

export function listReservations(db: DatabaseSync): Reservation[] {
  const rows = db.prepare('SELECT * FROM reservations').all() as unknown as ReservationRow[];
  return rows.map((row) => rowToReservation(db, row));
}

export function getReservation(db: DatabaseSync, id: string): Reservation | null {
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as ReservationRow | undefined;
  return row ? rowToReservation(db, row) : null;
}

export function insertReservation(db: DatabaseSync, reservation: Reservation) {
  const columns = tableColumns(db, 'reservations');
  const values: Record<string, unknown> = {
    id: reservation.id,
    chamber_id: reservation.chamberId,
    test_name: reservation.testName,
    requester_name: reservation.requester.name,
    requester_department: reservation.requester.department,
    requester_contact: reservation.requester.contact ?? '',
    contact_note: reservation.contactNote ?? '',
    occupied_start_at: reservation.occupiedStartAt,
    occupied_end_at: reservation.occupiedEndAt,
    requested_condition_json: reservation.requestedCondition ? JSON.stringify(reservation.requestedCondition) : null,
    pin: reservation.pin,
    created_at: reservation.createdAt,
    updated_at: reservation.updatedAt ?? null,
    deleted_at: reservation.deletedAt ?? null,
  };
  if (columns.includes('window_json')) {
    values.window_json = JSON.stringify({
      loadStart: reservation.occupiedStartAt,
      loadEnd: reservation.occupiedStartAt,
      runStart: reservation.occupiedStartAt,
      runEnd: reservation.occupiedEndAt,
      unloadStart: reservation.occupiedEndAt,
      unloadEnd: reservation.occupiedEndAt,
    });
  }
  if (columns.includes('cycle_count')) {
    values.cycle_count = 1;
  }
  const insertColumns = Object.keys(values).filter((column) => columns.includes(column));
  const placeholders = insertColumns.map(() => '?').join(', ');
  db.prepare(`
    INSERT INTO reservations (${insertColumns.join(', ')})
    VALUES (${placeholders})
  `).run(...insertColumns.map((column) => values[column] as string | number | null));
  replaceReservationBlocks(db, reservation.id, reservation.blocks);
  replaceReservationImpacts(db, reservation.id, reservation.impactedBySuspensionIds ?? []);
}

export function updateReservation(
  db: DatabaseSync,
  reservationId: string,
  input: {
    testName: string;
    requester: Reservation['requester'];
    contactNote?: string;
    updatedAt: string;
  },
): Reservation {
  db.prepare(`
    UPDATE reservations
    SET test_name = ?, requester_name = ?, requester_department = ?, requester_contact = ?,
        contact_note = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.testName,
    input.requester.name,
    input.requester.department,
    input.requester.contact ?? '',
    input.contactNote ?? '',
    input.updatedAt,
    reservationId,
  );
  const updated = getReservation(db, reservationId);
  if (!updated) {
    throw new Error(`Reservation not found after update: ${reservationId}`);
  }
  return updated;
}

export function markReservationDeleted(db: DatabaseSync, reservationId: string, deletedAt: string): Reservation {
  db.prepare('UPDATE reservations SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, reservationId);
  const updated = getReservation(db, reservationId);
  if (!updated) {
    throw new Error(`Reservation not found after delete: ${reservationId}`);
  }
  return updated;
}

export function listSuspensions(db: DatabaseSync): Suspension[] {
  const rows = db.prepare(`
    SELECT id, chamber_id, reason, start_at, end_at, all_blocks, created_at
    FROM suspensions
  `).all() as unknown as SuspensionRow[];
  return rows.map((row) => rowToSuspension(db, row));
}

export function insertSuspension(db: DatabaseSync, suspension: Suspension) {
  db.prepare(`
    INSERT INTO suspensions (id, chamber_id, reason, start_at, end_at, all_blocks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    suspension.id,
    suspension.chamberId,
    suspension.reason,
    suspension.startAt,
    suspension.endAt,
    suspension.blocks === 'all' ? 1 : 0,
    suspension.createdAt,
  );

  if (suspension.blocks !== 'all') {
    const insertBlock = db.prepare('INSERT INTO suspension_blocks (suspension_id, block_id) VALUES (?, ?)');
    for (const blockId of suspension.blocks) {
      insertBlock.run(suspension.id, blockId);
    }
  }

  const insertImpact = db.prepare(`
    INSERT OR IGNORE INTO reservation_suspension_impacts (reservation_id, suspension_id)
    VALUES (?, ?)
  `);
  for (const reservationId of suspension.affectedReservationIds) {
    insertImpact.run(reservationId, suspension.id);
  }
}

function replaceReservationBlocks(db: DatabaseSync, reservationId: string, blocks: BlockId[]) {
  db.prepare('DELETE FROM reservation_blocks WHERE reservation_id = ?').run(reservationId);
  const insertBlock = db.prepare('INSERT INTO reservation_blocks (reservation_id, block_id) VALUES (?, ?)');
  for (const blockId of blocks) {
    insertBlock.run(reservationId, blockId);
  }
}

function replaceReservationImpacts(db: DatabaseSync, reservationId: string, suspensionIds: string[]) {
  db.prepare('DELETE FROM reservation_suspension_impacts WHERE reservation_id = ?').run(reservationId);
  const insertImpact = db.prepare(`
    INSERT OR IGNORE INTO reservation_suspension_impacts (reservation_id, suspension_id)
    VALUES (?, ?)
  `);
  for (const suspensionId of suspensionIds) {
    insertImpact.run(reservationId, suspensionId);
  }
}

function legacyWindowToOccupancy(row: ReservationRow): { occupiedStartAt: string; occupiedEndAt: string } {
  if (row.occupied_start_at && row.occupied_end_at) {
    return { occupiedStartAt: row.occupied_start_at, occupiedEndAt: row.occupied_end_at };
  }
  if (row.window_json) {
    try {
      const window = JSON.parse(row.window_json) as { loadStart?: string; unloadEnd?: string };
      if (window.loadStart && window.unloadEnd) {
        return { occupiedStartAt: window.loadStart, occupiedEndAt: window.unloadEnd };
      }
    } catch {
      // Fall through to fixed fallback.
    }
  }
  return {
    occupiedStartAt: row.created_at,
    occupiedEndAt: row.created_at,
  };
}

function rowToReservation(db: DatabaseSync, row: ReservationRow): Reservation {
  const blocks = db.prepare(`
    SELECT block_id FROM reservation_blocks WHERE reservation_id = ? ORDER BY block_id
  `).all(row.id) as Array<{ block_id: BlockId }>;
  const impacts = db.prepare(`
    SELECT suspension_id FROM reservation_suspension_impacts WHERE reservation_id = ? ORDER BY suspension_id
  `).all(row.id) as Array<{ suspension_id: string }>;
  const occupancy = legacyWindowToOccupancy(row);
  let requestedCondition: UserManagedReservationCondition | undefined;
  if (row.requested_condition_json) {
    try {
      requestedCondition = JSON.parse(row.requested_condition_json) as UserManagedReservationCondition;
    } catch {
      requestedCondition = undefined;
    }
  }
  return {
    id: row.id,
    chamberId: row.chamber_id,
    testName: row.test_name,
    requester: {
      name: row.requester_name,
      department: row.requester_department,
      contact: row.requester_contact ?? '',
    },
    contactNote: row.contact_note,
    blocks: blocks.map((block) => block.block_id),
    occupiedStartAt: occupancy.occupiedStartAt,
    occupiedEndAt: occupancy.occupiedEndAt,
    requestedCondition,
    pin: row.pin,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    impactedBySuspensionIds: impacts.map((impact) => impact.suspension_id),
  };
}

function rowToSuspension(db: DatabaseSync, row: SuspensionRow): Suspension {
  const blocks = db.prepare(`
    SELECT block_id FROM suspension_blocks WHERE suspension_id = ? ORDER BY block_id
  `).all(row.id) as Array<{ block_id: BlockId }>;
  const affected = db.prepare(`
    SELECT reservation_id FROM reservation_suspension_impacts WHERE suspension_id = ? ORDER BY reservation_id
  `).all(row.id) as Array<{ reservation_id: string }>;
  return {
    id: row.id,
    chamberId: row.chamber_id,
    reason: row.reason,
    startAt: row.start_at,
    endAt: row.end_at,
    blocks: row.all_blocks ? 'all' : blocks.map((block) => block.block_id),
    createdAt: row.created_at,
    affectedReservationIds: affected.map((impact) => impact.reservation_id),
  };
}

interface ReservationRow {
  id: string;
  chamber_id: string;
  test_name: string;
  requester_name: string;
  requester_department: string;
  requester_contact?: string;
  contact_note?: string;
  occupied_start_at?: string;
  occupied_end_at?: string;
  requested_condition_json?: string | null;
  window_json?: string | null;
  pin: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface ChamberRow {
  id: string;
  name: string;
  type: Chamber['type'];
  location: string;
  block_rows: number;
  block_columns: number;
  active_config_revision_id: string | null;
}

interface ChamberConfigRevisionRow {
  id: string;
  chamber_id: string;
  revision: number;
  status: ChamberConfigRevision['status'];
  ownership: ChamberConfigRevision['ownership'];
  admin_managed_kind: ChamberConfigRevision['adminManagedKind'] | null;
  effective_from: string;
  effective_to: string | null;
  config_json: string;
  cycle_period_minutes: number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface SuspensionRow {
  id: string;
  chamber_id: string;
  reason: string;
  start_at: string;
  end_at: string;
  all_blocks: number;
  created_at: string;
}

import type { Reservation, Suspension } from './types';
import { CHAMBER } from './chamber';
import { buildCycleWindow } from './reservationRules';

export const DEMO_NOW_ISO = '2026-06-21T11:00:00+09:00';

function reservationWindow(dateKey: string) {
  const window = buildCycleWindow(dateKey, CHAMBER.activeConfigRevision.config.type === 'temperature_cycle'
    ? CHAMBER.activeConfigRevision.config
    : undefined);
  return {
    occupiedStartAt: window.loadStart,
    occupiedEndAt: window.unloadEnd,
  };
}

export const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'CR-260620-001',
    chamberId: CHAMBER.id,
    testName: '電源基板サイクル評価',
    requester: {
      name: '佐藤',
      department: '信頼性評価',
    },
    blocks: ['r2c1', 'r2c2'],
    ...reservationWindow('2026-06-20'),
    pin: '1357',
    createdAt: '2026-06-20T08:15:00+09:00',
  },
  {
    id: 'CR-260618-001',
    chamberId: CHAMBER.id,
    testName: 'センサー温湿度確認',
    requester: {
      name: '山本',
      department: '品質保証',
    },
    blocks: ['r1c1', 'r1c2'],
    ...reservationWindow('2026-06-18'),
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
    },
    blocks: ['r1c1', 'r1c2'],
    ...reservationWindow('2026-06-24'),
    pin: '8642',
    createdAt: '2026-06-20T16:40:00+09:00',
  },
];

export const INITIAL_SUSPENSIONS: Suspension[] = [];

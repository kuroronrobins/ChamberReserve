import type { ReservationStatus } from '../domain/types';

const labels: Record<ReservationStatus, string> = {
  reserved: '予約済み',
  in_use: '利用中',
  completed: '利用後',
  deleted: '削除済み',
  impacted: '影響あり',
};

const classes: Record<ReservationStatus, string> = {
  reserved: 'border-chamber-reserved bg-[#d8ece8] text-chamber-ink',
  in_use: 'border-chamber-inUse bg-[#eadcf2] text-chamber-ink',
  completed: 'border-chamber-done bg-slate-100 text-slate-700',
  deleted: 'border-slate-300 bg-white text-slate-500',
  impacted: 'border-chamber-impact bg-[#f7e6b8] text-chamber-ink',
};

interface StatusBadgeProps {
  status: ReservationStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center border px-2 py-1 text-xs font-semibold ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

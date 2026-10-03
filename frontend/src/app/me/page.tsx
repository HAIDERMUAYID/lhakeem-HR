'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Clock3, Fingerprint, LogOut, Palmtree, RefreshCw, UserRound, X } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { downloadAttendancePdf, type AttendancePdfRow } from '@/lib/attendance-pdf';

type DayRow = {
  date: string;
  status: string;
  statusLabel: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  punchCount: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  overtimeMinutes: number;
  expectedMinutes: number | null;
};

type MeHome = {
  employee: {
    fullName: string;
    jobTitle: string;
    department: string;
    unit: string | null;
    workType: string;
    leaveBalance: number;
    fingerprintId: string | null;
    fingerprints: { pin: string; deviceName: string; serial: string | null }[];
  };
  month: string;
  schedule: {
    startTime: string;
    endTime: string;
    breakStart: string | null;
    breakEnd: string | null;
    shiftPattern: string | null;
    daysOfWeek: string;
    workType: string;
    status: string;
  } | null;
  schedules: {
    year: number;
    month: number;
    startTime: string;
    endTime: string;
    breakStart: string | null;
    breakEnd: string | null;
    shiftPattern: string | null;
    daysOfWeek: string;
    workType: string;
    status: string;
  }[];
  today: DayRow | null;
  days: DayRow[];
  horizon: DayRow[];
  counts: { present: number; late: number; absent: number; leave: number; rest: number; overtime: number };
  leaves: { id: string; type: string; startDate: string; endDate: string; daysCount: number; status: string; reason: string | null }[];
  absences: { date: string; reason: string | null }[];
  punches: { at: string; pin: string }[];
};

type Tab = 'today' | 'punches' | 'schedule' | 'leaves' | 'account';
type Alert = { id: string; tone: 'rose' | 'amber' | 'sky' | 'emerald'; title: string; body: string };

function clock(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function stamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'نهارك سعيد';
  return 'مساء الخير';
}

function atClock(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function remainParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

function dutyMoment(days: DayRow[], now: Date) {
  const windows = days
    .filter((day) => day.scheduledStart && day.scheduledEnd)
    .map((day) => {
      const start = atClock(day.date, day.scheduledStart!);
      const end = atClock(day.date, day.scheduledEnd!);
      if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
      return { day, start, end };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const open = windows.find((w) => now >= w.start && now < w.end && !w.day.checkOutAt);
  if (open) {
    const span = open.end.getTime() - open.start.getTime();
    const punch = open.day.checkInAt ? new Date(open.day.checkInAt) : null;
    return {
      mode: 'until-end' as const,
      title: punch ? 'متبقي على انتهاء الدوام' : 'بدأ الدوام بلا بصمة حضور',
      target: open.end,
      since: punch ? now.getTime() - punch.getTime() : null,
      progress: Math.min(1, Math.max(0, (now.getTime() - open.start.getTime()) / span)),
      detail: `${arDay(open.day.date)} · ${open.day.scheduledStart}–${open.day.scheduledEnd}`,
    };
  }
  const next = windows.find((w) => now < w.start);
  if (next) {
    return {
      mode: 'until-start' as const,
      title: 'متبقي على الدوام القادم',
      target: next.start,
      since: null,
      progress: 0,
      detail: `${arDay(next.day.date)} · ${next.day.scheduledStart}–${next.day.scheduledEnd}`,
    };
  }
  return { mode: 'none' as const, title: 'لا دوام مجدول في الأيام القادمة', target: null, since: null, progress: 0, detail: '' };
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WEEK_SHORT = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const WEEK_FULL = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

function monthTitle(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_AR[(m || 1) - 1]} ${y}`;
}

function arDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEK_FULL[(dt.getDay() + 1) % 7]} ${d} ${MONTHS_AR[(m || 1) - 1]}`;
}

function nightShift(start: string, end: string) {
  return end <= start;
}

function patternLabel(pattern: string | null) {
  if (pattern === '1x1') return '١×١ · يوم عمل ويوم راحة';
  if (pattern === '1x2') return '١×٢ · يوم عمل ويومان راحة';
  if (pattern === '1x3') return '١×٣ · يوم عمل وثلاثة راحة';
  if (pattern === 'FIXED') return 'أيام أسبوع ثابتة';
  return '';
}

function workDaysLabel(daysOfWeek: string) {
  return daysOfWeek
    .split(',')
    .map((n) => WEEK_FULL[parseInt(n, 10)] || '')
    .filter(Boolean)
    .join('، ');
}

function minsLabel(mins: number | null | undefined) {
  if (mins == null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

function buildAlerts(data: MeHome, live: DayRow | null): Alert[] {
  const alerts: Alert[] = [];
  if (!data.employee.fingerprints.length) {
    alerts.push({ id: 'pin', tone: 'amber', title: 'بصمتك غير معرّفة', body: 'راجع شعبة البصمة لربط اسمك.' });
  }
  if (live?.status === 'LATE') alerts.push({ id: 'late', tone: 'rose', title: 'تأخرت اليوم', body: `${live.lateMinutes} دقيقة عن بداية دوامك.` });
  if (live?.status === 'SINGLE') alerts.push({ id: 'single', tone: 'sky', title: 'لم يُسجل انصرافك', body: 'ظهر حضورك، والانصراف لم يُسجل بعد.' });
  if (live?.status === 'ABSENT') alerts.push({ id: 'absent', tone: 'rose', title: 'لا بصمة اليوم', body: 'لم يُسجل حضور لهذا اليوم.' });
  if (live && (live.status === 'REST' || live.status === 'HOLIDAY' || live.status === 'LEAVE')) {
    alerts.push({ id: 'off', tone: 'emerald', title: live.statusLabel, body: 'هذا اليوم ليس يوم دوام.' });
  }
  if (live && live.overtimeMinutes > 0) alerts.push({ id: 'ot', tone: 'sky', title: 'عمل إضافي', body: minsLabel(live.overtimeMinutes) });
  const pending = data.leaves.filter((l) => l.status === 'PENDING');
  if (pending.length) alerts.push({ id: 'pending', tone: 'amber', title: 'إجازة بانتظار الرد', body: pending[0].type });
  return alerts;
}

const toneBg: Record<Alert['tone'], string> = {
  rose: 'bg-rose-50 text-rose-950 border-rose-100',
  amber: 'bg-amber-50 text-amber-950 border-amber-100',
  sky: 'bg-sky-50 text-sky-950 border-sky-100',
  emerald: 'bg-emerald-50 text-emerald-950 border-emerald-100',
};

const dot: Record<string, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-orange-500',
  SINGLE: 'bg-sky-500',
  ABSENT: 'bg-rose-400',
  LEAVE: 'bg-violet-500',
  REST: 'bg-slate-300',
  HOLIDAY: 'bg-slate-400',
  UPCOMING: 'bg-sky-300',
};

const cellTone: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-950',
  LATE: 'bg-orange-50 text-orange-950',
  SINGLE: 'bg-sky-50 text-sky-950',
  ABSENT: 'bg-rose-50 text-rose-950',
  LEAVE: 'bg-violet-50 text-violet-950',
  REST: 'bg-slate-50 text-slate-400',
  HOLIDAY: 'bg-slate-100 text-slate-600',
  UPCOMING: 'bg-slate-50 text-slate-500',
};

const leaveStatus: Record<string, string> = { PENDING: 'قيد الانتظار', APPROVED: 'مقبولة', REJECTED: 'مرفوضة' };

function DutyRing({
  duty,
  now,
}: {
  duty: ReturnType<typeof dutyMoment>;
  now: Date;
}) {
  if (duty.mode === 'none' || !duty.target) return null;
  const remain = remainParts(duty.target.getTime() - now.getTime());
  const since = duty.since != null ? remainParts(duty.since) : null;
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = duty.mode === 'until-end' ? c * (1 - duty.progress) : c * 0.7;
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-[#142033] px-5 py-5 text-white shadow-[0_18px_40px_rgba(20,32,51,0.22)]">
      <motion.div
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-sky-300/25 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="duty-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="100%" stopColor="#e0f2fe" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
            <motion.circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke="url(#duty-stroke)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={c}
              animate={{ strokeDashoffset: duty.mode === 'until-end' ? offset : [c * 0.78, c * 0.55, c * 0.78] }}
              transition={duty.mode === 'until-end' ? { duration: 0.6 } : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <p className="text-xl font-bold tabular-nums leading-none">{remain.h}:{String(remain.m).padStart(2, '0')}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{duty.title}</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {[
              [remain.h, 'ساعة'],
              [remain.m, 'دقيقة'],
              [remain.s, 'ثانية'],
            ].map(([n, label]) => (
              <div key={String(label)} className="rounded-2xl bg-white/10 py-1.5">
                <motion.p key={String(n)} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-lg font-bold tabular-nums">
                  {n}
                </motion.p>
                <p className="text-[10px] text-white/55">{label}</p>
              </div>
            ))}
          </div>
          {since && <p className="mt-2 text-xs text-sky-100">منذ حضورك {since.h} س {since.m} د</p>}
          {duty.detail && <p className="mt-1 text-[11px] text-white/55">{duty.detail}</p>}
        </div>
      </div>
    </div>
  );
}

function DayHero({ day, label }: { day: DayRow | null; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-[#142033] px-5 py-6 text-white shadow-[0_18px_40px_rgba(20,32,51,0.22)]">
      <motion.div
        className="pointer-events-none absolute -left-8 -top-12 h-36 w-36 rounded-full bg-sky-300/20 blur-3xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <p className="relative text-sm text-white/65">{label}</p>
      <p className="relative mt-1 text-3xl font-bold">{day?.statusLabel || '—'}</p>
      <div className="relative mt-6 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-white/55">حضور</p>
          <p className="text-2xl font-semibold tabular-nums">{clock(day?.checkInAt ?? null)}</p>
        </div>
        <div>
          <p className="text-xs text-white/55">انصراف</p>
          <p className="text-2xl font-semibold tabular-nums">{clock(day?.checkOutAt ?? null)}</p>
        </div>
      </div>
    </div>
  );
}

function DutyBoard({
  data,
  todayKey,
  picked,
  onPick,
}: {
  data: MeHome;
  todayKey: string;
  picked: string | null;
  onPick: (date: string) => void;
}) {
  const schedule = data.schedule;
  const selected = data.days.find((day) => day.date === picked) ?? null;
  const dayPunches = selected
    ? data.punches.filter((punch) => dayKey(punch.at) === selected.date).sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const first = data.days[0];
  const lead = first
    ? (new Date(Number(first.date.slice(0, 4)), Number(first.date.slice(5, 7)) - 1, Number(first.date.slice(8))).getDay() + 1) % 7
    : 0;
  const worked = data.days.reduce((sum, day) => sum + (day.workedMinutes || 0), 0);
  const legend = [
    ['حاضر', 'PRESENT'],
    ['متأخر', 'LATE'],
    ['بصمة', 'SINGLE'],
    ['غائب', 'ABSENT'],
    ['إجازة', 'LEAVE'],
    ['راحة', 'REST'],
  ] as const;
  const paired = dayPunches.length > 1
    && Math.round((new Date(dayPunches[dayPunches.length - 1].at).getTime() - new Date(dayPunches[0].at).getTime()) / 60000) >= 120;

  return (
    <div className="space-y-3">
      {schedule && (
        <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_8px_30px_rgba(20,32,51,0.06)]">
          <div className="bg-gradient-to-l from-[#1b3f66] to-[#142033] px-5 py-5 text-white">
            <p className="text-xs text-white/70">دوامك في {monthTitle(data.month)}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight" dir="ltr">{schedule.startTime} – {schedule.endTime}</p>
            <p className="mt-2 text-sm text-sky-100">
              {nightShift(schedule.startTime, schedule.endTime) ? 'خفر ليلي، ينتهي في صباح اليوم التالي' : 'دوام نهاري'}
            </p>
          </div>
          <p className="px-5 py-3 text-sm leading-6 text-slate-600">
            {[
              patternLabel(schedule.shiftPattern),
              schedule.workType === 'MORNING' || schedule.shiftPattern === 'FIXED' ? workDaysLabel(schedule.daysOfWeek) : '',
              schedule.breakStart && schedule.breakEnd ? `استراحة ${schedule.breakStart}–${schedule.breakEnd}` : '',
            ].filter(Boolean).join(' · ') || 'أوقات دوامك لهذا الشهر'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['حضرت', data.counts.present],
          ['غبت', data.counts.absent],
          [worked > 0 ? 'ساعاتك' : 'راحتك', worked > 0 ? minsLabel(worked) : data.counts.rest],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white px-2 py-3 shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] bg-white p-3 shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
        <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
          {WEEK_SHORT.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {data.days.map((day) => {
            const on = day.date === picked;
            const isToday = day.date === todayKey;
            return (
              <motion.button
                key={day.date}
                type="button"
                onClick={() => onPick(day.date)}
                whileTap={{ scale: 0.9 }}
                animate={{ scale: on ? 1.04 : 1 }}
                className={`h-11 rounded-2xl text-center ${on ? 'bg-[#142033] text-white shadow-md' : cellTone[day.status] || 'bg-white'} ${isToday && !on ? 'ring-2 ring-[#142033]/25' : ''}`}
              >
                <p className="text-xs font-semibold leading-none">{Number(day.date.slice(8))}</p>
                <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${on ? 'bg-sky-300' : dot[day.status] || 'bg-slate-200'}`} />
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
          {legend.map(([label, key]) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${dot[key]}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected.date}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="rounded-[28px] bg-white p-5 shadow-[0_8px_30px_rgba(20,32,51,0.05)]"
          >
            <p className="text-xs text-slate-500">{arDay(selected.date)}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-2xl font-bold">{selected.statusLabel}</p>
              {selected.scheduledStart && selected.scheduledEnd && (
                <p className="rounded-full bg-[#142033] px-3 py-1 text-xs font-semibold text-white" dir="ltr">
                  {selected.scheduledStart}–{selected.scheduledEnd}
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[#f6f4f1] py-3">
                <p className="text-[10px] text-slate-500">حضور</p>
                <p className="text-lg font-semibold tabular-nums">{clock(selected.checkInAt)}</p>
              </div>
              <div className="rounded-2xl bg-[#f6f4f1] py-3">
                <p className="text-[10px] text-slate-500">انصراف</p>
                <p className="text-lg font-semibold tabular-nums">{clock(selected.checkOutAt)}</p>
              </div>
              <div className="rounded-2xl bg-[#f6f4f1] py-3">
                <p className="text-[10px] text-slate-500">المدة</p>
                <p className="text-lg font-semibold">{minsLabel(selected.workedMinutes)}</p>
              </div>
            </div>
            {(selected.lateMinutes > 0 || selected.earlyLeaveMinutes > 0 || selected.overtimeMinutes > 0) && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {selected.lateMinutes > 0 && <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-900">تأخير {minsLabel(selected.lateMinutes)}</span>}
                {selected.earlyLeaveMinutes > 0 && <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-900">انصراف مبكر {minsLabel(selected.earlyLeaveMinutes)}</span>}
                {selected.overtimeMinutes > 0 && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-900">إضافي {minsLabel(selected.overtimeMinutes)}</span>}
              </div>
            )}
            <div className="mt-4">
              {!dayPunches.length && <p className="text-sm text-slate-400">لا تسجيل في هذا اليوم.</p>}
              {dayPunches.map((punch, index) => (
                <motion.div
                  key={punch.at}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative flex gap-3 pb-3"
                >
                  <span className="relative mt-1.5 flex w-3 justify-center">
                    <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-emerald-500' : 'bg-[#142033]'}`} />
                    {index < dayPunches.length - 1 && <span className="absolute top-3 h-[calc(100%+4px)] w-px bg-slate-200" />}
                  </span>
                  <div>
                    <p className="text-[11px] text-slate-400">
                      {index === 0 ? 'حضور' : paired && index === dayPunches.length - 1 ? 'انصراف' : 'تسجيل'}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">{stamp(punch.at).slice(0, 5)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const [inbox, setInbox] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [clockOn, setClockOn] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!token) router.replace('/login');
    else if (!user.employeeId) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    setClockOn(true);
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['me-home', month],
    queryFn: () => apiGet<MeHome>(`/api/me?month=${month}`),
    refetchInterval: 60000,
  });

  const seenKey = data ? `me-seen-punches:${data.employee.fingerprintId ?? data.employee.fullName}` : '';
  const [seenPunches, setSeenPunches] = useState<string[]>([]);
  useEffect(() => {
    if (!seenKey) return;
    try {
      setSeenPunches(JSON.parse(localStorage.getItem(seenKey) || '[]'));
    } catch {
      setSeenPunches([]);
    }
  }, [seenKey]);
  const unseenPunches = (data?.punches ?? []).filter((p) => !seenPunches.includes(`${p.at}|${p.pin}`));
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const alerts = useMemo(() => {
    const live = data?.horizon?.find((day) => day.date === todayKey) ?? null;
    const list = data ? buildAlerts(data, live).filter((a) => !hidden.includes(a.id)) : [];
    if (unseenPunches.length) {
      list.unshift({
        id: 'unseen',
        tone: 'emerald',
        title: unseenPunches.length > 1 ? `${unseenPunches.length} بصمات جديدة` : 'وصلت بصمة',
        body: stamp(unseenPunches[0].at).slice(0, 5),
      });
    }
    return list;
  }, [data, hidden, unseenPunches, todayKey]);
  const markPunchesSeen = () => {
    if (!data || !seenKey) return;
    const next = [...new Set([...seenPunches, ...data.punches.map((p) => `${p.at}|${p.pin}`)])];
    setSeenPunches(next);
    localStorage.setItem(seenKey, JSON.stringify(next.slice(-500)));
  };
  const week = (data?.days ?? []).filter((d) => d.date <= todayKey).slice(-7);
  const groups = useMemo(() => {
    const map = new Map<string, { at: string; pin: string }[]>();
    for (const punch of data?.punches ?? []) {
      const key = dayKey(punch.at);
      const list = map.get(key) ?? [];
      list.push(punch);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data?.punches]);
  const duty = data ? dutyMoment(data.horizon?.length ? data.horizon : data.days, now) : null;
  useEffect(() => {
    if (!data || data.month !== month) return;
    setPicked((cur) => {
      if (cur && data.days.some((day) => day.date === cur)) return cur;
      return data.days.find((day) => day.date === todayKey)?.date
        ?? data.days.find((day) => day.punchCount > 0)?.date
        ?? data.days[0]?.date
        ?? null;
    });
  }, [data, month, todayKey]);
  const employee = data?.employee;
  const today = data?.today;
  const liveDay = data?.horizon?.find((day) => day.date === todayKey) ?? today;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    if (key > currentMonth) return;
    setMonth(key);
    setOpenDay(null);
  };
  const saveMine = async () => {
    if (!data) return;
    setPdfBusy(true);
    const rows: AttendancePdfRow[] = data.days
      .filter((day) => day.status !== 'UPCOMING' && (month !== currentMonth || day.date <= todayKey))
      .map((day) => ({
        fingerprintId: data.employee.fingerprintId ?? '',
        employeeName: data.employee.fullName,
        jobTitle: data.employee.jobTitle,
        departmentName: data.employee.department,
        unitName: data.employee.unit,
        workDate: day.date,
        scheduledStart: day.scheduledStart,
        scheduledEnd: day.scheduledEnd,
        checkInAt: day.checkInAt,
        checkOutAt: day.checkOutAt,
        expectedMinutes: day.expectedMinutes,
        workedMinutes: day.workedMinutes,
        lateMinutes: day.lateMinutes,
        earlyLeaveMinutes: day.earlyLeaveMinutes,
        overtimeMinutes: day.overtimeMinutes,
        status: day.status === 'LATE' ? 'PRESENT' : (day.status as AttendancePdfRow['status']),
        statusLabel: day.statusLabel,
      }));
    try {
      await downloadAttendancePdf({
        layout: 'official',
        deviceName: data.employee.fingerprints[0]?.deviceName || 'بصمة الموظف',
        serial: data.employee.fingerprints[0]?.serial || '—',
        departmentName: data.employee.department,
        departmentLocked: true,
        fromDate: rows[0]?.workDate || `${month}-01`,
        toDate: rows[rows.length - 1]?.workDate || `${month}-01`,
        filters: { name: data.employee.fullName, department: '', unit: '', status: 'all' },
        rows,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const initial = (employee?.fullName || 'م').trim().charAt(0);

  return (
    <div dir="rtl" className="mx-auto min-h-screen max-w-[430px] bg-[#f6f4f1] pb-32 text-[#142033]">
      <header className="px-4 pb-1 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#142033] text-lg font-bold text-white">{initial}</div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {clockOn ? `${greeting()} · ${now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}` : 'مساحتي'}
              </p>
              <h1 className="line-clamp-2 text-lg font-bold leading-snug">{employee?.fullName || 'مساحتي'}</h1>
              <p className="truncate text-xs text-slate-500">{employee ? `${employee.jobTitle} · ${employee.department}` : ''}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => refetch()} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm" aria-label="تحديث">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setInbox(true);
                markPunchesSeen();
              }}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm"
              aria-label="الرسائل"
            >
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{alerts.length}</span>}
            </button>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm" aria-label="الشهر السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <p className="min-w-32 text-center text-sm font-semibold">{monthTitle(month)}</p>
          <button type="button" onClick={() => shiftMonth(1)} disabled={month === currentMonth} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm disabled:opacity-30" aria-label="الشهر التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {isLoading && <p className="py-10 text-center text-sm text-slate-400">لحظة…</p>}
        {error && <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">تعذر فتح الصفحة. حاول التحديث.</p>}

        <AnimatePresence mode="wait">
          {data && tab === 'today' && (
            <motion.section key="today" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {!clockOn && <div className="h-44 animate-pulse rounded-[32px] bg-[#142033]" />}
              {clockOn && duty && duty.mode !== 'none' && <DutyRing duty={duty} now={now} />}
              {clockOn && (!duty || duty.mode === 'none') && <DayHero day={liveDay ?? null} label={arDay(todayKey)} />}
              <div>
                <p className="mb-2 px-1 text-xs text-slate-500">{monthTitle(month)}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['حضرت', data.counts.present],
                    ['غبت', data.counts.absent],
                    ['رصيدك', employee?.leaveBalance ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl bg-white px-2 py-3 shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                      <p className="text-[11px] text-slate-500">{label}</p>
                      <p className="text-lg font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {week.map((day) => (
                  <button key={day.date} type="button" onClick={() => { setOpenDay(day.date); setTab('punches'); }} className="min-w-[62px] rounded-2xl bg-white px-2 py-2 text-center shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                    <p className="text-[10px] text-slate-400">{WEEK_SHORT[(new Date(Number(day.date.slice(0, 4)), Number(day.date.slice(5, 7)) - 1, Number(day.date.slice(8))).getDay() + 1) % 7]}</p>
                    <p className="text-sm font-semibold">{Number(day.date.slice(8))}</p>
                    <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${dot[day.status] || 'bg-slate-200'}`} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setTab('punches')} className="flex w-full items-center justify-between rounded-[24px] bg-white px-4 py-4 text-right shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                <span>
                  <span className="block font-semibold">بصماتك</span>
                  <span className="text-xs text-slate-500">{data.punches.length ? `${data.punches.length} تسجيل في هذه الفترة` : 'لا تسجيلات في هذه الفترة'}</span>
                </span>
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </button>
            </motion.section>
          )}

          {data && tab === 'punches' && (
            <motion.section key="punches" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              {!groups.length && <p className="py-8 text-center text-sm text-slate-400">لا تسجيلات في هذه الفترة.</p>}
              {groups.map(([day, punches]) => {
                const sorted = [...punches].sort((a, b) => a.at.localeCompare(b.at));
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                const minutes = Math.round((new Date(last.at).getTime() - new Date(first.at).getTime()) / 60000);
                const paired = sorted.length > 1 && minutes >= 120;
                const open = openDay === day;
                return (
                  <div key={day} className="overflow-hidden rounded-[24px] bg-white shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                    <button type="button" onClick={() => setOpenDay(open ? null : day)} className="w-full px-4 py-4 text-right">
                      <p className="font-semibold">{arDay(day)}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        حضور {stamp(first.at).slice(0, 5)}
                        {paired ? ` · انصراف ${stamp(last.at).slice(0, 5)} · ${minsLabel(minutes)}` : ''}
                      </p>
                    </button>
                    <AnimatePresence>
                      {open && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4">
                          {sorted.map((punch, index) => (
                            <div key={punch.at} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm">
                              <span className="text-slate-400">{index === 0 ? 'حضور' : paired && index === sorted.length - 1 ? 'انصراف' : 'تسجيل'}</span>
                              <span className="font-semibold tabular-nums">{stamp(punch.at).slice(0, 5)}</span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.section>
          )}

          {data && tab === 'schedule' && (
            <motion.section key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <DutyBoard data={data} todayKey={todayKey} picked={picked} onPick={setPicked} />
            </motion.section>
          )}

          {data && tab === 'leaves' && (
            <motion.section key="leaves" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[24px] bg-[#142033] p-4 text-white shadow-[0_18px_40px_rgba(20,32,51,0.18)]">
                  <p className="text-xs text-white/60">رصيدك</p>
                  <p className="text-3xl font-bold">{employee?.leaveBalance}</p>
                </div>
                <div className="rounded-[24px] bg-white p-4 shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                  <p className="text-xs text-slate-500">غيابات</p>
                  <p className="text-3xl font-bold">{data.absences.length}</p>
                </div>
              </div>
              <p className="px-1 text-sm font-semibold">إجازاتك</p>
              {!data.leaves.length && <p className="text-sm text-slate-400">لا إجازات.</p>}
              {data.leaves.map((leave) => (
                <div key={leave.id} className="rounded-[24px] bg-white p-4 text-sm shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
                  <div className="flex justify-between gap-2"><b>{leave.type}</b><span className="text-xs text-slate-400">{leaveStatus[leave.status] || leave.status}</span></div>
                  <p className="mt-1 text-slate-500">{arDay(leave.startDate)} — {arDay(leave.endDate)} · {leave.daysCount} يوم</p>
                </div>
              ))}
              {data.absences.length > 0 && <p className="px-1 text-sm font-semibold">غياباتك</p>}
              {data.absences.map((absence) => (
                <div key={absence.date} className="rounded-[24px] bg-white px-4 py-3 text-sm shadow-[0_8px_30px_rgba(20,32,51,0.05)]">{arDay(absence.date)}{absence.reason ? ` · ${absence.reason}` : ''}</div>
              ))}
            </motion.section>
          )}

          {data && tab === 'account' && (
            <motion.section key="account" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-[28px] bg-white p-5 text-sm shadow-[0_8px_30px_rgba(20,32,51,0.05)]">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-[#142033] text-2xl font-bold text-white">{initial}</div>
              <p className="text-xl font-bold">{employee?.fullName}</p>
              <p>{employee?.jobTitle}</p>
              <p className="text-slate-500">{employee?.department}{employee?.unit ? ` · ${employee.unit}` : ''}</p>
              <p className="text-slate-400">{employee?.workType === 'MORNING' ? 'دوام صباحي' : 'دوام خفر'}</p>
              <button type="button" disabled={pdfBusy} onClick={() => void saveMine()} className="mt-2 h-11 w-full rounded-2xl bg-[#f6f4f1] text-sm font-semibold disabled:opacity-60">
                {pdfBusy ? 'نجهّز نسختك…' : 'نسخة من حضوري هذا الشهر'}
              </button>
              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-rose-700"
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  document.cookie = 'token=; path=/; max-age=0';
                  router.replace('/login');
                }}
              >
                <LogOut className="h-4 w-4" /> خروج
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {inbox && (
          <motion.div className="fixed inset-0 z-30 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setInbox(false)}>
            <motion.aside initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 mx-auto max-h-[74vh] max-w-[430px] overflow-y-auto rounded-t-[28px] bg-[#f6f4f1] p-4 pb-8">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">رسائلك</h2><button type="button" onClick={() => setInbox(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white" aria-label="إغلاق"><X className="h-4 w-4" /></button></div>
              {clockOn && duty && duty.mode !== 'none' && duty.target && (
                <div className="mb-2 rounded-[24px] bg-[#142033] p-4 text-white">
                  <p className="font-semibold">{duty.title}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {(() => {
                      const left = remainParts(duty.target.getTime() - now.getTime());
                      return `${left.h}:${String(left.m).padStart(2, '0')}:${String(left.s).padStart(2, '0')}`;
                    })()}
                  </p>
                  {duty.detail && <p className="mt-1 text-xs text-white/60">{duty.detail}</p>}
                </div>
              )}
              {!alerts.length && <p className="py-6 text-center text-sm text-slate-400">لا رسائل الآن.</p>}
              {alerts.map((alert, index) => (
                <motion.div key={alert.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`mb-2 rounded-[22px] border p-4 text-sm ${toneBg[alert.tone]}`}>
                  <div className="flex justify-between gap-2"><b>{alert.title}</b><button type="button" className="text-xs text-slate-500" onClick={() => setHidden((ids) => [...ids, alert.id])}>إخفاء</button></div>
                  <p className="mt-1 text-xs opacity-80">{alert.body}</p>
                </motion.div>
              ))}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] px-3 pb-3">
        <div className="flex rounded-full bg-white/95 p-1 shadow-[0_12px_40px_rgba(20,32,51,0.14)] ring-1 ring-black/5 backdrop-blur">
          {([
            ['today', 'اليوم', Clock3],
            ['punches', 'بصماتي', Fingerprint],
            ['schedule', 'دوامي', CalendarDays],
            ['leaves', 'سجلّي', Palmtree],
            ['account', 'حسابي', UserRound],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]">
              {tab === id && (
                <motion.span layoutId="me-tab" className="absolute inset-0 rounded-full bg-[#142033]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
              )}
              <Icon className={`relative z-10 h-4 w-4 ${tab === id ? 'text-white' : 'text-slate-400'}`} />
              <span className={`relative z-10 ${tab === id ? 'font-semibold text-white' : 'text-slate-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

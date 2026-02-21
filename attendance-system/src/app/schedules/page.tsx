'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const DAYS = [
  { dayOfWeek: 0, label: 'Sunday', labelAr: 'الأحد' },
  { dayOfWeek: 1, label: 'Monday', labelAr: 'الإثنين' },
  { dayOfWeek: 2, label: 'Tuesday', labelAr: 'الثلاثاء' },
  { dayOfWeek: 3, label: 'Wednesday', labelAr: 'الأربعاء' },
  { dayOfWeek: 4, label: 'Thursday', labelAr: 'الخميس' },
  { dayOfWeek: 5, label: 'Friday', labelAr: 'الجمعة' },
  { dayOfWeek: 6, label: 'Saturday', labelAr: 'السبت' },
];

type User = { id: string; name: string; email: string; jobTitle: string };
type Schedule = { id: string; dayOfWeek: number; startTime: string; endTime: string };

export default function SchedulesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSchedule, setLocalSchedule] = useState<Record<number, { on: boolean; start: string; end: string }>>({});

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  };

  const fetchSchedules = async (userId: string) => {
    setLoading(true);
    const res = await fetch(`/api/schedules?userId=${userId}`);
    if (res.ok) {
      const data = await res.json();
      setSchedules(data);
      const map: Record<number, { on: boolean; start: string; end: string }> = {};
      DAYS.forEach((d) => {
        const s = data.find((x: Schedule) => x.dayOfWeek === d.dayOfWeek);
        map[d.dayOfWeek] = s
          ? { on: true, start: s.startTime, end: s.endTime }
          : { on: false, start: '08:00', end: '16:00' };
      });
      setLocalSchedule(map);
    } else {
      const map: Record<number, { on: boolean; start: string; end: string }> = {};
      DAYS.forEach((d) => {
        map[d.dayOfWeek] = { on: false, start: '08:00', end: '16:00' };
      });
      setLocalSchedule(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) fetchSchedules(selectedUserId);
    else {
      setSchedules([]);
      setLocalSchedule({});
    }
  }, [selectedUserId]);

  const toggleDay = async (dayOfWeek: number) => {
    if (!selectedUserId) return;
    const current = localSchedule[dayOfWeek] ?? { on: false, start: '08:00', end: '16:00' };
    const nextOn = !current.on;

    setLocalSchedule((prev) => ({
      ...prev,
      [dayOfWeek]: { ...current, on: nextOn },
    }));

    if (nextOn) {
      const res = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          dayOfWeek,
          startTime: current.start,
          endTime: current.end,
        }),
      });
      if (res.ok) fetchSchedules(selectedUserId);
    } else {
      const res = await fetch(`/api/schedules?userId=${selectedUserId}&dayOfWeek=${dayOfWeek}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchSchedules(selectedUserId);
    }
  };

  const updateTime = async (dayOfWeek: number, field: 'start' | 'end', value: string) => {
    if (!selectedUserId) return;
    const current = localSchedule[dayOfWeek];
    if (!current?.on) return;

    const next = { ...current, [field]: value };
    setLocalSchedule((prev) => ({ ...prev, [dayOfWeek]: next }));

    const res = await fetch('/api/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUserId,
        dayOfWeek,
        startTime: next.start,
        endTime: next.end,
      }),
    });
    if (res.ok) fetchSchedules(selectedUserId);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">← Home</Button>
          </Link>
          <h1 className="text-2xl font-bold">Work Schedules</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Smart Scheduler</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select an employee and set their weekly schedule. Unchecked days = Rest Day (استراحة).
            </p>
            <div className="mt-4 max-w-sm">
              <label className="mb-2 block text-sm font-medium">Employee</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} — {u.jobTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedUserId ? (
              <p className="py-8 text-center text-muted-foreground">
                Select an employee to configure their schedule.
              </p>
            ) : loading ? (
              <p className="py-8 text-center text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-3">
                {DAYS.map(({ dayOfWeek, label, labelAr }) => {
                  const s = localSchedule[dayOfWeek] ?? { on: false, start: '08:00', end: '16:00' };
                  return (
                    <div
                      key={dayOfWeek}
                      className={cn(
                        'flex flex-wrap items-center gap-4 rounded-lg border p-4 transition-colors',
                        s.on ? 'border-input bg-card' : 'border-transparent bg-muted/50 opacity-75'
                      )}
                    >
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={s.on}
                          onChange={() => toggleDay(dayOfWeek)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="font-medium">
                          {label} ({labelAr})
                        </span>
                        {!s.on && (
                          <Badge variant="secondary" className="ml-1">استراحة</Badge>
                        )}
                      </label>
                      {s.on && (
                        <div className="flex items-center gap-2">
                          <div>
                            <label className="sr-only">Start</label>
                            <input
                              type="time"
                              value={s.start}
                              onChange={(e) => updateTime(dayOfWeek, 'start', e.target.value)}
                              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                          <span className="text-muted-foreground">—</span>
                          <div>
                            <label className="sr-only">End</label>
                            <input
                              type="time"
                              value={s.end}
                              onChange={(e) => updateTime(dayOfWeek, 'end', e.target.value)}
                              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

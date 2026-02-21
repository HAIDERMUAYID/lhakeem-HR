'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, UserCheck, UserX, Coffee, Plane } from 'lucide-react';

type User = { id: string; name: string; jobTitle: string };
type Summary = {
  totalRecords: number;
  present: number;
  absent: number;
  restDay: number;
  leave: number;
  unexcused: number;
  totalAbsences: number;
};

export default function ReportsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('__all__');
  const today = new Date();
  const [startDate, setStartDate] = useState(() => format(subMonths(today, 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(today, 'yyyy-MM-dd'));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  };

  const fetchSummary = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      ...(selectedUserId !== '__all__' && { userId: selectedUserId }),
    });
    const res = await fetch(`/api/reports/summary?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data);
    } else {
      setSummary(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchSummary();
    else setSummary(null);
  }, [startDate, endDate, selectedUserId]);

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">← Home</Button>
          </Link>
          <h1 className="text-2xl font-bold">Reports</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Summary</CardTitle>
            <p className="text-sm text-muted-foreground">
              Total work days, absences, rest days, and leave by date range.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <div>
                <Label className="text-xs">Employee</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All employees</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-12 text-center text-muted-foreground">Loading...</p>
            ) : summary ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
                  <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/30">
                    <UserCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Work Days (Present)</p>
                    <p className="text-2xl font-bold">{summary.present}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
                  <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
                    <UserX className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Absences</p>
                    <p className="text-2xl font-bold">{summary.totalAbsences}</p>
                    {summary.totalAbsences > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Excused: {summary.absent} · Unexcused: {summary.unexcused}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
                  <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800">
                    <Coffee className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rest Days (استراحة)</p>
                    <p className="text-2xl font-bold">{summary.restDay}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
                  <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/30">
                    <Plane className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Leave Days</p>
                    <p className="text-2xl font-bold">{summary.leave}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-lg border bg-card p-4 sm:col-span-2 lg:col-span-1">
                  <div className="rounded-full bg-muted p-3">
                    <ClipboardList className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Records</p>
                    <p className="text-2xl font-bold">{summary.totalRecords}</p>
                    <p className="text-xs text-muted-foreground">
                      In selected range
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                Select a date range to view the report.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

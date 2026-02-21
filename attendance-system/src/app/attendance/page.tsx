'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type User = { id: string; name: string; jobTitle: string };
type CheckResult = {
  schedule: { startTime: string; endTime: string } | null;
  hasLeave: boolean;
  existingLog: { status: string; checkInTime: string | null; checkOutTime: string | null; notes: string | null } | null;
};

export default function AttendancePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  };

  const fetchCheck = async () => {
    if (!selectedUserId || !date) return;
    setLoading(true);
    const res = await fetch(`/api/attendance/check?userId=${selectedUserId}&date=${date}`);
    if (res.ok) {
      const data = await res.json();
      setCheck(data);
      if (data.existingLog) {
        setStatus(data.existingLog.status);
        setCheckInTime(data.existingLog.checkInTime ?? '');
        setCheckOutTime(data.existingLog.checkOutTime ?? '');
        setNotes(data.existingLog.notes ?? '');
      } else {
        if (data.hasLeave) setStatus('LEAVE');
        else if (data.schedule) setStatus('');
        else setStatus('REST_DAY');
        setCheckInTime('');
        setCheckOutTime('');
        setNotes('');
      }
    } else {
      setCheck(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId && date) fetchCheck();
    else setCheck(null);
  }, [selectedUserId, date]);

  const handleSave = async () => {
    if (!selectedUserId || !date || !status) return;
    setSaving(true);
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUserId,
        date,
        status,
        checkInTime: status === 'PRESENT' ? checkInTime || null : null,
        checkOutTime: status === 'PRESENT' ? checkOutTime || null : null,
        notes: notes || null,
      }),
    });
    if (res.ok) fetchCheck();
    setSaving(false);
  };

  const isRestDay = check && !check.schedule;
  const isWorkingDay = check?.schedule;

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">← Home</Button>
          </Link>
          <h1 className="text-2xl font-bold">Attendance</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daily Attendance Log</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select employee and date. System shows Rest Day, Working Day, or Leave. Then mark Present/Absent.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Employee</Label>
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
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <p className="py-4 text-center text-muted-foreground">Loading...</p>
            ) : check ? (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-2 text-sm font-medium">Day type</p>
                  {isRestDay && (
                    <Badge variant="secondary" className="text-sm">
                      Rest Day (استراحة)
                    </Badge>
                  )}
                  {check.hasLeave && !isRestDay && (
                    <Badge variant="outline" className="text-sm">
                      Leave — Approved
                    </Badge>
                  )}
                  {isWorkingDay && !check.hasLeave && (
                    <Badge variant="default" className="text-sm">
                      Working Day: {check.schedule!.startTime} — {check.schedule!.endTime}
                    </Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRESENT">Present</SelectItem>
                        <SelectItem value="ABSENT">Absent</SelectItem>
                        <SelectItem value="REST_DAY">Rest Day</SelectItem>
                        <SelectItem value="LEAVE">Leave</SelectItem>
                        <SelectItem value="UNEXCUSED">Unexcused Absence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {status === 'PRESENT' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Check-in</Label>
                        <Input
                          type="time"
                          value={checkInTime}
                          onChange={(e) => setCheckInTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Check-out</Label>
                        <Input
                          type="time"
                          value={checkOutTime}
                          onChange={(e) => setCheckOutTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Notes</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes..."
                    />
                  </div>

                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Attendance'}
                  </Button>
                </div>
              </>
            ) : selectedUserId && date ? (
              <p className="py-4 text-muted-foreground">Select employee and date to continue.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

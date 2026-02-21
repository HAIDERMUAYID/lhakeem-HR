'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Fingerprint, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type User = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  managerId: string | null;
  manager: { name: string } | null;
};

type Device = { id: string; name: string; code: string | null; isActive: boolean };

type FingerprintRow = {
  id: string;
  fingerprintId: string;
  device: { id: string; name: string; code: string | null };
};

type PendingFingerprint = { deviceId: string; fingerprintId: string };

export default function EmployeesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [managerId, setManagerId] = useState<string>('__none__');
  const [pendingFingerprints, setPendingFingerprints] = useState<PendingFingerprint[]>([]);
  const [addDeviceId, setAddDeviceId] = useState('');
  const [addFingerprintId, setAddFingerprintId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fingerDialogUserId, setFingerDialogUserId] = useState<string | null>(null);
  const [fingerDialogName, setFingerDialogName] = useState('');
  const [fingerprints, setFingerprints] = useState<FingerprintRow[]>([]);
  const [fpLoading, setFpLoading] = useState(false);
  const [newFpDeviceId, setNewFpDeviceId] = useState('');
  const [newFpId, setNewFpId] = useState('');
  const [fpError, setFpError] = useState<string | null>(null);

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  const fetchDevices = async () => {
    const res = await fetch('/api/devices');
    if (res.ok) setDevices((await res.json()).filter((d: Device) => d.isActive));
  };

  useEffect(() => {
    fetchUsers();
    fetchDevices();
  }, []);

  useEffect(() => {
    if (open) fetchDevices();
  }, [open]);

  const addPendingFingerprint = () => {
    const fid = addFingerprintId.trim();
    if (!addDeviceId || !fid) return;
    if (pendingFingerprints.some((p) => p.deviceId === addDeviceId && p.fingerprintId === fid)) return;
    setPendingFingerprints((prev) => [...prev, { deviceId: addDeviceId, fingerprintId: fid }]);
    setAddDeviceId('');
    setAddFingerprintId('');
  };

  const removePendingFingerprint = (deviceId: string, fingerprintId: string) => {
    setPendingFingerprints((prev) =>
      prev.filter((p) => !(p.deviceId === deviceId && p.fingerprintId === fingerprintId))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        jobTitle,
        managerId: managerId === '__none__' ? null : managerId,
      }),
    });
    if (!res.ok) {
      setSubmitError('فشل في إضافة الموظف');
      return;
    }
    const user = await res.json();
    for (const fp of pendingFingerprints) {
      const r = await fetch(`/api/users/${user.id}/fingerprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: fp.deviceId, fingerprintId: fp.fingerprintId }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setSubmitError(data.error || 'فشل في ربط أحد معرفات البصمة');
        return;
      }
    }
    setOpen(false);
    setName('');
    setEmail('');
    setJobTitle('');
    setManagerId('__none__');
    setPendingFingerprints([]);
    fetchUsers();
  };

  const openFingerprints = (u: User) => {
    setFingerDialogUserId(u.id);
    setFingerDialogName(u.name);
    setFingerprints([]);
    setFpError(null);
    setNewFpDeviceId('');
    setNewFpId('');
    fetch(`/api/users/${u.id}/fingerprints`)
      .then((r) => r.json())
      .then((data) => setFingerprints(Array.isArray(data) ? data : []))
      .catch(() => setFingerprints([]));
  };

  const addFingerprintForUser = async () => {
    if (!fingerDialogUserId || !newFpDeviceId || !newFpId.trim()) return;
    setFpError(null);
    setFpLoading(true);
    const res = await fetch(`/api/users/${fingerDialogUserId}/fingerprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: newFpDeviceId, fingerprintId: newFpId.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setFpLoading(false);
    if (res.ok) {
      setFingerprints((prev) => [
        ...prev,
        {
          id: data.id,
          fingerprintId: data.fingerprintId,
          device: data.device,
        },
      ]);
      setNewFpDeviceId('');
      setNewFpId('');
    } else {
      setFpError(data.error || 'فشل الإضافة');
    }
  };

  const deleteFingerprintForUser = async (recordId: string) => {
    if (!fingerDialogUserId) return;
    const res = await fetch(`/api/users/${fingerDialogUserId}/fingerprints/${recordId}`, {
      method: 'DELETE',
    });
    if (res.ok) setFingerprints((prev) => prev.filter((f) => f.id !== recordId));
  };

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">← الرئيسية</Button>
            </Link>
            <h1 className="text-2xl font-bold">الموظفون</h1>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            إضافة موظف
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>الموظفون والمديرون</CardTitle>
            <p className="text-sm text-muted-foreground">
              الموظفون ومديرهم المباشر ومعرفات البصمة لكل جهاز
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p>
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                لا يوجد موظفون. أضف موظفاً للبدء.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>المسمى</TableHead>
                    <TableHead>المدير المباشر</TableHead>
                    <TableHead className="w-[100px]">بصمات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.jobTitle}</TableCell>
                      <TableCell>{u.manager?.name ?? '—'}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openFingerprints(u)}
                        >
                          <Fingerprint className="mr-1 h-4 w-4" />
                          إدارة
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة موظف</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {submitError && (
                <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  {submitError}
                </p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="name">الاسم</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">البريد</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="jobTitle">المسمى الوظيفي</Label>
                <Input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>المدير المباشر</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المدير (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">لا يوجد</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <Label className="mb-2 block">معرفات البصمة (اختياري)</Label>
                <p className="mb-3 text-sm text-muted-foreground">
                  اختر جهاز الحضور وأدخل معرف البصمة كما يظهر على الجهاز. يمكن إضافة أكثر من جهاز.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Select value={addDeviceId} onValueChange={setAddDeviceId}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="الجهاز" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} {d.code ? `(${d.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-24"
                    placeholder="المعرف"
                    value={addFingerprintId}
                    onChange={(e) => setAddFingerprintId(e.target.value)}
                  />
                  <Button type="button" variant="secondary" onClick={addPendingFingerprint}>
                    إضافة
                  </Button>
                </div>
                {pendingFingerprints.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded border p-2 text-sm">
                    {pendingFingerprints.map((p) => (
                      <li key={`${p.deviceId}-${p.fingerprintId}`} className="flex items-center justify-between gap-2">
                        <span>{deviceName(p.deviceId)} → {p.fingerprintId}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removePendingFingerprint(p.deviceId, p.fingerprintId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit">إضافة موظف</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Fingerprints Dialog */}
      <Dialog
        open={!!fingerDialogUserId}
        onOpenChange={(open) => !open && setFingerDialogUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>معرفات البصمة — {fingerDialogName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {fpError && (
              <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{fpError}</p>
            )}
            <div>
              <Label className="mb-2 block">إضافة معرف على جهاز</Label>
              <div className="flex flex-wrap gap-2">
                <Select value={newFpDeviceId} onValueChange={setNewFpDeviceId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="الجهاز" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-24"
                  placeholder="المعرف"
                  value={newFpId}
                  onChange={(e) => setNewFpId(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={addFingerprintForUser}
                  disabled={fpLoading || !newFpDeviceId || !newFpId.trim()}
                >
                  {fpLoading ? 'جاري...' : 'إضافة'}
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>معرف البصمة</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fingerprints.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.device.name} {f.device.code ? `(${f.device.code})` : ''}</TableCell>
                    <TableCell>{f.fingerprintId}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteFingerprintForUser(f.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {fingerprints.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">لا توجد بصمات مسجّلة</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

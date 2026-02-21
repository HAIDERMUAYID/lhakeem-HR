'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

type Device = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  isActive: boolean;
};

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDevices = async () => {
    const res = await fetch('/api/devices');
    if (res.ok) setDevices(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setName('');
    setCode('');
    setLocation('');
    setIsActive(true);
    setError(null);
    setOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditId(d.id);
    setName(d.name);
    setCode(d.code ?? '');
    setLocation(d.location ?? '');
    setIsActive(d.isActive);
    setError(null);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const url = editId ? `/api/devices/${editId}` : '/api/devices';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: code || undefined, location: location || undefined, isActive }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setOpen(false);
      fetchDevices();
    } else {
      setError(data.error || 'حدث خطأ');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذا الجهاز؟')) return;
    setDeletingId(id);
    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (res.ok) fetchDevices();
    else alert(data.error || 'فشل الحذف');
  };

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">← الرئيسية</Button>
            </Link>
            <h1 className="text-2xl font-bold">أجهزة البصمة</h1>
          </div>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            إضافة جهاز
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة الأجهزة</CardTitle>
            <p className="text-sm text-muted-foreground">
              إدارة أجهزة الحضور (الإدارة، الطوارئ، إلخ). كل جهاز له معرفات بصمة فريدة.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p>
            ) : devices.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                لا توجد أجهزة. أضف جهازاً للبدء.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الكود</TableHead>
                    <TableHead>الموقع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="w-[120px]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.code ?? '—'}</TableCell>
                      <TableCell>{d.location ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={d.isActive ? 'default' : 'secondary'}>
                          {d.isActive ? 'مفعّل' : 'معطّل'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(d.id)}
                            disabled={deletingId === d.id}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'تعديل جهاز' : 'إضافة جهاز'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {error && (
                <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="name">اسم الجهاز *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: جهاز الإدارة"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code">الكود (اختياري)</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="مثال: ADM-01"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">الموقع (اختياري)</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="مثال: الطابق الأول"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="isActive">الجهاز مفعّل</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit">{editId ? 'حفظ' : 'إضافة'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

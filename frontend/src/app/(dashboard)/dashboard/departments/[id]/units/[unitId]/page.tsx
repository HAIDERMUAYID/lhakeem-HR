'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, ChevronLeft, Layers3, Search, Users, UserCircle } from 'lucide-react';

import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoveEmployeesModal } from '@/components/departments/move-employees-modal';

type UnitDetail = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  managerUser?: { id: string; name: string } | null;
  department: { id: string; name: string };
  employees: { id: string; fullName: string; jobTitle: string; isActive: boolean }[];
  _count?: { employees: number };
};

export default function UnitDetailPage() {
  const params = useParams<{ id: string; unitId: string }>();
  const router = useRouter();
  const deptId = params?.id;
  const unitId = params?.unitId;

  const [search, setSearch] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Record<string, true>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['unit-detail', unitId],
    queryFn: () => apiGet<UnitDetail>(`/api/units/${unitId}`),
    enabled: !!unitId,
  });

  const employees = data?.employees ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.fullName.toLowerCase().includes(q) || (e.jobTitle ?? '').toLowerCase().includes(q),
    );
  }, [employees, search]);

  const selectedIds = useMemo(() => Object.keys(selectedEmployeeIds), [selectedEmployeeIds]);
  const toggleAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedEmployeeIds({});
      return;
    }
    const next: Record<string, true> = {};
    for (const e of filtered) next[e.id] = true;
    setSelectedEmployeeIds(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard/departments" className="hover:text-gray-800 transition-colors">
              الأقسام
            </Link>
            <ChevronLeft className="h-4 w-4" />
            <Link
              href={`/dashboard/departments/${deptId}`}
              className="hover:text-gray-800 transition-colors max-w-[40vw] truncate"
            >
              {data?.department?.name ?? 'القسم'}
            </Link>
            <ChevronLeft className="h-4 w-4" />
            <span className="text-gray-900 font-semibold truncate max-w-[40vw]">{data?.name ?? 'تفاصيل الوحدة'}</span>
          </div>
          <Button variant="outline" onClick={() => router.back()} className="gap-2">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        </div>

        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-5 bg-gradient-to-l from-gray-50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                  <Layers3 className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{data?.name ?? '—'}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {data?.code && <Badge variant="secondary">{data.code}</Badge>}
                    {data?.isActive === false && <Badge variant="default">غير نشط</Badge>}
                    {data?.managerUser ? (
                      <span className="text-sm text-primary-700 inline-flex items-center gap-1">
                        <UserCircle className="h-4 w-4" />
                        {data.managerUser.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">بدون مسؤول</span>
                    )}
                  </div>
                  {data?.description && <p className="text-sm text-gray-600 mt-2 max-w-2xl">{data.description}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[220px]">
                <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{data?._count?.employees ?? employees.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">موظفين</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{data?.department?.name ? '✓' : '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">تابعة لقسم</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
      ) : error || !data ? (
        <EmptyState icon={Building2} title="تعذر تحميل تفاصيل الوحدة" description="حاول مرة أخرى" compact />
      ) : (
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="border-b border-gray-100 bg-gradient-to-l from-gray-50 to-white p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="بحث بالاسم أو المسمى..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10 bg-white border-gray-200"
                />
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {selectedIds.length > 0 && (
                  <Button className="gap-2" onClick={() => setMoveOpen(true)}>
                    نقل المحدد ({selectedIds.length})
                  </Button>
                )}
                <Badge variant="secondary">{filtered.length} موظف</Badge>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState icon={Users} title="لا يوجد موظفون" description="لا يوجد موظفون داخل هذه الوحدة" compact />
            ) : (
              <div className="p-4 sm:p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[52px]">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                          onChange={(e) => toggleAllFiltered(e.target.checked)}
                        />
                      </TableHead>
                      <TableHead>الموظف</TableHead>
                      <TableHead>المسمى</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedEmployeeIds[e.id]}
                            onChange={(ev) =>
                              setSelectedEmployeeIds((prev) => {
                                const next = { ...prev };
                                if (ev.target.checked) next[e.id] = true;
                                else delete next[e.id];
                                return next;
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">{e.fullName}</TableCell>
                        <TableCell className="text-gray-600">{e.jobTitle}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MoveEmployeesModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        employeeIds={selectedIds}
        defaultDepartmentId={data?.department?.id ?? deptId}
        onMoved={() => setSelectedEmployeeIds({})}
      />
    </motion.div>
  );
}


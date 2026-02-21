'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Upload, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiDelete } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { ResponsiveDataView } from '@/components/shared/responsive-data-view';

type ImportBatch = {
  id: string;
  fileName: string | null;
  importedCount: number;
  failedCount: number;
  createdAt: string;
  _count: { employees: number };
};

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);

  const { data: batches, isLoading, error } = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => apiGet<ImportBatch[]>('/api/employees/import-batches'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/employees/import-batches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batches'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('تم حذف الدفعة والموظفين المستوردين');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستورد</h1>
          <p className="text-gray-500 mt-1">عرض وحذف دفعات الاستيراد والموظفين المستوردين</p>
        </div>
        <Link href="/dashboard/employees">
          <Button className="gap-2">
            <Upload className="h-5 w-5" />
            استيراد جديد
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>دفعات الاستيراد</CardTitle>
          <p className="text-sm text-gray-500">
            حذف دفعة سيحذف جميع الموظفين المستوردين فيها
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <div className="py-12 text-center text-gray-500">حدث خطأ في تحميل البيانات</div>
          ) : !batches || batches.length === 0 ? (
            <div className="py-12 text-center text-gray-500">لا توجد دفعات استيراد</div>
          ) : (
            <ResponsiveDataView
              cardClassName="p-4"
              tableContent={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم الملف</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>مستورد</TableHead>
                      <TableHead>فشل</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.fileName ?? '—'}</TableCell>
                        <TableCell>
                          {format(new Date(b.createdAt), 'd MMM yyyy، HH:mm', { locale: ar })}
                        </TableCell>
                        <TableCell>{b._count?.employees ?? b.importedCount}</TableCell>
                        <TableCell>{b.failedCount}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px] min-w-[44px]"
                            onClick={() => {
                              setBatchToDelete(b);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cardContent={
                <>
                  {batches.map((b) => (
                    <Card key={b.id} className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4">
                        <p className="font-medium text-gray-900 truncate">{b.fileName ?? '—'}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {format(new Date(b.createdAt), 'd MMM yyyy، HH:mm', { locale: ar })}
                        </p>
                        <div className="flex items-center justify-between mt-3 gap-2">
                          <span className="text-xs text-gray-500">
                            مستورد: {b._count?.employees ?? b.importedCount} — فشل: {b.failedCount}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px] shrink-0"
                            onClick={() => {
                              setBatchToDelete(b);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            حذف
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              }
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setBatchToDelete(null);
        }}
        title="حذف دفعة الاستيراد"
        description={
          batchToDelete
            ? `سيتم حذف ${batchToDelete._count?.employees ?? 0} موظف. هل أنت متأكد؟`
            : undefined
        }
        variant="danger"
        confirmLabel="حذف"
        onConfirm={() => {
          if (batchToDelete) {
            deleteMutation.mutate(batchToDelete.id);
            setBatchToDelete(null);
          }
        }}
      />
    </div>
  );
}

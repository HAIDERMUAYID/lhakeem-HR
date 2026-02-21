import Link from 'next/link';
import { Users, Calendar, ClipboardList, BarChart3, Fingerprint } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const nav = [
    { href: '/employees', label: 'الموظفون', icon: Users },
    { href: '/devices', label: 'أجهزة البصمة', icon: Fingerprint },
    { href: '/schedules', label: 'الجداول', icon: Calendar },
    { href: '/attendance', label: 'الحضور', icon: ClipboardList },
    { href: '/reports', label: 'التقارير', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold">Attendance & Shift Management</h1>
        <p className="mb-8 text-muted-foreground">نظام إدارة الحضور وورديات العمل</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-2">
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-lg">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" size="sm">
                    Open →
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

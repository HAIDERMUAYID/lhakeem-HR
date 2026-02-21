import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'اسم المستخدم مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const employeeSchema = z.object({
  fullName: z.string().min(2, 'الاسم مطلوب (حرفان على الأقل)'),
  jobTitle: z.string().min(1, 'العنوان الوظيفي مطلوب'),
  departmentId: z.string().min(1, 'اختر القسم'),
});

export const departmentSchema = z.object({
  name: z.string().min(2, 'اسم القسم مطلوب'),
});

export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, 'اختر الموظف'),
  leaveTypeId: z.string().min(1, 'اختر نوع الإجازة'),
  startDate: z.string().min(1, 'تاريخ البداية مطلوب'),
  endDate: z.string().min(1, 'تاريخ النهاية مطلوب'),
  daysCount: z.number().min(1, 'عدد الأيام مطلوب'),
  reason: z.string().optional(),
});

export const absenceSchema = z.object({
  employeeId: z.string().min(1, 'اختر الموظف'),
  date: z.string().min(1, 'التاريخ مطلوب'),
  reason: z.string().optional(),
});

export const holidaySchema = z.object({
  name: z.string().min(1, 'الاسم بالإنجليزي مطلوب'),
  nameAr: z.string().min(1, 'الاسم بالعربي مطلوب'),
  date: z.string().min(1, 'التاريخ مطلوب'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type AbsenceInput = z.infer<typeof absenceSchema>;
export type HolidayInput = z.infer<typeof holidaySchema>;

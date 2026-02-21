# Attendance & Shift Management System

نظام إدارة الحضور وورديات العمل

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + Shadcn/UI
- **Database:** Supabase (PostgreSQL) + Prisma ORM
- **Date:** date-fns

## Setup

1. **Install dependencies:**
   ```bash
   cd attendance-system && npm install
   ```

2. **Configure database:**
   - Copy `.env.example` to `.env`
   - For Supabase: use pooler URL for `DATABASE_URL`, direct URL for `DIRECT_URL`
   - For local PostgreSQL: use same URL for both

3. **Generate Prisma client & run migrations:**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Optional – seed sample data:**
   ```bash
   npx prisma db seed
   ```

5. **Start dev server:**
   ```bash
   npm run dev
   ```

## Pages

- `/` — Home
- `/employees` — Add employees, assign managers
- `/schedules` — Phase 3: Work schedule grid
- `/attendance` — Phase 4: Daily attendance log
- `/reports` — Phase 5: Summary reports

## Logic

- **Rest Day:** No `WorkSchedule` entry for that day of week → استراحة
- **Attendance validation:** Check schedule → check leave → otherwise Unexcused

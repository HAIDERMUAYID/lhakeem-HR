@echo off
chcp 65001 >nul
title نظام إدارة الإجازات والدوام - مستشفى الحكيم

cd /d "%~dp0"

echo ==========================================
echo   نظام إدارة الإجازات والدوام
echo   مستشفى الحكيم
echo ==========================================

if not exist "node_modules" (
  echo تثبيت الاعتماديات...
  call npm install
)

if not exist "backend\node_modules" (
  echo تثبيت اعتماديات الـ API...
  call npm install --prefix backend
)

if not exist "frontend\node_modules" (
  echo تثبيت اعتماديات الواجهة...
  call npm install --prefix frontend
)

echo توليد Prisma Client...
call npm run db:generate 2>nul || (cd backend && call npx prisma generate)

echo.
echo تشغيل النظام...
echo   - API:     http://localhost:3001/api
echo   - الواجهة: http://localhost:3000
echo.
echo لإيقاف التشغيل: Ctrl+C
echo ==========================================

call npm run dev
pause

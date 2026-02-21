#!/bin/bash
# سكربت تشغيل نظام إدارة الإجازات والدوام – مستشفى الحكيم

set -e
cd "$(dirname "$0")"

echo "=========================================="
echo "  نظام إدارة الإجازات والدوام"
echo "  مستشفى الحكيم"
echo "=========================================="

# تثبيت الاعتماديات إن لم تكن موجودة
if [ ! -d "node_modules" ]; then
  echo "تثبيت الاعتماديات..."
  npm install
fi

if [ ! -d "backend/node_modules" ]; then
  echo "تثبيت اعتماديات الـ API..."
  npm install --prefix backend
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "تثبيت اعتماديات الواجهة..."
  npm install --prefix frontend
fi

# توليد Prisma Client
echo "توليد Prisma Client..."
npm run db:generate 2>/dev/null || (cd backend && npx prisma generate)

echo ""
echo "تشغيل النظام..."
echo "  - API:    http://localhost:3001/api"
echo "  - الواجهة: http://localhost:3000"
echo ""
echo "لإيقاف التشغيل: Ctrl+C"
echo "=========================================="

npm run dev

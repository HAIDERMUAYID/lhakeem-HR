#!/usr/bin/env bash
# Mark all existing migrations as applied (use when DB already has the schema).
# Run once from backend/ with DATABASE_URL set: npm run db:resolve-all
# Or: cd backend && npx prisma migrate resolve --applied 20260209152245_init && ...
cd "$(dirname "$0")/.."
for dir in prisma/migrations/*/; do
  name=$(basename "$dir")
  if [ "$name" != "migration_lock.toml" ] && [ -d "$dir" ]; then
    echo "Marking as applied: $name"
    npx prisma migrate resolve --applied "$name" || true
  fi
done
echo "Done. All migrations marked as applied."

#!/bin/bash
set -e

echo "🚀 Setting up Product Admin..."

# Check .env exists
if [ ! -f .env ]; then
  echo "⚠️  No .env file found. Copying from .env.example..."
  cp .env.example .env
  echo "❗ Edit .env with your settings before continuing!"
  exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Generating Prisma client..."
npx prisma generate

echo "🏗️  Running database migrations..."
npx prisma db push

echo "🌱 Seeding database with initial data..."
npm run db:seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "🔑 Login credentials:"
source .env
echo "   Admin: ${ADMIN_EMAIL:-admin@company.com} / ${ADMIN_PASSWORD:-Admin1234!}"
echo "   Lana:  lana@company.com / Pass1234!"
echo ""
echo "🚀 Start dev server: npm run dev"
echo "🌐 Open: http://localhost:3000"

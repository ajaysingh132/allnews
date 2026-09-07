# ज्ञानवार्ता — Complete Deployment Guide
# Vercel (Frontend) + Railway (Backend) + Supabase (DB)

## ══════════════════════════════════════
## PART 1: DATABASE SETUP (Supabase)
## ══════════════════════════════════════

### 1.1 Supabase Project
1. supabase.com → New Project → "gyanvarta"
2. Region: Asia South 1 (Mumbai) → closest to users
3. Password: strong password → save securely
4. After creation: Settings → Database → Copy "Connection String (URI)"

### 1.2 Run migrations
```bash
cd newsroom/backend
export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
npx prisma migrate dev --name init
npx prisma generate
```

### 1.3 Seed initial data
```bash
npx tsx src/utils/seed.ts
```

---

## ══════════════════════════════════════
## PART 2: MEILISEARCH SETUP
## ══════════════════════════════════════

### Option A: Meilisearch Cloud (recommended for MVP)
1. cloud.meilisearch.com → New Project → "gyanvarta"
2. Copy: Host URL + API Key
3. Run index setup:
```bash
MEILISEARCH_HOST=https://xxx.meilisearch.io \
MEILISEARCH_MASTER_KEY=your-key \
npx tsx src/scripts/setupSearch.ts
```

### Option B: Self-hosted on Railway
```dockerfile
# Dockerfile.meilisearch
FROM getmeili/meilisearch:v1.8
ENV MEILI_MASTER_KEY=your-secret-key
ENV MEILI_ENV=production
EXPOSE 7700
```

---

## ══════════════════════════════════════
## PART 3: BACKEND DEPLOYMENT (Railway)
## ══════════════════════════════════════

### 3.1 railway.toml (in backend/)
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npx prisma generate && npm run build"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3

[[services]]
name = "api"

[services.variables]
PORT = "4000"
NODE_ENV = "production"
```

### 3.2 Environment variables on Railway
```
DATABASE_URL=postgresql://...supabase...
REDIS_URL=redis://...upstash...
JWT_SECRET=<generate: openssl rand -base64 64>
JWT_REFRESH_SECRET=<generate: openssl rand -base64 64>
AI_INTERNAL_KEY=<generate: openssl rand -hex 32>
FRONTEND_URL=https://gyanvarta.in
CLAUDE_API_KEY=sk-ant-...
MEILISEARCH_HOST=https://...
MEILISEARCH_MASTER_KEY=...
TELEGRAM_BOT_TOKEN=...
WEBSITE_BASE_URL=https://gyanvarta.in
```

### 3.3 Deploy
```bash
npm install -g @railway/cli
railway login
cd newsroom/backend
railway init          # Link to Railway project
railway up            # Deploy
railway logs          # Watch logs
```

---

## ══════════════════════════════════════
## PART 4: FRONTEND DEPLOYMENT (Vercel)
## ══════════════════════════════════════

### 4.1 vercel.json (in frontend/)
```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "regions": ["bom1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/feed.xml", "destination": "/api/feed" },
    { "source": "/sitemap.xml", "destination": "/api/sitemap" }
  ]
}
```

### 4.2 Environment variables on Vercel
```
NEXT_PUBLIC_API_URL=https://your-app.railway.app
NEXT_PUBLIC_SITE_URL=https://gyanvarta.in
NEXT_PUBLIC_GOOGLE_VERIFY=your-google-verification
```

### 4.3 Deploy
```bash
npm install -g vercel
cd newsroom/frontend
vercel                # First deploy
vercel --prod         # Production deploy
```

### 4.4 Custom domain (gyanvarta.in)
1. Vercel → Project → Settings → Domains
2. Add: gyanvarta.in + www.gyanvarta.in
3. DNS: Add CNAME record → cname.vercel-dns.com

---

## ══════════════════════════════════════
## PART 5: CLOUDFLARE SETUP (CDN + Media)
## ══════════════════════════════════════

### 5.1 DNS on Cloudflare
```
A     @          → Vercel IP (proxy: ON)
CNAME www        → cname.vercel-dns.com (proxy: ON)
CNAME api        → your-app.railway.app (proxy: OFF)
CNAME cdn        → pub-xxx.r2.dev (proxy: OFF)
```

### 5.2 R2 Bucket (media storage)
```bash
# Install Wrangler
npm install -g wrangler
wrangler login
wrangler r2 bucket create gyanvarta-media
wrangler r2 bucket create gyanvarta-media-backup
```

### 5.3 CORS for R2
```json
[{
  "AllowedOrigins": ["https://gyanvarta.in", "https://www.gyanvarta.in"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 86400
}]
```

### 5.4 Cloudflare Cache Rules
- Cache everything for /images/*, /videos/*, /_next/static/*
- Bypass cache for /cms/*, /api/cms/*
- Cache TTL: 1 year for static assets, 5 min for articles

---

## ══════════════════════════════════════
## PART 6: CI/CD (GitHub Actions)
## ══════════════════════════════════════

### .github/workflows/deploy.yml
```yaml
name: Deploy ज्ञानवार्ता

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd newsroom/backend && npm ci
      - run: cd newsroom/backend && npx tsc --noEmit
      - run: cd newsroom/backend && npx prisma validate

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd newsroom/frontend && npm ci
      - run: cd newsroom/frontend && npx tsc --noEmit
      - run: cd newsroom/frontend && npm run build
        env:
          NEXT_PUBLIC_API_URL: https://api.gyanvarta.in

  deploy-backend:
    needs: test-backend
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: railway/deploy-action@v1
        with:
          service: gyanvarta-api
          token: ${{ secrets.RAILWAY_TOKEN }}

  deploy-frontend:
    needs: test-frontend
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

  migrate-db:
    needs: deploy-backend
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: cd newsroom/backend && npm ci
      - run: cd newsroom/backend && npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## ══════════════════════════════════════
## PART 7: MONITORING
## ══════════════════════════════════════

### Uptime monitoring
```bash
# Add to Railway as separate service
# Or use Better Uptime (free tier)
# Monitor: https://gyanvarta.in, https://api.gyanvarta.in/health
```

### Error tracking (Sentry)
```bash
npm install @sentry/nextjs @sentry/node
# Add SENTRY_DSN to environment variables
```

### Log management
- Railway: Built-in logs + log retention
- Production: Add Papertrail or Logtail

---

## ══════════════════════════════════════
## MONTHLY COST ESTIMATE
## ══════════════════════════════════════

| Service            | Plan          | Cost/Month |
|--------------------|---------------|------------|
| Vercel             | Hobby (free)  | ₹0         |
| Railway            | Starter $5    | ₹420       |
| Supabase           | Free (500MB)  | ₹0         |
| Upstash Redis      | Free (10K/day)| ₹0         |
| Cloudflare R2      | Pay-per-use   | ~₹100      |
| Meilisearch Cloud  | Build ($0)    | ₹0         |
| Claude API         | Pay-per-use   | ~₹800      |
| Domain             | Annual/12     | ~₹100      |
| **Total MVP**      |               | **~₹1,400** |

### Scale tier (5K+ daily visitors)
| Service            | Cost/Month |
|--------------------|------------|
| Vercel Pro         | ₹1,700     |
| Railway Pro        | ₹1,700     |
| Supabase Pro       | ₹2,100     |
| Cloudflare R2      | ₹500       |
| Meilisearch Pro    | ₹1,700     |
| Claude API         | ₹3,000     |
| **Total**          | **~₹10,700** |

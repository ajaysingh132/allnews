# Deployment Architecture — ज्ञानवार्ता

## Phase 1 MVP Stack (Low Cost)

```
┌─────────────────────────────────────────┐
│           Cloudflare (Free CDN)         │
│         DNS + DDoS + Caching            │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────────┐    ┌───────▼──────┐
│  Vercel    │    │   Railway    │
│ Next.js 14 │    │  Node.js API │
│ (Frontend) │    │  (Backend)   │
└────────────┘    └───────┬──────┘
                          │
              ┌───────────┴──────────┐
              │                      │
        ┌─────▼──────┐      ┌────────▼──────┐
        │  Supabase  │      │   Upstash      │
        │ PostgreSQL │      │   Redis        │
        │   + Auth   │      │  (Cache/Queue) │
        └────────────┘      └────────────────┘
              │
        ┌─────▼──────────┐
        │ Cloudflare R2  │
        │  Media Storage │
        │  (S3-compat)   │
        └────────────────┘
```

## Services & Monthly Cost (MVP)

| Service           | Plan        | Cost/Month |
|------------------|-------------|------------|
| Vercel            | Hobby/Pro   | ₹0-1700    |
| Railway           | Starter     | ₹850       |
| Supabase          | Free/Pro    | ₹0-2100    |
| Upstash Redis     | Free        | ₹0         |
| Cloudflare R2     | Pay-per-use | ~₹200      |
| Cloudflare Stream | Pay-per-use | ~₹850/TB   |
| **Total MVP**     |             | **~₹1000-5000** |

## Environment Variables
```bash
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
JWT_SECRET=<256-bit random>
JWT_REFRESH_SECRET=<256-bit random>
TOTP_ISSUER="ज्ञानवार्ता"

# AI
CLAUDE_API_KEY=sk-ant-...
WHISPER_API_KEY=...

# Storage
CLOUDFLARE_R2_BUCKET=gyanvarta-media
CLOUDFLARE_R2_ENDPOINT=...
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET=...

# Social APIs
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
INSTAGRAM_APP_ID=...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
TELEGRAM_BOT_TOKEN=...
WHATSAPP_API_KEY=...

# Search
MEILISEARCH_HOST=...
MEILISEARCH_API_KEY=...

# Email
RESEND_API_KEY=...
```

## CI/CD (GitHub Actions)
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  deploy-frontend:
    needs: test
    uses: vercel/action@v1
  deploy-backend:
    needs: test
    uses: railway deploy
  migrate:
    runs-on: ubuntu-latest
    steps:
      - run: npx prisma migrate deploy
```

## Next.js SEO Configuration
```typescript
// app/[slug]/page.tsx — NewsArticle Schema
export async function generateMetadata({ params }): Promise<Metadata> {
  const article = await getArticle(params.slug)
  return {
    title: article.seoTitle,
    description: article.seoDescription,
    openGraph: {
      title: article.titleHi,
      description: article.summary,
      images: [article.heroImageUrl],
      type: 'article',
      publishedTime: article.publishedAt,
    },
    other: {
      'article:section': article.category.nameHi,
    }
  }
}

// JSON-LD Schema
const newsArticleSchema = {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": article.titleHi,
  "datePublished": article.publishedAt,
  "dateModified": article.updatedAt,
  "author": { "@type": "Person", "name": article.author.name },
  "publisher": {
    "@type": "Organization",
    "name": "ज्ञानवार्ता",
    "logo": { "@type": "ImageObject", "url": "https://gyanvarta.in/logo.png" }
  },
  "inLanguage": "hi",
  "isAccessibleForFree": true,
}
```

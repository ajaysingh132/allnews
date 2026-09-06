# API Architecture — ज्ञानवार्ता

## Base URL Structure
```
https://api.gyanvarta.in/v1/          ← Public API
https://api.gyanvarta.in/cms/         ← CMS API (auth required)
https://api.gyanvarta.in/ai/          ← AI Agents (internal)
https://api.gyanvarta.in/webhooks/    ← Webhooks
```

## Authentication
- Public API: Rate-limited, no auth (100 req/min per IP)
- CMS API: Bearer JWT (15min access + 7day refresh)
- AI API: API Key header (X-AI-Key)
- Admin: JWT + 2FA session token

---

## Public API Endpoints

### Articles
GET    /v1/articles                    → list (paginated, filterable)
GET    /v1/articles/:slug              → single article + related
GET    /v1/articles/latest             → latest 20
GET    /v1/articles/trending           → by view_count last 24h
GET    /v1/categories                  → all categories
GET    /v1/categories/:slug/articles   → articles by category
GET    /v1/tags/:slug/articles         → articles by tag
GET    /v1/search?q=&category=&type=  → full-text search (Meilisearch)

### Videos
GET    /v1/videos                      → list
GET    /v1/videos/:slug                → single video + clips
GET    /v1/programs                    → all programs
GET    /v1/programs/:slug/episodes     → episodes

### Knowledge
GET    /v1/people/:slug                → person + related articles/claims
GET    /v1/organizations/:slug         → org details
GET    /v1/events/:slug                → event timeline

### Misc
GET    /v1/fact-checks                 → published fact checks
GET    /v1/newsletter/subscribe        → POST to subscribe
GET    /v1/live/status                 → current live stream info

---

## CMS API Endpoints (JWT Required)

### Articles CRUD
POST   /cms/articles                   → create draft
GET    /cms/articles                   → list all (with status filter)
GET    /cms/articles/:id               → single with full metadata
PUT    /cms/articles/:id               → update
DELETE /cms/articles/:id               → soft delete
POST   /cms/articles/:id/submit        → submit for review
POST   /cms/articles/:id/approve       → editor approve
POST   /cms/articles/:id/publish       → publish immediately
POST   /cms/articles/:id/schedule      → schedule publish
POST   /cms/articles/:id/correction    → add correction

### Sources & Claims
POST   /cms/sources                    → add source
GET    /cms/sources                    → search sources
PUT    /cms/sources/:id                → update
POST   /cms/claims                     → add claim to article
PUT    /cms/claims/:id/classify        → set classification
POST   /cms/fact-checks                → create fact check

### Social Media
POST   /cms/social/generate            → AI generate posts from article
GET    /cms/social/queue               → today's queue
POST   /cms/social/posts               → create post
PUT    /cms/social/posts/:id/approve   → approve
PUT    /cms/social/posts/:id/schedule  → set schedule
POST   /cms/social/posts/:id/publish   → publish now
GET    /cms/social/calendar            → calendar view

### Videos
POST   /cms/videos/upload              → upload (multipart)
PUT    /cms/videos/:id                 → update metadata
POST   /cms/videos/:id/clips           → create clip
POST   /cms/videos/:id/transcribe      → trigger transcription
GET    /cms/videos/:id/transcript      → get transcript

### Knowledge Core
POST   /cms/entities                   → create entity
PUT    /cms/entities/:id               → update
POST   /cms/entities/:id/relate        → add relationship
GET    /cms/entities/:id/graph         → entity knowledge graph

### Analytics
GET    /cms/analytics/dashboard        → today's metrics
GET    /cms/analytics/articles         → article performance
GET    /cms/analytics/social           → social metrics
GET    /cms/analytics/weekly           → AI weekly report

---

## AI API Endpoints (Internal — API Key)

POST   /ai/research          → research agent (topic → sources + summary)
POST   /ai/draft             → article draft from research
POST   /ai/summarize         → summarize long content
POST   /ai/social-generate   → article → all platform posts
POST   /ai/fact-check        → claim → fact check result
POST   /ai/seo               → article → SEO metadata
POST   /ai/transcript        → video URL → transcript
POST   /ai/clips-suggest     → transcript → clip suggestions
POST   /ai/weekly-report     → analytics → weekly AI insights
POST   /ai/knowledge-extract → article → entities to add

---

## GraphQL Endpoint (Knowledge Core)

POST   /graphql

### Key Queries
```graphql
query PersonKnowledge($slug: String!) {
  person(slug: $slug) {
    name interviews { title date }
    claims { text classification verified }
    relatedArticles { title slug publishedAt }
    relatedOrganizations { name role }
  }
}

query EventTimeline($slug: String!) {
  event(slug: $slug) {
    name description
    timeline { date description source { name url } }
    relatedPeople { name role }
    relatedDocuments { title url }
    relatedArticles { title slug }
  }
}
```

---

## Social Platform API Integration

| Platform     | API              | Publish Method    | Auth       |
|-------------|-----------------|-------------------|------------|
| YouTube     | Data API v3      | Direct API        | OAuth 2.0  |
| Facebook    | Graph API v18    | Direct API        | OAuth 2.0  |
| Instagram   | Graph API        | Direct API        | OAuth 2.0  |
| X/Twitter   | API v2           | Direct API        | OAuth 2.0  |
| LinkedIn    | API v2           | Direct API        | OAuth 2.0  |
| Telegram    | Bot API          | Direct API        | Bot Token  |
| WhatsApp    | Business API     | Direct API        | API Key    |
| Threads     | Threads API      | Direct API        | OAuth 2.0  |

---

## Webhook Events
POST /webhooks/video-processed      → CDN notifies video ready
POST /webhooks/payment              → membership payment confirmation
POST /webhooks/newsletter-bounce    → bounce handling
POST /webhooks/social-published     → platform confirms publish


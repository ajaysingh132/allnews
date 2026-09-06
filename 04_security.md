# Security Architecture — ज्ञानवार्ता

## Authentication Flow
1. Login → bcrypt verify → JWT (15min) + Refresh (7 days) issued
2. 2FA: TOTP (Google Authenticator compatible) — mandatory for Editor+
3. Refresh rotation: old token invalidated on use
4. Session stored in Redis with user_id + role

## RBAC Middleware (Express)
```typescript
const PERMISSIONS = {
  'article:publish': ['super_admin','admin','chief_editor'],
  'article:approve': ['super_admin','admin','chief_editor','editor'],
  'article:create':  ['super_admin','admin','chief_editor','editor','reporter','author'],
  'social:publish':  ['super_admin','admin','chief_editor','social_editor'],
  'analytics:read':  ['super_admin','admin','chief_editor','analytics'],
  'user:manage':     ['super_admin','admin'],
  'system:settings': ['super_admin'],
}

function requirePermission(permission: string) {
  return (req, res, next) => {
    const userRole = req.user.role
    if (!PERMISSIONS[permission]?.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    next()
  }
}

// High-risk content: additional check
function requireSensitiveApproval(req, res, next) {
  if (req.body.is_sensitive && !['chief_editor','super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Sensitive content requires Chief Editor approval' })
  }
  next()
}
```

## Data Security
- Passwords: bcrypt (cost=12)
- API keys: SHA-256 hashed, prefix stored for lookup
- Social tokens: AES-256-GCM encrypted at rest
- All HTTPS (TLS 1.3)
- Input sanitization: DOMPurify for HTML, parameterized SQL queries
- Rate limiting: 100/min public, 1000/min authenticated

## Audit Trail (every write operation)
```sql
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, ip_address)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet);
```

## Backup Strategy
- PostgreSQL: pg_dump daily at 3 AM → S3 (30 day retention)
- Media files: Cloudflare R2 with versioning
- Code: GitHub with branch protection

## Content Security Policy
```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: cdn.gyanvarta.in;
  frame-ancestors 'none';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

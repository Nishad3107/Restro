# RestroFlow Product Plan

## Product position

RestroFlow is a white-label ordering and operations product for independent cafés and restaurants. Each merchant receives a branded customer storefront and a private operations dashboard.

## Current implementation

- `public/index.html` remains the customer ordering storefront.
- `public/admin.html` is the first merchant dashboard MVP.
- Dashboard data is scoped by `tenant` in the URL and stored under tenant-specific browser-storage keys for demonstration.
- Implemented dashboard areas: overview metrics, order status workflow, menu CRUD, availability, and restaurant settings.

## Production architecture

The browser-storage demo must be replaced before production launch with:

1. Authentication and role-based access for platform admins, owners, and staff.
2. A server/API layer that calculates totals and validates tenant ownership.
3. A persistent database with every record scoped to `tenantId` and, where relevant, `locationId`.
4. Database security rules and server-side authorization.
5. Object storage for menu images.
6. Hosted payment checkout and webhook reconciliation.
7. Email/SMS/WhatsApp order notifications.
8. Audit logs, backups, monitoring, privacy policy, terms, refunds, and support workflows.

## Recommended delivery order

### Phase 1 — Foundation

- Move menu, orders, settings, and users into a persistent backend.
- Add authentication and merchant roles.
- Add tenant and location models.
- Move price and tax calculation to the server.

### Phase 2 — Operations

- Real-time order updates.
- Kitchen/order display.
- Business hours and item availability.
- Delivery zones, pickup, taxes, and fees.
- Order notifications.

### Phase 3 — Commercial readiness

- Online payments.
- Subscription billing.
- Custom domains and branding.
- Multiple branches.
- Analytics exports and support tools.

### Phase 4 — Scale

- Automated onboarding.
- Payment reconciliation and refunds.
- Rate limiting and abuse protection.
- Backups and disaster recovery.
- Production observability and security review.

## Non-negotiable production rules

- Never trust client-submitted prices, totals, tenant IDs, roles, or order status.
- Never expose one restaurant's data to another restaurant.
- Never store raw card data.
- Do not advertise online payments until payment webhooks and refunds are implemented.
- Do not call the browser-storage dashboard a secure admin panel until authentication and server authorization exist.

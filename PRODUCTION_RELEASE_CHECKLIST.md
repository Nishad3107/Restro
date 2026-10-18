# RestroFlow production release checklist

## Code foundations already deployed

- Tenant-scoped Firebase Authentication and merchant profiles.
- Server-side order pricing, tax, delivery zones, business hours, and cancellation rules.
- Signed, idempotent Stripe webhook endpoint.
- Real-time admin order listener and customer status tracking.
- Privacy, terms, and cancellation/refund page templates.

## Must be completed manually before public sale

### Refunds and reconciliation

Create a payment checkout that stores `tenantId`, `locationId`, and `orderId` as Stripe metadata. Configure Stripe test webhooks, send successful/failed/refunded test events, and verify payment status plus audit logs. Only then switch to live mode and document who approves refunds.

### Tests

Run the local checks:

```bash
node --check functions/index.js
node tools/smoke-check.js
```

Run the browser acceptance flow in `REAL_ORDER_TEST.md` on staging before production. Browser automation still needs to be installed and connected to a staging project before it can be considered a release gate.

### Monitoring and backups

Enable Firebase/Google Cloud error reporting, alerting, uptime checks, budget alerts, and Firestore scheduled exports to a separate protected storage bucket. Test restoring an export before launch.

### Branding and branches

Each location needs a logo URL, menu image URLs, colors, typography, address, timezone, and branch status in its location document. Custom domains require DNS access and domain verification for every restaurant.

### Subscription billing and platform administration

Create platform plans, trial length, usage limits, tax treatment, failed-payment handling, and a Stripe Billing account. Provision subscriptions only from signed billing webhooks. The platform administrator must approve tenants and merchant roles.

### GST/tax and policies

Confirm with a qualified tax professional whether prices are GST-inclusive, the applicable rate and HSN/SAC treatment, intra-state CGST/SGST versus inter-state IGST, invoice numbering, GSTIN collection, and record retention. The current `taxRate` is a configurable calculation field, not a completed legal GST implementation.

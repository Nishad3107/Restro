# RestroFlow

RestroFlow is a Firebase-hosted, multi-tenant restaurant ordering and operations product. It keeps delivery ordering while adding QR-based dine-in ordering, table sessions, staff workflows, kitchen status updates, and session billing.

## Included capabilities

- Mobile customer menu, cart, delivery checkout, and QR table ordering.
- Server-side menu-price, tax, delivery-fee, business-hours, and delivery-zone validation.
- Tenant and branch-scoped Firestore data with protected client writes.
- Merchant authentication and platform-admin merchant provisioning.
- Table management with status changes and downloadable QR codes.
- Realtime merchant orders, kitchen workflow, waiter/bill requests, dining sessions, and split-bill drafts.
- Delivery remains available when the customer URL does not contain a table parameter.
- Legal, operations, authentication, webhook, testing, and production-release documentation.

## Technology

- HTML5, CSS3, and vanilla JavaScript for the customer and staff interfaces.
- Firebase Authentication, Firestore, Cloud Functions v2, and Hosting.
- Google Maps APIs for optional delivery address lookup.
- Stripe webhook reconciliation foundation; payment checkout still requires provider configuration and testing.

## Getting started

```bash
git clone https://github.com/Nishad3107/Restro.git
cd Restro
npm --prefix functions install
node --check functions/index.js
node tools/smoke-check.js
```

For local browser work, serve `public/` through a local web server. Firebase Hosting is the supported deployed environment.

## URLs

Tenant-facing pages accept `tenant=<tenant id>` and `location=<branch id>`.

```text
Customer delivery: https://restro-6bf9c.web.app/?tenant=royal-rasoi&location=main
Customer dine-in:  https://restro-6bf9c.web.app/?tenant=royal-rasoi&location=main&table=table-01
Merchant dashboard: https://restro-6bf9c.web.app/admin.html?tenant=royal-rasoi&location=main
Tables: https://restro-6bf9c.web.app/tables.html?tenant=royal-rasoi&location=main
Kitchen: https://restro-6bf9c.web.app/kitchen.html?tenant=royal-rasoi&location=main
```

## Deployment

```bash
firebase use restro-6bf9c
firebase deploy --only functions,firestore:rules,hosting
```

If Functions deployment requires Secret Manager, enable the API in Google Cloud and configure the secret interactively:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions,firestore:rules,hosting
```

Never commit `.env` files, service-account credentials, Stripe signing secrets, payment private keys, or unrestricted API credentials. The browser Firebase configuration is client configuration, but it still needs API and domain restrictions.

## Documentation

- [Architecture and configuration reference](ARCHITECTURE.md)
- [Product plan](PRODUCT_PLAN.md)
- [Merchant authentication setup](MERCHANT_AUTH_SETUP.md)
- [Production operations](PRODUCT_OPERATIONS.md)
- [Payment webhook setup](PAYMENT_WEBHOOK_SETUP.md)
- [Real order acceptance test](REAL_ORDER_TEST.md)
- [Production release checklist](PRODUCTION_RELEASE_CHECKLIST.md)

## Production scope

The payment webhook verifies and reconciles provider events; it does not create checkout sessions. Complete and test payment checkout, monitoring, backups, browser acceptance tests, GST/tax review, legal review, and a real restaurant pilot before selling this as a production payment-enabled product.

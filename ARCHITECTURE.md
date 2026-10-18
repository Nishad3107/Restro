# RestroFlow architecture and configuration reference

RestroFlow is a Firebase-hosted, multi-tenant restaurant ordering platform. It supports QR-based dine-in ordering and the existing delivery flow.

## Runtime components

| Component | Location | Responsibility |
| --- | --- | --- |
| Customer storefront | `public/index.html` | Menu, cart, delivery checkout, QR table ordering, live order status |
| Merchant dashboard | `public/admin.html` | Authentication, menu/settings, and order monitoring |
| Platform admin | `public/platform-admin.html` | Provision merchant profiles and roles |
| Table management | `public/tables.html` | Create tables, status changes, QR generation/download |
| Kitchen display | `public/kitchen.html` | Dine-in preparation workflow |
| Staff requests | `public/requests.html` | Waiter and bill requests |
| Billing | `public/billing.html` | Dining-session totals and split-bill draft generation |
| Backend | `functions/index.js` | Trusted validation, pricing, authorization, sessions, audit, webhook handling |
| Database rules | `firestore.rules` | Client-side tenant isolation and write protection |
| Hosting config | `firebase.json` | Hosting, Functions source, and Firestore rules deployment |

## Firebase project parameters

```text
Firebase project: restro-6bf9c
Functions region: asia-south1
Runtime: Node.js 20 (upgrade to Node.js 22 before Node 20 decommissioning)
Hosting URL: https://restro-6bf9c.web.app
Default tenant: royal-rasoi
Default location: main
```

Firebase web configuration is public client configuration. It must still be restricted in Google Cloud by allowed APIs and production domains. Never put service-account JSON, Stripe secrets, or private keys in `public/` or Git.

## URL parameters

Tenant-facing pages accept `tenant=<tenant id>` and `location=<branch id>`. The customer page additionally accepts `table=<table id>`.

Example QR destination:

```text
https://restro-6bf9c.web.app/?tenant=royal-rasoi&location=main&table=table-01
```

The `table` parameter switches the customer flow to `DINE_IN`. Without it, the existing customer flow remains `DELIVERY`.

## Firestore data model

```text
users/{uid}
tenants/{tenantId}
  locations/{locationId}
    menu/{itemId}
    orders/{orderId}
    tables/{tableId}
    diningSessions/{sessionId}
    tableRequests/{requestId}
    bills/{billId}
    auditLogs/{auditId}
paymentEvents/{providerEventId}
rateLimits/{rateLimitId}
```

Every operational record is scoped by both `tenantId` and `locationId`. The backend verifies those values against the authenticated staff profile and selected branch. Browser clients cannot directly create or update orders, tables, sessions, bills, requests, rate limits, or payment events.

## Order types and status flow

Delivery orders use `orderType: DELIVERY` and retain delivery address/customer fields. QR orders use `orderType: DINE_IN` and include `tableId`, `tableNumber`, and `sessionId`.

```text
ORDER_PLACED -> ORDER_ACCEPTED -> PREPARING -> READY -> SERVED
             -> BILL_REQUESTED -> PAID -> COMPLETED
```

When a dine-in order reaches `COMPLETED`, its active dining session is completed and the table is returned to `AVAILABLE`.

## Callable backend contracts

| Function | Caller | Purpose |
| --- | --- | --- |
| `createOrder` | Customer | Validates menu prices, hours, taxes, delivery zone, table/session, and creates the order |
| `getOrderStatus` | Customer | Reads a scoped order status |
| `cancelOrder` | Customer/staff | Validates cancellation window and records cancellation |
| `updateOrderStatus` | Authorized staff | Advances a scoped order through allowed statuses |
| `createTable` | Owner/manager/platform admin | Creates a table record and QR URL |
| `updateTable` | Owner/manager/receptionist/waiter/platform admin | Changes table status |
| `createTableRequest` | Customer | Creates waiter/bill request for an active session |
| `updateTableRequest` | Authorized staff | Acknowledges or resolves a request |
| `createSessionBill` | Owner/manager/receptionist | Calculates session bill and split shares |
| `createMerchantProfile` | Platform admin | Provisions a merchant user profile |
| `recordAuditEvent` | Authenticated client | Records a permitted audit event through the backend |
| `paymentWebhook` | Payment provider | Verifies signed provider events and reconciles payment status |

## Roles

Supported roles are `platform_admin`, `owner`, `manager`, `staff`, `receptionist`, `kitchen`, `kitchen_staff`, and `waiter`. Backend permissions are authoritative; UI visibility is only a convenience.

## Local validation

```bash
npm --prefix functions install
node --check functions/index.js
node tools/smoke-check.js
```

The smoke check requires the deployed Hosting URL to be reachable. It does not replace an authenticated browser test or a real restaurant test order.

## Deployment

```bash
firebase use restro-6bf9c
firebase deploy --only functions,firestore:rules,hosting
```

If Functions deployment reports that Secret Manager is disabled, enable Secret Manager for the Firebase project, then configure the secret without putting its value in Git:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions,firestore:rules,hosting
```

The payment webhook is not a payment checkout. Before advertising online card/UPI payments, implement checkout creation, add provider metadata (`tenantId`, `locationId`, `orderId`), test success/failure/refund events, and verify reconciliation.

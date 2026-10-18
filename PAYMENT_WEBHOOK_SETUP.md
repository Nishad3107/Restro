# Stripe webhook setup

The deployed endpoint is:

`https://asia-south1-restro-6bf9c.cloudfunctions.net/paymentWebhook`

The endpoint verifies Stripe's `Stripe-Signature` header, rejects unsigned requests, records each event once, and updates the order referenced by these Stripe metadata fields:

```text
tenantId
locationId
orderId
```

## Manual setup

1. Create or open a Stripe account.
2. In Stripe Dashboard, open **Developers → Webhooks**.
3. Add the endpoint above.
4. Select at least:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `refund.succeeded`
5. Copy the endpoint signing secret beginning with `whsec_`.
6. Store it in Firebase Secret Manager:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

Do not put the signing secret in browser code or commit it to Git.

The payment checkout creation flow is not enabled yet. Do not advertise card payments until checkout creates Stripe objects with the required order metadata and this webhook has been tested with Stripe test events.

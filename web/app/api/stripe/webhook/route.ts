import {
  constructStripeWebhookEvent,
  syncCompletedCheckoutSession,
  syncStripeSubscription,
} from "@/lib/billing/stripe";

const stripeSignatureHeader = "stripe-signature";

export async function POST(request: Request) {
  const signature = request.headers.get(stripeSignatureHeader);

  if (!signature) {
    return Response.json(
      { error: "Missing Stripe signature header." },
      { status: 400 }
    );
  }

  const payload = await request.text();

  let event;

  try {
    event = constructStripeWebhookEvent(payload, signature);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe webhook verification failed.",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await syncCompletedCheckoutSession(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncStripeSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe webhook processing failed.",
      },
      { status: 500 }
    );
  }

  return Response.json({ received: true });
}

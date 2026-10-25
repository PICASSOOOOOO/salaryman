import { getStripe } from "../routes/stripe";

async function main() {
  const stripe = getStripe();
  const found = await stripe.products.search({
    query: "metadata['salaryman_product']:'org_seat'",
    limit: 1,
  });
  const product = found.data.find((item) => item.active) ?? await stripe.products.create({
    name: "SALARYMAN Organization Seat",
    description: "Monthly organization member seat. Price depends on the organization's plan.",
    metadata: { salaryman_product: "org_seat", product_line: "SALARYMAN" },
  });
  const activePrices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });

  for (const amount of [25, 50] as const) {
    const existing = activePrices.data.find((price) =>
      price.currency === "usd" && price.unit_amount === amount * 100
      && price.type === "recurring" && price.recurring?.interval === "month"
    );
    const price = existing ?? await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: amount * 100,
      recurring: { interval: "month" },
      nickname: `Organization seat — $${amount}/month`,
      metadata: { salaryman_product: "org_seat", seat_monthly_usd: String(amount) },
    });
    console.log(`SALARYMAN $${amount}/month seat price: ${price.id}`);
  }
}

main().catch((error) => {
  console.error("Could not seed organization seat prices:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { LegalLayout } from "@/components/LegalLayout";

export default function RefundPolicy() {
  return (
    <LegalLayout title="Refund & Dispute Policy" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>This policy applies to all purchases made through the SALARYMAN platform operated by <strong>PICASSO AI LLC</strong>, including CRYPTO virtual currency, cosmetic store items, donations, and tips.</p>
      </div>

      <h2>1. Digital Goods — CRYPTO Virtual Currency</h2>
      <p><strong>All sales of CRYPTO virtual currency are final.</strong> CRYPTO is an in-game virtual currency used to purchase cosmetic items and other digital goods within SALARYMAN. Because CRYPTO is a digital good that is immediately delivered upon purchase, we generally do not offer refunds for CRYPTO purchases.</p>
      <p><strong>Exceptions — CRYPTO refunds may be granted in the following circumstances:</strong></p>
      <ul>
        <li>Technical error resulting in incorrect CRYPTO amount delivered to your account</li>
        <li>Duplicate charge due to a payment processing error</li>
        <li>Unauthorized purchase (see Section 5 — Fraudulent Transactions)</li>
        <li>PICASSO AI LLC permanently shuts down the SALARYMAN platform (full refund of unused CRYPTO at purchase-equivalent value)</li>
      </ul>
      <p>Refund requests for CRYPTO must be submitted within <strong>14 days</strong> of the original transaction.</p>

      <h2>2. Cosmetic Store Items</h2>
      <p>Cosmetic items (skins, avatars, badges, effects, and other digital collectibles) purchased with CRYPTO or real currency are <strong>non-refundable</strong> once delivered to your account. These items are licensed digital goods and do not carry any real-world value.</p>
      <p>If a cosmetic item purchased is not delivered due to a technical error, please contact support within 7 days and we will investigate and redeliver or refund as appropriate.</p>

      <h2>3. Subscriptions (Battle Pass / Season Pass / Calll Home)</h2>
      <p>Subscription charges are eligible for a prorated refund if requested within <strong>7 days</strong> of the billing date and you have not used the subscription features during that billing period. After 7 days, subscription fees are non-refundable for the current billing period. See also the <a href="/legal/cancellation">Cancellation Policy</a>.</p>

      <h2>4. Donations &amp; Tips</h2>
      <p><strong>Donations and tips made through SALARYMAN are non-refundable.</strong> By completing a donation or tip transaction you acknowledge that these funds are transferred immediately and voluntarily, and that PICASSO AI LLC does not hold these funds on your behalf after completion.</p>

      <h2>5. Fraudulent &amp; Unauthorized Transactions</h2>
      <p>If you believe a transaction was made fraudulently without your authorization, contact us immediately at <a href="mailto:billing@picassoo.ai">billing@picassoo.ai</a>. We will investigate and, if the transaction is confirmed to be unauthorized, issue a full refund. We may require verification of your identity to process fraud claims.</p>

      <h2>6. Dispute Resolution Process</h2>
      <p>To submit a refund or dispute request:</p>
      <ul>
        <li>Contact us via the <a href="/legal/contact">Contact Us</a> page or email <strong>billing@picassoo.ai</strong></li>
        <li>Include your account email, transaction date, transaction ID or amount, and a description of the issue</li>
        <li>Our billing team will respond within 3–5 business days</li>
        <li>If your dispute is approved, refunds are typically processed within 5–10 business days and returned to the original payment method</li>
      </ul>

      <h2>7. Chargebacks</h2>
      <p>If you initiate a chargeback with your bank or credit card provider without first contacting PICASSO AI LLC, we reserve the right to suspend or permanently ban your account pending investigation. We encourage you to contact us first — we are committed to resolving legitimate disputes fairly.</p>

      <h2>8. Physical Merchandise</h2>
      <p>Physical merchandise refunds are governed by the separate <a href="/legal/returns">Return Policy</a>.</p>

      <h2>9. Contact</h2>
      <p>For refund and dispute inquiries: <a href="mailto:billing@picassoo.ai">billing@picassoo.ai</a> or the <a href="/legal/contact">Contact Us</a> page.</p>
    </LegalLayout>
  );
}

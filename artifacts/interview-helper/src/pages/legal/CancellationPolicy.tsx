import { LegalLayout } from "@/components/LegalLayout";

export default function CancellationPolicy() {
  return (
    <LegalLayout title="Cancellation Policy" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>This policy explains how to cancel subscriptions and recurring billing for SALARYMAN services operated by <strong>PICASSO AI LLC</strong>. You may cancel at any time.</p>
      </div>

      <h2>1. Subscriptions Overview</h2>
      <p>SALARYMAN offers the following subscription products that include recurring billing:</p>
      <ul>
        <li><strong>Passport</strong> — Season-based subscription unlocking exclusive cosmetics, FIAT (ƒ) bonuses, and early access to features. Billed per season (approximately 3 months).</li>
        <li><strong>Season Pass</strong> — Annual subscription providing premium platform access, expanded AI agent capabilities, and exclusive perks. Billed annually.</li>
        <li><strong>Calll Home (Phone System)</strong> — Monthly subscription ($95/mo) for access to the business phone system including call recording, AI coaching, and conference calling.</li>
        <li><strong>Other premium features</strong> — Additional recurring subscriptions may be offered as the platform grows.</li>
      </ul>

      <h2>2. How to Cancel</h2>
      <p>You may cancel any subscription at any time using any of the following methods:</p>
      <ul>
        <li><strong>In-app:</strong> Navigate to your Profile → Subscription → Cancel Subscription</li>
        <li><strong>Contact form:</strong> Use the <a href="/legal/contact">Contact Us</a> page with subject "Billing &amp; Subscription" — include your account email and subscription name</li>
      </ul>
      <p>Cancellations take effect at the end of the current billing period. We do not charge cancellation fees.</p>

      <h2>3. Effect of Cancellation</h2>
      <h3>Passport</h3>
      <p>Upon cancellation, you retain Passport benefits through the end of the current season. Accumulated FIAT (ƒ) and unlocked cosmetics remain in your account permanently. No future season content is unlocked after cancellation.</p>

      <h3>Season Pass</h3>
      <p>Cancellation takes effect at the end of your current annual subscription period. Premium platform features revert to the free tier upon expiration. Cosmetic items  and FIAT (ƒ) earned during the subscription period are retained.</p>

      <h3>Calll Home (Phone System)</h3>
      <p>Phone system access is disabled at the end of the current billing month following cancellation. Call history, recordings (within the retention window), and contacts remain accessible for 30 days post-cancellation for data export. After 30 days, your phone data may be deleted.</p>

      <h2>4. Refunds Upon Cancellation</h2>
      <p>Cancellation does not automatically trigger a refund for the current billing period. Partial refunds for unused subscription time may be considered on a case-by-case basis at PICASSO AI LLC's discretion. See the <a href="/legal/refunds">Refund &amp; Dispute Policy</a> for details on requesting a refund.</p>

      <h2>5. Pausing Subscriptions</h2>
      <p>At this time, PICASSO AI LLC does not offer the ability to pause subscriptions. If you need to temporarily reduce costs, we recommend cancelling and re-subscribing when ready. Your previously unlocked content will be retained.</p>

      <h2>6. Automatic Renewal</h2>
      <p>All subscriptions renew automatically at the end of each billing period unless cancelled before the renewal date. You will receive a reminder email <strong>3 days before</strong> any subscription renewal. PICASSO AI LLC will send a receipt email after each successful charge.</p>

      <h2>7. Changes to Subscription Pricing</h2>
      <p>PICASSO AI LLC reserves the right to change subscription pricing. We will provide at least <strong>30 days' written notice</strong> via email before any price change takes effect for existing subscribers. You may cancel your subscription during this notice period if you do not agree to the new pricing.</p>

      <h2>8. Contact</h2>
      <p>For cancellation requests or billing questions, please use our <a href="/legal/contact">Contact Us</a> page.</p>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

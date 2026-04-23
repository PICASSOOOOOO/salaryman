import { LegalLayout } from "@/components/LegalLayout";

export default function PromotionsPolicy() {
  return (
    <LegalLayout title="Promotions Terms & Conditions" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>These Promotions Terms govern all in-game promotions, seasonal events, bonus currency offers, and promotional pricing offered through SALARYMAN by <strong>PICASSO AI LLC</strong>.</p>
      </div>

      <h2>1. Scope</h2>
      <p>These terms apply to all promotions, including but not limited to:</p>
      <ul>
        <li>Seasonal event challenges and limited-time rewards</li>
        <li>Bonus FIAT (ƒ) virtual currency offers (e.g., "Buy 1000 FIAT (ƒ), get 200 free")</li>
        <li>Passport early-purchase discounts</li>
        <li>Referral and affiliate reward programs</li>
        <li>Flash sales and limited-time cosmetic store discounts</li>
        <li>Promotional codes and coupon offers</li>
        <li>Merchandise discount events via PABLO CORP Merch Dept</li>
      </ul>

      <h2>2. Eligibility</h2>
      <p>Promotions are available to registered SALARYMAN users unless otherwise stated. PICASSO AI LLC reserves the right to exclude users from promotions if:</p>
      <ul>
        <li>The user has a history of fraudulent activity or Terms of Service violations</li>
        <li>The promotion is restricted by jurisdiction (see <a href="/legal/restrictions">Legal &amp; Export Restrictions</a>)</li>
        <li>The user has previously received a similar promotional benefit within the restricted period</li>
        <li>Specific eligibility criteria stated in the individual promotion are not met</li>
      </ul>

      <h2>3. Promotional FIAT (ƒ) Offers</h2>
      <h3>3.1 Bonus Currency</h3>
      <p>Bonus FIAT (ƒ) awarded as part of a promotion is subject to the same terms as purchased FIAT (ƒ). Bonus FIAT (ƒ) may be subject to a <strong>spending requirement</strong> — for example, bonus FIAT (ƒ) may only become spendable after the base FIAT (ƒ) purchase amount has been used first.</p>
      <h3>3.2 Expiration</h3>
      <p>Promotional FIAT (ƒ) bonuses may have expiration dates, which will be clearly stated at the time of the offer. Standard purchased FIAT (ƒ) does not expire while your account is in good standing.</p>
      <h3>3.3 Non-Transferability</h3>
      <p>Promotional FIAT (ƒ) is non-transferable and cannot be gifted to other users.</p>

      <h2>4. Seasonal Events</h2>
      <p>Seasonal events (e.g., holiday events, anniversary celebrations) offer limited-time cosmetics, challenges, and rewards. The following conditions apply:</p>
      <ul>
        <li>Seasonal content is available only during the event window specified in-game</li>
        <li>Content not obtained during the event window may become unavailable permanently or until a re-release is announced</li>
        <li>PICASSO AI LLC reserves the right to modify, extend, or terminate seasonal events at any time</li>
        <li>Seasonal event completion rewards are non-transferable between accounts</li>
      </ul>

      <h2>5. Promotional Codes</h2>
      <ul>
        <li>Promotional codes are single-use unless explicitly stated otherwise</li>
        <li>Codes are non-transferable and have no cash value</li>
        <li>Codes cannot be combined with other promotions unless specified</li>
        <li>PICASSO AI LLC reserves the right to revoke or deactivate any code at any time if misuse is suspected</li>
        <li>Sharing, selling, or distributing promotional codes without PICASSO AI LLC's written consent is prohibited</li>
      </ul>

      <h2>6. Referral Programs</h2>
      <p>Where a referral program is offered, the following applies:</p>
      <ul>
        <li>Referral rewards are granted only when the referred user completes the qualifying action (e.g., signs up and makes a qualifying purchase)</li>
        <li>Self-referrals (using your own referral link or code) are prohibited and will result in reward revocation</li>
        <li>Fraudulent referral activity may result in account suspension</li>
        <li>Referral rewards may be subject to a holding period before being spendable</li>
      </ul>

      <h2>7. Promotional Pricing</h2>
      <p>Promotional prices apply only for the duration of the stated promotion. PICASSO AI LLC is not obligated to honor promotional pricing after the promotion has ended. Promotional pricing cannot be applied retroactively to past purchases.</p>

      <h2>8. Modification &amp; Cancellation of Promotions</h2>
      <p>PICASSO AI LLC reserves the right to modify, suspend, or cancel any promotion at any time without prior notice. In the event of a technical error that causes an unintended promotional benefit, PICASSO AI LLC may revoke or adjust the benefit and is not liable for any resulting inconvenience.</p>

      <h2>9. Merchandise Promotions</h2>
      <p>Discounts and promotions on physical merchandise through PABLO CORP Merch Dept are subject to these terms plus the additional terms stated at the time of purchase. Sale items may not be returnable unless defective. See the <a href="/legal/returns">Return Policy</a> for details.</p>

      <h2>10. Contact</h2>
      <p>Questions about a specific promotion? Use our <a href="/legal/contact">Contact Us</a> page.</p>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

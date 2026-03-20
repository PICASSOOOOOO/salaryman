import { LegalLayout } from "@/components/LegalLayout";

export default function ReturnPolicy() {
  return (
    <LegalLayout title="Return Policy" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>This Return Policy governs physical merchandise purchased through the <strong>PABLO CORP Merch Dept</strong>, a division of PICASSO AI LLC. By purchasing physical merchandise you agree to this policy.</p>
      </div>

      <h2>1. Eligibility for Returns</h2>
      <p>Physical merchandise may be returned for a full refund or exchange if:</p>
      <ul>
        <li>The return request is submitted within <strong>30 days</strong> of the delivery date</li>
        <li>The item is in its original, unworn, unwashed condition with all tags attached</li>
        <li>The item is in its original packaging (where applicable)</li>
        <li>The item has not been customized, altered, or personalized</li>
        <li>Proof of purchase (order confirmation email or order number) is provided</li>
      </ul>

      <h2>2. Non-Returnable Items</h2>
      <p>The following items are not eligible for return:</p>
      <ul>
        <li>Items marked "Final Sale" or "Non-Returnable" at time of purchase</li>
        <li>Customized or personalized merchandise (e.g., items with custom prints or embroidery)</li>
        <li>Underwear, swimwear, or items that contact skin (for hygiene reasons)</li>
        <li>Digital downloads included with physical bundles</li>
        <li>Damaged items resulting from misuse, accidents, or normal wear and tear</li>
      </ul>

      <h2>3. Defective or Incorrect Items</h2>
      <p>If you receive a defective, damaged, or incorrect item, please contact us within <strong>7 days</strong> of delivery. We will arrange a prepaid return label and ship a replacement at no cost to you. Photographic evidence of the defect may be required.</p>

      <h2>4. Return Process</h2>
      <p>To initiate a return:</p>
      <ul>
        <li>Contact the PABLO CORP Merch Dept via the <a href="/legal/contact">Contact Us</a> page with subject "Merchandise Return"</li>
        <li>Include your order number, item(s) to be returned, and reason for return</li>
        <li>Our team will issue a Return Merchandise Authorization (RMA) number within 2–3 business days</li>
        <li>Package the item securely and include the RMA number on the outside of the package</li>
        <li>Ship the return to the address provided in the RMA confirmation email</li>
      </ul>

      <h2>5. Return Shipping</h2>
      <ul>
        <li><strong>Defective/incorrect items:</strong> PABLO CORP covers return shipping costs</li>
        <li><strong>Change of mind or size exchange:</strong> Customer is responsible for return shipping costs</li>
        <li>We recommend using a trackable shipping method — PABLO CORP is not responsible for lost return packages</li>
      </ul>

      <h2>6. Refund Timeline</h2>
      <p>Once we receive and inspect your return, we will notify you via email. Approved refunds are processed within <strong>5–7 business days</strong> and credited back to your original payment method. Depending on your financial institution, it may take an additional 5–10 business days to appear on your statement.</p>

      <h2>7. Exchanges</h2>
      <p>We offer exchanges for different sizes or colors of the same item, subject to availability. If the requested exchange item is unavailable, we will issue a full refund. To request an exchange, follow the return process and note your preferred replacement in the initial return request.</p>

      <h2>8. International Returns</h2>
      <p>International customers (outside the United States) are responsible for all return shipping costs, duties, and taxes. We cannot refund duties or taxes paid at the time of the original purchase. Return windows for international orders remain 30 days from delivery.</p>

      <h2>9. Contact — PABLO CORP Merch Dept</h2>
      <ul>
        <li><strong>Contact:</strong> Use the <a href="/legal/contact">Contact Us</a> page with subject "Merchandise Return"</li>
        <li><strong>Processing hours:</strong> Mon–Fri, 10 AM–4 PM PT</li>
        <li><strong>Response time:</strong> 2–3 business days</li>
      </ul>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

import { LegalLayout } from "@/components/LegalLayout";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>PICASSO AI LLC ("we", "us", "our") operates SALARYMAN. This Privacy Policy explains how we collect, use, share, and protect information about you when you use the Service.</p>
      </div>

      <h2>1. Information We Collect</h2>
      <h3>1.1 Information You Provide</h3>
      <ul>
        <li><strong>Account data</strong> — name, email address, and profile information provided via Replit Auth</li>
        <li><strong>Contact &amp; CRM data</strong> — contact information you enter into the Business module</li>
        <li><strong>Communications</strong> — messages and data sent through the Contact form or customer support channels</li>
        <li><strong>Purchase information</strong> — billing details, transaction history for CRYPTO, cosmetic items, subscriptions, and merchandise</li>
      </ul>
      <h3>1.2 Information Collected Automatically</h3>
      <ul>
        <li><strong>Usage data</strong> — features used, pages visited, session duration, and interaction logs</li>
        <li><strong>Device &amp; browser data</strong> — IP address, browser type, operating system, device identifiers</li>
        <li><strong>Phone system data</strong> — call logs, call recordings (when enabled by you), voicemails, and transcriptions from Calll Home</li>
        <li><strong>AI interaction data</strong> — prompts, outputs, and session context from AI agent interactions (used to improve service quality)</li>
      </ul>
      <h3>1.3 Information from Third Parties</h3>
      <ul>
        <li>Authentication data from Replit Auth</li>
        <li>Payment processing data from Stripe (we do not store full card numbers)</li>
        <li>Communication data from Twilio (call metadata, SMS)</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service</li>
        <li>To process transactions and send related information</li>
        <li>To send administrative communications including account updates and policy changes</li>
        <li>To respond to support requests and inquiries</li>
        <li>To detect and prevent fraud, abuse, or security incidents</li>
        <li>To analyze usage patterns and improve platform features</li>
        <li>To send product updates and promotional materials (you may opt out at any time)</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>3. Information Sharing</h2>
      <p>We do not sell your personal information. We may share information with:</p>
      <ul>
        <li><strong>Service providers</strong> — third parties that help us deliver the Service (e.g., Twilio, Stripe, Resend, OpenAI, Anthropic, cloud hosting providers) under data processing agreements</li>
        <li><strong>Legal requirements</strong> — when required by law, court order, or governmental authority</li>
        <li><strong>Business transfers</strong> — in connection with a merger, acquisition, or sale of assets, with appropriate notice</li>
        <li><strong>With your consent</strong> — for any other purpose with your explicit consent</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>We retain your information for as long as your account is active or as needed to provide the Service. Call recordings and AI interaction logs are retained for up to 90 days unless you explicitly request deletion. Billing records are retained for 7 years as required by law.</p>

      <h2>5. Security</h2>
      <p>We implement industry-standard security measures including encryption in transit (TLS), encrypted storage for sensitive data, and access controls. No method of transmission over the Internet is 100% secure; we cannot guarantee absolute security.</p>

      <h2>6. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data (subject to legal retention obligations)</li>
        <li>Opt out of marketing communications</li>
        <li>Data portability (where technically feasible)</li>
      </ul>
      <p>To exercise these rights, contact us at <strong>privacy@picassoo.ai</strong> or use the <a href="/legal/contact">Contact Us</a> page.</p>

      <h2>7. Children's Privacy</h2>
      <p>SALARYMAN is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us personal information, please contact us immediately.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or platform notice. Your continued use of the Service after changes take effect constitutes your acceptance of the revised policy.</p>

      <h2>9. Contact</h2>
      <p>Privacy questions or requests may be directed to: <strong>privacy@picassoo.ai</strong> or via our <a href="/legal/contact">Contact Us</a> page.</p>
    </LegalLayout>
  );
}

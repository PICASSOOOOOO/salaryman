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
        <li><strong>Purchase information</strong> — billing details, transaction history for FIAT (ƒ), cosmetic items, subscriptions, and merchandise</li>
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
      <p>We operate a HIPAA-aligned business communications platform. To support compliance, audit, and dispute resolution, we retain the following records for up to <strong>ten (10) years</strong> from the date of creation, unless you submit a verified deletion request:</p>
      <ul>
        <li>Call recordings (inbound, outbound, conference, voicemail) — audio files and metadata</li>
        <li>Call transcripts and AI-generated call summaries</li>
        <li>Pablo voice and text session logs (conversation history, commands, navigation)</li>
        <li>Contacts, leads, calendar events, tasks, and CRM activity</li>
        <li>Messages, notes, and uploaded documents associated with your account</li>
      </ul>
      <p>Billing and tax records are retained for seven (7) years as required by law. Account profile data is retained for as long as your account is active. You may request deletion of records that are not subject to a legal or regulatory retention obligation by submitting a request via our <a href="/legal/contact">Contact Us</a> page.</p>
      <p>Recordings, transcripts, and interaction logs are encrypted in transit and at rest and are accessible only to you, members of your organization with appropriate permissions, and authorized Picasso AI personnel acting under a Business Associate Agreement (where applicable).</p>

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
      <p>To exercise these rights, use our <a href="/legal/contact">Contact Us</a> page and select "Privacy Request" as the subject.</p>

      <h2>7. Children's Privacy</h2>
      <p>SALARYMAN is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us personal information, please contact us immediately.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or platform notice. Your continued use of the Service after changes take effect constitutes your acceptance of the revised policy.</p>

      <h2>9. Contact</h2>
      <p>Privacy questions or requests may be submitted via our <a href="/legal/contact">Contact Us</a> page.</p>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

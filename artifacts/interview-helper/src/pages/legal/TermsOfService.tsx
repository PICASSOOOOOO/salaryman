import { LegalLayout } from "@/components/LegalLayout";

export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="September 5, 2026">
      <div className="highlight-box">
        <p>These Terms of Service ("Terms") govern your access to and use of SALARYMAN, a platform operated by <strong>PICASSO AI LLC</strong>. By creating an account or using any part of the service, you agree to be bound by these Terms.</p>
      </div>

      <h2>1. About PICASSO AI LLC &amp; SALARYMAN</h2>
      <p>SALARYMAN is a professional intelligence platform developed and operated by <strong>PICASSO AI LLC</strong>. The platform provides AI-powered tools including live listening, screen scanning, ghost typing, AI agents, a phone system (Calll Home), a CRM, cosmetic store, and related services (collectively, the "Service").</p>

      <h2>2. Eligibility</h2>
      <p>You must be at least 13 years of age to use SALARYMAN. If you are under 18, you must have parental or guardian consent. By accessing the Service you represent and warrant that you meet these requirements. Certain features — including purchasing FIAT (ƒ) virtual currency, Passport, and physical merchandise — require you to be at least 18 years old or have verifiable parental consent.</p>

      <h2>3. Account Registration</h2>
      <p>You may access certain features of SALARYMAN by signing in to your account. You are responsible for all activity that occurs under your account. You must not share your credentials or permit others to access your account.</p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
        <li>Interfere with or disrupt the integrity or performance of the Service</li>
        <li>Attempt to gain unauthorized access to any part of the Service or its related systems</li>
        <li>Use the AI tools to generate content that is defamatory, harassing, or fraudulent</li>
        <li>Reverse engineer, decompile, or disassemble any portion of the Service</li>
        <li>Use the phone system (Calll Home) to make unauthorized or illegal calls</li>
        <li>Violate any third-party rights including intellectual property rights</li>
      </ul>

      <h2>5. Virtual Currency &amp; Digital Goods</h2>
      <p>SALARYMAN offers <strong>FIAT (ƒ)</strong>, an in-platform virtual currency, as well as cosmetic items purchasable through the in-game store. FIAT (ƒ) and cosmetic items are digital goods with no real-world monetary value. They are licensed to you, not sold, and cannot be redeemed for cash. All sales of digital goods are final subject to the Refund &amp; Dispute Policy.</p>

      <h2>6. Subscriptions</h2>
      <p>Certain features — including Passport and Calll Home — require a paid subscription. Subscriptions are billed on a recurring basis (monthly or as otherwise specified at purchase). You may cancel at any time in accordance with the Cancellation Policy. PICASSO AI LLC reserves the right to modify subscription pricing with 30 days' notice.</p>

      <h2>7. Physical Merchandise</h2>
      <p>Physical merchandise is fulfilled by the <strong>PABLO CORP Merch Dept</strong>, a division of PICASSO AI LLC. All physical merchandise purchases are subject to the Return Policy and applicable shipping terms.</p>

      <h2>8. Intellectual Property</h2>
      <p>All content, software, trademarks, and trade dress associated with SALARYMAN and PICASSO AI LLC are owned by or licensed to PICASSO AI LLC. You are granted a limited, non-exclusive, non-transferable license to access and use the Service for personal, non-commercial purposes.</p>

      <h2>9. Termination</h2>
      <p>PICASSO AI LLC may suspend or terminate your account at any time for violation of these Terms or for any other reason at our discretion. Upon termination, your right to use the Service immediately ceases. Unused FIAT (ƒ) virtual currency will be forfeited upon account termination due to Terms violations.</p>

      <h2>10. Disclaimer of Warranties</h2>
      <p>The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied. PICASSO AI LLC does not warrant that the Service will be uninterrupted, error-free, or free of viruses or other harmful components.</p>
      <p>The Service may use approximate regional signals such as IP-derived region, browser timezone, language, device settings, or a selected city to route services and display local information. These signals are not precise GPS, proof of residence, emergency location, or a guarantee that any regional service is available. AI output, fictional simulation, financial features, communications, and location-based information are provided for general use and are not legal, financial, medical, employment, emergency, or immigration advice.</p>

      <h2>11. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, PICASSO AI LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the Service, even if advised of the possibility of such damages.</p>

      <h2>12. Governing Law</h2>
      <p>These Terms are governed by the laws of the State of California, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved through binding arbitration administered under the American Arbitration Association rules.</p>

      <h2>13. Changes to Terms</h2>
      <p>PICASSO AI LLC reserves the right to modify these Terms at any time. We will provide notice of material changes via email or a prominent notice on the platform. Continued use of the Service following any changes constitutes your acceptance of the new Terms.</p>

      <h2>14. Contact</h2>
      <p>Questions about these Terms? Please visit our <a href="/legal/contact">Contact Us</a> page.</p>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

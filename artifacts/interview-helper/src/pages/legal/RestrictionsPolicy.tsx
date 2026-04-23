import { LegalLayout } from "@/components/LegalLayout";

export default function RestrictionsPolicy() {
  return (
    <LegalLayout title="Legal & Export Restrictions" lastUpdated="March 20, 2026">
      <div className="highlight-box">
        <p>This page describes age requirements, geographic restrictions, export compliance obligations, and jurisdiction-specific notices applicable to SALARYMAN users, operated by <strong>PICASSO AI LLC</strong>.</p>
      </div>

      <h2>1. Age Requirements</h2>
      <p><strong>Minimum Age — General Use:</strong> You must be at least <strong>13 years of age</strong> to create a SALARYMAN account. By registering, you confirm that you meet this requirement.</p>
      <p><strong>Minimum Age — Purchases &amp; Subscriptions:</strong> You must be at least <strong>18 years of age</strong> (or the age of majority in your jurisdiction, whichever is higher) to make any purchases, including FIAT (ƒ), cosmetic items, Passport, Calll Home, or physical merchandise. Users under 18 must obtain verifiable parental or guardian consent before making any purchase.</p>
      <p><strong>Minimum Age — Phone System (Calll Home):</strong> Use of the Calll Home phone system requires you to be at least 18 years of age.</p>
      <p>PICASSO AI LLC does not knowingly permit minors under 13 to use the Service. If we become aware of an underage user, the account will be suspended pending age verification or parental consent.</p>

      <h2>2. Geographic Restrictions</h2>
      <p>SALARYMAN is intended for users in the United States, Canada, the United Kingdom, the European Union (subject to local laws), and Australia. Users in other jurisdictions may access the Service but do so at their own risk and are responsible for compliance with local laws.</p>
      <p><strong>Restricted Jurisdictions:</strong> The Service — including purchase of FIAT (ƒ), subscriptions, and digital goods — is <strong>not available</strong> to users located in or nationals of countries subject to comprehensive U.S. sanctions, including:</p>
      <ul>
        <li>Cuba</li>
        <li>Iran</li>
        <li>North Korea</li>
        <li>Russia (sanctions-related products only)</li>
        <li>Syria</li>
        <li>The Crimea, Donetsk, and Luhansk regions of Ukraine</li>
        <li>Any other jurisdiction designated by OFAC (U.S. Office of Foreign Assets Control)</li>
      </ul>
      <p>By using the Service, you represent that you are not located in, ordinarily resident in, or an agent or national of any such restricted jurisdiction.</p>

      <h2>3. Export Compliance</h2>
      <p>SALARYMAN's software, AI models, and digital goods are subject to U.S. export control laws and regulations, including the Export Administration Regulations (EAR) administered by the U.S. Department of Commerce Bureau of Industry and Security (BIS).</p>
      <ul>
        <li>You may not export, re-export, or transfer any SALARYMAN software or technology to any person, entity, or destination prohibited under U.S. export laws without prior authorization</li>
        <li>The AI tools and models incorporated in SALARYMAN may be classified as dual-use items under EAR</li>
        <li>You agree to comply with all applicable export control laws in your jurisdiction</li>
        <li>PICASSO AI LLC reserves the right to restrict access to users whose use may violate export control laws</li>
      </ul>

      <h2>4. Jurisdiction-Specific Notices</h2>
      <h3>4.1 European Union / EEA Users</h3>
      <p>If you are located in the EU or EEA, your use of SALARYMAN is additionally subject to applicable EU law, including the General Data Protection Regulation (GDPR). Please review our <a href="/legal/privacy">Privacy Policy</a> for details on your rights under GDPR. Certain AI features may be subject to the EU AI Act; PICASSO AI LLC is committed to complying with applicable EU AI regulations as they come into force.</p>
      <h3>4.2 California Users (CCPA)</h3>
      <p>California residents have additional privacy rights under the California Consumer Privacy Act (CCPA). These rights include the right to know, delete, and opt out of the sale of personal information. PICASSO AI LLC does not sell personal information. For CCPA requests, use our <a href="/legal/contact">Contact Us</a> page with subject "Privacy Request".</p>
      <h3>4.3 United Kingdom Users</h3>
      <p>Users in the United Kingdom are subject to UK data protection law (UK GDPR and the Data Protection Act 2018). Your rights under UK GDPR are substantially similar to EU GDPR rights described above.</p>
      <h3>4.4 Canadian Users</h3>
      <p>Canadian users have rights under the Personal Information Protection and Electronic Documents Act (PIPEDA) and provincial privacy legislation. Contact us to exercise your rights.</p>

      <h2>5. Gambling and Loot Box Compliance</h2>
      <p>SALARYMAN's cosmetic store does not use randomized "loot box" or chance-based mechanics for purchasing cosmetics. All cosmetic items are available for a fixed FIAT (ƒ) price. Promotional events may include chance-based elements; where such elements exist, odds will be disclosed in accordance with applicable law.</p>

      <h2>6. Telecommunications Compliance</h2>
      <p>The Calll Home phone system is subject to applicable telecommunications laws including the Telephone Consumer Protection Act (TCPA) in the United States. You agree not to use Calll Home to make calls that violate the TCPA or equivalent laws in your jurisdiction, including making unsolicited robocalls or calls to numbers on the National Do Not Call Registry.</p>

      <h2>7. Contact</h2>
      <p>For questions regarding legal or export restrictions, please use our <a href="/legal/contact">Contact Us</a> page with subject "Legal Inquiry".</p>
      <p className="text-sm text-zinc-500 mt-2">PICASSO AI LLC · 375 Redondo Ave #287 · Long Beach, CA 90814</p>
    </LegalLayout>
  );
}

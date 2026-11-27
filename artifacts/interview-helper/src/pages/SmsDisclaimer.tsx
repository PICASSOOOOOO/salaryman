import { LegalLayout } from "@/components/LegalLayout";

export default function SmsDisclaimer() {
  return (
    <LegalLayout title="SMS Messaging Program Disclosure" lastUpdated="November 24, 2026">
      <div className="highlight-box">
        <p>
          <strong>SALARYMAN Text Updates</strong> is an optional recurring automated
          informational messaging program operated by Picasso AI, LLC.
        </p>
      </div>

      <h2>Program messages</h2>
      <p>
        Messages may provide updates about SALARYMAN account activity, CALLL HOME, and
        service updates. Message frequency varies based on account activity and settings.
        Message and data rates may apply.
      </p>

      <h2>How to opt in</h2>
      <p>
        Review the <a href="/sms-opt-in">SMS opt-in page</a>, then text START from your
        mobile phone to <strong>+1 888-230-7698</strong>. Sending START is your consent
        to receive recurring automated informational text messages from SALARYMAN.
        Consent is optional and is not a condition of purchase.
      </p>

      <h2>Stop messages or get help</h2>
      <p>
        Reply <strong>STOP</strong> to cancel messages or <strong>HELP</strong> for help.
        For customer support, visit our <a href="/legal/contact">Contact Us</a> page.
        Wireless carriers are not liable for delayed or undelivered messages.
      </p>

      <h2>Privacy</h2>
      <p>
        Text-messaging opt-in data and consent are not shared with third parties. See our{" "}
        <a href="/legal/privacy">Privacy Policy</a> and{" "}
        <a href="/legal/terms">Terms of Service</a> for more information.
      </p>
    </LegalLayout>
  );
}

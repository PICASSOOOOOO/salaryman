import { apiFetch } from '@/lib/api-client';
import { useState } from "react";
import { LegalLayout } from "@/components/LegalLayout";
import { Loader2, Check, AlertCircle, Mail } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${BASE ? BASE + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}

function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await apiFetch(apiUrl("legal/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-start gap-3 px-5 py-4 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm">
        <Check className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Message sent successfully.</p>
          <p className="text-sky-400/70 text-xs">Our support team will review your request and respond to {form.email} within 1–2 business days.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Your Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full Name"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Email Address</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@company.com"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Subject</label>
        <select
          required
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
        >
          <option value="" disabled>Select a topic...</option>
          <option value="Billing & Subscription">Billing &amp; Subscription</option>
          <option value="Refund or Dispute">Refund or Dispute</option>
          <option value="Merchandise Return">Merchandise Return</option>
          <option value="Technical Support">Technical Support</option>
          <option value="Account Issue">Account Issue</option>
          <option value="Privacy Request">Privacy Request</option>
          <option value="Legal Inquiry">Legal Inquiry</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Message</label>
        <textarea
          required
          rows={6}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder="Describe your issue or question in detail..."
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all resize-none"
        />
      </div>
      {status === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium hover:bg-sky-500/25 transition-all disabled:opacity-50"
      >
        {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {status === "loading" ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}

export default function ContactPage() {
  return (
    <LegalLayout title="Contact Us">
      <div className="highlight-box">
        <p>Need help? Our support team is here for you. Choose the channel that works best for your situation.</p>
      </div>

      <h2>How to Reach Us</h2>

      <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-sky-400/60" />
          <span className="text-sm font-semibold text-zinc-300">Contact Form</span>
        </div>
        <p className="text-xs text-zinc-600 mb-2">All correspondence is handled through the contact form below. Select your topic and we'll route your message to the right team.</p>
      </div>

      <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 mb-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Mailing Address</p>
        <p className="text-sm text-zinc-300 font-mono">PICASSO AI LLC</p>
        <p className="text-sm text-zinc-300 font-mono">375 Redondo Ave #287</p>
        <p className="text-sm text-zinc-300 font-mono">Long Beach, CA 90814</p>
      </div>

      <h2>Contact Form</h2>
      <p>Fill out the form below and we'll get back to you within 1–2 business days.</p>

      <ContactForm />

      <h2>Department Routing</h2>
      <p className="text-sm text-zinc-400">Use the subject dropdown in the form above to route your message to the correct department:</p>
      <ul>
        <li><strong>Billing &amp; Subscription</strong> — payment issues, subscription changes, invoices</li>
        <li><strong>Refund or Dispute</strong> — unauthorized charges, refund requests</li>
        <li><strong>Merchandise Return</strong> — PABLO CORP Merch Dept returns and exchanges</li>
        <li><strong>Privacy Request</strong> — data access, deletion, GDPR/CCPA requests</li>
        <li><strong>Legal Inquiry</strong> — legal questions, export compliance</li>
        <li><strong>Technical Support</strong> — platform issues, bugs, account problems</li>
      </ul>

      <h2>Response Times</h2>
      <ul>
        <li>General support inquiries: 1–2 business days</li>
        <li>Billing disputes: 3–5 business days</li>
        <li>Privacy requests: up to 30 days (as required by law)</li>
        <li>Merchandise returns: 2–3 business days to process</li>
      </ul>
    </LegalLayout>
  );
}

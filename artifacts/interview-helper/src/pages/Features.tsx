import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';

const MODULES = [
  {
    id: 'pablo',
    label: 'PABLO AI',
    codename: 'Neural Core v5.0',
    tagline: 'Your personal business intelligence operator — always on, always sharp.',
    description:
      'Pablo is the AI brain at the center of SALARYMAN. Think of him as the seasoned colleague you always wanted — the one who\'s read every business book, remembers every conversation, and never goes home. Ask Pablo anything: strategy questions, market research, how to handle a difficult client, what to say in that awkward email. He adapts to your communication style over time and gets sharper the more you use the platform.',
    features: [
      { name: 'AI Advisor Chat', detail: 'A persistent, context-aware conversation thread. Pablo remembers what you\'ve discussed and builds on it session after session.' },
      { name: 'Voice Mode', detail: 'Go hands-free. Talk to Pablo the way you\'d talk to a trusted advisor — while commuting, between meetings, or when you just need to think out loud.' },
      { name: 'Translator', detail: 'Communicate across language barriers without friction. Instant translation for emails, documents, and live conversations.' },
      { name: 'Website Analyzer', detail: 'Drop any URL and Pablo breaks it down — competitive intelligence, UX critique, SEO signals, brand positioning. Know your competition before they know you.' },
    ],
  },
  {
    id: 'console',
    label: 'CONSOLE',
    codename: 'Cipher-X Suite',
    tagline: 'The unfair advantage in every technical interview and live problem-solving session.',
    description:
      'Console is the professional\'s secret weapon for navigating the modern technical landscape. Whether you\'re preparing for a high-stakes interview or working through a live coding challenge, Console gives you real-time assistance without pulling you out of your flow. It listens, watches, and thinks — so you can focus on performing.',
    features: [
      { name: 'Interview Solver', detail: 'Submit any coding problem and get layered support: a subtle hint to unblock yourself, a full working solution when you need it, a plain-English explanation of the approach, and a complexity analysis so you understand the trade-offs.' },
      { name: 'Live Listen', detail: 'Console monitors your audio environment and surfaces relevant information in real time. Walk into any technical conversation prepared.' },
      { name: 'Screen Scan', detail: 'Point Console at any screen — a shared problem, a slide deck, a diagram — and get an instant breakdown of what it means and how to respond.' },
      { name: 'Ghost Hands', detail: 'Subtle, unobtrusive assistance that helps you navigate live environments without leaving a trace. For professionals who need to stay sharp under pressure.' },
    ],
  },
  {
    id: 'contacts',
    label: 'CONTACTS',
    codename: 'Recall-6 Registry',
    tagline: 'Your professional network, organized the way your brain actually works.',
    description:
      'The old Rolodex is gone. Your LinkedIn is a crowded mess. Contacts is the relationship intelligence layer that serious professionals have always needed. It\'s not just a list of names — it\'s a living record of every connection you\'ve made, every meeting you\'ve had, and every follow-up you\'ve promised.',
    features: [
      { name: 'Contact Registry', detail: 'Store and organize professional contacts with rich context: where you met, what industry they\'re in, what you talked about, and what you need to follow up on.' },
      { name: 'Meeting Logs', detail: 'Every meeting, documented. Add notes, tag attendees, link to action items. When you need to remember the details of a conversation from six months ago, it\'s right there.' },
    ],
  },
  {
    id: 'hiring',
    label: 'HIRING',
    codename: 'Recruit-8 Field Ops',
    tagline: 'Run your entire talent operation from a single terminal.',
    description:
      'Whether you\'re a founder hiring your first ten people or an operator managing a growing team, Hiring gives you the full stack. Post roles, evaluate candidates, conduct structured interviews, manage your staff, and present your company like you mean it — all in one place.',
    features: [
      { name: 'Job Board', detail: 'Post and manage open positions. Control visibility, application requirements, and pipeline stages from a unified dashboard.' },
      { name: 'Applicant Pipeline', detail: 'Track every candidate through every stage. Move them forward, flag them, leave notes, share feedback with your team.' },
      { name: 'Staff Management', detail: 'Manage your existing team alongside your hiring pipeline. Headcount planning, role tracking, and org visibility in one view.' },
      { name: 'Interview Conductor', detail: 'Run structured, repeatable interviews with built-in question sets, scoring rubrics, and note-taking.' },
      { name: 'Presentations', detail: 'Build and deliver polished pitch decks and company presentations directly inside the platform.' },
    ],
  },
  {
    id: 'documents',
    label: 'DOCUMENTS',
    codename: 'Ink-6 Phantom Printer',
    tagline: 'Contracts, invoices, and files — professional-grade paperwork without the paperwork.',
    description:
      'The back-office work that nobody talks about — invoicing clients, drafting contracts, storing critical files — has always been a friction point for serious professionals. Documents eliminates that friction. Everything is templated, versioned, and stored securely.',
    features: [
      { name: 'Invoices', detail: 'Generate clean, professional invoices in seconds. Customize for your brand, send directly from the platform, and track payment status.' },
      { name: 'Contracts', detail: 'Draft and manage agreements using proven templates. Capture signatures, store signed copies, and maintain a full audit trail.' },
      { name: 'File Storage', detail: 'A secure, organized home for every critical business document. Version history, access control, and instant retrieval.' },
    ],
  },
  {
    id: 'calendar',
    label: 'CALENDAR',
    codename: 'Chrono-4 Array',
    tagline: 'Time is your only non-renewable resource. Manage it like one.',
    description:
      'Calendar is built for professionals who treat time with respect. It\'s not a scheduling widget bolted onto the side — it\'s a central part of how SALARYMAN thinks about your workday. See everything, schedule with precision, and never miss a commitment.',
    features: [
      { name: 'Month / Week / Day Views', detail: 'Switch between macro and micro perspectives instantly. Plan the quarter or optimize tomorrow — the view adapts to how you\'re thinking.' },
      { name: 'Appointments', detail: 'Create, edit, and manage appointments with full context: location, attendees, agenda, linked contacts, and follow-up notes.' },
      { name: 'Email Reminders', detail: 'Automated reminders sent directly to your inbox. You\'ll always show up prepared — and you\'ll never ghost a meeting again.' },
    ],
  },
  {
    id: 'dashboard',
    label: 'DASHBOARD',
    codename: 'Command Deck v4.0',
    tagline: 'Your command center. Everything you\'re building, in one view.',
    description:
      'Dashboard is where you orient yourself at the start of every day. It pulls together your projects, your knowledge, and your brand into a single, coherent view of what you\'re working on and why it matters.',
    features: [
      { name: 'Projects', detail: 'Track every active initiative with status, milestones, and linked resources. See what\'s moving and what\'s stalled at a glance.' },
      { name: 'Knowledge Vault', detail: 'A private, searchable repository for everything you\'ve learned. Notes, frameworks, lessons from experience — externalize your thinking so you can build on it.' },
      { name: 'Brand Kit', detail: 'Store and manage your brand assets — logos, color palettes, fonts, voice guidelines — so everything you produce stays consistent and recognizable.' },
    ],
  },
  {
    id: 'studio',
    label: 'STUDIO',
    codename: 'Forge-7 Content Matrix',
    tagline: 'Create like a creative director. Ship like a machine.',
    description:
      'Studio is the content production arm of SALARYMAN. Design graphics, generate images, write compelling copy — all without leaving your workflow.',
    features: [
      { name: 'Graphics Studio', detail: 'A professional design environment for creating visual assets — social posts, presentations, marketing materials, pitch decks.' },
      { name: 'AI Image Generation', detail: 'Describe what you need and Studio renders it. Product mockups, concept illustrations, branded imagery — on demand, on brand.' },
      { name: 'Copywriting Studio', detail: 'Write better, faster. Generate first drafts, refine messaging, adapt tone for different audiences.' },
    ],
  },
  {
    id: 'reports',
    label: 'REPORTS',
    codename: 'Intel-9 Command Brief',
    tagline: 'Turn your business data into decisions.',
    description:
      'Reports is the intelligence layer — the part of SALARYMAN that helps you understand what\'s actually happening in your business. Connect your data sources, build views that matter, and integrate with the tools you already use.',
    features: [
      { name: 'Business Intelligence', detail: 'Dashboards, charts, and reports built around your actual business metrics. Revenue, pipeline, activity, performance — visualized clearly so you can act on what you see.' },
      { name: 'Zapier Integration', detail: 'Connect SALARYMAN to hundreds of external tools through Zapier. Automate workflows, sync data, and build the integrations your business actually needs.' },
    ],
  },
  {
    id: 'salaryman',
    label: 'SALARYMAN',
    codename: 'Social Environment',
    tagline: 'The corner office was always about who you knew. This is where you know them.',
    description:
      'SALARYMAN is an immersive social environment for business professionals — a place that feels like the old days, when deals were made over drinks, mentors were found in the next office, and your network was something you actually built in person.',
    features: [
      { name: 'Professional Social Hub', detail: 'Meet other SALARYMAN users in a shared environment. Find peers in your industry, connect with mentors, and build relationships that extend beyond the platform.' },
      { name: 'Factions', detail: 'Align with communities that share your professional values and interests. Find your tribe, build your standing, and operate within a network that actually means something.' },
    ],
  },
];

function ModuleCard({ module, index }: { module: typeof MODULES[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 + index * 0.03 }}
      className="rounded-xl border border-white/8 bg-white/[0.025] p-6 flex flex-col"
    >
      <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest mb-1.5">
        {module.codename}
      </div>
      <div className="font-['Share_Tech_Mono',monospace] text-sm text-zinc-100 tracking-widest uppercase mb-1.5">
        {module.label}
      </div>
      <p className="text-xs text-zinc-500 italic mb-4 leading-relaxed">
        {module.tagline}
      </p>

      <div className="w-full h-px bg-white/6 mb-4" />

      <p className="text-xs text-zinc-600 leading-relaxed mb-5">
        {module.description}
      </p>

      <div className="w-full h-px bg-white/4 mb-4" />

      <ul className="flex flex-col gap-3 mt-auto">
        {module.features.map((f) => (
          <li key={f.name}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-emerald-500/50 text-[10px]">▸</span>
              <span className="text-[11px] font-mono text-zinc-300 uppercase tracking-wider">
                {f.name}
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed ml-4">
              {f.detail}
            </p>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default function Features() {
  const [, navigate] = useLocation();
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-[#09090b] relative overflow-x-hidden">
      <style>{`
        .features-grid { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 1100px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 680px) { .features-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-emerald-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-12 pb-20">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="flex items-center justify-between mb-10"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="w-px h-5 bg-white/8" />
            <div>
              <h1 className="font-['Share_Tech_Mono',monospace] text-lg text-zinc-100 tracking-widest uppercase">Platform Overview</h1>
              <p className="text-[11px] font-mono text-zinc-600 tracking-widest mt-0.5">{MODULES.length} modules · full feature breakdown</p>
            </div>
          </div>

          <motion.button
            onClick={login}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-[#09090b] font-semibold text-sm hover:bg-emerald-400 transition-colors"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        {/* Module grid */}
        <div className="grid features-grid gap-4">
          {MODULES.map((module, index) => (
            <ModuleCard key={module.id} module={module} index={index} />
          ))}
        </div>

        {/* CTA footer */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-4 text-center"
        >
          <button
            onClick={login}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 text-[#09090b] font-semibold text-sm hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/15"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Back to home
          </button>
        </motion.div>
      </div>
    </div>
  );
}

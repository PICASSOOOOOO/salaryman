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
      'The old Rolodex is gone. Your LinkedIn is a crowded mess. Contacts is the relationship intelligence layer that serious professionals have always needed. It\'s not just a list of names — it\'s a living record of every connection you\'ve made, every meeting you\'ve had, and every follow-up you\'ve promised. The platform you build your career on should remember everything so you don\'t have to.',
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
      'Whether you\'re a founder hiring your first ten people or an operator managing a growing team, Hiring gives you the full stack. Post roles, evaluate candidates, conduct structured interviews, manage your staff, and present your company like you mean it — all in one place. The old days of juggling spreadsheets and inboxes are over.',
    features: [
      { name: 'Job Board', detail: 'Post and manage open positions. Control visibility, application requirements, and pipeline stages from a unified dashboard.' },
      { name: 'Applicant Pipeline', detail: 'Track every candidate through every stage. Move them forward, flag them, leave notes, share feedback with your team.' },
      { name: 'Staff Management', detail: 'Manage your existing team alongside your hiring pipeline. Headcount planning, role tracking, and org visibility in one view.' },
      { name: 'Interview Conductor', detail: 'Run structured, repeatable interviews with built-in question sets, scoring rubrics, and note-taking — so every candidate gets a fair and thorough evaluation.' },
      { name: 'Presentations', detail: 'Build and deliver polished pitch decks and company presentations directly inside the platform. Close candidates the same way you close clients.' },
    ],
  },
  {
    id: 'documents',
    label: 'DOCUMENTS',
    codename: 'Ink-6 Phantom Printer',
    tagline: 'Contracts, invoices, and files — professional-grade paperwork without the paperwork.',
    description:
      'The back-office work that nobody talks about — invoicing clients, drafting contracts, storing critical files — has always been a friction point for serious professionals. Documents eliminates that friction. Everything is templated, versioned, and stored securely. Send an invoice in under two minutes. Have a contract ready before the other side blinks.',
    features: [
      { name: 'Invoices', detail: 'Generate clean, professional invoices in seconds. Customize for your brand, send directly from the platform, and track payment status.' },
      { name: 'Contracts', detail: 'Draft and manage agreements using proven templates. Capture signatures, store signed copies, and maintain a full audit trail.' },
      { name: 'File Storage', detail: 'A secure, organized home for every critical business document. Version history, access control, and instant retrieval — no more hunting through email threads.' },
    ],
  },
  {
    id: 'calendar',
    label: 'CALENDAR',
    codename: 'Chrono-4 Array',
    tagline: 'Time is your only non-renewable resource. Manage it like one.',
    description:
      'Calendar is built for professionals who treat time with respect. It\'s not a scheduling widget bolted onto the side — it\'s a central part of how SALARYMAN thinks about your workday. See everything, schedule with precision, and never miss a commitment. Integrated reminders mean your calendar reaches out to you, not the other way around.',
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
      'Dashboard is where you orient yourself at the start of every day. It pulls together your projects, your knowledge, and your brand into a single, coherent view of what you\'re working on and why it matters. For professionals who build things — companies, careers, reputations — Dashboard is the home base.',
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
      'Studio is the content production arm of SALARYMAN. In the old days you needed an agency, a freelancer, or a lot of patience to produce professional-grade visuals and copy. Studio puts that capability directly in your hands. Design graphics, generate images, write compelling copy — all without leaving your workflow.',
    features: [
      { name: 'Graphics Studio', detail: 'A professional design environment for creating visual assets — social posts, presentations, marketing materials, pitch decks. Polished output, no design background required.' },
      { name: 'AI Image Generation', detail: 'Describe what you need and Studio renders it. Product mockups, concept illustrations, branded imagery — on demand, on brand.' },
      { name: 'Copywriting Studio', detail: 'Write better, faster. Generate first drafts, refine messaging, adapt tone for different audiences. The words that represent your business deserve to be sharp.' },
    ],
  },
  {
    id: 'reports',
    label: 'REPORTS',
    codename: 'Intel-9 Command Brief',
    tagline: 'Turn your business data into decisions.',
    description:
      'Reports is the intelligence layer — the part of SALARYMAN that helps you understand what\'s actually happening in your business. Connect your data sources, build views that matter, and integrate with the tools you already use. In the old days you needed a data analyst to pull these insights. Now you pull them yourself.',
    features: [
      { name: 'Business Intelligence', detail: 'Dashboards, charts, and reports built around your actual business metrics. Revenue, pipeline, activity, performance — visualized clearly so you can act on what you see.' },
      { name: 'Zapier Integration', detail: 'Connect SALARYMAN to hundreds of external tools through Zapier. Automate workflows, sync data, and build the integrations your business actually needs.' },
    ],
  },
  {
    id: 'salaryman',
    label: 'SALARYMAN WORLD',
    codename: 'Social Environment',
    tagline: 'The corner office was always about who you knew. This is where you know them.',
    description:
      'SALARYMAN World is an immersive social environment for business professionals — a place that feels like the old days, when deals were made over drinks, mentors were found in the next office, and your network was something you actually built in person. It\'s a digital space with the warmth and texture of a world you remember: the trading floors, the late nights, the handshakes that meant something. Here, you meet peers, build your reputation, and find your people.',
    features: [
      { name: 'Professional Social Hub', detail: 'Meet other SALARYMAN users in a shared environment. Find peers in your industry, connect with mentors, and build relationships that extend beyond the platform.' },
      { name: 'Factions', detail: 'Align with communities that share your professional values and interests. Find your tribe, build your standing, and operate within a network that actually means something.' },
      { name: 'Economy', detail: 'A functional in-world economy that reflects real professional dynamics. Resources, reputation, and relationships have value here — the same way they do in the real world.' },
    ],
  },
];

function ModuleCard({ module, index }: { module: typeof MODULES[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.04 }}
      style={{
        border: '1px solid rgba(0,255,65,0.18)',
        background: 'rgba(0,255,65,0.02)',
        padding: '1.75rem 1.5rem',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: '0.55rem',
          letterSpacing: '0.22em',
          color: 'rgba(0,255,65,0.3)',
          marginBottom: '0.25rem',
          textTransform: 'uppercase',
        }}
      >
        {module.codename}
      </div>
      <div
        style={{
          fontSize: '1rem',
          letterSpacing: '0.16em',
          color: '#00ff41',
          fontWeight: 'bold',
          marginBottom: '0.35rem',
          textTransform: 'uppercase',
          textShadow: '0 0 12px rgba(0,255,65,0.2)',
        }}
      >
        {module.label}
      </div>
      <div
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.06em',
          color: 'rgba(0,255,65,0.55)',
          marginBottom: '1rem',
          fontStyle: 'italic',
        }}
      >
        {module.tagline}
      </div>
      <div
        style={{
          width: '100%',
          height: '1px',
          background: 'rgba(0,255,65,0.1)',
          marginBottom: '1rem',
        }}
      />
      <p
        style={{
          fontSize: '0.65rem',
          color: 'rgba(0,255,65,0.45)',
          letterSpacing: '0.04em',
          lineHeight: 1.75,
          marginBottom: '1.25rem',
        }}
      >
        {module.description}
      </p>
      <div
        style={{
          width: '100%',
          height: '1px',
          background: 'rgba(0,255,65,0.07)',
          marginBottom: '0.9rem',
        }}
      />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {module.features.map((f) => (
          <li key={f.name}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.4rem',
                marginBottom: '0.2rem',
              }}
            >
              <span style={{ color: 'rgba(0,255,65,0.3)', fontSize: '0.5rem' }}>▸</span>
              <span
                style={{
                  fontSize: '0.63rem',
                  color: 'rgba(0,255,65,0.75)',
                  letterSpacing: '0.08em',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}
              >
                {f.name}
              </span>
            </div>
            <p
              style={{
                fontSize: '0.6rem',
                color: 'rgba(0,255,65,0.38)',
                letterSpacing: '0.04em',
                lineHeight: 1.65,
                marginLeft: '0.9rem',
                margin: '0 0 0 0.9rem',
              }}
            >
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
    <div
      style={{
        minHeight: '100vh',
        background: '#030803',
        fontFamily: "'Share Tech Mono', monospace",
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        .features-grid { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 1100px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 680px) { .features-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 50,
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '3rem 1.5rem 5rem',
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '3.5rem',
          }}
        >
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: '1px solid rgba(0,255,65,0.2)',
              color: 'rgba(0,255,65,0.5)',
              cursor: 'pointer',
              padding: '0.5rem 0.85rem',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <ArrowLeft size={12} /> BACK
          </button>

          <motion.button
            onClick={login}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.14em',
              color: '#030803',
              background: '#00ff41',
              border: 'none',
              padding: '0.6rem 1.5rem',
              cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace",
              boxShadow: '0 0 20px rgba(0,255,65,0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            GET STARTED FREE <ChevronRight size={13} />
          </motion.button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          style={{ marginBottom: '0.5rem' }}
        >
          <div
            style={{
              fontSize: '0.55rem',
              letterSpacing: '0.22em',
              color: 'rgba(0,255,65,0.3)',
              marginBottom: '0.5rem',
            }}
          >
            SYSTEM MANIFEST
          </div>
          <h1
            style={{
              fontSize: 'clamp(1.6rem, 4vw, 2.5rem)',
              letterSpacing: '0.12em',
              color: '#00ff41',
              textShadow: '0 0 28px rgba(0,255,65,0.35)',
              marginBottom: '0.6rem',
              lineHeight: 1.1,
            }}
          >
            EVERY APP IN ONE
          </h1>
          <p
            style={{
              fontSize: '0.72rem',
              color: 'rgba(0,255,65,0.45)',
              letterSpacing: '0.06em',
              maxWidth: '44rem',
              lineHeight: 1.75,
              marginBottom: '2.5rem',
            }}
          >
            SALARYMAN is the platform built for professionals who remember when work meant something — when your
            tools were sharp, your network was real, and getting things done didn't require ten different subscriptions.
            Everything you need to run your professional life, in one place.
          </p>
        </motion.div>

        <div
          className="features-grid"
          style={{
            display: 'grid',
            gap: '1rem',
          }}
        >
          {MODULES.map((mod, i) => (
            <ModuleCard key={mod.id} module={mod} index={i} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          style={{
            marginTop: '4rem',
            borderTop: '1px solid rgba(0,255,65,0.1)',
            paddingTop: '2.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '0.55rem',
              letterSpacing: '0.2em',
              color: 'rgba(0,255,65,0.3)',
              marginBottom: '0.75rem',
            }}
          >
            READY TO BEGIN?
          </div>
          <h2
            style={{
              fontSize: '1.1rem',
              letterSpacing: '0.1em',
              color: '#00ff41',
              marginBottom: '0.6rem',
              textShadow: '0 0 16px rgba(0,255,65,0.25)',
            }}
          >
            ATTENTION IS ALL YOU NEED
          </h2>
          <p
            style={{
              fontSize: '0.62rem',
              color: 'rgba(0,255,65,0.35)',
              letterSpacing: '0.06em',
              marginBottom: '1.75rem',
            }}
          >
            Join the professionals who still do things the right way.
          </p>
          <motion.button
            onClick={login}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              fontSize: '0.8rem',
              letterSpacing: '0.14em',
              color: '#030803',
              background: '#00ff41',
              border: 'none',
              padding: '0.8rem 2.5rem',
              cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace",
              boxShadow: '0 0 28px rgba(0,255,65,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            GET STARTED FREE <ChevronRight size={14} />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

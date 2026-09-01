import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ArrowRight, X, Check, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

const ONBOARDING_KEY = 'salaryman_onboarding_done';

const HELP_OPTIONS = [
  { id: 'interviews', label: 'RUN INTERVIEWS' },
  { id: 'presentations', label: 'BUILD PRESENTATIONS' },
  { id: 'meetings', label: 'PREPARE FOR MEETINGS' },
  { id: 'research', label: 'RESEARCH & RECON' },
  { id: 'writing', label: 'WRITE CONTENT' },
  { id: 'sales', label: 'CLOSE DEALS' },
  { id: 'strategy', label: 'PLAN & STRATEGIZE' },
  { id: 'creative', label: 'CREATIVE PROJECTS' },
];

interface OnboardingModalProps {
  onComplete: (memory: string) => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { user, isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [helpWith, setHelpWith] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const dismissed = localStorage.getItem(ONBOARDING_KEY);
    if (dismissed) return;

    apiFetch('/api/tools/memory')
      .then(r => r.json())
      .then(data => {
        if (!data.memory || data.memory.trim() === '') {
          setName(user?.firstName ?? '');
          setVisible(true);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, user]);

  const toggleHelp = (id: string) => {
    setHelpWith(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  };

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, 'skipped');
    setVisible(false);
  };

  const handleSubmit = async () => {
    setSaving(true);

    const helpLabels = HELP_OPTIONS
      .filter(h => helpWith.includes(h.id))
      .map(h => h.label)
      .join(', ');

    const memory = [
      name ? `Name: ${name}` : '',
      role ? `Role: ${role}` : '',
      company ? `Company: ${company}` : '',
      industry ? `Industry: ${industry}` : '',
      helpLabels ? `Needs help with: ${helpLabels}` : '',
    ].filter(Boolean).join('\n');

    try {
      await apiFetch('/api/tools/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory }),
      });
      localStorage.setItem(ONBOARDING_KEY, 'done');
      setDone(true);
      setTimeout(() => {
        setVisible(false);
        onComplete(memory);
      }, 1800);
    } catch {
      setSaving(false);
    }
  };

  const canContinue = [
    step === 0 ? name.trim().length > 0 : true,
    true,
    step === 2 ? helpWith.length > 0 : true,
  ][step];

  const STEPS = [
    {
      title: "WHO ARE YOU?",
      sub: "Just the basics — so Pablo knows who he's talking to.",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">YOUR NAME</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What should we call you?"
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">YOUR ROLE</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. CEO, Sales Lead, Freelancer..."
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
        </div>
      ),
    },
    {
      title: "WHAT'S YOUR BUSINESS?",
      sub: "Helps us tailor everything to your world. Skip if personal use.",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">COMPANY NAME</label>
            <input
              autoFocus
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Your company or team"
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">INDUSTRY</label>
            <input
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="e.g. Tech, Healthcare, Finance..."
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
        </div>
      ),
    },
    {
      title: "WHAT DO YOU NEED HELP WITH?",
      sub: "Pick as many as you want — you can always change this later.",
      content: (
        <div className="grid grid-cols-2 gap-2">
          {HELP_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => toggleHelp(opt.id)}
              className={`px-4 py-3 rounded-xl text-xs font-bold text-left transition-all border tracking-wider
                ${helpWith.includes(opt.id)
                  ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                  : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                }`}
            >
              {helpWith.includes(opt.id) && <Check className="w-3 h-3 inline mr-1.5 text-sky-400" />}
              {opt.label}
            </button>
          ))}
        </div>
      ),
    },
  ];

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {done ? (
              <div className="flex flex-col items-center justify-center gap-4 p-10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 14 }}
                  className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center"
                >
                  <Sparkles className="w-8 h-8 text-sky-400" />
                </motion.div>
                <div className="text-center">
                  <p className="text-base font-bold text-foreground">ALL SET{name ? `, ${name.toUpperCase()}` : ''}!</p>
                  <p className="text-sm text-muted-foreground mt-1">Pablo knows enough to get started. Let's go.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">PABLO</p>
                      <p className="text-[10px] text-muted-foreground">STEP {step + 1} OF {STEPS.length}</p>
                    </div>
                  </div>
                  <button
                    onClick={dismiss}
                    className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors"
                    title="Skip for now"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-6 pb-4">
                  <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-sky-500/60 rounded-full"
                      animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                      transition={{ ease: 'easeInOut', duration: 0.35 }}
                    />
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="text-base font-bold text-foreground mb-1">{currentStep.title}</p>
                      <p className="text-xs text-muted-foreground mb-5">{currentStep.sub}</p>
                      {currentStep.content}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-between px-6 pb-6">
                  <button
                    onClick={dismiss}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    SKIP FOR NOW
                  </button>
                  <div className="flex items-center gap-2">
                    {step > 0 && (
                      <button
                        onClick={() => setStep(s => s - 1 as 0 | 1 | 2)}
                        className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        BACK
                      </button>
                    )}
                    <button
                      onClick={isLast ? handleSubmit : () => setStep(s => (s + 1) as 0 | 1 | 2)}
                      disabled={!canContinue || saving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <span className="animate-pulse">SAVING...</span>
                      ) : isLast ? (
                        <>DONE <Check className="w-3.5 h-3.5" /></>
                      ) : (
                        <>NEXT <ArrowRight className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ArrowRight, X, Check, Sparkles } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';

const ONBOARDING_KEY = 'frontman_onboarding_done';

const USE_CASES = [
  { id: 'interviewer', label: 'Interviewing candidates' },
  { id: 'interviewee', label: 'Being interviewed' },
  { id: 'presentations', label: 'Running presentations' },
  { id: 'meetings', label: 'Managing meetings' },
  { id: 'research', label: 'Researching / recon' },
  { id: 'networking', label: 'Networking & contacts' },
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
  const [useCases, setUseCases] = useState<string[]>([]);
  const [extra, setExtra] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    const dismissed = localStorage.getItem(ONBOARDING_KEY);
    if (dismissed) return;

    fetch('/api/tools/memory')
      .then(r => r.json())
      .then(data => {
        if (!data.memory || data.memory.trim() === '') {
          setName(user?.firstName ?? '');
          setVisible(true);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, user]);

  const toggleUseCase = (id: string) => {
    setUseCases(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, 'skipped');
    setVisible(false);
  };

  const handleSubmit = async () => {
    setSaving(true);

    const useCaseLabels = USE_CASES
      .filter(u => useCases.includes(u.id))
      .map(u => u.label)
      .join(', ');

    const memory = [
      name ? `Name: ${name}` : '',
      role ? `Role: ${role}` : '',
      company ? `Company: ${company}` : '',
      industry ? `Industry: ${industry}` : '',
      useCaseLabels ? `Main use cases: ${useCaseLabels}` : '',
      extra ? `Additional context: ${extra}` : '',
    ].filter(Boolean).join('\n');

    try {
      await fetch('/api/tools/memory', {
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
    step === 0 ? (name.trim() || role.trim()) : true,
    step === 1 ? (company.trim() || industry.trim()) : true,
    step === 2 ? useCases.length > 0 : true,
    step === 3 ? true : true,
  ][step];

  const STEPS = [
    {
      question: `Hey${name ? `, ${name}` : ''}! I'm ARIA — I run Frontman.`,
      sub: "Let me get to know you so I can actually be useful from the start.",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What do people call you?"
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your role or title</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. CEO, Sales Director, Software Engineer..."
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>
      ),
    },
    {
      question: "Nice. Tell me about your work.",
      sub: "I'll use this to give you more relevant help.",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Company or team name</label>
            <input
              autoFocus
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Where do you work?"
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Industry or space</label>
            <input
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="e.g. Tech startup, Healthcare, Finance, Legal..."
              className="bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>
      ),
    },
    {
      question: "What will you mainly use Frontman for?",
      sub: "Pick everything that applies — I'll adapt to your needs.",
      content: (
        <div className="grid grid-cols-2 gap-2">
          {USE_CASES.map(uc => (
            <button
              key={uc.id}
              onClick={() => toggleUseCase(uc.id)}
              className={`px-4 py-3 rounded-xl text-sm font-medium text-left transition-all border
                ${useCases.includes(uc.id)
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                }`}
            >
              {useCases.includes(uc.id) && <Check className="w-3 h-3 inline mr-1.5 text-emerald-400" />}
              {uc.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      question: "Anything else I should know?",
      sub: "Communication style, goals, priorities — totally optional but helps a lot.",
      content: (
        <textarea
          autoFocus
          value={extra}
          onChange={e => setExtra(e.target.value)}
          placeholder="e.g. 'I'm a tech CEO, prefer concise answers, mostly interview engineers and give board presentations...'"
          rows={5}
          className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50 transition-colors resize-none"
        />
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
                  className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
                >
                  <Sparkles className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <div className="text-center">
                  <p className="text-base font-bold text-foreground">All set{name ? `, ${name}` : ''}!</p>
                  <p className="text-sm text-muted-foreground mt-1">I know enough to get started. Let's go.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">ARIA</p>
                      <p className="text-[10px] text-muted-foreground">Quick intro — {STEPS.length - step} step{STEPS.length - step !== 1 ? 's' : ''} left</p>
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

                {/* Progress bar */}
                <div className="px-6 pb-4">
                  <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500/60 rounded-full"
                      animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                      transition={{ ease: 'easeInOut', duration: 0.35 }}
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 pb-6">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="text-base font-bold text-foreground mb-1">{currentStep.question}</p>
                      <p className="text-xs text-muted-foreground mb-5">{currentStep.sub}</p>
                      {currentStep.content}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 pb-6">
                  <button
                    onClick={dismiss}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    Skip for now
                  </button>
                  <div className="flex items-center gap-2">
                    {step > 0 && (
                      <button
                        onClick={() => setStep(s => s - 1)}
                        className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        Back
                      </button>
                    )}
                    <button
                      onClick={isLast ? handleSubmit : () => setStep(s => s + 1)}
                      disabled={!canContinue || saving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <span className="animate-pulse">Saving...</span>
                      ) : isLast ? (
                        <>Done <Check className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Next <ArrowRight className="w-3.5 h-3.5" /></>
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

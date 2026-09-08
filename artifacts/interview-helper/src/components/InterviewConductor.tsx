import { motion, AnimatePresence } from 'framer-motion';
import { Mic2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFeatureState } from '@/hooks/use-feature-state';

export function InterviewConductor() {
  const { interviewConductor: ic } = useFeatureState();

  return (
    <div className="flex gap-6 flex-1">
      <div className="w-80 shrink-0 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-foreground">Conduct an Interview</h3>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Candidate / Subject *</label>
            <input value={ic.subject} onChange={e => ic.setSubject(e.target.value)}
              placeholder="e.g. Full-Stack Engineer with 3 years React"
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Role / Position (optional)</label>
            <input value={ic.role} onChange={e => ic.setRole(e.target.value)}
              placeholder="e.g. Head of Claims, Lead Developer"
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Style</label>
            <div className="flex gap-2">
              {(['technical', 'casual', 'mixed'] as const).map(s => (
                <button key={s} onClick={() => ic.setStyle(s)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-colors
                    ${ic.style === s ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Questions</label>
            <div className="flex gap-2">
              {[4, 6, 8].map(n => (
                <button key={n} onClick={() => ic.setQuestionCount(n)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                    ${ic.questionCount === n ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button onClick={ic.generate} disabled={!ic.subject.trim() || ic.conducting}
            className="w-full py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-bold hover:bg-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {ic.conducting ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : '✦ Generate Questions'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ic.questions.length === 0 && !ic.conducting && (
          <div className="bg-card border border-border rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center gap-3 text-center p-6">
            <Mic2 className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-muted-foreground text-sm">Fill in the details and generate your question list</p>
          </div>
        )}

        {ic.conducting && (
          <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Crafting questions...
          </div>
        )}

        {ic.questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">{ic.questions.length} questions — tap to expand coaching notes</p>
              <div className="flex gap-2">
                <button onClick={() => ic.setCurrentQ(Math.max(0, ic.currentQ - 1))} disabled={ic.currentQ === 0}
                  className="px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex items-center gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-muted-foreground">{ic.currentQ + 1} / {ic.questions.length}</span>
                <button onClick={() => ic.setCurrentQ(Math.min(ic.questions.length - 1, ic.currentQ + 1))} disabled={ic.currentQ === ic.questions.length - 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex items-center gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={ic.currentQ} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-rose-500/10 border-2 border-rose-500/40 rounded-2xl p-5 mb-4">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-2">Ask this now</p>
                <p className="text-lg font-semibold text-foreground leading-snug mb-4">{ic.questions[ic.currentQ]?.question}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/40 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Why ask it</p>
                    <p className="text-xs text-muted-foreground">{ic.questions[ic.currentQ]?.why}</p>
                  </div>
                  <div className="bg-background/40 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Good answer sounds like</p>
                    <p className="text-xs text-muted-foreground">{ic.questions[ic.currentQ]?.listen_for}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {ic.questions.map((q, i) => (
              <div key={i}
                className={`bg-card border rounded-xl overflow-hidden transition-colors cursor-pointer
                  ${i === ic.currentQ ? 'border-rose-500/30' : 'border-border hover:border-border/80'}`}
                onClick={() => ic.setCurrentQ(i)}>
                <div className="flex items-start gap-3 p-4">
                  <span className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5
                    ${i === ic.currentQ ? 'bg-rose-500/30 text-rose-300' : 'bg-muted/30 text-muted-foreground'}`}>
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground flex-1 leading-snug">{q.question}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

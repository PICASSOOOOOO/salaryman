import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Presentation, ChevronLeft, ChevronRight, Maximize2, Minimize2, Loader2, X, MessageSquare } from 'lucide-react';
import { useFeatureState } from '@/hooks/use-feature-state';
import { useNavBarVisibility } from '@/hooks/use-navbar-visibility';
import { PABLO_PRODUCTS } from '@/lib/product-names';

export function PresentationTool() {
  const { presentation: p } = useFeatureState();
  const { setHideNavBar } = useNavBarVisibility();
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    setHideNavBar(fullScreen);
    return () => setHideNavBar(false);
  }, [fullScreen, setHideNavBar]);

  const slide = p.presentation?.slides[p.currentSlide];
  const totalSlides = p.presentation?.slides.length ?? 0;

  return (
    <>
      {!fullScreen && (
        <div className="flex gap-6 flex-1">
          {!p.presentation && (
            <div className="w-80 shrink-0 space-y-4">
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-sm text-foreground">Build a Presentation</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Topic *</label>
                  <input value={p.topic} onChange={e => p.setTopic(e.target.value)}
                    placeholder="e.g. Why we should switch to microservices"
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Extra context (optional)</label>
                  <textarea value={p.context} onChange={e => p.setContext(e.target.value)}
                    placeholder="Audience, goal, key points to include..."
                    rows={3}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Number of slides</label>
                  <div className="flex gap-2">
                    {[3, 5, 7].map(n => (
                      <button key={n} onClick={() => p.setSlideCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${p.slideCount === n ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={p.generate} disabled={!p.topic.trim() || p.generating}
                  className="w-full py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-bold hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {p.generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : '✦ Generate Slides'}
                </button>
              </div>
              <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-indigo-300">How to present on Zoom / Meet</p>
                <p>1. Click Generate → review your slides</p>
                <p>2. Click ⛶ Fullscreen to enter presenter view</p>
                <p>3. In Zoom/Meet, share this browser window/tab</p>
                <p>4. Others see your slides; you see the script</p>
              </div>
            </div>
          )}

          {p.presentation && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{p.presentation.title}</h3>
                  <p className="text-xs text-muted-foreground">{totalSlides} slides</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => p.setShowScript(!p.showScript)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> {p.showScript ? 'Hide Script' : 'Show Script'}
                  </button>
                  <button onClick={() => setFullScreen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
                  </button>
                  <button onClick={p.clear}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                {p.presentation.slides.map((s, i) => (
                  <button key={i} onClick={() => p.setCurrentSlide(i)}
                    className={`shrink-0 w-36 h-20 rounded-xl border p-2 text-left transition-colors
                      ${p.currentSlide === i ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-border bg-muted/20 hover:bg-muted/40'}`}>
                    <p className="text-[9px] text-muted-foreground font-mono mb-1">{i + 1}</p>
                    <p className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2">{s.title}</p>
                  </button>
                ))}
              </div>

              {slide && (
                <div className="bg-card border border-border rounded-2xl p-6 flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground font-mono mb-1">SLIDE {p.currentSlide + 1} / {totalSlides}</p>
                      <h4 className="text-xl font-bold text-foreground">{slide.title}</h4>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => p.setCurrentSlide(Math.max(0, p.currentSlide - 1))} disabled={p.currentSlide === 0}
                        className="p-2 rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => p.setCurrentSlide(Math.min(totalSlides - 1, p.currentSlide + 1))} disabled={p.currentSlide === totalSlides - 1}
                        className="p-2 rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-5">
                    {slide.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>

                  {p.showScript && (
                    <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-2">{PABLO_PRODUCTS.SAY_THIS.name}</p>
                      <p className="text-sm text-sky-200 leading-relaxed">{slide.say_this}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {fullScreen && slide && (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col p-12">
          <button onClick={() => setFullScreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors z-10">
            <Minimize2 className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
            <p className="text-white/30 text-sm font-mono mb-4">{p.presentation?.title} · {p.currentSlide + 1} / {totalSlides}</p>
            <AnimatePresence mode="wait">
              <motion.div key={p.currentSlide} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                <h1 className="text-5xl font-bold text-white mb-10 leading-tight">{slide.title}</h1>
                <ul className="space-y-4">
                  {slide.bullets.map((b, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-4 text-2xl text-white/85">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 mt-3 shrink-0" />
                      {b}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t border-white/10 pt-5 mt-5">
            <p className="text-[11px] text-white/30 uppercase tracking-widest mb-2">Say this</p>
            <p className="text-white/70 text-lg leading-relaxed">{slide.say_this}</p>
          </div>

          <div className="flex items-center justify-center gap-6 mt-6">
            <button onClick={() => p.setCurrentSlide(Math.max(0, p.currentSlide - 1))} disabled={p.currentSlide === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors font-semibold">
              <ChevronLeft className="w-5 h-5" /> Prev
            </button>
            <div className="flex gap-1.5">
              {p.presentation?.slides.map((_, i) => (
                <button key={i} onClick={() => p.setCurrentSlide(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === p.currentSlide ? 'bg-indigo-400' : 'bg-white/20 hover:bg-white/40'}`} />
              ))}
            </div>
            <button onClick={() => p.setCurrentSlide(Math.min(totalSlides - 1, p.currentSlide + 1))} disabled={p.currentSlide === totalSlides - 1}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors font-semibold">
              Next <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

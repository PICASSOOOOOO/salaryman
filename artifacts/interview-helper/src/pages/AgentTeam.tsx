import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, Brain, Activity, Cpu, Shield, AlertCircle } from 'lucide-react';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';

interface AgentDefinition {
  id: string;
  codeName: string;
  plainName: string;
  specialty: string;
  plainSpecialty: string;
  description: string;
  plainDescription: string;
  provider: 'claude' | 'gpt' | 'openclaw';
  model: string;
  status: 'online' | 'offline' | 'unknown';
  requestTypes: string[];
}

function useAgentTeam() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/ai-agents/team');
        if (!res.ok) throw new Error('Failed to load agent team');
        const data = await res.json();
        setAgents(data.agents ?? []);
      } catch (e) {
        setError('Could not reach the agent network. Try again shortly.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { agents, loading, error };
}

function StatusDot({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  if (status === 'online') {
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-sky-400 text-xs font-bold" style={{ fontFamily: "var(--font-sans)" }}>ONLINE</span>
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-400" />
        <span className="text-red-400 text-xs font-bold" style={{ fontFamily: "var(--font-sans)" }}>OFFLINE</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-yellow-400/60" />
      <span className="text-yellow-400/60 text-xs font-bold" style={{ fontFamily: "var(--font-sans)" }}>CHECKING</span>
    </span>
  );
}

export default function AgentTeam({ embedded = false }: { embedded?: boolean } = {}) {
  const { agents, loading, error } = useAgentTeam();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const { isAuthenticated } = useAuth();

  if (!isAuthenticated && !embedded) {
    return <SignInPage context={boomerMode ? 'Sign in to access your AI agents.' : 'Salaryman credentials required. Agent team access locked.'} />;
  }

  return (
    <div className={embedded ? "rounded-xl border border-sky-500/20 bg-card/40 relative overflow-hidden" : "min-h-screen flex flex-col bg-background relative overflow-hidden"}>
      {!embedded && <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />}
      {!embedded && <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />}

      <main className={embedded ? "p-4 md:p-5 relative z-10" : "flex-1 p-4 md:p-6 relative z-10"}>
        <div className={embedded ? "max-w-none" : "max-w-3xl mx-auto"}>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground" style={{ fontFamily: boomerMode ? undefined : "var(--font-sans)", letterSpacing: boomerMode ? undefined : '0.1em', fontSize: boomerMode ? undefined : '1.4rem' }}>
                  {boomerMode ? 'Agent Network Status' : 'AGENT NETWORK STATUS'}
                </h1>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: boomerMode ? undefined : "var(--font-sans)" }}>
                  {boomerMode ? 'The specialist AIs working behind the scenes' : 'MULTI-AGENT ORCHESTRATION LAYER · ACTIVE SPECIALISTS'}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {boomerMode
                ? "PABLO automatically picks the best AI specialist for each question you ask. You don't have to do anything — it routes your request to whoever handles it best."
                : "The PABLO neural core dynamically routes each request to the optimal specialist agent. No manual selection required — the system classifies your intent and dispatches to the highest-capability unit available."
              }
            </p>
          </div>

          {/* How it works panel */}
          <div className="mb-6 rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>
                {boomerMode ? 'HOW IT WORKS' : 'ROUTING LOGIC'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>
                <span>{boomerMode ? 'You send a message to PABLO' : 'Request classified by intent type'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>
                <span>{boomerMode ? 'PABLO picks the right specialist automatically' : 'Optimal agent selected, health-checked'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>
                <span>{boomerMode ? 'If one AI is down, another takes over automatically' : 'Fallback chain activates if primary is unreachable'}</span>
              </div>
            </div>
          </div>

          {/* Agents */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Bot className="w-6 h-6 animate-pulse mr-3" />
              <span className="text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                {boomerMode ? 'Checking agent status...' : 'PINGING AGENT NETWORK...'}
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {agents.map((agent, i) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`rounded-2xl border bg-card p-5 ${
                      agent.provider === 'claude'
                        ? 'border-orange-500/20'
                        : agent.provider === 'openclaw'
                        ? 'border-cyan-500/20'
                        : 'border-sky-500/20'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${
                        agent.provider === 'claude'
                          ? 'bg-orange-500/10 border-orange-500/30'
                          : agent.provider === 'openclaw'
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : 'bg-sky-500/10 border-sky-500/30'
                      }`}>
                        {agent.provider === 'claude'
                          ? <Brain className="w-6 h-6 text-orange-400" />
                          : agent.provider === 'openclaw'
                          ? <Cpu className="w-6 h-6 text-cyan-400" />
                          : <Zap className="w-6 h-6 text-sky-400" />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h2 className={`font-bold text-foreground ${boomerMode ? 'text-base' : 'text-lg'}`}
                            style={boomerMode ? undefined : { fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>
                            {boomerMode ? agent.plainName : agent.codeName}
                          </h2>
                          <StatusDot status={agent.status} />
                        </div>

                        <p className="text-xs text-muted-foreground mb-2" style={{ fontFamily: "var(--font-sans)" }}>
                          {boomerMode ? agent.plainSpecialty : agent.specialty}
                        </p>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {boomerMode ? agent.plainDescription : agent.description}
                        </p>

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            agent.provider === 'claude'
                              ? 'bg-orange-500/10 text-orange-400 border-orange-500/25'
                              : agent.provider === 'openclaw'
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
                              : 'bg-sky-500/10 text-sky-400 border-sky-500/25'
                          }`} style={{ fontFamily: "var(--font-sans)" }}>
                            {agent.provider === 'claude' ? 'ANTHROPIC' : agent.provider === 'openclaw' ? 'OPENCLAW' : 'OPENAI'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] text-muted-foreground/50 border border-border"
                            style={{ fontFamily: "var(--font-sans)" }}>
                            {agent.model}
                          </span>
                          {agent.requestTypes.map(t => (
                            <span key={t} className="px-2 py-0.5 rounded text-[10px] text-muted-foreground/40 border border-border/50"
                              style={{ fontFamily: "var(--font-sans)" }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {agent.status === 'offline' && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-red-400/70">
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {boomerMode
                            ? 'This specialist is offline. PABLO will use a backup AI automatically.'
                            : 'AGENT UNREACHABLE · FALLBACK ROUTING ACTIVE · SERVICE CONTINUITY MAINTAINED'
                          }
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Footer note */}
          <p className="mt-6 text-center text-[11px] text-muted-foreground/40" style={{ fontFamily: "var(--font-sans)" }}>
            {boomerMode
              ? 'Model selection is automatic. You can\'t (and don\'t need to) change it manually.'
              : 'MANUAL OVERRIDE: DISABLED · AUTONOMOUS ROUTING ONLY · OPTIMAL DISPATCH GUARANTEED'
            }
          </p>
        </div>
      </main>
    </div>
  );
}

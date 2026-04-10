import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import {
  Bot, Target, MessageSquare, PenTool, Users, Search, Eye, TrendingUp,
  ChevronRight, Check, Zap, Globe, Shield, Sparkles, ArrowRight,
  Send, Mail, MessageCircle, Hash, Linkedin, Phone,
} from 'lucide-react';

const TrailerPlayer = lazy(() => import('../components/video/TrailerPlayer'));

const SKILLS = [
  {
    key: 'sales_closer',
    name: 'AI SALES CLOSER',
    icon: Target,
    color: '#f59e0b',
    desc: 'Qualifies leads, handles objections, books meetings, and moves prospects through your pipeline 24/7. Never sleeps, never misses a follow-up.',
    channels: ['Telegram', 'WhatsApp', 'Email'],
    stats: '3x faster pipeline velocity',
  },
  {
    key: 'customer_support',
    name: 'CUSTOMER SUPPORT',
    icon: MessageSquare,
    color: '#3b82f6',
    desc: 'Resolves tier-1 and tier-2 tickets instantly. Answers FAQs, processes refunds, escalates edge cases with full context. Supports 95+ languages.',
    channels: ['Telegram', 'WhatsApp', 'Discord', 'Email'],
    stats: '90% ticket resolution rate',
  },
  {
    key: 'content_writer',
    name: 'CONTENT WRITER',
    icon: PenTool,
    color: '#a855f7',
    desc: 'Blog posts, social captions, ad copy, email campaigns — all in your brand voice. SEO optimized. Publishes on schedule across every channel.',
    channels: ['Email', 'Web'],
    stats: '10x content output',
  },
  {
    key: 'ai_recruiter',
    name: 'AI RECRUITER',
    icon: Users,
    color: '#10b981',
    desc: 'Screens candidates, conducts first-round interviews, generates scorecards, and schedules follow-ups. 70% faster time-to-hire.',
    channels: ['Telegram', 'WhatsApp', 'Email'],
    stats: '70% faster hiring',
  },
  {
    key: 'linkedin_prospector',
    name: 'LINKEDIN PROSPECTOR',
    icon: Search,
    color: '#0ea5e9',
    desc: 'Finds decision-makers by title, industry, and company size. Builds verified contact lists and auto-populates your CRM with scored leads.',
    channels: ['LinkedIn', 'Email'],
    stats: '500+ leads/month',
  },
  {
    key: 'fb_ig_scout',
    name: 'FB & IG SCOUT',
    icon: Eye,
    color: '#ec4899',
    desc: 'Monitors Groups, Pages, and business profiles for buying signals. Tags leads by intent level — hot, warm, and cold — so you never miss an opportunity.',
    channels: ['Facebook', 'Instagram'],
    stats: 'Real-time signal detection',
  },
  {
    key: 'trading_bot',
    name: 'TRADING BOT',
    icon: TrendingUp,
    color: '#22c55e',
    desc: 'Automated stock and options trading via thinkorswim. Covered calls, iron condors, momentum plays. Paper Trading mode by default for safety.',
    channels: ['thinkorswim'],
    stats: 'Automated execution',
  },
];

const DEPLOY_CHANNELS = [
  { name: 'Telegram', icon: Send },
  { name: 'WhatsApp', icon: Phone },
  { name: 'Discord', icon: Hash },
  { name: 'Facebook', icon: Globe },
  { name: 'Instagram', icon: Eye },
  { name: 'Email', icon: Mail },
  { name: 'LinkedIn', icon: Linkedin },
  { name: 'Web Chat', icon: MessageCircle },
];

const INCLUDED = [
  'Pablo AI Call Agent',
  'AI Secretary',
  'All Premium Marketplace Bots',
  'Future Agent Releases',
  'Priority Support',
  'Custom Bot Builder',
];

function JeanClawLanding() {
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  const handleCTA = () => {
    if (isAuthenticated) {
      navigate('/bots');
    } else {
      login();
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050507', color: '#e4e4e7', overflow: 'hidden' }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(16,185,129,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(56,189,248,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        background: 'rgba(5,5,7,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(16,185,129,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(16,185,129,0.1))',
            border: '1px solid rgba(16,185,129,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={20} color="#10b981" />
          </div>
          <div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.2rem', color: '#10b981', letterSpacing: '0.15em' }}>JEAN CLAW</div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(161,161,170,0.5)', letterSpacing: '0.1em' }}>BY PICASSO AI</div>
          </div>
        </div>
        <button
          onClick={handleCTA}
          style={{
            padding: '10px 28px', border: 'none', borderRadius: 8,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em',
            cursor: 'pointer', transition: 'all 0.3s',
            boxShadow: '0 0 20px rgba(16,185,129,0.3)',
          }}
        >
          {isAuthenticated ? 'OPEN DASHBOARD' : 'GET STARTED'}
        </button>
      </nav>

      <section style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px', textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          style={{ position: 'relative' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 20,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
            marginBottom: 24,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '0.75rem', color: '#10b981', letterSpacing: '0.15em', fontWeight: 600 }}>7 AGENTS OPERATIONAL</span>
          </div>

          <h1 style={{
            fontFamily: "'VT323', monospace",
            fontSize: 'clamp(3rem, 8vw, 6rem)',
            color: '#10b981',
            letterSpacing: '0.1em',
            lineHeight: 1,
            marginBottom: 16,
            textShadow: '0 0 40px rgba(16,185,129,0.3), 0 0 80px rgba(16,185,129,0.15)',
          }}>
            JEAN CLAW
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
            color: 'rgba(161,161,170,0.8)',
            maxWidth: 700, margin: '0 auto 12px',
            lineHeight: 1.6, fontWeight: 300,
          }}>
            The complete AI workforce. Seven battle-tested agents that sell, support, write, recruit, prospect, scout, and trade — all from one subscription.
          </p>

          <p style={{
            fontSize: '0.85rem', color: 'rgba(16,185,129,0.6)',
            letterSpacing: '0.1em', marginBottom: 40,
          }}>
            DEPLOY ACROSS EVERY CHANNEL. AUTOMATE EVERYTHING.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleCTA}
              style={{
                padding: '16px 40px', border: 'none', borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.08em',
                cursor: 'pointer', transition: 'all 0.3s',
                boxShadow: '0 4px 30px rgba(16,185,129,0.4)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              {isAuthenticated ? 'OPEN JEAN CLAW' : 'START FREE TRIAL'}
              <ArrowRight size={18} />
            </button>
            <a
              href="#skills"
              style={{
                padding: '16px 32px', borderRadius: 12,
                border: '1px solid rgba(16,185,129,0.3)',
                background: 'rgba(16,185,129,0.05)',
                color: '#10b981', fontWeight: 600, fontSize: '1rem', letterSpacing: '0.08em',
                cursor: 'pointer', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.3s',
              }}
            >
              SEE ALL SKILLS
              <ChevronRight size={18} />
            </a>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            style={{ width: '100%', maxWidth: 720, margin: '48px auto 0' }}
          >
            <Suspense fallback={
              <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', aspectRatio: '16/9', borderRadius: 12, border: '1px solid rgba(16,185,129,0.15)', background: '#06080d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(16,185,129,0.3)', fontSize: '0.75rem', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.15em' }}>LOADING TRAILER...</span>
              </div>
            }>
              <TrailerPlayer />
            </Suspense>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          style={{
            marginTop: 60, display: 'flex', gap: 40,
            justifyContent: 'center', flexWrap: 'wrap',
          }}
        >
          {[
            { value: '7', label: 'AI AGENTS' },
            { value: '8', label: 'CHANNELS' },
            { value: '95+', label: 'LANGUAGES' },
            { value: '24/7', label: 'UPTIME' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '2rem', color: '#10b981', letterSpacing: '0.05em' }}>{stat.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(161,161,170,0.5)', letterSpacing: '0.15em' }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      <section id="skills" style={{
        position: 'relative', zIndex: 1,
        padding: '80px 24px 100px',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: '0.7rem', color: '#10b981', letterSpacing: '0.2em', marginBottom: 8 }}>INCLUDED AGENT SKILLS</div>
          <h2 style={{
            fontFamily: "'VT323', monospace", fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            color: '#e4e4e7', letterSpacing: '0.08em',
          }}>
            SEVEN AGENTS. ONE PLATFORM.
          </h2>
          <p style={{ color: 'rgba(161,161,170,0.6)', fontSize: '0.95rem', maxWidth: 600, margin: '12px auto 0' }}>
            Each agent is independently trained, tested, and operational. Deploy them individually or as a coordinated team.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {SKILLS.map((skill, i) => {
            const Icon = skill.icon;
            const isHovered = hoveredSkill === skill.key;
            return (
              <motion.div
                key={skill.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                onMouseEnter={() => setHoveredSkill(skill.key)}
                onMouseLeave={() => setHoveredSkill(null)}
                style={{
                  position: 'relative',
                  padding: 28,
                  borderRadius: 16,
                  background: isHovered
                    ? `linear-gradient(135deg, ${skill.color}10, ${skill.color}05)`
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isHovered ? skill.color + '40' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.3s',
                  cursor: 'default',
                  overflow: 'hidden',
                }}
              >
                {isHovered && (
                  <div style={{
                    position: 'absolute', top: -50, right: -50,
                    width: 150, height: 150, borderRadius: '50%',
                    background: `radial-gradient(circle, ${skill.color}15, transparent)`,
                    pointerEvents: 'none',
                  }} />
                )}

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${skill.color}15`,
                    border: `1px solid ${skill.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={22} color={skill.color} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#10b981', boxShadow: '0 0 6px #10b981',
                      animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ fontSize: '0.6rem', color: '#10b981', letterSpacing: '0.1em' }}>LIVE</span>
                  </div>
                </div>

                <h3 style={{
                  fontSize: '1rem', fontWeight: 700, color: '#e4e4e7',
                  letterSpacing: '0.06em', marginBottom: 8,
                }}>
                  {skill.name}
                </h3>

                <p style={{
                  fontSize: '0.82rem', color: 'rgba(161,161,170,0.7)',
                  lineHeight: 1.6, marginBottom: 16,
                }}>
                  {skill.desc}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {skill.channels.map(ch => (
                      <span key={ch} style={{
                        fontSize: '0.6rem', padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(161,161,170,0.6)', letterSpacing: '0.05em',
                      }}>
                        {ch}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: skill.color, fontWeight: 600 }}>{skill.stats}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section style={{
        position: 'relative', zIndex: 1,
        padding: '80px 24px',
        background: 'linear-gradient(180deg, transparent, rgba(16,185,129,0.03), transparent)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#10b981', letterSpacing: '0.2em', marginBottom: 8 }}>DEPLOYMENT</div>
          <h2 style={{
            fontFamily: "'VT323', monospace", fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)',
            color: '#e4e4e7', letterSpacing: '0.08em', marginBottom: 40,
          }}>
            DEPLOY ON EVERY CHANNEL
          </h2>

          <div style={{
            display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
            marginBottom: 60,
          }}>
            {DEPLOY_CHANNELS.map(ch => {
              const ChIcon = ch.icon;
              return (
                <div key={ch.name} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '20px 24px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  minWidth: 100,
                  transition: 'all 0.3s',
                }}>
                  <ChIcon size={24} color="rgba(16,185,129,0.7)" />
                  <span style={{ fontSize: '0.7rem', color: 'rgba(161,161,170,0.7)', letterSpacing: '0.05em' }}>{ch.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{
        position: 'relative', zIndex: 1,
        padding: '60px 24px 100px',
      }}>
        <div style={{
          maxWidth: 800, margin: '0 auto',
          padding: 48, borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))',
          border: '1px solid rgba(16,185,129,0.15)',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(16,185,129,0.1))',
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={32} color="#10b981" />
            </div>
          </div>

          <div style={{
            fontFamily: "'VT323', monospace",
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            color: '#10b981', marginBottom: 4,
          }}>
            $145
            <span style={{ fontSize: '0.4em', color: 'rgba(16,185,129,0.6)' }}> / MONTH</span>
          </div>

          <p style={{
            color: 'rgba(161,161,170,0.6)', fontSize: '0.9rem',
            maxWidth: 500, margin: '0 auto 32px', lineHeight: 1.6,
          }}>
            7 AI agents, 8 deployment channels, unlimited conversations, and everything below — included.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12, textAlign: 'left', marginBottom: 32,
          }}>
            {INCLUDED.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <Check size={16} color="#10b981" />
                <span style={{ fontSize: '0.85rem', color: 'rgba(228,228,231,0.8)' }}>{item}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleCTA}
            style={{
              padding: '18px 48px', border: 'none', borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.3s',
              boxShadow: '0 4px 40px rgba(16,185,129,0.4)',
              display: 'inline-flex', alignItems: 'center', gap: 10,
            }}
          >
            {isAuthenticated ? 'OPEN JEAN CLAW DASHBOARD' : 'ACTIVATE JEAN CLAW'}
            <ArrowRight size={20} />
          </button>

          <p style={{
            fontSize: '0.7rem', color: 'rgba(16,185,129,0.4)',
            marginTop: 20, letterSpacing: '0.08em',
          }}>
            YOUR SUBSCRIPTION KEEPS THE PLATFORM RUNNING
          </p>
        </div>
      </section>

      <section style={{
        position: 'relative', zIndex: 1,
        padding: '60px 24px 40px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(161,161,170,0.4)', letterSpacing: '0.15em', marginBottom: 16 }}>ALSO INCLUDED WITH SALARYMAN</div>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              'Pablo AI Chat', 'CRM & Contacts', 'Hiring & HR', 'Calendar',
              'Documents', 'Invoices', 'Dashboard', 'Studio', 'Reports',
            ].map(feat => (
              <div key={feat} style={{
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Sparkles size={12} color="rgba(56,189,248,0.4)" />
                <span style={{ fontSize: '0.75rem', color: 'rgba(161,161,170,0.5)' }}>{feat}</span>
              </div>
            ))}
          </div>
          <p style={{
            fontSize: '0.7rem', color: 'rgba(161,161,170,0.3)',
            marginTop: 24, letterSpacing: '0.05em',
          }}>
            Jean Claw is the flagship product of SALARYMAN by Picasso AI. All other platform features are free bonuses included with your account.
          </p>
        </div>
      </section>

      <footer style={{
        padding: '24px', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.03)',
      }}>
        <p style={{ fontSize: '0.65rem', color: 'rgba(161,161,170,0.3)', letterSpacing: '0.1em' }}>
          &copy; {new Date().getFullYear()} PICASSO AI &middot; SALARYMAN
        </p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (max-width: 640px) {
          #skills > div:last-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default JeanClawLanding;

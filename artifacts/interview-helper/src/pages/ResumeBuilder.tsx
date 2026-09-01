import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, Trash2, Download, Eye, ArrowLeft, ChevronDown, ChevronUp,
  GripVertical, User, Briefcase, GraduationCap, Award, FolderOpen, Globe,
  Loader2, Save, Palette, Copy,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';

const UI: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };
const MONO: React.CSSProperties = { fontFamily: "'Fira Code', monospace" };

type TemplateId = 'professional' | 'modern' | 'minimal' | 'executive';

interface ContactInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  title: string;
}

interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
}

interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
  honors: string;
}

interface CertEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  technologies: string;
  link: string;
}

interface ResumeData {
  contact: ContactInfo;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: CertEntry[];
  projects: ProjectEntry[];
  languages: string[];
  template: TemplateId;
}

const STORAGE_KEY = 'sm_resume_data';

function uid() { return Math.random().toString(36).slice(2, 10); }

function emptyResume(): ResumeData {
  return {
    contact: { fullName: '', email: '', phone: '', location: '', linkedin: '', website: '', title: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    languages: [],
    template: 'professional',
  };
}

function loadFromStorage(): ResumeData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyResume(), ...JSON.parse(raw) };
  } catch {}
  return emptyResume();
}

function saveToStorage(data: ResumeData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

type Section = 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'projects' | 'languages';

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string; size?: number }> }[] = [
  { id: 'contact', label: 'CONTACT INFO', icon: User },
  { id: 'summary', label: 'SUMMARY', icon: FileText },
  { id: 'experience', label: 'EXPERIENCE', icon: Briefcase },
  { id: 'education', label: 'EDUCATION', icon: GraduationCap },
  { id: 'skills', label: 'SKILLS', icon: Award },
  { id: 'certifications', label: 'CERTIFICATIONS', icon: Award },
  { id: 'projects', label: 'PROJECTS', icon: FolderOpen },
  { id: 'languages', label: 'LANGUAGES', icon: Globe },
];

const TEMPLATES: { id: TemplateId; name: string; desc: string }[] = [
  { id: 'professional', name: 'PROFESSIONAL', desc: 'Clean, traditional format. Works everywhere.' },
  { id: 'modern', name: 'MODERN', desc: 'Two-column with accent bar. Stands out.' },
  { id: 'minimal', name: 'MINIMAL', desc: 'Sparse and elegant. Lets content breathe.' },
  { id: 'executive', name: 'EXECUTIVE', desc: 'Bold header, serif feel. For leadership roles.' },
];

const accent = '#38bdf8';
const accentDim = 'rgba(56,189,248,.15)';
const bg = '#09090b';
const cardBg = 'rgba(56,189,248,.04)';
const border = 'rgba(56,189,248,.15)';
const inputBg = 'rgba(0,0,0,.4)';

function InputField({ label, value, onChange, placeholder, multiline, rows }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number;
}) {
  const common: React.CSSProperties = {
    width: '100%', background: inputBg, border: `1px solid ${border}`, color: '#e2e8f0',
    padding: '.5rem .65rem', borderRadius: '4px', fontSize: '.85rem', ...MONO, outline: 'none',
  };
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <label style={{ display: 'block', fontSize: '.65rem', color: accent, letterSpacing: '.08em', marginBottom: '.25rem', ...UI }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3}
          style={{ ...common, resize: 'vertical', minHeight: '60px' }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={common} />
      )}
    </div>
  );
}

function SectionHeader({ label, icon: Icon, open, onToggle }: {
  label: string; icon: React.ComponentType<{ className?: string; size?: number }>; open: boolean; onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: '.5rem', width: '100%', padding: '.6rem .75rem',
      background: open ? accentDim : 'transparent', border: `1px solid ${open ? accent : border}`,
      borderRadius: '6px', cursor: 'pointer', color: accent, ...UI, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em',
      transition: 'all .15s',
    }}>
      <Icon size={14} />
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

function ContactSection({ data, onChange }: { data: ContactInfo; onChange: (c: ContactInfo) => void }) {
  const set = (k: keyof ContactInfo, v: string) => onChange({ ...data, [k]: v });
  return (
    <div>
      <InputField label="FULL NAME" value={data.fullName} onChange={v => set('fullName', v)} placeholder="Jane Doe" />
      <InputField label="PROFESSIONAL TITLE" value={data.title} onChange={v => set('title', v)} placeholder="Senior Software Engineer" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
        <InputField label="EMAIL" value={data.email} onChange={v => set('email', v)} placeholder="jane@example.com" />
        <InputField label="PHONE" value={data.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000" />
      </div>
      <InputField label="LOCATION" value={data.location} onChange={v => set('location', v)} placeholder="New York, NY" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
        <InputField label="LINKEDIN" value={data.linkedin} onChange={v => set('linkedin', v)} placeholder="linkedin.com/in/janedoe" />
        <InputField label="WEBSITE" value={data.website} onChange={v => set('website', v)} placeholder="janedoe.com" />
      </div>
    </div>
  );
}

function ExperienceSection({ entries, onChange }: { entries: ExperienceEntry[]; onChange: (e: ExperienceEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), company: '', title: '', location: '', startDate: '', endDate: '', current: false, bullets: [''] }]);
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));
  const update = (id: string, patch: Partial<ExperienceEntry>) => onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  return (
    <div>
      {entries.map((exp, i) => (
        <div key={exp.id} style={{ padding: '.75rem', background: cardBg, border: `1px solid ${border}`, borderRadius: '6px', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
             <span style={{ color: accent, fontSize: '.75rem', ...UI, fontWeight: 600, letterSpacing: '.06em' }}>POSITION {i + 1}</span>
            <button onClick={() => remove(exp.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={13} /></button>
          </div>
          <InputField label="JOB TITLE" value={exp.title} onChange={v => update(exp.id, { title: v })} placeholder="Software Engineer" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <InputField label="COMPANY" value={exp.company} onChange={v => update(exp.id, { company: v })} placeholder="Acme Corp" />
            <InputField label="LOCATION" value={exp.location} onChange={v => update(exp.id, { location: v })} placeholder="Remote" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '.5rem', alignItems: 'end' }}>
            <InputField label="START DATE" value={exp.startDate} onChange={v => update(exp.id, { startDate: v })} placeholder="Jan 2022" />
            <InputField label="END DATE" value={exp.current ? 'Present' : exp.endDate} onChange={v => update(exp.id, { endDate: v, current: false })} placeholder="Dec 2023" />
            <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', color: '#94a3b8', fontSize: '.7rem', ...MONO, cursor: 'pointer', marginBottom: '.6rem' }}>
              <input type="checkbox" checked={exp.current} onChange={e => update(exp.id, { current: e.target.checked, endDate: '' })} /> Current
            </label>
          </div>
          <div style={{ marginTop: '.3rem' }}>
             <label style={{ display: 'block', fontSize: '.65rem', color: accent, letterSpacing: '.08em', marginBottom: '.25rem', ...UI }}>BULLET POINTS</label>
            {exp.bullets.map((b, bi) => (
              <div key={bi} style={{ display: 'flex', gap: '.3rem', marginBottom: '.3rem', alignItems: 'center' }}>
                <span style={{ color: '#475569', fontSize: '.7rem' }}>•</span>
                <input value={b} onChange={e => {
                  const nb = [...exp.bullets]; nb[bi] = e.target.value; update(exp.id, { bullets: nb });
                }} placeholder="Describe your achievement..."
                  style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, color: '#e2e8f0', padding: '.4rem .5rem', borderRadius: '4px', fontSize: '.8rem', ...MONO, outline: 'none' }} />
                <button onClick={() => { const nb = exp.bullets.filter((_, j) => j !== bi); update(exp.id, { bullets: nb.length ? nb : [''] }); }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={11} /></button>
              </div>
            ))}
            <button onClick={() => update(exp.id, { bullets: [...exp.bullets, ''] })}
              style={{ background: 'none', border: `1px dashed ${border}`, color: '#64748b', cursor: 'pointer', padding: '.25rem .5rem', borderRadius: '4px', fontSize: '.7rem', ...MONO, width: '100%' }}>
              + ADD BULLET
            </button>
          </div>
        </div>
      ))}
      <button onClick={add} style={{
        width: '100%', padding: '.5rem', background: accentDim, border: `1px dashed ${accent}`,
         borderRadius: '6px', color: accent, cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em',
      }}>
        <Plus size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '.3rem' }} /> ADD EXPERIENCE
      </button>
    </div>
  );
}

function EducationSection({ entries, onChange }: { entries: EducationEntry[]; onChange: (e: EducationEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '', honors: '' }]);
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));
  const update = (id: string, patch: Partial<EducationEntry>) => onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  return (
    <div>
      {entries.map((edu, i) => (
        <div key={edu.id} style={{ padding: '.75rem', background: cardBg, border: `1px solid ${border}`, borderRadius: '6px', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
             <span style={{ color: accent, fontSize: '.75rem', ...UI, fontWeight: 600, letterSpacing: '.06em' }}>EDUCATION {i + 1}</span>
            <button onClick={() => remove(edu.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={13} /></button>
          </div>
          <InputField label="INSTITUTION" value={edu.institution} onChange={v => update(edu.id, { institution: v })} placeholder="MIT" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <InputField label="DEGREE" value={edu.degree} onChange={v => update(edu.id, { degree: v })} placeholder="B.S." />
            <InputField label="FIELD OF STUDY" value={edu.field} onChange={v => update(edu.id, { field: v })} placeholder="Computer Science" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
            <InputField label="START" value={edu.startDate} onChange={v => update(edu.id, { startDate: v })} placeholder="2018" />
            <InputField label="END" value={edu.endDate} onChange={v => update(edu.id, { endDate: v })} placeholder="2022" />
            <InputField label="GPA" value={edu.gpa} onChange={v => update(edu.id, { gpa: v })} placeholder="3.8/4.0" />
          </div>
          <InputField label="HONORS / NOTES" value={edu.honors} onChange={v => update(edu.id, { honors: v })} placeholder="Magna Cum Laude, Dean's List" />
        </div>
      ))}
      <button onClick={add} style={{
        width: '100%', padding: '.5rem', background: accentDim, border: `1px dashed ${accent}`,
         borderRadius: '6px', color: accent, cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em',
      }}>
        <Plus size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '.3rem' }} /> ADD EDUCATION
      </button>
    </div>
  );
}

function TagSection({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) { onChange([...tags, v]); setInput(''); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        {tags.map((t, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: '.3rem', padding: '.2rem .5rem',
            background: accentDim, border: `1px solid ${border}`, borderRadius: '4px',
            color: '#e2e8f0', fontSize: '.75rem', ...MONO,
          }}>
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '.3rem' }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, color: '#e2e8f0', padding: '.4rem .5rem', borderRadius: '4px', fontSize: '.8rem', ...MONO, outline: 'none' }} />
         <button onClick={add} style={{ background: accentDim, border: `1px solid ${accent}`, color: accent, cursor: 'pointer', padding: '.3rem .6rem', borderRadius: '4px', fontSize: '.75rem', ...UI, fontWeight: 600 }}>ADD</button>
      </div>
    </div>
  );
}

function CertSection({ entries, onChange }: { entries: CertEntry[]; onChange: (e: CertEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), name: '', issuer: '', date: '', credentialId: '' }]);
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));
  const update = (id: string, patch: Partial<CertEntry>) => onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  return (
    <div>
      {entries.map((c, i) => (
        <div key={c.id} style={{ padding: '.75rem', background: cardBg, border: `1px solid ${border}`, borderRadius: '6px', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
             <span style={{ color: accent, fontSize: '.75rem', ...UI, fontWeight: 600, letterSpacing: '.06em' }}>CERT {i + 1}</span>
            <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={13} /></button>
          </div>
          <InputField label="CERTIFICATION NAME" value={c.name} onChange={v => update(c.id, { name: v })} placeholder="AWS Solutions Architect" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <InputField label="ISSUER" value={c.issuer} onChange={v => update(c.id, { issuer: v })} placeholder="Amazon Web Services" />
            <InputField label="DATE" value={c.date} onChange={v => update(c.id, { date: v })} placeholder="March 2023" />
          </div>
          <InputField label="CREDENTIAL ID" value={c.credentialId} onChange={v => update(c.id, { credentialId: v })} placeholder="ABC-123-XYZ" />
        </div>
      ))}
      <button onClick={add} style={{
        width: '100%', padding: '.5rem', background: accentDim, border: `1px dashed ${accent}`,
         borderRadius: '6px', color: accent, cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em',
      }}>
        <Plus size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '.3rem' }} /> ADD CERTIFICATION
      </button>
    </div>
  );
}

function ProjectSection({ entries, onChange }: { entries: ProjectEntry[]; onChange: (e: ProjectEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), name: '', description: '', technologies: '', link: '' }]);
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));
  const update = (id: string, patch: Partial<ProjectEntry>) => onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  return (
    <div>
      {entries.map((p, i) => (
        <div key={p.id} style={{ padding: '.75rem', background: cardBg, border: `1px solid ${border}`, borderRadius: '6px', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
             <span style={{ color: accent, fontSize: '.75rem', ...UI, fontWeight: 600, letterSpacing: '.06em' }}>PROJECT {i + 1}</span>
            <button onClick={() => remove(p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={13} /></button>
          </div>
          <InputField label="PROJECT NAME" value={p.name} onChange={v => update(p.id, { name: v })} placeholder="E-Commerce Platform" />
          <InputField label="DESCRIPTION" value={p.description} onChange={v => update(p.id, { description: v })} placeholder="Built a full-stack..." multiline rows={2} />
          <InputField label="TECHNOLOGIES" value={p.technologies} onChange={v => update(p.id, { technologies: v })} placeholder="React, Node.js, PostgreSQL" />
          <InputField label="LINK" value={p.link} onChange={v => update(p.id, { link: v })} placeholder="github.com/user/project" />
        </div>
      ))}
      <button onClick={add} style={{
        width: '100%', padding: '.5rem', background: accentDim, border: `1px dashed ${accent}`,
         borderRadius: '6px', color: accent, cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600, letterSpacing: '.04em',
      }}>
        <Plus size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '.3rem' }} /> ADD PROJECT
      </button>
    </div>
  );
}

function ResumePreview({ data }: { data: ResumeData }) {
  const c = data.contact;
  const hasContent = c.fullName || data.summary || data.experience.length || data.education.length || data.skills.length || data.certifications.length || data.projects.length || data.languages.length;

  if (!hasContent) {
    return (
       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569', ...UI, fontSize: '1.1rem', letterSpacing: '.04em' }}>
        START FILLING IN YOUR DETAILS TO SEE PREVIEW
      </div>
    );
  }

  const tpl = data.template;
  const headerBg = tpl === 'executive' ? '#1e293b' : tpl === 'modern' ? '#0f172a' : '#ffffff';
  const headerColor = tpl === 'executive' || tpl === 'modern' ? '#ffffff' : '#1e293b';
  const bodyBg = '#ffffff';
  const sectionColor = tpl === 'modern' ? '#0ea5e9' : tpl === 'executive' ? '#1e40af' : '#374151';
  const textColor = '#374151';
  const lightText = '#6b7280';
  const dividerColor = tpl === 'modern' ? '#0ea5e9' : tpl === 'executive' ? '#1e40af' : '#d1d5db';

  return (
    <div style={{
      background: bodyBg, color: textColor, fontFamily: tpl === 'executive' ? "'Georgia', serif" : "'Helvetica', 'Arial', sans-serif",
      fontSize: '9px', lineHeight: 1.45, width: '100%', minHeight: '700px', padding: 0,
      boxShadow: '0 4px 24px rgba(0,0,0,.3)',
    }}>
      <div style={{
        background: headerBg, color: headerColor,
        padding: tpl === 'minimal' ? '16px 24px 12px' : '20px 24px 16px',
        borderBottom: tpl === 'modern' ? '3px solid #0ea5e9' : tpl === 'executive' ? '3px solid #1e40af' : '1px solid #e5e7eb',
      }}>
        <div style={{ fontSize: tpl === 'executive' ? '18px' : '16px', fontWeight: 700, letterSpacing: tpl === 'executive' ? '.04em' : '.02em' }}>
          {c.fullName || 'YOUR NAME'}
        </div>
        {c.title && <div style={{ fontSize: '10px', color: tpl === 'executive' || tpl === 'modern' ? 'rgba(255,255,255,.75)' : lightText, marginTop: '2px', letterSpacing: '.03em' }}>{c.title}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', fontSize: '7.5px', color: tpl === 'executive' || tpl === 'modern' ? 'rgba(255,255,255,.6)' : lightText }}>
          {c.email && <span>{c.email}</span>}
          {c.phone && <span>{c.phone}</span>}
          {c.location && <span>{c.location}</span>}
          {c.linkedin && <span>{c.linkedin}</span>}
          {c.website && <span>{c.website}</span>}
        </div>
      </div>

      <div style={{ padding: '14px 24px 20px' }}>
        {data.summary && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              PROFESSIONAL SUMMARY
            </div>
            <div style={{ fontSize: '8px', color: textColor, lineHeight: 1.5 }}>{data.summary}</div>
          </div>
        )}

        {data.experience.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              EXPERIENCE
            </div>
            {data.experience.map(exp => (
              <div key={exp.id} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '8.5px' }}>{exp.title}{exp.company ? ` — ${exp.company}` : ''}</span>
                  <span style={{ fontSize: '7px', color: lightText }}>{exp.startDate}{(exp.endDate || exp.current) ? ` – ${exp.current ? 'Present' : exp.endDate}` : ''}</span>
                </div>
                {exp.location && <div style={{ fontSize: '7px', color: lightText }}>{exp.location}</div>}
                {exp.bullets.filter(b => b.trim()).length > 0 && (
                  <ul style={{ margin: '3px 0 0 12px', padding: 0 }}>
                    {exp.bullets.filter(b => b.trim()).map((b, i) => (
                      <li key={i} style={{ fontSize: '7.5px', marginBottom: '1px' }}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {data.education.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              EDUCATION
            </div>
            {data.education.map(edu => (
              <div key={edu.id} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '8.5px' }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</span>
                  <span style={{ fontSize: '7px', color: lightText }}>{edu.startDate}{edu.endDate ? ` – ${edu.endDate}` : ''}</span>
                </div>
                <div style={{ fontSize: '7.5px', color: lightText }}>{edu.institution}{edu.gpa ? ` | GPA: ${edu.gpa}` : ''}</div>
                {edu.honors && <div style={{ fontSize: '7px', color: lightText, fontStyle: 'italic' }}>{edu.honors}</div>}
              </div>
            ))}
          </div>
        )}

        {data.skills.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              SKILLS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.skills.map((s, i) => (
                <span key={i} style={{ fontSize: '7.5px', padding: '1px 6px', background: '#f1f5f9', borderRadius: '3px', color: textColor }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {data.certifications.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              CERTIFICATIONS
            </div>
            {data.certifications.map(cert => (
              <div key={cert.id} style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '8px' }}>{cert.name}</span>
                {cert.issuer && <span style={{ fontSize: '7.5px', color: lightText }}> — {cert.issuer}</span>}
                {cert.date && <span style={{ fontSize: '7px', color: lightText }}> ({cert.date})</span>}
              </div>
            ))}
          </div>
        )}

        {data.projects.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              PROJECTS
            </div>
            {data.projects.map(p => (
              <div key={p.id} style={{ marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '8px' }}>{p.name}</span>
                {p.link && <span style={{ fontSize: '7px', color: '#0ea5e9', marginLeft: '6px' }}>{p.link}</span>}
                {p.description && <div style={{ fontSize: '7.5px', color: lightText, marginTop: '1px' }}>{p.description}</div>}
                {p.technologies && <div style={{ fontSize: '7px', color: lightText, fontStyle: 'italic', marginTop: '1px' }}>Tech: {p.technologies}</div>}
              </div>
            ))}
          </div>
        )}

        {data.languages.length > 0 && (
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: sectionColor, letterSpacing: '.08em', borderBottom: `1px solid ${dividerColor}`, paddingBottom: '3px', marginBottom: '5px' }}>
              LANGUAGES
            </div>
            <div style={{ fontSize: '7.5px' }}>{data.languages.join(' • ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

async function generatePdf(data: ResumeData) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const c = data.contact;
  const tpl = data.template;

  const W = 210;
  const margin = 18;
  const contentW = W - margin * 2;
  let y = 0;

  const isExec = tpl === 'executive';
  const isMod = tpl === 'modern';
  const isMin = tpl === 'minimal';

  const hdrBg: [number, number, number] = isExec ? [30, 41, 59] : isMod ? [15, 23, 42] : [255, 255, 255];
  const hdrText: [number, number, number] = isExec || isMod ? [255, 255, 255] : [30, 41, 59];
  const secColor: [number, number, number] = isMod ? [14, 165, 233] : isExec ? [30, 64, 175] : [55, 65, 81];
  const bodyText: [number, number, number] = [55, 65, 81];
  const lightClr: [number, number, number] = [107, 114, 128];
  const divClr: [number, number, number] = isMod ? [14, 165, 233] : isExec ? [30, 64, 175] : [209, 213, 219];

  const hdrH = isMin ? 28 : 36;
  doc.setFillColor(...hdrBg);
  doc.rect(0, 0, W, hdrH, 'F');

  if (isMod) {
    doc.setFillColor(14, 165, 233);
    doc.rect(0, hdrH, W, 1.2, 'F');
  } else if (isExec) {
    doc.setFillColor(30, 64, 175);
    doc.rect(0, hdrH, W, 1.2, 'F');
  }

  doc.setTextColor(...hdrText);
  doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
  doc.setFontSize(isExec ? 20 : 18);
  doc.text(c.fullName || 'YOUR NAME', margin, isMin ? 14 : 18);

  if (c.title) {
    doc.setFontSize(10);
    doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
    if (isExec || isMod) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...lightClr);
    doc.text(c.title, margin, isMin ? 20 : 24);
  }

  const contactParts = [c.email, c.phone, c.location, c.linkedin, c.website].filter(Boolean);
  if (contactParts.length > 0) {
    doc.setFontSize(7.5);
    if (isExec || isMod) doc.setTextColor(200, 200, 200);
    else doc.setTextColor(...lightClr);
    doc.text(contactParts.join('  |  '), margin, isMin ? 25 : 30);
  }

  y = hdrH + (isMod || isExec ? 5 : 4);

  function sectionTitle(title: string) {
    checkPage(20);
    y += 5;
    doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...secColor);
    doc.text(title, margin, y);
    y += 1.5;
    doc.setDrawColor(...divClr);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentW, y);
    y += 4;
  }

  function checkPage(needed: number) {
    if (y + needed > 280) {
      doc.addPage();
      y = 15;
    }
  }

  if (data.summary) {
    sectionTitle('PROFESSIONAL SUMMARY');
    checkPage(15);
    doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...bodyText);
    const lines = doc.splitTextToSize(data.summary, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 2;
  }

  if (data.experience.length > 0) {
    sectionTitle('EXPERIENCE');
    for (const exp of data.experience) {
      checkPage(20);
      doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...bodyText);
      const titleStr = exp.title + (exp.company ? ` — ${exp.company}` : '');
      doc.text(titleStr, margin, y);
      const dateStr = exp.startDate + (exp.endDate || exp.current ? ` – ${exp.current ? 'Present' : exp.endDate}` : '');
      if (dateStr.trim()) {
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...lightClr);
        doc.text(dateStr, W - margin, y, { align: 'right' });
      }
      y += 3.5;
      if (exp.location) {
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...lightClr);
        doc.text(exp.location, margin, y);
        y += 3.5;
      }
      const bullets = exp.bullets.filter(b => b.trim());
      for (const b of bullets) {
        checkPage(6);
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...bodyText);
        const bLines = doc.splitTextToSize(b, contentW - 6);
        doc.text('•', margin + 1, y);
        doc.text(bLines, margin + 5, y);
        y += bLines.length * 3.2 + 1;
      }
      y += 2;
    }
  }

  if (data.education.length > 0) {
    sectionTitle('EDUCATION');
    for (const edu of data.education) {
      checkPage(14);
      doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...bodyText);
      doc.text(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, margin, y);
      const dateStr = edu.startDate + (edu.endDate ? ` – ${edu.endDate}` : '');
      if (dateStr.trim()) {
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...lightClr);
        doc.text(dateStr, W - margin, y, { align: 'right' });
      }
      y += 3.5;
      doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...lightClr);
      doc.text(`${edu.institution}${edu.gpa ? ` | GPA: ${edu.gpa}` : ''}`, margin, y);
      y += 3.5;
      if (edu.honors) {
        doc.setFontSize(7.5);
        doc.text(edu.honors, margin, y);
        y += 3.5;
      }
      y += 1;
    }
  }

  if (data.skills.length > 0) {
    sectionTitle('SKILLS');
    checkPage(10);
    doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...bodyText);
    const skillText = data.skills.join('  •  ');
    const sLines = doc.splitTextToSize(skillText, contentW);
    doc.text(sLines, margin, y);
    y += sLines.length * 3.5 + 2;
  }

  if (data.certifications.length > 0) {
    sectionTitle('CERTIFICATIONS');
    for (const cert of data.certifications) {
      checkPage(8);
      doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...bodyText);
      let certLine = cert.name;
      if (cert.issuer) certLine += ` — ${cert.issuer}`;
      if (cert.date) certLine += ` (${cert.date})`;
      doc.text(certLine, margin, y);
      y += 4;
    }
  }

  if (data.projects.length > 0) {
    sectionTitle('PROJECTS');
    for (const p of data.projects) {
      checkPage(14);
      doc.setFont(isExec ? 'times' : 'helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...bodyText);
      doc.text(p.name, margin, y);
      if (p.link) {
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(14, 165, 233);
        doc.text(p.link, margin + doc.getTextWidth(p.name + '  '), y);
      }
      y += 3.5;
      if (p.description) {
        doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...bodyText);
        const dLines = doc.splitTextToSize(p.description, contentW);
        doc.text(dLines, margin, y);
        y += dLines.length * 3.2 + 1;
      }
      if (p.technologies) {
        doc.setFontSize(7.5);
        doc.setTextColor(...lightClr);
        doc.text(`Tech: ${p.technologies}`, margin, y);
        y += 3.5;
      }
      y += 1;
    }
  }

  if (data.languages.length > 0) {
    sectionTitle('LANGUAGES');
    checkPage(8);
    doc.setFont(isExec ? 'times' : 'helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...bodyText);
    doc.text(data.languages.join('  •  '), margin, y);
  }

  const filename = c.fullName ? `${c.fullName.replace(/\s+/g, '_')}_Resume.pdf` : 'Resume.pdf';
  doc.save(filename);
}

export default function ResumeBuilder() {
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState<ResumeData>(loadFromStorage);
  const [activeSection, setActiveSection] = useState<Section>('contact');
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const updateData = useCallback((patch: Partial<ResumeData>) => {
    setData(prev => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { saveToStorage(next); setSaved(true); setTimeout(() => setSaved(false), 1500); }, 600);
      return next;
    });
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try { await generatePdf(data); } catch (e) { console.error('PDF export failed', e); }
    setExporting(false);
  };

  const handleReset = () => {
    if (!confirm('Clear all resume data? This cannot be undone.')) return;
    const fresh = emptyResume();
    setData(fresh);
    saveToStorage(fresh);
  };

  if (!isAuthenticated || !user) return <SignInPage context="resume builder" />;

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#e2e8f0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.75rem 1.25rem',
        borderBottom: `1px solid ${border}`, background: 'rgba(0,0,0,.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <FileText size={18} color={accent} />
          <span style={{ ...UI, fontSize: '1.2rem', fontWeight: 700, color: accent, letterSpacing: '.04em' }}>RESUME BUILDER</span>
          {saved && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ fontSize: '.65rem', color: '#22c55e', ...MONO, letterSpacing: '.08em' }}>
              SAVED
            </motion.span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button onClick={() => setShowPreview(!showPreview)}
            style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .75rem', background: showPreview ? accentDim : 'transparent', border: `1px solid ${showPreview ? accent : border}`, borderRadius: '6px', color: accent, cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600 }}>
            <Eye size={13} /> {showPreview ? 'EDITOR' : 'PREVIEW'}
          </button>
          <button onClick={handleExport} disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .75rem', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.4)', borderRadius: '6px', color: '#22c55e', cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600, opacity: exporting ? .5 : 1 }}>
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} EXPORT PDF
          </button>
          <button onClick={handleReset}
            style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.4rem .75rem', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: '6px', color: '#ef4444', cursor: 'pointer', ...UI, fontSize: '.8rem', fontWeight: 600 }}>
            <Trash2 size={13} /> RESET
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 53px)' }}>
        {!showPreview && (
          <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem', maxWidth: '600px' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '.7rem', color: accent, letterSpacing: '.08em', marginBottom: '.4rem', ...UI }}>TEMPLATE</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => updateData({ template: t.id })}
                    style={{
                      padding: '.5rem .6rem', background: data.template === t.id ? accentDim : 'transparent',
                      border: `1px solid ${data.template === t.id ? accent : border}`, borderRadius: '6px',
                      color: data.template === t.id ? accent : '#94a3b8', cursor: 'pointer', textAlign: 'left', ...MONO,
                    }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: '.6rem', color: '#64748b', marginTop: '2px' }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {SECTIONS.map(sec => (
                <div key={sec.id}>
                  <SectionHeader label={sec.label} icon={sec.icon} open={activeSection === sec.id} onToggle={() => setActiveSection(activeSection === sec.id ? sec.id : sec.id)} />
                  <AnimatePresence>
                    {activeSection === sec.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', padding: '.75rem .5rem .5rem' }}>
                        {sec.id === 'contact' && <ContactSection data={data.contact} onChange={contact => updateData({ contact })} />}
                        {sec.id === 'summary' && <InputField label="PROFESSIONAL SUMMARY" value={data.summary} onChange={summary => updateData({ summary })} placeholder="Experienced professional with..." multiline rows={5} />}
                        {sec.id === 'experience' && <ExperienceSection entries={data.experience} onChange={experience => updateData({ experience })} />}
                        {sec.id === 'education' && <EducationSection entries={data.education} onChange={education => updateData({ education })} />}
                        {sec.id === 'skills' && <TagSection label="SKILLS" tags={data.skills} onChange={skills => updateData({ skills })} placeholder="e.g. JavaScript, Project Management" />}
                        {sec.id === 'certifications' && <CertSection entries={data.certifications} onChange={certifications => updateData({ certifications })} />}
                        {sec.id === 'projects' && <ProjectSection entries={data.projects} onChange={projects => updateData({ projects })} />}
                        {sec.id === 'languages' && <TagSection label="LANGUAGES" tags={data.languages} onChange={languages => updateData({ languages })} placeholder="e.g. English (Native), Spanish (Fluent)" />}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          flex: showPreview ? 1 : 1, overflow: 'auto', padding: '1rem',
          background: 'rgba(0,0,0,.2)', borderLeft: showPreview ? 'none' : `1px solid ${border}`,
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: '520px' }}>
            <div style={{ fontSize: '.65rem', color: '#64748b', textAlign: 'center', marginBottom: '.5rem', ...UI, letterSpacing: '.04em' }}>
              LIVE PREVIEW — {TEMPLATES.find(t => t.id === data.template)?.name ?? 'PROFESSIONAL'}
            </div>
            <ResumePreview data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}

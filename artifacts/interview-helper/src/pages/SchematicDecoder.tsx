import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Ruler, Sparkles, Loader2, AlertTriangle, UploadCloud, FileText, Image as ImageIcon, X, Box } from 'lucide-react';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

const ACCEPT = 'image/*,application/pdf,.dxf,.dwg,.step,.stp,.stl,.iges,.igs,.gcode,.nc,.gbr,.svg,.scad';
const MAX_BYTES = 22 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function fileIcon(name: string, type: string) {
  if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-amber-400" />;
  if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return <FileText className="w-5 h-5 text-amber-400" />;
  return <Box className="w-5 h-5 text-amber-400" />;
}

export default function SchematicDecoder() {
  const { isAuthenticated, login } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [report, setReport] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pick = (f: File | null) => {
    setError('');
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError('File is too large — keep it under 22MB.');
      return;
    }
    setFile(f);
    setReport('');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  }, []);

  const decode = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setReport('');
    setStatus('Uploading…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await apiFetch(apiUrl('tools/decode-schematic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ dataUrl, filename: file.name, mimeType: file.type, notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(err.error ?? 'Request failed');
        setBusy(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.status) setStatus(d.status);
            if (d.content) { setStatus(''); setReport(prev => prev + d.content); }
            if (d.error) setError(d.error);
            if (d.done) setStatus('');
          } catch { /* ignore partial */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Something went wrong reading that file.');
    } finally {
      setBusy(false);
      setStatus('');
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStatus('');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-4">
          <Ruler className="w-12 h-12 text-amber-400/40 mx-auto" />
          <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">ACCESS RESTRICTED</p>
          <button onClick={() => login()} className="px-6 py-2 border border-amber-500/30 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500/10 transition-colors">SIGN IN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Ruler className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-mono uppercase tracking-widest text-amber-400">Blueprint Decoder</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-8">
          Drop in a CAD file or engineering schematic — image, PDF, or source (DXF, STEP, STL,
          DWG…). The decoder reads it and returns one report: a plain-English overview, key
          dimensions, materials &amp; tolerances, and a bill of materials.
        </p>

        <div className="space-y-5 border border-white/[0.06] rounded-lg p-5 bg-white/[0.01]">
          {!file ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`cursor-pointer flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 px-4 text-center transition-colors ${dragging ? 'border-amber-500/60 bg-amber-500/5' : 'border-white/10 hover:border-amber-500/30'}`}
            >
              <UploadCloud className="w-8 h-8 text-amber-400/70" />
              <div className="text-sm text-zinc-300">Drop a file here, or click to choose</div>
              <div className="text-[11px] text-zinc-600 uppercase tracking-wider">Images · PDF · DXF · DWG · STEP · STL · IGES · SVG — up to 22MB</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
              {fileIcon(file.name, file.type)}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">{file.name}</div>
                <div className="text-[11px] text-zinc-600">{humanSize(file.size)}</div>
              </div>
              {!busy && (
                <button onClick={() => { setFile(null); setReport(''); setError(''); }} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={e => pick(e.target.files?.[0] ?? null)}
          />

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Context (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="e.g. This is a bracket for a robotics arm — what's the bolt pattern?"
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/40 resize-none placeholder:text-zinc-700 disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={decode}
              disabled={busy || !file}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs uppercase tracking-widest rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? 'Deciphering…' : 'Decipher'}
            </button>
            {busy && (
              <button onClick={cancel} className="px-4 py-2.5 text-xs uppercase tracking-widest rounded border border-white/10 text-zinc-400 hover:text-zinc-200 transition-colors">
                Stop
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2 text-red-400/90 text-sm border border-red-500/20 rounded p-3 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status && (
          <div className="mt-5 flex items-center gap-2 text-amber-400/80 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{status}</span>
          </div>
        )}

        {report && (
          <div className="mt-6 border border-white/[0.06] rounded-lg p-6 bg-white/[0.01]">
            <MarkdownRenderer content={report} />
          </div>
        )}
      </div>
    </div>
  );
}

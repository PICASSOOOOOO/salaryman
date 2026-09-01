import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useUpload } from '@workspace/object-storage-web';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import {
  Upload, Trash2, Download, Play, Pause, Image, Music, Video,
  FolderOpen, Grid3X3, List, Search, X, Loader2, Eye, Send, Users,
} from 'lucide-react';

interface Contact {
  userId: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  relation: 'coworker' | 'colleague';
}

function ShareDialog({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/colleagues/contacts')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false));
  }, []);

  const send = async (c: Contact) => {
    setSending(c.userId);
    setError(null);
    const mediaType = file.mimeType?.startsWith('audio/') ? 'recording'
      : file.mimeType?.startsWith('image/') ? 'image'
      : file.mimeType?.startsWith('video/') ? 'video'
      : 'document';
    const r = await apiFetch('/api/media/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserId: c.userId,
        mediaType,
        title: file.name,
        objectPath: file.objectPath,
        mimeType: file.mimeType,
        fileSizeBytes: file.fileSize,
      }),
    });
    if (r.ok) {
      setSentTo(s => new Set([...s, c.userId]));
    } else {
      const err = await r.json().catch(() => ({}));
      setError(err.error || `Could not send to ${c.name}`);
    }
    setSending(null);
  };

  const visible = contacts.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.email?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d100d] border border-cyan-500/20 rounded-lg max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/10">
          <div>
            <div className="text-sm text-cyan-300 tracking-wider flex items-center gap-2"><Send size={14}/> SHARE</div>
            <div className="text-[10px] text-cyan-400/40 mt-0.5 truncate max-w-[300px]">{file.name}</div>
          </div>
          <button onClick={onClose} className="p-1 text-cyan-400/40 hover:text-cyan-300"><X size={18}/></button>
        </div>
        <div className="p-3 border-b border-cyan-500/10">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="SEARCH COWORKERS / ASSOCIATES..."
            className="w-full px-3 py-1.5 text-xs tracking-wider bg-[#080b08] border border-cyan-500/15 rounded text-cyan-300 placeholder:text-cyan-400/20 outline-none focus:border-cyan-500/40"
          />
        </div>
        {error && (
          <div className="mx-3 mt-3 px-2 py-1.5 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded">⚠ {error}</div>
        )}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-cyan-400/40"/></div>
          ) : visible.length === 0 ? (
            <div className="text-center py-10 text-cyan-400/30 text-xs tracking-wider">
              {contacts.length === 0
                ? <>NO CONTACTS YET <br/><a href="/comms" className="text-cyan-400 hover:underline">add associates →</a></>
                : 'NO MATCH'}
            </div>
          ) : (
            visible.map(c => {
              const sent = sentTo.has(c.userId);
              return (
                <div key={c.userId} className="flex items-center gap-2 px-2 py-2 hover:bg-cyan-500/5 rounded">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-cyan-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-cyan-400/30 truncate">
                      {c.relation === 'coworker' ? '◆ COWORKER' : '○ ASSOCIATE'}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => send(c)}
                    disabled={sent || sending === c.userId}
                    className={`px-2 py-1 text-[10px] tracking-wider rounded border ${
                      sent
                        ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                        : 'border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/15'
                    } disabled:opacity-60`}
                  >
                    {sending === c.userId ? <Loader2 size={12} className="animate-spin"/> : sent ? 'SENT' : 'SEND'}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="p-3 border-t border-cyan-500/10 text-[10px] text-cyan-400/30 tracking-wider flex items-center justify-between">
          <span><Users size={11} className="inline mr-1"/> COWORKERS AUTO-CONNECTED</span>
          <a href="/comms" className="text-cyan-400 hover:underline">MANAGE ASSOCIATES</a>
        </div>
      </div>
    </div>
  );
}

interface MediaFile {
  id: number;
  name: string;
  objectPath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  isPublic: boolean;
  createdAt: string;
}

type FilterType = 'all' | 'audio' | 'image' | 'video';
type ViewMode = 'grid' | 'list';

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMediaType(mime: string | null): 'audio' | 'image' | 'video' | 'other' {
  if (!mime) return 'other';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
}

function MediaIcon({ mime, size = 20 }: { mime: string | null; size?: number }) {
  const type = getMediaType(mime);
  if (type === 'audio') return <Music size={size} />;
  if (type === 'image') return <Image size={size} />;
  if (type === 'video') return <Video size={size} />;
  return <FolderOpen size={size} />;
}

function AudioPreview({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play().catch(() => {}); }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} />
      <button onClick={toggle} className="p-1.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors">
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  );
}

export default function MediaLibrary() {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [shareFile, setShareFile] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${import.meta.env.BASE_URL}api/storage`,
    onSuccess: () => { loadFiles(); },
  });

  const loadFiles = useCallback(async () => {
    try {
      const r = await apiFetch('/api/tools/documents/files');
      if (r.ok) {
        const data = await r.json();
        const items: MediaFile[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        const mediaOnly = items.filter(f => {
          const t = getMediaType(f.mimeType);
          return t === 'audio' || t === 'image' || t === 'video';
        });
        setFiles(mediaOnly);
      }
    } catch (err) {
      console.error('[MediaLibrary] loadFiles failed', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    setUploadError(null);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const result = await uploadFile(file);
      if (!result) {
        setUploadError(`Upload failed for ${file.name}`);
        continue;
      }
      const reg = await apiFetch('/api/tools/documents/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          objectPath: result.objectPath,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        setUploadError(err.error || `Could not save ${file.name} to library (HTTP ${reg.status})`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadFiles();
  };

  const handleDelete = async (file: MediaFile) => {
    setDeleting(file.id);
    try {
      await apiFetch(`/api/tools/documents/files/${file.id}`, { method: 'DELETE' });
      setFiles(f => f.filter(x => x.id !== file.id));
      if (previewFile?.id === file.id) setPreviewFile(null);
    } catch {}
    setDeleting(null);
  };

  const getDownloadUrl = (file: MediaFile) => {
    const base = import.meta.env.BASE_URL;
    return `${base}api/tools/documents/files/${file.id}/download`;
  };

  const filtered = files.filter(f => {
    if (filter !== 'all' && getMediaType(f.mimeType) !== filter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access media library.' : 'Salaryman credentials required. VAULT-X access locked.'} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0d0a] text-cyan-300 font-mono">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyan-400" style={{ fontFamily: "var(--font-sans)" }}>
              {boomerMode ? 'MEDIA LIBRARY' : 'VAULT-X'}
            </h1>
            <p className="text-[10px] tracking-wider text-cyan-400/30 uppercase">
              {boomerMode ? 'MANAGE YOUR MEDIA FILES' : 'CLASSIFIED ASSET STORAGE'}
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/10 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isUploading ? `UPLOADING ${progress}%` : 'UPLOAD'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,image/*,video/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-1 bg-[#0d100d] border border-cyan-500/15 rounded p-0.5">
            {([['all', 'ALL'], ['audio', 'AUDIO'], ['image', 'IMAGES'], ['video', 'VIDEO']] as [FilterType, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-[10px] tracking-wider rounded transition-colors ${
                  filter === key
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-cyan-400/40 hover:text-cyan-400/60 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-400/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="SEARCH..."
                className="w-full pl-8 pr-8 py-1.5 text-xs tracking-wider bg-[#0d100d] border border-cyan-500/15 rounded text-cyan-300 placeholder:text-cyan-400/20 outline-none focus:border-cyan-500/40"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-400/30 hover:text-cyan-400/60">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex gap-0.5 bg-[#0d100d] border border-cyan-500/15 rounded p-0.5">
              <button onClick={() => setView('grid')} className={`p-1 rounded ${view === 'grid' ? 'bg-cyan-500/15 text-cyan-300' : 'text-cyan-400/30'}`}>
                <Grid3X3 size={14} />
              </button>
              <button onClick={() => setView('list')} className={`p-1 rounded ${view === 'list' ? 'bg-cyan-500/15 text-cyan-300' : 'text-cyan-400/30'}`}>
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-cyan-400/30 tracking-wider mb-3">
          {filtered.length} {filtered.length === 1 ? 'FILE' : 'FILES'}{filter !== 'all' ? ` (${filter.toUpperCase()})` : ''}
        </div>

        {uploadError && (
          <div className="mb-3 px-3 py-2 text-[11px] tracking-wider bg-red-500/10 border border-red-500/30 rounded text-red-300 flex items-center justify-between">
            <span>⚠ {uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-red-300/60 hover:text-red-300">
              <X size={12} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-400/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-cyan-400/20 text-sm tracking-wider">
            {files.length === 0 ? 'NO MEDIA FILES — UPLOAD TO GET STARTED' : 'NO MATCHING FILES'}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map(file => (
              <div
                key={file.id}
                className="group bg-[#0d100d] border border-cyan-500/10 rounded-lg overflow-hidden hover:border-cyan-500/30 transition-colors cursor-pointer"
                onClick={() => setPreviewFile(file)}
              >
                <div className="aspect-square bg-[#080b08] flex items-center justify-center relative">
                  {getMediaType(file.mimeType) === 'image' && file.objectPath ? (
                    <img src={getDownloadUrl(file)} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <MediaIcon mime={file.mimeType} size={32} />
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setPreviewFile(file); }}
                      className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={getDownloadUrl(file)}
                      download={file.name}
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={e => { e.stopPropagation(); setShareFile(file); }}
                      className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                      title="Share with coworker or associate"
                    >
                      <Send size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(file); }}
                      className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      {deleting === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[10px] text-cyan-300/80 truncate tracking-wider">{file.name}</div>
                  <div className="text-[9px] text-cyan-400/25 mt-0.5">{formatBytes(file.fileSize)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3 px-3 py-2 bg-[#0d100d] border border-cyan-500/10 rounded hover:border-cyan-500/25 transition-colors cursor-pointer group"
                onClick={() => setPreviewFile(file)}
              >
                <div className="text-cyan-400/40">
                  <MediaIcon mime={file.mimeType} size={16} />
                </div>
                <span className="text-xs text-cyan-300/80 truncate flex-1 tracking-wider">{file.name}</span>
                {getMediaType(file.mimeType) === 'audio' && (
                  <AudioPreview src={getDownloadUrl(file)} />
                )}
                <span className="text-[10px] text-cyan-400/25 hidden sm:block">{formatBytes(file.fileSize)}</span>
                <span className="text-[10px] text-cyan-400/20 hidden sm:block">{new Date(file.createdAt).toLocaleDateString()}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={getDownloadUrl(file)}
                    download={file.name}
                    onClick={e => e.stopPropagation()}
                    className="p-1 rounded text-cyan-400/40 hover:text-cyan-300 hover:bg-cyan-500/10"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    onClick={e => { e.stopPropagation(); setShareFile(file); }}
                    className="p-1 rounded text-cyan-400/40 hover:text-cyan-300 hover:bg-cyan-500/10"
                    title="Share"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(file); }}
                    className="p-1 rounded text-red-400/40 hover:text-red-300 hover:bg-red-500/10"
                  >
                    {deleting === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewFile && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
            <div
              className="bg-[#0d100d] border border-cyan-500/20 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-cyan-500/10">
                <div>
                  <div className="text-sm text-cyan-300 tracking-wider">{previewFile.name}</div>
                  <div className="text-[10px] text-cyan-400/30 mt-0.5">
                    {formatBytes(previewFile.fileSize)} · {previewFile.mimeType || 'UNKNOWN'} · {new Date(previewFile.createdAt).toLocaleString()}
                  </div>
                </div>
                <button onClick={() => setPreviewFile(null)} className="p-1 text-cyan-400/40 hover:text-cyan-300">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 flex items-center justify-center min-h-[200px]">
                {getMediaType(previewFile.mimeType) === 'image' ? (
                  <img src={getDownloadUrl(previewFile)} alt={previewFile.name} className="max-w-full max-h-[60vh] object-contain rounded" />
                ) : getMediaType(previewFile.mimeType) === 'audio' ? (
                  <div className="w-full flex flex-col items-center gap-4">
                    <Music size={48} className="text-cyan-400/30" />
                    <audio controls src={getDownloadUrl(previewFile)} className="w-full max-w-md" />
                  </div>
                ) : getMediaType(previewFile.mimeType) === 'video' ? (
                  <video controls src={getDownloadUrl(previewFile)} className="max-w-full max-h-[60vh] rounded" />
                ) : (
                  <div className="text-cyan-400/30 text-sm">PREVIEW NOT AVAILABLE</div>
                )}
              </div>
              <div className="flex gap-2 p-4 pt-0 justify-end">
                <a
                  href={getDownloadUrl(previewFile)}
                  download={previewFile.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/10 border border-cyan-500/30 rounded hover:bg-cyan-500/20"
                >
                  <Download size={14} /> DOWNLOAD
                </a>
                <button
                  onClick={() => setShareFile(previewFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/10 border border-cyan-500/30 rounded hover:bg-cyan-500/20"
                >
                  <Send size={14} /> SHARE
                </button>
                <button
                  onClick={() => { handleDelete(previewFile); setPreviewFile(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 text-red-400"
                >
                  <Trash2 size={14} /> DELETE
                </button>
              </div>
            </div>
          </div>
        )}

        {shareFile && <ShareDialog file={shareFile} onClose={() => setShareFile(null)} />}
      </div>
    </div>
  );
}

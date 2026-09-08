import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useCallback, useEffect } from 'react';

export type MediaAnalyzerStatus = 'idle' | 'reading' | 'uploading' | 'analyzing' | 'done' | 'error';

const BASE_URL = import.meta.env.BASE_URL;

const PHASE_DURATIONS: Record<string, number> = {
  'Reading file...': 2,
  'Sending to Pablo...': 5,
  'Detecting media type...': 2,
  'Extracting frames...': 8,
  'Extracting audio...': 6,
  'Transcribing audio...': 10,
  'Analyzing image...': 8,
  'Analyzing video content...': 12,
  'Analyzing audio content...': 10,
  'Generating analysis...': 15,
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'svg', 'cr2', 'nef', 'raw']);
const AUDIO_EXTS = new Set(['wav', 'mp3', 'aac', 'ogg', 'flac', 'wma', 'm4a', 'aiff', 'aif', 'opus', 'amr']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', 'mpeg', 'mpg', 'm4v']);

export type MediaFileType = 'image' | 'audio' | 'video' | 'unknown';

export function detectMediaFileType(filename: string, mimeType?: string): MediaFileType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
  }
  return 'unknown';
}

export function validateMediaFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max size is 25 MB.`;
  }
  const type = detectMediaFileType(file.name, file.type);
  if (type === 'unknown') {
    return 'Unsupported file format. Upload an image, audio, or video file.';
  }
  return null;
}

export function useMediaAnalyzer() {
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<MediaAnalyzerStatus>('idle');
  const [phase, setPhase] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<MediaFileType>('unknown');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const hadErrorRef = useRef(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setStatus('done');
  }, []);

  const reset = useCallback(() => {
    cancel();
    setResponse('');
    setStatus('idle');
    setPhase('');
    setFileName('');
    setFileType('unknown');
    setProgress(0);
    setElapsed(0);
    hadErrorRef.current = false;
  }, [cancel]);

  const analyze = useCallback(async (file: File) => {
    const validationError = validateMediaFile(file);
    if (validationError) {
      setResponse(validationError);
      setStatus('error');
      return;
    }

    cancel();
    hadErrorRef.current = false;
    setResponse('');
    setFileName(file.name);
    setFileType(detectMediaFileType(file.name, file.type));
    setStatus('reading');
    setPhase('Reading file...');
    setProgress(0);
    setElapsed(0);
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    abortRef.current = new AbortController();

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      setStatus('uploading');
      setPhase('Sending to Pablo...');

      const url = `${BASE_URL}api/interview/analyze-media`;
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, filename: file.name, mimeType: file.type }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setStatus('analyzing');
      const reader2 = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader2) throw new Error('No stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader2.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim().startsWith('data:')) continue;
          const jsonStr = line.replace(/^data:\s*/, '').trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data.phase) {
              const phaseLabel = data.label || data.phase;
              setPhase(phaseLabel);
              const est = PHASE_DURATIONS[phaseLabel];
              if (est) setProgress(prev => Math.min(prev + (100 / Object.keys(PHASE_DURATIONS).length), 90));
            }
            if (data.content) {
              setResponse(prev => prev + data.content);
              setProgress(prev => Math.min(prev + 0.5, 95));
            }
            if (data.error) { setResponse(prev => prev + '\n\n' + data.error); setStatus('error'); hadErrorRef.current = true; }
            if (data.done && !hadErrorRef.current) { setStatus('done'); setProgress(100); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
          } catch {}
        }
      }

      if (!hadErrorRef.current) {
        setStatus('done');
        setProgress(100);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      }
    } catch (err: unknown) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Failed to analyze media';
      setResponse(message);
      setStatus('error');
    }
  }, [cancel]);

  return {
    response,
    status,
    phase,
    fileName,
    fileType,
    progress,
    elapsed,
    isAnalyzing: status === 'reading' || status === 'uploading' || status === 'analyzing',
    analyze,
    cancel,
    reset,
  };
}

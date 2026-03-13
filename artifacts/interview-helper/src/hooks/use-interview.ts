import { useState, useRef, useCallback } from 'react';

export type InterviewMode = 'hint' | 'solution' | 'explain' | 'complexity';
export type SolverStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

export function useInterviewSolver() {
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<SolverStatus>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus('done');
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setResponse('');
    setStatus('idle');
  }, [cancel]);

  const solve = useCallback(async (question: string, language: string, mode: InterviewMode) => {
    if (!question.trim()) return;

    cancel();
    setResponse('');
    setStatus('thinking');
    
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/interview/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, language, mode }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        throw new Error(`Failed to start solver: ${res.status}`);
      }

      setStatus('streaming');
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('No readable stream available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data:')) {
            const jsonStr = line.replace(/^data:\s*/, '').trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(jsonStr);
              if (data.content) {
                setResponse(prev => prev + data.content);
              }
              if (data.done) {
                setStatus('done');
              }
            } catch (e) {
              // Silently ignore incomplete JSON chunks across boundaries
            }
          }
        }
      }
      
      // If loop finishes normally and we aren't in error state, ensure done
      setStatus(prev => prev === 'error' ? 'error' : 'done');
      
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Solver error:', e);
        setStatus('error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [cancel]);

  return { 
    response, 
    status, 
    solve, 
    cancel, 
    reset,
    isStreaming: status === 'thinking' || status === 'streaming'
  };
}

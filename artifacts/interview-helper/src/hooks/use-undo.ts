import { useCallback, useEffect, useRef } from 'react';

type UndoAction = () => void;

const undoStack: UndoAction[] = [];
const MAX_STACK = 50;

export function pushUndo(action: UndoAction) {
  undoStack.push(action);
  if (undoStack.length > MAX_STACK) undoStack.shift();
}

export function popUndo(): boolean {
  const action = undoStack.pop();
  if (action) {
    action();
    return true;
  }
  return false;
}

export function useUndoShortcut() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
        if (popUndo()) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function useUndoableState<T>(initial: T): [T, (value: T) => void, (value: T) => void] {
  const stateRef = useRef<T>(initial);
  const setStateRef = useRef<((v: T) => void) | null>(null);

  const setState = useCallback((value: T) => {
    if (setStateRef.current) setStateRef.current(value);
    stateRef.current = value;
  }, []);

  const setWithUndo = useCallback((value: T) => {
    const prev = stateRef.current;
    pushUndo(() => setState(prev));
    setState(value);
  }, [setState]);

  return [stateRef.current, setWithUndo, setState];
}

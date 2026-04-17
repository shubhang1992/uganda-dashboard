import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

let nextId = 0;

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  /* Clean up all timers on unmount */
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((type, message, duration = DEFAULT_DURATION) => {
    const id = ++nextId;

    setToasts((prev) => {
      /* If we're at the max, drop the oldest to make room */
      const trimmed = prev.length >= MAX_VISIBLE ? prev.slice(1) : prev;
      return [...trimmed, { id, type, message, duration }];
    });

    /* Schedule auto-dismiss */
    const timer = setTimeout(() => {
      removeToast(id);
    }, duration);

    timers.current.set(id, timer);

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

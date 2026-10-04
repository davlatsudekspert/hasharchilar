// Toast xabarlar: `useToast()(matn, 'success' | 'error' | 'info')`.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertIcon, CheckIcon } from './icons.jsx';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message, type = 'success') => {
      const id = nextId.current++;
      // Bir vaqtda ko'pi bilan 3 ta
      setToasts((list) => [...list.slice(-2), { id, message, type }]);
      setTimeout(() => dismiss(id), type === 'error' ? 4500 : 3200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="toast-wrap pointer-events-none fixed inset-x-0 z-[5000] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ring-1 ${
              t.type === 'error' ? 'bg-red-600 text-white ring-red-700' : 'bg-slate-900 text-white ring-slate-800'
            }`}
            onClick={() => dismiss(t.id)}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                t.type === 'error' ? 'bg-white/20' : 'bg-emerald-500'
              }`}
            >
              {t.type === 'error' ? <AlertIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

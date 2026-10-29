'use client';

/**
 * Live alerts: while a panel is open it checks for new notifications every 15 seconds. A new one plays a short chime, shows a card at the
 * bottom right of the screen and, if the person allowed it, a desktop notification (the one the operating system shows near the clock).
 * The page is refreshed so the bell and the lists are up to date. Nothing is stored except the id of the last notification seen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { api } from '@/lib/utils/api-client';

interface Row { id: number; title: string; message: string; action_url: string | null; is_read: 0 | 1 }
interface Card { id: number; title: string; message: string; url: string | null }

const SEEN_KEY = 'cos:last-notification';
const CHOICE_KEY = 'cos:alerts-choice';

function chime() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Context();
    [[880, 0], [1175, 0.16]].forEach(([frequency, offset]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.4);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.45);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch { /* a browser that blocks sound before a click: the card still shows */ }
}

export function NotificationAlerts() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [askDesktop, setAskDesktop] = useState(false);
  const seen = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => setCards((current) => current.filter((card) => card.id !== id)), []);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SEEN_KEY);
      seen.current = stored ? Number(stored) : null;
      const choice = window.localStorage.getItem(CHOICE_KEY);
      setAskDesktop('Notification' in window && Notification.permission === 'default' && choice !== 'no');
    } catch { /* storage blocked: alerts still work for this visit */ }

    let stopped = false;
    async function check() {
      if (stopped) return;
      const result = await api.get<Row[]>('/api/notifications?limit=10&unread_only=true');
      if (!result.ok || !Array.isArray(result.data)) return;
      const rows = result.data;
      const newest = rows.reduce((max, row) => Math.max(max, row.id), 0);
      if (seen.current === null) {
        // First look: remember where things stand, so old unread items do not all ring at once.
        seen.current = newest;
        try { window.sessionStorage.setItem(SEEN_KEY, String(newest)); } catch { /* ignore */ }
        return;
      }
      const fresh = rows.filter((row) => row.id > (seen.current ?? 0)).sort((a, b) => a.id - b.id);
      if (!fresh.length) return;
      seen.current = newest;
      try { window.sessionStorage.setItem(SEEN_KEY, String(newest)); } catch { /* ignore */ }
      chime();
      fresh.slice(-3).forEach((row) => {
        setCards((current) => [...current, { id: row.id, title: row.title, message: row.message, url: row.action_url }].slice(-4));
        window.setTimeout(() => dismiss(row.id), 12000);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const alert = new Notification(row.title, { body: row.message, tag: `cos-${row.id}` });
            alert.onclick = () => { window.focus(); if (row.action_url) window.location.href = row.action_url; alert.close(); };
          } catch { /* some browsers only allow this from a service worker */ }
        }
      });
      router.refresh();
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [dismiss, router]);

  async function enableDesktop() {
    try {
      const answer = await Notification.requestPermission();
      window.localStorage.setItem(CHOICE_KEY, answer === 'granted' ? 'yes' : 'no');
      chime();
    } catch { /* ignore */ }
    setAskDesktop(false);
  }

  function later() {
    try { window.localStorage.setItem(CHOICE_KEY, 'no'); } catch { /* ignore */ }
    setAskDesktop(false);
  }

  if (!mounted) return null;
  // Drawn on the page itself, not inside the sticky header, so it sits above dialogs too.
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {askDesktop && (
        <div className="pointer-events-auto rounded-xl border border-line bg-white p-4 shadow-lg">
          <p className="text-sm font-semibold text-ink">Get alerts with a sound</p>
          <p className="mt-1 text-xs text-ink-muted">Allow desktop alerts so a new message or answer pops up at the bottom right of your screen, even when this tab is in the background.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={later} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted">Not now</button>
            <button type="button" onClick={() => void enableDesktop()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Allow</button>
          </div>
        </div>
      )}
      {cards.map((card) => (
        <div key={card.id} role="status" className="pointer-events-auto rounded-xl border border-line border-l-4 border-l-brand-600 bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="mt-0.5 line-clamp-3 text-xs text-ink-soft">{card.message}</p>
            </div>
            <button type="button" onClick={() => dismiss(card.id)} aria-label="Dismiss" className="text-ink-muted hover:text-ink">×</button>
          </div>
          {card.url && <a href={card.url} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">Open</a>}
        </div>
      ))}
    </div>,
    document.body
  );
}

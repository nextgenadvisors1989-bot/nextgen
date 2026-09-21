"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, MailCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

const typeStyle: Record<string, string> = {
  info: "bg-blue-100 text-blue-700 border-blue-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  error: "bg-red-100 text-red-700 border-red-200",
};

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load notifications");
      setItems(json.data.notifications || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function markRead(id: number) {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    }
  }

  async function markAllRead() {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Inbox</p>
            <p className="text-xs text-slate-500">{items.filter((n) => !n.isRead).length} unread notifications</p>
          </div>
        </div>
        <button
          onClick={markAllRead}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Loading notifications...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <MailCheck className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-slate-700">No notifications yet</p>
          <p className="mt-1 text-sm text-slate-500">You’re all caught up for the moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-2xl border bg-white p-4 shadow-sm transition",
                item.isRead ? "border-slate-200" : "border-blue-200 ring-1 ring-blue-100"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", typeStyle[item.type] || typeStyle.info)}>
                    {item.type}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      {!item.isRead && <Sparkles className="h-3.5 w-3.5 text-blue-500" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {!item.isRead && (
                  <button
                    onClick={() => markRead(item.id)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";

interface Notification {
  id: number; title: string; message: string; type: string | null;
  isRead: boolean; link: string | null; createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-orange-100 text-orange-700",
  error: "bg-red-100 text-red-700",
};

export function NotificationsPageContent() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?pageSize=50");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.notifications);
      setUnreadCount(json.data.unreadCount);
    } catch (err) {
      toast.error("Failed to load notifications", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function openNotification(n: Notification) {
    if (!n.isRead) {
      try {
        await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
        setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, isRead: true } : r)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // non-critical
      }
    }
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      toast.error("Failed to mark all as read", err instanceof Error ? err.message : undefined);
    } finally {
      setMarkingAll(false);
    }
  }

  if (loading) return <LoadingState message="Loading notifications..." />;

  return (
    <PageTemplate title="Notifications" subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"} icon={Bell}>
      {rows.length > 0 && unreadCount > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={markAllRead} disabled={markingAll} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline disabled:opacity-50">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={Bell} title="No notifications yet" description="Updates about approvals, submissions and due dates will show up here." />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {rows.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotification(n)}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition ${!n.isRead ? "bg-blue-50/40" : ""}`}
            >
              {!n.isRead ? (
                <Circle className="w-2 h-2 mt-1.5 fill-blue-600 text-blue-600 flex-shrink-0" />
              ) : (
                <span className="w-2 h-2 mt-1.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm ${!n.isRead ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{n.title}</p>
                  {n.type && n.type !== "info" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-medium ${TYPE_COLORS[n.type] || TYPE_COLORS.info}`}>{n.type}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </PageTemplate>
  );
}

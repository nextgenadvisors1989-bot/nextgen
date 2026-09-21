import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "₹0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function generateId(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    approved: "bg-green-100 text-green-800",
    verified: "bg-green-100 text-green-800",
    completed: "bg-green-100 text-green-800",
    paid: "bg-green-100 text-green-800",
    locked: "bg-blue-100 text-blue-800",
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-blue-100 text-blue-800",
    pending: "bg-yellow-100 text-yellow-800",
    pending_documents: "bg-yellow-100 text-yellow-800",
    pending_verification: "bg-yellow-100 text-yellow-800",
    pending_activation: "bg-yellow-100 text-yellow-800",
    draft: "bg-gray-100 text-gray-800",
    inactive: "bg-gray-100 text-gray-800",
    rejected: "bg-red-100 text-red-800",
    suspended: "bg-red-100 text-red-800",
    expired: "bg-orange-100 text-orange-800",
    revision_requested: "bg-orange-100 text-orange-800",
    calculated: "bg-purple-100 text-purple-800",
    assessed: "bg-purple-100 text-purple-800",
    documents_verified: "bg-teal-100 text-teal-800",
    open: "bg-red-100 text-red-800",
    closed: "bg-gray-100 text-gray-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return map[status] || "bg-gray-100 text-gray-800";
}

export function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function apiResponse<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function apiError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

export function getPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function getMonthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-IN", { month: "long" });
}

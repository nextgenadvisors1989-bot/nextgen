import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "blue" | "green" | "purple" | "orange" | "teal" | "red" | "navy";
  trend?: { value: number; label: string };
}

const colorMap = {
  blue: { bg: "bg-blue-50", icon: "bg-blue-100 text-blue-700", text: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "bg-green-100 text-green-700", text: "text-green-600" },
  purple: { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-700", text: "text-purple-600" },
  orange: { bg: "bg-orange-50", icon: "bg-orange-100 text-orange-700", text: "text-orange-600" },
  teal: { bg: "bg-teal-50", icon: "bg-teal-100 text-teal-700", text: "text-teal-600" },
  red: { bg: "bg-red-50", icon: "bg-red-100 text-red-700", text: "text-red-600" },
  navy: { bg: "bg-slate-50", icon: "bg-slate-100 text-slate-700", text: "text-slate-600" },
};

export function StatCard({ title, value, subtitle, icon: Icon, color = "blue", trend }: StatCardProps) {
  const colors = colorMap[color];
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", colors.bg)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs mt-1 font-medium", trend.value >= 0 ? "text-green-600" : "text-red-600")}>
              {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", colors.icon)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

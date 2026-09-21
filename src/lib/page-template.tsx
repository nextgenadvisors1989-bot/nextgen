import { type LucideIcon } from "lucide-react";

interface PageTemplateProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconBg?: string;
  children: React.ReactNode;
}

export function PageTemplate({ title, subtitle, icon: Icon, iconBg = "bg-blue-700", children }: PageTemplateProps) {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

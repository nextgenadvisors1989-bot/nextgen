import clsx from 'clsx';
import { initials } from '@/lib/utils/formatting';

export function Avatar({ name, src, size = 32, className, rounded = 'full' }: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  rounded?: 'full' | 'lg';
}) {
  const dimension = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? 'User'} style={dimension} className={clsx('object-cover', rounded === 'full' ? 'rounded-full' : 'rounded-lg', className)} />;
  }
  const palette = ['bg-brand-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-600'];
  const index = (name ?? '?').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % palette.length;
  return (
    <span
      style={{ ...dimension, fontSize: Math.max(size * 0.36, 11) }}
      className={clsx('inline-flex shrink-0 items-center justify-center font-semibold text-white', palette[index], rounded === 'full' ? 'rounded-full' : 'rounded-lg', className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarGroup({ names, max = 4, size = 28 }: { names: string[]; max?: number; size?: number }) {
  const visible = names.slice(0, max);
  const rest = names.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((name, index) => (
        <span key={`${name}-${index}`} className="-ml-2 rounded-full ring-2 ring-white first:ml-0">
          <Avatar name={name} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-2 inline-flex items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600 ring-2 ring-white" style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'elevation-1 relative overflow-hidden rounded-lg bg-gray-100',
        'animate-pulse',
        className,
      )}
      {...props}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-70 -translate-x-full animate-[skeleton-shimmer_1.2s_infinite]" />
    </div>
  );
}

export { Skeleton };

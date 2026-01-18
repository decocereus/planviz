/**
 * Skeleton loading component
 */

import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      aria-hidden="true"
    />
  );
}

/** Skeleton for a plan node card */
export function NodeSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4 border rounded-lg">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** Skeleton for the canvas area */
export function CanvasSkeleton() {
  return (
    <div className="w-full h-full flex flex-col gap-4 p-8" role="status" aria-label="Loading canvas">
      <div className="flex gap-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-12 w-48" />
      </div>
      <div className="flex gap-8">
        <NodeSkeleton />
        <NodeSkeleton />
      </div>
      <div className="flex gap-8 ml-8">
        <NodeSkeleton />
        <NodeSkeleton />
        <NodeSkeleton />
      </div>
      <span className="sr-only">Loading plan visualization...</span>
    </div>
  );
}

/** Skeleton for the chat panel */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading chat">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="h-16 w-2/3 ml-auto" />
      <Skeleton className="h-16 w-3/4" />
      <span className="sr-only">Loading chat...</span>
    </div>
  );
}

/** Skeleton for the welcome screen */
export function WelcomeSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <span className="sr-only">Loading application...</span>
    </div>
  );
}

export default Skeleton;

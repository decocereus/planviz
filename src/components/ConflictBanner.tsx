/**
 * ConflictBanner - Shows when external file changes are detected
 *
 * Offers options to reload from disk or dismiss the notification.
 */

import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';

export interface ConflictBannerProps {
  /** Type of file that changed */
  changeType: 'plan' | 'layout';
  /** Called when user clicks reload */
  onReload: () => void;
  /** Called when user dismisses the banner */
  onDismiss: () => void;
}

export function ConflictBanner({
  changeType,
  onReload,
  onDismiss,
}: ConflictBannerProps) {
  const fileLabel = changeType === 'plan' ? 'plan.md' : 'layout file';

  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            The <strong>{fileLabel}</strong> was modified externally. Reload to see the latest changes?
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            className="h-7 gap-1.5 border-amber-300 bg-white hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-7 w-7 p-0 hover:bg-amber-100"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConflictBanner;

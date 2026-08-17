import darkAsset from "@/assets/flow-logo-dark.png.asset.json";
import lightAsset from "@/assets/flow-logo-light.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * The Flow wordmark. Both artworks ship; CSS picks the right one per theme so
 * there is no hydration flash and no JS involved.
 */
export function FlowLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={lightAsset.url}
        alt="Flow"
        className="h-full w-auto dark:hidden"
        draggable={false}
      />
      <img
        src={darkAsset.url}
        alt="Flow"
        aria-hidden
        className="hidden h-full w-auto dark:block"
        draggable={false}
      />
    </span>
  );
}

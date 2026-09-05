import { APP_VERSION, COMMIT_SHA } from "@/lib/version";

/** Small, unobtrusive version marker shown on every page (fixed, bottom-right). */
export function VersionBadge() {
  const label = COMMIT_SHA ? `v${APP_VERSION} · ${COMMIT_SHA}` : `v${APP_VERSION}`;
  return (
    <div
      title={`Next-Gen CRM ${label}`}
      style={{
        position: "fixed",
        right: 10,
        bottom: 8,
        fontSize: 11,
        color: "var(--muted)",
        opacity: 0.7,
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 50,
      }}
    >
      {label}
    </div>
  );
}

/**
 * CityOS packaging and integration metadata. Document persistence, permissions,
 * tenant context, revisions, and publication remain owned by the CityOS CMS.
 */
export const CITYOS_PUCK_PACKAGE = Object.freeze({
  packageName: "@cityos-core/puck",
  upstreamVersion: "0.23.0",
  forkRevision: "e006f18f9b9f613d0dbf11cfad8325552bf9fd56",
  nativeDataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
} as const);

export interface CityOSPuckEditorBoundary {
  readonly data: unknown;
  readonly onChange: (data: unknown) => void;
  readonly readOnly?: boolean;
  readonly direction?: "rtl" | "ltr";
}

// Registration owns its versioned runtime and type exports. The public entry
// must not maintain a competing symbol list or reference nonexistent adapters.
export * from "./cityos-registration";

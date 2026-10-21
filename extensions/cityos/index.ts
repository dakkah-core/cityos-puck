declare const __CITYOS_PUCK_BUILD__:
  { sourceSha: string; sourceDigest: string; dirty: boolean } | undefined;

const build =
  typeof __CITYOS_PUCK_BUILD__ === "undefined"
    ? undefined
    : __CITYOS_PUCK_BUILD__;

/** Package identity is observational; the CMS still owns persistence and authority. */
export const CITYOS_PUCK_PACKAGE = Object.freeze({
  packageName: "@cityos-core/puck",
  upstreamVersion: "0.23.0",
  forkRevision: build?.sourceSha ?? "source-unassembled",
  sourceDigest: build?.sourceDigest ?? null,
  dirty: build?.dirty ?? null,
  nativeDataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
} as const);

export interface CityOSPuckEditorBoundary {
  readonly data: unknown;
  readonly onChange: (data: unknown) => void;
  readonly readOnly?: boolean;
  readonly direction?: "rtl" | "ltr";
}

export * from "./cityos-registration";

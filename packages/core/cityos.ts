/**
 * CityOS packaging and integration metadata. Document persistence, permissions,
 * tenant context, revisions, and publication remain owned by the CityOS CMS.
 */
export const CITYOS_PUCK_PACKAGE = Object.freeze({
  packageName: "@cityos-core/puck",
  upstreamVersion: "0.23.0",
  forkRevision: "449f42df3abd2193ad3e740287dc0bcf044b2bfb",
  nativeDataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
} as const);

export interface CityOSPuckEditorBoundary {
  readonly data: unknown;
  readonly onChange: (data: unknown) => void;
  readonly readOnly?: boolean;
  readonly direction?: "rtl" | "ltr";
}

export {
  CITYOS_PUCK_REGISTRATION_VERSION,
  CITYOS_PUCK_REGISTRATION_PROFILE,
  parseCityOSPuckRegistration,
  digestCityOSPuckRegistration,
  bindCityOSPuckRegistration,
} from "./cityos-registration";
export type {
  CityOSPuckField,
  CityOSPuckRendererRef,
  CityOSPuckRegistrationEntry,
  CityOSPuckRegistrationManifest,
  CityOSPuckInstalledRenderer,
  CityOSPuckRendererResolver,
} from "./cityos-registration";

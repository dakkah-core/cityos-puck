import {
  CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION,
  CITYOS_PUCK_REGISTRATION_PROFILE,
  type CityOSPuckField,
  type CityOSPuckRegistrationManifest,
} from "../cityos-registration";

export const fixtureDigest = "sha256:" + "a".repeat(64);

export function fixtureFields(): Record<string, CityOSPuckField> {
  return {
    profile: {
      type: "object",
      label: "Profile / الملف",
      objectFields: {
        name: { type: "text", label: "Display name" },
        id: { type: "text", label: "Business ID" },
      },
    },
    rows: {
      type: "array",
      label: "Rows",
      min: 0,
      max: 2,
      arrayFields: {
        value: { type: "textarea", label: "Value" },
      },
    },
    enabled: {
      type: "radio",
      label: "Enabled",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  };
}

export function structuredRegistration(
  fields = fixtureFields(),
  type = "GeneratedProfile"
): CityOSPuckRegistrationManifest {
  return {
    schemaVersion: CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION,
    dataProfile: CITYOS_PUCK_REGISTRATION_PROFILE,
    source: {
      ownerId: "core.cms",
      registryRevision: "test-structured-1",
      definitionDigest: fixtureDigest,
    },
    components: [
      {
        type,
        label: "Generated profile",
        renderer: {
          key: "test.profile",
          version: "1",
          digest: fixtureDigest,
        },
        fields,
      },
    ],
  };
}

export interface FeatureFlags {
  multiTenant: boolean;
  billing: boolean;
  teamCollaboration: boolean;
  customBranding: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    multiTenant: false,
    billing: false,
    teamCollaboration: false,
    customBranding: false,
  };
}

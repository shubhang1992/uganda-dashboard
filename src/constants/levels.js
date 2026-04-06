// Hierarchy level constants — shared across services, hooks, and components.

export const LEVELS = {
  COUNTRY: 'country',
  REGION: 'region',
  DISTRICT: 'district',
  BRANCH: 'branch',
  AGENT: 'agent',
  SUBSCRIBER: 'subscriber',
};

export const LEVEL_ORDER = ['country', 'region', 'district', 'branch', 'agent', 'subscriber'];

export const CHILD_LEVEL = {
  country: 'region',
  region: 'district',
  district: 'branch',
  branch: 'agent',
  agent: 'subscriber',
};

export const PARENT_LEVEL = {
  region: 'country',
  district: 'region',
  branch: 'district',
  agent: 'branch',
  subscriber: 'agent',
};

// URL segment mapping
export const LEVEL_TO_SEGMENT = {
  region: 'regions',
  district: 'districts',
  branch: 'branches',
  agent: 'agents',
  subscriber: 'subscribers',
};

export const SEGMENT_TO_LEVEL = {
  regions: 'region',
  districts: 'district',
  branches: 'branch',
  agents: 'agent',
  subscribers: 'subscriber',
};

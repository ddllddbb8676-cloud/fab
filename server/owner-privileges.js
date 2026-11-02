export const OWNER_DISPLAY_NAME = 'FAB짱 세미';

// Server configuration is the only source of this privilege. Names and saved
// client/profile flags never establish ownership.
export function configuredOwnerId(value) {
  return typeof value === 'string' && /^visitor:[a-f0-9]{64}$/.test(value) ? value : '';
}
export function hasUnlimitedChips(id, ownerId) {
  const configured = configuredOwnerId(ownerId);
  return Boolean(configured && id === configured);
}

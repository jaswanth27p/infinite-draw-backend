export type Role = 'VIEWER' | 'EDITOR' | 'OWNER';

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

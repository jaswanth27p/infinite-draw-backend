export type Role = 'VIEWER' | 'COMMENTER' | 'EDITOR' | 'OWNER';

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  COMMENTER: 1,
  EDITOR: 2,
  OWNER: 3,
};

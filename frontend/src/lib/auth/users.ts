import { getUserPassword } from '../supabase/userCredentialsService';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'LIMITED';
  password?: string; // Only checked during login
}

export const CONFIGURED_USERS: AppUser[] = [
  {
    id: 'user-admin-rajiv',
    name: 'RAJIV PAL',
    email: 'admin@packwell.com',
    role: 'ADMIN',
    password: 'admin'
  },
  {
    id: 'user-admin-packwell',
    name: 'PACKWELL',
    email: 'packwell@packwell.com',
    role: 'ADMIN',
    password: 'packwell'
  },
  {
    id: 'user-limited-shubham',
    name: 'SHUBHAM',
    email: 'user@packwell.com',
    role: 'LIMITED',
    password: 'user'
  }
];

export const authenticate = async (email: string, password: string): Promise<Omit<AppUser, 'password'> | null> => {
  const user = CONFIGURED_USERS.find(u => u.email === email);
  if (!user) return null;

  // Check Supabase for overridden password
  const dbPassword = await getUserPassword(user.id);
  
  // If a DB password exists, it must match. Otherwise, fallback to hardcoded password.
  const activePassword = dbPassword !== null ? dbPassword : user.password;

  if (activePassword === password) {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  return null;
};

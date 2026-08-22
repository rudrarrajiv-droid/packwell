import { supabase } from './config';

export const getUserPassword = async (userId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('user_credentials')
      .select('password')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data?.password || null;
  } catch (err) {
    console.error('Error fetching password for user:', err);
    return null;
  }
};

export const updateUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  try {
    const now = new Date().toISOString();
    
    const { error } = await supabase
      .from('user_credentials')
      .upsert({ user_id: userId, password: newPassword, updated_at: now });

    if (error) throw error;
  } catch (err) {
    console.error('Error updating user password:', err);
    throw err;
  }
};

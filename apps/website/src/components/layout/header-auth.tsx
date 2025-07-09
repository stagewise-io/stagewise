import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthButton } from '@/components/auth/auth-button';

export async function HeaderAuth() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <AuthButton 
      user={user ? { email: user.email! } : null} 
    />
  );
}
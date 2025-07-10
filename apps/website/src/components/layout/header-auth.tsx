import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthButton } from '@/components/auth/auth-button';

export async function HeaderAuth() {
  const supabase = await createSupabaseServerClient();

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error('Error fetching user:', error);
      // Return fallback with no user when there's an error
      return <AuthButton user={null} />;
    }

    return <AuthButton user={user ? { email: user.email! } : null} />;
  } catch (error) {
    console.error('Unexpected error in HeaderAuth:', error);
    // Return fallback with no user when there's an unexpected error
    return <AuthButton user={null} />;
  }
}

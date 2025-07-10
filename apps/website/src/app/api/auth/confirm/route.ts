import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const origin = requestUrl.origin;

  if (!tokenHash) {
    return NextResponse.json({ error: 'Missing token hash' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });

    if (error) {
      console.error('OTP verification error:', error);
      return NextResponse.redirect(
        `${origin}/signin?error=verification_failed`,
      );
    }
  } catch (err) {
    console.error('Unexpected verification error:', err);
    return NextResponse.redirect(`${origin}/signin?error=server_error`);
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/`);
}

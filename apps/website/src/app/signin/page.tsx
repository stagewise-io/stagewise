'use client';

import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Input } from '@stagewise/ui/components/input';
import { Label } from '@stagewise/ui/components/label';
import { Alert, AlertDescription } from '@stagewise/ui/components/alert';
import { AnimatedBackground } from '@/components/landing/animated-background';
import { GradientButton } from '@/components/landing/gradient-button';
import Link from 'next/link';
import Image from 'next/image';
import StagewiseLogo from '../logo.svg';
import StagewiseLogoWhite from '../logo-white.svg';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createSupabaseClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: 'Check your email for the login link!',
      });
    }

    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white text-slate-900 dark:bg-black dark:text-white">
      <AnimatedBackground />

      {/* Logo in top left */}
      <Link href="/" className="absolute top-8 left-8 z-10">
        <Image
          src={StagewiseLogo}
          alt="Logo"
          height={32}
          className="dark:hidden"
        />
        <Image
          src={StagewiseLogoWhite}
          alt="Logo"
          height={32}
          className="hidden dark:block"
        />
      </Link>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-zinc-500/20 bg-white/90 p-8 shadow-[0_0_50px_rgba(128,90,213,0.3)] backdrop-blur-sm dark:border-indigo-800 dark:bg-zinc-900/90">
          {message?.type === 'success' ? (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2 font-bold text-3xl">Check your email!</h1>
                <p className="text-zinc-600 dark:text-zinc-400">
                  We've sent a login link to
                </p>
              </div>

              <div className="my-6 rounded-lg bg-zinc-100 p-4 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <strong>{email || 'your email'}</strong>
              </div>

              <div className="space-y-4">
                <p className="text-center text-sm text-zinc-500">
                  The link will expire in 1 hour
                </p>

                <GradientButton
                  onClick={() => {
                    setMessage(null);
                    setEmail('');
                  }}
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  Try a different email
                </GradientButton>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2 font-bold text-3xl">
                  Welcome to stagewise
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Sign in or create an account with your email.
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full"
                  />
                </div>

                {message?.type === 'error' && (
                  <Alert variant="destructive">
                    <AlertDescription>{message.text}</AlertDescription>
                  </Alert>
                )}

                <GradientButton
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Sign in'}
                </GradientButton>
              </form>

              <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                Any questions?{' '}
                <Link
                  href="https://discord.gg/gkdGsDYaKA"
                  target="_blank"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Join the Discord
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '../utils/supabase/client';

export default function ResetPassword() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/update-password');
      }
    });
  }, [supabase, router]);

  return <p>Verifying your reset link…</p>;
}

// src/pages/reset-password.tsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from "../../lib/supabaseClient";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase sends tokens in the URL hash fragment
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type'); // 'recovery' for password reset

    async function handle() {
      if (access_token && refresh_token) {
        try {
          await supabase.auth.setSession({ access_token, refresh_token });
          // For reset links, send them to your password update screen
          if (type === 'recovery') {
            navigate('/update-password', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        } catch {
          navigate('/login', { replace: true });
        }
      } else {
        // No tokens in the hash → send to login
        navigate('/login', { replace: true });
      }
    }

    handle();
  }, [location.hash, navigate]);

  return <p>Verifying your link…</p>;
}

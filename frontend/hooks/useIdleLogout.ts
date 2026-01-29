import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const useIdleLogout = (timeoutInMinutes: number) => {
  const router = useRouter();
  const timeoutMs = timeoutInMinutes * 60 * 1000;

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const logout = () => {
      localStorage.removeItem('token');
      router.push('/login');
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, timeoutMs);
    };

    // Events that count as "activity"
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('click', resetTimer);

    resetTimer(); // Start timer on mount

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('click', resetTimer);
      clearTimeout(timer);
    };
  }, [router, timeoutMs]);
};
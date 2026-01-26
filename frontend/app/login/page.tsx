"use client";
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setUser } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // In a real app, call your FastAPI backend here
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      setUser({ name: username });
      router.push('/');
    } else {
      alert("Invalid LDAP Credentials");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <form onSubmit={handleLogin} className="w-96 p-8 bg-slate-800 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold mb-6 text-center">CryptoLake Admin</h1>
        <input 
          type="text" placeholder="LDAP Username"
          className="w-full p-3 mb-4 rounded bg-slate-700 border-none text-white focus:ring-2 focus:ring-blue-500"
          onChange={e => setUsername(e.target.value)}
        />
        <input 
          type="password" placeholder="Password"
          className="w-full p-3 mb-6 rounded bg-slate-700 border-none text-white focus:ring-2 focus:ring-blue-500"
          onChange={e => setPassword(e.target.value)}
        />
        <button className="w-full py-3 bg-blue-600 rounded-lg font-bold hover:bg-blue-700 transition">
          Secure Login
        </button>
      </form>
    </div>
  );
}
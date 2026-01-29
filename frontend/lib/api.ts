const BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''; // Relative paths work because Nginx proxies /api


const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

export const ldapService = {
    login: async (username: string, password: string) => {
        const url = `${BASE_URL}/api/login`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) throw new Error('Login failed');
        return res.json();
    },
  // --- USER METHODS ---
getUsers: async (pageSize = 10, cookie = '', parentDn = '') => {
    const params = new URLSearchParams({ page_size: pageSize.toString() });
    if (cookie) params.append('cookie', cookie);
    if (parentDn) params.append('parent_dn', parentDn);

    const res = await fetch(`${BASE_URL}/api/users?${params.toString()}`, {
      headers: getAuthHeaders(), // Added Auth
    });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

    updateUser: async (userid: string, values: any) => {
        const url = `${BASE_URL}/api/users/${encodeURIComponent(userid)}`;
        const res = await fetch(url, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error('Login failed');
        return res.json()
    },

  createUser: async (username: string, userData: any) => {
    const res = await fetch(`${BASE_URL}/api/users?username=${username}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData),
    });
    return res.json();
  },

  deleteResource: async (dn: string) => {
    const res = await fetch(`${BASE_URL}/api/resource?dn=${encodeURIComponent(dn)}`, {
        headers: getAuthHeaders(),
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete resource');
    return res.json();
  },

  // --- GROUP METHODS ---
  getGroups: async () => {
    // Assuming your backend has /api/groups
    const res = await fetch(`${BASE_URL}/api/groups`,{
        headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch groups');
    return res.json();
  },

  createGroup: async (name: string, description: string) => {
    const res = await fetch(`${BASE_URL}/api/groups`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error('Failed to create group');
    return res.json();
  },

  deleteGroup: async (cn: string) => {
    const res = await fetch(`${BASE_URL}/api/groups/${encodeURIComponent(cn)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete group');
    return res.json();
  },
 
  // --- SEARCH METHOD ---
  searchLDAP: async (query: string) => {
    const res = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}`,{
        headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Search failed');
    return res.json();
  },

  getTree: async () => {
    const response = await fetch(`${BASE_URL}/api/tree`,{
        headers: getAuthHeaders(),
    });
    return response.json();
  }
};
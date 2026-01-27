const BASE_URL = ''; // Relative paths work because Nginx proxies /api

export const ldapService = {
  // --- USER METHODS ---
  getUsers: async (pageSize = 10, cookie = '') => {
    const url = `/api/users?page_size=${pageSize}${cookie ? `&cookie=${cookie}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  createUser: async (username: string, userData: any) => {
    const res = await fetch(`/api/users?username=${username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return res.json();
  },

  deleteResource: async (dn: string) => {
    const res = await fetch(`/api/resource?dn=${encodeURIComponent(dn)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete resource');
    return res.json();
  },

  // --- GROUP METHODS ---
  getGroups: async () => {
    // Assuming your backend has /api/groups
    const res = await fetch(`/api/groups`);
    if (!res.ok) throw new Error('Failed to fetch groups');
    return res.json();
  },

  // --- SEARCH METHOD ---
  searchLDAP: async (query: string) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    return res.json();
  }
};
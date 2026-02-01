const BASE_URL = process.env.NEXT_PUBLIC_API_URL || ""; // Relative paths work because Nginx proxies /api

const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export const ldapService = {
    login: async (username: string, password: string) => {
        const url = `${BASE_URL}/api/login`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) throw new Error("Login failed");
        return res.json();
    },
    // --- USER METHODS ---
    getUsers: async (pageSize = 10, cookie = "", parentDn = "") => {
        const params = new URLSearchParams({ page_size: pageSize.toString() });
        if (cookie) params.append("cookie", cookie);
        if (parentDn) params.append("parent_dn", parentDn);

        const res = await fetch(`${BASE_URL}/api/users?${params.toString()}`, {
            headers: getAuthHeaders(), // Added Auth
        });
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json();
    },

    updateUser: async (userid: string, values: any) => {
        const url = `${BASE_URL}/api/users/${encodeURIComponent(userid)}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers: getAuthHeaders(),
            body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error("Login failed");
        return res.json();
    },

    createUser: async (userData: any) => {
        const res = await fetch(`${BASE_URL}/api/users`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                username: userData.username,
                first_name: userData.first_name,
                last_name: userData.last_name,
                password: userData.password,
                mail: userData.mail,
                base_dn: userData.base_dn, // Passed from the selected tree node
                gid: userData.gid, // Optional GID
            }),
        });
        return res.json();
    },

    // lib/api.ts
    resetUserPassword: async (username: string, newPassword: string) => {
        const res = await fetch(`${BASE_URL}/api/users/${username}/password`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ new_password: newPassword }),
        });
        if (!res.ok) throw new Error("Failed to reset password");
        return res.json();
    },
    // --- DELETE USER METHOD ---
    deleteUser: async (uid: string) => {
        const url = `${BASE_URL}/api/users/${uid}`;
        const res = await fetch(url, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || `Failed to delete user ${uid}`);
        }

        return res.json();
    },

    // --- GROUP METHODS ---
    getGroups: async () => {
        // Assuming your backend has /api/groups
        const res = await fetch(`${BASE_URL}/api/groups`, {
            headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("Failed to fetch groups");
        return res.json();
    },

    // Add to your ldapService
    addUserToGroup: async (groupDn: string, userDn: string, username: string) => {
        const response = await fetch(`${BASE_URL}/api/groups/add-member`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ group_dn: groupDn, user_dn: userDn, username }),
        });
        return response.json();
    },

    createGroup: async (groupData: { name: string; description: string; group_type: "posix" | "non-posix" | "external"; gid?: string }) => {
        const res = await fetch(`${BASE_URL}/api/groups`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name: groupData.name,
                description: groupData.description,
                group_type: groupData.group_type,
                gid: groupData.gid ? parseInt(groupData.gid) : null,
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || "Failed to create group");
        }
        return res.json();
    },

    updateGroup: async (cn: string, data: { description?: string; gid?: number }) => {
        const res = await fetch(`${BASE_URL}/api/groups/${cn}/update`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update group");
        return res.json();
    },

    deleteGroup: async (cn: string) => {
        const res = await fetch(`${BASE_URL}/api/groups/${cn}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("Failed to delete group");
        return res.json();
    },

    // --- SEARCH METHOD ---
    searchLDAP: async (query: string) => {
        // Change from /api/search to /api/search/users
        const res = await fetch(`${BASE_URL}/api/search/users?q=${encodeURIComponent(query)}`, {
            headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("Search failed");
        return res.json();
    },

    getTree: async () => {
        const response = await fetch(`${BASE_URL}/api/tree`, {
            headers: getAuthHeaders(),
        });
        return response.json();
    },

    removeUserFromGroup: async (groupDn: string, userDn: string, username: string) => {
        const response = await fetch(`${BASE_URL}/api/groups/remove-member`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ group_dn: groupDn, user_dn: userDn, username }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to remove member");
        }
        return response.json();
    },

    getCurrentGroupMembers: async (groupCn: string) => {
        const response = await fetch(`${BASE_URL}/api/groups/${groupCn}/members`, {
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to get current group members");
        }
        return response.json();
    },
};

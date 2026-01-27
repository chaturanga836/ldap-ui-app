from http import server
import os
import base64
import ssl
import time
import jwt
from fastapi import FastAPI, HTTPException, Query, Body, Depends
from ldap3 import Server, Connection, ALL, SUBTREE, MODIFY_REPLACE, Tls
from typing import Optional, List, Dict
from fastapi.security import OAuth2PasswordBearer

app = FastAPI(title="LDAP Crypto Dashboard API")

# --- SECURITY CONFIG ---
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-crypto-key")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")
# Config from Environment
# LDAP_URL = os.getenv("LDAP_URL")
LDAP_HOST = os.getenv("LDAP_HOST", "localhost")
raw_port = os.getenv("LDAP_PORT", "389")
LDAP_PORT = int(raw_port) if raw_port.strip() else 389
LDAP_USE_SSL = os.getenv("LDAP_USE_SSL", "false").lower() == "true"

BASE_DN = os.getenv("BASE_DN")
ADMIN_DN = f"cn={os.getenv('ADMIN_USER')},{BASE_DN}"
ADMIN_PW = os.getenv("ADMIN_PW")

def get_conn():
    server = get_ldap_server()
    
    try:
        # We use the ADMIN_DN for all management operations
        return Connection(server, user=ADMIN_DN, password=ADMIN_PW, auto_bind=True)
    except Exception as e:
        print(f"LDAP Connection Error: {e}")
        raise HTTPException(status_code=500, detail="Internal LDAP Connection Error")

def get_ldap_server():
    """Configures the Server object with SSL/TLS if enabled."""
    if LDAP_USE_SSL:
        # validate=ssl.CERT_NONE allows self-signed certs often used in custom LDAP
        tls_config = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)
        return Server(LDAP_HOST, port=LDAP_PORT, use_ssl=True, tls=tls_config, get_info=ALL)
    else:
        return Server(LDAP_HOST, port=LDAP_PORT, use_ssl=False, get_info=ALL)
    
# --- USER APIS ---
search_attrs = ['uid', 'cn', 'mail', 'sn', 'displayName']

def create_access_token(username: str):
    payload = {
        "sub": username,
        "exp": time.time() + 3600  # 1 Hour expiry
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/login")
async def login(username: str = Body(...), password: str = Body(...)):
    """Authenticate via LDAP SSL and return a JWT."""
    server = get_ldap_server()
    user_dn = f"uid={username},ou=users,{BASE_DN}"
    
    try:
        # Attempt to bind with user credentials
        with Connection(server, user=user_dn, password=password, auto_bind=True) as conn:
            token = create_access_token(username)
            return {"access_token": token, "token_type": "bearer"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid LDAP Credentials")

# Example of a protected route
@app.get("/api/me")
async def get_me(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"username": payload.get("sub")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    
@app.get("/api/users")
async def list_users(page_size: int = Query(10, ge=1, le=1000), cookie: str = None):
    """List all users with pagination and explicit attributes."""
    decoded_cookie = base64.b64decode(cookie) if cookie else None
    
    # We define exactly what fields we want to show in our React table

    with get_conn() as conn:
        conn.search(
            search_base=BASE_DN,
            search_filter='(objectClass=person)',
            search_scope=SUBTREE,
            attributes=search_attrs,  # <--- CRITICAL: Tells LDAP what to return
            paged_size=page_size,
            paged_cookie=decoded_cookie
        )

        # We format the entries to make sure they are JSON serializable
        # LDAP often returns values as lists; we extract the first value for the UI
        results = []
        for e in conn.entries:
            results.append({
                "dn": e.entry_dn,
                "uid": e.uid.value if hasattr(e, 'uid') else "N/A",
                "cn": e.cn.value if hasattr(e, 'cn') else "N/A",
                "mail": e.mail.value if hasattr(e, 'mail') else "N/A",
                "status": "Active"
            })

        # Pagination Cookie Logic
        controls = conn.result.get('controls', {})
        paged_control = controls.get('1.2.840.113556.1.4.319', {})
        resp_cookie = paged_control.get('value', {}).get('cookie')
        new_cookie = base64.b64encode(resp_cookie).decode('utf-8') if resp_cookie else None

        return {"results": results, "next_cookie": new_cookie}

@app.get("/api/users/{username}")
async def get_user(username: str):
    """Fetch specific user details."""
    with get_conn() as conn:
        conn.search(BASE_DN, f'(&(objectClass=person)(uid={username}))', SUBTREE, attributes=['*'])
        if not conn.entries: raise HTTPException(status_code=404, detail="User not found")
        return conn.entries[0].entry_attributes_as_dict

@app.post("/api/users")
async def add_user(username: str, attributes: Dict):
    """Add a new user (e.g., inetOrgPerson)."""
    user_dn = f"uid={username},ou=users,{BASE_DN}"
    obj_class = ['top', 'person', 'organizationalPerson', 'inetOrgPerson']
    with get_conn() as conn:
        if not conn.add(user_dn, obj_class, attributes):
            raise HTTPException(status_code=400, detail=conn.result['description'])
        return {"message": f"User {username} created"}

@app.patch("/api/users/{username}")
async def edit_user(username: str, updates: Dict):
    """Modify user attributes."""
    user_dn = f"uid={username},ou=users,{BASE_DN}"
    changes = {k: [(MODIFY_REPLACE, [v])] for k, v in updates.items()}
    with get_conn() as conn:
        if not conn.modify(user_dn, changes):
            raise HTTPException(status_code=400, detail=conn.result['description'])
        return {"message": "User updated"}

# --- GROUP APIS ---

@app.get("/api/groups")
async def list_groups(page_size: int = Query(10, ge=1, le=1000), cookie: str = None):
    """List all groups with pagination."""
    decoded_cookie = base64.b64decode(cookie) if cookie else None
    with get_conn() as conn:
        conn.search(BASE_DN, '(objectClass=groupOfNames)', SUBTREE, paged_size=page_size, paged_cookie=decoded_cookie)
        return {"results": [e.entry_dn for e in conn.entries]}

@app.post("/api/groups")
async def add_group(group_name: str):
    """Create a new group."""
    group_dn = f"cn={group_name},ou=groups,{BASE_DN}"
    with get_conn() as conn:
        # groupOfNames requires at least one member (usually the admin)
        if not conn.add(group_dn, ['top', 'groupOfNames'], {'member': [ADMIN_DN]}):
            raise HTTPException(status_code=400, detail=conn.result['description'])
        return {"message": f"Group {group_name} created"}

# --- DISABLE / DELETE ---

@app.delete("/api/resource")
async def remove_resource(dn: str):
    """Deletion for either user or group based on DN."""
    with get_conn() as conn:
        if not conn.delete(dn):
            raise HTTPException(status_code=400, detail=conn.result['description'])
        return {"message": f"Entry {dn} deleted"}

@app.post("/api/users/{username}/disable")
async def disable_user(username: str):
    """Disable user (locking bind) by changing password to something invalid."""
    user_dn = f"uid={username},ou=users,{BASE_DN}"
    # In OpenLDAP, 'locking' is often done by prefixing the password with {LOCKED}
    with get_conn() as conn:
        conn.modify(user_dn, {'userPassword': [(MODIFY_REPLACE, ['{LOCKED}'])]})
        return {"message": "User disabled"}
    
# --- SEARCH APIS ---

@app.get("/api/search/users")
async def search_users(
    q: str = Query(..., description="Search by name, uid, or email"),
    page_size: int = Query(10, le=1000),
    cookie: str = None
):
    """Search users across multiple fields using an 'OR' filter."""
    decoded_cookie = base64.b64decode(cookie) if cookie else None
    
    # This filter looks for the string in uid OR common name OR email
    search_filter = f"(|(uid=*{q}*)(cn=*{q}*)(mail=*{q}*))"
    
    with get_conn() as conn:
        conn.search(
            search_base=BASE_DN,
            search_filter=f"(&(objectClass=person){search_filter})",
            search_scope=SUBTREE,
            attributes=['uid', 'cn', 'mail', 'displayName'],
            paged_size=page_size,
            paged_cookie=decoded_cookie
        )
        
        # Extract cookie for next page
        controls = conn.result.get('controls', {})
        paged_control = controls.get('1.2.840.113556.1.4.319', {})
        resp_cookie = paged_control.get('value', {}).get('cookie')
        new_cookie = base64.b64encode(resp_cookie).decode('utf-8') if resp_cookie else None

        return {
            "results": [e.entry_attributes_as_dict for e in conn.entries],
            "next_cookie": new_cookie
        }

@app.get("/api/search/groups")
async def search_groups(
    name: str = Query(..., description="Group name (cn)"),
    page_size: int = Query(10, le=1000),
    cookie: str = None
):
    """Find groups by name."""
    decoded_cookie = base64.b64decode(cookie) if cookie else None
    
    with get_conn() as conn:
        conn.search(
            search_base=BASE_DN,
            search_filter=f"(&(objectClass=groupOfNames)(cn=*{name}*))",
            search_scope=SUBTREE,
            paged_size=page_size,
            paged_cookie=decoded_cookie
        )
        
        # Cookie logic
        controls = conn.result.get('controls', {})
        paged_control = controls.get('1.2.840.113556.1.4.319', {})
        resp_cookie = paged_control.get('value', {}).get('cookie')
        new_cookie = base64.b64encode(resp_cookie).decode('utf-8') if resp_cookie else None

        return {
            "results": [{"dn": e.entry_dn, "cn": e.cn.value} for e in conn.entries],
            "next_cookie": new_cookie
        }
@app.get("/api/users/{username}/groups")
async def get_user_groups(username: str):
    """
    Find all groups a user belongs to. 
    Uses the 'memberOf' operational attribute if enabled, 
    otherwise searches groups for the user's DN.
    """
    user_dn = f"uid={username},ou=users,{BASE_DN}"
    with get_conn() as conn:
        # Strategy A: Check 'memberOf' on the user object (Fastest)
        conn.search(BASE_DN, f'(uid={username})', attributes=['memberOf'])
        if conn.entries and 'memberOf' in conn.entries[0]:
            return {"groups": conn.entries[0].memberOf.values}
        
        # Strategy B: Fallback - Search groups where user is a member
        conn.search(BASE_DN, f'(&(objectClass=groupOfNames)(member={user_dn}))', attributes=['cn'])
        return {"groups": [e.cn.value for e in conn.entries]}
    
@app.get("/api/groups/{group_name}")
async def get_group_details(group_name: str, page_size: int = 50, cookie: str = None):
    """Fetch group info and its members with pagination."""
    group_dn = f"cn={group_name},ou=groups,{BASE_DN}"
    decoded_cookie = base64.b64decode(cookie) if cookie else None
    
    with get_conn() as conn:
        # Fetch group attributes
        conn.search(group_dn, '(objectClass=*)', attributes=['*'])
        if not conn.entries: raise HTTPException(status_code=404, detail="Group not found")
        
        # Note: In massive groups, 'member' is a list that can be huge.
        # This is where pagination on the attribute level (Attr-Range) helps,
        # but for now, we'll return the standard attributes.
        return {
            "details": conn.entries[0].entry_attributes_as_dict,
            "dn": group_dn
        }
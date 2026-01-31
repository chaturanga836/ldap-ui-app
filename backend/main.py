from http import server
import os
import base64
import ssl
import time
import jwt
import uuid
from fastapi import FastAPI, HTTPException, Query, Body, Depends
from ldap3 import Server, Connection, ALL, BASE, SUBTREE, MODIFY_REPLACE, MODIFY_ADD, Tls
from typing import Dict
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, timezone

app = FastAPI(title="LDAP Crypto Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your frontend to talk to the backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

IS_CONFIGURED = all([BASE_DN, ADMIN_DN, ADMIN_PW])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def check_config():
    """Middleware-style check to prevent LDAP calls if config is missing."""
    if not IS_CONFIGURED:
        raise HTTPException(
            status_code=503, 
            detail={
                "error": "Configuration Required",
                "message": "BASE_DN, ADMIN_USER, or ADMIN_PW is missing in .env",
                "docs": "Please update your environment variables and restart the container."
            }
        )

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
search_attrs = [
    'uid',            # Login username (e.g., 'satoshi')
    'cn',             # Full Name (e.g., 'Satoshi Nakamoto')
    'mail',           # Email address
    'title',          # Job Title (e.g., 'Lead Cryptographer')
    'employeeType',   # Classification (e.g., 'Contractor', 'Admin')
    'displayName',    # Friendly UI name
    'description'     # Notes about the user
]

def create_access_token(username: str):
    payload = {
        "sub": username,
        "exp": time.time() + 3600  # 1 Hour expiry
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/api/login")
async def login(username: str = Body(...), password: str = Body(...)):
    """Authenticate via LDAP SSL and return a JWT."""
    server = get_ldap_server()
    
    # Try the most likely DN patterns
    # 1. Standard user path: uid=admin,ou=users,dc=crypto,dc=lake
    # 2. Root admin path: cn=admin,dc=crypto,dc=lake
    possible_dns = [
        f"uid={username},ou=users,{BASE_DN}",
        f"cn={username},{BASE_DN}"
    ]
    
    for user_dn in possible_dns:
        try:
            with Connection(server, user=user_dn, password=password, auto_bind=True) as conn:
                # If we get here, bind was successful
                token = create_access_token(data={"sub": username})
                return {"access_token": token, "token_type": "bearer"}
        except Exception:
            continue # Try the next DN pattern
            
    # If all patterns fail
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
                "title": e.title.value if hasattr(e, 'title') else "General Member", # New field
                "status": "Active"
            })

        # Pagination Cookie Logic
        resp_cookie = None
        controls = conn.result.get('controls', {})
        paged_control = controls.get('1.2.840.113556.1.4.319', {})
        raw_cookie = paged_control.get('value', {}).get('cookie')
        if raw_cookie:
            resp_cookie = base64.b64encode(raw_cookie).decode('utf-8')

        return {"results": results, "next_cookie": resp_cookie}

@app.get("/api/users/{username}")
async def get_user(username: str):
    """Fetch specific user details."""
    with get_conn() as conn:
        conn.search(BASE_DN, f'(&(objectClass=person)(uid={username}))', SUBTREE, attributes=['*'])
        if not conn.entries: raise HTTPException(status_code=404, detail="User not found")
        return conn.entries[0].entry_attributes_as_dict

@app.post("/api/users")
async def add_user(attributes: Dict):
    """Creates a user with an AUTO-GENERATED unique UID and mandatory SN attribute."""
    # 1. Generate unique ID (7 chars random)
    unique_id = f"u{uuid.uuid4().hex[:7]}"
    
    # 2. Determine target OU (from frontend or default)
    target_base = attributes.get('base_dn', f"ou=users,{BASE_DN}")
    user_dn = f"uid={unique_id},{target_base}"
    
    obj_class = ['top', 'person', 'organizationalPerson', 'inetOrgPerson']
    
    # --- BACKEND FIX FOR objectClassViolation ---
    # LDAP requires 'sn'. If not provided, we derive it from 'cn'
    if 'sn' not in attributes or not attributes['sn']:
        full_name = attributes.get('cn', 'New User')
        name_parts = full_name.strip().split()
        # Use the last name if available, otherwise use the full name as sn
        attributes['sn'] = name_parts[-1] if len(name_parts) > 1 else full_name

    # Ensure 'uid' is set to our generated unique_id
    attributes['uid'] = unique_id

    # Remove metadata from attributes before sending to LDAP
    if 'base_dn' in attributes: del attributes['base_dn']
    if 'password' in attributes:
        attributes['userPassword'] = attributes.pop('password')

    with get_conn() as conn:
        # We explicitly pass the attributes dict
        if not conn.add(user_dn, obj_class, attributes):
            # If it still fails, we want to know exactly why
            error_detail = conn.result.get('description', 'Unknown LDAP Error')
            raise HTTPException(status_code=400, detail=f"LDAP Error: {error_detail}")
        
        return {"message": f"User created with ID {unique_id}", "uid": unique_id, "dn": user_dn}
    
@app.patch("/api/users/{uid}")
async def update_user(uid: str, updates: Dict):
    """
    Search for the user by UID to get their full DN, then apply changes.
    """
    with get_conn() as conn:
        # 1. Find the user's DN
        conn.search(BASE_DN, f'(uid={uid})', SUBTREE)
        if not conn.entries:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_dn = conn.entries[0].entry_dn
        
        # 2. Format changes for LDAP
        # We filter out sensitive or immutable keys like 'uid' or 'dn'
        ldap_changes = {}
        for k, v in updates.items():
            if k not in ['dn', 'uid', 'objectClass'] and v:
                ldap_changes[k] = [(MODIFY_REPLACE, [str(v)])]

        if not conn.modify(user_dn, ldap_changes):
            raise HTTPException(status_code=400, detail=conn.result['description'])
        return {"message": "User updated successfully"}

# --- GROUP APIS ---

@app.get("/api/groups")
async def list_groups(page_size: int = Query(10, ge=1, le=1000), cookie: str = None):
    # Fix 1: Safer cookie decoding
    decoded_cookie = None
    if cookie and cookie != "null" and cookie != "undefined":
        try:
            decoded_cookie = base64.b64decode(cookie)
        except Exception:
            decoded_cookie = None
    
    search_filter = '(|(objectClass=groupOfNames)(objectClass=posixGroup))'
    attrs = ['cn', 'description', 'gidNumber', 'member', 'memberUid', 'objectClass']

    try:
        with get_conn() as conn:
            # Fix 2: Explicitly use search_scope=SUBTREE
            conn.search(
                BASE_DN, 
                search_filter, 
                search_scope=SUBTREE, # Changed from positional to keyword
                attributes=attrs,
                paged_size=page_size, 
                paged_cookie=decoded_cookie
            )
            
            results = []
            for e in conn.entries:
                # Fix 3: Safer attribute extraction
                members = e.member.values if hasattr(e, 'member') else []
                posix_members = e.memberUid.values if hasattr(e, 'memberUid') else []
                
                # Check for gidNumber safely
                gid = None
                if hasattr(e, 'gidNumber') and e.gidNumber.value:
                    try:
                        gid = int(e.gidNumber.value)
                    except (ValueError, TypeError):
                        gid = None

                results.append({
                    "dn": e.entry_dn,
                    "cn": str(e.cn.value) if hasattr(e, 'cn') else "Unknown",
                    "description": str(e.description.value) if hasattr(e, 'description') else "",
                    "gidNumber": gid,
                    "memberCount": len(set(list(members) + list(posix_members))),
                    "type": "Hybrid" if ('posixGroup' in e.objectClass.values and 'groupOfNames' in e.objectClass.values) else "Standard"
                })

            # Fix 4: Safer Pagination extraction
            resp_cookie = None
            controls = conn.result.get('controls', {})
            # Look for the paged results control OID
            paged_control = controls.get('1.2.840.113556.1.4.319', {}).get('value', {})
            
            # Support both library versions of cookie storage
            raw_cookie = paged_control.get('cookie') if isinstance(paged_control, dict) else None
            if raw_cookie:
                resp_cookie = base64.b64encode(raw_cookie).decode('utf-8')

            return {"results": results, "next_cookie": resp_cookie}
            
    except Exception as e:
        print(f"LIST GROUPS CRASH: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LDAP Error: {str(e)}") 
# 1. Make sure you have the import at the top of main.py

# 2. Update the search line in create_group
@app.post("/api/groups")
async def create_group(name: str = Body(..., embed=True), description: str = Body(None, embed=True)):
    parent_dn = f"ou=groups,{BASE_DN}"
    group_dn = f"cn={name},{parent_dn}"
    
    with get_conn() as conn:
        # FIX: Use the constant BASE, not the string 'BASE'
        conn.search(parent_dn, '(objectClass=*)', search_scope=BASE) 
        
        if not conn.entries:
            # Create the ou=groups if it doesn't exist
            conn.add(parent_dn, ['top', 'organizationalUnit'], {'ou': 'groups'})

        attributes = {
            'cn': name,
            'description': description or "Crypto Lake Group",
            'member': [ADMIN_DN] 
        }
        
        if not conn.add(group_dn, ['top', 'groupOfNames'], attributes):
            return {"status": "error", "detail": conn.result.get('description')}
            
        return {"status": "success", "dn": group_dn}
     

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

@app.delete("/api/groups/{cn}")
async def delete_group(cn: str):
    """Deletes a group entry from the ou=groups container."""
    # Construct the group DN
    group_dn = f"cn={cn},ou=groups,{BASE_DN}"
    
    with get_conn() as conn:
        # Check if it exists first to give a better error message
        if not conn.search(group_dn, '(objectClass=*)', scope=BASE):
            raise HTTPException(status_code=404, detail=f"Group '{cn}' not found.")
        
        # Perform the delete
        if not conn.delete(group_dn):
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to delete group: {conn.result['description']}"
            )
            
        return {"message": f"Group '{cn}' deleted successfully"}
        
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
        
@app.get("/api/tree")
def get_ldap_tree():
    try:
        with get_conn() as conn:
            # 1. Added 'top' to catch the root entry itself
            search_filter = '(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=organization)(objectClass=top)(objectClass=inetOrgPerson))'
            
            conn.search(
                search_base=BASE_DN, 
                search_filter=search_filter,
                search_scope='SUBTREE',
                attributes=['ou', 'dc', 'cn', 'objectClass']
            )
        
            flat_map = {}
            user_counts = {}

            for entry in conn.entries:
                dn = entry.entry_dn
                is_user = 'inetOrgPerson' in entry.objectClass
                
                # Check for 10 user limit
                if is_user:
                    parent_dn = dn.split(',', 1)[1] if ',' in dn else 'root'
                    user_counts[parent_dn] = user_counts.get(parent_dn, 0) + 1
                    if user_counts[parent_dn] > 10:
                        continue

                # Label Logic
                label = (getattr(entry, 'ou', None) or 
                         getattr(entry, 'dc', None) or 
                         getattr(entry, 'cn', None) or 
                         dn.split('=')[1].split(',')[0])

                flat_map[dn] = {
                    "title": str(label),
                    "key": dn,
                    "children": [],
                    "isLeaf": is_user,
                    "selectable": True
                }

            # 2. Build the hierarchy
            tree = []
            for dn, node in flat_map.items():
                parts = dn.split(',', 1)
                parent_dn = parts[1] if len(parts) > 1 else None
                
                # IMPORTANT: Only link to parent if parent is actually in our map
                if parent_dn and parent_dn in flat_map:
                    flat_map[parent_dn]["children"].append(node)
                else:
                    # If this is the highest level we found, it becomes a root
                    tree.append(node)
            
            return tree
    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # 1. Search for Folders AND People
            search_filter = '(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=inetOrgPerson))'
            
            conn.search(
                search_base=BASE_DN, 
                search_filter=search_filter,
                search_scope='SUBTREE',
                attributes=['ou', 'dc', 'cn', 'objectClass']
            )
        
            flat_map = {}
            # We'll use this to keep track of how many users we've added per OU
            user_counts_per_ou = {}

            for entry in conn.entries:
                dn = entry.entry_dn
                is_user = 'inetOrgPerson' in entry.objectClass
                
                # Determine Label
                if is_user:
                    label = entry.cn.value if hasattr(entry, 'cn') else dn.split('=')[1].split(',')[0]
                else:
                    label = entry.ou.value if hasattr(entry, 'ou') else (entry.dc.value if hasattr(entry, 'dc') else dn.split('=')[1].split(',')[0])

                # Logic for 10-user limit per folder
                parts = dn.split(',', 1)
                parent_dn = parts[1] if len(parts) > 1 else None
                
                if is_user:
                    user_counts_per_ou[parent_dn] = user_counts_per_ou.get(parent_dn, 0) + 1
                    if user_counts_per_ou[parent_dn] > 10:
                        continue # Skip after 10 users in this OU

                flat_map[dn] = {
                    "title": str(label),
                    "key": dn,
                    "children": [],
                    "isLeaf": is_user, # Users are leaves, OUs are folders
                    "selectable": True
                }

            # 2. Build the hierarchy
            tree = []
            for dn, node in flat_map.items():
                parts = dn.split(',', 1)
                parent_dn = parts[1] if len(parts) > 1 else None
                
                if parent_dn and parent_dn in flat_map:
                    flat_map[parent_dn]["children"].append(node)
                else:
                    tree.append(node)
            
            return tree
    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # We search for any structural object, regardless of depth
            search_filter = '(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=organization))'
            
            # Start search from BASE_DN (which is dynamic from your .env)
            conn.search(
                search_base=BASE_DN, 
                search_filter=search_filter,
                search_scope='SUBTREE',
                attributes=['ou', 'dc', 'cn']
            )
        
            # 1. Build a flat map of all found entries
            flat_map = {}
            for entry in conn.entries:
                dn = entry.entry_dn
                
                # Logic to pick the best label (OU > DC > CN)
                label = (getattr(entry, 'ou', None) or 
                         getattr(entry, 'dc', None) or 
                         getattr(entry, 'cn', None) or 
                         dn.split('=')[1].split(',')[0])
                
                flat_map[dn] = {
                    "title": str(label),
                    "key": dn,
                    "children": [],
                    "isLeaf": False
                }

            # 2. Build the nested structure dynamically
            tree = []
            for dn, node in flat_map.items():
                # Logic to find the immediate parent DN
                # Example: 'ou=users,dc=crypto,dc=lake' -> 'dc=crypto,dc=lake'
                parts = dn.split(',', 1)
                parent_dn = parts[1] if len(parts) > 1 else None
                
                if parent_dn and parent_dn in flat_map:
                    # If the parent exists in our results, attach to it
                    flat_map[parent_dn]["children"].append(node)
                else:
                    # If no parent found in the result set, it's a top-level branch
                    tree.append(node)
            
            return tree

    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # Focus only on the structure
            search_filter = '(&(objectClass=top)(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=organization)))'
            conn.search(BASE_DN, search_filter, search_scope='SUBTREE', attributes=['ou', 'dc'])
            
            # 1. Create a dictionary of all nodes
            nodes = {}
            for entry in conn.entries:
                dn = entry.entry_dn
                label = entry.ou.value if hasattr(entry, 'ou') else (entry.dc.value if hasattr(entry, 'dc') else dn.split(',')[0].split('=')[1])
                nodes[dn] = {"title": str(label), "key": dn, "children": [], "isLeaf": False}

            # 2. Build the hierarchy
            root_nodes = []
            for dn, node in nodes.items():
                # Find the parent DN (everything after the first comma)
                parts = dn.split(',', 1)
                parent_dn = parts[1] if len(parts) > 1 else None
                
                if parent_dn in nodes:
                    nodes[parent_dn]["children"].append(node)
                else:
                    # If it has no parent in our list, it's a top-level root
                    root_nodes.append(node)
            
            return root_nodes
    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # We only want structural objects, not people
            search_filter = '(&(objectClass=top)(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=organization)))'
            
            conn.search(
                search_base=BASE_DN, 
                search_filter=search_filter,
                search_scope='SUBTREE',
                attributes=['ou', 'dc']
            )
        
            tree_nodes = []
            for entry in conn.entries:
                # Determine title
                if hasattr(entry, 'ou') and entry.ou.value:
                    label = entry.ou.value
                elif hasattr(entry, 'dc') and entry.dc.value:
                    label = entry.dc.value
                else:
                    label = entry.entry_dn.split(',')[0].split('=')[1]

                tree_nodes.append({
                    "title": str(label),
                    "key": entry.entry_dn,
                    "isLeaf": False 
                })
            
            return tree_nodes
    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # 1. Use BASE_DN since we know it works for users
            search_base = BASE_DN 
            
            # 2. REMOVED 'container' to fix your error. 
            # Added 'top' and 'organization' which are standard in OpenLDAP.
            search_filter = '(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=organization)(objectClass=top))'
            
            conn.search(
                search_base=search_base, 
                search_filter=search_filter,
                search_scope='SUBTREE',
                attributes=['ou', 'dc', 'cn']
            )
        
            tree_nodes = []
            for entry in conn.entries:
                # 3. Dynamic Title Logic: Use OU if available, fallback to DC or CN
                if hasattr(entry, 'ou') and entry.ou.value:
                    label = entry.ou.value
                elif hasattr(entry, 'dc') and entry.dc.value:
                    label = entry.dc.value
                elif hasattr(entry, 'cn') and entry.cn.value:
                    label = entry.cn.value
                else:
                    # Fallback: take the first part of the DN (e.g., "ou=Users")
                    label = entry.entry_dn.split(',')[0].split('=')[1]

                tree_nodes.append({
                    "title": str(label),
                    "key": entry.entry_dn, # The full DN is the unique key
                    "isLeaf": False 
                })
            
            # Sort by title so the tree looks organized
            tree_nodes.sort(key=lambda x: x['title'])
            
            return tree_nodes
            
    except Exception as e:
        # This will help you see the exact error in your FastAPI logs
        print(f"LDAP Tree Error: {str(e)}")
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            # FIX: Change os.getenv("LDAP_SEARCH_BASE") to BASE_DN
            conn.search(
                search_base=BASE_DN, 
                search_filter='(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=container))',
                search_scope='SUBTREE',
                attributes=['ou', 'dc', 'cn']
            )
        
            tree_nodes = []
            for entry in conn.entries:
                if entry.entry_dn:
                    # Get the most specific part of the DN for the label
                    title = entry.entry_dn.split(',')[0] 
                    
                    tree_nodes.append({
                        "title": title,
                        "key": entry.entry_dn,
                        "isLeaf": False 
                    })
                
            return tree_nodes
    except Exception as e:
        return {"error": str(e)}
    try:
        with get_conn() as conn:
            conn.search(
                search_base=os.getenv("LDAP_SEARCH_BASE"), 
                search_filter='(|(objectClass=organizationalUnit)(objectClass=domain)(objectClass=container))',
                search_scope='SUBTREE',
                attributes=['ou', 'dc']
            )
        
            tree_nodes = []
            for entry in conn.entries:
                # FIX: Check if entry_dn is present and is a string
                if entry.entry_dn:
                    dn_parts = entry.entry_dn.split(',')
                    title = dn_parts[0] 
                    
                    tree_nodes.append({
                        "title": title,
                        "key": entry.entry_dn,
                        "isLeaf": False 
                    })
                
            return tree_nodes
    except Exception as e:
        # This will now catch the error and show it in your frontend if it still persists
        return {"error": str(e)}

@app.post("/api/groups/add-member")
async def add_user_to_group(
    group_dn: str = Body(..., embed=True),
    user_dn: str = Body(..., embed=True),
    username: str = Body(..., embed=True) # The short 'uid'
):
    try:
        with get_conn() as conn:
            # We perform two modifications in one go
            changes = {
                'member': [(MODIFY_ADD, [user_dn])],
                'memberUid': [(MODIFY_ADD, [username])]
            }
            
            if not conn.modify(group_dn, changes):
                # If it fails, it might be because the user is already a member
                return {"status": "error", "detail": conn.result.get('description')}
                
            return {"status": "success", "message": f"User added to {group_dn}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI for HTTP routes
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO Server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Combine them into a single application
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Dictionary to track who is currently online
# Format: {"User_A_UID": "random_socket_sid_123"}
active_users = {}


# --- HTTP ROUTE (FastAPI) ---
@app.post("/verify-login")
def verify_login():
    # Temporary bypass for the hackathon
    return {"status": "success", "message": "Login verification bypassed for now"}


# --- SOCKET.IO EVENTS (The Live Chat) ---

@sio.event
async def connect(sid, environ, auth):
    if auth and "uid" in auth:
        uid = auth["uid"]
        active_users[uid] = sid
        print(f"✅ User {uid} connected! (SID: {sid})")
        print(f"Currently online: {active_users}")
    else:
        print("❌ Connection rejected. No UID provided.")
        raise socketio.exceptions.ConnectionRefusedError('No UID provided')

@sio.event
async def disconnect(sid):
    for uid, saved_sid in list(active_users.items()):
        if saved_sid == sid:
            del active_users[uid]
            print(f"👋 User {uid} disconnected.")
            print(f"Currently online: {active_users}")
            break
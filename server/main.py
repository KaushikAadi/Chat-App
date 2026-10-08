import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, firestore

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

# Initialize Firebase Admin using the service account file
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

# Create the permanent database connection
db = firestore.client()

# --- HTTP ROUTE (FastAPI) ---
@app.post("/verify-login")
def verify_login():
    # Temporary bypass for the hackathon
    return {"status": "success", "message": "Login verification bypassed for now"}

@app.post("/register-user")
def register_user(data:dict):
    print(data.get("username"))

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

@sio.event
async def send_chat(sid, data):
    # 1. Extract the raw data
    sender_uid = data.get("sender_uid")
    receiver_uid = data.get("receiver_uid")
    text = data.get("text")
    
    # 2. Generate the universal chat_id
    uids = [sender_uid, receiver_uid]
    uids.sort()
    chat_id = f"{uids[0]}_{uids[1]}"

    # 3. Package it with the chat_id and timestamp
    message_payload = {
        "chat_id": chat_id,
        "sender_uid": sender_uid,
        "receiver_uid": receiver_uid,
        "text": text,
        "timestamp": firestore.SERVER_TIMESTAMP
    }

    # 4. Save it permanently to Firestore
    db.collection("Messages").add(message_payload)
    
    # 5. Instantly route it if the receiver is online
    if receiver_uid in active_users:
        receiver_sid = active_users[receiver_uid]
        await sio.emit("receive_chat", message_payload, to=receiver_sid)
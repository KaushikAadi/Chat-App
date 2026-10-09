import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from google.api_core.datetime_helpers import DatetimeWithNanoseconds
from datetime import datetime, timezone

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

@app.get("/chat-history/{chat_id}")

async def get_chat_history(chat_id: str):

    messages_ref = db.collection("Messages")

    

    # 1. Fetch the messages WITHOUT .order_by() to prevent the Firestore index crash

    query = messages_ref.where(filter=FieldFilter("chat_id", "==", chat_id)).get()

    

    results = []

    for doc in query:

        data = doc.to_dict()

        # Ensure timestamp exists before converting

        if "timestamp" in data and data["timestamp"] is not None:

            if hasattr(data["timestamp"], "isoformat"):

                data["timestamp"] = data["timestamp"].isoformat()

            results.append(data)

            

    # 2. Sort the list in Python memory by timestamp (oldest first)

    results.sort(key=lambda x: x.get("timestamp", ""))

    

    # 3. Return only the last 50 messages to keep the frontend fast

    return results[-50:]

@app.get("/inbox/{uid}")
async def get_inbox(uid: str):
    messages_ref = db.collection("Messages")
    
    # 1. Fetch messages where the user is either the sender or receiver
    sent = messages_ref.where(filter=FieldFilter("sender_uid", "==", uid)).get()
    received = messages_ref.where(filter=FieldFilter("receiver_uid", "==", uid)).get()
    
    # 2. Combine all messages into a single list
    all_msgs = [doc.to_dict() for doc in sent + received]
    
    # Filter out any messages missing a timestamp (happens if Firebase is still processing it)
    all_msgs = [m for m in all_msgs if m.get("timestamp") is not None]
    
    # Sort them by time, newest first
    all_msgs.sort(key=lambda x: x["timestamp"], reverse=True)
    
    # 3. Group by chat_id to keep only the absolute newest message per conversation
    inbox_dict = {}
    
    for msg in all_msgs:
        chat_id = msg["chat_id"]
        
        # If we haven't seen this chat_id yet, this message is the newest one
        if chat_id not in inbox_dict:
            
            # Figure out the UID of the person we are talking to
            other_uid = msg["receiver_uid"] if msg["sender_uid"] == uid else msg["sender_uid"]
            
            # Fetch that person's actual username from the Users collection
            user_doc = db.collection("Users").document(other_uid).get()
            other_username = user_doc.to_dict().get("username", "Unknown") if user_doc.exists else "Unknown"
            
            # Convert Firestore timestamp to a frontend-friendly string
            ts = msg["timestamp"]
            if hasattr(ts, "isoformat"):
                ts = ts.isoformat()
            
            # Save the formatted data
            inbox_dict[chat_id] = {
                "chat_id": chat_id,
                "other_uid": other_uid,
                "other_username": other_username,
                "last_message": msg.get("text", ""),
                "timestamp": ts
            }
            
    # 4. Return as a clean list for your frontend to map over
    return list(inbox_dict.values())

@app.get("/is-online/{uid}")
async def check_user_online(uid: str):
    # Check if the requested UID exists in your active_users dictionary
    is_online = uid in active_users
    
    return {
        "uid": uid, 
        "online": is_online
    }

@app.post("/verify-login")
def verify_login():
    # Temporary bypass for the hackathon
    return {"status": "success", "message": "Login verification bypassed for now"}

@app.post("/check_username")
async def check_username(data: dict):
    username = data.get("username")
    print(username)
    
    # 1. Search the "Users" collection
    users_ref = db.collection("Users")
    query = users_ref.where("username", "==", username).limit(1).get()
    
    # 2. Retgit add urn the result directly 
    # (Socket.IO automatically sends this dictionary back to the frontend's callback)
    if len(query) > 0:
        print(f"username exists: {True}")
        return {"exists": True, "message": "Username is already taken."}

    print(f"username exists: {False}")
    return {"exists": False, "message": "Username is available."}

@app.post("/register-user")
async def register_user(data: dict):
    uid = data.get("uid")
    username = data.get("username")
    
    # 1. Validate that the frontend sent both pieces of data
    if not uid or not username:
        return {"error": "Missing uid or username"}, 400
        
    # 2. Package the data with an official server timestamp
    user_data = {
        "uid": uid,
        "username": username,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    # 3. Save it to Firestore in the "Users" collection
    db.collection("Users").document(uid).set(user_data)
    
    # 4. Tell the frontend it worked
    print({"success": True, "message": f"User {username} registered successfully."})
    return {"success": True, "message": f"User {username} registered successfully."}

@app.get("/search-users")
async def search_users(q: str = ""):
    # 1. If the query is empty, save a database read and return an empty list
    if not q.strip():
        return []
    
    # 2. Search the "Users" collection
    users_ref = db.collection("Users")
    
    # 3. Firestore prefix search (finds anything starting with 'q')
    # The '\uf8ff' character is a very high unicode value, ensuring it matches 
    # anything that comes alphabetically after the query string.
    query = (
        users_ref.where(filter=FieldFilter("username", ">=", q))
        .where(filter=FieldFilter("username", "<=", q + "\uf8ff"))
        .limit(15)
        .get()
    )
    
    # 4. Convert Firestore documents to a list of dictionaries
    results = [doc.to_dict() for doc in query]
    
    # 5. Send back to the React frontend
    return results

# --- SOCKET.IO EVENTS (The Live Chat) ---

@sio.event
async def connect(sid, environ, auth):
    if auth and "uid" in auth:
        uid = auth["uid"]
        active_users[uid] = sid
        print(f"✅ User {uid} connected! (SID: {sid})")
        print(f"Currently online: {active_users}")
    else:
        print(" Connection rejected. No UID provided.")
        raise socketio.exceptions.ConnectionRefusedError('No UID provided')

@sio.event
async def disconnect(sid):
    for uid, saved_sid in list(active_users.items()):
        if saved_sid == sid:
            del active_users[uid]
            print(f" User {uid} disconnected.")
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

    # 3. Package it with the special Firestore timestamp
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
        
        # CREATE A COPY JUST FOR THE SOCKET (Using a real text timestamp)
        socket_payload = message_payload.copy()
        socket_payload["timestamp"] = datetime.now(timezone.utc).isoformat()
        
        await sio.emit("receive_chat", socket_payload, to=receiver_sid)


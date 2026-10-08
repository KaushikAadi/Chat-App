// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDZ5FcwcTHwTUoOxJ7pOjZ3U6LgvN1Odbw",
  authDomain: "chat-app-7e5c2.firebaseapp.com",
  projectId: "chat-app-7e5c2",
  storageBucket: "chat-app-7e5c2.firebasestorage.app",
  messagingSenderId: "433418314230",
  appId: "1:433418314230:web:7556fb62d1efec1e4de7d7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
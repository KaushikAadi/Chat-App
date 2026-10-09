// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAT12ZSefZM859OzCCsrGvAsJThMFdbHiQ",
  authDomain: "chat-app-302d1.firebaseapp.com",
  projectId: "chat-app-302d1",
  storageBucket: "chat-app-302d1.firebasestorage.app",
  messagingSenderId: "544528808304",
  appId: "1:544528808304:web:63969a97ba24eb846777b5",
  measurementId: "G-PHPZRX48TF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
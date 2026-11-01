



import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "ai-interview-69a4c.firebaseapp.com",
  projectId: "ai-interview-69a4c",
  storageBucket: "ai-interview-69a4c.firebasestorage.app",
  messagingSenderId: "336346193645",
  appId: "1:336346193645:web:d148fb5acce1c9d175b6e4",
  measurementId: "G-PT3GPPJQJ6"
};


let app, auth, provider;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider()
} catch (error) {
  console.warn("Firebase initialization failed, using mock auth", error);
  auth = { currentUser: { uid: 'mock-user-id', email: 'test@example.com', displayName: 'Test User' } };
  provider = {};
}

export { auth, provider }






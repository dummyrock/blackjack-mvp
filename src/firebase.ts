import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuBZFfVGlJg4FUg7GxNbFrQNsdf_WooI0",
  authDomain: "blackjack-33727.firebaseapp.com",
  projectId: "blackjack-33727",
  storageBucket: "blackjack-33727.firebasestorage.app",
  messagingSenderId: "495225263058",
  appId: "1:495225263058:web:a13043801faf993462ae0b"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCWcStIIlHtaiB94JVS4toazm206qNy42M",
  authDomain: "ajasso-controlcortes.firebaseapp.com",
  projectId: "ajasso-controlcortes",
  storageBucket: "ajasso-controlcortes.firebasestorage.app",
  messagingSenderId: "465548669115",
  appId: "1:465548669115:web:0ff19d277c37097faeb99e",
};

export const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);  
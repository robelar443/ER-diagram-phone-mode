// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCNgrKvpF-q7Ark8srZh3cGmmUfAwvEgYo",
  authDomain: "erdiagram-909ae.firebaseapp.com",
  projectId: "erdiagram-909ae",
  storageBucket: "erdiagram-909ae.firebasestorage.app",
  messagingSenderId: "995834024523",
  appId: "1:995834024523:web:3067c0547207f48945f3ce",
  measurementId: "G-LXEJ01PPX6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);

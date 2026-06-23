import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBCkz4u9dor-NzTH7sUzxxu_982o29Qkkk",
  authDomain: "erdiagramwithphonemode.firebaseapp.com",
  projectId: "erdiagramwithphonemode",
  storageBucket: "erdiagramwithphonemode.firebasestorage.app",
  messagingSenderId: "582035261437",
  appId: "1:582035261437:web:d8c06590d4478b35a7fb94",
  measurementId: "G-5SS2KFR03J"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);

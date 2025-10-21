// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDz-rjW6Z0M53EIy-f-oQ0u4UBnmqS1eGc",
  authDomain: "mini-forum-ec815.firebaseapp.com",
  projectId: "mini-forum-ec815",
  storageBucket: "mini-forum-ec815.firebasestorage.app",
  messagingSenderId: "757219389665",
  appId: "1:757219389665:web:103e7561ad97ef7c8987a0",
  measurementId: "G-15W1HBQYQ6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDFRFg84oNLGeVsV0BcXr-ZG5e3LfIWl94",
  authDomain: "project-management-syste-7d13a.firebaseapp.com",
  projectId: "project-management-syste-7d13a",
  storageBucket: "project-management-syste-7d13a.firebasestorage.app",
  messagingSenderId: "508275029212",
  appId: "1:508275029212:web:da8a59e245d714d05a3019"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
export { ref, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB4FmEp2Rjd6BysFXhA9Og9f5zI-GukDkA",
  authDomain: "iot-buoy.firebaseapp.com",
  databaseURL: "https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-buoy",
  storageBucket: "iot-buoy.firebasestorage.app",
  messagingSenderId: "717494781038",
  appId: "1:717494781038:web:c00ec5a0bb07a30d24127f",
  measurementId: "G-06Z580S217"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };

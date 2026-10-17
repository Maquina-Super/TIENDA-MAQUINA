/* ============================================================
   CONFIGURACIÓN DE FIREBASE - MAQUINA
   ------------------------------------------------------------
   Proyecto: maquina-dea83
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDuhlMyxSK2F1gNpi_QHMDgt5r3Tc4AY00",
  authDomain: "maquina-dea83.firebaseapp.com",
  projectId: "maquina-dea83",
  storageBucket: "maquina-dea83.firebasestorage.app",
  messagingSenderId: "1018607770922",
  appId: "1:1018607770922:web:0717a5933c69b0979fd253",
  measurementId: "G-6LW5N2EE8K",
};

firebase.initializeApp(firebaseConfig);

/* Referencias globales que usa el resto del sitio (store.js, admin.html) */
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();
// src/services/firestore.js
import { db } from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/* =========================
   GLOBAL COLLECTIONS REFERENCES
========================= */
// 🛑 CRÍTICO: Definimos la referencia globalmente
const usersCol = collection(db, 'users');
const barriosCol = collection(db, 'barrios');
const fruverCol = collection(db, 'fruverProducts');
const ordersCol = collection(db, 'orders');


/* =========================
   USERS (roles)
========================= */

export async function setUserDoc(uid, data) {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, data, { merge: true });
}

export function subscribeUserRole(uid, cb) {
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? snap.data().role || 'viewer' : 'viewer'),
    (err) => {
      console.error('subscribeUserRole error:', err.code, err.message);
      cb('viewer');
    }
  );
}

/**
 * Suscribe a todos los usuarios. Útil solo para administración.
 */
export function subscribeAllUsers(callback) {
  // Nota: Leer toda la colección. Ordenamos por el campo "nombre".
  const qy = query(usersCol, orderBy('nombre', 'asc'));

  return onSnapshot(
    qy,
    (snap) => {
      // Mapeamos los documentos, asegurando que el ID del documento sea 'id'
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('subscribeAllUsers error:', err.code, err.message);
      // En caso de error (ej. permisos), devolvemos un array vacío
      callback([]); 
    }
  );
}


/* =========================
   MENÚ (menú público + settings)
========================= */

export const menuDocRef = doc(db, 'menu', 'config');

export async function getMenuOnce() {
  const snap = await getDoc(menuDocRef);
  return snap.exists() ? snap.data() : null;
}

export async function saveMenu(menu) {
  await setDoc(menuDocRef, menu, { merge: true });
}

export function subscribeMenu(callback) {
  return onSnapshot(
    menuDocRef,
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => console.error('subscribeMenu error:', err.code, err.message)
  );
}

/* =========================
   BARRIOS (tarifas de domicilio)
========================= */

export function subscribeBarrios(callback) {
  const qy = query(barriosCol, orderBy('name', 'asc'));
  return onSnapshot(
    qy,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => console.error('subscribeBarrios error:', err.code, err.message)
  );
}

export async function addBarrio(data) {
  // data: { name, fee:number, active:boolean }
  const ref = await addDoc(barriosCol, {
    name: data.name || '',
    fee: Number(data.fee || 0),
    active: Boolean(data.active ?? true),
  });
  return ref.id;
}

export async function updateBarrio(id, patch) {
  await updateDoc(doc(db, 'barrios', id), patch);
}

export async function deleteBarrio(id) {
  await deleteDoc(doc(db, 'barrios', id));
}

/* =========================
   FRUVER (frutas/verduras)
========================= */

export function subscribeFruverProducts(callback) {
  const qy = query(fruverCol, orderBy('name', 'asc'));
  return onSnapshot(
    qy,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => console.error('subscribeFruverProducts error:', err.code, err.message)
  );
}

/* =========================
   ORDERS
========================= */

export async function addOrder(order) {
  // RECOMENDADO: usar serverTimestamp() para createdAt
  // Si prefieres tu ISO, déjalo. Aquí forzamos serverTimestamp para ordenado real.
  const ref = await addDoc(ordersCol, {
    ...order,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOrderStatus(id, status) {
  await updateDoc(doc(db, 'orders', id), { status });
}

export async function completeOrder(id) {
  await updateDoc(doc(db, 'orders', id), {
    status: 'Completado',
    completedAt: serverTimestamp(),
  });
}

/**
 * Pendientes: usamos 'in' (evita problemas de índices con '!=')
 */
export function subscribeOrdersPendientes(callback) {
  const qy = query(
    ordersCol,
    where('status', 'in', ['Pendiente', 'En camino']),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    qy,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('subscribeOrdersPendientes error:', err.code, err.message);
    }
  );
}

// Histórico (solo Completados), ordenado por completedAt desc
export function subscribeOrdersHistorico(callback) {
  const qy = query(
    ordersCol,
    where('status', '==', 'Completado'),
    orderBy('completedAt', 'desc')
  );
  return onSnapshot(
    qy,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => console.error('subscribeOrdersHistorico error:', err.code, err.message)
  );
}
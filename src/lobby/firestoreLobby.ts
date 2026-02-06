import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export type Seat = {
  seatIndex: number;
  playerId: string | null;
  name: string | null;
  isReady: boolean;
  isHost: boolean;
};

export type TableDoc = {
  createdAt: any;
  hostId: string;
  status: "lobby" | "playing";
  seats: Seat[];
};

function makeRoomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function emptySeats(hostId: string, hostName: string): Seat[] {
  return Array.from({ length: 7 }).map((_, i) => ({
    seatIndex: i,
    playerId: i === 0 ? hostId : null,
    name: i === 0 ? hostName : null,
    isReady: i === 0 ? true : false,
    isHost: i === 0,
  }));
}

export async function createTable(hostId: string, hostName: string) {
  const roomCode = makeRoomCode();
  const ref = doc(db, "tables", roomCode);

  const data: TableDoc = {
    createdAt: serverTimestamp(),
    hostId,
    status: "lobby",
    seats: emptySeats(hostId, hostName),
  };

  await setDoc(ref, data);
  return roomCode;
}

export function subscribeTable(roomCode: string, cb: (data: TableDoc | null) => void) {
  const ref = doc(db, "tables", roomCode);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? (snap.data() as TableDoc) : null);
  });
}

export async function joinTable(roomCode: string, playerId: string, name: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room not found");

  const table = snap.data() as TableDoc;

  // already seated?
  const already = table.seats.find((s) => s.playerId === playerId);
  if (already) return;

  const open = table.seats.find((s) => !s.playerId);
  if (!open) throw new Error("Table is full");

  const seats = table.seats.map((s) =>
    s.seatIndex === open.seatIndex
      ? { ...s, playerId, name, isReady: false, isHost: false }
      : s
  );

  await updateDoc(ref, { seats });
}

export async function leaveTable(roomCode: string, playerId: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const table = snap.data() as TableDoc;

  const seats = table.seats.map((s) =>
    s.playerId === playerId
      ? { ...s, playerId: null, name: null, isReady: false, isHost: false }
      : s
  );

  // If host leaves, we won't rehost yet (MVP). Later we can auto-assign a new host.
  await updateDoc(ref, { seats });
}

export async function toggleReady(roomCode: string, playerId: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const table = snap.data() as TableDoc;

  const seats = table.seats.map((s) =>
    s.playerId === playerId ? { ...s, isReady: !s.isReady } : s
  );

  await updateDoc(ref, { seats });
}

import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Card, PlayerHand } from "../engine/blackjack";

export type Seat = {
  seatIndex: number;
  playerId: string | null;
  name: string | null;
  isReady: boolean;
  isHost: boolean;
  bet?: number;

  // per-player advice toggle (basic strategy helper)
  adviceEnabled: boolean;
};

export type SharedGamePhase =
  | "betting"
  | "round_player"
  | "dealer"
  | "settled"
  | "intermission";

export type SharedGame = {
  phase: SharedGamePhase;

  shoe: Card[];
  dealer: Card[];

  // reveal dealer hole card once dealer plays / settled / intermission
  revealDealer?: boolean;

  players: {
    playerId: string;
    name: string;
    hands: PlayerHand[];
    currentHand: number;
    done: boolean;
  }[];

  actingPlayerIndex: number;

  // synced countdown window after a round ends
  intermissionEndsAt?: number | null;
};

export type TableDoc = {
  createdAt: any;
  hostId: string;
  status: "lobby" | "playing";
  seats: Seat[];
  game: SharedGame | null;
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
    bet: 0,
    adviceEnabled: false,
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
    game: null,
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

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const already = table.seats.find((s) => s.playerId === playerId);
  if (already) return;

  const open = table.seats.find((s) => !s.playerId);
  if (!open) throw new Error("Table is full");

  const hasHost = table.seats.some((s) => s.playerId && s.isHost);
  const shouldBecomeHost = !table.hostId || !hasHost;

  const seats: Seat[] = table.seats.map((s) =>
    s.seatIndex === open.seatIndex
      ? {
          ...s,
          playerId,
          name,
          isReady: false,
          isHost: shouldBecomeHost,
          bet: 0,
          adviceEnabled: false,
        }
      : s
  );

  const update: any = { seats };
  if (shouldBecomeHost) update.hostId = playerId;

  await updateDoc(ref, update);
}

export async function leaveTable(roomCode: string, playerId: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const leavingHost = table.hostId === playerId;
  const nextHostSeat = leavingHost
    ? table.seats.find((s) => s.playerId && s.playerId !== playerId)
    : null;
  const nextHostId = nextHostSeat?.playerId ?? null;

  const seats: Seat[] = table.seats.map((s) => {
    if (s.playerId === playerId) {
      return {
        ...s,
        playerId: null,
        name: null,
        isReady: false,
        isHost: false,
        bet: 0,
        adviceEnabled: false,
      };
    }

    if (leavingHost) {
      if (s.playerId && s.playerId === nextHostId) return { ...s, isHost: true };
      return { ...s, isHost: false };
    }

    return s;
  });

  const update: any = { seats };
  if (leavingHost) update.hostId = nextHostId ?? "";

  await updateDoc(ref, update);
}

export async function toggleReady(roomCode: string, playerId: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const seats: Seat[] = table.seats.map((s) =>
    s.playerId === playerId ? { ...s, isReady: !s.isReady } : s
  );

  await updateDoc(ref, { seats });
}

export async function setReady(roomCode: string, playerId: string, isReady: boolean) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const seats: Seat[] = table.seats.map((s) =>
    s.playerId === playerId ? { ...s, isReady } : s
  );

  await updateDoc(ref, { seats });
}

export async function setReadyAndBet(roomCode: string, playerId: string, isReady: boolean, bet: number) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const seats: Seat[] = table.seats.map((s) =>
    s.playerId === playerId ? { ...s, isReady, bet } : s
  );

  await updateDoc(ref, { seats });
}

/**
 * Toggle basic-strategy advice per player.
 * Permissions:
 *  - player can toggle themselves
 *  - host can toggle anyone
 */
export async function toggleAdvice(
  roomCode: string,
  targetPlayerId: string,
  enabled: boolean,
  actorPlayerId: string
) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const actorSeat = table.seats.find((s) => s.playerId === actorPlayerId);
  if (!actorSeat) throw new Error("You are not seated.");

  const actorIsHost = actorSeat.isHost === true;
  const actorIsSelf = actorPlayerId === targetPlayerId;

  if (!actorIsHost && !actorIsSelf) {
    throw new Error("Only the host can change other players.");
  }

  const targetSeat = table.seats.find((s) => s.playerId === targetPlayerId);
  if (!targetSeat) throw new Error("Target player not seated.");

  const seats: Seat[] = table.seats.map((s) =>
    s.playerId === targetPlayerId ? { ...s, adviceEnabled: enabled } : s
  );

  await updateDoc(ref, { seats });
}

export async function startTable(roomCode: string) {
  const ref = doc(db, "tables", roomCode);
  await updateDoc(ref, { status: "playing" });
}

export async function resetAllReady(roomCode: string) {
  const ref = doc(db, "tables", roomCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data() as any;
  const table: TableDoc = { ...raw, game: raw.game ?? null };

  const seats: Seat[] = table.seats.map((s) =>
    s.playerId ? { ...s, isReady: false } : s
  );

  await updateDoc(ref, { seats });
}

import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import type { TableDoc, SharedGame } from "./firestoreLobby";
import type { GameState } from "../engine/blackjack";
import {
  makeShoe,
  hit,
  stand,
  doubleDown,
  split as splitFn,
  dealerStep,
} from "../engine/blackjack";

type Action = "hit" | "stand" | "double" | "split";

const INTERMISSION_MS = 10_000;

export async function startSharedRound(roomCode: string) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");

    const table = snap.data() as TableDoc;
    const seated = table.seats.filter((s) => s.playerId && s.name);

    if (seated.length === 0) throw new Error("No players seated");

    let deck = makeShoe(6);

    const dealOne = () => {
      const card = deck[0];
      if (!card) throw new Error("Shoe empty");
      deck = deck.slice(1);
      return card;
    };

    const players = seated.map((s) => ({
      playerId: s.playerId!,
      name: s.name!,
      hands: [
        {
          cards: [dealOne(), dealOne()],
          bet: 1,
          doubled: false,
          outcome: "playing" as const,
          payout: 0,
          isSplitHand: false,
        },
      ],
      currentHand: 0,
      done: false,
    }));

    const dealer = [dealOne(), dealOne()];

    const game: SharedGame = {
      phase: "round_player",
      shoe: deck,
      dealer,
      revealDealer: false,
      players,
      actingPlayerIndex: 0,
      intermissionEndsAt: null,
    };

    tx.update(ref, { status: "playing", game });
  });
}

export async function playerAction(roomCode: string, playerId: string, action: Action) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");

    const table = snap.data() as TableDoc;
    const game = table.game;
    if (!game) throw new Error("Game not started");
    if (game.phase !== "round_player") throw new Error("Not player phase");

    const idx = game.actingPlayerIndex;
    const p = game.players[idx];
    if (!p || p.playerId !== playerId) throw new Error("Not your turn");

    const temp: GameState = {
      deck: game.shoe,
      dealer: game.dealer,
      playerHands: p.hands,
      currentHand: p.currentHand,
      phase: "player",
      revealDealer: false,
      baseBet: 1,
    };

    const next =
      action === "hit"
        ? hit(temp)
        : action === "stand"
        ? stand(temp)
        : action === "double"
        ? doubleDown(temp)
        : action === "split"
        ? splitFn(temp)
        : temp;

    p.hands = next.playerHands;
    p.currentHand = next.currentHand;
    game.shoe = next.deck;

    const stillPlaying = p.hands.some((h) => h.outcome === "playing");
    if (!stillPlaying) p.done = true;

    if (p.done) {
      let nextIdx = idx + 1;
      while (nextIdx < game.players.length && game.players[nextIdx].done) nextIdx++;

      if (nextIdx < game.players.length) {
        game.actingPlayerIndex = nextIdx;
      } else {
        game.phase = "dealer";
        game.revealDealer = true;
      }
    }

    tx.update(ref, { game });
  });
}

export async function hostDealerStep(roomCode: string, hostId: string) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const table = snap.data() as TableDoc;
    if (table.hostId !== hostId) return;

    const game = table.game;
    if (!game || game.phase !== "dealer") return;

    const temp: GameState = {
      deck: game.shoe,
      dealer: game.dealer,
      playerHands: [],
      currentHand: 0,
      phase: "dealer",
      revealDealer: true,
      baseBet: 1,
    };

    const next = dealerStep(temp);

    game.shoe = next.deck;
    game.dealer = next.dealer;
    game.revealDealer = true;

    if (next.phase === "settled") {
      game.phase = "intermission";
      game.intermissionEndsAt = Date.now() + INTERMISSION_MS;
    }

    tx.update(ref, { game });
  });
}

/**
 * Host-only: once intermission time is up, advance into betting phase.
 * Your UI can show a bet window when phase === "betting".
 */
export async function hostAdvanceIntermission(roomCode: string, hostId: string) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const table = snap.data() as TableDoc;
    if (table.hostId !== hostId) return;

    const game = table.game;
    if (!game || game.phase !== "intermission") return;

    const endsAt = game.intermissionEndsAt ?? 0;
    if (Date.now() < endsAt) return;

    game.phase = "betting";
    tx.update(ref, { game });
  });
}

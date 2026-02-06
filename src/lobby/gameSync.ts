import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { TableDoc } from "./firestoreLobby";
import { makeShoe } from "../engine/blackjack"; // you have makeShoe in your shoe update
import { startHand } from "../engine/blackjack"; // we’ll reuse for hand init
import { hit, stand, doubleDown, split as splitFn, dealerStep } from "../engine/blackjack";
import type { GameState } from "../engine/blackjack";

type Action = "hit" | "stand" | "double" | "split";

export async function playerAction(roomCode: string, playerId: string, action: Action) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");

    const table = snap.data() as any;
    const game = table.game;
    if (!game) throw new Error("Game not started");
    if (game.phase !== "round_player") throw new Error("Not player phase");

    const idx = game.actingPlayerIndex;
    const p = game.players[idx];
    if (!p || p.playerId !== playerId) throw new Error("Not your turn");

    // Build a temporary engine GameState for this player using shared dealer + shared shoe
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
      action === "hit" ? hit(temp) :
      action === "stand" ? stand(temp) :
      action === "double" ? doubleDown(temp) :
      action === "split" ? splitFn(temp) :
      temp;

    // Update player from result
    p.hands = next.playerHands;
    p.currentHand = next.currentHand;

    // If player is no longer in player phase, they’re done
    // (Your engine moves to dealer phase when hands are finished; we’ll interpret that as done.)
    const stillPlayingAny = p.hands.some((h: any) => h.outcome === "playing");
    if (!stillPlayingAny) p.done = true;

    // Update shared shoe (deck) with whatever was consumed
    game.shoe = next.deck;

    // Advance turn if player done
    if (p.done) {
      let nextIdx = idx + 1;
      while (nextIdx < game.players.length && game.players[nextIdx].done) nextIdx++;
      if (nextIdx < game.players.length) {
        game.actingPlayerIndex = nextIdx;
      } else {
        // all players done -> dealer phase
        game.phase = "dealer";
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

    const table = snap.data() as any;
    if (table.hostId !== hostId) return; // only host runs dealer

    const game = table.game;
    if (!game || game.phase !== "dealer") return;

    // Build a temp engine state whose "playerHands" are irrelevant for dealer step,
    // but we can just use dealerStep logic by constructing a minimal GameState.
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

    // dealerStep will settle only when dealer should stand;
    // when that happens, mark settled (we’ll compute payouts later)
    // For MVP: just stop at settled; next iteration we’ll compute each player's result.
    if (next.phase === "settled") {
      game.phase = "settled";
    }

    tx.update(ref, { game });
  });
}

export async function startSharedRound(roomCode: string) {
  const ref = doc(db, "tables", roomCode);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");

    const table = snap.data() as TableDoc & any;
    const seated = table.seats.filter((s: any) => s.playerId);

    if (seated.length === 0) throw new Error("No players seated");

    // Shoe: keep existing shoe if present, else new
    const shoe = table.game?.shoe?.length ? table.game.shoe : makeShoe(6);

    // Initialize dealer + each player’s starting hand from the SAME shoe
    // We'll do this by calling startHand with an existing deck.
    // startHand currently creates a full GameState for one player, but we can reuse its dealing.
    // Easiest MVP: create one shared dealing sequence:
    let deck = shoe;

    // Deal dealer first card to each player etc. (classic: each player gets 2, dealer gets 2)
    // We'll just leverage startHand per player sequentially for MVP.
    const players = [];
    let dealerCards: any[] = [];

    // Deal dealer cards once, at end, using the remaining deck
    // For MVP simplicity: deal each player's 2 cards from deck manually + dealer 2 cards manually.
    // (If you want, I’ll give a clean shared-deal helper next.)
    const dealOne = () => {
      const [card, ...rest] = deck;
      if (!card) throw new Error("Shoe empty");
      deck = rest;
      return card;
    };

    // each player gets 2
    const playerHands = seated.map((s: any) => ({
      playerId: s.playerId,
      name: s.name,
      hands: [
        {
          cards: [dealOne(), dealOne()],
          bet: 1,
          doubled: false,
          outcome: "playing",
          payout: 0,
          isSplitHand: false,
        },
      ],
      currentHand: 0,
      done: false,
    }));

    // dealer gets 2
    dealerCards = [dealOne(), dealOne()];

    const game = {
      phase: "round_player",
      shoe: deck,
      dealer: dealerCards,
      players: playerHands,
      actingPlayerIndex: 0,
    };

    tx.update(ref, { status: "playing", game });
  });
}

// src/engine/blackjack.ts
export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6"
  | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = { rank: Rank; suit: Suit };

export type Phase = "player" | "dealer" | "settled";

export type HandOutcome =
  | "playing"
  | "bust"
  | "stand"
  | "blackjack"
  | "win"
  | "lose"
  | "push";

export type PlayerHand = {
  cards: Card[];
  bet: number;
  doubled: boolean;
  outcome: HandOutcome;
  payout: number;
  isSplitHand: boolean;
};

export type GameState = {
  deck: Card[];
  dealer: Card[];
  playerHands: PlayerHand[];
  currentHand: number;
  phase: Phase;
  revealDealer: boolean;
  baseBet: number;
};

const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS: Suit[] = ["♠","♥","♦","♣"];

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export function handTotal(cards: Card[]) {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === "A") aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]) {
  return cards.length === 2 && handTotal(cards).total === 21;
}

function deal(deck: Card[]) {
  const [card, ...rest] = deck;
  return { card, deck: rest };
}

function dealerShouldHit(cards: Card[]) {
  return handTotal(cards).total < 17;
}

export function dealerStep(state: GameState): GameState {
  if (state.phase !== "dealer") return state;

  if (dealerShouldHit(state.dealer)) {
    const d = deal(state.deck);
    return {
      ...state,
      dealer: [...state.dealer, d.card],
      deck: d.deck,
      revealDealer: true,
    };
  }

  return {
    ...state,
    phase: "settled",
    playerHands: state.playerHands.map(h =>
      settleHand(h, state.dealer)
    ),
  };
}

function settleHand(hand: PlayerHand, dealerCards: Card[]): PlayerHand {
  if (hand.outcome === "bust") return { ...hand, payout: -hand.bet };

  const p = handTotal(hand.cards).total;
  const d = handTotal(dealerCards).total;

  const naturalBJ = !hand.isSplitHand && isBlackjack(hand.cards);
  const dealerBJ = isBlackjack(dealerCards);

  if (naturalBJ) {
    if (dealerBJ) return { ...hand, outcome: "push", payout: 0 };
    return { ...hand, outcome: "blackjack", payout: 1.5 * hand.bet };
  }

  if (d > 21) return { ...hand, outcome: "win", payout: hand.bet };
  if (p > d) return { ...hand, outcome: "win", payout: hand.bet };
  if (p < d) return { ...hand, outcome: "lose", payout: -hand.bet };
  return { ...hand, outcome: "push", payout: 0 };
}

export function makeShoe(numDecks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  // Shuffle using Fisher-Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function dealCard(state: GameState): { card: Card; state: GameState } {
  const [card, ...rest] = state.deck;
  return { card, state: { ...state, deck: rest } };
}

export function hit(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const hand = state.playerHands[state.currentHand];
  if (!hand) return state;

  const { card, state: newState } = dealCard(state);
  const newCards = [...hand.cards, card];
  const total = handTotal(newCards).total;

  const updatedHand: PlayerHand = { ...hand, cards: newCards };

  if (total > 21) {
    updatedHand.outcome = "bust";
  }

  const updatedHands: PlayerHand[] = [...state.playerHands];
  updatedHands[state.currentHand] = updatedHand;

  return { ...newState, playerHands: updatedHands };
}

export function stand(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const hand = state.playerHands[state.currentHand];
  if (!hand) return state;

  const updatedHand: PlayerHand = { ...hand, outcome: "stand" as HandOutcome };
  const updatedHands: PlayerHand[] = [...state.playerHands];
  updatedHands[state.currentHand] = updatedHand;

  return { ...state, playerHands: updatedHands };
}

export function doubleDown(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const hand = state.playerHands[state.currentHand];
  if (!hand) return state;

  // Double the bet and deal one card
  const { card, state: newState } = dealCard(state);
  const newCards = [...hand.cards, card];
  const total = handTotal(newCards).total;

  const outcome: HandOutcome = total > 21 ? "bust" : "stand";

  const updatedHand = {
    ...hand,
    cards: newCards,
    doubled: true,
    bet: hand.bet * 2,
    outcome,
  };

  const updatedHands = [...state.playerHands];
  updatedHands[state.currentHand] = updatedHand;

  return { ...newState, playerHands: updatedHands };
}

export function split(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const hand = state.playerHands[state.currentHand];
  if (!hand || hand.cards.length !== 2) return state;

  // Check if cards can be split
  const ranks = [hand.cards[0].rank, hand.cards[1].rank];
  const canSplit = ranks[0] === ranks[1] ||
    (cardValue(ranks[0] as Rank) === 10 && cardValue(ranks[1] as Rank) === 10);

  if (!canSplit) return state;

  const { card: card1, state: state1 } = dealCard(state);
  const { card: card2, state: state2 } = dealCard(state1);

  // First hand
  const outcome1: HandOutcome = handTotal([hand.cards[0], card1]).total > 21 ? "bust" : "playing";
  const hand1: PlayerHand = {
    cards: [hand.cards[0], card1],
    bet: hand.bet,
    doubled: false,
    outcome: outcome1,
    payout: 0,
    isSplitHand: true,
  };

  // Second hand
  const outcome2: HandOutcome = handTotal([hand.cards[1], card2]).total > 21 ? "bust" : "playing";
  const hand2: PlayerHand = {
    cards: [hand.cards[1], card2],
    bet: hand.bet,
    doubled: false,
    outcome: outcome2,
    payout: 0,
    isSplitHand: true,
  };

  const updatedHands = [...state.playerHands];
  updatedHands[state.currentHand] = hand1;
  updatedHands.splice(state.currentHand + 1, 0, hand2);

  return { ...state2, playerHands: updatedHands };
}

export function startHand(wager: number, deck?: Card[]): GameState {
  const shoe = deck || makeShoe(6);

  // Deal 2 to player, 2 to dealer
  const [pc1, shoe1] = [shoe[0], shoe.slice(1)];
  const [dc1, shoe2] = [shoe1[0], shoe1.slice(1)];
  const [pc2, shoe3] = [shoe2[0], shoe2.slice(1)];
  const [dc2, finalShoe] = [shoe3[0], shoe3.slice(1)];

  const playerCards = [pc1, pc2];
  const dealerCards = [dc1, dc2];

  const playerHand: PlayerHand = {
    cards: playerCards,
    bet: wager,
    doubled: false,
    outcome: "playing" as HandOutcome,
    payout: 0,
    isSplitHand: false,
  };

  return {
    deck: finalShoe,
    dealer: dealerCards,
    playerHands: [playerHand],
    currentHand: 0,
    phase: "player",
    revealDealer: false,
    baseBet: wager,
  };
}

export function canDouble(state: GameState): boolean {
  if (state.phase !== "player") return false;

  const hand = state.playerHands[state.currentHand];
  if (!hand || hand.outcome !== "playing") return false;

  // Can double on first 2 cards, or after split if 2 cards total
  return hand.cards.length === 2;
}

export function canSplit(state: GameState): boolean {
  if (state.phase !== "player") return false;

  const hand = state.playerHands[state.currentHand];
  if (!hand || hand.outcome !== "playing" || hand.cards.length !== 2) return false;

  const ranks = [hand.cards[0].rank, hand.cards[1].rank];
  // Can split if same rank or both 10-value cards
  return (
    ranks[0] === ranks[1] ||
    (cardValue(ranks[0] as Rank) === 10 && cardValue(ranks[1] as Rank) === 10)
  );
}

export function totalPayout(state: GameState): number {
  return state.playerHands.reduce((sum, hand) => sum + hand.payout, 0);
}

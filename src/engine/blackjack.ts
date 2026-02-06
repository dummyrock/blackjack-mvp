// src/engine/blackjack.ts
export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { rank: Rank; suit: Suit };

const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS: Suit[] = ["♠","♥","♦","♣"];
const TOTAL_DECKS = 6;
const RESHUFFLE_AT = 3 * 52; // reshuffle once 3 decks are gone

function maybeReshuffle(deck: Card[]): Card[] {
  if (deck.length <= TOTAL_DECKS * 52 - RESHUFFLE_AT) {
    // 156 or fewer cards left → reshuffle
    return makeShoe(TOTAL_DECKS);
  }
  return deck;
}

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export function makeShoe(numDecks = 6): Card[] {
  const shoe: Card[] = [];
  for (let i = 0; i < numDecks; i++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        shoe.push({ rank: r, suit: s });
      }
    }
  }
  return shuffle(shoe);
}

export function dealerStep(state: GameState): GameState {
  if (state.phase !== "dealer") return state;

  let deck = state.deck;
  let dealer = [...state.dealer];

  // If dealer must hit, deal exactly ONE card and stay in dealer phase
  if (dealerShouldHit(dealer)) {
    const d = deal(deck);
    deck = d.deck;
    dealer = [...dealer, d.card];

    return {
      ...state,
      deck,
      dealer,
      revealDealer: true,
      phase: "dealer",
    };
  }

  // Dealer stands -> settle all hands and end
  const settledHands = state.playerHands.map((h) => settleHand(h, dealer, state.baseBet));

  return {
    ...state,
    deck,
    dealer,
    playerHands: settledHands,
    revealDealer: true,
    phase: "settled",
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
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

  const soft = cards.some(c => c.rank === "A") && total + 10 <= 21;
  return { total, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

function deal(deck: Card[]): { card: Card; deck: Card[] } {
  if (deck.length === 0) throw new Error("Deck is empty");
  const [card, ...rest] = deck;
  return { card, deck: rest };
}

export function formatCard(c: Card): string {
  return `${c.rank}${c.suit}`;
}

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
  payout: number; // absolute payout for this hand (+/- dollars)
  isSplitHand: boolean;
};

export type GameState = {
  deck: Card[]; // persistent 6-deck shoe
  dealer: Card[];
  playerHands: PlayerHand[];
  currentHand: number;
  phase: Phase;
  revealDealer: boolean;
  baseBet: number;
};

function dealerShouldHit(dealer: Card[]): boolean {
  // Dealer stands on all 17s, including soft 17
  const { total } = handTotal(dealer);
  return total < 17;
}

function settleHand(hand: PlayerHand, dealerCards: Card[], baseBet: number): PlayerHand {
  const pTotal = handTotal(hand.cards).total;
  const dTotal = handTotal(dealerCards).total;

  // If already busted, payout already set
  if (hand.outcome === "bust") return hand;

  // Blackjack handling:
  // - Natural blackjack only for non-split initial 2-card hand.
  // - Split-hand 21 is paid as normal win (common casino rule).
  const naturalBJ = !hand.isSplitHand && hand.cards.length === 2 && isBlackjack(hand.cards);

  if (naturalBJ) {
    const payout = 1.5 * hand.bet; // 3:2 profit
    return { ...hand, outcome: "blackjack", payout };
  }

  if (dTotal > 21) {
    return { ...hand, outcome: "win", payout: +1 * hand.bet };
  }
  if (pTotal > dTotal) {
    return { ...hand, outcome: "win", payout: +1 * hand.bet };
  }
  if (pTotal < dTotal) {
    return { ...hand, outcome: "lose", payout: -1 * hand.bet };
  }
  return { ...hand, outcome: "push", payout: 0 };
}

function moveToNextHand(state: GameState): GameState {
  const next = state.currentHand + 1;
  if (next < state.playerHands.length) {
    return { ...state, currentHand: next };
  }
  // All player hands finished -> dealer phase
  return { ...state, phase: "dealer", revealDealer: true };
}

export function startHand(baseBet = 1, existingDeck?: Card[]): GameState {
  let deck = existingDeck ?? makeShoe(6);
  deck = maybeReshuffle(deck);

  const p1 = deal(deck); deck = p1.deck;
  const d1 = deal(deck); deck = d1.deck;
  const p2 = deal(deck); deck = p2.deck;
  const d2 = deal(deck); deck = d2.deck;

  const playerCards = [p1.card, p2.card];
  const dealer = [d1.card, d2.card];

  const hand: PlayerHand = {
    cards: playerCards,
    bet: baseBet,
    doubled: false,
    outcome: "playing",
    payout: 0,
    isSplitHand: false,
  };

  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealer);

  if (playerBJ || dealerBJ) {
    let settled = hand;

    if (playerBJ && dealerBJ) {
      settled = { ...hand, outcome: "push", payout: 0 };
    } else if (dealerBJ) {
      settled = { ...hand, outcome: "lose", payout: -1 * hand.bet };
    } else {
      settled = { ...hand, outcome: "blackjack", payout: 1.5 * hand.bet };
    }

    return {
      deck,
      dealer,
      playerHands: [settled],
      currentHand: 0,
      phase: "settled",
      revealDealer: true,
      baseBet,
    };
  }

  return {
    deck,
    dealer,
    playerHands: [hand],
    currentHand: 0,
    phase: "player",
    revealDealer: false,
    baseBet,
  };
}


export function canDouble(state: GameState): boolean {
  if (state.phase !== "player") return false;
  const hand = state.playerHands[state.currentHand];
  if (!hand || hand.outcome !== "playing") return false;
  return hand.cards.length === 2 && !hand.doubled;
}

export function canSplit(state: GameState): boolean {
  if (state.phase !== "player") return false;
  const hand = state.playerHands[state.currentHand];
  if (!hand || hand.outcome !== "playing") return false;
  if (hand.cards.length !== 2) return false;
  if (state.playerHands.length !== 1) return false; // MVP: allow only one split (into two hands)
  return hand.cards[0].rank === hand.cards[1].rank;
}

export function hit(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const idx = state.currentHand;
  const hand = state.playerHands[idx];
  if (!hand || hand.outcome !== "playing") return state;

  let deck = state.deck;
  const d = deal(deck); deck = d.deck;

  const cards = [...hand.cards, d.card];
  const total = handTotal(cards).total;

  const updatedHand: PlayerHand =
    total > 21
      ? { ...hand, cards, outcome: "bust", payout: -1 * hand.bet }
      : { ...hand, cards };

  const playerHands = state.playerHands.map((h, i) => (i === idx ? updatedHand : h));

  // If busted, move on automatically
  if (updatedHand.outcome === "bust") {
    return moveToNextHand({ ...state, deck, playerHands });
  }

  return { ...state, deck, playerHands };
}

export function stand(state: GameState): GameState {
  if (state.phase !== "player") return state;

  const idx = state.currentHand;
  const hand = state.playerHands[idx];
  if (!hand || hand.outcome !== "playing") return state;

  const updatedHand: PlayerHand = { ...hand, outcome: "stand" };
  const playerHands = state.playerHands.map((h, i) => (i === idx ? updatedHand : h));

  return moveToNextHand({ ...state, playerHands });
}

export function doubleDown(state: GameState): GameState {
  if (!canDouble(state)) return state;

  const idx = state.currentHand;
  const hand = state.playerHands[idx];

  let deck = state.deck;
  const d = deal(deck); deck = d.deck;

  const cards = [...hand.cards, d.card];
  const bet = hand.bet * 2;

  const total = handTotal(cards).total;

  const updatedHand: PlayerHand =
    total > 21
      ? { ...hand, cards, bet, doubled: true, outcome: "bust", payout: -1 * bet }
      : { ...hand, cards, bet, doubled: true, outcome: "stand" };

  const playerHands = state.playerHands.map((h, i) => (i === idx ? updatedHand : h));

  // Double always ends the hand (stand or bust), so move on
  return moveToNextHand({ ...state, deck, playerHands });
}

export function split(state: GameState): GameState {
  if (!canSplit(state)) return state;

  const hand = state.playerHands[state.currentHand];
  const [c1, c2] = hand.cards;

  let deck = state.deck;

  // Each new hand gets one extra card
  const d1 = deal(deck); deck = d1.deck;
  const d2 = deal(deck); deck = d2.deck;

  const hand1: PlayerHand = {
    cards: [c1, d1.card],
    bet: state.baseBet,
    doubled: false,
    outcome: "playing",
    payout: 0,
    isSplitHand: true,
  };

  const hand2: PlayerHand = {
    cards: [c2, d2.card],
    bet: state.baseBet,
    doubled: false,
    outcome: "playing",
    payout: 0,
    isSplitHand: true,
  };

  return {
    ...state,
    deck,
    playerHands: [hand1, hand2],
    currentHand: 0,
  };
}

export function totalPayout(state: GameState): number {
  return state.playerHands.reduce((sum, h) => sum + (h.payout ?? 0), 0);
}

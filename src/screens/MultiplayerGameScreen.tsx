import { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import {
  GameState,
  canDouble,
  canSplit,
  dealerStep,
  doubleDown,
  handTotal,
  hit,
  split,
  stand,
  startHand,
  totalPayout,
} from "../engine/blackjack";
import { getAdvice } from "../engine/basicStrategy";
import { startSharedRound, playerAction, hostDealerStep, hostAdvanceIntermission } from "../lobby/gameSync";
import { setReadyAndBet, resetAllReady } from "../lobby/firestoreLobby";
import PokerTableLayout from "./PokerTableLayout";
import { subscribeTable, TableDoc } from "../lobby/firestoreLobby";

/** ---------- Card UI ---------- */
function suitColor(suit: string) {
  return suit === "♥" || suit === "♦" ? "#dc2626" : "#0f172a";
}

function CardView({
  rank,
  suit,
  hidden,
}: {
  rank: string;
  suit: string;
  hidden?: boolean;
}) {
  if (hidden) {
    return (
      <View style={[styles.card, styles.cardBack]}>
        <Text style={styles.cardBackText}>★</Text>
      </View>
    );
  }

  const color = suitColor(suit);

  return (
    <View style={styles.card}>
      <Text style={[styles.cardCorner, { color }]}>
        {rank}
        {suit}
      </Text>
      <Text style={[styles.cardCenter, { color }]}>{suit}</Text>
      <Text style={[styles.cardCornerBottom, { color }]}>
        {rank}
        {suit}
      </Text>
    </View>
  );
}

/** ---------- Pixel-ish Chip UI ---------- */
function Chip({
  value,
  color,
  disabled,
  onPress,
  size = 64,
}: {
  value: number;
  color: string;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          opacity: disabled ? 0.35 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        },
      ]}
    >
      <View style={[styles.chipOuter, { backgroundColor: color, borderRadius: size / 2 }]}>
        <View style={[styles.chipPixel, { top: 6, left: size / 2 - 3 }]} />
        <View style={[styles.chipPixel, { bottom: 6, left: size / 2 - 3 }]} />
        <View style={[styles.chipPixel, { left: 6, top: size / 2 - 3 }]} />
        <View style={[styles.chipPixel, { right: 6, top: size / 2 - 3 }]} />
        <View style={[styles.chipPixel, { top: 12, left: 12 }]} />
        <View style={[styles.chipPixel, { top: 12, right: 12 }]} />
        <View style={[styles.chipPixel, { bottom: 12, left: 12 }]} />
        <View style={[styles.chipPixel, { bottom: 12, right: 12 }]} />

        <View style={styles.chipRing1}>
          <View style={styles.chipRing2}>
            <Text style={styles.chipValueText}>{value}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function chipColorForValue(v: number) {
  if (v === 5) return "#22c55e";
  if (v === 10) return "#3b82f6";
  if (v === 25) return "#ff4d8d";
  if (v === 100) return "#ffd24a";
  if (v === 500) return "#a855f7";
  return "#f97316";
}

export default function MultiplayerGameScreen({
  roomCode,
  myPlayerId,
  myName,
  onExit,
}: {
  roomCode: string;
  myPlayerId: string;
  myName: string;
  onExit: () => void;
}) {
  // ---- Lobby seats only (visual multiplayer) ----
  const [table, setTable] = useState<TableDoc | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeTable(roomCode, setTable);
    return () => unsub();
  }, [roomCode]);

  const seats = useMemo(() => {
    // fallback if table not loaded yet
    if (!table?.seats?.length) {
      return [{ seatIndex: 0, playerId: myPlayerId, name: myName }];
    }
    // ensure "you" exists as a seat (defensive)
    const hasYou = table.seats.some((s) => s.playerId === myPlayerId);
    if (hasYou) return table.seats.map((s) => ({ ...s, playerId: s.playerId ?? undefined, name: s.name ?? undefined }));
    return [{ seatIndex: 0, playerId: myPlayerId, name: myName }, ...table.seats.map((s) => ({ ...s, playerId: s.playerId ?? undefined, name: s.name ?? undefined }))];
  }, [table, myPlayerId, myName]);

  const maxSeats = useMemo(() => Math.max(6, seats.length), [seats.length]);

  // ---- BANKROLL + BET (LOCAL, same as before) ----
  const STARTING_BANKROLL = 2000;
  const [bankroll, setBankroll] = useState<number>(STARTING_BANKROLL);
  const [reserved, setReserved] = useState<number>(0);
  const [bet, setBet] = useState<number>(0);
  const availableBankroll = useMemo(() => Math.max(0, bankroll - reserved), [bankroll, reserved]);

  function safeSetBankroll(update: (prev: number) => number) {
    setBankroll((prev) => Math.max(0, update(prev)));
  }
  function safeSetReserved(update: (prev: number) => number) {
    setReserved((prev) => Math.max(0, update(prev)));
  }

  // show +/- delta next to bankroll after a hand ends
  const [bankrollDelta, setBankrollDelta] = useState<{ amount: number; sign: "+" | "-" } | null>(null);
  const deltaOpacity = useRef(new Animated.Value(0)).current;
  const deltaScale = useRef(new Animated.Value(0.98)).current;
  const deltaAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const deltaHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBankrollDelta(profit: number) {
    if (profit === 0) {
      setBankrollDelta(null);
      deltaOpacity.setValue(0);
      deltaScale.setValue(0.98);
      return;
    }

    if (deltaHideTimerRef.current) clearTimeout(deltaHideTimerRef.current);
    deltaAnimRef.current?.stop();

    setBankrollDelta({
      amount: Math.abs(Math.round(profit)),
      sign: profit > 0 ? "+" : "-",
    });

    deltaOpacity.setValue(0);
    deltaScale.setValue(0.98);

    deltaAnimRef.current = Animated.parallel([
      Animated.timing(deltaOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(deltaScale, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]);

    deltaAnimRef.current.start();

    deltaHideTimerRef.current = setTimeout(() => {
      deltaAnimRef.current?.stop();
      deltaAnimRef.current = Animated.parallel([
        Animated.timing(deltaOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(deltaScale, { toValue: 0.98, duration: 380, useNativeDriver: true }),
      ]);

      deltaAnimRef.current.start(({ finished }) => {
        if (finished) setBankrollDelta(null);
      });
    }, 1200);
  }

  useEffect(() => {
    return () => {
      if (deltaHideTimerRef.current) clearTimeout(deltaHideTimerRef.current);
      deltaAnimRef.current?.stop();
    };
  }, []);

  // ---- BET MODAL ----
  const [betModalOpen, setBetModalOpen] = useState<boolean>(true);
  const [betChips, setBetChips] = useState<number[]>([]);
  const betTotal = useMemo(() => betChips.reduce((s, x) => s + x, 0), [betChips]);

  function clearBet() {
    setBetChips([]);
  }

  useEffect(() => {
    setBet(betTotal);
  }, [betTotal]);

  // ---- GAME STATE (LOCAL) ----
  const [state, setState] = useState<GameState | null>(null);
  const shoeRef = useRef<any[] | null>(null);
  const payoutCreditedRef = useRef<boolean>(false);
  const sharedPayoutCreditedRef = useRef<number | null>(null);

  // ---- 10s INTERMISSION ----
  const INTERMISSION_MS = 10_000;
  const [intermissionEndsAt, setIntermissionEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const openedIntermissionRef = useRef<number | null>(null);
  const bettingPhaseDealtRef = useRef<boolean>(false);

  const activePhase = table?.game?.phase ?? state?.phase ?? null;
  const sharedIntermissionEndsAt = table?.game?.intermissionEndsAt ?? intermissionEndsAt;
  const countdownEnded = sharedIntermissionEndsAt != null && nowTick >= sharedIntermissionEndsAt;
  const preGameBetting = !!roomCode && !table?.game;
  const seatedPlayers = useMemo(() => table?.seats.filter((s) => s.playerId) ?? [], [table?.seats]);
  const allReady = useMemo(
    () => seatedPlayers.length > 0 && seatedPlayers.every((s) => s.isReady && (s.bet ?? 0) > 0),
    [seatedPlayers]
  );
  const waitingForReady = !!table?.game && table.game.phase === "round_player" && !allReady;
  const showBettingState =
    preGameBetting ||
    waitingForReady ||
    (!!table?.game && (table.game.phase === "betting" || (table.game.phase === "intermission" && countdownEnded)));

  const isHandFinished = activePhase === "settled";
  const inIntermission = activePhase === "intermission" && sharedIntermissionEndsAt != null && !betModalOpen;

  function startIntermission() {
    setIntermissionEndsAt(Date.now() + INTERMISSION_MS);
  }
  function stopIntermission() {
    setIntermissionEndsAt(null);
  }

  useEffect(() => {
    if (!sharedIntermissionEndsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 50);
    return () => clearInterval(id);
  }, [sharedIntermissionEndsAt]);

  function resetSession() {
    setBankroll(STARTING_BANKROLL);
    setReserved(0);
    shoeRef.current = null;
    payoutCreditedRef.current = false;
    setState(null);
    stopIntermission();
    setBetModalOpen(true);
    setBankrollDelta(null);
    setBetChips([]);
  }

  function getChipValues(currentAvailable: number) {
    const base = [5, 10, 25, 100, 500];
    if (currentAvailable >= 5000) base.push(5000);
    return base;
  }

  function openBetModal() {
    setState(null);
    payoutCreditedRef.current = false;
    stopIntermission();
    setBetModalOpen(true);

    const available = getChipValues(availableBankroll);
    const rebuilt: number[] = [];
    let remaining = Math.max(0, Math.min(bet, availableBankroll));
    const sorted = [...available].sort((a, b) => b - a);
    for (const v of sorted) {
      while (remaining >= v) {
        rebuilt.push(v);
        remaining -= v;
      }
    }
    setBetChips(rebuilt);
  }

  function addChip(v: number) {
    if (betTotal + v > availableBankroll) return;
    setBetChips((prev) => [...prev, v]);
  }

  function dealHand() {
    const wager = betTotal;
    if (wager <= 0) return;
    if (wager > availableBankroll) return;

    setReserved(wager);

    // If we're in a room, signal ready (host will start the round when everyone is ready)
    if (roomCode) {
      setReadyAndBet(roomCode, myPlayerId, true, wager).catch((err) => console.warn("setReadyAndBet failed", err));
      payoutCreditedRef.current = false;
      stopIntermission();
      setBetModalOpen(false);
      return;
    }

    const next = shoeRef.current ? startHand(wager, shoeRef.current) : startHand(wager);
    const dealerBlackjack = next.dealer.length === 2 && handTotal(next.dealer).total === 21;
    const nextState: GameState = dealerBlackjack ? { ...next, phase: "dealer", revealDealer: false } : next;
    shoeRef.current = nextState.deck;

    payoutCreditedRef.current = false;
    stopIntermission();

    setState(nextState);
    setBetModalOpen(false);
  }

  // ---- Derived: hands for table (YOU + neighbors placeholders) ----
  const handsByPlayerId = useMemo(() => {
    const out: Record<string, any> = {};

    // If a shared game exists on the table AND we're not in betting (or countdown-ended intermission), render everyone
    if (table?.game && !showBettingState) {
      for (const p of table.game.players) {
        out[p.playerId] = {
          hands: p.hands.map((h: any, idx: number) => ({
            cards: h.cards,
            bet: h.bet,
            isActive: table.game!.phase === "round_player" && table.game!.actingPlayerIndex === table.game!.players.findIndex((x) => x.playerId === p.playerId) && idx === p.currentHand && h.outcome === "playing",
          })),
          isActing: table.game.phase === "round_player" && table.game.players[table.game.actingPlayerIndex]?.playerId === p.playerId,
        };
      }

      // Ensure seats with no player still show placeholders
      for (const s of seats) {
        if (!s.playerId) continue;
        if (out[s.playerId]) continue;
        out[s.playerId] = {
          hands: [
            {
              cards: [
                { rank: "?", suit: "?" },
                { rank: "?", suit: "?" },
              ],
              bet: undefined,
              isActive: false,
            },
          ],
          isActing: false,
        };
      }

      return out;
    }

    // During betting phase (or countdown-ended intermission): show all players with hidden cards
    if (showBettingState) {
      for (const s of seats) {
        if (!s.playerId) continue;
        out[s.playerId] = {
          hands: [
            {
              cards: [
                { rank: "?", suit: "?" },
                { rank: "?", suit: "?" },
              ],
              bet: undefined,
              isActive: false,
            },
          ],
          isActing: false,
        };
      }
      return out;
    }

    // YOU: real cards from local state
    if (!state) {
      out[myPlayerId] = { hands: [], isActing: false };
      return out;
    }

    const youHands = state.playerHands.map((h, idx) => {
      return {
        cards: h.cards,
        bet: h.bet,
        isActive: state.phase === "player" && idx === state.currentHand && h.outcome === "playing",
      };
    });

    out[myPlayerId] = {
      hands: youHands,
      isActing: state.phase === "player",
    };

    // OTHERS: show as facedown hands (visual only)
    for (const s of seats) {
      if (!s.playerId) continue;
      if (s.playerId === myPlayerId) continue;

      out[s.playerId] = {
        hands: [
          {
            cards: [
              { rank: "?", suit: "?" },
              { rank: "?", suit: "?" },
            ],
            bet: undefined,
            isActive: false,
          },
        ],
        isActing: false,
      };
    }

    return out;
  }, [state, myPlayerId, seats, table, showBettingState]);

  const dealerTotalLabel = useMemo(() => {
    const src = table?.game ? { dealer: table.game.dealer, revealDealer: !!table.game.revealDealer } : state;
    if (!src) return "";
    const dealerT = handTotal(src.dealer);
    const dealerLow = dealerT.soft ? dealerT.total - 10 : dealerT.total;
    const dealerHigh = dealerT.total;

    return src.revealDealer
      ? `Total ${dealerT.soft && dealerLow !== dealerHigh ? `${dealerLow} / ${dealerHigh}` : `${dealerHigh}`}`
      : "";
  }, [state, table]);

  const dealerCards = useMemo(() => {
    // During betting phase (or countdown-ended intermission), hide all cards (show as hidden/?)
    if (showBettingState) {
      return [
        { rank: "?", suit: "?", hidden: true },
        { rank: "?", suit: "?", hidden: true },
      ];
    }

    const src = table?.game ? { dealer: table.game.dealer, revealDealer: !!table.game.revealDealer } : state;
    if (!src) return [];
    return src.dealer.map((c: any, idx: number) => ({
      rank: c.rank,
      suit: c.suit,
      hidden: !src.revealDealer && idx === 1,
    }));
  }, [state, table, showBettingState]);

  // ---- Auto-start shared round when everyone is ready (host only) ----
  useEffect(() => {
    if (!table) return;
    // If no game yet, allow ready-based start from the first bet window
    if (!table.game) {
      if (!allReady) {
        bettingPhaseDealtRef.current = false;
        return;
      }
      if (bettingPhaseDealtRef.current) return;
      if (table.hostId !== myPlayerId) return;

      bettingPhaseDealtRef.current = true;
      startSharedRound(roomCode).catch((err) => console.warn("startSharedRound failed", err));
      return;
    }

    // Reset dealt flag when NOT in betting phase
    if (table.game.phase !== "betting") {
      bettingPhaseDealtRef.current = false;
      return;
    }

    // If we already dealt for this betting phase, don't deal again
    if (bettingPhaseDealtRef.current) return;
    if (!allReady) return;
    if (table.hostId !== myPlayerId) return;

    // Mark that we've dealt for this betting phase
    bettingPhaseDealtRef.current = true;
    startSharedRound(roomCode).catch((err) => console.warn("startSharedRound failed", err));
  }, [table, roomCode, myPlayerId, allReady]);

  // ---- Reset all ready flags when entering intermission ----
  useEffect(() => {
    if (!table?.game) return;
    if (table.game.phase !== "intermission") return;
    if (table.hostId !== myPlayerId) return;
    
    resetAllReady(roomCode).catch((e) => console.warn("resetAllReady failed", e));
  }, [table?.game?.phase, table?.hostId, myPlayerId, roomCode]);

  // ---- Dealer autoplay ----
  const dealerSeqRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; running: boolean }>({
    timer: null,
    running: false,
  });

  function stopDealerSequence() {
    if (dealerSeqRef.current.timer) clearTimeout(dealerSeqRef.current.timer);
    dealerSeqRef.current = { timer: null, running: false };
  }

  // ---- Advance to next hand when current is finished (local only) ----
  useEffect(() => {
    if (!state || state.phase !== "player") return;
    const current = state.playerHands[state.currentHand];
    if (!current || current.outcome === "playing") return;
    const nextIdx = state.playerHands.findIndex((h, i) => i > state.currentHand && h.outcome === "playing");
    if (nextIdx === -1) return;
    setState((prev) => (prev ? { ...prev, currentHand: nextIdx } : prev));
  }, [state?.phase, state?.currentHand, state?.playerHands]);

  // ---- Transition to dealer phase when all player hands are done ----
  useEffect(() => {
    if (!state || state.phase !== "player") return;

    const allHandsDone = state.playerHands.every((h) => h.outcome !== "playing");
    if (allHandsDone) {
      setState((prev) => (prev ? { ...prev, phase: "dealer", revealDealer: false } : prev));
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;

    if (state.phase !== "dealer") {
      stopDealerSequence();
      return;
    }

    if (dealerSeqRef.current.running) return;
    dealerSeqRef.current.running = true;

    const FLIP_DELAY = 1000;
    const DRAW_DELAY = 1000;

    const stepAfterFlip = () => {
      const doOneStep = () => {
        setState((prev) => {
          if (!prev) return prev;
          if (prev.phase !== "dealer") return prev;
          if (!prev.revealDealer) {
            return { ...prev, revealDealer: true };
          }

          const next = dealerStep(prev);
          if (next.phase === "settled") stopDealerSequence();
          return next;
        });

        dealerSeqRef.current.timer = setTimeout(() => {
          if (!dealerSeqRef.current.running) return;
          doOneStep();
        }, DRAW_DELAY);
      };

      doOneStep();
    };

    dealerSeqRef.current.timer = setTimeout(stepAfterFlip, FLIP_DELAY);

    return () => stopDealerSequence();
  }, [state?.phase]);

  // ---- Host-driven dealer stepping for shared game ----
  useEffect(() => {
    if (!table?.game) return;
    if (table.game.phase !== "dealer") return;
    if (table.hostId !== myPlayerId) return; // only host should drive dealer steps

    let running = true;
    const STEP_DELAY = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const step = async () => {
      if (!running) return;
      try {
        await hostDealerStep(roomCode, myPlayerId);
      } catch (e) {
        console.warn("hostDealerStep failed", e);
      }
      // schedule next step if still in dealer phase
      if (running) timer = setTimeout(step, STEP_DELAY);
    };

    timer = setTimeout(step, STEP_DELAY);

    return () => {
      running = false;
      if (timer) clearTimeout(timer);
    };
  }, [table?.game?.phase, table?.hostId, myPlayerId, roomCode]);

  // ---- Credit payout once & start intermission ----
  useEffect(() => {
    if (!state) return;

    const finished = state.phase === "settled";
    if (!finished) {
      stopIntermission();
      return;
    }

    if (!payoutCreditedRef.current) {
      const profit = totalPayout(state);

      safeSetBankroll((b) => b + profit);
      showBankrollDelta(profit);

      setReserved(0);

      payoutCreditedRef.current = true;
      shoeRef.current = state.deck;

      startIntermission();
    }
  }, [state]);

  // ---- When countdown finishes, auto-open bet modal ----
  useEffect(() => {
    const endsAt = sharedIntermissionEndsAt;
    if (!endsAt) return;
    if (betModalOpen) return;
    if (table?.game && table.game.phase !== "intermission" && table.game.phase !== "betting") return;

    const left = endsAt - nowTick;
    if (left <= 0) {
      // open bet modal only once per intermission window
      if (openedIntermissionRef.current !== endsAt) {
        openBetModal();
        openedIntermissionRef.current = endsAt;
      }
      if (!table?.game) stopIntermission();
    }
  }, [sharedIntermissionEndsAt, nowTick, betModalOpen, table?.game]);

  // ---- Shared-game payout credit (client-side) ----
  useEffect(() => {
    if (!table?.game) return;
    if (table.game.phase !== "intermission") return;
    const roundKey = table.game.intermissionEndsAt ?? 0;
    if (!roundKey) return;
    if (sharedPayoutCreditedRef.current === roundKey) return;

    const me = table.game.players.find((p) => p.playerId === myPlayerId);
    if (!me) return;

    const dealerCards = table.game.dealer;
    const dealerTotal = handTotal(dealerCards).total;
    const dealerBJ = dealerCards.length === 2 && dealerTotal === 21;

    const profit = me.hands.reduce((sum, h) => {
      if (h.outcome === "bust") return sum - h.bet;
      const pTotal = handTotal(h.cards).total;
      const naturalBJ = !h.isSplitHand && h.cards.length === 2 && pTotal === 21;

      if (naturalBJ) {
        if (dealerBJ) return sum;
        return sum + 1.5 * h.bet;
      }

      if (dealerTotal > 21) return sum + h.bet;
      if (pTotal > dealerTotal) return sum + h.bet;
      if (pTotal < dealerTotal) return sum - h.bet;
      return sum;
    }, 0);

    safeSetBankroll((b) => b + profit);
    showBankrollDelta(profit);
    setReserved(0);
    sharedPayoutCreditedRef.current = roundKey;
  }, [table?.game?.phase, table?.game?.intermissionEndsAt, table?.game?.dealer, myPlayerId]);

  // If we're host and intermission has passed, advance to betting phase in Firestore
  useEffect(() => {
    if (!table?.game) return;
    if (table.game.phase !== "intermission") return;
    if (table.hostId !== myPlayerId) return;
    const endsAt = table.game.intermissionEndsAt ?? 0;
    if (nowTick >= endsAt) {
      hostAdvanceIntermission(roomCode, myPlayerId).catch((e) => console.warn("hostAdvanceIntermission failed", e));
    }
  }, [table?.game?.phase, table?.game?.intermissionEndsAt, nowTick, table?.hostId, myPlayerId, roomCode]);

  // ---- Action affordability ----
  const currentHandBet = useMemo(() => {
    if (!state) return 0;
    const h = state.playerHands[state.currentHand];
    return h?.bet ?? 0;
  }, [state]);

  const localHandPlaying = useMemo(() => {
    if (!state || state.phase !== "player") return false;
    const h = state.playerHands[state.currentHand];
    return h?.outcome === "playing";
  }, [state]);

  function rankValue(rank: string) {
    if (rank === "A") return 11;
    if (rank === "J" || rank === "Q" || rank === "K") return 10;
    return Number(rank);
  }

  const adviceLabel = useMemo(() => {
    if (!table?.game) return null;
    const seat = table.seats.find((s) => s.playerId === myPlayerId);
    if (!seat?.adviceEnabled) return null;
    if (waitingForReady || inIntermission) return null;
    if (table.game.phase !== "round_player") return null;
    if (table.game.players[table.game.actingPlayerIndex]?.playerId !== myPlayerId) return null;

    const me = table.game.players.find((p) => p.playerId === myPlayerId);
    if (!me) return null;
    const hand = me.hands[me.currentHand];
    if (!hand || hand.outcome !== "playing" || hand.cards.length < 2) return null;

    const dealerUp = table.game.dealer[0];
    if (!dealerUp) return null;
    const dealerUpcard = rankValue(dealerUp.rank);

    const [r1, r2] = [hand.cards[0].rank, hand.cards[1].rank];
    const total = handTotal(hand.cards);
    const kind = r1 === r2 ? "pair" : total.soft ? "soft" : "hard";
    const advice = getAdvice({
      kind,
      total: total.total,
      pairRank: r1 === r2 ? rankValue(r1) : undefined,
      dealerUpcard,
      allowSurrender: false,
    });

    if (advice.action === "S" || advice.action === "Ds") return "Stand";
    return "Hit";
  }, [table, myPlayerId, waitingForReady, inIntermission]);

  const canDoubleWithBankroll = useMemo(() => {
    if (!state) return false;
    return state.phase === "player" && canDouble(state) && availableBankroll >= currentHandBet;
  }, [state, availableBankroll, currentHandBet]);

  const canSplitWithBankroll = useMemo(() => {
    if (!state) return false;
    return state.phase === "player" && canSplit(state) && availableBankroll >= currentHandBet;
  }, [state, availableBankroll, currentHandBet]);

  // Shared-game affordances: determine whether current shared player may double/split
  const sharedPlayerIndex = table?.game ? table.game.players.findIndex((p) => p.playerId === myPlayerId) : -1;
  const sharedPlayer = table?.game ? table.game.players[sharedPlayerIndex] : null;
  const sharedHandPlaying = useMemo(() => {
    if (!sharedPlayer) return false;
    const h = sharedPlayer.hands[sharedPlayer.currentHand];
    return h?.outcome === "playing";
  }, [sharedPlayer]);

  const sharedCanDouble = useMemo(() => {
    if (!table?.game) return false;
    if (table.game.phase !== "round_player") return false;
    if (table.game.actingPlayerIndex !== sharedPlayerIndex) return false;
    if (!sharedPlayer) return false;
    const h = sharedPlayer.hands[sharedPlayer.currentHand];
    if (!h || h.outcome !== "playing") return false;
    return h.cards.length === 2;
  }, [table, sharedPlayerIndex, sharedPlayer]);

  const sharedCanSplit = useMemo(() => {
    if (!table?.game) return false;
    if (table.game.phase !== "round_player") return false;
    if (table.game.actingPlayerIndex !== sharedPlayerIndex) return false;
    if (!sharedPlayer) return false;
    const h = sharedPlayer.hands[sharedPlayer.currentHand];
    if (!h || h.outcome !== "playing" || h.cards.length !== 2) return false;
    const [r1, r2] = [h.cards[0].rank, h.cards[1].rank];
    return r1 === r2;
  }, [table, sharedPlayerIndex, sharedPlayer]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gameContent} showsVerticalScrollIndicator={false}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topBarSide}>
            <Text style={styles.brand}>BLACKJACK</Text>
            <Text style={styles.meta}>Room: {roomCode || "local"}</Text>
          </View>

          <View style={styles.bankrollCenter}>
            <View style={styles.bankrollPill}>
              <Text style={styles.bankrollLabel}>Bankroll</Text>
              <View style={styles.bankrollRow}>
                <Text style={styles.bankrollAmount}>${bankroll}</Text>

                {bankrollDelta ? (
                  <Animated.Text
                    style={[
                      styles.bankrollDelta,
                      bankrollDelta.sign === "+" ? styles.deltaWin : styles.deltaLose,
                      { opacity: deltaOpacity, transform: [{ scale: deltaScale }] },
                    ]}
                  >
                    {bankrollDelta.sign}${bankrollDelta.amount}
                  </Animated.Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={[styles.topBarSide, { alignItems: "flex-end" }]}>
            <Pressable onPress={onExit} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>Lobby</Text>
            </Pressable>

            <Pressable onPress={resetSession} style={[styles.smallBtn, { marginTop: 8 }]}>
              <Text style={styles.smallBtnText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        {/* TABLE */}
        <PokerTableLayout
          seats={seats as any}
          dealerTotalLabel={dealerTotalLabel}
          maxSeats={maxSeats}
          myPlayerId={myPlayerId}
          dealerName="Dealer"
          dealerCards={dealerCards}
          handsByPlayerId={handsByPlayerId}
          CardView={({ rank, suit, hidden }) => <CardView rank={rank} suit={suit} hidden={hidden} />}
        />

        {/* ACTION BAR */}
        <View style={styles.actionBar}>
          <Text style={styles.actionStatus}>
            {waitingForReady
              ? "Waiting for players to readyâ€¦"
              : !activePhase
              ? "Place a bet to deal."
              : activePhase === "betting" || activePhase === undefined
              ? "Place a bet to deal."
              : activePhase === "round_player"
              ? "Make your move"
              : activePhase === "dealer"
              ? "Dealer is playing…"
              : "Game over — next game loading…"}
          </Text>

          {adviceLabel ? (
            <View style={styles.adviceRow}>
              <View style={styles.advicePill}>
                <Text style={styles.adviceText}>Advice: {adviceLabel}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                if (table?.game) {
                  playerAction(roomCode, myPlayerId, "hit").catch((e) => console.warn("playerAction hit", e));
                  return;
                }
                setState((s) => (s ? hit(s) : s));
              }}
              disabled={
                (table?.game
                  ? !(table.game.phase === "round_player" && table.game.players[table.game.actingPlayerIndex]?.playerId === myPlayerId) || !sharedHandPlaying
                  : !localHandPlaying) ||
                isHandFinished ||
                inIntermission ||
                waitingForReady
              }
              style={({ pressed }) => [
                styles.actionBtn,
                (!((table?.game) ? table.game.phase === "round_player" && table.game.players[table.game.actingPlayerIndex]?.playerId === myPlayerId && sharedHandPlaying : localHandPlaying) || isHandFinished || inIntermission || waitingForReady) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Hit</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (table?.game) {
                  playerAction(roomCode, myPlayerId, "stand").catch((e) => console.warn("playerAction stand", e));
                  return;
                }
                setState((s) => (s ? stand(s) : s));
              }}
              disabled={
                (table?.game
                  ? !(table.game.phase === "round_player" && table.game.players[table.game.actingPlayerIndex]?.playerId === myPlayerId) || !sharedHandPlaying
                  : !localHandPlaying) ||
                isHandFinished ||
                inIntermission ||
                waitingForReady
              }
              style={({ pressed }) => [
                styles.actionBtn,
                (!((table?.game) ? table.game.phase === "round_player" && table.game.players[table.game.actingPlayerIndex]?.playerId === myPlayerId && sharedHandPlaying : localHandPlaying) || isHandFinished || inIntermission || waitingForReady) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Stand</Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                if (table?.game) {
                  // reserve bankroll locally for UI
                  safeSetReserved((r) => r + currentHandBet);
                  playerAction(roomCode, myPlayerId, "double").catch((e) => console.warn("playerAction double", e));
                  return;
                }
                if (!state) return;
                if (!canDoubleWithBankroll) return;
                safeSetReserved((r) => r + currentHandBet);
                setState((s) => (s ? doubleDown(s) : s));
              }}
              disabled={
                isHandFinished ||
                inIntermission ||
                waitingForReady ||
                (table?.game ? (!(sharedCanDouble) || availableBankroll < currentHandBet) : !canDoubleWithBankroll)
              }
              style={({ pressed }) => [
                styles.actionBtnAlt,
                (isHandFinished || inIntermission || waitingForReady || (table?.game ? (!(sharedCanDouble) || availableBankroll < currentHandBet) : !canDoubleWithBankroll)) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Double</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (table?.game) {
                  safeSetReserved((r) => r + currentHandBet);
                  playerAction(roomCode, myPlayerId, "split").catch((e) => console.warn("playerAction split", e));
                  return;
                }
                if (!state) return;
                if (!canSplitWithBankroll) return;
                safeSetReserved((r) => r + currentHandBet);
                setState((s) => (s ? split(s) : s));
              }}
              disabled={
                isHandFinished ||
                inIntermission ||
                waitingForReady ||
                (table?.game ? (!(sharedCanSplit) || availableBankroll < currentHandBet) : !canSplitWithBankroll)
              }
              style={({ pressed }) => [
                styles.actionBtnAlt,
                (isHandFinished || inIntermission || waitingForReady || (table?.game ? (!(sharedCanSplit) || availableBankroll < currentHandBet) : !canSplitWithBankroll)) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Split</Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setBetModalOpen(true)}
              disabled={
                inIntermission ||
                (table?.game ? table.game.phase !== "intermission" && table.game.phase !== "betting" && !waitingForReady : false)
              }
              style={({ pressed }) => [
                styles.actionBtnWide,
                inIntermission || (table?.game ? table.game.phase !== "intermission" && table.game.phase !== "betting" && !waitingForReady : false) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>{state ? "Bet Next Hand" : "Bet / Deal"}</Text>
            </Pressable>
          </View>
        </View>

        {/* INTERMISSION OVERLAY */}
        {inIntermission && (
          <View style={styles.continueOverlay} pointerEvents="none">
            <View style={styles.continueCard}>
              <Text style={styles.continueTitle}>Game Over</Text>
              <Text style={styles.continueSub}>Next game loading…</Text>

              <ActivityIndicator style={{ marginTop: 8 }} />

              {(() => {
                const left = Math.max(0, (sharedIntermissionEndsAt ?? 0) - nowTick);
                const progress = Math.max(0, Math.min(1, 1 - left / INTERMISSION_MS));
                return (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                    <Text style={styles.continueSub2}>{Math.ceil(left / 1000)}s</Text>
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* BET MODAL */}
        {betModalOpen && (
          <View style={styles.overlay} pointerEvents="box-none">
            <Pressable style={styles.overlayBackdrop} onPress={() => setBetModalOpen(false)} />

            <View style={styles.modalCard}>
              <View style={styles.betHeaderRow}>
                <Text style={styles.betTitle}>Place your bet</Text>

                <Pressable
                  onPress={clearBet}
                  disabled={betChips.length === 0}
                  style={({ pressed }) => [
                    styles.clearBtn,
                    betChips.length === 0 ? styles.clearBtnDisabled : null,
                    pressed && betChips.length > 0 ? styles.clearBtnPressed : null,
                  ]}
                >
                  <Text style={styles.clearBtnText}>CLEAR</Text>
                </Pressable>
              </View>

              <Text style={styles.betAmount}>${betTotal}</Text>

              <View style={styles.stackArea}>
                {betChips.length === 0 ? (
                  <Text style={styles.stackHint}>Tap chips below to build your bet</Text>
                ) : (
                  <View style={styles.stackWrap}>
                    {betChips.slice(-18).map((v, i) => {
                      const color = chipColorForValue(v);
                      const lift = i * 7;
                      return (
                        <View
                          key={`${v}-${i}`}
                          style={[
                            styles.stackChip,
                            {
                              backgroundColor: color,
                              transform: [{ translateY: -lift }],
                              zIndex: i,
                            },
                          ]}
                        >
                          <View style={styles.stackChipRing}>
                            <Text style={styles.stackChipText}>{v}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.chipTray}>
                {getChipValues(availableBankroll).map((v) => {
                  const color = chipColorForValue(v);
                  const disabled = betTotal + v > availableBankroll;
                  return <Chip key={v} value={v} color={color} disabled={disabled} onPress={() => addChip(v)} size={66} />;
                })}
              </View>

              <Pressable
                onPress={dealHand}
                disabled={betTotal <= 0 || betTotal > availableBankroll}
                style={({ pressed }) => [
                  styles.dealBtn,
                  betTotal <= 0 || betTotal > availableBankroll ? styles.modalBtnDisabled : null,
                  pressed && betTotal > 0 && betTotal <= availableBankroll ? styles.modalBtnPressed : null,
                ]}
              >
                <Text style={styles.dealBtnText}>{roomCode ? "READY" : "DEAL"}</Text>
              </Pressable>

              <Text style={styles.betHint}>
                Tap outside to close. Build your bet with chips, then press <Text style={{ fontWeight: "900" }}>{roomCode ? "READY" : "DEAL"}</Text>.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 14,
    gap: 12,
    backgroundColor: "#12051a",
  },
  gameContent: {
    paddingBottom: 16,
    gap: 12,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 6,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#2b0b3a",
    borderWidth: 3,
    borderColor: "#ffd24a",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  topBarSide: {
    flex: 1,
    justifyContent: "center",
  },

  brand: {
    color: "#fff7d6",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  meta: {
    marginTop: 2,
    color: "#ffe29a",
    fontWeight: "900",
  },

  bankrollCenter: {
    width: 250,
    alignItems: "center",
    justifyContent: "center",
  },
  bankrollPill: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#ffd24a",
    borderWidth: 3,
    borderColor: "#1b0b24",
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  bankrollLabel: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.9,
    fontSize: 13,
  },
  bankrollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  bankrollAmount: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 30,
    letterSpacing: 1,
  },
  bankrollDelta: {
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  deltaWin: { color: "#16a34a" },
  deltaLose: { color: "#dc2626" },

  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#ff4d8d",
    borderWidth: 3,
    borderColor: "#1b0b24",
  },
  smallBtnText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 1,
  },

  card: {
    width: 70,
    height: 100,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 4,
    borderColor: "#1b0b24",
    padding: 8,
    justifyContent: "space-between",
  },
  cardBack: {
    backgroundColor: "#6d28d9",
    borderColor: "#1b0b24",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBackText: {
    color: "#fff7d6",
    fontSize: 26,
    fontWeight: "900",
  },
  cardCorner: { fontSize: 14, fontWeight: "900" },
  cardCornerBottom: { fontSize: 14, fontWeight: "900", alignSelf: "flex-end" },
  cardCenter: { fontSize: 38, fontWeight: "900", alignSelf: "center" },

  actionBar: {
    marginTop: 12,
    borderRadius: 22,
    padding: 12,
    backgroundColor: "#fff7d6",
    borderWidth: 4,
    borderColor: "#1b0b24",
    gap: 10,
  },
  actionStatus: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  adviceRow: { alignItems: "flex-end" },
  advicePill: {
    alignSelf: "flex-end",
    backgroundColor: "#ffd24a",
    borderWidth: 3,
    borderColor: "#1b0b24",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  adviceText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  actionRow: { flexDirection: "row", gap: 10 },

  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "#ff4d8d",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },
  actionBtnAlt: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "#3b82f6",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },
  actionBtnWide: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "#22c55e",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },
  actionBtnText: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  actionBtnDisabled: {
    backgroundColor: "#cbd5e1",
    borderColor: "#64748b",
  },
  actionBtnPressed: { transform: [{ scale: 0.97 }] },

  continueOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  continueCard: {
    width: "88%",
    maxWidth: 520,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "#fff7d6",
    borderWidth: 4,
    borderColor: "#1b0b24",
    gap: 6,
  },
  continueTitle: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  continueSub: { color: "#1b0b24", fontWeight: "900", textAlign: "center" },
  continueSub2: {
    color: "#1b0b24",
    fontWeight: "900",
    opacity: 0.75,
    textAlign: "center",
    marginTop: 6,
  },

  progressTrack: {
    marginTop: 10,
    width: "100%",
    height: 14,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#cbd5e1",
    borderWidth: 3,
    borderColor: "#1b0b24",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#ff4d8d",
  },

  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  modalCard: {
    width: "92%",
    maxWidth: 520,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "#fff7d6",
    borderWidth: 4,
    borderColor: "#1b0b24",
    gap: 10,
  },

  betHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  betTitle: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  betAmount: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 44,
    textAlign: "center",
    letterSpacing: 2,
    marginTop: 2,
  },

  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#3b82f6",
    borderWidth: 3,
    borderColor: "#1b0b24",
  },
  clearBtnText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 1,
  },
  clearBtnDisabled: {
    backgroundColor: "#cbd5e1",
    borderColor: "#64748b",
    opacity: 0.9,
  },
  clearBtnPressed: { transform: [{ scale: 0.98 }] },

  stackArea: {
    height: 170,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: "#1b0b24",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stackHint: {
    color: "#1b0b24",
    fontWeight: "900",
    opacity: 0.65,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  stackWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 18,
  },
  stackChip: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#1b0b24",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  stackChipRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#fff7d6",
    borderWidth: 3,
    borderColor: "#1b0b24",
    alignItems: "center",
    justifyContent: "center",
  },
  stackChipText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  chipTray: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },

  dealBtn: {
    marginTop: 2,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "#ffd24a",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },
  dealBtnText: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 2,
  },
  betHint: {
    color: "#1b0b24",
    fontWeight: "800",
    opacity: 0.75,
    textAlign: "center",
  },

  modalBtnDisabled: {
    backgroundColor: "#cbd5e1",
    borderColor: "#64748b",
  },
  modalBtnPressed: { transform: [{ scale: 0.985 }] },

  chipOuter: {
    flex: 1,
    borderWidth: 4,
    borderColor: "#1b0b24",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipRing1: {
    width: "78%",
    height: "78%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 3,
    borderColor: "#1b0b24",
    alignItems: "center",
    justifyContent: "center",
  },
  chipRing2: {
    width: "64%",
    height: "64%",
    borderRadius: 999,
    backgroundColor: "#fff7d6",
    borderWidth: 3,
    borderColor: "#1b0b24",
    alignItems: "center",
    justifyContent: "center",
  },
  chipValueText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  chipPixel: {
    position: "absolute",
    width: 6,
    height: 6,
    backgroundColor: "#fff7d6",
    borderWidth: 2,
    borderColor: "#1b0b24",
  },
});

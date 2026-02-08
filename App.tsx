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
} from "./src/engine/blackjack";
import LobbyScreen from "./src/screens/LobbyScreen";
import PokerTableLayout from "./src/screens/PokerTableLayout";

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

/** ---------- Main App ---------- */
export default function App() {
  // ---- NAV ----
  const [mode, setMode] = useState<"lobby" | "game">("lobby");
  const [roomCode, setRoomCode] = useState<string>("");

  // ---- BANKROLL + BET ----
  const STARTING_BANKROLL = 2000;

  // bankroll now represents what the player "sees" (does NOT drop on deal)
  const [bankroll, setBankroll] = useState<number>(STARTING_BANKROLL);

  // reserved represents money committed to the current hand (prevents over-betting/double/split)
  const [reserved, setReserved] = useState<number>(0);

  const [bet, setBet] = useState<number>(0);

  function safeSetBankroll(update: (prev: number) => number) {
    setBankroll((prev) => Math.max(0, update(prev)));
  }

  function safeSetReserved(update: (prev: number) => number) {
    setReserved((prev) => Math.max(0, update(prev)));
  }

  const availableBankroll = useMemo(() => Math.max(0, bankroll - reserved), [bankroll, reserved]);

  // show +/- delta next to bankroll after a hand ends
  const [bankrollDelta, setBankrollDelta] = useState<{ amount: number; sign: "+" | "-" } | null>(
    null
  );

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
      Animated.timing(deltaOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(deltaScale, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);

    deltaAnimRef.current.start();

    deltaHideTimerRef.current = setTimeout(() => {
      deltaAnimRef.current?.stop();
      deltaAnimRef.current = Animated.parallel([
        Animated.timing(deltaOpacity, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(deltaScale, {
          toValue: 0.98,
          duration: 380,
          useNativeDriver: true,
        }),
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
  const [betModalOpen, setBetModalOpen] = useState<boolean>(false);

  const [betChips, setBetChips] = useState<number[]>([]);
  const betTotal = useMemo(() => betChips.reduce((s, x) => s + x, 0), [betChips]);

  function clearBet() {
    setBetChips([]);
  }

  useEffect(() => {
    setBet(betTotal);
  }, [betTotal]);

  // ---- GAME STATE ----
  const [state, setState] = useState<GameState | null>(null);

  // keep shoe across hands
  const shoeRef = useRef<any[] | null>(null);

  // ensure payout applied once
  const payoutCreditedRef = useRef<boolean>(false);

  // ---- 10s INTERMISSION ----
  const INTERMISSION_MS = 10_000;
  const [intermissionEndsAt, setIntermissionEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const isHandFinished = !!state && state.phase === "settled";
  const inIntermission = isHandFinished && intermissionEndsAt != null && !betModalOpen;

  function startIntermission() {
    setIntermissionEndsAt(Date.now() + INTERMISSION_MS);
  }

  function stopIntermission() {
    setIntermissionEndsAt(null);
  }

  useEffect(() => {
    if (!intermissionEndsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 50);
    return () => clearInterval(id);
  }, [intermissionEndsAt]);

  // TEMP (single player visual layout)
  const playerId = "local-player";
  const seats = [{ seatIndex: 0, playerId: "local-player", name: "You" }];
  const maxSeats = 6;

  // --- helpers ---
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

  function openBetModal() {
    setState(null);
    payoutCreditedRef.current = false;
    stopIntermission();
    setBetModalOpen(true);

    // (we're between hands, so reserved should already be 0, but keeping this safe)
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

  function dealHand() {
    const wager = betTotal;
    if (wager <= 0) return;

    // ✅ bankroll does NOT visually drop here anymore.
    // We just "reserve" the wager so you can't bet/double/split beyond your bankroll.
    if (wager > availableBankroll) return;

    setReserved(wager);

    const next = shoeRef.current ? startHand(wager, shoeRef.current) : startHand(wager);
    shoeRef.current = next.deck;

    payoutCreditedRef.current = false;
    stopIntermission();

    setState(next);
    setBetModalOpen(false);
  }

  function getChipValues(currentAvailable: number) {
    const base = [5, 10, 25, 100, 500];
    if (currentAvailable >= 5000) base.push(5000);
    return base;
  }

  function addChip(v: number) {
    if (betTotal + v > availableBankroll) return;
    setBetChips((prev) => [...prev, v]);
  }

  // ---- Derived: hands for table ----
  const handsByPlayerId = useMemo(() => {
    if (!state) {
      return { [playerId]: { hands: [], totalLabel: "", isActing: false } };
    }

    const youHands = state.playerHands.map((h, idx) => {
      const t = handTotal(h.cards);
      const low = t.soft ? t.total - 10 : t.total;
      const high = t.total;
      const totalLabel = t.soft && low !== high ? `${low} / ${high}` : `${high}`;

      return {
        cards: h.cards,
        bet: h.bet,
        isActive:
          state.phase === "player" &&
          idx === state.currentHand &&
          h.outcome === "playing",
        totalLabel,
      };
    });

    const totals = youHands.map((h) => h.totalLabel);
    const totalLabel =
      youHands.length === 1 ? `Total ${totals[0]}` : `Totals ${totals.join(" | ")}`;

    return {
      [playerId]: {
        hands: youHands.map(({ cards, bet, isActive }) => ({ cards, bet, isActive })),
        totalLabel,
        isActing: state.phase === "player",
      },
    };
  }, [state, playerId]);

  const dealerTotalLabel = useMemo(() => {
    if (!state) return "";
    const dealerT = handTotal(state.dealer);
    const dealerLow = dealerT.soft ? dealerT.total - 10 : dealerT.total;
    const dealerHigh = dealerT.total;

    return state.revealDealer
      ? `Total ${
          dealerT.soft && dealerLow !== dealerHigh ? `${dealerLow} / ${dealerHigh}` : `${dealerHigh}`
        }`
      : "";
  }, [state]);

  const dealerCards = useMemo(() => {
    if (!state) return [];
    return state.dealer.map((c, idx) => ({
      rank: c.rank,
      suit: c.suit,
      hidden: !state.revealDealer && idx === 1,
    }));
  }, [state]);

  // ---- Dealer autoplay (flip, then draw cards with delays) ----
  const dealerSeqRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    running: boolean;
  }>({ timer: null, running: false });

  function stopDealerSequence() {
    if (dealerSeqRef.current.timer) clearTimeout(dealerSeqRef.current.timer);
    dealerSeqRef.current = { timer: null, running: false };
  }

  useEffect(() => {
    if (mode !== "game") return;
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
  }, [mode, state?.phase]);

  // ---- Credit payout once & start 10s intermission ----
  useEffect(() => {
    if (!state) return;

    const finished = state.phase === "settled";
    if (!finished) {
      stopIntermission();
      return;
    }

    if (!payoutCreditedRef.current) {
      // ✅ bankroll changes ONLY here (end of hand)
      // totalPayout(state) is net profit/loss (positive/negative/0).
      const profit = totalPayout(state);

      safeSetBankroll((b) => b + profit);
      showBankrollDelta(profit);

      // release all reserved money when hand ends
      setReserved(0);

      payoutCreditedRef.current = true;
      shoeRef.current = state.deck;

      startIntermission();
    }
  }, [state]);

  // ---- When countdown finishes, auto-open bet modal ----
  useEffect(() => {
    if (!intermissionEndsAt) return;
    if (betModalOpen) return;

    const left = intermissionEndsAt - nowTick;
    if (left <= 0) {
      openBetModal();
      stopIntermission();
    }
  }, [intermissionEndsAt, nowTick, betModalOpen]);

  // ---- Action affordability ----
  const currentHandBet = useMemo(() => {
    if (!state) return 0;
    const h = state.playerHands[state.currentHand];
    return h?.bet ?? 0;
  }, [state]);

  const canDoubleWithBankroll = useMemo(() => {
    if (!state) return false;
    // must have enough unreserved funds to add another bet of currentHandBet
    return state.phase === "player" && canDouble(state) && availableBankroll >= currentHandBet;
  }, [state, availableBankroll, currentHandBet]);

  const canSplitWithBankroll = useMemo(() => {
    if (!state) return false;
    return state.phase === "player" && canSplit(state) && availableBankroll >= currentHandBet;
  }, [state, availableBankroll, currentHandBet]);

  return (
    <SafeAreaView style={styles.container}>
      {mode === "lobby" ? (
        <LobbyScreen
          onStartGame={(code) => {
            setRoomCode(code);
            setMode("game");
            setState(null);
            payoutCreditedRef.current = false;
            stopIntermission();
            setBetModalOpen(true);
            setBankrollDelta(null);
            setBetChips([]);
            setReserved(0);
          }}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.gameContent}
          showsVerticalScrollIndicator={false}
        >
          {/* TOP BAR */}
          <View style={styles.topBar}>
            {/* LEFT */}
            <View style={styles.topBarSide}>
              <Text style={styles.brand}>BLACKJACK</Text>
              <Text style={styles.meta}>Room: {roomCode || "local"}</Text>
            </View>

            {/* CENTER BANKROLL */}
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

            {/* RIGHT */}
            <View style={[styles.topBarSide, { alignItems: "flex-end" }]}>
              <Pressable onPress={() => setMode("lobby")} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Lobby</Text>
              </Pressable>

              <Pressable onPress={resetSession} style={[styles.smallBtn, { marginTop: 8 }]}>
                <Text style={styles.smallBtnText}>Reset</Text>
              </Pressable>
            </View>
          </View>

          {/* TABLE ALWAYS VISIBLE */}
          <PokerTableLayout
            seats={seats}
            dealerTotalLabel={state ? dealerTotalLabel : ""}
            maxSeats={maxSeats}
            myPlayerId={playerId}
            dealerName="Dealer"
            dealerCards={dealerCards}
            handsByPlayerId={handsByPlayerId}
            CardView={({ rank, suit, hidden }) => <CardView rank={rank} suit={suit} hidden={hidden} />}
          />

          {/* ACTION BAR */}
          <View style={styles.actionBar}>
            <Text style={styles.actionStatus}>
              {!state
                ? "Place a bet to deal."
                : state.phase === "player"
                ? "Make your move"
                : state.phase === "dealer"
                ? "Dealer is playing…"
                : "Game over — next game loading…"}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setState((s) => (s ? hit(s) : s))}
                disabled={!state || state.phase !== "player" || isHandFinished || inIntermission}
                style={({ pressed }) => [
                  styles.actionBtn,
                  !state || state.phase !== "player" || isHandFinished || inIntermission
                    ? styles.actionBtnDisabled
                    : null,
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>Hit</Text>
              </Pressable>

              <Pressable
                onPress={() => setState((s) => (s ? stand(s) : s))}
                disabled={!state || state.phase !== "player" || isHandFinished || inIntermission}
                style={({ pressed }) => [
                  styles.actionBtn,
                  !state || state.phase !== "player" || isHandFinished || inIntermission
                    ? styles.actionBtnDisabled
                    : null,
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>Stand</Text>
              </Pressable>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => {
                  if (!state) return;
                  if (!canDoubleWithBankroll) return;

                  // ✅ reserve the additional bet instead of subtracting bankroll
                  safeSetReserved((r) => r + currentHandBet);

                  setState((s) => (s ? doubleDown(s) : s));
                }}
                disabled={!canDoubleWithBankroll || isHandFinished || inIntermission}
                style={({ pressed }) => [
                  styles.actionBtnAlt,
                  !canDoubleWithBankroll || isHandFinished || inIntermission
                    ? styles.actionBtnDisabled
                    : null,
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>Double</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!state) return;
                  if (!canSplitWithBankroll) return;

                  // ✅ reserve the additional bet instead of subtracting bankroll
                  safeSetReserved((r) => r + currentHandBet);

                  setState((s) => (s ? split(s) : s));
                }}
                disabled={!canSplitWithBankroll || isHandFinished || inIntermission}
                style={({ pressed }) => [
                  styles.actionBtnAlt,
                  !canSplitWithBankroll || isHandFinished || inIntermission
                    ? styles.actionBtnDisabled
                    : null,
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>Split</Text>
              </Pressable>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setBetModalOpen(true)}
                disabled={inIntermission}
                style={({ pressed }) => [
                  styles.actionBtnWide,
                  inIntermission ? styles.actionBtnDisabled : null,
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>{state ? "Bet Next Hand" : "Bet / Deal"}</Text>
              </Pressable>
            </View>
          </View>

          {/* 10s INTERMISSION OVERLAY */}
          {inIntermission && (
            <View style={styles.continueOverlay} pointerEvents="none">
              <View style={styles.continueCard}>
                <Text style={styles.continueTitle}>Game Over</Text>
                <Text style={styles.continueSub}>Next game loading…</Text>

                <ActivityIndicator style={{ marginTop: 8 }} />

                {(() => {
                  const left = Math.max(0, (intermissionEndsAt ?? 0) - nowTick);
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

          {/* BET MODAL OVERLAY */}
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

                {/* MIDDLE: chip stack */}
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

                {/* BOTTOM: selectable chips */}
                <View style={styles.chipTray}>
                  {getChipValues(availableBankroll).map((v) => {
                    const color = chipColorForValue(v);
                    const disabled = betTotal + v > availableBankroll;
                    return (
                      <Chip
                        key={v}
                        value={v}
                        color={color}
                        disabled={disabled}
                        onPress={() => addChip(v)}
                        size={66}
                      />
                    );
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
                  <Text style={styles.dealBtnText}>DEAL</Text>
                </Pressable>

                <Text style={styles.betHint}>
                  Tap outside to close. Build your bet with chips, then press{" "}
                  <Text style={{ fontWeight: "900" }}>DEAL</Text>.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** ---------- Styles ---------- */
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";

import LobbyScreen from "./LobbyScreen";
import PokerTableLayout from "./PokerTableLayout";

import { subscribeTable, type TableDoc } from "../lobby/firestoreLobby";
import { getOrCreatePlayerId } from "../lobby/identity";
import { playerAction, hostDealerStep, hostAdvanceIntermission, startSharedRound } from "../lobby/gameSync";
import { handTotal } from "../engine/blackjack";

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

export default function MultiplayerGameScreen({
  roomCode,
  onExit,
}: {
  roomCode: string;
  onExit: () => void;
}) {
  const [playerId, setPlayerId] = useState<string>("");
  const [table, setTable] = useState<TableDoc | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const id = await getOrCreatePlayerId();
      setPlayerId(id);
    })();
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeTable(roomCode, setTable);
    return () => unsub();
  }, [roomCode]);

  const youSeat = useMemo(() => {
    if (!table || !playerId) return null;
    return table.seats.find((s) => s.playerId === playerId) ?? null;
  }, [table, playerId]);

  const isHost = useMemo(() => {
    if (!table || !youSeat) return false;
    return youSeat.isHost === true;
  }, [table, youSeat]);

  const game = table?.game ?? null;

  // Host driver loop for dealer phase
  useEffect(() => {
    if (!table || !game) return;
    if (!isHost) return;

    if (game.phase !== "dealer") return;

    const id = setInterval(async () => {
      try {
        await hostDealerStep(roomCode, playerId);
      } catch {
        // ignore transient
      }
    }, 900);

    return () => clearInterval(id);
  }, [table?.hostId, game?.phase, isHost, roomCode, playerId]);

  // Host driver loop for intermission -> betting
  useEffect(() => {
    if (!table || !game) return;
    if (!isHost) return;

    if (game.phase !== "intermission") return;

    const id = setInterval(async () => {
      try {
        await hostAdvanceIntermission(roomCode, playerId);
      } catch {
        // ignore
      }
    }, 500);

    return () => clearInterval(id);
  }, [game?.phase, isHost, roomCode, playerId]);

  const actingPlayerId = useMemo(() => {
    if (!game) return "";
    if (game.phase !== "round_player") return "";
    return game.players[game.actingPlayerIndex]?.playerId ?? "";
  }, [game]);

  const isYourTurn = !!playerId && actingPlayerId === playerId;

  const myPlayer = useMemo(() => {
    if (!game || !playerId) return null;
    return game.players.find((p) => p.playerId === playerId) ?? null;
  }, [game, playerId]);

  const handsByPlayerId = useMemo(() => {
    if (!game) return {};
    const out: Record<string, any> = {};

    for (const p of game.players) {
      const isActing = game.phase === "round_player" && p.playerId === actingPlayerId;
      out[p.playerId] = {
        hands: p.hands.map((h, idx) => ({
          cards: h.cards,
          bet: h.bet,
          isActive:
            isActing &&
            idx === p.currentHand &&
            h.outcome === "playing",
        })),
        totalLabel: "",
        isActing,
      };
    }

    return out;
  }, [game, actingPlayerId]);

  const revealDealer = !!game?.revealDealer || (game?.phase !== "round_player" && game?.phase !== "betting");

  const dealerCards = useMemo(() => {
    if (!game) return [];
    return game.dealer.map((c, idx) => ({
      rank: c.rank,
      suit: c.suit,
      hidden: !revealDealer && idx === 1,
    }));
  }, [game, revealDealer]);

  const dealerTotalLabel = useMemo(() => {
    if (!game) return "";
    if (!revealDealer) return "";
    const t = handTotal(game.dealer);
    const low = t.soft ? t.total - 10 : t.total;
    const high = t.total;
    return `Total ${t.soft && low !== high ? `${low} / ${high}` : `${high}`}`;
  }, [game, revealDealer]);

  const actionStatus = useMemo(() => {
    if (!game) return "Waiting for game…";
    if (game.phase === "betting") return isHost ? "Host: start next round when ready." : "Waiting for host to start…";
    if (game.phase === "round_player") return isYourTurn ? "Your turn" : "Waiting for other player…";
    if (game.phase === "dealer") return "Dealer is playing…";
    if (game.phase === "intermission") return "Next round loading…";
    if (game.phase === "settled") return "Round settled.";
    return "…";
  }, [game, isYourTurn, isHost]);

  async function doAction(a: "hit" | "stand" | "double" | "split") {
    if (!game) return;
    setError("");
    try {
      await playerAction(roomCode, playerId, a);
    } catch (e: any) {
      setError(e?.message ?? "Action failed");
    }
  }

  const seats = table?.seats ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gameContent} showsVerticalScrollIndicator={false}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topBarSide}>
            <Text style={styles.brand}>BLACKJACK</Text>
            <Text style={styles.meta}>Room: {roomCode}</Text>
          </View>

          <View style={[styles.topBarSide, { alignItems: "flex-end" }]}>
            <Pressable onPress={onExit} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>Lobby</Text>
            </Pressable>

            {isHost && game?.phase === "betting" ? (
              <Pressable
                onPress={async () => {
                  setError("");
                  try {
                    await startSharedRound(roomCode);
                  } catch (e: any) {
                    setError(e?.message ?? "Failed to start round");
                  }
                }}
                style={[styles.smallBtn, { marginTop: 8, backgroundColor: "#22c55e" }]}
              >
                <Text style={styles.smallBtnText}>Start Round</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <PokerTableLayout
          seats={seats.map((s) => ({
            seatIndex: s.seatIndex,
            playerId: s.playerId ?? undefined,
            name: s.name ?? undefined,
            isHost: s.isHost,
            isReady: s.isReady,
          }))}
          maxSeats={seats.length || 7}
          myPlayerId={playerId || "unknown"}
          dealerName="Dealer"
          dealerCards={dealerCards}
          dealerTotalLabel={dealerTotalLabel}
          handsByPlayerId={handsByPlayerId}
          CardView={({ rank, suit, hidden }: { rank: string; suit: string; hidden?: boolean }) => <CardView rank={rank} suit={suit} hidden={hidden} />}
        />

        <View style={styles.actionBar}>
          <Text style={styles.actionStatus}>{actionStatus}</Text>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          {game?.phase === "intermission" ? (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <ActivityIndicator />
            </View>
          ) : null}

          {/* ACTIONS (only when it's your turn) */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => doAction("hit")}
              disabled={!game || game.phase !== "round_player" || !isYourTurn}
              style={({ pressed }) => [
                styles.actionBtn,
                (!game || game.phase !== "round_player" || !isYourTurn) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Hit</Text>
            </Pressable>

            <Pressable
              onPress={() => doAction("stand")}
              disabled={!game || game.phase !== "round_player" || !isYourTurn}
              style={({ pressed }) => [
                styles.actionBtn,
                (!game || game.phase !== "round_player" || !isYourTurn) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Stand</Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => doAction("double")}
              disabled={!game || game.phase !== "round_player" || !isYourTurn}
              style={({ pressed }) => [
                styles.actionBtnAlt,
                (!game || game.phase !== "round_player" || !isYourTurn) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Double</Text>
            </Pressable>

            <Pressable
              onPress={() => doAction("split")}
              disabled={!game || game.phase !== "round_player" || !isYourTurn}
              style={({ pressed }) => [
                styles.actionBtnAlt,
                (!game || game.phase !== "round_player" || !isYourTurn) ? styles.actionBtnDisabled : null,
                pressed ? styles.actionBtnPressed : null,
              ]}
            >
              <Text style={styles.actionBtnText}>Split</Text>
            </Pressable>
          </View>
        </View>

        {/* If you're not seated, show a hint */}
        {!youSeat ? (
          <View style={styles.notSeated}>
            <Text style={styles.notSeatedText}>
              You are not seated in this table. Go back to the lobby and join again.
            </Text>
          </View>
        ) : null}
      </ScrollView>
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

  err: {
    color: "#b91c1c",
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#1b0b24",
    backgroundColor: "#fecaca",
  },

  notSeated: {
    borderRadius: 18,
    borderWidth: 4,
    borderColor: "#1b0b24",
    backgroundColor: "#ffd24a",
    padding: 12,
  },
  notSeatedText: {
    color: "#1b0b24",
    fontWeight: "900",
    textAlign: "center",
  },
});

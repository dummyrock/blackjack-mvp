import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable } from "react-native";
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

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

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

function DealerView({ state }: { state: GameState }) {
  const totalInfo = handTotal(state.dealer);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Dealer</Text>

      <View style={styles.cardRow}>
        {state.dealer.map((c, idx) => (
          <CardView
            key={idx}
            rank={c.rank}
            suit={c.suit}
            hidden={!state.revealDealer && idx === 1}
          />
        ))}
      </View>

      {state.revealDealer ? (
        <Text style={styles.sub}>
          Total: {totalInfo.total}
          {totalInfo.soft ? " (soft)" : ""}
        </Text>
      ) : null}
    </View>
  );
}

function PlayerHandsView({ state }: { state: GameState }) {
  return (
    <View style={{ gap: 10 }}>
      {state.playerHands.map((h, i) => {
        const t = handTotal(h.cards);
        const isActive =
          state.phase === "player" &&
          i === state.currentHand &&
          h.outcome === "playing";

        const title =
          state.playerHands.length > 1
            ? `You — Hand ${i + 1}${isActive ? " (active)" : ""}`
            : "You";

        return (
          <View
            key={i}
            style={[styles.panel, isActive ? styles.activePanel : null]}
          >
            <Text style={styles.title}>{title}</Text>

            <View style={styles.cardRow}>
              {h.cards.map((c, idx) => (
                <CardView key={idx} rank={c.rank} suit={c.suit} />
              ))}
            </View>

            <Text style={styles.sub}>
              Total: {t.total}
              {t.soft ? " (soft)" : ""} • Bet: {h.bet}
              {h.doubled ? " (doubled)" : ""}
            </Text>

            {h.outcome !== "playing" ? (
              <Text style={styles.sub}>
                Outcome: {h.outcome}
                {typeof h.payout === "number" ? ` • Payout: ${h.payout}` : ""}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function App() {
  const [state, setState] = useState<GameState>(() => startHand(1));

  // Dealer animates one step at a time
  useEffect(() => {
    if (state.phase !== "dealer") return;

    const t = setTimeout(() => {
      setState((s) => dealerStep(s));
    }, 700);

    return () => clearTimeout(t);
  }, [state.phase, state.dealer.length]);

  const statusText = useMemo(() => {
    if (state.phase === "player") return "Your move";
    if (state.phase === "dealer") return "Dealer playing...";
    const p = totalPayout(state);
    return `Hand complete. Total payout: ${p}`;
  }, [state]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Blackjack MVP</Text>

      <Text style={styles.deck}>Deck remaining: {state.deck.length}</Text>

      <DealerView state={state} />
      <PlayerHandsView state={state} />

      <Text style={styles.status}>{statusText}</Text>

      <View style={styles.row}>
        <Button
          label="Hit"
          onPress={() => setState((s) => hit(s))}
          disabled={state.phase !== "player"}
        />
        <Button
          label="Stand"
          onPress={() => setState((s) => stand(s))}
          disabled={state.phase !== "player"}
        />
      </View>

      <View style={styles.row}>
        <Button
          label="Double"
          onPress={() => setState((s) => doubleDown(s))}
          disabled={state.phase !== "player" || !canDouble(state)}
        />
        <Button
          label="Split"
          onPress={() => setState((s) => split(s))}
          disabled={state.phase !== "player" || !canSplit(state)}
        />
      </View>

      <View style={styles.row}>
        <Button label="New Hand" onPress={() => setState((s) => startHand(1, s.deck))} />
      </View>

      <Text style={styles.footer}>
        Rules: 6-deck shoe • dealer stands soft 17 • blackjack pays 3:2
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#0b1220" },
  header: { fontSize: 28, fontWeight: "700", color: "white" },
  deck: { fontSize: 16, color: "#cbd5e1" },

  panel: { padding: 12, borderRadius: 12, backgroundColor: "#111b33", gap: 8 },
  activePanel: { borderWidth: 2, borderColor: "#60a5fa" },

  title: { fontSize: 16, fontWeight: "600", color: "#e2e8f0" },
  sub: { fontSize: 14, color: "#cbd5e1" },

  status: { fontSize: 18, fontWeight: "600", color: "white", marginTop: 6 },

  row: { flexDirection: "row", gap: 12 },

  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#2563eb",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  buttonDisabled: { backgroundColor: "#334155" },
  buttonPressed: { transform: [{ scale: 0.98 }] },

  footer: { marginTop: "auto", color: "#94a3b8", fontSize: 12 },

  // --- Card UI ---
  cardRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },

  card: {
    width: 64,
    height: 92,
    borderRadius: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 6,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardBack: {
    backgroundColor: "#1e293b",
    borderColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBackText: { color: "white", fontSize: 20, fontWeight: "800" },

  cardCorner: { fontSize: 14, fontWeight: "800" },
  cardCornerBottom: { fontSize: 14, fontWeight: "800", alignSelf: "flex-end" },
  cardCenter: { fontSize: 34, fontWeight: "900", alignSelf: "center" },
});

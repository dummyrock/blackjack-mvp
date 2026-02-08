// src/screens/PokerTableLayout.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function PokerTableLayout({
  seats,
  handsByPlayerId,
  CardView,
  myPlayerId,
  dealerName,
  dealerCards,
  dealerTotalLabel,
}: any) {
  const myPlayer = seats.find((s: any) => s.playerId === myPlayerId);
  const otherPlayers = seats.filter((s: any) => s.playerId && s.playerId !== myPlayerId);

  return (
    <View style={styles.container}>
      {/* DEALER AT TOP */}
      <View style={styles.dealerSection}>
        <Text style={styles.dealerName}>{dealerName}</Text>
        <View style={styles.cardsRow}>
          {dealerCards?.map((c: any, idx: number) => (
            <CardView key={idx} rank={c.rank} suit={c.suit} hidden={c.hidden} />
          ))}
        </View>
        {dealerTotalLabel ? <Text style={styles.dealerTotal}>{dealerTotalLabel}</Text> : null}
      </View>

      {/* MIDDLE: OTHER PLAYERS ON SIDES */}
      <View style={styles.middleSection}>
        {/* LEFT PLAYERS */}
        {otherPlayers.length > 0 && (
          <View style={styles.sidePlayersLeft}>
            {otherPlayers.slice(0, 3).map((s: any) => {
              const h = handsByPlayerId[s.playerId];
              if (!h) return null;
              return (
                <View key={s.playerId} style={styles.sidePlayer}>
                  <Text style={styles.sidePlayerName}>{s.name}</Text>
                  <View style={styles.sideCardsRow}>
                    {h.hands[0]?.cards?.map((c: any, j: number) => (
                      <CardView key={j} rank={c.rank} suit={c.suit} />
                    )) ?? null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* RIGHT PLAYERS */}
        {otherPlayers.length > 3 && (
          <View style={styles.sidePlayersRight}>
            {otherPlayers.slice(3).map((s: any) => {
              const h = handsByPlayerId[s.playerId];
              if (!h) return null;
              return (
                <View key={s.playerId} style={styles.sidePlayer}>
                  <Text style={styles.sidePlayerName}>{s.name}</Text>
                  <View style={styles.sideCardsRow}>
                    {h.hands[0]?.cards?.map((c: any, j: number) => (
                      <CardView key={j} rank={c.rank} suit={c.suit} />
                    )) ?? null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* YOUR HAND AT BOTTOM */}
      {myPlayer && (
        <View style={styles.playerSection}>
          <Text style={styles.playerName}>{myPlayer.name} (You)</Text>
          <View style={styles.playerHandsContainer}>
            {handsByPlayerId[myPlayerId]?.hands?.map((hand: any, i: number) => (
              <View
                key={i}
                style={[
                  styles.playerHandBox,
                  hand.isActive && styles.activeHand,
                ]}
              >
                <View style={styles.cardsRow}>
                  {hand.cards.map((c: any, j: number) => (
                    <CardView key={j} rank={c.rank} suit={c.suit} />
                  ))}
                </View>
                <Text style={styles.handInfo}>
                  Bet: {hand.bet}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    gap: 16,
  },

  dealerSection: {
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1a0f2e",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#ffd24a",
  },

  dealerName: {
    color: "#ffd24a",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },

  cardsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 6,
  },

  dealerTotal: {
    color: "#ffe29a",
    fontSize: 14,
    fontWeight: "900",
  },

  middleSection: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },

  sidePlayersLeft: {
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  sidePlayersRight: {
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  sidePlayer: {
    backgroundColor: "#2b0b3a",
    borderRadius: 14,
    padding: 10,
    borderWidth: 2,
    borderColor: "#ff4d8d",
    alignItems: "center",
    minWidth: 120,
  },

  sidePlayerName: {
    color: "#fff7d6",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
  },

  sideCardsRow: {
    flexDirection: "row",
    gap: 4,
  },

  playerSection: {
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1a0f2e",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#ff4d8d",
  },

  playerName: {
    color: "#ff4d8d",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },

  playerHandsContainer: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },

  playerHandBox: {
    backgroundColor: "#0a051f",
    borderRadius: 14,
    padding: 10,
    borderWidth: 2,
    borderColor: "#66666680",
    alignItems: "center",
  },

  activeHand: {
    borderColor: "#22c55e",
    borderWidth: 3,
  },

  handInfo: {
    color: "#ffe29a",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 6,
  },
});

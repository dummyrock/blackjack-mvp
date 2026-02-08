import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";

type Seat = {
  seatIndex: number;
  playerId?: string;
  name?: string;
  isHost?: boolean;
  isReady?: boolean;
};

type PlayerHand = {
  hands: {
    cards: { rank: string; suit: string }[];
    bet?: number;
    isActive?: boolean;
  }[];
  totalLabel?: string;
  isActing?: boolean;
};

type Props = {
  seats: Seat[];
  maxSeats: number;
  myPlayerId: string;
  dealerTotalLabel?: string;

  dealerName?: string;
  dealerCards?: { rank: string; suit: string; hidden?: boolean }[];

  handsByPlayerId: Record<string, PlayerHand | undefined>;

  CardView: (p: { rank: string; suit: string; hidden?: boolean }) => React.ReactElement;
};

type PositionedSeat = Seat & {
  rel: number;
  x: number;
  y: number;
};

function cardValue(rank: string) {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
}

function totalLabelFor(cards: { rank: string; suit: string }[]) {
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

  const soft = aces > 0;
  const low = soft ? total - 10 : total;
  const high = total;

  if (soft && low !== high) return `${low} / ${high}`;
  return `${high}`;
}

export default function PokerTableLayout({
  seats,
  maxSeats,
  myPlayerId,
  dealerName = "Dealer",
  dealerCards = [],
  handsByPlayerId,
  dealerTotalLabel = "",
  CardView,
}: Props) {
  const youSeatIndex = useMemo(() => {
    const seat = seats.find((s) => s.playerId === myPlayerId);
    return seat?.seatIndex ?? 0;
  }, [seats, myPlayerId]);

  const { width, height } = Dimensions.get("window");
  const tableSize = Math.min(width - 24, height * 0.62, 820);

  const positionedSeats: PositionedSeat[] = useMemo(() => {
    const rx = tableSize * 0.43;
    const ry = tableSize * 0.30;

    const cx = tableSize / 2;
    const cy = tableSize / 2 + 10;

    return seats.map((s) => {
      const rel = (s.seatIndex - youSeatIndex + maxSeats) % maxSeats;

      if (rel === 0) {
        return { ...s, rel, x: cx, y: cy + ry + 48 };
      }

      const t = rel / maxSeats;
      const angle = -Math.PI / 2 + t * 2 * Math.PI;

      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle) - 40;

      return { ...s, rel, x, y };
    });
  }, [seats, youSeatIndex, maxSeats, tableSize]);

  const youSeat = positionedSeats.find((s) => s.playerId === myPlayerId);
  const you: PlayerHand = handsByPlayerId[youSeat?.playerId ?? ""] ?? { hands: [] };
  const isSplit = (you?.hands?.length ?? 0) > 1;

  // Immediate neighbors (visual left/right)
  const leftNeighbor = positionedSeats.find((s) => s.rel === maxSeats - 1 && s.playerId && s.playerId !== myPlayerId);
  const rightNeighbor = positionedSeats.find((s) => s.rel === 1 && s.playerId && s.playerId !== myPlayerId);

  function NeighborBlock({ seat, side }: { seat: PositionedSeat; side: "left" | "right" }) {
    const hand = seat.playerId ? handsByPlayerId[seat.playerId] : undefined;
    const first = hand?.hands?.[0];
    const cards = first?.cards ?? [];

    return (
      <View
        style={[
          styles.neighborBlock,
          side === "left" ? styles.neighborLeft : styles.neighborRight,
        ]}
      >
        <Text style={styles.neighborName} numberOfLines={1}>
          {seat.name ?? "Player"}
        </Text>

        <View style={styles.neighborCards}>
          {(cards.length ? cards : [{ rank: "?", suit: "?" }, { rank: "?", suit: "?" }]).slice(0, 2).map((c, idx) => (
            <View key={idx} style={{ marginRight: -16 }}>
              <CardView rank={c.rank} suit={c.suit} hidden />
            </View>
          ))}
        </View>
      </View>
    );
  }

  const dealerTotalRow = (
    <View style={styles.dealerRow}>
      <Text style={styles.dealerTitle}>{dealerName}</Text>

      <View style={styles.dealerCards}>
        {dealerCards.map((c, idx) => (
          <View key={idx} style={{ marginRight: -14 }}>
            <CardView rank={c.rank} suit={c.suit} hidden={c.hidden} />
          </View>
        ))}
      </View>

      {dealerTotalLabel ? <Text style={styles.dealerTotalText}>{dealerTotalLabel}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.table, { width: tableSize, height: tableSize }]}>
        <View style={styles.dealerTop}>{dealerTotalRow}</View>

        <View style={styles.centerBadge}>
          <Text style={styles.centerBadgeText}>BLACKJACK</Text>
        </View>

        {/* LEFT/RIGHT NEIGHBORS near your hand */}
        {leftNeighbor ? <NeighborBlock seat={leftNeighbor} side="left" /> : null}
        {rightNeighbor ? <NeighborBlock seat={rightNeighbor} side="right" /> : null}

        {/* YOU: cards only, with bet + total underneath. Split hands side-by-side */}
        <View style={styles.youArea}>
          <View style={[styles.youHandsWrap, isSplit ? styles.youHandsWrapSplit : null]}>
            {(you?.hands ?? []).map((h, i) => {
              const total = totalLabelFor(h.cards);
              const bet = h.bet ?? 0;

              return (
                <View
                  key={i}
                  style={[
                    styles.handBlock,
                    isSplit ? styles.handBlockSplit : null,
                    h.isActive ? styles.handBlockActive : null,
                  ]}
                >
                  <View style={styles.youCardsRow}>
                    {h.cards.map((c, idx) => (
                      <View key={idx} style={[styles.youCardSlot, idx > 0 ? styles.overlap : null]}>
                        <CardView rank={c.rank} suit={c.suit} />
                      </View>
                    ))}
                  </View>

                  <View style={styles.underPill}>
                    <Text style={styles.underText}>Bet {bet}</Text>
                    <Text style={styles.underText}>Total {total}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },

  table: {
    borderRadius: 28,
    backgroundColor: "#2ee6a6",
    borderWidth: 4,
    borderColor: "#1b0b24",
    overflow: "hidden",
  },

  dealerTop: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    alignItems: "center",
  },
  dealerRow: {
    width: "100%",
    alignItems: "center",
  },
  dealerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1b0b24",
    letterSpacing: 1,
    marginBottom: 8,
  },
  dealerCards: {
    flexDirection: "row",
    alignItems: "center",
  },
  dealerTotalText: {
    marginTop: 6,
    color: "#000",
    fontWeight: "900",
  },

  centerBadge: {
    position: "absolute",
    top: "44%",
    left: "50%",
    transform: [{ translateX: -70 }],
    width: 140,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff7d6",
    borderWidth: 4,
    borderColor: "#1b0b24",
    alignItems: "center",
  },
  centerBadgeText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 1,
  },

  // Neighbors sit beside you near the bottom
  neighborBlock: {
    position: "absolute",
    bottom: 130,
    width: 150,
    padding: 10,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: "#1b0b24",
    backgroundColor: "#fff7d6",
    alignItems: "center",
    gap: 8,
  },
  neighborLeft: {
    left: 12,
  },
  neighborRight: {
    right: 12,
  },
  neighborName: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
    maxWidth: "100%",
  },
  neighborCards: {
    flexDirection: "row",
    alignItems: "center",
  },

  // === YOU AREA ===
  youArea: {
    position: "absolute",
    bottom: 14,
    left: 12,
    right: 12,
    alignItems: "center",
  },

  youHandsWrap: {
    width: "100%",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  youHandsWrapSplit: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  handBlock: {
    alignItems: "center",
    justifyContent: "center",
  },
  handBlockSplit: { flex: 1 },
  handBlockActive: { transform: [{ scale: 1.01 }] },

  youCardsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  youCardSlot: {},
  overlap: { marginLeft: -18 },

  underPill: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff7d6",
    borderWidth: 3,
    borderColor: "#1b0b24",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  underText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});

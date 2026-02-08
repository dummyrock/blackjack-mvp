import React, { useMemo, useState } from "react";
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
  centerContent?: React.ReactNode;
  compact?: boolean;
};

type PositionedSeat = Seat & {
  rel: number;
  x: number;
  y: number;
};

function cardValue(rank: string) {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  const n = Number(rank);
  return Number.isNaN(n) ? null : n;
}

function totalLabelFor(cards: { rank: string; suit: string }[]) {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    const v = cardValue(c.rank);
    if (v == null) return "";
    total += v;
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
  centerContent,
  compact = false,
}: Props) {
  const isCompact = compact === true;
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const youSeatIndex = useMemo(() => {
    const seat = seats.find((s) => s.playerId === myPlayerId);
    return seat?.seatIndex ?? 0;
  }, [seats, myPlayerId]);

  const { width: windowWidth, height: windowHeight } = Dimensions.get("window");
  const tableWidth = Math.max(0, (layout.width || windowWidth) - 6);
  const tableHeight = Math.max(0, (layout.height || windowHeight) - 6);

  const positionedSeats: PositionedSeat[] = useMemo(() => {
    const rx = tableWidth * 0.43;
    const ry = tableHeight * 0.30;

    const cx = tableWidth / 2;
    const cy = tableHeight / 2 + 10;

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
  }, [seats, youSeatIndex, maxSeats, tableWidth, tableHeight]);

  const youSeat = positionedSeats.find((s) => s.playerId === myPlayerId);
  const you: PlayerHand = handsByPlayerId[youSeat?.playerId ?? ""] ?? { hands: [] };
  const isSplit = (you?.hands?.length ?? 0) > 1;

  // Immediate neighbors (visual left/right)
  const leftNeighbor = positionedSeats.find((s) => s.rel === maxSeats - 1 && s.playerId && s.playerId !== myPlayerId);
  const rightNeighbor = positionedSeats.find((s) => s.rel === 1 && s.playerId && s.playerId !== myPlayerId);

  function NeighborBlock({ seat, side }: { seat: PositionedSeat; side: "left" | "right" }) {
    const hand = seat.playerId ? handsByPlayerId[seat.playerId] : undefined;
    const hands = hand?.hands ?? [];
    const fallbackHands: PlayerHand["hands"] = [
      { cards: [{ rank: "?", suit: "?" }, { rank: "?", suit: "?" }], isActive: false },
    ];
    const renderHands = hands.length ? hands : fallbackHands;

    return (
      <View
        style={[
          styles.neighborBlock,
          isCompact ? styles.neighborBlockCompact : null,
          side === "left" ? styles.neighborLeft : styles.neighborRight,
        ]}
      >
        <Text style={[styles.neighborName, isCompact ? styles.neighborNameCompact : null]} numberOfLines={1}>
          {seat.name ?? "Player"}
        </Text>

        <View style={styles.neighborHandsWrap}>
          {renderHands.map((h, handIdx) => {
            const cards = h.cards ?? [];
            const totalLabel = cards.length ? totalLabelFor(cards) : "";
            const isActive = h.isActive === true;
            return (
              <View key={handIdx} style={[styles.neighborHandBox, isActive ? styles.neighborHandActive : null]}>
                <View style={styles.neighborCards}>
                  {(cards.length ? cards : [{ rank: "?", suit: "?" }, { rank: "?", suit: "?" }]).map((c, idx) => {
                    const isPlaceholder = c.rank === "?" && c.suit === "?";
                    return (
                      <View key={idx} style={{ marginRight: -16 }}>
                        <CardView rank={c.rank} suit={c.suit} hidden={isPlaceholder} />
                      </View>
                    );
                  })}
                </View>

                {totalLabel ? (
                  <View style={styles.neighborPill}>
                    <Text style={[styles.neighborPillText, isCompact ? styles.neighborPillTextCompact : null]}>
                      Total {totalLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const playerHandCenter = useMemo(() => {
    const seat = positionedSeats.find((s) => s.playerId === myPlayerId);
    if (!seat) return { x: tableWidth / 2, y: tableHeight / 2 };
    return { x: seat.x, y: seat.y };
  }, [positionedSeats, myPlayerId, tableWidth, tableHeight]);

  const centerY = isCompact
    ? Math.min(tableHeight * 0.5, playerHandCenter.y - tableHeight * 0.2)
    : tableHeight * 0.52;
  const centerX = isCompact ? Math.round(tableWidth / 2) : playerHandCenter.x;
  const centerTop = centerY - (isCompact ? 60 : 78);

  const dealerTotalRow = (
    <View style={[styles.dealerRow, isCompact ? styles.dealerRowCompact : null]}>
      <View style={[styles.dealerTitleRow, isCompact ? styles.dealerTitleRowCompact : null]}>
        <Text style={[styles.dealerTitle, isCompact ? styles.dealerTitleCompact : null]}>{dealerName}</Text>
        {dealerTotalLabel ? (
          <View style={[styles.dealerTotalPill, isCompact ? styles.dealerTotalPillCompact : null]}>
            <Text style={[styles.dealerTotalText, isCompact ? styles.dealerTotalTextCompact : null]}>
              {dealerTotalLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.dealerCards, isCompact ? styles.dealerCardsCompact : null]}>
        {dealerCards.map((c, idx) => (
          <View key={idx} style={{ marginRight: -14 }}>
            <CardView rank={c.rank} suit={c.suit} hidden={c.hidden} />
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
      <View style={[styles.table, { width: tableWidth, height: tableHeight }]}>
        <View style={[styles.dealerTop, isCompact ? styles.dealerTopCompact : null]}>{dealerTotalRow}</View>

        {centerContent ? (
          <View
            style={[
              styles.centerOverlay,
              isCompact ? styles.centerOverlayCompact : null,
              { top: centerTop, left: centerX },
            ]}
          >
            {centerContent}
          </View>
        ) : (
          <View style={styles.centerBadge}>
            <Text style={styles.centerBadgeText}>BLACKJACK</Text>
          </View>
        )}

        {/* LEFT/RIGHT NEIGHBORS near your hand */}
        {leftNeighbor ? <NeighborBlock seat={leftNeighbor} side="left" /> : null}
        {rightNeighbor ? <NeighborBlock seat={rightNeighbor} side="right" /> : null}

        {/* YOU: cards only, with bet + total underneath. Split hands side-by-side */}
        <View style={[styles.youArea, isCompact ? styles.youAreaCompact : null]} pointerEvents="box-none">
          <View style={[styles.youHandsWrap, isSplit ? styles.youHandsWrapSplit : null, isCompact ? styles.youHandsWrapCompact : null]}>
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
                    isCompact ? styles.handBlockCompact : null,
                    isCompact && h.isActive ? styles.handBlockActiveCompact : null,
                  ]}
                >
                  {isSplit && h.isActive ? (
                    <View style={[styles.handStar, isCompact ? styles.handStarCompact : null]} pointerEvents="none">
                      <Text style={[styles.handStarText, isCompact ? styles.handStarTextCompact : null]}>★</Text>
                    </View>
                  ) : null}
                  <View style={[styles.youCardsRow, isCompact ? styles.youCardsRowCompact : null]}>
                    {h.cards.map((c, idx) => (
                      <View
                        key={idx}
                      style={[
                        styles.youCardSlot,
                        idx > 0 ? (isCompact ? styles.overlapCompact : styles.overlap) : null,
                      ]}
                    >
                        <CardView rank={c.rank} suit={c.suit} />
                      </View>
                    ))}
                  </View>

                  <View style={[styles.underPill, isCompact ? styles.underPillCompact : null]}>
                    <Text style={[styles.underText, isCompact ? styles.underTextCompact : null]}>Bet {bet}</Text>
                    <Text style={[styles.underText, isCompact ? styles.underTextCompact : null]}>Total {total}</Text>
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
    flex: 1,
    width: "100%",
    height: "100%",
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
    top: 6,
    left: 12,
    right: 12,
    alignItems: "center",
  },
  dealerTopCompact: {
    top: 2,
  },
  dealerRow: {
    width: "100%",
    alignItems: "center",
  },
  dealerRowCompact: {
    gap: 2,
  },
  dealerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 22,
    marginBottom: 4,
  },
  dealerTitleRowCompact: {
    gap: 4,
    minHeight: 18,
    marginBottom: 2,
  },
  dealerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1b0b24",
    letterSpacing: 1,
  },
  dealerTitleCompact: {
    fontSize: 12,
  },
  dealerCards: {
    flexDirection: "row",
    alignItems: "center",
  },
  dealerCardsCompact: {
    transform: [{ scale: 0.92 }],
  },
  dealerTotalPill: {
    backgroundColor: "#fff7d6",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#1b0b24",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dealerTotalPillCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dealerTotalText: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  dealerTotalTextCompact: {
    fontSize: 10,
    letterSpacing: 0.2,
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
  centerOverlay: {
    position: "absolute",
    transform: [{ translateX: -70 }],
    width: 140,
    alignItems: "center",
    gap: 6,
    zIndex: 20,
    elevation: 20,
  },
  centerOverlayCompact: {
    transform: [{ translateX: -56 }],
    width: 112,
    gap: 3,
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
  neighborBlockCompact: {
    bottom: 100,
    width: 130,
    padding: 8,
    borderWidth: 3,
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
  neighborNameCompact: {
    fontSize: 12,
  },
  neighborCards: {
    flexDirection: "row",
    alignItems: "center",
  },
  neighborHandsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    width: "100%",
  },
  neighborHandBox: {
    alignItems: "center",
    gap: 6,
  },
  neighborHandActive: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#facc15",
    padding: 4,
    backgroundColor: "rgba(250, 204, 21, 0.1)",
  },
  neighborPill: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff7d6",
    borderWidth: 2,
    borderColor: "#1b0b24",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  neighborPillText: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  neighborPillTextCompact: {
    fontSize: 10,
  },

  // === YOU AREA ===
  youArea: {
    position: "absolute",
    bottom: 14,
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 10,
  },
  youAreaCompact: {
    bottom: 10,
  },

  youHandsWrap: {
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  youHandsWrapCompact: {
    gap: 8,
    alignSelf: "center",
  },
  youHandsWrapSplit: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    width: "100%",
  },

  handBlock: {
    alignItems: "center",
    justifyContent: "center",
  },
  handBlockCompact: {
    transform: [{ scale: 0.92 }],
  },
  handBlockSplit: { flex: 1 },
  handBlockActive: {
    transform: [{ scale: 1.01 }],
    borderRadius: 18,
    borderWidth: 0,
    borderColor: "transparent",
    padding: 2,
    backgroundColor: "transparent",
  },
  handBlockActiveCompact: {
    borderRadius: 14,
    borderWidth: 0,
    padding: 2,
  },
  handStar: {
    position: "absolute",
    top: -28,
    left: "50%",
    transform: [{ translateX: -8 }],
    alignItems: "center",
    justifyContent: "center",
  },
  handStarCompact: {
    top: -24,
    transform: [{ translateX: -7 }],
  },
  handStarText: {
    color: "#facc15",
    fontWeight: "900",
    fontSize: 16,
    lineHeight: 16,
    textShadowColor: "rgba(250, 204, 21, 0.8)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  handStarTextCompact: {
    fontSize: 14,
    lineHeight: 14,
    textShadowRadius: 4,
  },

  youCardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  youCardsRowCompact: {
    transform: [{ scale: 0.92 }],
  },

  youCardSlot: {},
  overlap: { marginLeft: -18 },
  overlapCompact: { marginLeft: -14 },

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
  underPillCompact: {
    marginTop: 6,
    gap: 8,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  underText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  underTextCompact: {
    fontSize: 11,
  },
});

import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Share } from "react-native";
import {
  createTable,
  joinTable,
  subscribeTable,
  toggleReady,
  leaveTable,
  TableDoc,
  startTable,
} from "../lobby/firestoreLobby";
import { getOrCreatePlayerId } from "../lobby/identity";

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        disabled ? styles.btnDisabled : null,
        pressed && !disabled ? styles.btnPressed : null,
      ]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export default function LobbyScreen({
  onStartGame,
}: {
  onStartGame: (roomCode: string) => void;
}) {
  const [playerId, setPlayerId] = useState<string>("");
  const [name, setName] = useState<string>("");

  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");

  const [table, setTable] = useState<TableDoc | null>(null);
  const [error, setError] = useState<string>("");

  // init local player id
  useEffect(() => {
    (async () => {
      const id = await getOrCreatePlayerId();
      setPlayerId(id);
    })();
  }, []);

  // subscribe to current room
  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeTable(roomCode, setTable);
    return () => unsub();
  }, [roomCode]);

  const youSeat = useMemo(() => {
    if (!table) return null;
    return table.seats.find((s) => s.playerId === playerId) ?? null;
  }, [table, playerId]);

  const isHost = useMemo(() => {
    if (!table || !youSeat) return false;
    return youSeat.isHost === true;
  }, [table, youSeat]);

  const inviteMessage = useMemo(() => {
    // For now, share a simple code. Deep links can come next.
    return `Join my Blackjack table!\nRoom code: ${roomCode}\n\nOpen the app → Join → enter the code.`;
  }, [roomCode]);

  async function onCreate() {
    setError("");
    try {
      if (!name.trim()) return setError("Enter your name first.");
      if (!playerId) return setError("Player id not ready yet. Try again.");
      const code = await createTable(playerId, name.trim());
      setRoomCode(code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create table");
    }
  }

  async function onJoin() {
    setError("");
    try {
      if (!name.trim()) return setError("Enter your name first.");
      if (!playerId) return setError("Player id not ready yet. Try again.");
      const code = roomCodeInput.trim().toUpperCase();
      if (!code) return setError("Enter a room code.");
      await joinTable(code, playerId, name.trim());
      setRoomCode(code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to join table");
    }
  }

  async function onInvite() {
    if (!roomCode) return;
    await Share.share({ message: inviteMessage });
  }

  async function onToggleReady() {
    if (!roomCode || !playerId) return;
    await toggleReady(roomCode, playerId);
  }

  async function onLeave() {
    if (!roomCode || !playerId) return;
    await leaveTable(roomCode, playerId);
    setRoomCode("");
    setTable(null);
  }

  function startEnabled() {
    if (!table) return false;
    // MVP rule: allow host to start if at least 1 player seated (you)
    // Change to >=2 if you want at least two players
    const seated = table.seats.filter((s) => s.playerId).length;
    return seated >= 1;
  }

  // If table flips to playing, go to game
  useEffect(() => {
    if (roomCode && table?.status === "playing") {
      onStartGame(roomCode);
    }
  }, [roomCode, table?.status, onStartGame]);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Multiplayer Lobby</Text>

      <View style={styles.panel}>
        <Text style={styles.label}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Alex"
          placeholderTextColor="#64748b"
          style={styles.input}
          autoCapitalize="words"
        />

        {!roomCode ? (
          <>
            <View style={styles.row}>
              <Btn label="Create Table" onPress={onCreate} />
            </View>

            <Text style={[styles.label, { marginTop: 10 }]}>Join with code</Text>
            <TextInput
              value={roomCodeInput}
              onChangeText={setRoomCodeInput}
              placeholder="e.g. K9F2Q3"
              placeholderTextColor="#64748b"
              style={styles.input}
              autoCapitalize="characters"
              maxLength={6}
            />
            <View style={styles.row}>
              <Btn label="Join Table" onPress={onJoin} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
            <Text style={styles.roomText}>Room: {roomCode}</Text>
            {table ? <Btn label="Invite" onPress={onInvite} /> : null}
            </View>

            <View style={styles.seats}>
              {table?.seats?.map((s) => {
                const occupied = !!s.playerId;
                const isYou = s.playerId === playerId;
                return (
                  <View
                    key={s.seatIndex}
                    style={[
                      styles.seat,
                      occupied ? styles.seatOcc : styles.seatEmpty,
                      isYou ? styles.seatYou : null,
                    ]}
                  >
                    <Text style={styles.seatTitle}>
                      Seat {s.seatIndex + 1} {s.isHost ? "👑" : ""}
                    </Text>
                    <Text style={occupied ? styles.seatName : styles.seatNameMuted}>
                      {occupied ? `${s.name}${isYou ? " (You)" : ""}` : "Empty"}
                    </Text>
                    {occupied ? (
                      <Text style={[styles.badge, s.isReady ? styles.badgeReady : styles.badgeNotReady]}>
                        {s.isReady ? "Ready" : "Not ready"}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.row}>
              <Btn
                label={youSeat?.isReady ? "Unready" : "Ready"}
                onPress={onToggleReady}
                disabled={!youSeat}
              />
              {isHost ? (
                <Btn
                label="Start"
                onPress={async () => {
                    try {
                    await startTable(roomCode);
                    } catch (e: any) {
                    setError(e?.message ?? "Failed to start");
                    }
                }}
                disabled={!startEnabled()}
                />
              ) : (
                <View style={styles.waitBox}>
                  <Text style={styles.waitText}>Waiting for host…</Text>
                </View>
              )}
            </View>

            <View style={styles.row}>
              <Btn label="Leave" onPress={onLeave} />
            </View>

          </>
        )}

        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>

      <Text style={styles.note}>
        Invite uses your phone/computer share sheet. For now, players join by entering the room code.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  h1: { color: "white", fontSize: 22, fontWeight: "900" },
  panel: { backgroundColor: "#111b33", borderRadius: 14, padding: 14, gap: 10 },
  label: { color: "#cbd5e1", fontWeight: "700" },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "white",
    borderWidth: 1,
    borderColor: "#24324f",
  },
  row: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, backgroundColor: "#2563eb", paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "white", fontWeight: "900" },
  btnDisabled: { backgroundColor: "#334155" },
  btnPressed: { transform: [{ scale: 0.98 }] },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  roomText: { color: "white", fontWeight: "900", fontSize: 16 },

  seats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  seat: { width: "48%", padding: 12, borderRadius: 14, borderWidth: 1, gap: 6 },
  seatOcc: { backgroundColor: "#0b1220", borderColor: "#24324f" },
  seatEmpty: { backgroundColor: "#0f172a", borderColor: "#1f2a44" },
  seatYou: { borderColor: "#60a5fa", borderWidth: 2 },

  seatTitle: { color: "#e2e8f0", fontWeight: "800" },
  seatName: { color: "white", fontSize: 16, fontWeight: "900" },
  seatNameMuted: { color: "#94a3b8", fontSize: 16, fontWeight: "800" },

  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden", fontWeight: "900", color: "white" },
  badgeReady: { backgroundColor: "#16a34a" },
  badgeNotReady: { backgroundColor: "#64748b" },

  waitBox: { flex: 1, backgroundColor: "#0b1220", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  waitText: { color: "#cbd5e1", fontWeight: "800" },

  err: { color: "#fca5a5", fontWeight: "800" },
  note: { color: "#94a3b8" },
});

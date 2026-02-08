import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Share } from "react-native";
import {
  createTable,
  joinTable,
  subscribeTable,
  toggleReady,
  leaveTable,
  TableDoc,
  toggleAdvice,
} from "../lobby/firestoreLobby";
import { getOrCreatePlayerId } from "../lobby/identity";
import { startSharedRound } from "../lobby/gameSync";

function Btn({
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
        styles.btn,
        disabled ? styles.btnDisabled : null,
        pressed && !disabled ? styles.btnPressed : null,
      ]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

function TogglePill({
  on,
  onPress,
  disabled,
}: {
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        on ? styles.pillOn : styles.pillOff,
        disabled ? styles.pillDisabled : null,
        pressed && !disabled ? styles.pillPressed : null,
      ]}
    >
      <Text style={styles.pillText}>{on ? "Advice: ON" : "Advice: OFF"}</Text>
    </Pressable>
  );
}

export default function LobbyScreen({
  onStartGame,
}: {
  onStartGame: (roomCode: string, playerId: string, name: string) => void;
}) {
  const [playerId, setPlayerId] = useState<string>("");
  const [name, setName] = useState<string>("");

  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");

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
    if (!table) return null;
    return table.seats.find((s) => s.playerId === playerId) ?? null;
  }, [table, playerId]);

  const isHost = useMemo(() => {
    if (!table || !youSeat) return false;
    return youSeat.isHost === true;
  }, [table, youSeat]);

  const inviteMessage = useMemo(() => {
    return `Join my Blackjack table!\nRoom code: ${roomCode}\n\nOpen the app → Join → enter the code.`;
  }, [roomCode]);

  async function onCreate() {
    setError("");
    try {
      const trimmed = name.trim();
      if (!trimmed) return setError("Enter your name first.");
      if (!playerId) return setError("Player id not ready yet. Try again.");

      const code = await createTable(playerId, trimmed);
      setRoomCode(code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create table");
    }
  }

  async function onJoin() {
    setError("");
    try {
      const trimmed = name.trim();
      if (!trimmed) return setError("Enter your name first.");
      if (!playerId) return setError("Player id not ready yet. Try again.");

      const code = roomCodeInput.trim().toUpperCase();
      if (!code) return setError("Enter a room code.");

      await joinTable(code, playerId, trimmed);
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
    try {
      await toggleReady(roomCode, playerId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to toggle ready");
    }
  }

  async function onToggleAdvice(targetPlayerId: string, enabled: boolean) {
    if (!roomCode || !playerId) return;
    try {
      await toggleAdvice(roomCode, targetPlayerId, enabled, playerId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to toggle advice");
    }
  }

  async function onLeave() {
    if (!roomCode || !playerId) return;
    try {
      await leaveTable(roomCode, playerId);
      setRoomCode("");
      setTable(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to leave table");
    }
  }

  function startEnabled() {
    if (!table) return false;
    const seated = table.seats.filter((s) => s.playerId).length;
    return seated >= 1;
  }

  useEffect(() => {
    if (roomCode && table?.status === "playing") {
      onStartGame(roomCode, playerId, name.trim() || "You");
    }
  }, [roomCode, table?.status, onStartGame, playerId, name]);

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
                const adviceOn = s.adviceEnabled === true;
                const canToggleAdvice = isYou || isHost;

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
                      <>
                        <Text style={[styles.badge, s.isReady ? styles.badgeReady : styles.badgeNotReady]}>
                          {s.isReady ? "Ready" : "Not ready"}
                        </Text>

                        <TogglePill
                          on={adviceOn}
                          disabled={!canToggleAdvice}
                          onPress={() => onToggleAdvice(s.playerId!, !adviceOn)}
                        />
                      </>
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
                    setError("");
                    try {
                      await startSharedRound(roomCode);
                      onStartGame(roomCode, playerId, name.trim() || "You");
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

  h1: {
    color: "#fff7d6",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  panel: {
    backgroundColor: "#fff7d6",
    borderRadius: 22,
    padding: 14,
    gap: 12,
    borderWidth: 4,
    borderColor: "#1b0b24",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  label: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
    opacity: 0.85,
  },

  input: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#1b0b24",
    borderWidth: 4,
    borderColor: "#1b0b24",
    fontWeight: "900",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  row: { flexDirection: "row", gap: 10 },

  btn: {
    flex: 1,
    backgroundColor: "#ff4d8d",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#1b0b24",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  btnText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  btnDisabled: {
    backgroundColor: "#cbd5e1",
    borderColor: "#64748b",
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPressed: { transform: [{ scale: 0.97 }] },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  roomText: {
    color: "#1b0b24",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ffd24a",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },

  seats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },

  seat: {
    width: "48%",
    padding: 12,
    borderRadius: 20,
    borderWidth: 4,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  seatOcc: { backgroundColor: "#2ee6a6", borderColor: "#1b0b24" },
  seatEmpty: { backgroundColor: "#ffffff", borderColor: "#1b0b24", opacity: 0.85 },

  seatYou: { borderColor: "#ff4d8d", borderWidth: 5 },

  seatTitle: { color: "#1b0b24", fontWeight: "900", letterSpacing: 0.5 },
  seatName: { color: "#1b0b24", fontSize: 16, fontWeight: "900" },
  seatNameMuted: { color: "#1b0b24", fontSize: 16, fontWeight: "900", opacity: 0.5 },

  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "900",
    color: "#1b0b24",
    borderWidth: 3,
    borderColor: "#1b0b24",
  },
  badgeReady: { backgroundColor: "#22c55e" },
  badgeNotReady: { backgroundColor: "#cbd5e1" },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#1b0b24",
  },
  pillOn: { backgroundColor: "#ffd24a" },
  pillOff: { backgroundColor: "#ffffff" },
  pillDisabled: { opacity: 0.5 },
  pillPressed: { transform: [{ scale: 0.98 }] },
  pillText: {
    color: "#1b0b24",
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontSize: 12,
  },

  waitBox: {
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffd24a",
    borderWidth: 4,
    borderColor: "#1b0b24",
  },
  waitText: { color: "#1b0b24", fontWeight: "900", letterSpacing: 0.5 },

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

  note: { color: "#ffe29a", fontWeight: "900", opacity: 0.95 },
});

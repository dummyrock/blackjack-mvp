import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import LobbyScreen from "./src/screens/LobbyScreen";
import MultiplayerGameScreen from "./src/screens/MultiplayerGameScreen";

export default function App() {
  const [mode, setMode] = useState<"lobby" | "game">("lobby");
  const [roomCode, setRoomCode] = useState<string>("");

  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myName, setMyName] = useState<string>("");

  return (
    <SafeAreaView style={styles.container}>
      {mode === "lobby" ? (
        <LobbyScreen
          onStartGame={(code, playerId, name) => {
            setRoomCode(code);
            setMyPlayerId(playerId);
            setMyName(name);
            setMode("game");
          }}
        />
      ) : (
        <MultiplayerGameScreen
          roomCode={roomCode}
          myPlayerId={myPlayerId}
          myName={myName}
          onExit={() => setMode("lobby")}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#12051a",
  },
});

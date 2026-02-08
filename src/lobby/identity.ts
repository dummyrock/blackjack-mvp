import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "bj_player_id_v1";

function randomId() {
  // good enough for client identity
  return `p_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export async function getOrCreatePlayerId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;

  const id = randomId();
  await AsyncStorage.setItem(KEY, id);
  return id;
}

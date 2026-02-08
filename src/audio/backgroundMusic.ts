import { Audio } from "expo-av";

const BG_MUSIC = require("../../assets/sounds/bg-loop.mp3");

let bgSound: Audio.Sound | null = null;
let initPromise: Promise<void> | null = null;

async function ensureLoaded() {
  if (bgSound) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(BG_MUSIC, {
      isLooping: true,
      volume: 0.1,
      shouldPlay: false,
    });
    bgSound = sound;
  })();

  return initPromise;
}

export async function startBackgroundMusic() {
  await ensureLoaded();
  await bgSound?.playAsync();
}

export async function stopBackgroundMusic() {
  if (!bgSound) return;
  await bgSound.stopAsync();
}

export async function unloadBackgroundMusic() {
  if (!bgSound) return;
  await bgSound.unloadAsync();
  bgSound = null;
  initPromise = null;
}

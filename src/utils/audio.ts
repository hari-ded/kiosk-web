const SOUND_URLS = {
  enterPickupCode: new URL('../../assets/enter_your_pickup_code.mp3', import.meta.url).href,
  invalidCode: new URL('../../assets/invalid_code.mp3', import.meta.url).href,
  printComplete: new URL('../../assets/print_complete.mp3', import.meta.url).href,
  printingWait: new URL('../../assets/printing_wait.mp3', import.meta.url).href,
  thankYou: new URL('../../assets/thank_you.mp3', import.meta.url).href,
} as const;

type SoundName = keyof typeof SOUND_URLS;

const audioCache = new Map<SoundName, HTMLAudioElement>();

export function playSound(name: SoundName, volume = 0.7) {
  if (typeof window === 'undefined') return;

  let audio = audioCache.get(name);
  if (!audio) {
    audio = new Audio(SOUND_URLS[name]);
    audio.preload = 'auto';
    audioCache.set(name, audio);
  }

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    void audio.play();
  } catch {
    // Some kiosk browsers block autoplay until a tap happens.
  }
}

export function clearSoundCache() {
  audioCache.clear();
}
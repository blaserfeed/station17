export function createStoryAudio() {
  let current;
  return {
    play(id, settings) {
      this.stop();
      if (!settings?.volume) return;
      current = new Audio('/assets/voice/' + id + '.mp3');
      current.volume = settings.volume / 100;
      current.play().catch(() => {});
    },
    stop() {
      current?.pause();
      current = null;
    },
  };
}

export function pressureLevel(seconds) {
  return seconds <= 60 ? 2 : seconds <= 300 ? 1 : 0;
}

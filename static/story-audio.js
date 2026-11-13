export function createStoryAudio(onSpeech = () => {}) {
  let current;
  let finish;
  return {
    get playing() { return !!current; },
    play(id, settings) {
      this.stop();
      if (!settings?.volume) return Promise.resolve(false);
      const audio = new Audio('/assets/voice/' + id + '.mp3');
      audio.volume = settings.volume / 100;
      current = audio;
      onSpeech(true);
      return new Promise(resolve => {
        const end = played => {
          if (current !== audio) return;
          audio.removeEventListener('ended', onEnd);
          audio.removeEventListener('error', onError);
          current = finish = null;
          onSpeech(false);
          resolve(played);
        };
        const onEnd = () => end(true);
        const onError = () => end(false);
        finish = onError;
        audio.addEventListener('ended', onEnd, {once:true});
        audio.addEventListener('error', onError, {once:true});
        audio.play().catch(onError);
      });
    },
    stop() {
      current?.pause();
      finish?.();
    },
  };
}

export const annaLines = {
  intro: 'Папа?.. Этот голос. Но как он мог выйти на связь?',
  repair: 'Питание есть. Попробую открыть проход.',
  1978: 'Тысяча девятьсот семьдесят восьмой. Станцию ещё только готовят к пуску.',
  2074: 'Здесь та же станция. Что же с ней случилось?',
  valve: 'Линия Б открыта. Теперь можно добраться до западного отсека.',
  reel: 'Папин голос. Эту катушку нужно отнести к пульту.',
  letter: 'Папа написал это сам… Сергей знал, что он ещё на связи.',
  confession: 'Ты слышал его. И всё равно оставил там.',
  return: 'Да, пап. Пойдём домой.',
  seal: 'Водосброс открыт. Папа… я так и не успела.',
  erase: 'Если пуска не будет, всё пойдёт иначе.',
};

export function pressureLevel(seconds) {
  return seconds <= 60 ? 2 : seconds <= 300 ? 1 : 0;
}

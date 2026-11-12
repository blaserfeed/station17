// Procedural station beds and cues. No external audio files.
export function createSound() {
  let ctx, master, music, fx, bed, hum, air, noise;
  let era = -1, listening = false;
  const levels = {master: .35, music: .7, effects: .8};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    music = ctx.createGain();
    fx = ctx.createGain();
    music.connect(master);
    fx.connect(master);
    master.connect(ctx.destination);
    applyLevels();
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise = buffer;
    return true;
  }

  function applyLevels() {
    if (!ctx) return;
    master.gain.value = levels.master;
    music.gain.value = levels.music * (listening ? .2 : 1);
    fx.gain.value = levels.effects * (listening ? .4 : 1);
  }

  function setVolumes(settings = {}) {
    levels.master = (settings.volume ?? 35) / 100;
    levels.music = (settings.music ?? 70) / 100;
    levels.effects = (settings.effects ?? 80) / 100;
    applyLevels();
  }

  function setListening(value) { listening = !!value; applyLevels(); }

  function stopBed() {
    if (bed) { try { bed.stop(); } catch (e) {} bed.disconnect(); bed = null; }
    if (hum) { try { hum.stop(); } catch (e) {} hum.disconnect(); hum = null; }
    if (air) { try { air.stop(); } catch (e) {} air.disconnect(); air = null; }
  }

  function playBed(stage) {
    if (!ensure() || stage === era) return;
    era = stage;
    ctx.resume();
    stopBed();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = stage === 0 ? 220 : stage === 1 ? 640 : 1400;
    const gain = ctx.createGain();
    gain.gain.value = stage === 1 ? .05 : .035;
    bed = ctx.createBufferSource();
    bed.buffer = noise;
    bed.loop = true;
    bed.connect(filter);
    filter.connect(gain);
    gain.connect(music);
    bed.start();
    hum = ctx.createOscillator();
    hum.type = stage === 2 ? 'sine' : 'triangle';
    hum.frequency.value = stage === 0 ? 62 : stage === 1 ? 48 : 196;
    const humGain = ctx.createGain();
    humGain.gain.value = stage === 2 ? .012 : .02;
    hum.connect(humGain);
    humGain.connect(music);
    hum.start();
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = stage === 1 ? 'lowpass' : 'highpass';
    airFilter.frequency.value = stage === 0 ? 900 : stage === 1 ? 260 : 1700;
    const airGain = ctx.createGain();
    airGain.gain.value = stage === 1 ? .028 : .016;
    air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(music);
    air.start();
  }

  function tone(freq, dur, type, gainValue, dest) {
    if (!ensure()) return;
    ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(gainValue, .0001), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(dest || fx);
    o.start();
    o.stop(ctx.currentTime + dur + .02);
  }

  function cue(kind) {
    if (kind === 'success') tone(520, .22, 'sine', .05);
    else if (kind === 'error') tone(140, .28, 'sawtooth', .03);
    else if (kind) tone(360, .16, 'sine', .04);
  }

  function step() { tone(90 + Math.random() * 40, .07, 'triangle', .03); }
  function land() { tone(70, .12, 'sine', .04); }
  function travel() {
    if (!ensure()) return;
    ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 1.1);
    g.gain.setValueAtTime(.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + 1.3);
    o.connect(g);
    g.connect(fx);
    o.start();
    o.stop(ctx.currentTime + 1.35);
  }

  function duck() {
    if (!music) return;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.linearRampToValueAtTime(levels.music * (listening ? .03 : .15), ctx.currentTime + .4);
  }

  function restore() {
    if (!music) return;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.linearRampToValueAtTime(levels.music * (listening ? .2 : 1), ctx.currentTime + .8);
  }

  return {ensure, setVolumes, setListening, playBed, cue, step, land, travel, duck, restore, stopBed};
}

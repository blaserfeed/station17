// Procedural station beds and cues. No external audio files.
export function createSound() {
  let ctx, master, music, fx, ambience, bed, hum, air, noise;
  const sources = new Map();
  let era = -1, listening = false, speech = false, ducked = false, pressure = 0, alarm;
  const levels = {master: .35, music: .7, effects: .8};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    music = ctx.createGain();
    fx = ctx.createGain();
    ambience = ctx.createGain();
    ambience.connect(fx);
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
    music.gain.value = levels.music * (listening ? .2 : 1) * (ducked || speech ? .20 : 1);
    ambience.gain.value = speech ? .30 : 1;
    fx.gain.value = levels.effects * (listening ? .4 : 1);
  }

  function setVolumes(settings = {}) {
    levels.master = (settings.volume ?? 35) / 100;
    levels.music = (settings.music ?? 70) / 100;
    levels.effects = (settings.effects ?? 80) / 100;
    applyLevels();
  }

  function setListening(value) { listening = !!value; applyLevels(); }

  function setSpeech(value) { speech = value; applyLevels(); }

  function setPressure(level) {
    if (level === pressure) return;
    pressure = level;
    if (alarm) { clearInterval(alarm); alarm = null; }
    if (hum && era === 1) hum.frequency.setTargetAtTime(48 + level * 11, ctx.currentTime, .25);
    if (level) {
      const pulse = () => tone(level === 2 ? 505 : 345, .32, 'triangle', .075);
      pulse();
      alarm = setInterval(pulse, level === 2 ? 2200 : 5800);
    }
  }

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

  function noiseBurst(frequency, duration, volume, type = 'bandpass', delay = 0) {
    if (!ensure()) return;
    const time = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = .66;
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + .007);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(fx);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time, Math.random() * (noise.duration - duration));
    source.stop(time + duration + .01);
  }

  function step(surface = 'concrete', running = false) {
    const floor = {
      concrete: [155, 920, .078, .21],
      tile: [186, 1580, .067, .19],
      metal: [245, 2430, .106, .16],
    }[surface];
    const [heel, scuff, tail, volume] = floor;
    const variant = .85 + Math.random() * .30;
    const weight = running ? 1.23 : 1;
    noiseBurst(heel * variant, .063, volume * weight);
    noiseBurst(scuff * variant, tail, volume * .64 * weight, 'bandpass', .016);
  }

  function land(surface = 'concrete') {
    step(surface, true);
    noiseBurst(125, .17, .36, 'lowpass', .026);
  }

  function mechanism(kind) {
    if (kind === 'paper') {
      noiseBurst(1900, .14, .13, 'bandpass', .015);
      noiseBurst(2800, .16, .11, 'bandpass', .105);
    } else {
      noiseBurst(kind === 'valve' ? 480 : 880, .24, .13);
      noiseBurst(165, .20, .22, 'bandpass', .11);
      tone(kind === 'valve' ? 92 : 272, .28, 'triangle', .032);
    }
  }

  const ambienceProfiles = {
    machine: [140, .16, 17, 47],
    pipes: [430, .19, 11, 77],
    water: [680, .23, 15, 0],
    portal: [860, .14, 10, 152],
    vents: [530, .12, 12, 0],
  };
  function ambientAt(x, z, yaw, points) {
    if (!ctx || ctx.state !== 'running') return;
    const time = ctx.currentTime;
    for (const [kind, [frequency, volume, range, pitch]] of Object.entries(ambienceProfiles)) {
      let nearest, distance = range;
      for (const point of points[kind] || []) {
        const d = Math.hypot(point[0] - x, point[1] - z);
        if (d < distance) { distance = d; nearest = point; }
      }
      let source = sources.get(kind);
      if (!source && nearest) {
        const grain=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
        const pan=ctx.createStereoPanner();
        grain.buffer=noise;
        grain.loop=true;
        grain.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(ambience);
        filter.type='bandpass';
        filter.frequency.value=frequency;
        filter.Q.value=.62;
        gain.gain.value=0;
        grain.start(time,Math.random()*noise.duration);
        if(pitch){
          const vibration=ctx.createOscillator(), level=ctx.createGain();
          vibration.frequency.value=pitch;
          level.gain.value=.12;
          vibration.connect(level);
          level.connect(gain);
          vibration.start();
        }
        source={gain,pan};
        sources.set(kind,source);
      }
      if(!source)continue;
      source.gain.gain.setTargetAtTime(volume*(1-distance/range)**1.7,time,.16);
      if(nearest){
        const side=(nearest[0]-x)*Math.cos(yaw)+(nearest[1]-z)*Math.sin(yaw);
        source.pan.pan.setTargetAtTime(Math.max(-.78,Math.min(.78,side/10)),time,.14);
      }
    }
  }
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

  function duck() { ducked = true; applyLevels(); }
  function restore() { ducked = false; applyLevels(); }

  return {ensure, setPressure, setVolumes, setListening, setSpeech, playBed, cue, step, land,
    mechanism, ambientAt, travel, duck, restore, stopBed};
}

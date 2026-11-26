/*
 * 10-Sekunden-Clips gleicher Länge: 16 kHz mono mu-law.
 * Der Host dekodiert die MP3 lokal. Verteilt wird nur dieses Paket,
 * damit die Dateigröße die Rolle nicht verrät.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImposterAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RATE = 16000;
  const SECONDS = 10;
  const SAMPLES = RATE * SECONDS;
  const HEADER = 12;
  const CLIP_BYTES = HEADER + SAMPLES;
  const RAW_CHUNK = 18000;

  function mulawEncodeSample(sample) {
    const BIAS = 0x84;
    const CLIP = 32635;
    let x = sample < -CLIP ? -CLIP : sample > CLIP ? CLIP : sample;
    const sign = x < 0 ? 0x80 : 0;
    if (x < 0) x = -x;
    x += BIAS;
    let exp = 7;
    let mask = 0x4000;
    while (exp > 0 && (x & mask) === 0) {
      exp -= 1;
      mask >>= 1;
    }
    const mantissa = (x >> (exp + 3)) & 0x0f;
    return (~(sign | (exp << 4) | mantissa)) & 0xff;
  }

  function mulawDecodeSample(byte) {
    let u = (~byte) & 0xff;
    const sign = u & 0x80;
    const exp = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exp;
    sample -= 0x84;
    return sign ? -sample : sample;
  }

  function encodeMulaw(samples) {
    const out = new Uint8Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) out[i] = mulawEncodeSample(samples[i]);
    return out;
  }

  function decodeMulaw(bytes) {
    const out = new Int16Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) out[i] = mulawDecodeSample(bytes[i]);
    return out;
  }

  function mixToMono(channels) {
    const length = channels[0].length;
    const out = new Int16Array(length);
    const scale = 32767 / channels.length;
    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels.length; c += 1) sum += channels[c][i];
      const v = Math.round(sum * scale);
      out[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
    }
    return out;
  }

  function floatChannelToInt16(channel) {
    const out = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      const v = Math.round(channel[i] * 32767);
      out[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
    }
    return out;
  }

  function resampleLinear(samples, fromRate, toRate) {
    if (!samples || !samples.length) return new Int16Array(0);
    if (fromRate === toRate) return samples;
    const n = Math.max(1, Math.round(samples.length * toRate / fromRate));
    const out = new Int16Array(n);
    const step = fromRate / toRate;
    for (let i = 0; i < n; i += 1) {
      const pos = i * step;
      const i0 = Math.floor(pos);
      const i1 = Math.min(samples.length - 1, i0 + 1);
      const f = pos - i0;
      out[i] = Math.round(samples[i0] * (1 - f) + samples[i1] * f);
    }
    return out;
  }

  function takeWindow(samples, start, count) {
    const out = new Int16Array(count);
    const from = Math.max(0, start | 0);
    for (let i = 0; i < count; i += 1) {
      const j = from + i;
      out[i] = j < samples.length ? samples[j] : 0;
    }
    return out;
  }

  function randomStart(total, window, rng) {
    const roll = typeof rng === 'function' ? rng : Math.random;
    if (total <= window) return 0;
    return Math.floor(roll() * (total - window + 1));
  }

  function buildClip(samples) {
    const audio = encodeMulaw(samples);
    const out = new Uint8Array(HEADER + audio.length);
    out[0] = 0x49;
    out[1] = 0x44;
    out[2] = 0x4e;
    out[3] = 0x31;
    const view = new DataView(out.buffer);
    view.setUint32(4, RATE, true);
    view.setUint32(8, audio.length, true);
    out.set(audio, HEADER);
    return out;
  }

  function clipFromPcm(samples, fromRate, startSample) {
    const resampled = resampleLinear(samples, fromRate, RATE);
    const start = Math.round((startSample || 0) * RATE / fromRate);
    return buildClip(takeWindow(resampled, start, SAMPLES));
  }

  function imposterFromAnnouncement(announceMulaw) {
    const spoken = decodeMulaw(announceMulaw);
    const samples = new Int16Array(SAMPLES);
    const n = Math.min(spoken.length, SAMPLES);
    samples.set(spoken.subarray(0, n), 0);
    return buildClip(samples);
  }

  function parseClip(bytes) {
    if (!bytes || bytes.length < HEADER) return null;
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x4e || bytes[3] !== 0x31) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const rate = view.getUint32(4, true);
    const count = view.getUint32(8, true);
    if (count < 0 || HEADER + count > bytes.length) return null;
    return { rate: rate, samples: decodeMulaw(bytes.subarray(HEADER, HEADER + count)) };
  }

  function rms(samples) {
    if (!samples || !samples.length) return 0;
    let acc = 0;
    for (let i = 0; i < samples.length; i += 1) acc += samples[i] * samples[i];
    return Math.sqrt(acc / samples.length);
  }

  function bytesToB64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      const slice = bytes.subarray(i, Math.min(bytes.length, i + step));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function b64ToBytes(text) {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function splitClip(bytes, clipId, rawChunk) {
    const size = rawChunk || RAW_CHUNK;
    const n = Math.ceil(bytes.length / size) || 1;
    const parts = [];
    for (let i = 0; i < n; i += 1) {
      const slice = bytes.subarray(i * size, Math.min(bytes.length, (i + 1) * size));
      parts.push({ t: 'clip', id: clipId, i: i, n: n, p: bytesToB64(slice) });
    }
    return parts;
  }

  function createAssembler() {
    return { clips: {} };
  }

  function pushChunk(assembler, message) {
    if (!message || message.t !== 'clip' || !message.id) return null;
    const bucket = assembler.clips[message.id] || (assembler.clips[message.id] = { n: message.n, parts: [] });
    bucket.n = message.n;
    bucket.parts[message.i] = message.p;
    if (bucket.parts.length < bucket.n) return null;
    for (let i = 0; i < bucket.n; i += 1) if (!bucket.parts[i]) return null;
    const pieces = bucket.parts.map(b64ToBytes);
    let total = 0;
    pieces.forEach((piece) => { total += piece.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    pieces.forEach((piece) => {
      out.set(piece, offset);
      offset += piece.length;
    });
    return out;
  }

  const BITRATE = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const SAMPLE_RATE = [44100, 48000, 32000];

  function mpegFrame(bytes, offset) {
    if (offset + 4 > bytes.length) return null;
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;
    const version = (bytes[offset + 1] >> 3) & 0x03;
    const layer = (bytes[offset + 1] >> 1) & 0x03;
    if (version !== 3 || layer !== 1) return null;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const srIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    if (!BITRATE[bitrateIndex] || srIndex === 3) return null;
    const bitrate = BITRATE[bitrateIndex] * 1000;
    const sampleRate = SAMPLE_RATE[srIndex];
    const size = Math.floor((144 * bitrate) / sampleRate) + padding;
    if (size < 4 || offset + size > bytes.length) return null;
    return { size: size, sampleRate: sampleRate, samples: 1152, bitrate: bitrate };
  }

  function cutMp3(bytes, seconds) {
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let offset = 0;
    while (offset + 4 < src.length && !(src[offset] === 0xff && (src[offset + 1] & 0xe0) === 0xe0)) offset += 1;
    const start = offset;
    let samples = 0;
    let sampleRate = 44100;
    const limit = (seconds || SECONDS) * 44100;
    while (offset < src.length) {
      const frame = mpegFrame(src, offset);
      if (!frame) break;
      sampleRate = frame.sampleRate;
      if (samples > 0 && samples / sampleRate >= (seconds || SECONDS)) break;
      samples += frame.samples;
      offset += frame.size;
      if (samples / sampleRate >= (seconds || SECONDS)) break;
    }
    if (offset <= start) return null;
    return {
      bytes: src.slice(start, offset),
      seconds: samples / sampleRate,
      sampleRate: sampleRate,
      skipped: start
    };
  }

  return {
    RATE: RATE,
    SECONDS: SECONDS,
    SAMPLES: SAMPLES,
    CLIP_BYTES: CLIP_BYTES,
    RAW_CHUNK: RAW_CHUNK,
    mulawEncodeSample: mulawEncodeSample,
    mulawDecodeSample: mulawDecodeSample,
    encodeMulaw: encodeMulaw,
    decodeMulaw: decodeMulaw,
    mixToMono: mixToMono,
    floatChannelToInt16: floatChannelToInt16,
    resampleLinear: resampleLinear,
    takeWindow: takeWindow,
    randomStart: randomStart,
    buildClip: buildClip,
    clipFromPcm: clipFromPcm,
    imposterFromAnnouncement: imposterFromAnnouncement,
    parseClip: parseClip,
    rms: rms,
    bytesToB64: bytesToB64,
    b64ToBytes: b64ToBytes,
    splitClip: splitClip,
    createAssembler: createAssembler,
    pushChunk: pushChunk,
    cutMp3: cutMp3
  };
});

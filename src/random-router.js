"use strict";

(function installFishtailRandom(root) {
  const NAMED_RANDOM_MODEL = "named_sfc32_v1";
  const LEGACY_RANDOM_MODEL = "legacy_single_stream_v0";
  const MASTER_SEED_BITS = 128;
  const STREAM_TAG = "stream";
  const UNIT_TAG = "unit";

  function createRouter(seed) {
    const masterSeed = String(seed ?? "");
    const streams = new Map();
    return Object.freeze({
      model: NAMED_RANDOM_MODEL,
      masterSeed,
      stream(...path) {
        const encoded = encodeTypedPath(path);
        if (!streams.has(encoded)) {
          streams.set(encoded, makeSeededRng(masterSeed, STREAM_TAG, encoded));
        }
        return streams.get(encoded);
      },
      unit(...path) {
        return makeSeededRng(masterSeed, UNIT_TAG, encodeTypedPath(path))();
      },
    });
  }

  function legacyRng(seed) {
    const data = cyrb128(String(seed ?? ""));
    return sfc32(data[0], data[1], data[2], data[3]);
  }

  function randomnessManifest() {
    return {
      model: NAMED_RANDOM_MODEL,
      master_seed_bits: MASTER_SEED_BITS,
    };
  }

  function modelFromManifest(manifest) {
    return manifest?.randomness?.model || LEGACY_RANDOM_MODEL;
  }

  function makeSeededRng(masterSeed, kind, encodedPath) {
    const data = cyrb128(encodeTypedPath([masterSeed, kind, encodedPath]));
    return sfc32(data[0], data[1], data[2], data[3]);
  }

  function encodeTypedPath(path) {
    return path.map(encodeTypedValue).join("");
  }

  function encodeTypedValue(value) {
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const payload = encodeTypedPayload(type, value);
    return `${type.length}:${type}${payload.length}:${payload}`;
  }

  function encodeTypedPayload(type, value) {
    if (type === "number") {
      if (Number.isNaN(value)) return "NaN";
      if (Object.is(value, -0)) return "-0";
      if (value === Infinity) return "Infinity";
      if (value === -Infinity) return "-Infinity";
      return String(value);
    }
    if (type === "bigint") return value.toString();
    if (type === "undefined") return "";
    if (type === "null") return "";
    if (type === "string") return value;
    if (type === "boolean") return value ? "true" : "false";
    return JSON.stringify(value);
  }

  function cyrb128(str) {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;
    for (let i = 0, k; i < str.length; i += 1) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  function sfc32(a, b, c, d) {
    return function rng() {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      const t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      const out = (t + d) | 0;
      c = (c + out) | 0;
      return (out >>> 0) / 4294967296;
    };
  }

  root.FishtailRandom = Object.freeze({
    NAMED_RANDOM_MODEL,
    LEGACY_RANDOM_MODEL,
    MASTER_SEED_BITS,
    createRouter,
    legacyRng,
    randomnessManifest,
    modelFromManifest,
    encodeTypedPath,
    cyrb128,
    sfc32,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);

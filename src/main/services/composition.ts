/**
 * Builds the self-contained HTML document that a profile's browser page renders
 * to produce a generation artifact.
 *
 * The renderer is deterministic: the same prompt, model, ratio and reference
 * always produce the same frame, which makes results reproducible and makes the
 * end-to-end tests assertable. Swapping in a hosted model later means replacing
 * `GenerationProvider` in `generation-engine.ts` — this document is the local
 * provider's payload, nothing else depends on it.
 */

export interface CompositionConfig {
  prompt: string
  modelName: string
  aspectLabel: string
  width: number
  height: number
  seed: number
  /** Data URI of the reference image, when one was attached. */
  referenceImage?: string
  /** Seconds of motion to capture for video models. */
  durationSeconds?: number
}

export function compositionHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="stage"></canvas>
    <script>${rendererScript()}</script>
  </body>
</html>`
}

function rendererScript(): string {
  // Kept as a template string so it ships inside the HTML document with no
  // bundler involvement; it executes in the profile browser, not in Electron.
  return String.raw`
(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  function makeRandom(seed) {
    let state = seed >>> 0 || 1;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
  }

  function palette(random) {
    const baseHue = Math.floor(random() * 360);
    const spread = 28 + random() * 46;
    return [0, 1, 2, 3].map((index) => {
      const hue = (baseHue + index * spread) % 360;
      const sat = 58 + random() * 30;
      const light = 44 + index * 6 + random() * 12;
      return 'hsl(' + hue.toFixed(1) + ' ' + sat.toFixed(1) + '% ' + light.toFixed(1) + '%)';
    });
  }

  function drawMesh(random, colors, t, w, h) {
    const blobs = 5 + Math.floor(random() * 3);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < blobs; i += 1) {
      const phase = random() * Math.PI * 2;
      const speed = 0.25 + random() * 0.55;
      const orbitX = (0.16 + random() * 0.3) * w;
      const orbitY = (0.14 + random() * 0.26) * h;
      const cx = w * (0.2 + random() * 0.6) + Math.cos(t * speed + phase) * orbitX * 0.35;
      const cy = h * (0.2 + random() * 0.6) + Math.sin(t * speed * 0.8 + phase) * orbitY * 0.35;
      const radius = (0.28 + random() * 0.4) * Math.max(w, h) * (0.9 + Math.sin(t * 0.6 + phase) * 0.08);

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, colors[i % colors.length]);
      gradient.addColorStop(0.45, colors[(i + 1) % colors.length]);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRibbons(random, colors, t, w, h) {
    const count = 3 + Math.floor(random() * 3);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i += 1) {
      const amplitude = (0.05 + random() * 0.14) * h;
      const yBase = h * (0.15 + random() * 0.7);
      const frequency = 1.2 + random() * 2.4;
      const drift = random() * Math.PI * 2;

      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 8) {
        const progress = x / w;
        const y =
          yBase +
          Math.sin(progress * frequency * Math.PI * 2 + t * 0.9 + drift) * amplitude +
          Math.sin(progress * frequency * 0.5 * Math.PI * 2 - t * 0.4) * amplitude * 0.4;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.16 + random() * 0.14;
      ctx.lineWidth = (0.004 + random() * 0.016) * Math.max(w, h);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawReference(image, t, w, h) {
    if (!image) return;
    const scale = Math.max(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.5 + Math.sin(t * 0.5) * 0.06;
    ctx.drawImage(image, dx, dy, dw, dh);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(image, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawGrain(random, w, h) {
    const density = Math.floor((w * h) / 900);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < density; i += 1) {
      const value = random();
      ctx.fillStyle = value > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(random() * w, random() * h, 1, 1);
    }
    ctx.restore();
  }

  function drawVignette(w, h) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function renderFrame(config, image, t) {
    const w = canvas.width;
    const h = canvas.height;
    const random = makeRandom(config.seed);
    const colors = palette(random);

    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, w, h);

    drawMesh(makeRandom(config.seed + 17), colors, t, w, h);
    drawReference(image, t, w, h);
    drawRibbons(makeRandom(config.seed + 91), colors, t, w, h);
    drawGrain(makeRandom(config.seed + 233), w, h);
    drawVignette(w, h);
  }

  function loadReference(dataUri) {
    if (!dataUri) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = dataUri;
    });
  }

  function prepare(config) {
    canvas.width = config.width;
    canvas.height = config.height;
    canvas.style.width = config.width + 'px';
    canvas.style.height = config.height + 'px';
  }

  window.flowRenderStill = async (config) => {
    prepare(config);
    const image = await loadReference(config.referenceImage);
    renderFrame(config, image, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  };

  window.flowRenderClip = async (config) => {
    prepare(config);
    const image = await loadReference(config.referenceImage);

    const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeCandidates.find((candidate) => window.MediaRecorder && MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error('This browser build cannot encode WebM video.');

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };

    const finished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = (event) => reject(new Error('Recorder failed: ' + (event.error && event.error.name)));
    });

    const durationMs = (config.durationSeconds || 4) * 1000;
    const start = performance.now();
    recorder.start(100);

    await new Promise((resolve) => {
      const tick = (now) => {
        const elapsed = now - start;
        renderFrame(config, image, elapsed / 1000);
        if (elapsed >= durationMs) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    recorder.stop();
    await finished;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) throw new Error('Recorder produced an empty clip.');

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  };

  window.flowRenderPoster = async (config) => {
    prepare(config);
    const image = await loadReference(config.referenceImage);
    renderFrame(config, image, 1.4);
    return canvas.toDataURL('image/png').split(',')[1];
  };
})();
`
}

/** Stable 32-bit hash so a prompt always maps to the same visual seed. */
export function seedFromString(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

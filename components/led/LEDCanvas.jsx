import { useEffect, useMemo, useRef, useState } from "react";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const PX_PER_MM = 3;
const GIF_DEBUG_FLAG = "__LED_GIF_DEBUG__";
const GIF_LOG_PREFIX = "[LEDCanvas][GIF]";

function isGifDebugEnabled() {
  if (typeof window === "undefined") return false;
  const flag = window[GIF_DEBUG_FLAG];
  return flag === undefined ? true : Boolean(flag);
}

function gifDebugLog(...args) {
  if (!isGifDebugEnabled()) return;
  console.debug(GIF_LOG_PREFIX, ...args);
}

function gifDebugWarn(...args) {
  if (!isGifDebugEnabled()) return;
  console.warn(GIF_LOG_PREFIX, ...args);
}

function gifDebugError(...args) {
  if (!isGifDebugEnabled()) return;
  console.error(GIF_LOG_PREFIX, ...args);
}

function normalizeError(err) {
  if (!err) return { name: "UnknownError", message: "Unknown error", stack: "" };
  return {
    name: String(err.name || "Error"),
    message: String(err.message || err),
    stack: typeof err.stack === "string" ? err.stack : "",
  };
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getSourceSize(source) {
  if (!source) return { width: 0, height: 0 };
  // For animated <img>, width/height may reflect CSS layout (our proxy is 1x1).
  // Use intrinsic media size when available.
  // VideoFrame (ImageDecoder) exposes display/coded sizes, not naturalWidth/videoWidth.
  const width =
    source.naturalWidth ||
    source.videoWidth ||
    source.displayWidth ||
    source.codedWidth ||
    source.width ||
    0;
  const height =
    source.naturalHeight ||
    source.videoHeight ||
    source.displayHeight ||
    source.codedHeight ||
    source.height ||
    0;
  return { width, height };
}

function isSourceReady(source) {
  const { width, height } = getSourceSize(source);
  return width > 0 && height > 0;
}

function rasterizeSource(source, resizeMode, samplingMode, cols, rows) {
  const sample = document.createElement("canvas");
  sample.width = cols;
  sample.height = rows;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  const useCrispSampling = samplingMode === "crisp";

  if (sctx) {
    sctx.imageSmoothingEnabled = !useCrispSampling;
    // Lower quality when crisp to avoid any extra interpolation work.
    sctx.imageSmoothingQuality = useCrispSampling ? "low" : "high";
  }
  const { width: srcW, height: srcH } = getSourceSize(source);
  if (!srcW || !srcH) {
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, cols, rows);
    return sctx.getImageData(0, 0, cols, rows);
  }

  if (resizeMode === "crop") {
    const imgAspect = srcW / srcH;
    const panelAspect = cols / rows;
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (imgAspect > panelAspect) {
      sw = srcH * panelAspect;
      sx = (srcW - sw) * 0.5;
    } else {
      sh = srcW / panelAspect;
      sy = (srcH - sh) * 0.5;
    }
    sctx.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows);
  } else {
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, cols, rows);
    const imgAspect = srcW / srcH;
    const panelAspect = cols / rows;
    let dw = cols;
    let dh = rows;
    let dx = 0;
    let dy = 0;
    if (imgAspect > panelAspect) {
      dh = cols / imgAspect;
      dy = (rows - dh) * 0.5;
    } else {
      dw = rows * imgAspect;
      dx = (cols - dw) * 0.5;
    }
    sctx.drawImage(source, dx, dy, dw, dh);
  }

  return sctx.getImageData(0, 0, cols, rows);
}

function drawPanelFromSampledData(ctx, sampledData, settings, cols, rows, width, height) {
  const { ledDiameter, patchPadding, brightness, panelBg, patchPitchMm } = settings;
  const pitchPx = (patchPitchMm || 2.5) * PX_PER_MM;
  const cell = pitchPx;
  const pad = Math.max(0, (pitchPx - ledDiameter) * 0.5);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = panelBg;
  ctx.fillRect(0, 0, width, height);

  const data = sampledData;
  const ledRadius = ledDiameter * 0.5;
  const offAlphaThreshold = 16;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = x * cell;
      const py = y * cell;

      const idx = (y * cols + x) * 4;
      const r = clamp(Math.round(data[idx] * brightness), 0, 255);
      const g = clamp(Math.round(data[idx + 1] * brightness), 0, 255);
      const b = clamp(Math.round(data[idx + 2] * brightness), 0, 255);
      const a = data[idx + 3];
      const isOff = a < offAlphaThreshold;

      const cx = px + pad + ledRadius;
      const cy = py + pad + ledRadius;
      if (isOff) {
        ctx.fillStyle = "rgb(12, 12, 12)";
      } else {
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, ledRadius, 0, Math.PI * 2);
      ctx.fill();

      if (isOff) {
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.20)";
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(0.5, ledRadius - 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawPanelFrame(ctx, source, settings, cols, rows, width, height) {
  const { resizeMode, samplingMode } = settings;
  const sampled = rasterizeSource(source, resizeMode, samplingMode, cols, rows);
  drawPanelFromSampledData(ctx, sampled.data, settings, cols, rows, width, height);
}

export default function LEDCanvas({ asset, settings, cols, rows }) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const gifAnimRef = useRef(null);
  const rafRef = useRef(null);
  const gifFramesRef = useRef([]);
  const gifFrameIdxRef = useRef(0);
  const gifNextTsRef = useRef(0);
  const gifDecodeTokenRef = useRef(0);
  const gifProxyReadyRef = useRef(false);
  const gifLastLoggedFrameIdxRef = useRef(-1);
  const gifFallbackTickRef = useRef(0);
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });

  const intrinsic = useMemo(() => {
    const cell = (settings.patchPitchMm || 2.5) * PX_PER_MM;
    return { width: cols * cell, height: rows * cell };
  }, [cols, rows, settings.patchPitchMm]);

  useEffect(() => {
    const host = frameRef.current;
    if (!host) return undefined;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setViewport({ width: box.width, height: box.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!asset?.isGif || !asset?.src) {
      gifDebugLog("reset gif state", { hasAsset: Boolean(asset), isGif: Boolean(asset?.isGif) });
      gifAnimRef.current = null;
      gifFramesRef.current = [];
      gifFrameIdxRef.current = 0;
      gifNextTsRef.current = 0;
      gifProxyReadyRef.current = false;
      gifLastLoggedFrameIdxRef.current = -1;
      gifFallbackTickRef.current = 0;
      return;
    }
    gifDebugLog("new gif asset", {
      name: asset.name,
      type: asset.type,
      width: asset.width,
      height: asset.height,
      cols,
      rows,
      resizeMode: settings.resizeMode,
      src: asset.src,
    });
  }, [asset, cols, rows, settings.resizeMode]);

  useEffect(() => {
    let cancelled = false;
    gifFramesRef.current = [];
    gifFrameIdxRef.current = 0;
    gifNextTsRef.current = 0;
    gifLastLoggedFrameIdxRef.current = -1;
    gifFallbackTickRef.current = 0;

    if (!asset?.isGif || !asset?.src) return undefined;
    if (!("ImageDecoder" in window)) {
      gifDebugWarn("ImageDecoder unavailable, using live <img> fallback");
      return undefined;
    }

    const token = gifDecodeTokenRef.current + 1;
    gifDecodeTokenRef.current = token;
    gifDebugLog("starting ImageDecoder pass", { token, src: asset.src });

    (async () => {
      try {
        const blob = await fetch(asset.src).then((r) => r.blob());
        gifDebugLog("gif blob fetched", { token, byteLength: blob.size });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        gifDebugLog("gif bytes prepared", { token, byteLength: bytes.byteLength, blobType: blob.type });
        const decoder = new ImageDecoder({
          data: bytes,
          type: blob.type || "image/gif",
        });
        await decoder.tracks.ready;
        const reportedCount = decoder.tracks.selectedTrack?.frameCount;
        const frames = [];
        gifDebugLog("decoder track ready", { token, reportedCount });

        const decodeAndStoreFrame = async (frameIndex) => {
          const result = await decoder.decode({ frameIndex, completeFramesOnly: true });
          const frame = result.image;
          const sampled = rasterizeSource(frame, settings.resizeMode, settings.samplingMode, cols, rows);
          const delayMs = Math.max(20, Math.round((frame.duration ?? 100000) / 1000));
          frames.push({
            data: sampled.data.slice(),
            delayMs,
          });
          gifDebugLog("decoded frame", {
            token,
            frameIndex,
            delayMs,
            width: frame.displayWidth ?? frame.codedWidth ?? frame.width,
            height: frame.displayHeight ?? frame.codedHeight ?? frame.height,
          });
          frame.close();
        };

        if (reportedCount && reportedCount > 1) {
          for (let i = 0; i < reportedCount; i += 1) {
            if (cancelled || token !== gifDecodeTokenRef.current) {
              decoder.close();
              return;
            }
            await decodeAndStoreFrame(i);
          }
        } else {
          // Some engines report an unreliable frameCount for GIF tracks.
          for (let i = 0; ; i += 1) {
            if (cancelled || token !== gifDecodeTokenRef.current) {
              decoder.close();
              return;
            }
            try {
              await decodeAndStoreFrame(i);
            } catch (err) {
              const errName = typeof err?.name === "string" ? err.name : "";
              const errMsg = String(err?.message ?? "").toLowerCase();
              const isOutOfRange =
                errName === "IndexSizeError" ||
                errName === "RangeError" ||
                errMsg.includes("out of range") ||
                errMsg.includes("outside the range") ||
                errMsg.includes("frame index");
              if (isOutOfRange) {
                gifDebugLog("decoder reached end of frames", {
                  token,
                  stopAtIndex: i,
                  decodedFrames: frames.length,
                  errName,
                  errMsg,
                });
                break;
              }
              if (frames.length > 1) {
                gifDebugWarn("decoder threw after partial decode, keeping decoded frames", {
                  token,
                  decodedFrames: frames.length,
                  errName,
                  errMsg,
                  error: err,
                });
                break;
              }
              throw err;
            }
          }
        }
        decoder.close();

        if (!cancelled && token === gifDecodeTokenRef.current && frames.length > 1) {
          gifFramesRef.current = frames;
          gifFrameIdxRef.current = 0;
          gifNextTsRef.current = performance.now() + frames[0].delayMs;
          gifDebugLog("decoder playback ready", {
            token,
            frameCount: frames.length,
            firstDelayMs: frames[0].delayMs,
          });
        } else {
          gifDebugWarn("decoder did not provide animated frames, fallback remains active", {
            token,
            cancelled,
            isCurrentToken: token === gifDecodeTokenRef.current,
            frameCount: frames.length,
          });
        }
      } catch (err) {
        const normalized = normalizeError(err);
        // If decoding fails, fallback path uses a live DOM <img>.
        gifDebugError("decoder path failed, using fallback <img>", {
          token,
          error: normalized,
        });
      }
    })();

    return () => {
      cancelled = true;
      gifDebugLog("decoder effect cleanup", { token });
    };
  }, [asset?.isGif, asset?.src, cols, rows, settings.resizeMode]);

  useEffect(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!asset) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    canvas.width = intrinsic.width;
    canvas.height = intrinsic.height;
    gifDebugLog("canvas prepared", {
      width: canvas.width,
      height: canvas.height,
      cols,
      rows,
      isGif: Boolean(asset?.isGif),
    });

    const drawStaticSource = () => {
      const source = asset.image;
      if (!isSourceReady(source)) return;
      drawPanelFrame(ctx, source, settings, cols, rows, intrinsic.width, intrinsic.height);
    };

    const drawGifFrame = (now) => {
      const decodedFrames = gifFramesRef.current;
      if (decodedFrames.length > 1) {
        if (gifNextTsRef.current === 0) {
          gifNextTsRef.current = now + decodedFrames[gifFrameIdxRef.current].delayMs;
        } else if (now >= gifNextTsRef.current) {
          gifFrameIdxRef.current = (gifFrameIdxRef.current + 1) % decodedFrames.length;
          gifNextTsRef.current = now + decodedFrames[gifFrameIdxRef.current].delayMs;
        }
        const frame = decodedFrames[gifFrameIdxRef.current];
        if (gifLastLoggedFrameIdxRef.current !== gifFrameIdxRef.current) {
          gifLastLoggedFrameIdxRef.current = gifFrameIdxRef.current;
          gifDebugLog("rendering decoded frame", {
            frameIndex: gifFrameIdxRef.current,
            totalFrames: decodedFrames.length,
            delayMs: frame.delayMs,
          });
        }
        drawPanelFromSampledData(ctx, frame.data, settings, cols, rows, intrinsic.width, intrinsic.height);
        return;
      }

      // Fallback for engines without reliable ImageDecoder animated support.
      const proxyReady = gifProxyReadyRef.current;
      const source = proxyReady && gifAnimRef.current && isSourceReady(gifAnimRef.current) ? gifAnimRef.current : asset.image;
      if (!isSourceReady(source)) {
        if (gifFallbackTickRef.current < 10) {
          gifDebugWarn("fallback source not ready yet", {
            tick: gifFallbackTickRef.current,
            proxyReady,
            hasProxy: Boolean(gifAnimRef.current),
            hasAssetImage: Boolean(asset.image),
          });
        }
        gifFallbackTickRef.current += 1;
        return;
      }
      gifFallbackTickRef.current += 1;
      if (gifFallbackTickRef.current <= 10 || gifFallbackTickRef.current % 30 === 0) {
        const sourceSize = getSourceSize(source);
        gifDebugLog("fallback draw tick", {
          tick: gifFallbackTickRef.current,
          proxyReady,
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
        });
      }
      drawPanelFrame(ctx, source, settings, cols, rows, intrinsic.width, intrinsic.height);
    };

    if (asset.isGif) {
      gifDebugLog("starting gif animation loop");
      const loop = (now) => {
        drawGifFrame(now);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        gifDebugLog("stopped gif animation loop");
      };
    }

    gifDebugLog("rendering static image");
    drawStaticSource();
    return undefined;
  }, [asset, settings, cols, rows, intrinsic.width, intrinsic.height]);

  const scale = useMemo(() => {
    if (!viewport.width || !viewport.height) return 1;
    const pad = 20;
    return Math.min((viewport.width - pad) / intrinsic.width, (viewport.height - pad) / intrinsic.height, 1);
  }, [intrinsic.height, intrinsic.width, viewport.height, viewport.width]);

  const displayWidth = Math.max(1, Math.floor(intrinsic.width * scale));
  const displayHeight = Math.max(1, Math.floor(intrinsic.height * scale));

  return (
    <section ref={frameRef} className="led-frame">
      {asset?.isGif ? (
        <img
          key={asset.src}
          ref={gifAnimRef}
          src={asset.src}
          alt=""
          className="led-gif-proxy"
          aria-hidden
          loading="eager"
          onLoad={() => {
            gifProxyReadyRef.current = true;
            gifDebugLog("gif proxy image loaded", { src: asset.src });
          }}
          onError={(event) => {
            gifDebugError("gif proxy image failed to load", {
              src: asset.src,
              error: event?.nativeEvent,
            });
          }}
        />
      ) : null}

      {!asset ? (
        <div className="led-empty">
          <p>Upload an image to start simulation.</p>
          <p>Canvas auto-fits the viewport and keeps LED circles crisp.</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            imageRendering: "pixelated",
            borderRadius: "12px",
            boxShadow: "0 24px 72px rgba(0, 0, 0, 0.55)",
          }}
        />
      )}
    </section>
  );
}

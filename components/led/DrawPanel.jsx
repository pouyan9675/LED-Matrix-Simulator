import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function FieldTitle({ title, value }) {
  return (
    <div className="cp-field-title">
      <p>{title}</p>
      <p className="cp-field-value">{value}</p>
    </div>
  );
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function parseHexColor(input) {
  const raw = String(input || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) return null;
  const hex = match[1];
  return {
    hex: `#${hex.toLowerCase()}`,
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function paintCircle(imageData, cols, rows, cx, cy, diameter, rgba) {
  const r = Math.max(0, (diameter - 1) / 2);
  const rCeil = Math.ceil(r);
  const r2 = r * r;
  const minX = clampInt(cx - rCeil, 0, cols - 1);
  const maxX = clampInt(cx + rCeil, 0, cols - 1);
  const minY = clampInt(cy - rCeil, 0, rows - 1);
  const maxY = clampInt(cy + rCeil, 0, rows - 1);

  const data = imageData.data;
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      const idx = (y * cols + x) * 4;
      data[idx] = rgba.r;
      data[idx + 1] = rgba.g;
      data[idx + 2] = rgba.b;
      data[idx + 3] = rgba.a;
    }
  }

  return { minX, minY, maxX, maxY };
}

function paintLine(imageData, cols, rows, from, to, diameter, rgba) {
  if (!from) {
    const dirty = paintCircle(imageData, cols, rows, to.x, to.y, diameter, rgba);
    return dirty;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)));
  let dirty = null;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(from.x + dx * t);
    const y = Math.round(from.y + dy * t);
    const nextDirty = paintCircle(imageData, cols, rows, x, y, diameter, rgba);
    if (!dirty) {
      dirty = nextDirty;
    } else {
      dirty = {
        minX: Math.min(dirty.minX, nextDirty.minX),
        minY: Math.min(dirty.minY, nextDirty.minY),
        maxX: Math.max(dirty.maxX, nextDirty.maxX),
        maxY: Math.max(dirty.maxY, nextDirty.maxY),
      };
    }
  }

  return dirty;
}

function commitToCanvas(canvas, imageData, dirty) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  if (!dirty) {
    ctx.putImageData(imageData, 0, 0);
    return;
  }
  const w = dirty.maxX - dirty.minX + 1;
  const h = dirty.maxY - dirty.minY + 1;
  ctx.putImageData(imageData, 0, 0, dirty.minX, dirty.minY, w, h);
}

function copyImageData(src, srcCols, srcRows, dst, dstCols, dstRows) {
  const w = Math.min(srcCols, dstCols);
  const h = Math.min(srcRows, dstRows);
  if (w <= 0 || h <= 0) return;

  for (let y = 0; y < h; y += 1) {
    const srcStart = (y * srcCols) * 4;
    const dstStart = (y * dstCols) * 4;
    dst.data.set(src.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
}

export default function DrawPanel({ cols, rows, setDrawAsset, isActive }) {
  const canvasRef = useRef(null);
  const imageDataRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const rafCommitRef = useRef(0);

  const [tool, setTool] = useState("brush"); // brush | eraser
  const [brushSize, setBrushSize] = useState(1);
  const [color, setColor] = useState("#ffffff");

  const brushRgba = useMemo(() => {
    const parsed = parseHexColor(color) ?? { r: 255, g: 255, b: 255, a: 255, hex: "#ffffff" };
    return { ...parsed, a: 255 };
  }, [color]);

  const eraserRgba = useMemo(() => ({ r: 0, g: 0, b: 0, a: 0 }), []);

  const scheduleAssetBump = useCallback(() => {
    if (rafCommitRef.current) return;
    rafCommitRef.current = requestAnimationFrame(() => {
      rafCommitRef.current = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;
      setDrawAsset((prev) => ({
        name: "Drawing",
        type: "image/draw",
        src: null,
        width: cols,
        height: rows,
        image: canvas,
        isGif: false,
        revision: (prev?.revision ?? 0) + 1,
      }));
    });
  }, [cols, rows, setDrawAsset]);

  const initOrResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prev = imageDataRef.current;
    const prevCols = prev?.width ?? 0;
    const prevRows = prev?.height ?? 0;

    canvas.width = cols;
    canvas.height = rows;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const next = ctx.createImageData(cols, rows);
    if (prev && prevCols > 0 && prevRows > 0) {
      copyImageData(prev, prevCols, prevRows, next, cols, rows);
    }

    imageDataRef.current = next;
    ctx.putImageData(next, 0, 0);
    scheduleAssetBump();
  }, [cols, rows, scheduleAssetBump]);

  useEffect(() => {
    initOrResize();
    return () => {
      if (rafCommitRef.current) {
        cancelAnimationFrame(rafCommitRef.current);
        rafCommitRef.current = 0;
      }
    };
  }, [initOrResize]);

  const getPointFromEvent = useCallback(
    (event) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: clampInt(x, 0, cols - 1),
        y: clampInt(y, 0, rows - 1),
      };
    },
    [cols, rows],
  );

  const applyStroke = useCallback(
    (from, to) => {
      const imageData = imageDataRef.current;
      const canvas = canvasRef.current;
      if (!imageData || !canvas) return;

      const rgba = tool === "eraser" ? eraserRgba : brushRgba;
      const dirty = paintLine(
        imageData,
        cols,
        rows,
        from,
        to,
        clampInt(brushSize, 1, 128),
        rgba,
      );
      commitToCanvas(canvas, imageData, dirty);
      scheduleAssetBump();
    },
    [brushRgba, brushSize, cols, eraserRgba, rows, scheduleAssetBump, tool],
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      isDrawingRef.current = true;
      const point = getPointFromEvent(event);
      if (!point) return;
      lastPointRef.current = point;
      applyStroke(null, point);
    },
    [applyStroke, getPointFromEvent],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();
      const point = getPointFromEvent(event);
      if (!point) return;
      const last = lastPointRef.current;
      lastPointRef.current = point;
      applyStroke(last, point);
    },
    [applyStroke, getPointFromEvent],
  );

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const imageData = imageDataRef.current;
    if (!canvas || !imageData) return;
    imageData.data.fill(0);
    commitToCanvas(canvas, imageData, null);
    scheduleAssetBump();
  }, [scheduleAssetBump]);

  const maxBrush = useMemo(() => clampInt(Math.floor(Math.min(cols, rows) / 2), 8, 128), [cols, rows]);

  return (
    <section className="draw-panel" aria-hidden={!isActive}>
      <div className="cp-mode-grid dp-tool-grid">
        <button
          type="button"
          onClick={() => setTool("brush")}
          className={`cp-mode-btn ${tool === "brush" ? "is-active" : ""}`}
        >
          Brush
        </button>
        <button
          type="button"
          onClick={() => setTool("eraser")}
          className={`cp-mode-btn ${tool === "eraser" ? "is-active" : ""}`}
        >
          Eraser
        </button>
      </div>

      <div className="cp-group">
        <div>
          <FieldTitle title="Brush size" value={`${brushSize}px`} />
          <div className="cp-size-row">
            <input
              type="range"
              min={1}
              max={maxBrush}
              step={1}
              value={brushSize}
              onChange={(e) => setBrushSize(clampInt(Number(e.target.value), 1, maxBrush))}
              className="slider-track"
            />
            <input
              type="number"
              min={1}
              max={maxBrush}
              step={1}
              value={brushSize}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return;
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                setBrushSize(clampInt(Math.round(parsed), 1, maxBrush));
              }}
              className="cp-number-input"
            />
          </div>
        </div>

        <div>
          <FieldTitle title="Color" value={(parseHexColor(color)?.hex ?? "#ffffff").toUpperCase()} />
          <div className="cp-color-row">
            <input
              type="color"
              value={parseHexColor(color)?.hex ?? "#ffffff"}
              onChange={(e) => setColor(e.target.value)}
              className="cp-color-picker"
              disabled={tool === "eraser"}
              title={tool === "eraser" ? "Color disabled while erasing" : "Pick brush color"}
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="cp-color-text"
              disabled={tool === "eraser"}
            />
          </div>
        </div>

        <div className="dp-actions">
          <button type="button" onClick={handleClear} className="dp-action-btn">
            Clear
          </button>
          <p className="dp-meta">
            {cols} x {rows} pixels
          </p>
        </div>
      </div>

      <div className="dp-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="dp-canvas"
          style={{ imageRendering: "pixelated" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>
    </section>
  );
}


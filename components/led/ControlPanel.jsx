import { useEffect, useState } from "react";

function FieldTitle({ title, value }) {
  return (
    <div className="cp-field-title">
      <p>{title}</p>
      <p className="cp-field-value">{value}</p>
    </div>
  );
}

function SliderRow({ title, value, min, max, step, format, onChange }) {
  return (
    <div>
      <FieldTitle title={title} value={format(value)} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-track"
      />
    </div>
  );
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function SizeRow({ title, value, min, max, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setDraft(String(value));
  }, [isFocused, value]);

  const handleRangeChange = (event) => {
    onChange(clampInt(Number(event.target.value), min, max));
  };

  const commitDraft = () => {
    const raw = String(draft ?? "").trim();
    if (raw === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = clampInt(Math.round(parsed), min, max);
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <div>
      <FieldTitle title={title} value={`${value}px`} />
      <div className="cp-size-row">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={handleRangeChange}
          className="slider-track"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            commitDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
          className="cp-number-input"
        />
      </div>
    </div>
  );
}

function clampFloat(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function MetricRow({ title, valueMm, minMm, maxMm, step = 0.1, onCommit }) {
  const [draft, setDraft] = useState(String(valueMm.toFixed(1)));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setDraft(String(valueMm.toFixed(1)));
  }, [isFocused, valueMm]);

  const commitDraft = () => {
    const raw = String(draft ?? "").trim();
    if (raw === "") {
      setDraft(String(valueMm.toFixed(1)));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(valueMm.toFixed(1)));
      return;
    }
    const clamped = clampFloat(parsed, minMm, maxMm);
    onCommit(clamped);
    setDraft(String(clamped.toFixed(1)));
  };

  return (
    <div>
      <FieldTitle title={title} value={`${valueMm.toFixed(1)}mm`} />
      <div className="cp-size-row">
        <input
          type="range"
          min={minMm}
          max={maxMm}
          step={step}
          value={valueMm}
          onChange={(e) => onCommit(clampFloat(Number(e.target.value), minMm, maxMm))}
          className="slider-track"
        />
        <input
          type="number"
          min={minMm}
          max={maxMm}
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            commitDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(String(valueMm.toFixed(1)));
              e.currentTarget.blur();
            }
          }}
          className="cp-number-input"
        />
      </div>
    </div>
  );
}

function ColorRow({ title, value, onChange }) {
  return (
    <div>
      <FieldTitle title={title} value={value.toUpperCase()} />
      <div className="cp-color-row">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cp-color-picker"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cp-color-text"
        />
      </div>
    </div>
  );
}

export default function ControlPanel({ settings, onChange, panelSize, onPanelSizeChange, hideMappingSampling = false }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const [resolutionUnit, setResolutionUnit] = useState("px"); // px | mm
  const pitch = Number(settings.patchPitchMm) || 1;
  const PX_PER_MM = 3;
  const pxToMm = (vPx) => vPx / PX_PER_MM;
  const mmToPx = (vMm) => vMm * PX_PER_MM;

  return (
    <section className="control-panel">
      <div>
        <p className="cp-section-title">Resolution</p>
        <div className="cp-group">
          <div className="cp-mode-grid">
            <button
              type="button"
              onClick={() => setResolutionUnit("px")}
              className={`cp-mode-btn ${resolutionUnit === "px" ? "is-active" : ""}`}
            >
              Pixels
            </button>
            <button
              type="button"
              onClick={() => setResolutionUnit("mm")}
              className={`cp-mode-btn ${resolutionUnit === "mm" ? "is-active" : ""}`}
            >
              Millimeters
            </button>
          </div>

          {resolutionUnit === "px" ? (
            <>
              <SizeRow
                title="Columns"
                value={panelSize.cols}
                min={32}
                max={1024}
                onChange={(cols) => onPanelSizeChange({ ...panelSize, cols })}
              />
              <SizeRow
                title="Rows"
                value={panelSize.rows}
                min={32}
                max={1024}
                onChange={(rows) => onPanelSizeChange({ ...panelSize, rows })}
              />
            </>
          ) : (
            <>
              <MetricRow
                title="Width"
                valueMm={panelSize.cols * pitch}
                minMm={32 * pitch}
                maxMm={1024 * pitch}
                step={Math.max(0.1, pitch)}
                onCommit={(widthMm) => {
                  const cols = clampInt(Math.round(widthMm / pitch), 32, 1024);
                  onPanelSizeChange({ ...panelSize, cols });
                }}
              />
              <MetricRow
                title="Height"
                valueMm={panelSize.rows * pitch}
                minMm={32 * pitch}
                maxMm={1024 * pitch}
                step={Math.max(0.1, pitch)}
                onCommit={(heightMm) => {
                  const rows = clampInt(Math.round(heightMm / pitch), 32, 1024);
                  onPanelSizeChange({ ...panelSize, rows });
                }}
              />
            </>
          )}
        </div>
      </div>

      {!hideMappingSampling ? (
        <>
          <div>
            <p className="cp-section-title">Mapping</p>
            <div className="cp-mode-grid">
              <button
                type="button"
                onClick={() => update("resizeMode", "fit")}
                className={`cp-mode-btn ${settings.resizeMode === "fit" ? "is-active" : ""}`}
              >
                Keep Ratio
              </button>
              <button
                type="button"
                onClick={() => update("resizeMode", "crop")}
                className={`cp-mode-btn ${settings.resizeMode === "crop" ? "is-active" : ""}`}
              >
                Center Crop
              </button>
            </div>
          </div>

          <div>
            <p className="cp-section-title">Sampling</p>
            <div className="cp-mode-grid">
              <button
                type="button"
                onClick={() => update("samplingMode", "crisp")}
                className={`cp-mode-btn ${settings.samplingMode === "crisp" ? "is-active" : ""}`}
              >
                Crisp
              </button>
              <button
                type="button"
                onClick={() => update("samplingMode", "smooth")}
                className={`cp-mode-btn ${settings.samplingMode === "smooth" ? "is-active" : ""}`}
              >
                Resize
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="cp-group">
        <SliderRow
          title="LED Diameter"
          value={pxToMm(settings.ledDiameter)}
          min={1.0}
          max={4.0}
          step={0.1}
          format={(v) => `${v.toFixed(1)}mm`}
          onChange={(vMm) => {
            const ledPx = clampInt(Math.round(mmToPx(vMm)), 4, 14);
            update("ledDiameter", ledPx);
          }}
        />
        <SliderRow
          title="Pitch"
          value={settings.patchPitchMm}
          min={1.0}
          max={8.0}
          step={0.5}
          format={(v) => `${v.toFixed(1)}mm`}
          onChange={(vMm) => update("patchPitchMm", vMm)}
        />
        <SliderRow title="Brightness" value={settings.brightness} min={0.3} max={1.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update("brightness", v)} />
      </div>

      <div className="cp-group cp-group-colors">
        <ColorRow title="Panel BG" value={settings.panelBg} onChange={(v) => update("panelBg", v)} />
        <ColorRow title="Patch BG" value={settings.patchBg} onChange={(v) => update("patchBg", v)} />
        <ColorRow title="Patch Border" value={settings.patchBorder} onChange={(v) => update("patchBorder", v)} />
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import ControlPanel from "../components/led/ControlPanel";
import ImageUploader from "../components/led/ImageUploader";
import LEDCanvas from "../components/led/LEDCanvas";
import DrawPanel from "../components/led/DrawPanel";

const DEFAULT_PANEL = {
  cols: 96,
  rows: 48,
};

const DEFAULT_SETTINGS = {
  resizeMode: "fit",
  samplingMode: "crisp",
  ledDiameter: 7,
  patchPadding: 1,
  patchRadius: 2,
  patchBorderWidth: 1,
  patchPitchMm: 2.5,
  brightness: 1.0,
  panelBg: "#05070a",
  patchBg: "#12171d",
  patchBorder: "#27303a",
};

export default function Simulator() {
  const [inputMode, setInputMode] = useState("image"); // image | draw
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [drawAsset, setDrawAsset] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [panelSize, setPanelSize] = useState(DEFAULT_PANEL);

  const applyOrientation = (targetOrientation) => {
    setPanelSize((prev) => {
      const isHorizontal = prev.cols >= prev.rows;
      if (targetOrientation === "horizontal" && isHorizontal) return prev;
      if (targetOrientation === "vertical" && !isHorizontal) return prev;
      return { cols: prev.rows, rows: prev.cols };
    });
  };

  const handleUploadedAssetLoad = (nextAsset) => {
    setUploadedAsset(nextAsset);
    setInputMode("image");
    if (!nextAsset) return;
    if (nextAsset.height > nextAsset.width) {
      applyOrientation("vertical");
    } else if (nextAsset.width > nextAsset.height) {
      applyOrientation("horizontal");
    }
  };

  const activeAsset = inputMode === "draw" ? drawAsset : uploadedAsset;

  const panelMeta = useMemo(
    () => ({
      cols: panelSize.cols,
      rows: panelSize.rows,
      widthMm: (panelSize.cols * settings.patchPitchMm).toFixed(1),
      heightMm: (panelSize.rows * settings.patchPitchMm).toFixed(1),
    }),
    [panelSize.cols, panelSize.rows, settings.patchPitchMm],
  );

  return (
    <div className="sim-app">
      <div className="sim-bg" />

      <header className="sim-header">
        <div className="sim-header-inner">
          <div>
            <h1 className="sim-title">LED Matrix Simulator</h1>
            <p className="sim-subtitle">
              {panelMeta.cols} x {panelMeta.rows} pixels | {panelMeta.widthMm}mm x {panelMeta.heightMm}mm @{" "}
              {settings.patchPitchMm.toFixed(1)}mm pitch
            </p>
          </div>
          <div className="sim-header-actions">
            <div className="sim-orientation">
              <button
                type="button"
                className={`sim-orientation-btn ${panelMeta.cols >= panelMeta.rows ? "is-active" : ""}`}
                onClick={() => applyOrientation("horizontal")}
              >
                Horizontal
              </button>
              <button
                type="button"
                className={`sim-orientation-btn ${panelMeta.rows > panelMeta.cols ? "is-active" : ""}`}
                onClick={() => applyOrientation("vertical")}
              >
                Vertical
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="sim-reset-btn"
            >
              Reset Style
            </button>
          </div>
        </div>
      </header>

      <div className="sim-layout">
        <aside className="sim-sidebar">
          <div className="sim-sidebar-inner">
            <section className="input-switcher">
              <p className="cp-section-title">Input</p>
              <div className="cp-mode-grid input-tabs">
                <button
                  type="button"
                  onClick={() => setInputMode("image")}
                  className={`cp-mode-btn ${inputMode === "image" ? "is-active" : ""}`}
                >
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("draw")}
                  className={`cp-mode-btn ${inputMode === "draw" ? "is-active" : ""}`}
                >
                  Draw
                </button>
              </div>

              <div className={inputMode === "image" ? "" : "is-hidden"}>
                <ImageUploader onLoad={handleUploadedAssetLoad} asset={uploadedAsset} showTitle={false} />
              </div>

              <div className={inputMode === "draw" ? "" : "is-hidden"}>
                <DrawPanel
                  cols={panelSize.cols}
                  rows={panelSize.rows}
                  setDrawAsset={setDrawAsset}
                  isActive={inputMode === "draw"}
                />
              </div>
            </section>
            <ControlPanel
              settings={settings}
              onChange={setSettings}
              panelSize={panelSize}
              onPanelSizeChange={setPanelSize}
              hideMappingSampling={inputMode === "draw"}
            />
          </div>
        </aside>

        <main className="sim-main">
          <LEDCanvas asset={activeAsset} settings={settings} cols={panelSize.cols} rows={panelSize.rows} />
        </main>
      </div>
    </div>
  );
}

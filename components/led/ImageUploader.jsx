import { useCallback, useEffect, useRef, useState } from "react";

const GIF_DEBUG_FLAG = "__LED_GIF_DEBUG__";
const GIF_LOG_PREFIX = "[ImageUploader]";

function isGifDebugEnabled() {
  if (typeof window === "undefined") return false;
  const flag = window[GIF_DEBUG_FLAG];
  return flag === undefined ? true : Boolean(flag);
}

function uploaderDebugLog(...args) {
  if (!isGifDebugEnabled()) return;
  console.debug(GIF_LOG_PREFIX, ...args);
}

function uploaderDebugError(...args) {
  if (!isGifDebugEnabled()) return;
  console.error(GIF_LOG_PREFIX, ...args);
}

export default function ImageUploader({ onLoad, asset, showTitle = true }) {
  const inputRef = useRef(null);
  const lastObjectUrlRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        uploaderDebugLog("revoking object URL on unmount", { src: lastObjectUrlRef.current });
        URL.revokeObjectURL(lastObjectUrlRef.current);
        lastObjectUrlRef.current = null;
      }
    };
  }, []);

  const loadFile = useCallback(
    (file) => {
      if (!file) return;
      if (!file.type?.startsWith("image/") && !file.name?.toLowerCase().endsWith(".gif")) {
        uploaderDebugError("ignored non-image file", { name: file.name, type: file.type, size: file.size });
        return;
      }

      if (lastObjectUrlRef.current) {
        uploaderDebugLog("revoking previous object URL", { src: lastObjectUrlRef.current });
        URL.revokeObjectURL(lastObjectUrlRef.current);
        lastObjectUrlRef.current = null;
      }

      const src = URL.createObjectURL(file);
      lastObjectUrlRef.current = src;
      const img = new Image();
      const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
      uploaderDebugLog("file selected", {
        name: file.name,
        size: file.size,
        type: file.type,
        isGif,
        src,
      });
      img.onload = () => {
        uploaderDebugLog("image element loaded", {
          name: file.name,
          isGif,
          width: img.width,
          height: img.height,
        });
        onLoad({
          name: file.name,
          type: file.type || "image/unknown",
          src,
          width: img.width,
          height: img.height,
          image: img,
          isGif,
        });
      };
      img.onerror = (loadError) => {
        uploaderDebugError("failed to load selected image", {
          name: file.name,
          isGif,
          src,
          error: loadError,
        });
      };
      img.src = src;
    },
    [onLoad],
  );

  const handlePick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadFile(file);
    // Allow selecting the same file again.
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    loadFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  return (
    <section
      className={`image-uploader ${isDragging ? "is-dragging" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {showTitle ? <p className="cp-section-title">Input</p> : null}
      <input ref={inputRef} type="file" accept="image/*" onChange={handlePick} className="is-hidden" />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="iu-upload-btn"
      >
        {asset ? "Change Image" : "Upload Image"}
      </button>

      {asset ? (
        <div className="iu-preview">
          <img src={asset.src} alt={asset.name} className="iu-preview-image" />
          <div className="iu-preview-meta">
            <p className="iu-file-name">{asset.name}</p>
            <p>{asset.width} x {asset.height}px</p>
            <p className="iu-file-type">{asset.isGif ? "Animated GIF (live redraw)" : asset.type}</p>
          </div>
        </div>
      ) : (
        <div className="iu-empty">
          Upload any image and preview it on the LED matrix.
        </div>
      )}

      <div className="iu-dropzone" aria-hidden>
        <p className="iu-dropzone-text">Drop an image here</p>
      </div>
    </section>
  );
}

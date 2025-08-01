// import React, { useRef, useState, useEffect, useContext } from "react";
// import { VideoContext } from "./video.jsx";

// function isVideoBlackFrame(videoEl, tempCanvas) {
//   if (!videoEl.videoWidth || !videoEl.videoHeight) return false;
//   tempCanvas.width = videoEl.videoWidth;
//   tempCanvas.height = videoEl.videoHeight;
//   const ctx = tempCanvas.getContext("2d");
//   ctx.drawImage(videoEl, 0, 0);
//   const data = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
//   let sum = 0;
//   const sampleCount = 100;
//   for (let i = 0; i < Math.min(sampleCount * 4, data.length); i += 4) {
//     sum += data[i] + data[i + 1] + data[i + 2];
//   }
//   const avg = sum / (Math.min(sampleCount, tempCanvas.width * tempCanvas.height) * 3);
//   return avg < 5;
// }

// export default function App() {
//   const videoRef = useRef(null);
//   const debugCanvasRef = useRef(null);
//   const { getOptimalStream, cameraStatus, isWeakCameraResolution } = useContext(VideoContext);
//   const [facing, setFacing] = useState("environment");
//   const [running, setRunning] = useState(false);
//   const [error, setError] = useState(null);
//   const [videoParams, setVideoParams] = useState({ w: 0, h: 0 });
//   const [frameMeta, setFrameMeta] = useState(null);
//   const [isBlack, setIsBlack] = useState(false);

//   const start = async () => {
//     setError(null);
//     setIsBlack(false);
//     const stream = await getOptimalStream(facing);
//     if (stream) {
//       videoRef.current.srcObject = stream;
//       try {
//         await videoRef.current.play();
//         setRunning(true);

//         // diagnostics: readyState / dimensions
//         console.log("video readyState:", videoRef.current.readyState);
//         console.log("video videoWidth/Height:", videoRef.current.videoWidth, videoRef.current.videoHeight);

//         // Получаем параметры видео из трека
//         const track = stream.getVideoTracks()[0];
//         if (track) {
//           const settings = track.getSettings();
//           setVideoParams({ w: settings.width || 0, h: settings.height || 0 });
//         }

//         // frame callback
//         if (videoRef.current?.requestVideoFrameCallback) {
//           const handleFrame = (now, metadata) => {
//             setFrameMeta(metadata);
//             videoRef.current.requestVideoFrameCallback(handleFrame);
//           };
//           videoRef.current.requestVideoFrameCallback(handleFrame);
//         }

//         // зеркало в canvas
//         const drawToCanvas = () => {
//           if (!videoRef.current || !debugCanvasRef.current) return;
//           const v = videoRef.current;
//           const c = debugCanvasRef.current;
//           const ctx = c.getContext("2d");
//           if (v.videoWidth && v.videoHeight) {
//             c.width = v.videoWidth;
//             c.height = v.videoHeight;
//             ctx.drawImage(v, 0, 0, c.width, c.height);
//           }
//           requestAnimationFrame(drawToCanvas);
//         };
//         drawToCanvas();

//         // проверка на чёрный кадр (несколько итераций)
//         const temp = document.createElement("canvas");
//         let checks = 0;
//         const interval = setInterval(() => {
//           if (videoRef.current) {
//             const black = isVideoBlackFrame(videoRef.current, temp);
//             setIsBlack(black);
//             checks += 1;
//             if (checks >= 6) clearInterval(interval);
//           }
//         }, 500);
//       } catch (e) {
//         setError("Play failed: " + e.message);
//       }
//     } else {
//       setError("Не удалось получить стрим");
//     }
//   };

//   // Обновлять videoParams при смене потока вручную, если уже запущено
//   useEffect(() => {
//     const el = videoRef.current;
//     if (!el) return;
//     const updateSettings = () => {
//       const stream = el.srcObject;
//       if (stream) {
//         const track = stream.getVideoTracks()[0];
//         if (track) {
//           const settings = track.getSettings();
//           setVideoParams({ w: settings.width || 0, h: settings.height || 0 });
//         }
//       }
//     };
//     el.addEventListener("loadeddata", updateSettings);
//     return () => el.removeEventListener("loadeddata", updateSettings);
//   }, [running]);

//   return (
//     <div style={{ padding: 20, fontFamily: "sans-serif" }}>
//       <h1>Camera Test</h1>
//       <div>
//         <label>
//           Facing:
//           <select value={facing} onChange={(e) => setFacing(e.target.value)} style={{ marginLeft: 8 }}>
//             <option value="environment">Environment</option>
//             <option value="user">User</option>
//           </select>
//         </label>
//         <button onClick={start} disabled={running} style={{ marginLeft: 12 }}>
//           Start
//         </button>
//       </div>
//       <div style={{ marginTop: 12 }}>
//         <div>Status: {cameraStatus}</div>
//         <div>Weak resolution: {isWeakCameraResolution ? "yes" : "no"}</div>
//         <div>
//           Video: {videoParams.w} x {videoParams.h}
//         </div>
//         <div>Variant: {JSON.stringify(localStorage.getItem(facing))}</div>
//         {frameMeta && (
//           <div>
//             Frame metadata: {`expectedDisplayTime=${frameMeta.expectedDisplayTime?.toFixed(1)}, w=${frameMeta.width}, h=${frameMeta.height}`}
//           </div>
//         )}
//         <div>Black frame detected: {isBlack ? "yes" : "no"}</div>
//         {error && <div style={{ color: "red" }}>{error}</div>}
//       </div>
//       <div style={{ marginTop: 20, display: "flex", gap: 12, flexDirection: "column" }}>
//         <div style={{ flex: 1 }}>
//           <video
//             ref={videoRef}
//             autoPlay
//             muted
//             playsInline
//             style={{ maxWidth: "100%", background: "#000" }}
//           />
//         </div>
//         <div style={{ flex: 1 }}>
//           <div style={{ fontSize: 12, marginBottom: 4 }}>Debug canvas (mirror of video):</div>
//           <canvas
//             ref={debugCanvasRef}
//             style={{
//               width: "100%",
//               maxWidth: 320,
//               background: "#222",
//               border: "1px solid #666",
//             }}
//           />
//         </div>
//       </div>
//     </div>
//   );
// }

import React, { useRef, useState, useEffect, useContext } from "react";
import { VideoContext } from "./video.jsx";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { getOptimalStream, cameraStatus, isWeakCameraResolution } =
    useContext(VideoContext);

  const [facing, setFacing] = useState("environment");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [videoParams, setVideoParams] = useState({ w: 0, h: 0 });

  // Получаем сохранённый variant из localStorage (если есть)
  let storedVariant = null;
  try {
    const raw = localStorage.getItem(facing);
    if (raw) storedVariant = JSON.parse(raw);
  } catch {}

  const syncCanvasSize = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Внутреннее разрешение = реальное
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    // CSS размер подгоняем под видимое видео (ширина контейнера)
    const rect = video.getBoundingClientRect();
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  };

  const drawFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    syncCanvasSize();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  };

  const start = async () => {
    setError(null);
    if (videoRef.current?.srcObject) {
      try {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      } catch {}
      videoRef.current.srcObject = null;
    }

    const stream = await getOptimalStream(facing);
    if (!stream) {
      setError("Не удалось получить стрим");
      return;
    }

    videoRef.current.srcObject = stream;
    try {
      await videoRef.current.play();
      setRunning(true);

      // Получаем параметры видео из трека
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        setVideoParams({ w: settings.width || 0, h: settings.height || 0 });
      }

      // Цикл отрисовки
      if (videoRef.current.requestVideoFrameCallback) {
        const frameCallback = () => {
          drawFrame();
          videoRef.current.requestVideoFrameCallback(frameCallback);
        };
        videoRef.current.requestVideoFrameCallback(frameCallback);
      } else {
        const loop = () => {
          drawFrame();
          requestAnimationFrame(loop);
        };
        loop();
      }
    } catch (e) {
      setError("Play failed: " + e.message);
    }
  };

  // При появлении метаданных синхронизируем размеры
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      syncCanvasSize();
      // и сразу обновить videoParams
      const stream = video.srcObject;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          setVideoParams({ w: settings.width || 0, h: settings.height || 0 });
        }
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Camera Test</h1>

      <div>
        <label>
          Facing:
          <select
            value={facing}
            onChange={(e) => setFacing(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="environment">Environment</option>
            <option value="user">User</option>
          </select>
        </label>
        <button onClick={start} disabled={running} style={{ marginLeft: 12 }}>
          Start
        </button>
      </div>

      <div style={{ marginTop: 12, lineHeight: 1.4 }}>
        <div>Status: {cameraStatus}</div>
        <div>Weak resolution: {isWeakCameraResolution ? "yes" : "no"}</div>
        <div>
          Video: {videoParams.w} x {videoParams.h}
        </div>
        <div>
          Variant:{" "}
          <pre style={{ display: "inline", margin: 0, padding: 0 }}>
            {JSON.stringify(storedVariant)}
          </pre>
        </div>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 20,
          width: "100%",
          maxWidth: 640,
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            visibility: "hidden", // источник только
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: "block",
          }}
        />
      </div>
    </div>
  );
}

import React, { useRef, useState, useEffect, useContext } from "react";
import { VideoContext } from "./video.jsx";
export default function App() {
  const videoRef = useRef(null);
  const { getOptimalStream, cameraStatus, isWeakCameraResolution } =
    useContext(VideoContext);
  const [facing, setFacing] = useState("environment");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [videoParams, setVideoParams] = useState({ w: 0, h: 0 });

  const start = async () => {
    setError(null);
    const stream = await getOptimalStream(facing);
    if (stream) {
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
      } catch (e) {
        setError("Play failed: " + e.message);
      }
    } else {
      setError("Не удалось получить стрим");
    }
  };

  // Обновлять videoParams при смене потока вручную, если уже запущено
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const updateSettings = () => {
      const stream = el.srcObject;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          setVideoParams({ w: settings.width || 0, h: settings.height || 0 });
        }
      }
    };
    el.addEventListener("loadeddata", updateSettings);
    return () => el.removeEventListener("loadeddata", updateSettings);
  }, [running]);

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
      <div style={{ marginTop: 12 }}>
        <div>Status: {cameraStatus}</div>
        <div>Weak resolution: {isWeakCameraResolution ? "yes" : "no"}</div>
        <div>
          Video: {videoParams.w} x {videoParams.h}
        </div>
        <div>Variant: {JSON.stringify(localStorage.getItem(facing))}</div>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </div>
      <div style={{ marginTop: 20 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", maxWidth: 640, background: "#000" }}
        />
      </div>
    </div>
  );
}

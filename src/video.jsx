import { useEffect, useCallback, useState, createContext } from "react";

import {
  isMobile,
  CAMERA_STATUSES,
  CAMERA_NOT_ALLOWED_ERROR_NAME,
  CAMERA_PERMISSION_DENIED_ERROR_MSG,
} from "./common";

export const VideoContext = createContext();

// Вставь эту реализацию вместо текущей
function isIOS() {
  return /iP(hone|od|ad)/.test(navigator.userAgent);
}

function normalizeFacingMode(facingModeInit) {
  if (isIOS()) {
    return facingModeInit; // iOS любит строку без {ideal:}
  }
  if (isMobile()) {
    return { ideal: facingModeInit }; // мобильные (Android) — с ideal
  }
  return facingModeInit;
}

const startCamera = async (params) => {
  try {
    return await navigator.mediaDevices.getUserMedia(params);
  } catch (ex) {
    console.error(`[navigator.mediaDevices] Failed to start camera ${ex}`);
    throw ex; // Эквивалентно `reject(ex)`
  }
};

const CAMERA_RESOLUTION_VARIANTS = [
  // Very high (новые смартфоны) — используем ideal, чтобы не ломать iOS сразу
  // { width: { ideal: 4096 }, height: { ideal: 2160 } }, // 4K
  { width: { ideal: 3840 } }, // 4K UHD
  { width: { ideal: 2560 } }, // QHD (2K)
  { width: { ideal: 2340 } }, // FHD+
  { width: { ideal: 2220 } },
  { width: { ideal: 2160 } },

  // Надёжные высокие (горизонтальные) — min, чтобы дать гарантию хотя бы такого
  { width: { min: 1920 } },
  { width: { min: 1600 } },
  { width: { min: 1280 } },
  { width: { min: 1024 } },
  { width: { min: 960 } },
  { width: { min: 854 } },
  { width: { min: 800 } },
  // { width: { min: 640 }, height: { min: 480 } },

  // Идеальные fallback среднего уровня
  { width: { ideal: 1280 } },
  { width: { ideal: 1024 } },
  // { width: { ideal: 640 }, height: { ideal: 480 } },

  // Минимальное рабочее портретное
  // { width: { min: 480 }, height: { min: 640 } },

  // Ультра-низкий fallback (старые устройства)
  // { width: { min: 320 }, height: { min: 240 } },
];

export const VideoProvider = ({ children }) => {
  const [video, setVideo] = useState(null);
  const [isAsking, setIsAsking] = useState(false); // Asking permisision
  const [videoLoader, setVideoLoader] = useState({ pos: 0, count: 0 });
  const [isNoVideoCamera, setIsNoVideoCamera] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(CAMERA_STATUSES.notSupport);
  const [isWeakCameraResolution, setIsWeakCameraResolution] = useState(false);

  const closeVideo = useCallback(() => {
    video?.srcObject.getTracks().forEach(function (track) {
      track.stop();
    });
    setVideo(null);
  }, [video]);

  const getCameraStatus = async () => {
    // Проверяем, поддерживается ли Permissions API
    if (!navigator?.permissions?.query) {
      console.warn("Permissions API не поддерживается в этом браузере / среде");
      return CAMERA_STATUSES.notSupport;
    }

    try {
      const result = await navigator.permissions.query({ name: "camera" });
      // result.state может быть 'granted', 'denied', 'prompt'
      console.log("GET CAMERA STATUS", result);
      return result.state;
    } catch (err) {
      console.warn("[getCameraStatus] Ошибка при запросе прав на камеру:", err);
      return "error";
    }
  };

  const checkCameraStatus = useCallback(async () => {
    // Запрашиваем состояние и обрабатываем
    const cs = await getCameraStatus();
    setCameraStatus(cs);
  }, [setCameraStatus]);

  const checkVideoInputs = useCallback(async () => {
    // Проверяем, поддерживается ли вообще mediaDevices + enumerateDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log("enumerateDevices() not supported.");
      setIsNoVideoCamera(true);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      // Проверяем, есть ли хотя бы одно устройство видеоввода
      const hasVideoInput = devices.some(
        (device) => device.kind === "videoinput"
      );

      if (!hasVideoInput) {
        console.log("No video input device found");
        setIsNoVideoCamera(true);
      } else {
        console.log("Video input device(s) found");
        setIsNoVideoCamera(false);
      }
    } catch (err) {
      console.error("ERROR [getDevices]", err);
      // Если произошла ошибка, скорее всего, не можем подтвердить наличие камеры
      setIsNoVideoCamera(true);
    }
  }, []);

  /**
   * Проверка, что реальное разрешение (через video.videoWidth/Height)
   * даёт площадь, близкую к заявленной в track.getSettings() (±10%).
   */

  function testVideoStream(stream, timeoutMillis = 1000) {
    return new Promise((resolve) => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.warn("[testVideoStream] Нет videoTrack");
        resolve(false);
        return;
      }

      const setts = videoTrack.getSettings() || {};
      const desiredW = setts.width || 640;
      const desiredH = setts.height || 480;
      const expectedArea = desiredW * desiredH;
      console.log(
        `[testVideoStream] track.getSettings() => ${desiredW}x${desiredH}, area=${expectedArea}`
      );

      const testVideo = document.createElement("video");
      testVideo.style.position = "fixed";
      testVideo.style.left = "0";
      testVideo.style.top = "0";
      testVideo.style.width = desiredW + "px";
      testVideo.style.height = desiredH + "px";
      testVideo.style.opacity = "0";
      testVideo.style.zIndex = "0";

      testVideo.playsInline = true;
      testVideo.muted = true;
      testVideo.autoplay = true;
      testVideo.srcObject = stream;

      let finished = false;

      const cleanUp = () => {
        if (testVideo.parentNode) testVideo.parentNode.removeChild(testVideo);
        testVideo.srcObject = null;
      };

      const doResolve = (val) => {
        if (finished) return;
        finished = true;
        cleanUp();
        resolve(val);
      };

      const onLoadedData = async () => {
        testVideo.removeEventListener("loadeddata", onLoadedData);
        await new Promise((r) => setTimeout(r, 100));
        const vw = testVideo.videoWidth;
        const vh = testVideo.videoHeight;
        const actualArea = vw * vh;
        console.log(
          `[testVideoStream] Реальный кадр: ${vw}x${vh}, area=${actualArea}`
        );
        const areaOk = withinTolerance(actualArea, expectedArea, 0.1);
        if (areaOk) {
          console.log("[testVideoStream] => OK, площадь совпадает (±10%)");
          doResolve(true);
        } else {
          console.warn(
            "[testVideoStream] => Площадь слишком мала или чёрный кадр"
          );
          doResolve(false);
        }
      };

      testVideo.addEventListener("loadeddata", onLoadedData);
      document.body.appendChild(testVideo);
      testVideo.play().catch((err) => {
        console.warn("testVideoStream play() error:", err);
      });

      setTimeout(() => {
        console.warn("[testVideoStream] timeout, считаем как failed");
        doResolve(false);
      }, timeoutMillis);
    });
  }

  /**
   * Сравнение «actual» и «expected» с допуском (по умолчанию ±10%).
   */
  function withinTolerance(actual, expected, tolerance = 0.1) {
    if (!expected || expected <= 0) return false;
    const diff = Math.abs(actual - expected);
    return diff / expected <= tolerance;
  }

  async function getOptimalStream(facingModeInit) {
    let cameraVariants = CAMERA_RESOLUTION_VARIANTS;
    const facingMode = normalizeFacingMode(facingModeInit);

    // Специально для iOS: не стартуем с самых больших → сначала mid-range
    if (isIOS()) {
      // пример перестановки: сначала ideal 1280x720 / 1024x768, потом остальное
      const preferred = cameraVariants.filter(
        (c) =>
          (c.width?.ideal === 1280 && c.height?.ideal === 720) ||
          (c.width?.ideal === 1024 && c.height?.ideal === 768)
      );
      const rest = cameraVariants.filter((c) => !preferred.includes(c));
      cameraVariants = [...preferred, ...rest];
    }

    // 0) Проверка поддержки
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      console.error("[getOptimalStream] getUserMedia не поддерживается");
      setIsWeakCameraResolution(true);
      return null;
    }

    const baseConstraints = {
      audio: false,
      video: { facingMode },
    };

    let stream;
    try {
      stream = await startCamera(baseConstraints);
      console.log("[getOptimalStream] Базовый стрим получен");
    } catch (err) {
      console.error("[getOptimalStream] Ошибка при базовом старте:", err);
      if (
        err.name === CAMERA_NOT_ALLOWED_ERROR_NAME ||
        err.message?.includes(CAMERA_PERMISSION_DENIED_ERROR_MSG)
      ) {
        setCameraStatus(CAMERA_STATUSES.denied);
      } else {
        setCameraStatus(CAMERA_STATUSES.notSupport);
      }
      setIsWeakCameraResolution(true);
      return null;
    }

    if (!stream) {
      console.error("[getOptimalStream] startCamera вернул null");
      setIsWeakCameraResolution(true);
      return null;
    }

    let videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.error("[getOptimalStream] Нет videoTrack");
      setIsWeakCameraResolution(true);
      return null;
    }

    const failedConstraints = new Set();

    for (let i = 0; i < cameraVariants.length; i++) {
      setVideoLoader({ pos: i + 1, count: cameraVariants.length });

      const candidateVideo = {
        ...cameraVariants[i],
        facingMode,
      };
      const key = JSON.stringify(candidateVideo);
      if (failedConstraints.has(key)) continue;

      try {
        await videoTrack.applyConstraints(candidateVideo);
        const { width, height } = videoTrack.getSettings() || {};
        console.log(`[getOptimalStream] i=${i} => ${width}x${height}`);

        if (!width || !height) {
          console.warn("[getOptimalStream] 0x0 => пропускаем");
          continue;
        }

        const isLive = await testVideoStream(stream);
        if (isLive) {
          localStorage.setItem(facingModeInit, JSON.stringify(cameraVariants[i]));
          setVideoLoader({ pos: 0, count: 0 });
          console.log(`[getOptimalStream] i=${i} => OK, return`);
          return stream;
        } else {
          console.warn(`[getOptimalStream] i=${i} => чёрный кадр, skip`);
        }
      } catch (errApply) {
        console.warn(
          `[getOptimalStream] applyConstraints error i=${i}:`,
          errApply
        );

        if (errApply.name === "OverconstrainedError") {
          failedConstraints.add(key);
          console.warn(
            "[getOptimalStream] Overconstrained => реинициализируем камеру"
          );
          videoTrack.stop();
          try {
            stream = await startCamera(baseConstraints);
            if (!stream) break;
            videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack) break;
          } catch (reinitErr) {
            console.warn(
              "[getOptimalStream] Повторный базовый стрим => ошибка:",
              reinitErr
            );
            break;
          }
        } else if (
          errApply.name === CAMERA_NOT_ALLOWED_ERROR_NAME ||
          errApply.message?.includes(CAMERA_PERMISSION_DENIED_ERROR_MSG)
        ) {
          setCameraStatus(CAMERA_STATUSES.denied);
          setVideoLoader({ pos: 0, count: 0 });
          return null;
        }
        // иначе просто пропускаем
      }
    }

    // ======= fallback: хотя бы с facingMode
    try {
      console.warn("[getOptimalStream] Пробуем fallback с только facingMode");
      const fallbackStream = await startCamera({
        audio: false,
        video: { facingMode },
      });
      if (fallbackStream) {
        const isLiveFallback = await testVideoStream(fallbackStream);
        if (isLiveFallback) {
          console.log(
            "[getOptimalStream] Fallback с facingMode OK, возвращаем"
          );
          return fallbackStream;
        } else {
          console.warn(
            "[getOptimalStream] Fallback с facingMode — чёрный кадр"
          );
          fallbackStream.getVideoTracks().forEach((t) => t.stop());
        }
      }
    } catch (fallbackErr) {
      console.warn(
        "[getOptimalStream] fallback с facingMode ошибка:",
        fallbackErr
      );
    }
    // ======= end fallback

    setVideoLoader({ pos: 0, count: 0 });
    console.warn("[getOptimalStream] Все варианты + fallback => неудача");
    setIsWeakCameraResolution(true);
    return null;
  }

  useEffect(() => {
    checkCameraStatus();
    checkVideoInputs();
  }, [checkCameraStatus, checkVideoInputs]);

  const value = {
    setVideo,
    closeVideo,
    cameraStatus,
    checkCameraStatus,
    setCameraStatus,
    isAsking,
    setIsAsking,
    getOptimalStream,
    videoLoader,
    isNoVideoCamera,
    isWeakCameraResolution,
    setIsWeakCameraResolution,
  };

  return (
    <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
  );
};

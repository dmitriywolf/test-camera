import { useEffect, useCallback, useState, createContext } from "react";

import {
  isMobile,
  CAMERA_STATUSES,
  CAMERA_NOT_ALLOWED_ERROR_NAME,
  CAMERA_PERMISSION_DENIED_ERROR_MSG,
} from "./common";

export const VideoContext = createContext();
const log = (...args) => {
  console.log(...args);
  return false;
};
const logWarn = (...args) => {
  console.warn(...args);
  return false;
};

// Вставь эту реализацию вместо текущей
function isIOS() {
  return /iP(hone|od|ad)/.test(navigator.userAgent);
}

function normalizeFacingMode(facingModeInit) {
  console.log("facingModeInit", facingModeInit);
  if (isIOS()) {
    return facingModeInit; // iOS любит строку без {ideal:}
  }
  if (isMobile()) {
    return { ideal: facingModeInit }; // мобильные (Android) — с ideal
  }
  // Десктоп
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

  // Идеальные fallback среднего уровня
  { width: { ideal: 1280 } },
  { width: { ideal: 1024 } },
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

  // обёртка, которая гарантирует остановку старого потока перед новой попыткой
  const safeStartCamera = async (constraints, attempts = 2, delayMs = 200) => {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      try {
        // небольшая задержка перед повтором (не для первой попытки)
        if (i > 0) await new Promise((r) => setTimeout(r, delayMs));

        // Запрашиваем стрим
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
      } catch (err) {
        lastErr = err;

        // Если ошибка — AbortError, то пробуем снова, но перед этим
        // даём чуть времени системе и очищаем возможные висящие треки
        if (err.name === "AbortError") {
          console.warn(
            `[safeStartCamera] AbortError, retrying (${i + 1}/${attempts})`,
            err
          );
          // Не должно быть активного stream здесь, но на всякий:
          // (если предыдущий стрим был присвоен где-то глобально, останови его)
          continue;
        }

        // Другие ошибки — не повторяем (например permission denied)
        break;
      }
    }
    throw lastErr;
  };

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
      let timeoutId;

      const cleanUp = () => {
        if (testVideo.parentNode) testVideo.parentNode.removeChild(testVideo);
        testVideo.srcObject = null;
      };

      const doResolve = (val) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
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

      timeoutId = setTimeout(() => {
        if (finished) return; // уже завершили — ничего не делаем
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
    log("GET OPTIONAL STREAM");

    let cameraVariants = CAMERA_RESOLUTION_VARIANTS;
    const facingMode = normalizeFacingMode(facingModeInit);

    log("FACING MODE", facingMode);

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

    console.log("BASE CONSTRAINTS", baseConstraints);

    let stream;
    try {
      stream = await safeStartCamera(baseConstraints);
      log("[getOptimalStream] Базовый стрим получен");
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
        const {
          width,
          height,
          facingMode: currentFacingMode,
        } = videoTrack.getSettings() || {};
        log(
          `[getOptimalStream] i=${i} => ${width}x${height} facingMode=>${currentFacingMode}`
        );

        if (!width || !height) {
          logWarn("[getOptimalStream] 0x0 => пропускаем");
          continue;
        }

        const isLive = await testVideoStream(stream);
        if (isLive) {
          localStorage.setItem(
            facingModeInit,
            JSON.stringify(cameraVariants[i])
          );
          setVideoLoader({ pos: 0, count: 0 });
          log(`[getOptimalStream] i=${i} => OK, return`);
          return stream;
        } else {
          logWarn(`[getOptimalStream] i=${i} => чёрный кадр, skip`);
        }
      } catch (errApply) {
        logWarn(`[getOptimalStream] applyConstraints error i=${i}:`, errApply);

        if (errApply.name === "OverconstrainedError") {
          failedConstraints.add(key);
          logWarn(
            "[getOptimalStream] Overconstrained => реинициализируем камеру"
          );
          videoTrack.stop();
          try {
            stream = await startCamera(baseConstraints);
            if (!stream) break;
            videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack) break;
          } catch (reinitErr) {
            logWarn(
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
      logWarn("[getOptimalStream] Пробуем fallback с только facingMode");
      const fallbackStream = await startCamera({
        audio: false,
        video: { facingMode },
      });
      if (fallbackStream) {
        const isLiveFallback = await testVideoStream(fallbackStream);
        if (isLiveFallback) {
          log("[getOptimalStream] Fallback с facingMode OK, возвращаем");
          return fallbackStream;
        } else {
          logWarn("[getOptimalStream] Fallback с facingMode — чёрный кадр");
          fallbackStream.getVideoTracks().forEach((t) => t.stop());
        }
      }
    } catch (fallbackErr) {
      logWarn("[getOptimalStream] fallback с facingMode ошибка:", fallbackErr);
    }
    // ======= end fallback

    setVideoLoader({ pos: 0, count: 0 });
    logWarn("[getOptimalStream] Все варианты + fallback => неудача");
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

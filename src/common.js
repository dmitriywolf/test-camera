export const isMobile = () => {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isAndroid || isiOS;
};

export const CAMERA_NOT_ALLOWED_ERROR_NAME = "NotAllowedError"; // error name
export const CAMERA_PERMISSION_DENIED_ERROR_MSG = "Permission denied"; //  error message

export const CAMERA_STATUSES = {
  granted: "granted",
  denied: "denied",
  prompt: "prompt",
  notSupport: "not-support", // Кастомный статус чтобы поддерживать браузеры которые не поддерживают navigator?.permissions?.query
};

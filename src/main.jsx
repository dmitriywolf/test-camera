import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { VideoProvider } from "./video.jsx";

import("eruda").then((eruda) => {
  eruda.default.init();
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <VideoProvider>
      <App />
    </VideoProvider>
  </React.StrictMode>
);

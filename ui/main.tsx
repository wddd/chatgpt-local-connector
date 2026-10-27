import "./tokens.css";
import "./brand/topology.css";
import "./brand/quota.css";
import "./brand/task-bubbles.css";
import { createRoot } from "react-dom/client";
import UiProvider from "./components/UiProvider";
import App from "./App";
createRoot(document.getElementById("app")!).render(
  <UiProvider>
    <App />
  </UiProvider>,
);

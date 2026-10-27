import "./style.css";
import { createRoot } from "react-dom/client";
import UiProvider from "./components/UiProvider";
import App from "./App";
import "./product.css";
import { scenarioName } from './scenarioMode';
const ready = import.meta.env.DEV && scenarioName ? await (await import('./scenarios')).installScenario(scenarioName) : undefined;
const RequestsFixture = import.meta.env.DEV && scenarioName?.startsWith("requests-") ? (await import("./scenarioRequests")).default : undefined;
const SrcTunnelFixture = import.meta.env.DEV && scenarioName?.startsWith('src-tunnel-') ? (await import('./scenarioSrcTunnel')).default : undefined;
const FormsFixture = import.meta.env.DEV && scenarioName?.startsWith("forms-") ? (await import("./scenarioForms")).default : undefined;
const ShellFixture = import.meta.env.DEV && scenarioName?.startsWith("shells-") ? (await import("./scenarioShells")).default : undefined;
const PagesFixture = import.meta.env.DEV && scenarioName && (await import('./scenarios')).pageFixture ? (await import('./scenarioPages')).default : undefined;
createRoot(document.getElementById("app")!).render(
  <UiProvider>
    {SrcTunnelFixture ? <SrcTunnelFixture /> : RequestsFixture ? <RequestsFixture /> : PagesFixture ? <PagesFixture /> : FormsFixture ? <FormsFixture /> : ShellFixture ? <ShellFixture /> : <App />}
  </UiProvider>,
);

if (ready) requestAnimationFrame(() => { void ready().catch(async error => { (await import("./state/scenarioReadiness")).finishScenario(String(error)); }); });

import { decorativeSvg } from "./brand-reserve/decorative";
import gooseIcon from "./brand-reserve/agents/goose/mono.svg?raw";
import codebuddyIcon from "./brand-reserve/agents/codebuddy/mono.svg?raw";
import antigravityIcon from "./brand-reserve/agents/antigravity/mono.svg?raw";
import geminiIcon from "./brand-reserve/agents/gemini/mono.svg?raw";
import codexIcon from "./agents/openai.svg?raw";
import piIcon from "./brand-reserve/agents/pi/mono.svg?raw";
import opencodeIcon from "./brand-reserve/agents/opencode/mono.svg?raw";
import claudeIcon from "./brand-reserve/agents/claude/color.svg?raw";
import cursorIcon from "./brand-reserve/agents/cursor/mono.svg?raw";
import grokIcon from "./brand-reserve/agents/grok/mono.svg?raw";
import copilotIcon from "./brand-reserve/agents/copilot/color.svg?raw";
import kimiIcon from "./brand-reserve/agents/kimi/mono.svg?raw";
import qwenIcon from "./brand-reserve/agents/qwen/color.svg?raw";
import kiroIcon from "./brand-reserve/agents/kiro/color.svg?raw";
import devinIcon from "./brand-reserve/agents/devin/color.svg?raw";
import clineIcon from "./brand-reserve/agents/cline/mono.svg?raw";
import junieIcon from "./brand-reserve/agents/junie/color.svg?raw";
import hermesIcon from "./brand-reserve/agents/hermes/mono.svg?raw";
import dshIcon from "./brand-reserve/agents/dsh/mono.svg?raw";

export const agentIcons: Record<string, string> = Object.fromEntries(
  Object.entries({
    antigravity: antigravityIcon,
    goose: gooseIcon,
    codebuddy: codebuddyIcon,
    codex: codexIcon,
    pi: piIcon,
    opencode: opencodeIcon,
    claude: claudeIcon,
    cursor: cursorIcon,
    gemini: geminiIcon,
    grok: grokIcon,
    copilot: copilotIcon,
    kimi: kimiIcon,
    qwen: qwenIcon,
    kiro: kiroIcon,
    devin: devinIcon,
    cline: clineIcon,
    junie: junieIcon,
    hermes: hermesIcon,
    dsh: dshIcon,
  }).map(([name, svg]) => [name, decorativeSvg(svg)]),
);

// ── ANSI helpers ──

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ── Format key args per tool for compact display ──

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function formatKeyArgs(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case "bash":
      return args.command ? truncate(String(args.command), 60) : "";
    case "read":
      return args.path ? truncate(String(args.path), 80) : "";
    case "write":
      return args.path ? `${truncate(String(args.path), 60)} (${String(args.content?.length ?? 0)} chars)` : "";
    case "list_skills":
      return args.category ? `category=${args.category}` : "(all)";
    case "search_skills":
      return args.query ? `"${truncate(String(args.query), 40)}"` : "";
    case "activate_skill":
      return args.name ?? "";
    case "spawn_subagent":
      return args.task ? truncate(String(args.task), 60) : "";
    case "replace_messages":
      return args.before_index != null ? `before=${args.before_index}` : "";
    case "get_context_info":
      return "";
    default: {
      // Generic: show all args compactly
      const parts = Object.entries(args)
        .map(([k, v]) => `${k}=${truncate(JSON.stringify(v), 30)}`)
        .join(" ");
      return truncate(parts, 80);
    }
  }
}

// ── Run entry (one browsable item) ──

export interface RunEntry {
  type: "turn" | "tool" | "text" | "thinking";
  compact: string;
  detail: string;
}

interface PendingTool {
  name: string;
  args: any;
  startTime: number;
}

// ── Format helpers ──

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// ── RunDisplay: compact output + interactive browse ──

export class RunDisplay {
  entries: RunEntry[] = [];
  private currentText = "";
  private isStreaming = false;
  private pendingTools = new Map<string, PendingTool>();
  private turnCount = 0;

  clear() {
    this.entries = [];
    this.currentText = "";
    this.isStreaming = false;
    this.pendingTools.clear();
    this.turnCount = 0;
  }

  // ── Turn ──

  turnStart() {
    this.turnCount++;
    this.flushText();
  }

  turnEnd(model: string, tokensIn: number, tokensOut: number, latencyMs: number, cost: number, stopReason: string) {
    this.flushText();

    const compact = dim(`#${this.turnCount}`) + `  ${fmtTokens(tokensIn)}→${fmtTokens(tokensOut)}  ${latencyMs}ms  $${cost.toFixed(4)}`;
    const detail = [
      `LLM Call #${this.turnCount}`,
      `  Model:       ${model}`,
      `  Input:       ${tokensIn.toLocaleString()} tokens`,
      `  Output:      ${tokensOut.toLocaleString()} tokens`,
      `  Total:       ${(tokensIn + tokensOut).toLocaleString()} tokens`,
      `  Latency:     ${latencyMs}ms`,
      `  Cost:        $${cost.toFixed(4)}`,
      `  Stop reason: ${stopReason}`,
    ].join("\n");

    this.entries.push({ type: "turn", compact, detail });
    console.log(compact);
  }

  // ── Thinking ──

  thinkingStart() {
    console.log(dim(`  ${magenta("◆")} thinking...`));
  }

  thinkingEnd(content: string) {
    const compact = `  ${magenta("◆")} ${dim("thinking")}`;
    const detail = `Thinking:\n${content}`;
    this.entries.push({ type: "thinking", compact, detail });
  }

  // ── Tool ──

  toolAnnounce(name: string, args: Record<string, any>) {
    if (this.isStreaming) {
      this.isStreaming = false;
      process.stdout.write("\n");
    }
    const keyArgs = formatKeyArgs(name, args);
    console.log(dim(`  ▶ ${name}`) + (keyArgs ? ` ${dim(keyArgs)}` : ""));
  }

  toolStart(toolCallId: string, name: string, args: any) {
    this.pendingTools.set(toolCallId, { name, args, startTime: Date.now() });
  }

  toolEnd(toolCallId: string, name: string, result: any, isError: boolean) {
    const pending = this.pendingTools.get(toolCallId);
    const elapsed = pending ? Date.now() - pending.startTime : 0;
    const args = pending?.args ?? {};
    this.pendingTools.delete(toolCallId);

    const resultText = result?.content
      ?.map((c: any) => c.type === "text" ? c.text : `[${c.type}]`)
      .join("") ?? "";

    const status = isError ? red("✗") : green("✓");
    const keyArgs = formatKeyArgs(name, args);
    const compact = `  ${status} ${name}` + (keyArgs ? ` ${keyArgs}` : "") + `  ${dim(`${elapsed}ms`)}`;

    const resultLines = resultText.split("\n");
    const maxResultLines = 50;
    const detail = [
      `Tool: ${name}`,
      `  Duration: ${elapsed}ms`,
      `  Status:   ${isError ? "ERROR" : "OK"}`,
      `  Args:`,
      ...JSON.stringify(args, null, 2).split("\n").map((l: string) => `    ${l}`),
      `  Result${resultLines.length > maxResultLines ? ` (${resultLines.length} lines, first ${maxResultLines})` : ""}:`,
      ...resultLines.slice(0, maxResultLines).map((l: string) => `    ${l}`),
    ].join("\n");

    this.entries.push({ type: "tool", compact, detail });
    console.log(compact);
  }

  // ── Text streaming ──

  textDelta(delta: string) {
    this.currentText += delta;
    if (!this.isStreaming) this.isStreaming = true;
    process.stdout.write(delta);
  }

  textEnd() {
    if (this.isStreaming) {
      this.isStreaming = false;
      process.stdout.write("\n");
    }
  }

  // ── Hint after run ──

  printHint() {
    if (this.entries.some(e => e.detail.length > 0)) {
      console.log(dim("  /browse to inspect details"));
    }
  }

  // ── Internal ──

  private flushText() {
    this.textEnd();
    if (this.currentText) {
      const text = this.currentText;
      this.currentText = "";
      this.entries.push({
        type: "text",
        compact: dim(`  [response: ${text.length} chars]`),
        detail: text,
      });
    }
  }

  // ── Interactive browse (alt screen buffer) ──

  hasEntries(): boolean {
    return this.entries.some(e => e.detail.length > 0);
  }

  async browse(): Promise<void> {
    const browsable = this.entries.filter(e => e.detail.length > 0);
    if (browsable.length === 0) {
      console.log(dim("(nothing to browse)"));
      return;
    }

    if (!process.stdin.isTTY) {
      console.log(dim("(browse requires a TTY)"));
      return;
    }

    return new Promise<void>((resolve) => {
      let selected = 0;
      const expanded = new Set<number>();

      // Enter alt screen, hide cursor
      process.stdout.write("\x1b[?1049h\x1b[?25l");

      const render = () => {
        const termH = process.stdout.rows || 24;
        const termW = process.stdout.columns || 80;

        // Home + clear
        process.stdout.write("\x1b[H\x1b[2J");

        // Header
        const header = " ↑↓ navigate │ Enter expand/collapse │ q quit ";
        process.stdout.write(`\x1b[7m${header.padEnd(termW)}\x1b[0m\n\n`);

        // Build renderable lines
        const lines: string[] = [];
        const entryStartLine: number[] = [];

        for (let i = 0; i < browsable.length; i++) {
          const e = browsable[i];
          const isSel = i === selected;
          const isExp = expanded.has(i);
          const marker = isSel ? cyan(" ▸ ") : "   ";

          entryStartLine.push(lines.length);
          lines.push(marker + (isSel ? bold(e.compact) : e.compact));

          if (isExp) {
            for (const dl of e.detail.split("\n")) {
              lines.push(dim("     " + dl));
            }
            lines.push(""); // spacer
          }
        }

        // Viewport scrolling
        const viewH = termH - 4;
        const selLine = entryStartLine[selected] ?? 0;
        let scrollTop = Math.max(0, selLine - Math.floor(viewH / 2));
        scrollTop = Math.min(scrollTop, Math.max(0, lines.length - viewH));

        const visible = lines.slice(scrollTop, scrollTop + viewH);
        for (const line of visible) {
          process.stdout.write(line + "\n");
        }

        // Footer
        const footer = ` ${selected + 1}/${browsable.length} entries `;
        process.stdout.write(`\x1b[${termH};1H\x1b[7m${footer.padEnd(termW)}\x1b[0m`);
      };

      render();

      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (data: Buffer) => {
        const key = data.toString();

        if (key === "q" || key === "\x1b") {
          cleanup();
        } else if (key === "\x1b[A") {
          selected = Math.max(0, selected - 1);
          render();
        } else if (key === "\x1b[B") {
          selected = Math.min(browsable.length - 1, selected + 1);
          render();
        } else if (key === "\r" || key === " ") {
          if (expanded.has(selected)) expanded.delete(selected);
          else expanded.add(selected);
          render();
        } else if (key === "\x03") {
          cleanup();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(wasRaw ?? false);
        // Leave alt screen, show cursor
        process.stdout.write("\x1b[?1049l\x1b[?25h");
        resolve();
      };

      process.stdin.on("data", onData);
    });
  }

  // ── Pager: scrollable view for long text ──

  async pager(text: string): Promise<void> {
    if (!process.stdin.isTTY) {
      console.log(text);
      return;
    }

    const allLines = text.split("\n");

    return new Promise<void>((resolve) => {
      let scrollTop = 0;

      const termH = () => process.stdout.rows || 24;
      const termW = () => process.stdout.columns || 80;

      let searchTerm = "";
      let searchMode = false;
      let searchInput = "";

      const render = () => {
        const h = termH();
        const w = termW();
        const viewH = h - 2; // header + footer

        process.stdout.write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor
        process.stdout.write("\x1b[H\x1b[2J"); // home + clear

        // Header
        const header = " j/k ↑↓  Ctrl-F/B page  Ctrl-D/U half  gg/G top/end  /search  n/N next/prev  q quit ";
        process.stdout.write(`\x1b[7m${header.slice(0, w).padEnd(w)}\x1b[0m\n`);

        // Content
        const visible = allLines.slice(scrollTop, scrollTop + viewH);
        for (const line of visible) {
          // Highlight search matches
          if (searchTerm) {
            const lower = line.toLowerCase();
            const term = searchTerm.toLowerCase();
            const idx = lower.indexOf(term);
            if (idx !== -1) {
              const before = line.slice(0, idx);
              const match = line.slice(idx, idx + searchTerm.length);
              const after = line.slice(idx + searchTerm.length);
              process.stdout.write((before + `\x1b[30;43m${match}\x1b[0m` + after).slice(0, w + 20) + "\n");
              continue;
            }
          }
          process.stdout.write(line.slice(0, w) + "\n");
        }

        // Fill remaining lines
        const remaining = viewH - visible.length;
        for (let i = 0; i < remaining; i++) {
          process.stdout.write(dim("~") + "\n");
        }

        // Footer
        const pct = allLines.length <= viewH ? "All" : `${Math.round((scrollTop / Math.max(1, allLines.length - viewH)) * 100)}%`;
        let footer: string;
        if (searchMode) {
          footer = ` /${searchInput}█ `;
        } else {
          const searchInfo = searchTerm ? `  [/${searchTerm}]` : "";
          footer = ` line ${scrollTop + 1}-${Math.min(scrollTop + viewH, allLines.length)} / ${allLines.length}  ${pct}${searchInfo} `;
        }
        process.stdout.write(`\x1b[${h};1H\x1b[7m${footer.slice(0, w).padEnd(w)}\x1b[0m`);
      };

      render();

      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const maxScroll = () => Math.max(0, allLines.length - (termH() - 2));
      const pageSize = () => termH() - 4;
      const halfPage = () => Math.max(1, Math.floor((termH() - 2) / 2));

      // Search: find next/prev line matching searchTerm
      const searchNext = (from: number) => {
        if (!searchTerm) return;
        const term = searchTerm.toLowerCase();
        for (let i = from + 1; i < allLines.length; i++) {
          if (allLines[i].toLowerCase().includes(term)) {
            scrollTop = Math.min(i, maxScroll());
            render();
            return;
          }
        }
        // Wrap around
        for (let i = 0; i <= from; i++) {
          if (allLines[i].toLowerCase().includes(term)) {
            scrollTop = Math.min(i, maxScroll());
            render();
            return;
          }
        }
      };

      const searchPrev = (from: number) => {
        if (!searchTerm) return;
        const term = searchTerm.toLowerCase();
        for (let i = from - 1; i >= 0; i--) {
          if (allLines[i].toLowerCase().includes(term)) {
            scrollTop = Math.min(i, maxScroll());
            render();
            return;
          }
        }
        // Wrap around
        for (let i = allLines.length - 1; i >= from; i--) {
          if (allLines[i].toLowerCase().includes(term)) {
            scrollTop = Math.min(i, maxScroll());
            render();
            return;
          }
        }
      };

      let prevKey = "";

      const onData = (data: Buffer) => {
        const key = data.toString();

        // Search input mode
        if (searchMode) {
          if (key === "\r") { // Enter — confirm search
            searchMode = false;
            searchTerm = searchInput;
            searchInput = "";
            searchNext(scrollTop - 1); // find from current position
          } else if (key === "\x1b" || key === "\x03") { // Esc/Ctrl-C — cancel
            searchMode = false;
            searchInput = "";
            render();
          } else if (key === "\x7f" || key === "\b") { // Backspace
            searchInput = searchInput.slice(0, -1);
            render();
          } else if (key.length === 1 && key >= " ") { // Printable char
            searchInput += key;
            render();
          }
          return;
        }

        // Normal mode
        if (key === "q" || key === "\x03") {
          cleanup();
        } else if (key === "\x1b[A" || key === "k") { // up
          scrollTop = Math.max(0, scrollTop - 1);
          render();
        } else if (key === "\x1b[B" || key === "j") { // down
          scrollTop = Math.min(maxScroll(), scrollTop + 1);
          render();
        } else if (key === "\x06" || key === "\x1b[6~") { // Ctrl-F / PgDn
          scrollTop = Math.min(maxScroll(), scrollTop + pageSize());
          render();
        } else if (key === "\x02" || key === "\x1b[5~") { // Ctrl-B / PgUp
          scrollTop = Math.max(0, scrollTop - pageSize());
          render();
        } else if (key === "\x04") { // Ctrl-D — half page down
          scrollTop = Math.min(maxScroll(), scrollTop + halfPage());
          render();
        } else if (key === "\x15") { // Ctrl-U — half page up
          scrollTop = Math.max(0, scrollTop - halfPage());
          render();
        } else if (key === " ") { // Space — page down
          scrollTop = Math.min(maxScroll(), scrollTop + pageSize());
          render();
        } else if (key === "g") {
          if (prevKey === "g") { // gg — top
            scrollTop = 0;
            render();
            prevKey = "";
            return;
          }
          prevKey = "g";
          return;
        } else if (key === "G") { // G — bottom
          scrollTop = maxScroll();
          render();
        } else if (key === "/") { // start search
          searchMode = true;
          searchInput = "";
          render();
        } else if (key === "n") { // next match
          searchNext(scrollTop);
        } else if (key === "N") { // prev match
          searchPrev(scrollTop);
        }
        prevKey = key === "g" ? prevKey : "";
      };

      const cleanup = () => {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdout.write("\x1b[?1049l\x1b[?25h");
        resolve();
      };

      process.stdin.on("data", onData);
    });
  }
}

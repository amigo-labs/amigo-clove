import type {
  AudioHost,
  ControlsSheet,
  GameUi,
  UiBlock,
  UiConfirm,
  UiField,
  UiForm,
  UiImage,
  UiInput,
  UiItem,
  UiMenu,
  UiNotice,
  UiReply,
  UiScreen,
  UiText,
  UiValues,
  UiVideo,
} from "@clove/core";
import { h } from "../dom";
import type { Stage } from "../overlay";
import {
  NAV_CODES,
  NavEdges,
  SecretMatcher,
  moveIndex,
  type NavAction,
  type UiGateState,
} from "./model";

export interface UiHostOptions {
  readonly stage: Stage;
  /** Audio der Shell; Videos laufen über den Effekt-Kanal. */
  readonly audio?: AudioHost | undefined;
  /** Gehaltene Navigationscodes von Pad und Touch-Tasten (Pfeile, Enter, Escape). */
  readonly polled: () => ReadonlySet<string>;
  /** Tastenübersicht als HTML (Pause). */
  readonly controls: (sheet: ControlsSheet) => HTMLElement;
}

/** Ein gezeichneter Bildschirm: Bedienelemente und eigene Reaktionen auf Aktionen. */
interface View {
  readonly el: HTMLElement;
  /** Fokussierbare Elemente in Navigationsreihenfolge. */
  focusables(): HTMLElement[];
  readonly columns?: number;
  /** Eigene Behandlung einer Aktion (Wert ändern, blättern); `true` = erledigt. */
  handle?(action: NavAction, focused: HTMLElement | undefined): boolean;
  /** Tastendruck vor der Navigation (Tastenaufnahme); `true` = verbraucht. */
  key?(e: KeyboardEvent): boolean;
  readonly initial?: HTMLElement | undefined;
  stop?(): void;
}

type Resolve = (reply: UiReply) => void;

const FIRST_FOCUS = "button:not([disabled]), input, [tabindex='0']";

/** Hintergrund-Position in Prozent: bleibt beim Skalieren des Elements richtig. */
function bgPos(off: number, size: number, sheet: number): string {
  return sheet === size ? "0%" : `${((off / (sheet - size)) * 100).toFixed(4)}%`;
}

/** CSS für einen Ausschnitt eines Bildes, skalierbar über die Breite des Elements. */
function imageNode(img: UiImage, cls = "ui-image"): HTMLElement {
  if ("url" in img) {
    return h("img", {
      class: cls,
      src: img.url,
      width: String(img.w),
      height: String(img.h),
      alt: img.alt ?? "",
      draggable: "false",
    });
  }
  const s = img.sprite;
  const el = h("span", { class: `${cls} ui-sprite`, role: "img", "aria-label": img.alt ?? "" });
  el.style.cssText = [
    `width:${s.w}px`,
    `aspect-ratio:${s.w} / ${s.h}`,
    `background-image:url("${encodeURI(s.url)}")`,
    `background-size:${((s.sheetW / s.w) * 100).toFixed(4)}% ${((s.sheetH / s.h) * 100).toFixed(4)}%`,
    `background-position:${bgPos(s.x, s.w, s.sheetW)} ${bgPos(s.y, s.h, s.sheetH)}`,
  ].join(";");
  return el;
}

/**
 * HTML-Bildschirme der Spiele (`GameHost.ui`): zeichnet sie über bzw. statt des
 * Canvas in die Overlay-Schicht der Bühne und bedient sie mit Tastatur, Maus, Touch
 * und Gamepad. Solange einer offen ist, sperrt `state()` die Spieltasten.
 */
export class UiHost implements GameUi {
  private readonly root = h("div", { class: "ui-root" });
  private generation = 0;
  private open: { view: View; screen: UiScreen; resolve: Resolve } | undefined;
  private readonly edges = new NavEdges();
  private raf = 0;
  private disposed = false;
  private secret: SecretMatcher | undefined;

  constructor(private readonly o: UiHostOptions) {
    o.stage.layer.append(this.root);
    window.addEventListener("keydown", this.onKey, true);
    const poll = () => {
      if (this.open) for (const a of this.edges.next(o.polled())) this.act(a);
      else this.edges.next(new Set());
      this.raf = requestAnimationFrame(poll);
    };
    this.raf = requestAnimationFrame(poll);
  }

  state(): UiGateState {
    return { open: this.open !== undefined, generation: this.generation };
  }

  show(screen: UiScreen, signal?: AbortSignal): Promise<UiReply> {
    if (this.disposed) return new Promise(() => undefined);
    this.close({ id: "aborted" });
    this.generation++;
    return new Promise<UiReply>((resolve) => {
      const view = this.render(screen);
      this.open = { view, screen, resolve };
      this.secret =
        screen.kind === "menu" && screen.secret ? new SecretMatcher(screen.secret) : undefined;
      const frame = h(
        "section",
        {
          class: "ui-screen",
          role: "dialog",
          "aria-modal": "true",
          "data-kind": screen.kind,
          ...(screen.title ? { "aria-label": screen.title } : {}),
        },
        view.el,
      );
      this.root.replaceChildren(frame);
      this.o.stage.root.dataset["ui"] = screen.over === "level" ? "over" : "page";
      const first = view.initial ?? view.el.querySelector<HTMLElement>(FIRST_FOCUS) ?? undefined;
      first?.focus({ preventScroll: true });
      signal?.addEventListener("abort", () => {
        if (this.open?.view === view) this.close({ id: "aborted" });
      });
    });
  }

  /** Beantwortet den offenen Bildschirm. */
  private close(reply: UiReply): void {
    const cur = this.open;
    if (!cur) return;
    this.open = undefined;
    this.secret = undefined;
    cur.view.stop?.();
    this.root.replaceChildren();
    // folgt sofort der nächste Bildschirm (Untermenü), blitzt der Canvas nicht auf
    requestAnimationFrame(() => {
      if (!this.open) delete this.o.stage.root.dataset["ui"];
    });
    cur.resolve(reply);
  }

  private reply(id: string, values?: UiValues): void {
    this.close(values ? { id, values } : { id });
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const cur = this.open;
    if (!cur || e.altKey || e.ctrlKey || e.metaKey) return;
    if (cur.view.key?.(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement && target.type === "text";
    const action = NAV_CODES[e.code];
    if (typing && (action === "left" || action === "right" || e.code === "Space")) return;
    if (action) {
      e.preventDefault();
      // gehaltene Enter/Esc (die die Pause öffnete) wiederholen nicht
      if (!e.repeat || (action !== "ok" && action !== "back")) this.act(action);
      return;
    }
    if (this.secret && e.key.length === 1) {
      const id = this.secret.feed(e.key);
      if (id) this.reply(id);
    }
  };

  private act(action: NavAction): void {
    const cur = this.open;
    if (!cur) return;
    const items = cur.view.focusables();
    const active = document.activeElement as HTMLElement | null;
    const focused = active && items.includes(active) ? active : undefined;
    if (cur.view.handle?.(action, focused)) return;
    if (action === "back") {
      if (cur.screen.back) this.reply(cur.screen.back);
      return;
    }
    if (action === "ok") {
      (focused ?? items[0])?.click();
      return;
    }
    const next = moveIndex(
      focused ? items.indexOf(focused) : -1,
      items.length,
      action,
      cur.view.columns,
    );
    const el = items[next];
    if (el && el !== focused) {
      el.focus();
      el.scrollIntoView?.({ block: "nearest" });
      cur.screen.sounds?.move?.();
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey, true);
    const cur = this.open;
    this.open = undefined;
    cur?.view.stop?.();
    this.root.remove();
    delete this.o.stage.root.dataset["ui"];
  }

  // ---- Zeichnen -----------------------------------------------------------

  private render(s: UiScreen): View {
    switch (s.kind) {
      case "menu":
        return this.menu(s);
      case "form":
        return this.form(s);
      case "text":
        return this.text(s);
      case "input":
        return this.input(s);
      case "confirm":
        return this.confirm(s);
      case "notice":
        return this.notice(s);
      case "video":
        return this.video(s);
    }
  }

  private panel(s: UiScreen, ...children: (Node | false | undefined)[]): HTMLElement {
    return h(
      "div",
      { class: "ui-panel" },
      s.title ? h("h1", { class: "ui-title" }, s.title) : false,
      ...children,
    );
  }

  private block(b: UiBlock): HTMLElement {
    switch (b.kind) {
      case "lines":
        return h(
          "div",
          {
            class: `ui-lines${b.mono ? " mono" : ""}`,
            "data-tone": b.tone ?? "normal",
            "data-align": b.align ?? "left",
          },
          b.heading ? h("h2", {}, b.heading) : false,
          ...b.lines.map((l) => h("p", {}, l === "" ? " " : l)),
        );
      case "table":
        return h(
          "table",
          { class: "ui-table" },
          b.caption ? h("caption", {}, b.caption) : false,
          b.head
            ? h("thead", {}, h("tr", {}, ...b.head.map((c) => h("th", { scope: "col" }, c))))
            : false,
          h(
            "tbody",
            {},
            ...b.rows.map((r, i) =>
              h(
                "tr",
                i === b.highlight ? { "data-highlight": true } : {},
                ...r.map((c) => h("td", {}, c)),
              ),
            ),
          ),
        );
      case "controls":
        return h("div", { class: "ui-controls" }, this.o.controls(b.sheet));
      case "image":
        return h("div", { class: "ui-figure" }, imageNode(b.image));
    }
  }

  private blocks(list: readonly UiBlock[] | undefined): HTMLElement | false {
    return list && list.length > 0
      ? h("div", { class: "ui-blocks" }, ...list.map((b) => this.block(b)))
      : false;
  }

  private itemButton(item: UiItem, onPick: () => void): HTMLButtonElement {
    return h(
      "button",
      {
        type: "button",
        class: "ui-item",
        "data-id": item.id,
        disabled: item.disabled === true,
        onclick: onPick,
      },
      h("span", { class: "ui-label" }, item.label),
      item.hint ? h("span", { class: "ui-hint" }, item.hint) : false,
    );
  }

  private menu(s: UiMenu): View {
    const preview = h("div", { class: "ui-preview", hidden: true });
    const showPreview = (item: UiItem) => {
      preview.hidden = !item.image;
      preview.replaceChildren(...(item.image ? [imageNode(item.image)] : []));
    };
    const buttons = s.items.map((item) => {
      const b = this.itemButton(item, () => {
        s.sounds?.select?.();
        this.reply(item.id);
      });
      b.addEventListener("focus", () => showPreview(item));
      return b;
    });
    const list = h("div", { class: "ui-items" }, ...buttons);
    if (s.columns && s.columns > 1) {
      list.dataset["grid"] = "";
      list.style.setProperty("--cols", String(s.columns));
    }
    const main = h(
      "div",
      { class: "ui-main" },
      s.logo ? h("div", { class: "ui-logo" }, imageNode(s.logo)) : false,
      this.blocks(s.blocks),
      list,
      preview,
    );
    const aside =
      s.aside && s.aside.length > 0
        ? h("aside", { class: "ui-aside" }, ...s.aside.map((b) => this.block(b)))
        : false;
    const el = this.panel(s, h("div", { class: aside ? "ui-body split" : "ui-body" }, main, aside));
    const selected = buttons.find((b) => b.dataset["id"] === s.selected && !b.disabled);
    return {
      el,
      focusables: () => buttons.filter((b) => !b.disabled),
      ...(s.columns ? { columns: s.columns } : {}),
      initial: selected ?? buttons.find((b) => !b.disabled),
    };
  }

  private form(s: UiForm): View {
    let fields = s.fields;
    const values: Record<string, string | number> = {};
    const box = h("div", { class: "ui-fields" });
    let capture:
      | { field: Extract<UiField, { kind: "key" }>; button: HTMLButtonElement }
      | undefined;

    const changed = (id: string) => {
      const next = s.onChange?.({ ...values }, id);
      if (next) {
        const focusedId = (document.activeElement as HTMLElement | null)?.dataset["field"];
        fields = next;
        sync();
        draw();
        box
          .querySelector<HTMLElement>(`[data-field="${focusedId}"]`)
          ?.focus({ preventScroll: true });
      }
    };
    const cycle = (f: Extract<UiField, { kind: "choice" }>, d: number) => {
      const i = f.options.findIndex((o) => o.value === values[f.id]);
      const n = f.options.length;
      values[f.id] = f.options[(((i + d) % n) + n) % n]!.value;
      s.sounds?.move?.();
      changed(f.id);
    };
    const step = (f: Extract<UiField, { kind: "range" }>, d: number) => {
      const v = Math.min(f.max, Math.max(f.min, Number(values[f.id]) + d * f.step));
      if (v === values[f.id]) return;
      values[f.id] = v;
      s.sounds?.move?.();
      changed(f.id);
    };

    const row = (f: UiField): Node => {
      if (f.kind === "info") return h("p", { class: "ui-info", "data-info": f.id }, f.text);
      values[f.id] ??= f.value;
      const label = h("span", { class: "ui-label" }, f.label);
      if (f.kind === "choice") {
        const current = f.options.find((o) => o.value === values[f.id]) ?? f.options[0];
        const b = h(
          "button",
          {
            type: "button",
            class: "ui-field ui-choice",
            "data-field": f.id,
            onclick: () => cycle(f, 1),
          },
          label,
          h("span", { class: "ui-value" }, `◀ ${current?.label ?? ""} ▶`),
        );
        return f.hint ? h("div", {}, b, h("p", { class: "ui-hint" }, f.hint)) : b;
      }
      if (f.kind === "range") {
        const b = h(
          "button",
          {
            type: "button",
            class: "ui-field ui-range",
            "data-field": f.id,
            onclick: () => step(f, 1),
          },
          label,
          h(
            "span",
            { class: "ui-value" },
            h("meter", { min: String(f.min), max: String(f.max), value: String(values[f.id]) }),
            f.text ?? String(values[f.id]),
          ),
        );
        return b;
      }
      const b = h(
        "button",
        {
          type: "button",
          class: "ui-field ui-key",
          "data-field": f.id,
          onclick: () => {
            capture = { field: f, button: b };
            b.dataset["capture"] = "";
            b.querySelector(".ui-value")!.textContent = "…";
          },
        },
        label,
        h("span", { class: "ui-value" }, h("kbd", {}, f.text || "—")),
      );
      return b;
    };
    const draw = () => {
      const out: Node[] = [];
      let group: string | undefined;
      for (const f of fields) {
        if (f.group && f.group !== group) {
          group = f.group;
          out.push(h("h2", { class: "ui-group" }, group));
        }
        out.push(row(f));
      }
      box.replaceChildren(...out);
    };
    // Werte der Felder übernehmen; abgeleitete Felder (`onChange`) setzen sie neu
    const sync = () => {
      for (const f of fields) if (f.kind !== "info") values[f.id] = f.value;
    };
    sync();
    draw();
    const actions = s.actions.map((a) =>
      this.itemButton(a, () => {
        s.sounds?.select?.();
        this.reply(a.id, { ...values });
      }),
    );
    const el = this.panel(
      s,
      this.blocks(s.blocks),
      box,
      h("div", { class: "ui-actions" }, ...actions),
    );
    const fieldOf = (el2: HTMLElement | undefined) =>
      fields.find((f) => f.id === el2?.dataset["field"]);
    return {
      el,
      focusables: () => [
        ...box.querySelectorAll<HTMLElement>("[data-field]"),
        ...actions.filter((a) => !a.disabled),
      ],
      handle: (action, focused) => {
        const f = fieldOf(focused);
        if (!f || (action !== "left" && action !== "right")) return false;
        const d = action === "left" ? -1 : 1;
        if (f.kind === "choice") cycle(f, d);
        else if (f.kind === "range") step(f, d);
        return true;
      },
      key: (e) => {
        if (!capture) return false;
        const { field, button } = capture;
        capture = undefined;
        delete button.dataset["capture"];
        let code = values[field.id] as string;
        if (e.code === "Backspace" || e.code === "Delete") code = "";
        else if (e.code !== "Escape" && (s.acceptKey?.(e.code) ?? true)) code = e.code;
        values[field.id] = code;
        button
          .querySelector(".ui-value")!
          .replaceChildren(h("kbd", {}, (code && s.keyText?.(code)) || code || "—"));
        s.sounds?.select?.();
        changed(field.id);
        return true;
      },
    };
  }

  private text(s: UiText): View {
    const scroller = h(
      "div",
      { class: "ui-scroll", tabindex: "0" },
      this.blocks(s.blocks),
      s.image ? h("div", { class: "ui-figure" }, imageNode(s.image)) : false,
    );
    const done = this.itemButton({ id: "done", label: s.done }, () => this.reply("done"));
    const el = this.panel(s, scroller, h("div", { class: "ui-actions" }, done));
    let raf = 0;
    let end: ReturnType<typeof setTimeout> | undefined;
    if (s.scroll !== "manual") {
      const speed = s.scroll.pxPerSecond;
      el.dataset["auto"] = "";
      let last = performance.now();
      let pos = 0;
      const tick = (now: number) => {
        pos += (speed * (now - last)) / 1000;
        last = now;
        scroller.scrollTop = pos;
        if (pos >= scroller.scrollHeight - scroller.clientHeight && end === undefined)
          end = setTimeout(() => this.reply("done"), 2500);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return {
      el,
      focusables: () => [done],
      initial: done,
      handle: (action) => {
        if (action !== "up" && action !== "down") return false;
        scroller.scrollBy({ top: action === "up" ? -48 : 48 });
        return true;
      },
      stop: () => {
        cancelAnimationFrame(raf);
        clearTimeout(end);
      },
    };
  }

  private input(s: UiInput): View {
    const inputs = s.fields.map((f) =>
      h("input", {
        type: "text",
        class: "ui-text",
        "data-field": f.id,
        maxlength: String(f.max),
        value: f.value ?? "",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": f.label,
      }),
    );
    const submit = () => {
      const values: Record<string, string> = {};
      s.fields.forEach((f, i) => (values[f.id] = inputs[i]!.value));
      s.sounds?.select?.();
      this.reply("ok", values);
    };
    const ok = this.itemButton({ id: "ok", label: s.ok }, submit);
    const el = this.panel(
      s,
      s.lines ? this.block({ kind: "lines", lines: s.lines }) : false,
      h(
        "div",
        { class: "ui-fields" },
        ...s.fields.map((f, i) =>
          h(
            "label",
            { class: "ui-field ui-input" },
            h("span", { class: "ui-label" }, f.label),
            inputs[i]!,
          ),
        ),
      ),
      h("div", { class: "ui-actions" }, ok),
    );
    return {
      el,
      focusables: () => [...inputs, ok],
      initial: inputs[0],
      handle: (action, focused) => {
        if (action !== "ok" || !(focused instanceof HTMLInputElement)) return false;
        const i = inputs.indexOf(focused);
        if (i >= 0 && i < inputs.length - 1) inputs[i + 1]!.focus();
        else submit();
        return true;
      },
    };
  }

  private confirm(s: UiConfirm): View {
    const buttons = s.items.map((item) =>
      this.itemButton(item, () => {
        s.sounds?.select?.();
        this.reply(item.id);
      }),
    );
    const count = h("div", { class: "ui-countdown", "aria-live": "polite" });
    let timer: ReturnType<typeof setInterval> | undefined;
    const countdown = s.countdown;
    let n = countdown?.from ?? 0;
    const run = (ms: number) => {
      clearInterval(timer);
      timer = setInterval(() => {
        n--;
        count.textContent = String(Math.max(0, n));
        if (n < 0) this.reply("timeout");
      }, ms);
    };
    if (countdown) {
      count.textContent = String(n);
      run(countdown.ms);
    }
    const el = this.panel(
      s,
      s.image ? h("div", { class: "ui-figure" }, imageNode(s.image)) : false,
      s.lines ? this.block({ kind: "lines", lines: s.lines, align: "center" }) : false,
      s.countdown ? count : false,
      h("div", { class: "ui-items", "data-row": "" }, ...buttons),
    );
    return {
      el,
      focusables: () => buttons.filter((b) => !b.disabled),
      columns: buttons.length,
      initial: buttons.find((b) => b.dataset["id"] === s.selected) ?? buttons[0],
      handle: (action) => {
        if (action !== "back" || !countdown?.faster) return false;
        run(countdown.ms / countdown.faster);
        return true;
      },
      stop: () => clearInterval(timer),
    };
  }

  private notice(s: UiNotice): View {
    const bar = s.progress ? h("progress", { class: "ui-progress", max: "1", value: "0" }) : false;
    const prompt = s.prompt ? h("p", { class: "ui-prompt", hidden: true }, s.prompt) : false;
    const el = this.panel(
      s,
      s.image ? h("div", { class: "ui-figure" }, imageNode(s.image)) : false,
      s.lines ? this.block({ kind: "lines", lines: s.lines, align: "center" }) : false,
      this.blocks(s.blocks),
      bar,
      prompt,
    );
    el.tabIndex = 0;
    const ready = () => !s.progress || s.progress() >= 1;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (bar && s.progress) bar.value = Math.min(1, s.progress());
      if (ready()) {
        if (prompt) prompt.hidden = false;
        if (s.until === "progress") {
          this.reply("ok");
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    if (typeof s.until === "object") timer = setTimeout(() => this.reply("timeout"), s.until.ms);
    el.addEventListener("click", () => {
      if (s.until !== "progress" && ready()) this.reply("ok");
    });
    return {
      el,
      focusables: () => [],
      initial: el,
      key: (e) => {
        if (s.until !== "any" || e.repeat) return false;
        if (ready()) this.reply("ok");
        return true;
      },
      handle: (action) => {
        if (s.until === "progress") return true;
        if (action === "back" && s.back) return false;
        if ((action === "ok" || action === "back") && ready()) this.reply("ok");
        return true;
      },
      stop: () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      },
    };
  }

  private video(s: UiVideo): View {
    const video = h("video", { class: "ui-video", playsinline: true, preload: "auto" });
    video.crossOrigin = "anonymous";
    const loading = h("p", { class: "ui-video-loading" }, s.loading ?? "");
    const el = h("div", { class: "ui-video-box" }, video, loading);
    el.tabIndex = 0;
    const audio = this.o.audio;
    let source: MediaElementAudioSourceNode | undefined;
    if (audio) {
      try {
        source = audio.context.createMediaElementSource(video);
        source.connect(audio.sfx);
      } catch {
        // ohne Weiterleitung spielt das Element den Ton selbst
      }
    }
    const done = () => this.reply("done");
    video.addEventListener("playing", () => (loading.hidden = true));
    video.addEventListener("ended", done);
    video.addEventListener("error", done);
    video.src = s.url;
    video.play().catch(() => {
      // Autoplay ohne Geste: stumm weiter, statt zu hängen
      video.muted = true;
      video.play().catch(done);
    });
    el.addEventListener("click", done);
    return {
      el,
      focusables: () => [],
      initial: el,
      handle: (action) => {
        if (action === "ok" || action === "back") done();
        return true;
      },
      stop: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        source?.disconnect();
      },
    };
  }
}

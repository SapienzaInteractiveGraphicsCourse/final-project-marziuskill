//DEPENDENCIES
import { StartMode } from "./StartScreen.js";
import { buildGameRulesMarkup } from "./GameRules.js";

//PAUSE MENU
export class PauseMenu {
    constructor({ mode = StartMode.VS_BOT, canPause = () => true, onPauseChange = null, onRestart = null, onMainMenu = null, audioManager = null } = {}) {
        this.mode = mode;
        this.canPause = canPause;
        this.onPauseChange = onPauseChange;
        this.onRestart = onRestart;
        this.onMainMenu = onMainMenu;
        this.audioManager = audioManager;
        this.isOpen = false;
        this.view = "menu";
        this.selectedIndex = 0;
        this.previousFocus = null;
        this.root = document.createElement("div");
        this.root.id = "pause-menu";
        this.root.hidden = true;
        this.root.setAttribute("role", "dialog");
        this.root.setAttribute("aria-modal", "true");
        this.root.setAttribute("aria-labelledby", "pause-menu-title");
        const restartLabel = mode === StartMode.SOLO ? "RESTART RUN" : "REMATCH";
        const modeLabel = mode === StartMode.SOLO ? "SOLO RUNOUT" : "VS KILL";
        this.root.innerHTML = `
            <div class="pause-vignette" aria-hidden="true"></div>
            <main class="pause-card">
                <section class="pause-view pause-view-menu">
                    <div class="pause-kicker">${modeLabel}</div>
                    <h2 id="pause-menu-title">PAUSED</h2>
                    <div class="pause-menu-list" role="menu">
                        <button class="pause-menu-button" type="button" role="menuitem" data-action="resume">
                            <span class="pause-menu-title">RESUME</span>
                            <span class="pause-menu-description">Return to the table.</span>
                        </button>
                        <button class="pause-menu-button" type="button" role="menuitem" data-action="rules">
                            <span class="pause-menu-title">RULES</span>
                            <span class="pause-menu-description">Review the rules of the current game.</span>
                        </button>
                        <button class="pause-menu-button" type="button" role="menuitem" data-action="restart">
                            <span class="pause-menu-title">${restartLabel}</span>
                            <span class="pause-menu-description">Start the current game again from the break.</span>
                        </button>
                        <button class="pause-menu-button" type="button" role="menuitem" data-action="main-menu">
                            <span class="pause-menu-title">MAIN MENU</span>
                            <span class="pause-menu-description">Leave the current game.</span>
                        </button>
                    </div>
                    <div class="pause-menu-hint">W / S or arrows to choose · Enter to confirm · Esc to resume</div>
                </section>

                <section class="pause-view pause-view-rules" hidden>
                    <div class="pause-kicker">${modeLabel}</div>
                    <h2>RULES</h2>
                    ${buildGameRulesMarkup({ mode })}
                    <button class="pause-rules-back" type="button" data-rules-back>BACK</button>
                    <div class="pause-menu-hint">Scroll / arrows to read · Enter or Esc to go back</div>
                </section>
            </main>
        `;
        document.body.appendChild(this.root);
        this.menuView = this.root.querySelector(".pause-view-menu");
        this.rulesView = this.root.querySelector(".pause-view-rules");
        this.rulesScroller = this.root.querySelector(".pause-view-rules .game-rules");
        this.rulesBack = this.root.querySelector("[data-rules-back]");
        this.buttons = [
            ...this.root.querySelectorAll(".pause-menu-button")
        ];
        this._onKeyDown = this.#onKeyDown.bind(this);
        window.addEventListener("keydown", this._onKeyDown, true);
        this.buttonHandlers = this.buttons.map((button, index) => {
            const onPointerEnter = () => this.#setSelected(index);
            const onFocus = () => this.#setSelected(index);
            const onClick = () => this.#activate(button.dataset.action);
            button.addEventListener("pointerenter", onPointerEnter);
            button.addEventListener("focus", onFocus);
            button.addEventListener("click", onClick);
            return {
                button,
                onPointerEnter,
                onFocus,
                onClick
            };
        });
        this._onRulesBack = () => {
            this.audioManager?.playUiBack?.();
            this.#showMenu({ focus: true });
        };
        this.rulesBack?.addEventListener("click", this._onRulesBack);
    }
    open() {
        if (this.isOpen || !this.canPause?.()) {
            return false;
        }
        this.isOpen = true;
        this.previousFocus = document.activeElement;
        this.selectedIndex = 0;
        this.#showMenu({ focus: false });
        this.onPauseChange?.(true);
        this.root.hidden = false;
        this.root.classList.remove("is-closing");
        requestAnimationFrame(() => {
            if (!this.isOpen) {
                return;
            }
            this.root.classList.add("is-open");
            this.#setSelected(0, {
                focus: true,
                silent: true
            });
        });
        return true;
    }
    close({ restoreFocus = true } = {}) {
        if (!this.isOpen) {
            return false;
        }
        this.isOpen = false;
        this.root.classList.remove("is-open");
        this.root.classList.add("is-closing");
        for (const button of this.buttons) {
            button.classList.remove("is-selected");
            button.removeAttribute("aria-current");
        }
        window.setTimeout(() => {
            if (this.isOpen) {
                return;
            }
            this.root.hidden = true;
            this.root.classList.remove("is-closing");
            this.#showMenu({ focus: false });
            this.onPauseChange?.(false);
            if (restoreFocus && this.previousFocus && document.contains(this.previousFocus) && typeof this.previousFocus.focus === "function") {
                this.previousFocus.focus({ preventScroll: true });
            }
            this.previousFocus = null;
        }, 120);
        return true;
    }
    toggle() {
        if (this.isOpen) {
            return this.close();
        }
        return this.open();
    }
    #showRules() {
        this.view = "rules";
        this.root.classList.add("showing-rules");
        this.menuView.hidden = true;
        this.rulesView.hidden = false;
        this.rulesScroller.scrollTop = 0;
        queueMicrotask(() => {
            this.rulesScroller?.focus({ preventScroll: true });
        });
    }
    #showMenu({ focus = false } = {}) {
        this.view = "menu";
        this.root.classList.remove("showing-rules");
        this.rulesView.hidden = true;
        this.menuView.hidden = false;
        if (focus && this.isOpen) {
            queueMicrotask(() => {
                this.#setSelected(this.selectedIndex, { focus: true });
            });
        }
    }
    #setSelected(index, { focus = false, silent = false } = {}) {
        if (this.buttons.length === 0) {
            return;
        }
        const previousIndex = this.selectedIndex;
        this.selectedIndex = (index + this.buttons.length) % this.buttons.length;
        if (!silent && this.isOpen && this.selectedIndex !== previousIndex) {
            this.audioManager?.playUiHover?.();
        }
        this.buttons.forEach((button, buttonIndex) => {
            const selected = buttonIndex === this.selectedIndex;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-current", selected ? "true" : "false");
        });
        if (focus) {
            this.buttons[this.selectedIndex]?.focus({ preventScroll: true });
        }
    }
    #activate(action) {
        if (!this.isOpen) {
            return;
        }
        this.audioManager?.playUiConfirm?.();
        if (action === "resume") {
            this.close();
            return;
        }
        if (action === "rules") {
            this.#showRules();
            return;
        }
        if (action === "restart") {
            this.onRestart?.();
            this.close({ restoreFocus: false });
            return;
        }
        if (action === "main-menu") {
            this.onMainMenu?.();
        }
    }
    #onKeyDown(event) {
        const key = event.key.toLowerCase();
        if (!this.isOpen) {
            if (key === "escape" && !event.repeat && this.canPause?.()) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.open();
            }
            return;
        }
        event.stopImmediatePropagation();
        if (event.repeat) {
            event.preventDefault();
            return;
        }
        if (this.view === "rules") {
            if (key === "escape" || key === "enter" || key === " ") {
                event.preventDefault();
                this.audioManager?.playUiBack?.();
                this.#showMenu({ focus: true });
                return;
            }
            if (key === "arrowdown" || key === "s") {
                event.preventDefault();
                this.rulesScroller?.scrollBy({ top: 88, behavior: "smooth" });
                return;
            }
            if (key === "arrowup" || key === "w") {
                event.preventDefault();
                this.rulesScroller?.scrollBy({ top: -88, behavior: "smooth" });
                return;
            }
            if (key === "pagedown") {
                event.preventDefault();
                this.rulesScroller?.scrollBy({
                    top: this.rulesScroller.clientHeight * 0.82,
                    behavior: "smooth"
                });
                return;
            }
            if (key === "pageup") {
                event.preventDefault();
                this.rulesScroller?.scrollBy({
                    top: -this.rulesScroller.clientHeight * 0.82,
                    behavior: "smooth"
                });
                return;
            }
            event.preventDefault();
            return;
        }
        if (key === "escape") {
            event.preventDefault();
            this.audioManager?.playUiBack?.();
            this.close();
            return;
        }
        if (key === "arrowup" || key === "arrowleft" || key === "w" || key === "a") {
            event.preventDefault();
            this.#setSelected(this.selectedIndex - 1, { focus: true });
            return;
        }
        if (key === "arrowdown" || key === "arrowright" || key === "s" || key === "d") {
            event.preventDefault();
            this.#setSelected(this.selectedIndex + 1, { focus: true });
            return;
        }
        if (key === "home") {
            event.preventDefault();
            this.#setSelected(0, { focus: true });
            return;
        }
        if (key === "end") {
            event.preventDefault();
            this.#setSelected(this.buttons.length - 1, { focus: true });
            return;
        }
        if (key === "enter" || key === " ") {
            event.preventDefault();
            this.#activate(this.buttons[this.selectedIndex]?.dataset.action);
            return;
        }
        event.preventDefault();
    }
    dispose() {
        window.removeEventListener("keydown", this._onKeyDown, true);
        this.rulesBack?.removeEventListener("click", this._onRulesBack);
        for (const handlers of this.buttonHandlers) {
            handlers.button.removeEventListener("pointerenter", handlers.onPointerEnter);
            handlers.button.removeEventListener("focus", handlers.onFocus);
            handlers.button.removeEventListener("click", handlers.onClick);
        }
        this.root.remove();
    }
}

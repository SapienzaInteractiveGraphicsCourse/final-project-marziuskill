//DEPENDENCIES
import { buildGameRulesMarkup } from "./GameRules.js";

//MENU STATE
export const StartMode = Object.freeze({
    SOLO: "SOLO",
    VS_BOT: "VS_BOT"
});
const MenuResult = Object.freeze({
    BACK: Symbol("BACK"),
    RULES: "__RULES__"
});

//START SCREEN
export class StartScreen {
    constructor({ audioManager = null } = {}) {
        this.audioManager = audioManager;
        this.root = document.createElement("div");
        this.root.id = "start-screen";
        this.root.innerHTML = `
            <div class="start-vignette" aria-hidden="true"></div>
            <main class="start-card" aria-live="polite">
                <header class="start-brand">
                    <div class="start-kicker">A HAUNTED 8-BALL STORY</div>
                    <h1>MarziusKill</h1>
                    <div class="start-subtitle">— Till the Last Shot! —</div>
                </header>
                <section id="start-step" class="start-step"></section>
            </main>
        `;
        document.body.appendChild(this.root);
        this.step = this.root.querySelector("#start-step");
        this.activeCleanup = null;
    }
    async chooseGame() {
        while (true) {
            const mode = await this.#chooseMode();
            if (mode === MenuResult.RULES) {
                await this.#showRules();
                continue;
            }
            const difficulty = await this.#chooseDifficulty(mode);
            if (difficulty === MenuResult.BACK) {
                continue;
            }
            return {
                mode,
                difficulty
            };
        }
    }
    async showStory(mode) {
        this.#cleanupActiveInteraction();
        const modeLine = mode === StartMode.SOLO ? "KILL will remain in the shadows. He will watch every shot and judge whether you are worthy." : "KILL is waiting for you. This time the ghost himself will challenge you to a game of 8-ball.";
        this.root.classList.add("story-mode");
        this.root.dataset.view = "story";
        this.step.innerHTML = `
            <div class="story-copy">
                <p>
                    Marzius has followed an old legend to an isolated pub said to be haunted by its first owner — a professional billiards player murdered from behind by a jealous rival.
                </p>
                <p>${modeLine}</p>
                <p>
                    Win his judgment and the pub becomes yours. Fail, and you will die here — bound to the room as another spirit forever.
                </p>
            </div>
            <button id="story-enter" class="start-primary" type="button">Enter the pub</button>
            <div class="start-hint">Enter / click to continue</div>
        `;
        await new Promise(resolve => {
            const button = this.step.querySelector("#story-enter");
            const finish = () => {
                this.audioManager?.playUiConfirm?.();
                cleanup();
                resolve();
            };
            const onKeyDown = event => {
                if (event.repeat) {
                    return;
                }
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    finish();
                }
            };
            const cleanup = () => {
                button.removeEventListener("click", finish);
                window.removeEventListener("keydown", onKeyDown, true);
                if (this.activeCleanup === cleanup) {
                    this.activeCleanup = null;
                }
            };
            this.activeCleanup = cleanup;
            button.addEventListener("click", finish);
            window.addEventListener("keydown", onKeyDown, true);
            queueMicrotask(() => {
                button.focus({ preventScroll: true });
            });
        });
    }
    async fadeOut(duration = 650) {
        this.#cleanupActiveInteraction();
        this.root.classList.add("fade-out");
        await new Promise(resolve => {
            window.setTimeout(resolve, duration);
        });
        this.root.remove();
    }
    #cleanupActiveInteraction() {
        this.activeCleanup?.();
        this.activeCleanup = null;
    }
    #chooseMode() {
        this.root.classList.remove("story-mode");
        this.root.dataset.view = "mode";
        return this.#runMenu({
            eyebrow: "MAIN MENU",
            question: "Choose your game",
            options: [
                {
                    value: StartMode.SOLO,
                    title: "SOLO RUNOUT",
                    description: "Clear the table before KILL's move limit closes around you."
                },
                {
                    value: StartMode.VS_BOT,
                    title: "VS KILL",
                    description: "Face the ghost himself in a full game of 8-ball."
                },
                {
                    value: MenuResult.RULES,
                    title: "RULES",
                    description: "Read the rules enforced by this game."
                }
            ],
            allowBack: false,
            footer: "W / S or arrows to choose · Enter to confirm · Mouse supported"
        });
    }
    #showRules() {
        this.#cleanupActiveInteraction();
        this.root.classList.remove("story-mode");
        this.root.dataset.view = "rules";
        this.step.innerHTML = `
            <div class="start-menu-shell start-rules-shell">
                <div class="start-menu-eyebrow">HOW TO PLAY</div>
                <div class="start-question">Game rules</div>
                ${buildGameRulesMarkup()}
                <button class="start-back" type="button" data-rules-back>BACK</button>
                <div class="start-menu-hint">Scroll / arrows to read · Enter or Esc to go back</div>
            </div>
        `;
        const rules = this.step.querySelector(".game-rules");
        const backButton = this.step.querySelector("[data-rules-back]");
        return new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                this.audioManager?.playUiBack?.();
                cleanup();
                resolve();
            };
            const onKeyDown = event => {
                if (event.repeat) {
                    return;
                }
                const key = event.key.toLowerCase();
                if (key === "escape" || key === "enter" || key === " ") {
                    event.preventDefault();
                    finish();
                    return;
                }
                if (key === "arrowdown" || key === "s") {
                    event.preventDefault();
                    rules?.scrollBy({ top: 88, behavior: "smooth" });
                    return;
                }
                if (key === "arrowup" || key === "w") {
                    event.preventDefault();
                    rules?.scrollBy({ top: -88, behavior: "smooth" });
                    return;
                }
                if (key === "pagedown") {
                    event.preventDefault();
                    rules?.scrollBy({ top: rules.clientHeight * 0.82, behavior: "smooth" });
                    return;
                }
                if (key === "pageup") {
                    event.preventDefault();
                    rules?.scrollBy({ top: -rules.clientHeight * 0.82, behavior: "smooth" });
                }
            };
            const cleanup = () => {
                backButton?.removeEventListener("click", finish);
                window.removeEventListener("keydown", onKeyDown, true);
                if (this.activeCleanup === cleanup) {
                    this.activeCleanup = null;
                }
            };
            this.activeCleanup = cleanup;
            backButton?.addEventListener("click", finish);
            window.addEventListener("keydown", onKeyDown, true);
            queueMicrotask(() => {
                rules?.focus({ preventScroll: true });
            });
        });
    }
    #chooseDifficulty(mode) {
        const solo = mode === StartMode.SOLO;
        this.root.dataset.view = "difficulty";
        return this.#runMenu({
            eyebrow: solo ? "SOLO RUNOUT" : "VS KILL",
            question: "Choose difficulty",
            options: [
                {
                    value: "EASY",
                    title: "EASY",
                    description: solo ? "42-move limit" : "Forgiving aim and power"
                },
                {
                    value: "MEDIUM",
                    title: "MEDIUM",
                    description: solo ? "32-move limit" : "Accurate and consistent"
                },
                {
                    value: "HARD",
                    title: "HARD",
                    description: solo ? "24-move limit" : "No artificial execution error"
                }
            ],
            allowBack: true,
            note: solo ? "Every shot costs one move. Fouls and pocketing balls from the wrong group add extra moves." : "Difficulty changes KILL's planning and execution accuracy.",
            footer: "W / S or arrows to choose · Enter to confirm · Esc to go back"
        });
    }
    #runMenu({ eyebrow, question, options, allowBack = false, note = "", footer = "" }) {
        this.#cleanupActiveInteraction();
        this.step.innerHTML = `
            <div class="start-menu-shell">
                <div class="start-menu-eyebrow">${eyebrow}</div>
                <div class="start-question">${question}</div>
                <div class="start-menu-list" role="menu">
                    ${options.map((option, index) => `
                            <button
                            class="start-menu-button"
                            type="button"
                            role="menuitem"
                            data-menu-index="${index}"
                            data-value="${option.value}"
                            >
                            <span class="start-menu-title">${option.title}</span>
                            <span class="start-menu-description">${option.description}</span>
                            </button>
                        `).join("")}
                </div>
                ${allowBack ? `<button class="start-back" type="button" data-back>BACK</button>` : ""}
                ${note ? `<div class="start-rule-note">${note}</div>` : ""}
                ${footer ? `<div class="start-menu-hint">${footer}</div>` : ""}
            </div>
        `;
        const buttons = [
            ...this.step.querySelectorAll(".start-menu-button")
        ];
        const backButton = this.step.querySelector("[data-back]");
        let selectedIndex = 0;
        const setSelected = (index, { focus = false, silent = false } = {}) => {
            if (buttons.length === 0) {
                return;
            }
            const previousIndex = selectedIndex;
            selectedIndex = (index + buttons.length) % buttons.length;
            if (!silent && selectedIndex !== previousIndex) {
                this.audioManager?.playUiHover?.();
            }
            buttons.forEach((button, buttonIndex) => {
                const selected = buttonIndex === selectedIndex;
                button.classList.toggle("is-selected", selected);
                button.setAttribute("aria-current", selected ? "true" : "false");
            });
            if (focus) {
                buttons[selectedIndex].focus({ preventScroll: true });
            }
        };
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) {
                    return;
                }
                settled = true;
                if (value === MenuResult.BACK) {
                    this.audioManager?.playUiBack?.();
                }
                else {
                    this.audioManager?.playUiConfirm?.();
                }
                cleanup();
                resolve(value);
            };
            const onKeyDown = event => {
                if (event.repeat) {
                    return;
                }
                const key = event.key.toLowerCase();
                if (key === "arrowup" || key === "arrowleft" || key === "w" || key === "a") {
                    event.preventDefault();
                    setSelected(selectedIndex - 1, { focus: true });
                    return;
                }
                if (key === "arrowdown" || key === "arrowright" || key === "s" || key === "d") {
                    event.preventDefault();
                    setSelected(selectedIndex + 1, { focus: true });
                    return;
                }
                if (key === "home") {
                    event.preventDefault();
                    setSelected(0, { focus: true });
                    return;
                }
                if (key === "end") {
                    event.preventDefault();
                    setSelected(buttons.length - 1, { focus: true });
                    return;
                }
                if (key === "enter" || key === " ") {
                    event.preventDefault();
                    finish(buttons[selectedIndex].dataset.value);
                    return;
                }
                if (key === "escape" && allowBack) {
                    event.preventDefault();
                    finish(MenuResult.BACK);
                }
            };
            const buttonHandlers = buttons.map((button, index) => {
                const onPointerEnter = () => setSelected(index);
                const onFocus = () => setSelected(index);
                const onClick = () => finish(button.dataset.value);
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
            const onBack = () => finish(MenuResult.BACK);
            backButton?.addEventListener("click", onBack);
            window.addEventListener("keydown", onKeyDown, true);
            const cleanup = () => {
                window.removeEventListener("keydown", onKeyDown, true);
                backButton?.removeEventListener("click", onBack);
                for (const handlers of buttonHandlers) {
                    handlers.button.removeEventListener("pointerenter", handlers.onPointerEnter);
                    handlers.button.removeEventListener("focus", handlers.onFocus);
                    handlers.button.removeEventListener("click", handlers.onClick);
                }
                if (this.activeCleanup === cleanup) {
                    this.activeCleanup = null;
                }
            };
            this.activeCleanup = cleanup;
            setSelected(0, { silent: true });
            queueMicrotask(() => {
                buttons[0]?.focus({ preventScroll: true });
            });
        });
    }
}

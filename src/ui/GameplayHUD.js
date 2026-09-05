//GAMEPLAY HUD
export class GameplayHUD {
    constructor() {
        this.root = document.createElement("div");
        this.root.id = "gameplay-hud";
        this.root.innerHTML = `
            <div id="gameplay-state" class="gameplay-state"></div>

            <div id="human-power" class="human-power hidden" aria-hidden="true">
                <div id="human-power-track" class="human-power-track">
                    <div id="human-power-marker" class="human-power-marker"></div>
                </div>
            </div>

            <div id="kill-thinking" class="kill-thinking hidden">
                <div id="kill-thinking-name" class="kill-thinking-name">KILL</div>
                <div class="kill-thinking-track">
                    <div id="kill-thinking-fill" class="kill-thinking-fill"></div>
                </div>
                <div id="kill-thinking-label" class="kill-thinking-label"></div>
            </div>
        `;
        document.body.appendChild(this.root);
        this.stateLabel = this.root.querySelector("#gameplay-state");
        this.powerPanel = this.root.querySelector("#human-power");
        this.powerTrack = this.root.querySelector("#human-power-track");
        this.powerMarker = this.root.querySelector("#human-power-marker");
        this.killPanel = this.root.querySelector("#kill-thinking");
        this.killName = this.root.querySelector("#kill-thinking-name");
        this.killTrack = this.root.querySelector(".kill-thinking-track");
        this.killFill = this.root.querySelector("#kill-thinking-fill");
        this.killLabel = this.root.querySelector("#kill-thinking-label");
    }
    setState(text = "") {
        this.stateLabel.textContent = text;
        this.stateLabel.classList.toggle("hidden", !text);
    }
    showPower({ value01, actualPower, maxPower }) {
        const t = Math.min(1, Math.max(0, actualPower ?? value01));
        const clampedMax = Math.min(1, Math.max(0.001, maxPower ?? 1));
        this.powerPanel.classList.remove("hidden");
        this.powerPanel.setAttribute("aria-hidden", "false");
        this.powerTrack.style.width = `${(clampedMax * 100).toFixed(1)}%`;
        this.powerTrack.style.backgroundSize = `${(100 / clampedMax).toFixed(2)}% 100%`;
        this.powerMarker.style.left = `${(Math.min(t, clampedMax) / clampedMax * 100).toFixed(1)}%`;
    }
    hidePower() {
        this.powerPanel.classList.add("hidden");
        this.powerPanel.setAttribute("aria-hidden", "true");
    }
    showKillThinking({ label, progress = null, indeterminate = false }) {
        this.killPanel.classList.remove("hidden");
        this.killLabel.textContent = label ?? "";
        if (this.killName) {
            this.killName.textContent = "KILL";
        }
        this.killPanel.classList.toggle("indeterminate", Boolean(indeterminate));
        if (progress === null || !Number.isFinite(progress)) {
            this.killFill.style.width = indeterminate ? "28%" : "0%";
            return;
        }
        const t = Math.min(1, Math.max(0, progress));
        this.killFill.style.width = `${(t * 100).toFixed(1)}%`;
    }
    hideKillThinking() {
        this.killPanel.classList.add("hidden");
        this.killPanel.classList.remove("indeterminate");
        this.killFill.style.width = "0%";
    }
    dispose() {
        this.root.remove();
    }
}

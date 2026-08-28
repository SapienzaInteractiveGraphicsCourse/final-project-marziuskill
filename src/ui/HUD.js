export class HUD {
    constructor(aircraftStats, flightController) {
        this.stats = aircraftStats;
        this.flightController = flightController;
        this.missionTime = null;

        this.root = document.createElement("div");
        this.root.style.cssText = `
            position: fixed;
            left: 20px;
            bottom: 20px;
            width: 240px;
            padding: 14px 16px;
            box-sizing: border-box;
            background: rgba(10, 18, 24, 0.72);
            border: 1px solid rgba(255,255,255,0.35);
            border-radius: 8px;
            color: white;
            font-family: monospace;
            font-size: 14px;
            pointer-events: none;
            user-select: none;
            z-index: 10;
        `;

        this.timeValue = this._createTextRow("TIME");
        this.speedValue = this._createTextRow("SPEED");

        this.healthBar = this._createBar("HP");
        this.fuelBar = this._createBar("FUEL");

        this.innerValue = this._createTextRow("INNER");
        this.outerValue = this._createTextRow("OUTER");
        this.suppliesValue = this._createTextRow("SUPPLY");

        document.body.appendChild(this.root);
    }

    _createTextRow(label) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; justify-content:space-between; margin:5px 0;";

        const labelElement = document.createElement("span");
        labelElement.textContent = label;

        const valueElement = document.createElement("span");

        row.appendChild(labelElement);
        row.appendChild(valueElement);
        this.root.appendChild(row);

        return valueElement;
    }

    _createBar(label) {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "margin:7px 0;";

        const header = document.createElement("div");
        header.style.cssText = "display:flex; justify-content:space-between; margin-bottom:3px;";

        const labelElement = document.createElement("span");
        labelElement.textContent = label;

        const valueElement = document.createElement("span");

        header.appendChild(labelElement);
        header.appendChild(valueElement);

        const background = document.createElement("div");
        background.style.cssText = `
            width:100%;
            height:7px;
            background:rgba(255,255,255,0.18);
            border-radius:4px;
            overflow:hidden;
        `;

        const bar = document.createElement("div");
        bar.style.cssText = `
            width:100%;
            height:100%;
            background:white;
            transition:width 0.1s linear;
        `;

        background.appendChild(bar);
        wrapper.appendChild(header);
        wrapper.appendChild(background);
        this.root.appendChild(wrapper);

        return {bar, value: valueElement};
    }

    _formatTime(seconds) {
        if (seconds === null) return "--:--";

        const total = Math.max(0, Math.ceil(seconds));
        const minutes = Math.floor(total / 60).toString().padStart(2, "0");
        const remainingSeconds = (total % 60).toString().padStart(2, "0");

        return `${minutes}:${remainingSeconds}`;
    }

    setMissionTime(seconds) {
        this.missionTime = seconds;
    }

    update() {
        const healthRatio = this.stats.health / this.stats.maxHealth;
        const fuelRatio = this.stats.fuel / this.stats.maxFuel;

        this.timeValue.textContent = this._formatTime(this.missionTime);
        this.speedValue.textContent = this.flightController.getSpeed().toFixed(1);

        this.healthBar.value.textContent = `${this.stats.health}/${this.stats.maxHealth}`;
        this.healthBar.bar.style.width = `${healthRatio * 100}%`;

        this.fuelBar.value.textContent = `${this.stats.fuel.toFixed(0)}%`;
        this.fuelBar.bar.style.width = `${fuelRatio * 100}%`;

        this.innerValue.textContent = `${this.stats.innerAmmo}/${this.stats.maxInnerAmmo}`;
        this.outerValue.textContent = `${this.stats.outerAmmo}/${this.stats.maxOuterAmmo}`;
        this.suppliesValue.textContent = `${this.stats.supplies}/${this.stats.maxSupplies}`;
    }
}
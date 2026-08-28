import * as THREE from "three";

export class ArtificialHorizon {
    constructor(aircraftObject, {size = 160, parent = document.body} = {}) {
        this.aircraft = aircraftObject;
        this.size = size;

        this.euler = new THREE.Euler();

        this.canvas = document.createElement("canvas");
        this.canvas.style.cssText = `
            display: block;
            width: ${size}px;
            height: ${size}px;
            pointer-events: none;
        `;

        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.canvas.width = size * pixelRatio;
        this.canvas.height = size * pixelRatio;

        this.context = this.canvas.getContext("2d");
        this.context.scale(pixelRatio, pixelRatio);

        parent.appendChild(this.canvas);
    }

    _drawAttitude(pitch, roll) {
        const ctx = this.context;
        const center = this.size / 2;
        const radius = center - 3;

        const pitchPixelsPerDegree = 2;
        const pitchDegrees = THREE.MathUtils.radToDeg(pitch);
        const pitchOffset = pitchDegrees * pitchPixelsPerDegree;

        ctx.save();

        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.clip();

        ctx.translate(center, center);
        ctx.rotate(-roll);
        ctx.translate(0, pitchOffset);

        // SKY
        ctx.fillStyle = "#4f91bd";
        ctx.fillRect(-this.size * 2, -this.size * 2, this.size * 4, this.size * 2);

        // GROUND
        ctx.fillStyle = "#73543c";
        ctx.fillRect(-this.size * 2, 0, this.size * 4, this.size * 2);

        // HORIZON
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-this.size, 0);
        ctx.lineTo(this.size, 0);
        ctx.stroke();

        this._drawPitchMarks();

        ctx.restore();
    }

    _drawPitchMarks() {
        const ctx = this.context;
        const pitchPixelsPerDegree = 2;

        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.fillStyle = "white";
        ctx.lineWidth = 1;
        ctx.font = "9px monospace";
        ctx.textBaseline = "middle";

        for (let angle = -30; angle <= 30; angle += 10) {
            if (angle === 0) continue;

            const y = -angle * pitchPixelsPerDegree;
            const width = angle % 20 === 0 ? 36 : 24;

            ctx.beginPath();
            ctx.moveTo(-width / 2, y);
            ctx.lineTo(width / 2, y);
            ctx.stroke();

            ctx.textAlign = "right";
            ctx.fillText(Math.abs(angle), -width / 2 - 4, y);

            ctx.textAlign = "left";
            ctx.fillText(Math.abs(angle), width / 2 + 4, y);
        }
    }

    _drawAircraftSymbol() {
        const ctx = this.context;
        const center = this.size / 2;

        ctx.save();
        ctx.translate(center, center);

        ctx.strokeStyle = "#ffd65a";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";

        ctx.beginPath();

        // Left wing
        ctx.moveTo(-38, 0);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-6, 5);

        // Right wing
        ctx.moveTo(38, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(6, 5);

        ctx.stroke();

        // Center reference
        ctx.fillStyle = "#ffd65a";
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawFrame() {
        const ctx = this.context;
        const center = this.size / 2;
        const radius = center - 3;

        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Fixed top reference
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.moveTo(center, 6);
        ctx.lineTo(center - 5, 15);
        ctx.lineTo(center + 5, 15);
        ctx.closePath();
        ctx.fill();
    }

    update() {
        const ctx = this.context;

        ctx.clearRect(0, 0, this.size, this.size);

        this.euler.setFromQuaternion(this.aircraft.quaternion, "YXZ");

        const pitch = this.euler.x;
        const roll = this.euler.z;

        this._drawAttitude(pitch, roll);
        this._drawAircraftSymbol();
        this._drawFrame();
    }
}
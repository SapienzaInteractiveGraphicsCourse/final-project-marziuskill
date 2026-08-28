import * as THREE from "three";

export class Minimap {
    constructor(playerObject, {size = 220, range = 600, parent = document.body} = {}) {
        this.player = playerObject;
        this.size = size;
        this.range = range;
        this.markers = [];

        this.playerPosition = new THREE.Vector3();
        this.markerPosition = new THREE.Vector3();
        this.forward = new THREE.Vector3();
        this.heading = 0;

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

    addMarker({id, object = null, position = null, type = "neutral", label = ""}) {
        this.markers.push({
            id,
            object,
            position: position ? position.clone() : null,
            type,
            label
        });
    }

   removeMarker(id) {
        this.markers = this.markers.filter((marker) => marker.id !== id);
    }
    

    setRange(range) {
        this.range = range;
    }

    _drawBackground() {
        const ctx = this.context;
        const center = this.size / 2;
        const radius = center - 2;

        ctx.clearRect(0, 0, this.size, this.size);

        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10, 18, 24, 0.72)";
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.12)";

        ctx.beginPath();
        ctx.arc(center, center, radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(center, 4);
        ctx.lineTo(center, this.size - 4);
        ctx.moveTo(4, center);
        ctx.lineTo(this.size - 4, center);
        ctx.stroke();
    }

    _getMarkerColor(type) {
        if (type === "home") return "#66aaff";
        if (type === "ally") return "#66ff99";
        if (type === "enemy") return "#ff5555";
        if (type === "enemyAircraft") return "#ff9966";
        return "#dddddd";
    }

    _drawMarker(marker, x, y) {
        const ctx = this.context;

        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = this._getMarkerColor(marker.type);

        if (marker.type === "home") {
            ctx.fillRect(-5, -5, 10, 10);
        } else if (marker.type === "enemy") {
            ctx.fillRect(-4, -4, 8, 8);
        } else if (marker.type === "enemyAircraft") {
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(5, 5);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _drawPlayer() {
        const ctx = this.context;
        const center = this.size / 2;

        ctx.save();
        ctx.translate(center, center);

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 7);
        ctx.lineTo(0, 4);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    _drawCardinals() {
        const ctx = this.context;
        const center = this.size / 2;
        const radius = center - 16;

        const cardinals = [
            {label: "N", x: 0, z: -1},
            {label: "E", x: 1, z: 0},
            {label: "S", x: 0, z: 1},
            {label: "W", x: -1, z: 0}
        ];

        const cos = Math.cos(this.heading);
        const sin = Math.sin(this.heading);

        ctx.fillStyle = "white";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const cardinal of cardinals) {
            const rotatedX = cos * cardinal.x + sin * cardinal.z;
            const rotatedZ = -sin * cardinal.x + cos * cardinal.z;

            const x = center + rotatedX * radius;
            const y = center + rotatedZ * radius;

            ctx.fillText(cardinal.label, x, y);
        }
    }

    update() {
        this._drawBackground();

        this.player.getWorldPosition(this.playerPosition);

        this.forward.set(0, 0, -1).applyQuaternion(this.player.quaternion);
        this.forward.y = 0;

        if (this.forward.lengthSq() > 0.0001) {
            this.forward.normalize();
        }

        this.heading = Math.atan2(this.forward.x, -this.forward.z);

        const cos = Math.cos(this.heading);
        const sin = Math.sin(this.heading);

        const center = this.size / 2;
        const radius = center - 12;
        const scale = radius / this.range;

        for (const marker of this.markers) {
            if (marker.object) {
                marker.object.getWorldPosition(this.markerPosition);
            } else if (marker.position) {
                this.markerPosition.copy(marker.position);
            } else {
                continue;
            }

            const dx = this.markerPosition.x - this.playerPosition.x;
            const dz = this.markerPosition.z - this.playerPosition.z;

            const rotatedX = cos * dx + sin * dz;
            const rotatedZ = -sin * dx + cos * dz;

            let mapX = rotatedX * scale;
            let mapY = rotatedZ * scale;

            const distance = Math.sqrt(mapX * mapX + mapY * mapY);

            if (distance > radius) {
                const factor = radius / distance;
                mapX *= factor;
                mapY *= factor;
            }

            this._drawMarker(marker, center + mapX, center + mapY);
        }

        this._drawCardinals();
        this._drawPlayer();
    }
}
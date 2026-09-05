import { CUE_RIG } from "../config/constants.js";

//INPUT MANAGER
export class InputManager {
    constructor() {
        this.keys = new Set();
        this.shotRequested = false;
        this._onKeyDown = this.#onKeyDown.bind(this);
        this._onKeyUp = this.#onKeyUp.bind(this);
        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup", this._onKeyUp);
    }
    #isEditableTarget(target) {
        const tag = target?.tagName?.toLowerCase();
        return (tag === "input" || tag === "textarea" || tag === "select" || tag === "button");
    }
    #onKeyDown(event) {
        if (this.#isEditableTarget(event.target)) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === " ") {
            if (!event.repeat) {
                this.shotRequested = true;
            }
            event.preventDefault();
            return;
        }
        this.keys.add(key);
    }
    #onKeyUp(event) {
        this.keys.delete(event.key.toLowerCase());
    }
    updateAiming(dt, cueRig, enabled = true) {
        if (!enabled) {
            return;
        }
        let yaw = cueRig.getYawDeg();
        let elevation = cueRig.getElevationDeg();
        if (this.keys.has("a")) {
            yaw += CUE_RIG.KEYBOARD_YAW_SPEED_DEG * dt;
        }
        if (this.keys.has("d")) {
            yaw -= CUE_RIG.KEYBOARD_YAW_SPEED_DEG * dt;
        }
        if (this.keys.has("w")) {
            elevation += CUE_RIG.KEYBOARD_ELEVATION_SPEED_DEG * dt;
        }
        if (this.keys.has("s")) {
            elevation -= CUE_RIG.KEYBOARD_ELEVATION_SPEED_DEG * dt;
        }
        cueRig.setYawDeg(yaw);
        cueRig.setElevationDeg(elevation);
    }
    consumeShotRequest() {
        if (!this.shotRequested) {
            return false;
        }
        this.shotRequested = false;
        return true;
    }
    dispose() {
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
    }
}

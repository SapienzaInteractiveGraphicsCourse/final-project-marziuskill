//Manages pocket flashes, 8-ball selection highlights and beacon effects.

//DEPENDENCIES
import * as THREE from "three";

//HELPERS
function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}
function smooth01(value) {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
}
function easeOutCubic(value) {
    const x = clamp01(value);
    return 1 - Math.pow(1 - x, 3);
}

//EFFECT COLORS
export const TABLE_EFFECT_COLORS = Object.freeze({
    ALLY: 0x3ea6ff,
    ENEMY: 0xff5252,
    WARNING: 0xa35cff,
    SELECT: 0xffb347,
    WALL_IDLE: 0xffffff
});

//TABLE EFFECTS
export class TableEffectsManager {

    //INITIALIZATION
    constructor({ scene, pocketSystem, pocketObjects = [], clothY, pocketFlashDuration = 1.20, audioManager = null }) {
        this.scene = scene;
        this.pocketSystem = pocketSystem;
        this.pocketObjects = pocketObjects;
        this.clothY = clothY;
        this.audioManager = audioManager;
        this.pocketFlashDuration = Math.max(0.10, Number(pocketFlashDuration) || 1.20);
        this.flashes = [];
        this.pocketCommitMemory = new WeakMap();
        this.lastCalledPocket = null;
        this.lastCalledPocketPlayer = null;
        this.wispGeometry = new THREE.SphereGeometry(1, 10, 8);
        this.selection = this.#buildPocketWallSelection();
        this.scene.add(this.selection.group);
        this.beacon = this.#buildBeacon();
        this.scene.add(this.beacon.group);
    }

    //OVERLAY GEOMETRY
    #clonePocketWallForOverlay(source) {
        if (!source) {
            return null;
        }
        source.updateWorldMatrix?.(true, true);
        const clone = source.clone(true);
        source.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
        clone.visible = true;
        clone.name = `${source.name}_SelectionOverlay`;
        const materials = [];
        clone.traverse(child => {
            child.visible = true;
            if (!child.isMesh || !child.geometry) {
                return;
            }
            const material = new THREE.MeshBasicMaterial({
                color: TABLE_EFFECT_COLORS.WALL_IDLE,
                wireframe: true,
                transparent: true,
                opacity: 0.58,
                depthWrite: false,
                depthTest: false
            });
            child.material = material;
            child.renderOrder = 150;
            materials.push(material);
        });
        clone.userData.selectionMaterials = materials;
        return clone;
    }
    #buildPocketWallSelection() {
        const group = new THREE.Group();
        group.name = "EightBallPocketWallSelection";
        group.visible = false;
        const byName = new Map();
        for (const pocketObject of this.pocketObjects ?? []) {
            const overlay = this.#clonePocketWallForOverlay(pocketObject);
            if (!overlay) {
                continue;
            }
            group.add(overlay);
            byName.set(pocketObject.name, overlay);
        }
        return {
            group,
            byName,
            pocketName: null,
            time: 0
        };
    }
    #makeGlowMaterial(color, opacity = 0) {
        return new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
    }
    #buildCircularBase(color) {
        const group = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.063, 0.012, 32, 1, false), this.#makeGlowMaterial(color, 0));
        disc.position.y = -0.010;
        group.add(disc);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.040, 0.061, 36), this.#makeGlowMaterial(color, 0));
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = -0.003;
        group.add(rim);
        return { group, disc, rim };
    }
    #buildBeacon() {
        const group = new THREE.Group();
        group.name = "EightBallPocketBeacon";
        group.visible = false;
        const base = this.#buildCircularBase(TABLE_EFFECT_COLORS.ALLY);
        group.add(base.group);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.050, 0.28, 28, 1, true), this.#makeGlowMaterial(TABLE_EFFECT_COLORS.ALLY, 0));
        column.position.y = 0.14;
        group.add(column);
        const innerColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.033, 0.25, 24, 1, true), this.#makeGlowMaterial(TABLE_EFFECT_COLORS.ALLY, 0));
        innerColumn.position.y = 0.125;
        group.add(innerColumn);
        return {
            group,
            base,
            column,
            innerColumn,
            phase: "IDLE",
            time: 0,
            spawnAccumulator: 0,
            wisps: [],
            pocketName: null,
            ownerPlayer: null,
            color: TABLE_EFFECT_COLORS.ALLY,
            enterDuration: 0.42,
            exitDuration: 0.46
        };
    }
    #setBaseColor(base, color) {
        base.disc.material.color.setHex(color);
        base.rim.material.color.setHex(color);
    }
    #setBaseOpacity(base, amount) {
        const t = clamp01(amount);
        base.disc.material.opacity = 0.18 * t;
        base.rim.material.opacity = 0.55 * t;
    }

    //WISP VFX
    #makeWisp(parent, color, { radius = 0.010, height = 0.050, life = 1.0, delay = 0, speed = 0.16, driftX = 0, driftZ = 0, startRadius = 0.026, opacity = 0.26 } = {}) {
        const angle = Math.random() * Math.PI * 2;
        const radial = Math.sqrt(Math.random()) * startRadius;
        const group = new THREE.Group();
        group.position.set(Math.cos(angle) * radial, -0.002, Math.sin(angle) * radial);
        const material = this.#makeGlowMaterial(color, 0);
        const lower = new THREE.Mesh(this.wispGeometry, material);
        lower.scale.set(radius, height * 0.48, radius);
        lower.position.y = height * 0.28;
        group.add(lower);
        const upper = new THREE.Mesh(this.wispGeometry, material);
        upper.scale.set(radius * 0.58, height * 0.34, radius * 0.58);
        upper.position.y = height * 0.70;
        group.add(upper);
        parent.add(group);
        return {
            group,
            material,
            elapsed: -delay,
            life,
            speed,
            driftX,
            driftZ,
            baseOpacity: opacity,
            startX: group.position.x,
            startZ: group.position.z,
            swayPhase: Math.random() * Math.PI * 2,
            swayAmount: 0.004 + Math.random() * 0.007
        };
    }
    #updateWisp(wisp, dt) {
        wisp.elapsed += dt;
        if (wisp.elapsed < 0) {
            wisp.group.visible = false;
            return false;
        }
        wisp.group.visible = true;
        const t = clamp01(wisp.elapsed / wisp.life);
        const appear = smooth01(Math.min(1, t * 4.0));
        const fade = Math.pow(1 - t, 1.55);
        wisp.material.opacity = wisp.baseOpacity * appear * fade;
        const rise = wisp.speed * wisp.elapsed;
        const sway = Math.sin(wisp.swayPhase + wisp.elapsed * 5.2) * wisp.swayAmount * (0.4 + t);
        wisp.group.position.x = wisp.startX + wisp.driftX * wisp.elapsed + sway;
        wisp.group.position.z = wisp.startZ + wisp.driftZ * wisp.elapsed + sway * 0.55;
        wisp.group.position.y = -0.002 + rise;
        const spread = 1 + t * 0.65;
        wisp.group.scale.set(spread, 1 + t * 0.45, spread);
        return t >= 1;
    }
    #disposeWisp(wisp) {
        wisp.group.removeFromParent();
        wisp.material.dispose();
    }
    #spawnFlashWisps(effect, color) {
        const count = 11;
        const duration = Math.max(0.10, effect.duration);
        for (let i = 0; i < count; i += 1) {
            const delay = Math.random() * Math.min(0.10, duration * 0.12);
            const availableLife = Math.max(0.12, duration - delay);
            effect.wisps.push(this.#makeWisp(effect.group, color, {
                radius: 0.008 + Math.random() * 0.007,
                height: 0.040 + Math.random() * 0.040,
                life: availableLife * (0.72 + Math.random() * 0.24),
                delay,
                speed: 0.12 + Math.random() * 0.11,
                driftX: (Math.random() - 0.5) * 0.020,
                driftZ: (Math.random() - 0.5) * 0.020,
                startRadius: 0.030,
                opacity: 0.18 + Math.random() * 0.18
            }));
        }
    }
    #spawnBeaconWisp() {
        const color = this.beacon.color;
        this.beacon.wisps.push(this.#makeWisp(this.beacon.group, color, {
            radius: 0.007 + Math.random() * 0.005,
            height: 0.038 + Math.random() * 0.032,
            life: 1.15 + Math.random() * 0.65,
            delay: 0,
            speed: 0.12 + Math.random() * 0.07,
            driftX: (Math.random() - 0.5) * 0.012,
            driftZ: (Math.random() - 0.5) * 0.012,
            startRadius: 0.026,
            opacity: 0.14 + Math.random() * 0.12
        }));
    }
    getPockets() {
        return this.pocketSystem?.getPockets?.() ?? [];
    }
    getPocketByName(name) {
        return this.getPockets().find(pocket => pocket.name === name) ?? null;
    }
    clearPocketMemory() {
        this.pocketCommitMemory = new WeakMap();
    }

    //POCKET FLASH
    triggerPocketFlash(pocketName, color) {
        const pocket = this.getPocketByName(pocketName);
        if (!pocket) {
            return;
        }
        this.audioManager?.play?.("pocketMagic", {
            position: pocket.center,
            gain: 1.0,
            refDistance: 1.55,
            maxDistance: 12.0,
            rolloffFactor: 0.86,
            cooldownKey: `pocket-vfx:${pocketName}`,
            cooldown: 0.08
        });
        const group = new THREE.Group();
        group.name = `PocketFlame_${pocketName}`;
        group.position.set(pocket.center.x, this.clothY, pocket.center.z);
        const base = this.#buildCircularBase(color);
        group.add(base.group);
        const light = new THREE.PointLight(color, 0, 1.15, 2.0);
        light.position.y = 0.055;
        group.add(light);
        const effect = {
            group,
            base,
            light,
            wisps: [],
            elapsed: 0,
            duration: this.pocketFlashDuration
        };
        this.#spawnFlashWisps(effect, color);
        this.scene.add(group);
        this.flashes.push(effect);
    }
    #setOverlayColor(overlay, color, opacity) {
        for (const material of overlay?.userData?.selectionMaterials ?? []) {
            material.color.setHex(color);
            material.opacity = opacity;
            material.needsUpdate = true;
        }
    }

    //POCKET SELECTION
    setSelectionPocket(pocketName) {
        const pocket = this.getPocketByName(pocketName);
        if (!pocket) {
            this.clearSelection();
            return;
        }
        this.selection.group.visible = true;
        this.selection.pocketName = pocketName;
        this.selection.time = 0;
        for (const [name, overlay] of this.selection.byName.entries()) {
            const selected = name === pocketName;
            this.#setOverlayColor(overlay, selected ? TABLE_EFFECT_COLORS.SELECT : TABLE_EFFECT_COLORS.WALL_IDLE, selected ? 0.98 : 0.58);
        }
    }
    clearSelection() {
        this.selection.group.visible = false;
        this.selection.pocketName = null;
        this.selection.time = 0;
    }

    //EIGHT BALL BEACON
    activateBeacon({ pocketName, ownerPlayer = 0, color = TABLE_EFFECT_COLORS.ALLY }) {
        const pocket = this.getPocketByName(pocketName);
        if (!pocket) {
            return;
        }
        for (const wisp of this.beacon.wisps) {
            this.#disposeWisp(wisp);
        }
        this.beacon.wisps = [];
        this.beacon.group.visible = true;
        this.beacon.group.position.set(pocket.center.x, this.clothY, pocket.center.z);
        this.beacon.group.scale.set(1, 1, 1);
        this.beacon.pocketName = pocketName;
        this.beacon.ownerPlayer = ownerPlayer;
        this.beacon.color = color;
        this.beacon.phase = "ENTER";
        this.beacon.time = 0;
        this.beacon.spawnAccumulator = 0;
        this.lastCalledPocket = pocketName;
        this.lastCalledPocketPlayer = ownerPlayer;
        this.#setBaseColor(this.beacon.base, color);
        this.beacon.column.material.color.setHex(color);
        this.beacon.innerColumn.material.color.setHex(color);
        this.#setBaseOpacity(this.beacon.base, 0);
        this.beacon.column.material.opacity = 0;
        this.beacon.innerColumn.material.opacity = 0;
        this.triggerPocketFlash(pocketName, color);
    }
    clearBeaconImmediately() {
        for (const wisp of this.beacon.wisps) {
            this.#disposeWisp(wisp);
        }
        this.beacon.wisps = [];
        this.beacon.phase = "IDLE";
        this.beacon.time = 0;
        this.beacon.spawnAccumulator = 0;
        this.beacon.group.visible = false;
        this.beacon.group.scale.set(1, 1, 1);
        this.#setBaseOpacity(this.beacon.base, 0);
        this.beacon.column.material.opacity = 0;
        this.beacon.innerColumn.material.opacity = 0;
        this.beacon.pocketName = null;
        this.beacon.ownerPlayer = null;
        this.lastCalledPocket = null;
        this.lastCalledPocketPlayer = null;
    }
    deactivateBeacon() {
        if (this.beacon.phase === "IDLE") {
            this.lastCalledPocket = null;
            this.lastCalledPocketPlayer = null;
            return;
        }
        this.beacon.phase = "EXIT";
        this.beacon.time = 0;
        this.lastCalledPocket = null;
        this.lastCalledPocketPlayer = null;
    }
    scanPocketCommit(body, colorResolver) {
        if (!body) {
            return;
        }
        if (!body.pocketCommitted || !body.pocketName) {
            this.pocketCommitMemory.delete(body);
            return;
        }
        const previousPocket = this.pocketCommitMemory.get(body);
        if (previousPocket === body.pocketName) {
            return;
        }
        this.pocketCommitMemory.set(body, body.pocketName);
        this.triggerPocketFlash(body.pocketName, colorResolver(body));
    }
    #updateFlashes(dt) {
        for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
            const effect = this.flashes[i];
            effect.elapsed += dt;
            const t = clamp01(effect.elapsed / effect.duration);
            const baseIn = smooth01(Math.min(1, t * 7));
            const baseOut = Math.pow(1 - t, 1.9);
            this.#setBaseOpacity(effect.base, baseIn * baseOut);
            effect.light.intensity = 5.5 * baseIn * baseOut;
            for (let j = effect.wisps.length - 1; j >= 0; j -= 1) {
                const wisp = effect.wisps[j];
                if (this.#updateWisp(wisp, dt)) {
                    this.#disposeWisp(wisp);
                    effect.wisps.splice(j, 1);
                }
            }
            if (t >= 1) {
                for (const wisp of effect.wisps) {
                    this.#disposeWisp(wisp);
                }
                effect.wisps.length = 0;
                effect.group.removeFromParent();
                effect.base.disc.geometry.dispose();
                effect.base.rim.geometry.dispose();
                effect.base.disc.material.dispose();
                effect.base.rim.material.dispose();
                this.flashes.splice(i, 1);
            }
        }
    }
    #updateSelection(dt) {
        if (!this.selection.group.visible || !this.selection.pocketName) {
            return;
        }
        this.selection.time += dt;
        const pulse = 0.86 + 0.14 * Math.sin(this.selection.time * 5.2);
        for (const [name, overlay] of this.selection.byName.entries()) {
            const selected = name === this.selection.pocketName;
            this.#setOverlayColor(overlay, selected ? TABLE_EFFECT_COLORS.SELECT : TABLE_EFFECT_COLORS.WALL_IDLE, selected ? 0.84 + 0.14 * pulse : 0.58);
        }
    }
    #updateBeaconWisps(dt, spawn) {
        if (spawn) {
            this.beacon.spawnAccumulator += dt;
            const interval = 0.115;
            while (this.beacon.spawnAccumulator >= interval) {
                this.beacon.spawnAccumulator -= interval;
                this.#spawnBeaconWisp();
            }
        }
        for (let i = this.beacon.wisps.length - 1; i >= 0; i -= 1) {
            const wisp = this.beacon.wisps[i];
            if (this.#updateWisp(wisp, dt)) {
                this.#disposeWisp(wisp);
                this.beacon.wisps.splice(i, 1);
            }
        }
    }
    #updateBeacon(dt) {
        if (this.beacon.phase === "IDLE") {
            return;
        }
        this.beacon.time += dt;
        if (this.beacon.phase === "ENTER") {
            const t = smooth01(this.beacon.time / this.beacon.enterDuration);
            this.#setBaseOpacity(this.beacon.base, t);
            this.beacon.column.material.opacity = 0.11 * t;
            this.beacon.innerColumn.material.opacity = 0.075 * t;
            this.beacon.column.scale.y = Math.max(0.001, t);
            this.beacon.innerColumn.scale.y = Math.max(0.001, t);
            this.beacon.column.position.y = 0.14 * t;
            this.beacon.innerColumn.position.y = 0.125 * t;
            this.#updateBeaconWisps(dt, true);
            if (t >= 1) {
                this.beacon.phase = "SUSTAIN";
                this.beacon.time = 0;
            }
            return;
        }
        if (this.beacon.phase === "SUSTAIN") {
            const pulse = 0.90 + 0.10 * Math.sin(this.beacon.time * 2.5);
            this.#setBaseOpacity(this.beacon.base, pulse);
            this.beacon.column.material.opacity = 0.10 * pulse;
            this.beacon.innerColumn.material.opacity = 0.065 * pulse;
            this.beacon.column.scale.y = 1;
            this.beacon.innerColumn.scale.y = 1;
            this.beacon.column.position.y = 0.14;
            this.beacon.innerColumn.position.y = 0.125;
            this.#updateBeaconWisps(dt, true);
            return;
        }
        if (this.beacon.phase === "EXIT") {
            const t = smooth01(this.beacon.time / this.beacon.exitDuration);
            const alpha = 1 - t;
            this.#setBaseOpacity(this.beacon.base, alpha);
            this.beacon.column.material.opacity = 0.10 * alpha;
            this.beacon.innerColumn.material.opacity = 0.065 * alpha;
            this.beacon.column.scale.y = Math.max(0.001, alpha);
            this.beacon.innerColumn.scale.y = Math.max(0.001, alpha);
            this.beacon.column.position.y = 0.14 * alpha;
            this.beacon.innerColumn.position.y = 0.125 * alpha;
            this.#updateBeaconWisps(dt, false);
            if (t >= 1) {
                this.beacon.phase = "TAIL";
                this.beacon.time = 0;
            }
            return;
        }
        if (this.beacon.phase === "TAIL") {
            this.#setBaseOpacity(this.beacon.base, 0);
            this.beacon.column.material.opacity = 0;
            this.beacon.innerColumn.material.opacity = 0;
            this.#updateBeaconWisps(dt, false);
            if (this.beacon.wisps.length === 0) {
                this.beacon.phase = "IDLE";
                this.beacon.time = 0;
                this.beacon.group.visible = false;
                this.beacon.pocketName = null;
                this.beacon.ownerPlayer = null;
            }
        }
    }

    //UPDATE LOOP
    update(dt) {
        this.#updateSelection(dt);
        this.#updateFlashes(dt);
        this.#updateBeacon(dt);
    }
    dispose() {
        this.clearSelection();
        this.clearBeaconImmediately();
        for (const effect of this.flashes) {
            for (const wisp of effect.wisps) {
                this.#disposeWisp(wisp);
            }
            effect.group.removeFromParent();
            effect.base.disc.geometry.dispose();
            effect.base.rim.geometry.dispose();
            effect.base.disc.material.dispose();
            effect.base.rim.material.dispose();
        }
        this.flashes = [];
        this.selection.group.traverse(child => {
            if (child.isMesh) {
                child.material?.dispose?.();
            }
        });
        this.selection.group.removeFromParent();
        this.beacon.base.disc.geometry.dispose();
        this.beacon.base.rim.geometry.dispose();
        this.beacon.base.disc.material.dispose();
        this.beacon.base.rim.material.dispose();
        this.beacon.column.geometry.dispose();
        this.beacon.column.material.dispose();
        this.beacon.innerColumn.geometry.dispose();
        this.beacon.innerColumn.material.dispose();
        this.beacon.group.removeFromParent();
        this.wispGeometry.dispose();
    }
}

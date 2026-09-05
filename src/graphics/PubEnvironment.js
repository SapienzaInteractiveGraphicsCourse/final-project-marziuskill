//Builds the pub scene and exposes the authored props used by gameplay and cinematics.

//DEPENDENCIES
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PUB_ASSETS, PUB_ENVIRONMENT } from "../config/constants.js";
RectAreaLightUniformsLib.init();

//HELPERS
function repeated(source, repeatX, repeatY) {
    const texture = source.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    return texture;
}
function enableRendering(root, renderer) {
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    root.traverse(child => {
        if (!child.isMesh) {
            return;
        }
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
            if (!material) {
                continue;
            }
            for (const key of [
                "map",
                "normalMap",
                "roughnessMap",
                "metalnessMap",
                "aoMap",
                "emissiveMap",
                "alphaMap"
            ]) {
                const texture = material[key];
                if (texture) {
                    texture.anisotropy = anisotropy;
                    texture.needsUpdate = true;
                }
            }
        }
    });
}
function normalizeToFloor(object, name) {
    const wrapper = new THREE.Group();
    wrapper.name = name;
    wrapper.add(object);
    wrapper.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= box.min.y;
    wrapper.updateMatrixWorld(true);
    return wrapper;
}
function normalizeToFloorPreserveXZ(object, name) {
    const wrapper = new THREE.Group();
    wrapper.name = name;
    wrapper.add(object);
    wrapper.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.y -= box.min.y;
    wrapper.updateMatrixWorld(true);
    return wrapper;
}

//PUB ENVIRONMENT
export class PubEnvironment {

    //INITIALIZATION
    constructor(renderer, billiardsAssets = null) {
        this.renderer = renderer;
        this.billiardsAssets = billiardsAssets;
        this.root = new THREE.Group();
        this.root.name = "PubEnvironment";
        this.models = {};
        this.textureSets = {};
        this.exteriorTextures = {};
        this.poolLight = null;
        this.poolLightAnchors = [];
        this.entranceDoorLeft = null;
        this.entranceDoorRight = null;
        this.windowLeftWing = [];
        this.windowRightWing = [];
        this.scoreboardObject = null;
        this.introCueAnchor = null;
        this.wallCueAnchors = [];
        this.wallCueInitial = [];
        this.cueRackGroup = null;
        this.gameplayCueReturn = null;
        this.exteriorWindowFill = null;
        this.windowGlassMaterials = [];
        this.victoryExteriorState = null;
        this.cinematicBoardOverlay = null;
        this.cinematicBoardCanvas = null;
        this.cinematicBoardContext = null;
        this.cinematicBoardTexture = null;
        this.cinematicBoardMaterial = null;
        this.cinematicBoardTargetMesh = null;
        this.cinematicBoardTargetCanvas = null;
        this.cinematicBoardTargetContext = null;
        this.cinematicBoardTargetTexture = null;
        this.gameplayScoreboardSystem = null;
        this.cinematicBoardSavedPixels = null;
        this.cinematicBoardFadeBasePixels = null;
        this.cinematicBoardMessageState = null;
        this.doorClosedQuaternions = {
            left: null,
            right: null
        };
        this.windowOpenQuaternions = [];
        this.windowClosedQuaternions = [];
        this.introCueInitial = null;
        this.introCueFallen = null;
        this.introCueHeldStart = null;
        this.introCueHeldTarget = null;
    }

    //ASSET LOADING
    async load() {
        const [poolLight, pubCounter, backBar, furniture, barrel, entranceDoor, pubWindow, jukebox, bottles, whiskeySet, wallClock, scoreboard, floorTextures, wallTextures, panelTextures, exteriorWallMap, exteriorWallHeightMap, exteriorBackdropMap] = await Promise.all([
            this.#loadModel(PUB_ASSETS.POOL_LIGHT),
            this.#loadModel(PUB_ASSETS.PUB_COUNTER),
            this.#loadModel(PUB_ASSETS.BACK_BAR),
            this.#loadModel(PUB_ASSETS.FURNITURE),
            this.#loadModel(PUB_ASSETS.BARREL),
            this.#loadModel(PUB_ASSETS.ENTRANCE_DOOR),
            this.#loadModel(PUB_ASSETS.PUB_WINDOW),
            this.#loadModel(PUB_ASSETS.JUKEBOX),
            this.#loadModel(PUB_ASSETS.BOTTLES),
            this.#loadModel(PUB_ASSETS.WHISKEY_SET),
            this.#loadModel(PUB_ASSETS.WALL_CLOCK),
            this.#loadModel(PUB_ASSETS.SCOREBOARD),
            this.#loadTextureSet(PUB_ASSETS.FLOOR_BASE_COLOR, PUB_ASSETS.FLOOR_NORMAL, PUB_ASSETS.FLOOR_ROUGHNESS),
            this.#loadTextureSet(PUB_ASSETS.WALL_BASE_COLOR, PUB_ASSETS.WALL_NORMAL, PUB_ASSETS.WALL_ROUGHNESS),
            this.#loadTextureSet(PUB_ASSETS.PANELS_BASE_COLOR, PUB_ASSETS.PANELS_NORMAL, PUB_ASSETS.PANELS_ROUGHNESS),
            this.#loadTexture(PUB_ASSETS.EXTERIOR_WALL_BASE_COLOR, THREE.SRGBColorSpace),
            this.#loadTexture(PUB_ASSETS.EXTERIOR_WALL_HEIGHT, THREE.NoColorSpace),
            this.#loadTexture(PUB_ASSETS.EXTERIOR_FOREST_BACKDROP, THREE.SRGBColorSpace)
        ]);
        this.models = {
            poolLight,
            pubCounter,
            backBar,
            furniture,
            barrel,
            entranceDoor,
            pubWindow,
            jukebox,
            bottles,
            whiskeySet,
            wallClock,
            scoreboard
        };
        this.textureSets = {
            floor: floorTextures,
            wall: wallTextures,
            panels: panelTextures
        };
        this.exteriorTextures = {
            wallMap: exteriorWallMap,
            wallHeightMap: exteriorWallHeightMap,
            backdropMap: exteriorBackdropMap
        };
        this.#buildRoom();
        this.#buildExteriorShell();
        this.#buildExteriorBackdrop();
        this.#placeEntrance();
        this.#placePoolLight();
        this.#placeBar();
        this.#placeBarDecor();
        this.#placeFurniture();
        this.#placeBarrels();
        this.#placeJukebox();
        this.#placeWallDecor();
        this.#placeCueRack();
        this.#placeWallAccentLights();
        return this;
    }
    bindGameplayScoreboardSystem(scoreboardSystem) {
        this.gameplayScoreboardSystem = scoreboardSystem ?? null;
        this.#findGameplayScoreboardCanvas(true);
    }

    //SCENE QUERIES
    getPoolLightAnchors() {
        this.root.updateMatrixWorld(true);
        return this.poolLightAnchors.map(anchor => {
            const position = new THREE.Vector3();
            anchor.getWorldPosition(position);
            return position;
        });
    }
    getEntranceDoorNodes() {
        return {
            left: this.entranceDoorLeft,
            right: this.entranceDoorRight
        };
    }
    getEntranceWindowNodes() {
        return {
            left: this.windowLeftWing,
            right: this.windowRightWing
        };
    }
    getScoreboardObject() {
        return this.scoreboardObject;
    }
    getScoreboardWorldCenter() {
        if (!this.scoreboardObject) {
            return null;
        }
        this.scoreboardObject.updateWorldMatrix(true, true);
        return new THREE.Box3().setFromObject(this.scoreboardObject).getCenter(new THREE.Vector3());
    }
    getCueRackWorldCenter() {
        if (!this.cueRackGroup) {
            return new THREE.Vector3(PUB_ENVIRONMENT.ROOM_WIDTH / 2, 1.45, PUB_ENVIRONMENT.CUE_RACK_Z);
        }
        this.cueRackGroup.updateWorldMatrix(true, true);
        return new THREE.Box3().setFromObject(this.cueRackGroup).getCenter(new THREE.Vector3());
    }
    getEntranceWorldCenter() {
        return new THREE.Vector3(0, 1.55, PUB_ENVIRONMENT.ROOM_DEPTH / 2);
    }
    getWindowWorldCenter(index = 0) {
        const left = this.windowLeftWing[index];
        const right = this.windowRightWing[index];
        if (!left && !right) {
            return null;
        }
        this.root.updateMatrixWorld(true);
        const points = [];
        for (const node of [left, right]) {
            if (!node) {
                continue;
            }
            const position = new THREE.Vector3();
            node.getWorldPosition(position);
            points.push(position);
        }
        if (points.length === 0) {
            return null;
        }
        const center = new THREE.Vector3();
        for (const point of points) {
            center.add(point);
        }
        center.multiplyScalar(1 / points.length);
        center.y = Math.max(center.y, 1.35);
        return center;
    }
    getJukeboxWorldPosition() {
        const jukebox = this.root.getObjectByName("PubJukebox");
        if (!jukebox) {
            return new THREE.Vector3(PUB_ENVIRONMENT.JUKEBOX_X, 0.92, PUB_ENVIRONMENT.JUKEBOX_Z);
        }
        jukebox.updateWorldMatrix(true, true);
        return new THREE.Box3().setFromObject(jukebox).getCenter(new THREE.Vector3());
    }
    getRackAttackCueAnchors() {
        return this.wallCueAnchors.filter(anchor => anchor && anchor !== this.introCueAnchor && anchor.parent === this.cueRackGroup);
    }
    getCueRackGroup() {
        return this.cueRackGroup;
    }

    //CUE RACK ANIMATION
    beginGameplayCueReturn() {
        if (!this.introCueAnchor || !this.cueRackGroup || !this.introCueInitial) {
            return false;
        }
        this.introCueAnchor.visible = true;
        this.cueRackGroup.attach(this.introCueAnchor);
        this.introCueAnchor.updateMatrixWorld(true);
        this.gameplayCueReturn = {
            startPosition: this.introCueAnchor.position.clone(),
            startQuaternion: this.introCueAnchor.quaternion.clone(),
            startScale: this.introCueAnchor.scale.clone(),
            targetPosition: this.introCueInitial.position.clone(),
            targetQuaternion: this.introCueInitial.quaternion.clone(),
            targetScale: this.introCueInitial.scale.clone()
        };
        return true;
    }
    setGameplayCueReturnProgress(progress) {
        if (!this.gameplayCueReturn || !this.introCueAnchor) {
            return;
        }
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        const eased = t * t * (3 - 2 * t);
        const state = this.gameplayCueReturn;
        this.introCueAnchor.position.lerpVectors(state.startPosition, state.targetPosition, eased);
        this.introCueAnchor.quaternion.slerpQuaternions(state.startQuaternion, state.targetQuaternion, eased);
        this.introCueAnchor.scale.lerpVectors(state.startScale, state.targetScale, eased);
        this.introCueAnchor.updateMatrixWorld(true);
    }
    finishGameplayCueReturn() {
        if (!this.gameplayCueReturn || !this.introCueAnchor) {
            return;
        }
        const state = this.gameplayCueReturn;
        this.introCueAnchor.position.copy(state.targetPosition);
        this.introCueAnchor.quaternion.copy(state.targetQuaternion);
        this.introCueAnchor.scale.copy(state.targetScale);
        this.introCueAnchor.visible = true;
        this.introCueAnchor.updateMatrixWorld(true);
        this.gameplayCueReturn = null;
    }
    resetCinematicCueState() {
        this.gameplayCueReturn = null;
        if (!this.cueRackGroup) {
            return;
        }
        this.wallCueAnchors.forEach((anchor, index) => {
            const initial = this.wallCueInitial[index];
            if (!anchor || !initial) {
                return;
            }
            if (anchor.parent !== this.cueRackGroup) {
                this.cueRackGroup.add(anchor);
            }
            anchor.position.copy(initial.position);
            anchor.quaternion.copy(initial.quaternion);
            anchor.scale.copy(initial.scale);
            anchor.visible = true;
            anchor.updateMatrixWorld(true);
        });
    }

    //SCOREBOARD
    #findGameplayScoreboardCanvas(forceRescan = false) {
        if (!forceRescan && this.cinematicBoardTargetCanvas && this.cinematicBoardTargetContext && this.cinematicBoardTargetTexture) {
            return true;
        }
        const canvasCandidates = [];
        const textureCandidates = [];
        const visited = new Set();
        const considerCanvas = (canvas, owner = null, score = 0) => {
            if (!canvas || typeof canvas.getContext !== "function" || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width < 128 || canvas.height < 64) {
                return;
            }
            canvasCandidates.push({
                canvas,
                owner,
                score: score + Math.min(12, Math.log2(canvas.width * canvas.height) - 14)
            });
        };
        const considerTexture = (texture, owner = null, score = 0) => {
            if (!texture?.isTexture) {
                return;
            }
            const canvas = texture.image;
            if (canvas && typeof canvas.getContext === "function") {
                textureCandidates.push({ texture, canvas, owner, score: score + 10 });
                considerCanvas(canvas, owner, score + 10);
            }
        };
        const scan = (value, depth = 0, score = 0) => {
            if (!value || depth > 3) {
                return;
            }
            if (typeof value === "object") {
                if (visited.has(value)) {
                    return;
                }
                visited.add(value);
            }
            if (value?.isTexture) {
                considerTexture(value, value, score);
                return;
            }
            if (typeof value?.getContext === "function") {
                considerCanvas(value, value, score);
                return;
            }
            if (Array.isArray(value)) {
                for (const child of value) {
                    scan(child, depth + 1, score);
                }
                return;
            }
            if (typeof value !== "object") {
                return;
            }
            for (const [key, child] of Object.entries(value)) {
                const lower = key.toLowerCase();
                if ([
                    "scene",
                    "renderer",
                    "camera",
                    "parent",
                    "children",
                    "root"
                ].includes(lower)) {
                    continue;
                }
                const keyBoost = lower.includes("score") || lower.includes("board") || lower.includes("canvas") || lower.includes("texture") || lower.includes("display") ? 6 : 0;
                scan(child, depth + 1, score + keyBoost);
            }
        };
        const scoreSceneBoost = object => {
            const name = String(object?.name ?? object?.userData?.name ?? "").toLowerCase();
            return ((name.includes("score") || name.includes("board") || name.includes("chalk")) ? 24 : 0);
        };
        const inspectMeshTextures = (object, baseScore = 0) => {
            if (!object?.isMesh) {
                return;
            }
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                for (const slot of ["map", "emissiveMap", "alphaMap"]) {
                    const texture = material?.[slot];
                    if (texture?.isTexture) {
                        considerTexture(texture, object, baseScore + scoreSceneBoost(object));
                    }
                }
            }
        };
        if (this.scoreboardObject) {
            this.scoreboardObject.traverse(object => {
                inspectMeshTextures(object, 42);
            });
        }
        if (this.gameplayScoreboardSystem) {
            scan(this.gameplayScoreboardSystem, 0, 16);
        }
        const sceneRoot = this.root.parent ?? this.root;
        sceneRoot.traverse(object => {
            inspectMeshTextures(object, 0);
        });
        textureCandidates.sort((a, b) => b.score - a.score);
        let targetTexture = textureCandidates[0]?.texture ?? null;
        let targetCanvas = textureCandidates[0]?.canvas ?? null;
        let targetOwner = textureCandidates[0]?.owner ?? null;
        if (!targetCanvas) {
            canvasCandidates.sort((a, b) => b.score - a.score);
            targetCanvas = canvasCandidates[0]?.canvas ?? null;
            targetOwner = canvasCandidates[0]?.owner ?? null;
        }
        if (targetCanvas) {
            const paired = textureCandidates.filter(entry => entry.canvas === targetCanvas).sort((a, b) => b.score - a.score)[0];
            targetTexture = paired?.texture ?? null;
            targetOwner = paired?.owner ?? targetOwner;
        }
        if (!targetCanvas || !targetTexture) {
            const paired = textureCandidates.sort((a, b) => b.score - a.score)[0];
            targetCanvas = paired?.canvas ?? null;
            targetTexture = paired?.texture ?? null;
            targetOwner = paired?.owner ?? null;
        }
        if (!targetCanvas || !targetTexture) {
            console.warn("[END-CINEMATIC] Could not bind the existing ScoreboardSystem canvas; " + "cinematic board text will be skipped rather than adding a second layer.");
            return false;
        }
        const context = targetCanvas.getContext("2d");
        if (!context) {
            return false;
        }
        this.cinematicBoardTargetMesh = targetOwner?.isMesh ? targetOwner : null;
        this.cinematicBoardTargetCanvas = targetCanvas;
        this.cinematicBoardTargetContext = context;
        this.cinematicBoardTargetTexture = targetTexture;
        try {
            this.cinematicBoardSavedPixels = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
            this.cinematicBoardFadeBasePixels = this.cinematicBoardSavedPixels;
        }
        catch {
            this.cinematicBoardSavedPixels = null;
            this.cinematicBoardFadeBasePixels = null;
        }
        return true;
    }
    #ensureCinematicBoardOverlay() {
        return this.#findGameplayScoreboardCanvas();
    }
    #restoreCinematicBoardBase({ original = false } = {}) {
        const pixels = original ? this.cinematicBoardSavedPixels : (this.cinematicBoardFadeBasePixels ?? this.cinematicBoardSavedPixels);
        if (this.cinematicBoardTargetContext && pixels) {
            try {
                this.cinematicBoardTargetContext.putImageData(pixels, 0, 0);
                if (this.cinematicBoardTargetTexture) {
                    this.cinematicBoardTargetTexture.needsUpdate = true;
                }
            }
            catch {
            }
        }
    }
    #drawCinematicBoardMessage({ text, opacity = 1, fontScale = 1, maxWidthRatio = 0.82 }) {
        const useTarget = this.#findGameplayScoreboardCanvas();
        if (!useTarget) {
            return;
        }
        const canvas = this.cinematicBoardTargetCanvas;
        const ctx = this.cinematicBoardTargetContext;
        const texture = this.cinematicBoardTargetTexture;
        if (!canvas || !ctx || !texture) {
            return;
        }
        const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
        const lines = String(text ?? "").split(/\n/).map(line => line.trim()).filter(Boolean);
        this.#restoreCinematicBoardBase();
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgb(28, 46, 36)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        let fontSize = Math.round((lines.length > 1 ? 88 : 82) * Math.max(0.45, fontScale));
        const targetWidth = canvas.width * THREE.MathUtils.clamp(maxWidthRatio, 0.48, 0.90);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(242, 238, 221, 0.98)";
        ctx.shadowColor = "rgba(255,255,255,0.06)";
        ctx.shadowBlur = 1;
        for (; fontSize >= 34; fontSize -= 2) {
            ctx.font = `700 ${fontSize}px "Trebuchet MS", "Arial Narrow", Arial, sans-serif`;
            const widest = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
            if (widest <= targetWidth) {
                break;
            }
        }
        const lineHeight = fontSize * 1.08;
        const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
            ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
        });
        ctx.restore();
        texture.needsUpdate = true;
    }
    setCinematicBoardMessage(text, { opacity = 1, fontScale = 1, maxWidthRatio = 0.82 } = {}) {
        this.#ensureCinematicBoardOverlay();
        if (this.cinematicBoardTargetContext && this.cinematicBoardTargetCanvas) {
            try {
                const currentPixels = this.cinematicBoardTargetContext.getImageData(0, 0, this.cinematicBoardTargetCanvas.width, this.cinematicBoardTargetCanvas.height);
                if (!this.cinematicBoardMessageState) {
                    this.cinematicBoardSavedPixels = currentPixels;
                }
                this.cinematicBoardFadeBasePixels = currentPixels;
            }
            catch {
                this.cinematicBoardFadeBasePixels = this.cinematicBoardSavedPixels;
            }
        }
        this.cinematicBoardMessageState = {
            text: String(text ?? ""),
            fontScale,
            maxWidthRatio
        };
        this.#drawCinematicBoardMessage({
            text,
            opacity,
            fontScale,
            maxWidthRatio
        });
    }
    setCinematicBoardOpacity(opacity) {
        if (!this.cinematicBoardMessageState) {
            return;
        }
        this.#drawCinematicBoardMessage({
            ...this.cinematicBoardMessageState,
            opacity
        });
    }
    hideCinematicBoardMessage() {
        this.#restoreCinematicBoardBase({ original: true });
        if (this.cinematicBoardOverlay) {
            this.cinematicBoardOverlay.visible = false;
        }
        if (this.cinematicBoardMaterial) {
            this.cinematicBoardMaterial.opacity = 0;
        }
        this.cinematicBoardMessageState = null;
        this.cinematicBoardSavedPixels = null;
        this.cinematicBoardFadeBasePixels = null;
        this.cinematicBoardTargetMesh = null;
        this.cinematicBoardTargetCanvas = null;
        this.cinematicBoardTargetContext = null;
        this.cinematicBoardTargetTexture = null;
    }

    //CINEMATIC STATE
    resetIntroAnimation() {
        this.setEntranceDoorOpenProgress(0);
        for (let i = 0; i < 2; i += 1) {
            this.setWindowClosedProgress(i, 0);
        }
        if (this.introCueAnchor && this.introCueInitial) {
            if (this.introCueAnchor.parent !== this.root) {
                this.root.attach(this.introCueAnchor);
            }
            this.introCueAnchor.visible = true;
            this.introCueAnchor.position.copy(this.introCueInitial.position);
            this.introCueAnchor.quaternion.copy(this.introCueInitial.quaternion);
            this.introCueAnchor.scale.copy(this.introCueInitial.scale);
            this.introCueAnchor.updateMatrixWorld(true);
        }
    }
    setEntranceDoorOpenProgress(progress) {
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        if (this.entranceDoorLeft && this.doorClosedQuaternions.left) {
            const open = this.doorClosedQuaternions.left.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(82)));
            this.entranceDoorLeft.quaternion.slerpQuaternions(this.doorClosedQuaternions.left, open, t);
        }
        if (this.entranceDoorRight && this.doorClosedQuaternions.right) {
            const open = this.doorClosedQuaternions.right.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-82)));
            this.entranceDoorRight.quaternion.slerpQuaternions(this.doorClosedQuaternions.right, open, t);
        }
    }
    //Opening audio starts with motion, while closing audio is intentionally delayed until the windows are almost shut.
    setWindowClosedProgress(index, progress) {
        const left = this.windowLeftWing[index];
        const right = this.windowRightWing[index];
        const open = this.windowOpenQuaternions[index];
        const closed = this.windowClosedQuaternions[index];
        if (!left || !right || !open || !closed) {
            return;
        }
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        left.quaternion.slerpQuaternions(open.left, closed.left, t);
        right.quaternion.slerpQuaternions(open.right, closed.right, t);
    }
    setVictoryExteriorReveal(progress) {
        const t = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1);
        if (!this.victoryExteriorState) {
            this.victoryExteriorState = {
                fillIntensity: this.exteriorWindowFill?.intensity ?? 0,
                glass: this.windowGlassMaterials.map(material => ({
                    material,
                    opacity: material.opacity,
                    emissive: material.emissive?.clone?.() ?? null,
                    emissiveIntensity: material.emissiveIntensity ?? 0
                }))
            };
        }
        if (this.exteriorWindowFill) {
            const base = this.victoryExteriorState.fillIntensity;
            this.exteriorWindowFill.intensity = base;
        }
        for (const state of this.victoryExteriorState.glass) {
            state.material.opacity = THREE.MathUtils.lerp(state.opacity, Math.max(0.22, state.opacity * 0.82), t);
            if (state.material.emissive && state.emissive) {
                state.material.emissive.copy(state.emissive).lerp(new THREE.Color(0x182437), 0.45 * t);
                state.material.emissiveIntensity = THREE.MathUtils.lerp(state.emissiveIntensity, 0.16, t);
            }
            state.material.needsUpdate = true;
        }
    }
    resetVictoryExteriorReveal() {
        if (!this.victoryExteriorState) {
            return;
        }
        if (this.exteriorWindowFill) {
            this.exteriorWindowFill.intensity = this.victoryExteriorState.fillIntensity;
        }
        for (const state of this.victoryExteriorState.glass) {
            state.material.opacity = state.opacity;
            if (state.material.emissive && state.emissive) {
                state.material.emissive.copy(state.emissive);
                state.material.emissiveIntensity = state.emissiveIntensity;
            }
            state.material.needsUpdate = true;
        }
        this.victoryExteriorState = null;
    }
    getIntroCueWorldPosition() {
        if (!this.introCueAnchor) {
            return null;
        }
        const position = new THREE.Vector3();
        this.introCueAnchor.getWorldPosition(position);
        return position;
    }
    getIntroCueFallenWorldPosition() {
        if (!this.introCueAnchor || !this.introCueFallen) {
            return null;
        }
        const position = this.introCueFallen.position.clone();
        const parent = this.introCueAnchor.parent;
        if (parent) {
            parent.updateWorldMatrix(true, false);
            parent.localToWorld(position);
        }
        return position;
    }
    //Keep the visual floor contact aligned with the main transient of the cue-fall recording.
    setIntroCueFallProgress(progress) {
        if (!this.introCueAnchor || !this.introCueInitial || !this.introCueFallen) {
            return;
        }
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        this.introCueAnchor.position.lerpVectors(this.introCueInitial.position, this.introCueFallen.position, t);
        this.introCueAnchor.quaternion.slerpQuaternions(this.introCueInitial.quaternion, this.introCueFallen.quaternion, t);
    }
    attachIntroCueToCamera(camera) {
        if (!this.introCueAnchor || !camera) {
            return;
        }
        camera.attach(this.introCueAnchor);
        this.introCueHeldStart = {
            position: this.introCueAnchor.position.clone(),
            quaternion: this.introCueAnchor.quaternion.clone(),
            scale: this.introCueAnchor.scale.clone()
        };
        this.introCueHeldTarget = {
            position: new THREE.Vector3(0.25, -0.02, -0.48),
            quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.055, 0.012, 0.065, "XYZ")),
            scale: this.introCueAnchor.scale.clone()
        };
    }
    setIntroCueHeldProgress(progress) {
        if (!this.introCueAnchor || !this.introCueHeldStart || !this.introCueHeldTarget) {
            return;
        }
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        this.introCueAnchor.position.lerpVectors(this.introCueHeldStart.position, this.introCueHeldTarget.position, t);
        this.introCueAnchor.quaternion.slerpQuaternions(this.introCueHeldStart.quaternion, this.introCueHeldTarget.quaternion, t);
    }
    detachHeldIntroCueToWorld() {
        if (!this.introCueAnchor || this.introCueAnchor.parent === this.root) {
            return;
        }
        this.root.attach(this.introCueAnchor);
        this.introCueAnchor.updateMatrixWorld(true);
    }
    hideHeldIntroCue() {
        if (this.introCueAnchor) {
            this.introCueAnchor.visible = false;
        }
    }
    showGameplayHeldCue(camera) {
        if (!this.introCueAnchor || !camera) {
            return;
        }
        if (this.introCueAnchor.parent !== camera) {
            camera.attach(this.introCueAnchor);
        }
        this.introCueAnchor.visible = true;
        this.introCueAnchor.position.set(0.25, -0.02, -0.48);
        this.introCueAnchor.quaternion.setFromEuler(new THREE.Euler(-0.055, 0.012, 0.065, "XYZ"));
        this.introCueAnchor.updateMatrixWorld(true);
    }
    hideGameplayHeldCue() {
        if (this.introCueAnchor) {
            this.introCueAnchor.visible = false;
        }
    }
    setTopDownOcclusion(active) {
        if (this.poolLight) {
            this.poolLight.visible = !active;
        }
    }

    //RESOURCE LOADING
    #loadModel(url) {
        return new Promise((resolve, reject) => {
            new GLTFLoader().load(url, gltf => {
                enableRendering(gltf.scene, this.renderer);
                resolve(gltf);
            }, undefined, error => {
                reject(new Error(`Could not load ${url}: ` + (error?.message ?? error)));
            });
        });
    }
    #loadTexture(url, colorSpace) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, texture => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.colorSpace = colorSpace;
                texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
                texture.needsUpdate = true;
                resolve(texture);
            }, undefined, reject);
        });
    }
    async #loadTextureSet(baseColor, normal, roughness) {
        const [map, normalMap, roughnessMap] = await Promise.all([
            this.#loadTexture(baseColor, THREE.SRGBColorSpace),
            this.#loadTexture(normal, THREE.NoColorSpace),
            this.#loadTexture(roughness, THREE.NoColorSpace)
        ]);
        return {
            map,
            normalMap,
            roughnessMap
        };
    }
    #makeMaterial(set, { repeatX, repeatY, color = 0xffffff, normalScale = 0.5, roughness = 1.0 }) {
        return new THREE.MeshStandardMaterial({
            map: repeated(set.map, repeatX, repeatY),
            normalMap: repeated(set.normalMap, repeatX, repeatY),
            roughnessMap: repeated(set.roughnessMap, repeatX, repeatY),
            color,
            roughness,
            metalness: 0,
            normalScale: new THREE.Vector2(normalScale, normalScale)
        });
    }

    //PUB GEOMETRY
    #buildRoom() {
        const width = PUB_ENVIRONMENT.ROOM_WIDTH;
        const depth = PUB_ENVIRONMENT.ROOM_DEPTH;
        const height = PUB_ENVIRONMENT.ROOM_HEIGHT;
        const wainscot = PUB_ENVIRONMENT.WAINSCOT_HEIGHT;
        const upperHeight = height - wainscot;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.#makeMaterial(this.textureSets.floor, {
            repeatX: PUB_ENVIRONMENT.FLOOR_REPEAT_X,
            repeatY: PUB_ENVIRONMENT.FLOOR_REPEAT_Z,
            roughness: 0.92,
            normalScale: 0.52
        }));
        floor.name = "PubFloor";
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.root.add(floor);
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.#makeMaterial(this.textureSets.wall, {
            repeatX: 4.0,
            repeatY: 5.0,
            color: 0x51463d,
            roughness: 1.0,
            normalScale: 0.18
        }));
        ceiling.name = "PubCeiling";
        ceiling.position.y = height;
        ceiling.rotation.x = Math.PI / 2;
        ceiling.receiveShadow = true;
        this.root.add(ceiling);
        const addWall = ({ name, span, x, z, rotationY }) => {
            const upper = new THREE.Mesh(new THREE.PlaneGeometry(span, upperHeight), this.#makeMaterial(this.textureSets.wall, {
                repeatX: span * PUB_ENVIRONMENT.WALL_REPEAT_PER_METER,
                repeatY: Math.max(1, upperHeight * 0.55),
                color: 0xb2a58f,
                roughness: 0.96,
                normalScale: 0.34
            }));
            upper.name = `${name}_Upper`;
            upper.position.set(x, wainscot + upperHeight / 2, z);
            upper.rotation.y = rotationY;
            upper.receiveShadow = true;
            this.root.add(upper);
            const panels = new THREE.Mesh(new THREE.PlaneGeometry(span, wainscot), this.#makeMaterial(this.textureSets.panels, {
                repeatX: span * PUB_ENVIRONMENT.PANEL_REPEAT_PER_METER,
                repeatY: Math.max(1, wainscot * 0.85),
                color: 0x7c624c,
                roughness: 0.82,
                normalScale: 0.42
            }));
            panels.name = `${name}_Wainscot`;
            panels.position.set(x, wainscot / 2, z);
            panels.rotation.y = rotationY;
            panels.receiveShadow = true;
            this.root.add(panels);
        };
        addWall({
            name: "BackWall",
            span: width,
            x: 0,
            z: -depth / 2,
            rotationY: 0
        });
        this.#buildFrontFacade({
            width,
            depth,
            height,
            wainscot
        });
        addWall({
            name: "LeftWall",
            span: depth,
            x: -width / 2,
            z: 0,
            rotationY: Math.PI / 2
        });
        addWall({
            name: "RightWall",
            span: depth,
            x: width / 2,
            z: 0,
            rotationY: -Math.PI / 2
        });
        const trimMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1c13,
            roughness: 0.72,
            metalness: 0
        });
        const addTrim = (length, x, z, rotationY) => {
            const trim = new THREE.Mesh(new THREE.BoxGeometry(length, PUB_ENVIRONMENT.TRIM_HEIGHT, PUB_ENVIRONMENT.TRIM_DEPTH), trimMaterial);
            trim.position.set(x, wainscot, z);
            trim.rotation.y = rotationY;
            trim.castShadow = true;
            trim.receiveShadow = true;
            this.root.add(trim);
        };
        addTrim(width, 0, -depth / 2 + 0.018, 0);
        const doorHalf = PUB_ENVIRONMENT.ENTRANCE_DOOR_OPENING_WIDTH / 2;
        const windowHalf = PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_WIDTH / 2;
        const [leftWindowX, rightWindowX] = PUB_ENVIRONMENT.ENTRANCE_WINDOW_CENTERS_X;
        const trimRanges = [
            [
                -width / 2,
                leftWindowX - windowHalf
            ],
            [
                leftWindowX + windowHalf,
                -doorHalf
            ],
            [
                doorHalf,
                rightWindowX - windowHalf
            ],
            [
                rightWindowX + windowHalf,
                width / 2
            ]
        ];
        trimRanges.forEach(([xMin, xMax]) => {
            const length = xMax - xMin;
            addTrim(length, (xMin + xMax) / 2, depth / 2 - 0.018, 0);
        });
        addTrim(depth, -width / 2 + 0.018, 0, Math.PI / 2);
        addTrim(depth, width / 2 - 0.018, 0, Math.PI / 2);
    }
    #buildFrontFacade({ width, depth, height, wainscot }) {
        const z = depth / 2;
        const topBandBottom = PUB_ENVIRONMENT.FRONT_FACADE_TOP_BAND_BOTTOM;
        const doorHalf = PUB_ENVIRONMENT.ENTRANCE_DOOR_OPENING_WIDTH / 2;
        const doorTop = PUB_ENVIRONMENT.ENTRANCE_DOOR_OPENING_HEIGHT;
        const windowHalf = PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_WIDTH / 2;
        const [leftWindowX, rightWindowX] = PUB_ENVIRONMENT.ENTRANCE_WINDOW_CENTERS_X;
        const windowBottom = PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_BOTTOM;
        const windowTop = windowBottom + PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_HEIGHT;
        const addSegment = ({ name, xMin, xMax, yMin, yMax, kind }) => {
            const segmentWidth = xMax - xMin;
            const segmentHeight = yMax - yMin;
            if (segmentWidth <= 0.001 || segmentHeight <= 0.001) {
                return;
            }
            const isPanel = kind === "panel";
            const material = this.#makeMaterial(isPanel ? this.textureSets.panels : this.textureSets.wall, {
                repeatX: Math.max(0.25, segmentWidth * (isPanel ? PUB_ENVIRONMENT.PANEL_REPEAT_PER_METER : PUB_ENVIRONMENT.WALL_REPEAT_PER_METER)),
                repeatY: Math.max(0.35, segmentHeight * (isPanel ? 0.85 : 0.55)),
                color: isPanel ? 0x7c624c : 0xb2a58f,
                roughness: isPanel ? 0.82 : 0.96,
                normalScale: isPanel ? 0.42 : 0.34
            });
            const segment = new THREE.Mesh(new THREE.PlaneGeometry(segmentWidth, segmentHeight), material);
            segment.name = name;
            segment.position.set((xMin + xMax) / 2, (yMin + yMax) / 2, z);
            segment.rotation.y = Math.PI;
            segment.receiveShadow = true;
            this.root.add(segment);
        };
        addSegment({
            name: "FrontWall_Wainscot_Left",
            xMin: -width / 2,
            xMax: -doorHalf,
            yMin: 0,
            yMax: wainscot,
            kind: "panel"
        });
        addSegment({
            name: "FrontWall_Wainscot_Right",
            xMin: doorHalf,
            xMax: width / 2,
            yMin: 0,
            yMax: wainscot,
            kind: "panel"
        });
        const leftWindowMin = leftWindowX - windowHalf;
        const leftWindowMax = leftWindowX + windowHalf;
        const rightWindowMin = rightWindowX - windowHalf;
        const rightWindowMax = rightWindowX + windowHalf;
        addSegment({
            name: "FrontWall_Upper_TopBand",
            xMin: -width / 2,
            xMax: width / 2,
            yMin: topBandBottom,
            yMax: height,
            kind: "upper"
        });
        const columns = [
            [
                -width / 2,
                leftWindowMin
            ],
            [
                leftWindowMax,
                -doorHalf
            ],
            [
                doorHalf,
                rightWindowMin
            ],
            [
                rightWindowMax,
                width / 2
            ]
        ];
        columns.forEach(([xMin, xMax], index) => {
            addSegment({
                name: `FrontWall_Upper_Column_${index + 1}`,
                xMin,
                xMax,
                yMin: wainscot,
                yMax: topBandBottom,
                kind: "upper"
            });
        });
        for (const [label, xMin, xMax] of [
            [
                "Left",
                leftWindowMin,
                leftWindowMax
            ],
            [
                "Right",
                rightWindowMin,
                rightWindowMax
            ]
        ]) {
            addSegment({
                name: `FrontWall_Upper_${label}WindowBelow`,
                xMin,
                xMax,
                yMin: wainscot,
                yMax: windowBottom,
                kind: "upper"
            });
            addSegment({
                name: `FrontWall_Upper_${label}WindowAbove`,
                xMin,
                xMax,
                yMin: windowTop,
                yMax: topBandBottom,
                kind: "upper"
            });
        }
        addSegment({
            name: "FrontWall_Upper_DoorAbove",
            xMin: -doorHalf,
            xMax: doorHalf,
            yMin: doorTop,
            yMax: topBandBottom,
            kind: "upper"
        });
    }
    #makeExteriorWallMaterial(repeatX, repeatY) {
        return new THREE.MeshStandardMaterial({
            map: repeated(this.exteriorTextures.wallMap, repeatX, repeatY),
            bumpMap: repeated(this.exteriorTextures.wallHeightMap, repeatX, repeatY),
            bumpScale: 0.030,
            color: 0xf1ece2,
            roughness: 0.96,
            metalness: 0
        });
    }
    #buildExteriorShell() {
        const width = PUB_ENVIRONMENT.ROOM_WIDTH;
        const depth = PUB_ENVIRONMENT.ROOM_DEPTH;
        const height = PUB_ENVIRONMENT.ROOM_HEIGHT;
        const zOffset = 0.028;
        const xOffset = 0.028;
        const addPlane = ({ name, span, tall, x, y, z, rotationY, repeatXFactor = 0.44, repeatYFactor = 0.60 }) => {
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(span, tall), this.#makeExteriorWallMaterial(Math.max(0.35, span * repeatXFactor), Math.max(0.35, tall * repeatYFactor)));
            plane.name = name;
            plane.position.set(x, y, z);
            plane.rotation.y = rotationY;
            plane.castShadow = true;
            plane.receiveShadow = true;
            this.root.add(plane);
        };
        addPlane({
            name: "ExteriorBackWall",
            span: width,
            tall: height,
            x: 0,
            y: height / 2,
            z: -depth / 2 - zOffset,
            rotationY: Math.PI
        });
        addPlane({
            name: "ExteriorLeftWall",
            span: depth,
            tall: height,
            x: -width / 2 - xOffset,
            y: height / 2,
            z: 0,
            rotationY: -Math.PI / 2
        });
        addPlane({
            name: "ExteriorRightWall",
            span: depth,
            tall: height,
            x: width / 2 + xOffset,
            y: height / 2,
            z: 0,
            rotationY: Math.PI / 2
        });
        const frontZ = depth / 2 + zOffset;
        const doorHalf = PUB_ENVIRONMENT.ENTRANCE_DOOR_OPENING_WIDTH / 2;
        const doorTop = PUB_ENVIRONMENT.ENTRANCE_DOOR_OPENING_HEIGHT;
        const windowHalf = PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_WIDTH / 2;
        const [leftWindowX, rightWindowX] = PUB_ENVIRONMENT.ENTRANCE_WINDOW_CENTERS_X;
        const windowBottom = PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_BOTTOM;
        const windowTop = windowBottom + PUB_ENVIRONMENT.ENTRANCE_WINDOW_OPENING_HEIGHT;
        const leftWindowMin = leftWindowX - windowHalf;
        const leftWindowMax = leftWindowX + windowHalf;
        const rightWindowMin = rightWindowX - windowHalf;
        const rightWindowMax = rightWindowX + windowHalf;
        const addFrontSegment = ({ name, xMin, xMax, yMin, yMax }) => {
            const segmentWidth = xMax - xMin;
            const segmentHeight = yMax - yMin;
            if (segmentWidth <= 0.001 || segmentHeight <= 0.001) {
                return;
            }
            addPlane({
                name,
                span: segmentWidth,
                tall: segmentHeight,
                x: (xMin + xMax) / 2,
                y: (yMin + yMax) / 2,
                z: frontZ,
                rotationY: 0
            });
        };
        for (const [xMin, xMax] of [
            [
                -width / 2,
                leftWindowMin
            ],
            [
                leftWindowMax,
                -doorHalf
            ],
            [
                doorHalf,
                rightWindowMin
            ],
            [
                rightWindowMax,
                width / 2
            ]
        ]) {
            addFrontSegment({
                name: "ExteriorFrontWallColumn",
                xMin,
                xMax,
                yMin: 0,
                yMax: height
            });
        }
        addFrontSegment({
            name: "ExteriorFrontWallDoorAbove",
            xMin: -doorHalf,
            xMax: doorHalf,
            yMin: doorTop,
            yMax: height
        });
        for (const [label, xMin, xMax] of [
            [
                "Left",
                leftWindowMin,
                leftWindowMax
            ],
            [
                "Right",
                rightWindowMin,
                rightWindowMax
            ]
        ]) {
            addFrontSegment({
                name: `ExteriorFrontWall_${label}WindowBelow`,
                xMin,
                xMax,
                yMin: 0,
                yMax: windowBottom
            });
            addFrontSegment({
                name: `ExteriorFrontWall_${label}WindowAbove`,
                xMin,
                xMax,
                yMin: windowTop,
                yMax: height
            });
        }
    }
    #buildExteriorBackdrop() {
        const farZ = PUB_ENVIRONMENT.EXTERIOR_FAR_Z;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 7.8), new THREE.MeshStandardMaterial({
            color: 0x090c0f,
            roughness: 1.0,
            metalness: 0
        }));
        ground.name = "ExteriorForestGround";
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.004, PUB_ENVIRONMENT.EXTERIOR_GROUND_CENTER_Z + 0.9);
        ground.receiveShadow = true;
        this.root.add(ground);
        const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 8.8), new THREE.MeshBasicMaterial({
            map: this.exteriorTextures.backdropMap,
            side: THREE.DoubleSide,
            toneMapped: false
        }));
        backdrop.name = "ExteriorForestBackdrop";
        backdrop.position.set(0, 2.55, farZ + 1.55);
        backdrop.rotation.y = Math.PI;
        this.root.add(backdrop);
        const exteriorFill = new THREE.PointLight(0x5d6f86, 0.75, 5.4, 2.0);
        exteriorFill.name = "ExteriorWindowFill";
        exteriorFill.position.set(0, 2.2, 6.35);
        exteriorFill.castShadow = false;
        this.exteriorWindowFill = exteriorFill;
        this.root.add(exteriorFill);
    }
    #makeWindowGlass(frame) {
        let doorGlassMaterial = null;
        this.models.entranceDoor.scene.traverse(child => {
            if (doorGlassMaterial || !child.isMesh) {
                return;
            }
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            doorGlassMaterial = materials.find(material => material && material.name === "EntranceDoorsGlass_MTL") || null;
        });
        const material = doorGlassMaterial ? doorGlassMaterial.clone() : new THREE.MeshPhysicalMaterial();
        material.name = "PubWindowGlass_MTL";
        material.map = null;
        material.color.set(0x0d1419);
        material.metalness = 0;
        material.roughness = 0.40;
        material.transmission = 0.82;
        material.ior = 1.45;
        material.transparent = true;
        material.opacity = 0.32;
        material.side = THREE.DoubleSide;
        material.emissive.set(0x000000);
        material.emissiveIntensity = 0;
        material.depthWrite = false;
        material.needsUpdate = true;
        if (!this.windowGlassMaterials.includes(material)) {
            this.windowGlassMaterials.push(material);
        }
        frame.updateWorldMatrix(true, true);
        const frameBounds = new THREE.Box3().setFromObject(frame);
        const size = frameBounds.getSize(new THREE.Vector3());
        const center = frameBounds.getCenter(new THREE.Vector3());
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(size.x * PUB_ENVIRONMENT.WINDOW_GLASS_WIDTH_FACTOR, size.y * PUB_ENVIRONMENT.WINDOW_GLASS_HEIGHT_FACTOR), material);
        glass.name = "PubWindowGlass";
        glass.position.set(center.x, center.y, center.z + PUB_ENVIRONMENT.WINDOW_GLASS_DEPTH_OFFSET);
        glass.castShadow = false;
        glass.receiveShadow = true;
        return glass;
    }

    //PROP PLACEMENT
    #placeEntrance() {
        const depth = PUB_ENVIRONMENT.ROOM_DEPTH;
        const door = normalizeToFloor(this.models.entranceDoor.scene.clone(true), "PubEntranceDoor");
        door.position.set(0, 0, depth / 2 - PUB_ENVIRONMENT.ENTRANCE_DOOR_Z_INSET);
        door.rotation.y = Math.PI;
        this.root.add(door);
        const mat = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.014, 0.62), new THREE.MeshStandardMaterial({
            color: 0x2b211c,
            roughness: 0.92,
            metalness: 0
        }));
        mat.name = "EntranceMat";
        mat.position.set(0, 0.007, depth / 2 - 0.63);
        mat.castShadow = true;
        mat.receiveShadow = true;
        this.root.add(mat);
        this.entranceDoorLeft = door.getObjectByName("EntranceDoorLeft");
        this.entranceDoorRight = door.getObjectByName("EntranceDoorRight");
        this.doorClosedQuaternions = {
            left: this.entranceDoorLeft?.quaternion.clone() ?? null,
            right: this.entranceDoorRight?.quaternion.clone() ?? null
        };
        this.windowLeftWing = [];
        this.windowRightWing = [];
        PUB_ENVIRONMENT.ENTRANCE_WINDOW_CENTERS_X.forEach((x, index) => {
            const window = normalizeToFloorPreserveXZ(this.models.pubWindow.scene.clone(true), `PubWindow_${index + 1}`);
            const frame = window.getObjectByName("WoodenWindowFrame");
            if (frame) {
                window.add(this.#makeWindowGlass(frame));
            }
            window.position.set(x, PUB_ENVIRONMENT.ENTRANCE_WINDOW_FLOOR_Y, depth / 2 - PUB_ENVIRONMENT.ENTRANCE_WINDOW_Z_INSET);
            window.rotation.y = 0;
            this.root.add(window);
            const leftWing = window.getObjectByName("WoodenWindowLeft");
            const rightWing = window.getObjectByName("WoodenWindowRight");
            this.windowLeftWing.push(leftWing);
            this.windowRightWing.push(rightWing);
            if (leftWing && rightWing) {
                this.windowOpenQuaternions[index] = {
                    left: leftWing.quaternion.clone(),
                    right: rightWing.quaternion.clone()
                };
                const leftEuler = leftWing.rotation.clone();
                const rightEuler = rightWing.rotation.clone();
                leftEuler.y = 0;
                rightEuler.y = 0;
                this.windowClosedQuaternions[index] = {
                    left: new THREE.Quaternion().setFromEuler(leftEuler),
                    right: new THREE.Quaternion().setFromEuler(rightEuler)
                };
            }
        });
    }
    #placePoolLight() {
        this.poolLight = normalizeToFloor(this.models.poolLight.scene.clone(true), "PoolLightVisual");
        const box = new THREE.Box3().setFromObject(this.poolLight);
        const size = new THREE.Vector3();
        box.getSize(size);
        this.poolLight.position.set(0, PUB_ENVIRONMENT.POOL_LIGHT_CENTER_Y - size.y / 2, PUB_ENVIRONMENT.MAIN_TABLE_Z);
        this.poolLight.rotation.y = Math.PI / 2;
        this.poolLight.traverse(child => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = true;
            }
        });
        this.root.add(this.poolLight);
        const bulbMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff0cf,
            emissive: 0xffc978,
            emissiveIntensity: 3.6,
            roughness: 0.28,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        for (const x of PUB_ENVIRONMENT.POOL_LIGHT_SHADE_CENTERS_X) {
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 12), bulbMaterial);
            bulb.name = "PoolLightBulb";
            bulb.position.set(x, PUB_ENVIRONMENT.POOL_LIGHT_BULB_LOCAL_Y, 0);
            bulb.castShadow = false;
            bulb.receiveShadow = false;
            this.poolLight.add(bulb);
        }
        this.poolLightAnchors = PUB_ENVIRONMENT.POOL_LIGHT_SHADE_CENTERS_X.map((x, index) => {
            const anchor = new THREE.Object3D();
            anchor.name = `PoolLightEmitter_${index + 1}`;
            anchor.position.set(x, PUB_ENVIRONMENT.POOL_LIGHT_EMITTER_LOCAL_Y, 0);
            this.poolLight.add(anchor);
            return anchor;
        });
    }
    #placeBar() {
        const counter = normalizeToFloor(this.models.pubCounter.scene.clone(true), "PubCounter");
        counter.rotation.y = Math.PI;
        counter.position.set(0, 0, PUB_ENVIRONMENT.BAR_COUNTER_Z);
        this.root.add(counter);
        const backBar = normalizeToFloor(this.models.backBar.scene.clone(true), "BackBar");
        backBar.scale.y = PUB_ENVIRONMENT.BACK_BAR_SCALE_Y;
        backBar.position.set(0, PUB_ENVIRONMENT.BACK_BAR_RAISE_Y, PUB_ENVIRONMENT.BACK_BAR_Z);
        this.root.add(backBar);
    }
    #furniturePrototype(name) {
        const source = this.models.furniture.scene.getObjectByName(name);
        if (!source) {
            throw new Error(`furniture.glb does not contain ${name}.`);
        }
        return normalizeToFloor(source.clone(true), `${name}_Prototype`);
    }
    #bottlePrototype(name, targetHeight) {
        const source = this.models.bottles.scene.getObjectByName(name);
        if (!source) {
            throw new Error(`bottles.glb does not contain ${name}.`);
        }
        const bottle = normalizeToFloor(source.clone(true), `Bottle_${name}`);
        const box = new THREE.Box3().setFromObject(bottle);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = targetHeight / Math.max(0.001, size.y);
        bottle.scale.setScalar(scale);
        return bottle;
    }
    #placeBarDecor() {
        const bottleNames = [
            "alcohol",
            "Object001",
            "Object002",
            "Object003",
            "Object004",
            "Object005",
            "Object006",
            "Object007",
            "Object008",
            "Object009",
            "Object010",
            "Object011",
            "Object012",
            "Object013",
            "Object014",
            "Object015",
            "Object016",
            "Object017",
            "Object018",
            "Object019",
            "Object020",
            "Object021",
            "Object022",
            "Object023"
        ];
        const xPositions = [
            -1.00,
            -0.715,
            -0.43,
            -0.145,
            0.145,
            0.43,
            0.715,
            1.00
        ];
        const heights = [
            0.24,
            0.27,
            0.29,
            0.25,
            0.28,
            0.26,
            0.30,
            0.265
        ];
        let sourceIndex = 0;
        PUB_ENVIRONMENT.BACK_BAR_SHELF_Y.forEach((shelfY, rowIndex) => {
            xPositions.forEach((x, columnIndex) => {
                const name = bottleNames[sourceIndex];
                sourceIndex += 1;
                const bottle = this.#bottlePrototype(name, heights[(columnIndex + rowIndex * 3) % heights.length]);
                bottle.position.set(x, shelfY - 0.006, PUB_ENVIRONMENT.BACK_BAR_BOTTLE_Z);
                bottle.rotation.y = ((columnIndex % 3) - 1) * 0.055;
                this.root.add(bottle);
            });
        });
        const whiskeySet = normalizeToFloor(this.models.whiskeySet.scene.clone(true), "WhiskeySet");
        whiskeySet.position.set(PUB_ENVIRONMENT.WHISKEY_SET_X, PUB_ENVIRONMENT.BAR_DECOR_Y, PUB_ENVIRONMENT.WHISKEY_SET_Z);
        whiskeySet.rotation.y = -0.18;
        this.root.add(whiskeySet);
        if (this.billiardsAssets) {
            const makeCounterProp = (name, label) => {
                const source = this.billiardsAssets.clonePrototype(name);
                source.position.set(0, 0, 0);
                source.scale.multiplyScalar(this.billiardsAssets.metrics.scale);
                return normalizeToFloor(source, label);
            };
            const rack = makeCounterProp("Rack", "DecorativeTriangleRack");
            rack.position.set(PUB_ENVIRONMENT.COUNTER_RACK_X, PUB_ENVIRONMENT.COUNTER_PROP_Y, PUB_ENVIRONMENT.COUNTER_RACK_Z);
            rack.rotation.y = 0.24;
            this.root.add(rack);
            const rubber = makeCounterProp("Rubber", "DecorativeCueRubber");
            rubber.position.set(PUB_ENVIRONMENT.COUNTER_RUBBER_X, PUB_ENVIRONMENT.COUNTER_PROP_Y, PUB_ENVIRONMENT.COUNTER_RUBBER_Z);
            rubber.rotation.y = -0.35;
            this.root.add(rubber);
        }
    }
    #placeJukebox() {
        const jukebox = normalizeToFloor(this.models.jukebox.scene.clone(true), "PubJukebox");
        jukebox.position.set(PUB_ENVIRONMENT.JUKEBOX_X, 0, PUB_ENVIRONMENT.JUKEBOX_Z);
        jukebox.rotation.y = Math.PI / 2;
        this.root.add(jukebox);
        const glow = new THREE.PointLight(0xff7550, 2.1, 1.25, 2.0);
        glow.name = "JukeboxLocalGlow";
        glow.position.set(PUB_ENVIRONMENT.JUKEBOX_X + 0.38, 0.92, PUB_ENVIRONMENT.JUKEBOX_Z);
        glow.castShadow = false;
        this.root.add(glow);
    }
    #placeWallDecor() {
        const scoreboard = normalizeToFloor(this.models.scoreboard.scene.clone(true), "PubScoreboard");
        scoreboard.position.set(-PUB_ENVIRONMENT.ROOM_WIDTH / 2 + 0.045, PUB_ENVIRONMENT.SCOREBOARD_BOTTOM_Y, PUB_ENVIRONMENT.SCOREBOARD_Z);
        scoreboard.rotation.y = Math.PI / 2;
        this.root.add(scoreboard);
        this.scoreboardObject = scoreboard;
        const clock = normalizeToFloor(this.models.wallClock.scene.clone(true), "PubWallClock");
        clock.position.set(PUB_ENVIRONMENT.ROOM_WIDTH / 2 - 0.028, PUB_ENVIRONMENT.WALL_CLOCK_BOTTOM_Y, PUB_ENVIRONMENT.WALL_CLOCK_Z);
        clock.rotation.y = -Math.PI / 2;
        this.root.add(clock);
    }
    #placeCueRack() {
        const group = new THREE.Group();
        group.name = "DecorativeCueRack";
        this.cueRackGroup = group;
        const wood = new THREE.MeshStandardMaterial({
            color: 0x5a311c,
            roughness: 0.62,
            metalness: 0
        });
        const wallX = PUB_ENVIRONMENT.ROOM_WIDTH / 2 - 0.055;
        for (const y of [
            0.96,
            2.15
        ]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 1.18), wood);
            bar.position.set(wallX, y, PUB_ENVIRONMENT.CUE_RACK_Z);
            bar.castShadow = true;
            bar.receiveShadow = true;
            group.add(bar);
        }
        const cueZ = [
            -0.46,
            -0.275,
            -0.09,
            0.09,
            0.275,
            0.46
        ];
        this.wallCueAnchors = [];
        this.wallCueInitial = [];
        cueZ.forEach((offset, index) => {
            const anchor = new THREE.Group();
            anchor.name = `WallCue_${index + 1}`;
            const cue = this.billiardsAssets?.clonePrototype("Cue");
            if (!cue) {
                return;
            }
            cue.position.set(0, 0, 0);
            cue.quaternion.identity();
            cue.scale.multiplyScalar(this.billiardsAssets.metrics.scale);
            cue.rotation.z = -Math.PI / 2;
            anchor.position.set(wallX - 0.075, 2.22, PUB_ENVIRONMENT.CUE_RACK_Z + offset);
            anchor.add(cue);
            group.add(anchor);
            this.wallCueAnchors.push(anchor);
            this.wallCueInitial.push({
                position: anchor.position.clone(),
                quaternion: anchor.quaternion.clone(),
                scale: anchor.scale.clone()
            });
            if (index === 4) {
                this.introCueAnchor = anchor;
            }
        });
        this.root.add(group);
        if (this.introCueAnchor) {
            this.introCueAnchor.updateWorldMatrix(true, true);
            this.introCueInitial = {
                position: this.introCueAnchor.position.clone(),
                quaternion: this.introCueAnchor.quaternion.clone(),
                scale: this.introCueAnchor.scale.clone()
            };
            this.introCueFallen = {
                position: new THREE.Vector3(wallX - 0.62, 0.035, PUB_ENVIRONMENT.CUE_RACK_Z + 0.58),
                quaternion: (() => {
                    const oldFallenAnchor = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0.10, -0.08, "XYZ"));
                    const tipUpCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
                    return oldFallenAnchor.multiply(tipUpCorrection);
                })()
            };
        }
    }
    #placeWallAccentLights() {
        const brass = new THREE.MeshStandardMaterial({
            color: 0x7a5428,
            roughness: 0.44,
            metalness: 0.58
        });
        const glowMaterial = new THREE.MeshStandardMaterial({
            color: 0xffe5b2,
            emissive: 0xffb85a,
            emissiveIntensity: 2.6,
            roughness: 0.28,
            metalness: 0
        });
        const addWallLight = ({ name, wallX, y, z, targetY, side }) => {
            const inward = side === "left" ? 1 : -1;
            const group = new THREE.Group();
            group.name = name;
            const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.12, 0.18), brass);
            backplate.position.set(wallX + inward * 0.020, y, z);
            backplate.castShadow = true;
            group.add(backplate);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.022), brass);
            arm.position.set(wallX + inward * 0.08, y, z);
            arm.castShadow = true;
            group.add(arm);
            const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.76, 18), brass);
            shade.rotation.x = Math.PI / 2;
            shade.position.set(wallX + inward * 0.16, y - 0.02, z);
            shade.castShadow = true;
            group.add(shade);
            const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.64, 18), glowMaterial);
            bulb.rotation.x = Math.PI / 2;
            bulb.position.set(wallX + inward * 0.16, y - 0.06, z);
            group.add(bulb);
            const areaLight = new THREE.RectAreaLight(0xffd3a0, 12.0, 0.72, 0.085);
            areaLight.name = `${name}_AreaLight`;
            areaLight.position.set(wallX + inward * 0.19, y - 0.075, z);
            areaLight.lookAt(wallX, targetY, z);
            group.add(areaLight);
            this.root.add(group);
        };
        addWallLight({
            name: "ScoreboardPictureLight",
            wallX: -PUB_ENVIRONMENT.ROOM_WIDTH / 2,
            y: PUB_ENVIRONMENT.SCOREBOARD_LIGHT_Y,
            z: PUB_ENVIRONMENT.SCOREBOARD_Z,
            targetY: 1.42,
            side: "left"
        });
        addWallLight({
            name: "CueRackPictureLight",
            wallX: PUB_ENVIRONMENT.ROOM_WIDTH / 2,
            y: PUB_ENVIRONMENT.CUE_RACK_LIGHT_Y,
            z: PUB_ENVIRONMENT.CUE_RACK_Z,
            targetY: 1.46,
            side: "right"
        });
    }
    #placeFurniture() {
        const table = this.#furniturePrototype("PubTable01");
        const chair = this.#furniturePrototype("PubChair");
        const addDoubleTableCluster = ({ name, centerX, centerZ, axis }) => {
            const group = new THREE.Group();
            group.name = name;
            const separation = PUB_ENVIRONMENT.DINING_TABLE_SEPARATION;
            const chairOffset = PUB_ENVIRONMENT.DINING_CHAIR_OFFSET;
            const alongZ = axis === "z";
            for (const sign of [-1, 1]) {
                const diningTable = table.clone(true);
                diningTable.position.set(centerX + (alongZ ? 0 : sign * separation / 2), 0, centerZ + (alongZ ? sign * separation / 2 : 0));
                if (!alongZ) {
                    diningTable.rotation.y = Math.PI / 2;
                }
                group.add(diningTable);
            }
            for (const alongSign of [-1, 1]) {
                for (const sideSign of [-1, 1]) {
                    const seat = chair.clone(true);
                    if (alongZ) {
                        seat.position.set(centerX + sideSign * chairOffset, 0, centerZ + alongSign * separation / 2);
                        seat.rotation.y = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
                    }
                    else {
                        seat.position.set(centerX + alongSign * separation / 2, 0, centerZ + sideSign * chairOffset);
                        seat.rotation.y = sideSign > 0 ? 0 : Math.PI;
                    }
                    group.add(seat);
                }
            }
            this.root.add(group);
        };
        const addTwoSeatNook = ({ name, centerX, centerZ }) => {
            const group = new THREE.Group();
            group.name = name;
            const diningTable = table.clone(true);
            diningTable.rotation.y = Math.PI / 2;
            diningTable.position.set(centerX, 0, centerZ);
            group.add(diningTable);
            for (const sideSign of [-1, 1]) {
                const seat = chair.clone(true);
                seat.position.set(centerX + sideSign * PUB_ENVIRONMENT.DINING_CHAIR_OFFSET * 0.88, 0, centerZ);
                seat.rotation.y = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
                group.add(seat);
            }
            this.root.add(group);
        };
        addDoubleTableCluster({
            name: "DiningCluster_Jukebox",
            centerX: PUB_ENVIRONMENT.LEFT_DINING_X,
            centerZ: PUB_ENVIRONMENT.LEFT_DINING_Z,
            axis: "z"
        });
        addDoubleTableCluster({
            name: "DiningCluster_Clock",
            centerX: PUB_ENVIRONMENT.RIGHT_DINING_X,
            centerZ: PUB_ENVIRONMENT.RIGHT_DINING_Z,
            axis: "x"
        });
        addTwoSeatNook({
            name: "DiningNook_LeftWindow",
            centerX: PUB_ENVIRONMENT.LEFT_WINDOW_NOOK_X,
            centerZ: PUB_ENVIRONMENT.LEFT_WINDOW_NOOK_Z
        });
    }
    #placeBarrels() {
        const barrel = normalizeToFloor(this.models.barrel.scene.clone(true), "PubBarrelPrototype");
        const left = barrel.clone(true);
        left.position.set(-3.20, 0, -4.32);
        this.root.add(left);
        const right = barrel.clone(true);
        right.position.set(3.18, 0, -4.28);
        right.rotation.y = 0.42;
        this.root.add(right);
    }
}

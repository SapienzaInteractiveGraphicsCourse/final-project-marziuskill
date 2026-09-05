//Centralizes Web Audio playback, buses, spatial emitters and long-running audio state.

//AUDIO REGISTRY
const AudioContextCtor = window.AudioContext;
const RUNTIME = `${import.meta.env.BASE_URL}audio/runtime`;
export const AUDIO_ASSETS = Object.freeze({
    cueStrike: {
        url: `${RUNTIME}/billiards/cue_strike_02.ogg`,
        duration: 0.295,
        bus: "game"
    },
    ballContact: {
        url: `${RUNTIME}/billiards/ball_contact_01.ogg`,
        duration: 0.205,
        bus: "game",
        maxVoices: 14
    },
    railHit: {
        url: `${RUNTIME}/billiards/rail_hit_01.ogg`,
        duration: 0.260,
        bus: "game",
        maxVoices: 10
    },
    cueRackTouch: {
        url: `${RUNTIME}/billiards/cue_rack_touch_01.ogg`,
        duration: 0.2656,
        bus: "game"
    },
    pocketMagic: {
        url: `${RUNTIME}/vfx/pocket_magic_01.ogg`,
        duration: 0.865,
        bus: "game",
        maxVoices: 6
    },
    killCueAppear: {
        url: `${RUNTIME}/vfx/kill_cue_appear_01.ogg`,
        duration: 2.030,
        bus: "game"
    },
    killCueDisappear: {
        url: `${RUNTIME}/vfx/kill_cue_disappear_01.ogg`,
        duration: 2.030,
        bus: "game"
    },
    triangleAppear: {
        url: `${RUNTIME}/vfx/triangle_appear_01.ogg`,
        duration: 0.780,
        bus: "game"
    },
    triangleDisappear: {
        url: `${RUNTIME}/vfx/triangle_disappear_01.ogg`,
        duration: 0.720,
        bus: "game"
    },
    prismLoop: {
        url: `${RUNTIME}/vfx/prism_loop_01.ogg`,
        duration: 9.1565,
        bus: "game"
    },
    windowOpen: {
        url: `${RUNTIME}/environment/window_open_01.ogg`,
        duration: 1.565,
        bus: "game"
    },
    windowClose: {
        url: `${RUNTIME}/environment/window_close_01.ogg`,
        duration: 1.750,
        bus: "game"
    },
    doorOpen: {
        url: `${RUNTIME}/environment/door_open_01.ogg`,
        duration: 0.919,
        bus: "game"
    },
    doorClose: {
        url: `${RUNTIME}/environment/door_close_01.ogg`,
        duration: 0.675,
        bus: "game"
    },
    chalkLong: {
        url: `${RUNTIME}/environment/chalk_long_03.ogg`,
        duration: 0.975,
        bus: "game",
        maxVoices: 2
    },
    chalkMedium: {
        url: `${RUNTIME}/environment/chalk_medium_01.ogg`,
        duration: 0.495,
        bus: "game",
        maxVoices: 2
    },
    chalkShort: {
        url: `${RUNTIME}/environment/chalk_short_02.ogg`,
        duration: 0.250,
        bus: "game",
        maxVoices: 2
    },
    cueFall: {
        url: `${RUNTIME}/environment/cue_fall_01.ogg`,
        duration: 0.975,
        markers: {
            impact: 0.114
        },
        bus: "game"
    },
    playerFootstep: {
        url: `${RUNTIME}/environment/footstep_wood_02.ogg`,
        duration: 0.2516,
        bus: "game",
        maxVoices: 3
    },
    jukeboxStop: {
        url: `${RUNTIME}/environment/jukebox_stop_01.ogg`,
        duration: 0.480,
        bus: "game"
    },
    pubFootstep01: {
        url: `${RUNTIME}/environment/pub_footstep_01.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep02: {
        url: `${RUNTIME}/environment/pub_footstep_02.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep03: {
        url: `${RUNTIME}/environment/pub_footstep_03.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep04: {
        url: `${RUNTIME}/environment/pub_footstep_04.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep05: {
        url: `${RUNTIME}/environment/pub_footstep_05.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep06: {
        url: `${RUNTIME}/environment/pub_footstep_06.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep07: {
        url: `${RUNTIME}/environment/pub_footstep_07.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    pubFootstep08: {
        url: `${RUNTIME}/environment/pub_footstep_08.ogg`,
        duration: 0.670,
        bus: "game",
        maxVoices: 4
    },
    cutsceneGhostBed: {
        url: `${RUNTIME}/cinematic/cutscene_ghost_bed_02.ogg`,
        duration: 24.9633,
        bus: "cinematic"
    },
    defeatCueFinale: {
        url: `${RUNTIME}/cinematic/defeat_cues_ghost_01.ogg`,
        duration: 3.5418,
        bus: "cinematic"
    },
    jukeboxMusic: {
        url: `${RUNTIME}/music/jukebox_moil.mp3`,
        duration: 185.2347,
        bus: "music"
    },
    uiHover: {
        url: `${RUNTIME}/ui/ui_hover_01.ogg`,
        bus: "ui"
    },
    uiConfirm: {
        url: `${RUNTIME}/ui/ui_confirm_01.ogg`,
        bus: "ui"
    },
    uiBack: {
        url: `${RUNTIME}/ui/ui_back_01.ogg`,
        bus: "ui"
    }
});
const PUB_FOOTSTEPS = Object.freeze([
    "pubFootstep01",
    "pubFootstep02",
    "pubFootstep03",
    "pubFootstep04",
    "pubFootstep05",
    "pubFootstep06",
    "pubFootstep07",
    "pubFootstep08"
]);

//HELPERS
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
function randomRange(min, max) {
    return min + Math.random() * (max - min);
}
function setParam(param, value, time) {
    if (!param) {
        return;
    }
    if (typeof param.setValueAtTime === "function") {
        param.setValueAtTime(value, time);
    }
    else {
        param.value = value;
    }
}

//AUDIO MANAGER
export class AudioManager {

    //INITIALIZATION
    constructor() {
        this.supported = Boolean(AudioContextCtor);
        this.gameContext = this.supported ? new AudioContextCtor() : null;
        this.uiContext = this.supported ? new AudioContextCtor() : null;
        this.gameBuffers = new Map();
        this.uiBuffers = new Map();
        this.loadingPromise = null;
        this.failedAssets = new Set();
        this.gameMaster = this.gameContext?.createGain?.() ?? null;
        this.gameSfxBus = this.gameContext?.createGain?.() ?? null;
        this.musicBus = this.gameContext?.createGain?.() ?? null;
        this.cinematicBus = this.gameContext?.createGain?.() ?? null;
        if (this.gameContext) {
            this.gameMaster.gain.value = 0.92;
            this.gameSfxBus.gain.value = 1.0;
            this.musicBus.gain.value = 0.30;
            this.cinematicBus.gain.value = 0.34;
            this.gameSfxBus.connect(this.gameMaster);
            this.musicBus.connect(this.gameMaster);
            this.cinematicBus.connect(this.gameMaster);
            this.gameMaster.connect(this.gameContext.destination);
        }
        this.uiMaster = this.uiContext?.createGain?.() ?? null;
        if (this.uiMaster && this.uiContext) {
            this.uiMaster.gain.value = 0.42;
            this.uiMaster.connect(this.uiContext.destination);
        }
        this.voices = new Map();
        this.cooldowns = new Map();
        this.loops = new Map();
        this.lastPubFootstepIndex = -1;
        this.gamePaused = false;
        this.unlockInstalled = false;
        this._unlockFromGesture = () => {
            this.unlock();
        };
        this.#installUnlockListeners();
    }
    #installUnlockListeners() {
        if (!this.supported || this.unlockInstalled) {
            return;
        }
        this.unlockInstalled = true;
        window.addEventListener("pointerdown", this._unlockFromGesture, {
            capture: true,
            passive: true
        });
        window.addEventListener("keydown", this._unlockFromGesture, {
            capture: true,
            passive: true
        });
        window.addEventListener("touchstart", this._unlockFromGesture, {
            capture: true,
            passive: true
        });
    }

    //AUDIO CONTEXT
    async unlock() {
        if (!this.supported) {
            return false;
        }
        const resumes = [];
        if (this.uiContext?.state === "suspended") {
            resumes.push(this.uiContext.resume());
        }
        if (!this.gamePaused && this.gameContext?.state === "suspended") {
            resumes.push(this.gameContext.resume());
        }
        try {
            await Promise.allSettled(resumes);
            return true;
        }
        catch {
            return false;
        }
    }
    preload() {
        if (!this.supported) {
            return Promise.resolve(false);
        }
        if (this.loadingPromise) {
            return this.loadingPromise;
        }
        this.loadingPromise = Promise.all(Object.entries(AUDIO_ASSETS).map(async ([name, descriptor]) => {
            try {
                const response = await fetch(descriptor.url);
                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }
                const bytes = await response.arrayBuffer();
                const context = descriptor.bus === "ui" ? this.uiContext : this.gameContext;
                const buffer = await context.decodeAudioData(bytes.slice(0));
                if (descriptor.bus === "ui") {
                    this.uiBuffers.set(name, buffer);
                }
                else {
                    this.gameBuffers.set(name, buffer);
                }
            }
            catch (error) {
                this.failedAssets.add(name);
                console.warn(`[AUDIO] Could not load ${name}:`, error);
            }
        })).then(() => this.failedAssets.size === 0);
        return this.loadingPromise;
    }
    getDuration(name) {
        return (this.gameBuffers.get(name)?.duration ?? this.uiBuffers.get(name)?.duration ?? AUDIO_ASSETS[name]?.duration ?? 0);
    }
    getMarker(name, marker, fallback = 0) {
        const value = AUDIO_ASSETS[name]?.markers?.[marker];
        return Number.isFinite(value) ? value : fallback;
    }
    #busFor(name, context) {
        const descriptor = AUDIO_ASSETS[name];
        if (context === this.uiContext || descriptor?.bus === "ui") {
            return this.uiMaster;
        }
        if (descriptor?.bus === "music") {
            return this.musicBus;
        }
        if (descriptor?.bus === "cinematic") {
            return this.cinematicBus;
        }
        return this.gameSfxBus;
    }
    #makePanner(context, position, options = {}) {
        if (!position || !context?.createPanner) {
            return null;
        }
        const panner = context.createPanner();
        panner.panningModel = options.panningModel ?? "HRTF";
        panner.distanceModel = options.distanceModel ?? "inverse";
        panner.refDistance = options.refDistance ?? 0.85;
        panner.maxDistance = options.maxDistance ?? 12.0;
        panner.rolloffFactor = options.rolloffFactor ?? 1.15;
        this.#setPannerPosition(panner, position, context.currentTime);
        return panner;
    }
    #setPannerPosition(panner, position, time) {
        const x = Number(position?.x ?? 0);
        const y = Number(position?.y ?? 0);
        const z = Number(position?.z ?? 0);
        if (panner.positionX) {
            setParam(panner.positionX, x, time);
            setParam(panner.positionY, y, time);
            setParam(panner.positionZ, z, time);
        }
        else {
            panner.setPosition?.(x, y, z);
        }
    }
    #registerVoice(name, handle, maxVoices) {
        const voices = this.voices.get(name) ?? [];
        while (voices.length >= maxVoices) {
            const oldest = voices.shift();
            try {
                oldest?.source?.stop?.();
            }
            catch {
            }
        }
        voices.push(handle);
        this.voices.set(name, voices);
    }
    #unregisterVoice(name, handle) {
        const voices = this.voices.get(name);
        if (!voices) {
            return;
        }
        const index = voices.indexOf(handle);
        if (index >= 0) {
            voices.splice(index, 1);
        }
        if (voices.length === 0) {
            this.voices.delete(name);
        }
    }

    //ONE SHOTS
    play(name, { gain = 1, rate = 1, position = null, refDistance = null, maxDistance = null, rolloffFactor = null, cooldownKey = null, cooldown = 0, loop = false, loopKey = null, fadeIn = 0, offset = 0 } = {}) {
        const descriptor = AUDIO_ASSETS[name];
        if (!descriptor || !this.supported) {
            return null;
        }
        const isUi = descriptor.bus === "ui";
        const context = isUi ? this.uiContext : this.gameContext;
        const buffer = isUi ? this.uiBuffers.get(name) : this.gameBuffers.get(name);
        if (!context || !buffer) {
            return null;
        }
        if (cooldownKey && cooldown > 0) {
            const key = `${name}:${cooldownKey}`;
            const nextAllowed = this.cooldowns.get(key) ?? 0;
            if (context.currentTime < nextAllowed) {
                return null;
            }
            this.cooldowns.set(key, context.currentTime + cooldown);
        }
        if (loop && loopKey && this.loops.has(loopKey)) {
            return this.loops.get(loopKey);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = Math.max(0.05, Number(rate) || 1);
        const voiceGain = context.createGain();
        const finalGain = Math.max(0, Number(gain) || 0);
        voiceGain.gain.setValueAtTime(fadeIn > 0 ? 0 : finalGain, context.currentTime);
        if (fadeIn > 0) {
            voiceGain.gain.linearRampToValueAtTime(finalGain, context.currentTime + fadeIn);
        }
        const panner = this.#makePanner(context, position, {
            refDistance: refDistance ?? undefined,
            maxDistance: maxDistance ?? undefined,
            rolloffFactor: rolloffFactor ?? undefined
        });
        source.connect(voiceGain);
        if (panner) {
            voiceGain.connect(panner);
            panner.connect(this.#busFor(name, context));
        }
        else {
            voiceGain.connect(this.#busFor(name, context));
        }
        const handle = {
            name,
            source,
            gainNode: voiceGain,
            panner,
            context,
            stopped: false,
            loopKey,
            setPosition: nextPosition => {
                if (panner && nextPosition) {
                    this.#setPannerPosition(panner, nextPosition, context.currentTime);
                }
            },
            stop: ({ fadeOut = 0 } = {}) => {
                if (handle.stopped) {
                    return;
                }
                handle.stopped = true;
                const now = context.currentTime;
                if (fadeOut > 0) {
                    voiceGain.gain.cancelScheduledValues(now);
                    voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
                    voiceGain.gain.linearRampToValueAtTime(0, now + fadeOut);
                    try {
                        source.stop(now + fadeOut + 0.01);
                    }
                    catch {
                    }
                }
                else {
                    try {
                        source.stop(now);
                    }
                    catch {
                    }
                }
            }
        };
        const maxVoices = descriptor.maxVoices ?? (loop ? 1 : 8);
        this.#registerVoice(name, handle, maxVoices);
        source.onended = () => {
            this.#unregisterVoice(name, handle);
            if (loopKey && this.loops.get(loopKey) === handle) {
                this.loops.delete(loopKey);
            }
        };
        if (loopKey) {
            this.loops.set(loopKey, handle);
        }
        try {
            source.start(0, Math.max(0, offset));
        }
        catch (error) {
            console.warn(`[AUDIO] Could not start ${name}:`, error);
            return null;
        }
        return handle;
    }
    //Fit authored effects to the animation duration without changing the visual timing.
    playFitted(name, targetDuration, options = {}) {
        const sourceDuration = this.getDuration(name);
        const duration = Math.max(0.02, Number(targetDuration) || sourceDuration);
        const rate = sourceDuration > 0 ? sourceDuration / duration : 1;
        return this.play(name, {
            ...options,
            rate
        });
    }
    playUiHover() {
        this.unlock();
        return this.play("uiHover", { gain: 0.70, cooldownKey: "hover", cooldown: 0.035 });
    }
    playUiConfirm() {
        this.unlock();
        return this.play("uiConfirm", { gain: 0.86 });
    }
    playUiBack() {
        this.unlock();
        return this.play("uiBack", { gain: 0.82 });
    }
    playPlayerFootstep({ gain = 0.34 } = {}) {
        return this.play("playerFootstep", {
            gain: gain * randomRange(0.92, 1.06),
            rate: randomRange(0.97, 1.03),
            cooldownKey: "player-walking",
            cooldown: 0.16
        });
    }
    playPubFootstep({ gain = 0.46 } = {}) {
        let index = Math.floor(Math.random() * PUB_FOOTSTEPS.length);
        if (PUB_FOOTSTEPS.length > 1 && index === this.lastPubFootstepIndex) {
            index = (index + 1 + Math.floor(Math.random() * (PUB_FOOTSTEPS.length - 1))) % PUB_FOOTSTEPS.length;
        }
        this.lastPubFootstepIndex = index;
        return this.play(PUB_FOOTSTEPS[index], {
            gain: gain * randomRange(0.90, 1.08),
            rate: randomRange(0.975, 1.025),
            cooldownKey: "walking",
            cooldown: 0.20
        });
    }

    //LOOPS AND MUSIC
    startPrism(position, { fadeIn = 0.20 } = {}) {
        return this.play("prismLoop", {
            loop: true,
            loopKey: "prism",
            position,
            gain: 0.40,
            refDistance: 0.70,
            maxDistance: 10,
            rolloffFactor: 1.15,
            fadeIn
        });
    }
    stopPrism({ fadeOut = 0.20 } = {}) {
        this.loops.get("prism")?.stop({ fadeOut });
    }
    startCutsceneBed({ fadeIn = 0.65 } = {}) {
        const current = this.loops.get("cutscene-bed");
        if (current) {
            return current;
        }
        return this.play("cutsceneGhostBed", {
            loop: true,
            loopKey: "cutscene-bed",
            gain: 0.20,
            fadeIn
        });
    }
    stopCutsceneBed({ fadeOut = 0.75 } = {}) {
        this.loops.get("cutscene-bed")?.stop({ fadeOut });
    }
    startDefeatCueFinale({ fadeIn = 0.08 } = {}) {
        this.loops.get("defeat-cue-finale")?.stop({ fadeOut: 0 });
        return this.play("defeatCueFinale", {
            loop: false,
            loopKey: "defeat-cue-finale",
            gain: 0.72,
            fadeIn
        });
    }
    stopDefeatCueFinale({ fadeOut = 0.08 } = {}) {
        this.loops.get("defeat-cue-finale")?.stop({ fadeOut });
    }
    startJukebox(position, { fadeIn = 1.0 } = {}) {
        const current = this.loops.get("jukebox");
        if (current) {
            current.setPosition(position);
            return current;
        }
        return this.play("jukeboxMusic", {
            loop: true,
            loopKey: "jukebox",
            position,
            gain: 0.88,
            refDistance: 1.15,
            maxDistance: 12.5,
            rolloffFactor: 1.05,
            fadeIn
        });
    }
    stopJukebox({ fadeOut = 0.5 } = {}) {
        this.loops.get("jukebox")?.stop({ fadeOut });
    }
    //Stop the music first so the vinyl scratch reads as an intentional cinematic interruption.
    stopJukeboxAbrupt(position) {
        const handle = this.loops.get("jukebox");
        if (!handle) {
            return;
        }
        handle.stop({ fadeOut: 0 });
        this.play("jukeboxStop", {
            position,
            gain: 0.80,
            refDistance: 1.05,
            maxDistance: 12,
            rolloffFactor: 1.0
        });
    }

    //RUNTIME CONTROL
    setGamePaused(active) {
        this.gamePaused = Boolean(active);
        if (!this.gameContext) {
            return;
        }
        if (this.gamePaused) {
            if (this.gameContext.state === "running") {
                this.gameContext.suspend().catch(() => { });
            }
        }
        else {
            this.unlock();
        }
    }

    //SPATIAL AUDIO
    updateListener(camera) {
        const context = this.gameContext;
        const listener = context?.listener;
        if (!listener || !camera) {
            return;
        }
        camera.updateMatrixWorld?.(true);
        const elements = camera.matrixWorld?.elements;
        if (!elements) {
            return;
        }
        const position = {
            x: elements[12],
            y: elements[13],
            z: elements[14]
        };
        const forward = {
            x: -elements[8],
            y: -elements[9],
            z: -elements[10]
        };
        const up = {
            x: elements[4],
            y: elements[5],
            z: elements[6]
        };
        const time = context.currentTime;
        if (listener.positionX) {
            setParam(listener.positionX, position.x, time);
            setParam(listener.positionY, position.y, time);
            setParam(listener.positionZ, position.z, time);
            setParam(listener.forwardX, forward.x, time);
            setParam(listener.forwardY, forward.y, time);
            setParam(listener.forwardZ, forward.z, time);
            setParam(listener.upX, up.x, time);
            setParam(listener.upY, up.y, time);
            setParam(listener.upZ, up.z, time);
        }
        else {
            listener.setPosition?.(position.x, position.y, position.z);
            listener.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
    }
    dispose() {
        window.removeEventListener("pointerdown", this._unlockFromGesture, true);
        window.removeEventListener("keydown", this._unlockFromGesture, true);
        window.removeEventListener("touchstart", this._unlockFromGesture, true);
        for (const handle of this.loops.values()) {
            handle.stop({ fadeOut: 0 });
        }
        this.loops.clear();
        this.gameContext?.close?.().catch?.(() => { });
        this.uiContext?.close?.().catch?.(() => { });
    }
}

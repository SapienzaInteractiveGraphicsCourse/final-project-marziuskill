//Draws gameplay state and cinematic messages onto the existing chalkboard texture.

//DEPENDENCIES
import * as THREE from "three";

//DRAW HELPERS
function groupForNumber(number) {
    if (number >= 1 && number <= 7) {
        return "SOLIDS";
    }
    if (number >= 9 && number <= 15) {
        return "STRIPES";
    }
    return null;
}
function chalkLine(context, x1, y1, x2, y2, width = 7) {
    context.save();
    context.lineCap = "round";
    context.strokeStyle = "rgba(242, 240, 220, 0.92)";
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.20)";
    context.lineWidth = Math.max(1, width * 0.35);
    context.beginPath();
    context.moveTo(x1 + 2, y1 - 1);
    context.lineTo(x2 + 1, y2 + 1);
    context.stroke();
    context.restore();
}
function drawTallies(context, count, xMin, xMax, yStart) {
    const groupWidth = 94;
    const groupGap = 22;
    const rowGap = 86;
    const maxGroupsPerRow = Math.max(1, Math.floor((xMax - xMin) / (groupWidth + groupGap)));
    let remaining = Math.max(0, Math.floor(count));
    let groupIndex = 0;
    while (remaining > 0) {
        const marks = Math.min(5, remaining);
        const column = groupIndex % maxGroupsPerRow;
        const row = Math.floor(groupIndex / maxGroupsPerRow);
        const x = xMin + column * (groupWidth + groupGap);
        const y = yStart + row * rowGap;
        for (let i = 0; i < Math.min(4, marks); i += 1) {
            const mx = x + i * 20;
            chalkLine(context, mx, y, mx - 3, y + 56, 7);
        }
        if (marks === 5) {
            chalkLine(context, x - 8, y + 46, x + 67, y + 7, 8);
        }
        remaining -= marks;
        groupIndex += 1;
    }
}
function chalkText(context, text, x, y, { size = 72, weight = 700, alpha = 0.94 } = {}) {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${weight} ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
    const passes = [
        [0, 0, alpha],
        [1.2, -0.7, alpha * 0.20],
        [-1.0, 0.8, alpha * 0.16],
        [0.4, 1.1, alpha * 0.12]
    ];
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = Math.max(1.2, size * 0.025);
    for (const [dx, dy, passAlpha] of passes) {
        context.strokeStyle = `rgba(245,242,218,${Math.min(1, passAlpha * 0.72)})`;
        context.fillStyle = `rgba(245,242,218,${Math.min(1, passAlpha)})`;
        context.strokeText(text, x + dx, y + dy);
        context.fillText(text, x + dx, y + dy);
    }
    context.restore();
}

//SCOREBOARD
export class ScoreboardSystem {

    //INITIALIZATION
    constructor({ scene, scoreboardObject, introWriteTimings = null }) {
        this.scene = scene;
        this.scoreboardObject = scoreboardObject;
        this.canvas = document.createElement("canvas");
        this.canvas.width = 1024;
        this.canvas.height = 640;
        this.context = this.canvas.getContext("2d");
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 4;
        this.display = this.#buildDisplay();
        this.scene.add(this.display);
        this.mode = "VS_BOT";
        this.lastSignature = null;
        this.introProgress = 0;
        this.cinematicMessage = null;
        this.introWriteTimings = {
            line: Math.max(0.05, introWriteTimings?.line ?? 0.250),
            left: Math.max(0.05, introWriteTimings?.left ?? 0.975),
            right: Math.max(0.05, introWriteTimings?.right ?? 0.975)
        };
        this.drawIntro(0);
    }

    //CANVAS SETUP
    #buildDisplay() {
        this.scoreboardObject.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(this.scoreboardObject);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const width = Math.max(0.5, size.z * 0.78);
        const height = Math.max(0.35, size.y * 0.72);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        }));
        mesh.name = "DiegeticScoreboardCanvas";
        mesh.position.set(box.max.x + 0.012, center.y, center.z);
        mesh.rotation.y = Math.PI / 2;
        mesh.renderOrder = 5;
        return mesh;
    }

    //GAMEPLAY DISPLAY
    setMode(mode) {
        this.mode = mode;
        this.lastSignature = null;
    }
    drawIntro(progress) {
        this.introProgress = THREE.MathUtils.clamp(progress, 0, 1);
        this.#clear();
        const ctx = this.context;
        const centerX = 512;
        const totalWriteDuration = this.introWriteTimings.line + this.introWriteTimings.left + this.introWriteTimings.right;
        const lineEnd = this.introWriteTimings.line / totalWriteDuration;
        const leftEnd = (this.introWriteTimings.line + this.introWriteTimings.left) / totalWriteDuration;
        const lineProgress = THREE.MathUtils.smoothstep(this.introProgress, 0, lineEnd);
        chalkLine(ctx, centerX, 88, centerX, 88 + 480 * lineProgress, 8);
        const leftProgress = THREE.MathUtils.smoothstep(this.introProgress, lineEnd, leftEnd);
        const rightProgress = THREE.MathUtils.smoothstep(this.introProgress, leftEnd, 1);
        this.#drawHeadingReveal("MARZIUS", 258, 120, leftProgress);
        this.#drawHeadingReveal("KILL", 766, 120, rightProgress);
        this.texture.needsUpdate = true;
    }
    //Gameplay updates are ignored while a cinematic message owns the same physical scoreboard canvas.
    sync({ ruleState, soloState = null }) {
        if (!ruleState || this.cinematicMessage) {
            return;
        }
        const signature = JSON.stringify({
            mode: this.mode,
            state: ruleState.tableState,
            players: ruleState.players?.map(player => ({
                group: player.group,
                remaining: player.remaining
            })),
            removed: ruleState.lastRuling?.pocketedNumbers ?? [],
            solo: soloState
        });
        if (signature === this.lastSignature) {
            return;
        }
        this.lastSignature = signature;
        this.#clear();
        const ctx = this.context;
        chalkLine(ctx, 512, 82, 512, 570, 8);
        this.#drawHeading("MARZIUS", 258, 120);
        this.#drawHeading("KILL", 766, 120);
        if (this.mode === "SOLO") {
            this.#drawSmallLabel("BALLS LEFT", 258, 182);
            this.#drawSmallLabel(`MOVES / ${soloState?.moveLimit ?? "—"}`, 766, 182);
            const player = ruleState.players?.[0];
            const remaining = player?.group ? player.remaining?.length ?? 0 : 0;
            if (player?.group) {
                drawTallies(ctx, remaining, 85, 455, 235);
            }
            else {
                this.#drawMuted("GROUP OPEN", 258, 280);
            }
            drawTallies(ctx, soloState?.movesUsed ?? 0, 575, 950, 235);
        }
        else {
            const players = ruleState.players ?? [];
            const marzius = players[0];
            const kill = players[1];
            const marziusPocketed = marzius?.group ? 7 - (marzius.remaining?.length ?? 7) : 0;
            const killPocketed = kill?.group ? 7 - (kill.remaining?.length ?? 7) : 0;
            if (marzius?.group || kill?.group) {
                this.#drawSmallLabel(marzius?.group ?? "OPEN", 258, 182);
                this.#drawSmallLabel(kill?.group ?? "OPEN", 766, 182);
            }
            else {
                this.#drawSmallLabel("OPEN TABLE", 258, 182);
                this.#drawSmallLabel("OPEN TABLE", 766, 182);
            }
            drawTallies(ctx, marziusPocketed, 85, 455, 235);
            drawTallies(ctx, killPocketed, 575, 950, 235);
        }
        this.texture.needsUpdate = true;
    }

    //CINEMATIC MESSAGE
    showCinematicMessage(text, { opacity = 1, reveal = 1, maxWidthRatio = 0.82, maxFontSize = 92, minFontSize = 40 } = {}) {
        this.cinematicMessage = {
            text: String(text ?? ""),
            opacity: THREE.MathUtils.clamp(opacity, 0, 1),
            reveal: THREE.MathUtils.clamp(reveal, 0, 1),
            maxWidthRatio: THREE.MathUtils.clamp(maxWidthRatio, 0.48, 0.92),
            maxFontSize,
            minFontSize
        };
        this.#drawCinematicMessage();
    }
    setCinematicMessageOpacity(opacity) {
        if (!this.cinematicMessage) {
            return;
        }
        this.cinematicMessage.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
        this.#drawCinematicMessage();
    }
    setCinematicMessageReveal(reveal) {
        if (!this.cinematicMessage) {
            return;
        }
        this.cinematicMessage.reveal = THREE.MathUtils.clamp(reveal, 0, 1);
        this.#drawCinematicMessage();
    }
    clearCinematicMessage() {
        if (!this.cinematicMessage) {
            return;
        }
        this.cinematicMessage = null;
        this.lastSignature = null;
        this.#clear();
        this.texture.needsUpdate = true;
    }

    //CINEMATIC DRAWING
    #drawCinematicMessage() {
        if (!this.cinematicMessage) {
            return;
        }
        const { text, opacity, reveal, maxWidthRatio, maxFontSize, minFontSize } = this.cinematicMessage;
        this.#clear();
        const ctx = this.context;
        const lines = text.split(/\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length === 0) {
            this.texture.needsUpdate = true;
            return;
        }
        let fontSize = maxFontSize;
        const maxWidth = this.canvas.width * maxWidthRatio;
        for (; fontSize > minFontSize; fontSize -= 2) {
            ctx.save();
            ctx.font = `700 ${fontSize}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
            const widest = lines.reduce((width, line) => Math.max(width, ctx.measureText(line).width), 0);
            ctx.restore();
            if (widest <= maxWidth) {
                break;
            }
        }
        const lineHeight = fontSize * 1.16;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
        ctx.save();
        ctx.font = `700 ${fontSize}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
        const widestLine = lines.reduce((width, line) => Math.max(width, ctx.measureText(line).width), 0);
        const revealLeft = centerX - widestLine * 0.5 - 3;
        const revealSpan = widestLine + 6;
        const revealWidth = revealSpan * THREE.MathUtils.clamp(reveal ?? 1, 0, 1);
        ctx.beginPath();
        ctx.rect(revealLeft, 0, revealWidth, this.canvas.height);
        ctx.clip();
        lines.forEach((line, index) => {
            chalkText(ctx, line, centerX, startY + index * lineHeight, {
                size: fontSize,
                weight: 700,
                alpha: opacity * 0.96
            });
        });
        ctx.restore();
        this.texture.needsUpdate = true;
    }

    //DRAW HELPERS
    #clear() {
        const ctx = this.context;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    #drawHeading(text, x, y) {
        chalkText(this.context, text, x, y, {
            size: 72,
            weight: 700,
            alpha: 0.94
        });
    }
    #drawHeadingReveal(text, x, y, progress) {
        const ctx = this.context;
        ctx.save();
        ctx.font = `700 72px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
        const width = ctx.measureText(text).width;
        const reveal = THREE.MathUtils.clamp(progress, 0, 1);
        const left = x - width / 2 - 8;
        ctx.beginPath();
        ctx.rect(left, y - 58, (width + 16) * reveal, 116);
        ctx.clip();
        chalkText(ctx, text, x, y, {
            size: 72,
            weight: 700,
            alpha: 0.94
        });
        ctx.restore();
    }
    #drawSmallLabel(text, x, y) {
        const ctx = this.context;
        ctx.save();
        ctx.fillStyle = "rgba(235,232,210,0.70)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "600 30px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    #drawMuted(text, x, y) {
        const ctx = this.context;
        ctx.save();
        ctx.fillStyle = "rgba(235,232,210,0.42)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "500 28px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
        ctx.fillText(text, x, y);
        ctx.restore();
    }
}

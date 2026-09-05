//DEPENDENCIES
import { CUE_RIG, SHOT, CLOTH, PHYSICS, CUSHION, BALL_COLLISION, TABLE_CONTACT } from "../config/constants.js";

//DEBUG UI
export class UIManager {
    constructor({ cueRig, clearanceSystem, shotSystem, cueImpactSystem, scene, cueBallBody, objectBallBodies, physicsWorld, railCollisionSystem, pocketSystem, pocketCaptureSystem, ballReturnCollisionSystem, trajectoryPreviewSystem, matchController, ballInHandSystem, botPlanner, cpuPlayerController, confirmBallInHand, resetTable, dropTest, gameMode = "VS_BOT" }) {
        this.cueRig = cueRig;
        this.clearanceSystem = clearanceSystem;
        this.shotSystem = shotSystem;
        this.cueImpactSystem = cueImpactSystem;
        this.scene = scene;
        this.cueBallBody = cueBallBody;
        this.objectBallBodies = objectBallBodies;
        this.physicsWorld = physicsWorld;
        this.railCollisionSystem = railCollisionSystem;
        this.pocketSystem = pocketSystem;
        this.pocketCaptureSystem = pocketCaptureSystem;
        this.ballReturnCollisionSystem = ballReturnCollisionSystem;
        this.trajectoryPreviewSystem = trajectoryPreviewSystem;
        this.matchController = matchController;
        this.ballInHandSystem = ballInHandSystem;
        this.botPlanner = botPlanner;
        this.cpuPlayerController = cpuPlayerController;
        this.confirmBallInHand = confirmBallInHand;
        this.resetTable = resetTable;
        this.dropTest = dropTest;
        this.gameMode = gameMode;
        this.root = document.createElement("section");
        this.root.id = "cue-controls";
        this.root.setAttribute("aria-label", "Cue controls");
        this.root.classList.toggle("solo-mode", this.gameMode === "SOLO");
        this.root.innerHTML = `
            <div class="panel-title">
                Billiards — diagnostics
            </div>

            <label>
                <span>
                    Yaw
                <output id="yaw-output">0°</output>
                </span>

                <input
                id="yaw"
                type="range"
                min="-180"
                max="180"
                step="1"
                value="${CUE_RIG.DEFAULT_YAW_DEG}"
                />
            </label>

            <label>
                <span>
                    Elevation
                    <output id="elevation-output">0°</output>
                </span>

                <input
                id="elevation"
                type="range"
                min="${CUE_RIG.MIN_ELEVATION_DEG}"
                max="${CUE_RIG.MAX_ELEVATION_DEG}"
                step="0.25"
                value="${CUE_RIG.DEFAULT_ELEVATION_DEG}"
                />
            </label>

            <label>
                <span>
                    Shot power
                    <output id="power-output">
                        ${Math.round(SHOT.DEFAULT_POWER * 100)}%
                    </output>
                </span>

                <input
                id="power"
                type="range"
                min="${SHOT.MIN_POWER}"
                max="${SHOT.MAX_POWER}"
                step="0.01"
                value="${SHOT.DEFAULT_POWER}"
                />
            </label>

            <div class="contact-panel">
                <div class="contact-header">
                <strong>Cue-ball contact</strong>
                <button
                    id="center-hit"
                    type="button"
                    class="small-button"
                >
                    Center
                </button>
                </div>

                <div
                    id="impact-selector"
                    class="impact-selector"
                    role="application"
                    aria-label="Cue-ball hit point selector"
                >
                <div class="impact-crosshair horizontal"></div>
                <div class="impact-crosshair vertical"></div>
                <div id="impact-marker" class="impact-marker"></div>
                </div>

                    <div class="physics-row">
                    <span>Horizontal u</span>
                    <output id="hit-u">0.00</output>
                </div>

                <div class="physics-row">
                    <span>Vertical v</span>
                    <output id="hit-v">0.00</output>
                </div>

                <div id="spin-hint" class="spin-hint">
                    Center hit
                </div>

                <div class="milestone-note">
                    Drag the dot inside the ball. Top = topspin,
                    bottom = draw/backspin, left/right = sidespin.
                </div>
            </div>

            <div
                id="clearance-status"
                class="clearance-status"
            >
                Clearance check…
            </div>

            <button
                id="shoot"
                type="button"
            >
                Shoot
            </button>

            <div class="milestone-note">
                ${this.gameMode === "SOLO" ? "SOLO mode: KILL judges the run. Every shot costs one move; fouls and wrong-group pockets add penalties." : "MARZIUS vs KILL: the ghost uses the selected difficulty profile and shoots automatically on his turn."}
            </div>

            <div class="game-core-panel cpu-panel">
                <strong>${this.gameMode === "SOLO" ? "8-ball Solo challenge / shot log" : "8-ball Marzius vs KILL / shot log"}</strong>

                <div class="physics-row">
                    <span>Phase</span>
                    <output id="match-phase">AIMING</output>
                </div>

                <div class="physics-row">
                    <span>Shot</span>
                    <output id="match-shot-number">0</output>
                </div>

                <div class="physics-row">
                    <span>Log</span>
                    <output id="match-shot-log-state">—</output>
                </div>

                <div class="physics-row">
                    <span>1st object</span>
                    <output id="match-first-object">—</output>
                </div>

                <div class="physics-row">
                    <span>Pocketed</span>
                    <output id="match-pocketed">—</output>
                </div>

                <div class="physics-row">
                    <span>Scratch</span>
                    <output id="match-scratch">no</output>
                </div>

                <div class="physics-row">
                    <span>Rail after hit</span>
                    <output id="match-rail-after-hit">no</output>
                </div>

                <div class="physics-row">
                    <span>Mode</span>
                    <output id="rules-mode">SOLO RUNOUT</output>
                </div>

                <div class="physics-row">
                    <span>Player</span>
                    <output id="rules-current-player">Solo</output>
                </div>

                <div class="physics-row">
                    <span>Table</span>
                    <output id="rules-table-state">BREAK_SETUP</output>
                </div>

                <div class="physics-row">
                    <span>Solo group</span>
                    <output id="rules-player-1">OPEN</output>
                </div>

                <div class="physics-row">
                    <span>Opponent</span>
                    <output id="rules-player-2">— not active</output>
                </div>

                <div class="physics-row">
                    <span>Last ruling</span>
                    <output id="rules-last-ruling">Place cue ball in kitchen.</output>
                </div>

                <div
                id="eight-call-panel"
                class="eight-call-panel"
                hidden
                >
                    <strong>Call pocket for the 8-ball</strong>

                    <select
                        id="eight-pocket-select"
                        aria-label="Called pocket for the 8-ball"
                    >
                        <option value="">Select pocket…</option>
                        <option value="Pocket_Left_Near">Near · upper</option>
                        <option value="Pocket_Right_Near">Near · lower</option>
                        <option value="Pocket_Left_Middle">Middle · upper</option>
                        <option value="Pocket_Right_Middle">Middle · lower</option>
                        <option value="Pocket_Left_Far">Far · upper</option>
                        <option value="Pocket_Right_Far">Far · lower</option>
                    </select>

                    <div class="milestone-note">
                        The call applies only to this player's current 8-ball shot. A new
                        turn requires a new call; the opponent may choose a different
                        pocket on their own 8-ball turn.
                    </div>
                </div>

                <pre id="match-event-log" class="shot-event-log">No shot recorded yet.</pre>

                <div class="milestone-note">
                    RuleSet evaluates first contact, rail/pocket-after-contact, fouls,
                    break legality, groups, turn continuation, 8-ball win/loss and
                    called pocket. Physical pocketed balls remain pocketed even on fouls.
                </div>
            </div>

            <div class="game-core-panel">
                <strong>${this.gameMode === "SOLO" ? "Solo challenge" : "KILL opponent"}</strong>

                <div class="physics-row">
                    <span>CPU flow</span>
                    <output id="cpu-flow">HUMAN_TURN</output>
                </div>

                <div class="physics-row">
                    <span>Planner</span>
                    <output id="bot-status">IDLE</output>
                </div>

                <label>
                <span>Difficulty</span>
                <select
                    id="bot-difficulty"
                    aria-label="Bot difficulty"
                >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM" selected>Medium</option>
                    <option value="HARD">Hard</option>
                </select>
                </label>

                <div class="physics-row">
                    <span>Search</span>
                    <output id="bot-progress">0 / 0</output>
                </div>

                <div class="physics-row">
                    <span>Target</span>
                    <output id="bot-target">—</output>
                </div>

                <div class="physics-row">
                    <span>Pocket</span>
                    <output id="bot-pocket">—</output>
                </div>

                <div class="physics-row">
                    <span>Score</span>
                    <output id="bot-score">—</output>
                </div>

                <div class="physics-row">
                    <span>Chosen rank</span>
                    <output id="bot-rank">—</output>
                </div>

                <div class="physics-row">
                    <span>Execution</span>
                    <output id="bot-execution-error">—</output>
                </div>

                <div class="physics-row">
                    <span>Pred. first</span>
                    <output id="bot-first-object">—</output>
                </div>

                <div class="physics-row">
                    <span>Pred. pocketed</span>
                    <output id="bot-pocketed">—</output>
                </div>

                <div class="physics-row">
                    <span>Pred. scratch</span>
                    <output id="bot-scratch">—</output>
                </div>

                <div
                id="bot-message"
                class="milestone-note"
                >
                    Ready to search.
                </div>

                <div class="physics-actions">
                    <button
                        id="bot-plan"
                        type="button"
                        hidden
                    >
                        Plan bot shot
                    </button>

                    <button
                        id="bot-apply"
                        type="button"
                        disabled
                        hidden
                    >
                        Apply bot shot
                    </button>
                </div>

                <div class="milestone-note">
                    The CPU now owns Player 2. When its turn begins it waits briefly,
                    plans with the same cloned 240 Hz physics, applies the selected
                    difficulty's real yaw/power execution error, and fires automatically.
                    CPU ball-in-hand is also placed automatically through the same
                    validation used by human placement.
                </div>
            </div>

            <div
                id="ball-in-hand-panel"
                class="ball-in-hand-panel"
                hidden
            >
                <strong>Ball in hand</strong>

                <div class="physics-row">
                    <span>Placement</span>
                    <output id="ball-in-hand-valid">—</output>
                </div>

                <div class="physics-row">
                    <span>Position</span>
                    <output id="ball-in-hand-position">—</output>
                </div>

                <div
                id="ball-in-hand-message"
                class="ball-in-hand-message"
                >
                    Drag on the cloth to place the cue ball.
                </div>

                <button
                id="confirm-ball-in-hand"
                type="button"
                >
                    Confirm cue-ball placement (Enter)
                </button>

                <div class="milestone-note">
                    Top-down placement keeps NEAR on the left and FAR on the right.
                    BREAK_SETUP and break fouls are restricted to the kitchen (the head
                    string is drawn on the cloth); normal fouls allow the whole table.
                    Press Enter or click the button to confirm.
                </div>
            </div>

            <div class="trajectory-panel">
                <div class="contact-header">
                    <strong>Trajectory helper</strong>

                    <label class="inline-check">
                        <input
                        id="show-trajectory"
                        type="checkbox"
                        checked
                        />
                        <span>Show</span>
                    </label>
                </div>

                <div class="physics-row">
                    <span>Predicted path</span>
                    <output id="trajectory-length">—</output>
                </div>

                <div class="physics-row">
                    <span>Max lateral curve</span>
                    <output id="trajectory-lateral">—</output>
                </div>

                <div class="physics-row">
                    <span>Preview time</span>
                    <output id="trajectory-time">—</output>
                </div>

                <div class="physics-row">
                    <span>Predicted end</span>
                    <output id="trajectory-end-state">—</output>
                </div>

                <div class="physics-row">
                    <span>Predicted pocket</span>
                    <output id="trajectory-pocket">—</output>
                </div>

                <div class="physics-row">
                    <span>Cue-ball impacts</span>
                    <output id="trajectory-impacts">—</output>
                </div>

                <div class="milestone-note">
                    Dashed line = the same rigid-body physics used by the real shot.
                    Elevated off-center spin can bend the free-table path
                    through the real bottom-contact slip + Coulomb-friction impulse.
                    "Max lateral curve" measures deviation from the initial horizontal
                    launch line. No scripted lateral force is used.
                </div>
            </div>

            <div class="impact-panel">
                <strong>Impact</strong>

                <div class="physics-row">
                    <span>Free Δv</span>
                    <output id="target-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Horizontal Δv</span>
                    <output id="horizontal-target-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Downward Δv</span>
                    <output id="downward-target-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Linear |J|</span>
                    <output id="impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Horizontal |Jh|</span>
                    <output id="horizontal-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Downward |Jy|</span>
                    <output id="downward-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Angular ΔL</span>
                    <output id="angular-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>ΔL vector</span>
                    <output id="angular-impulse-vector">—</output>
                </div>

                <div class="physics-row">
                    <span>Direction</span>
                    <output id="impact-direction">—</output>
                </div>

                <div class="physics-row">
                    <span>Contact r</span>
                    <output id="contact-vector">—</output>
                </div>

                <div class="physics-row">
                    <span>Backswing</span>
                    <output id="stroke-backswing">—</output>
                </div>

                <div class="physics-row">
                    <span>Pullback time</span>
                    <output id="stroke-pullback-time">—</output>
                </div>

                <div class="physics-row">
                    <span>Strike time</span>
                    <output id="stroke-forward-time">—</output>
                </div>

                <div class="physics-row">
                    <span>Strike speed</span>
                    <output id="stroke-speed">—</output>
                </div>

                <div class="milestone-note">
                    The cue uses a real 3D impulse and torque.
                    The downward component is resolved against the table with a
                    normal restitution impulse, so sufficiently elevated/strong shots can
                    become genuinely AIRBORNE.
                </div>
            </div>

            <div class="physics-panel">
                <strong>RigidBall</strong>

                <div class="physics-row">
                    <span>State</span>
                    <output id="physics-state">—</output>
                </div>

                <div class="physics-row">
                    <span>Friction regime</span>
                    <output id="friction-regime">—</output>
                </div>

                <div class="physics-row">
                    <span>Mass</span>
                    <output id="ball-mass">—</output>
                </div>

                <div class="physics-row">
                    <span>Rolling μr</span>
                    <output id="rolling-mu">—</output>
                </div>

                <div class="physics-row">
                    <span>Est. rolling stop</span>
                    <output id="rolling-stop-distance">—</output>
                </div>

                <div class="physics-row">
                    <span>Position</span>
                    <output id="physics-position">—</output>
                </div>

                <div class="physics-row">
                    <span>Velocity</span>
                    <output id="physics-velocity">—</output>
                </div>

                <div class="physics-row">
                    <span>Speed</span>
                    <output id="physics-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Angular ω</span>
                    <output id="physics-angular">—</output>
                </div>

                <div class="physics-row">
                    <span>Slip speed</span>
                    <output id="physics-slip">—</output>
                </div>

                <div class="physics-row">
                    <span>ωR / |v|</span>
                    <output id="rolling-ratio">—</output>
                </div>

                <div class="physics-actions">
                    <button
                        id="drop-test"
                        type="button"
                    >
                        Drop test
                    </button>

                    <button
                        id="reset-ball"
                        type="button"
                    >
                        Reset rack
                    </button>
                </div>
            </div>

            <div class="collision-panel">
                <strong>Table normal / jump</strong>

                <div class="physics-row">
                    <span>Table e</span>
                    <output id="table-restitution">—</output>
                </div>

                <div class="physics-row">
                    <span>Bounce threshold</span>
                    <output id="table-bounce-threshold">—</output>
                </div>

                <div class="physics-row">
                    <span>Total table impacts</span>
                    <output id="table-impact-total">0</output>
                </div>

                <div class="physics-row">
                    <span>Last ball</span>
                    <output id="table-impact-ball">—</output>
                </div>

                <div class="physics-row">
                    <span>Downward speed</span>
                    <output id="table-closing-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Normal Jn</span>
                    <output id="table-normal-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Launch vy</span>
                    <output id="table-launch-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Ideal rise</span>
                    <output id="table-ballistic-rise">—</output>
                </div>

                <div class="milestone-note">
                    Table contact uses a real vertical normal impulse. Above the bounce
                    threshold, e_table > 0 converts part of the downward cue/landing speed
                    into upward velocity. Below threshold the contact remains inelastic to
                    suppress micro-bounces.
                </div>
            </div>

            <div class="collision-panel">
                <strong>Ball-ball collisions</strong>

                <div class="physics-row">
                    <span>Object balls</span>
                    <output id="object-ball-count">15</output>
                </div>

                <div class="physics-row">
                    <span>Moving balls</span>
                    <output id="moving-ball-count">0</output>
                </div>

                <div class="physics-row">
                    <span>Ball μt</span>
                    <output id="ball-friction">—</output>
                </div>

                <div class="physics-row">
                    <span>Total impacts</span>
                    <output id="collision-total">0</output>
                </div>

                <div class="physics-row">
                    <span>Last pair</span>
                    <output id="collision-pair">—</output>
                </div>

                <div class="physics-row">
                    <span>Last Jn</span>
                    <output id="collision-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Last Jt</span>
                    <output id="collision-tangent-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Closing speed</span>
                    <output id="collision-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>Tangent speed</span>
                    <output id="collision-tangent-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>ωy after (A / B)</span>
                    <output id="collision-spin-transfer">—</output>
                </div>

                <div class="milestone-note">
                    Horizontal tangential ball-ball friction transfers linear and angular momentum.
                    Left/right english can now create throw and transfer side spin.
                    Vertical contact friction remains deferred until cue elevation and
                    jump/table-reaction physics are modeled consistently.
                </div>
            </div>

            <div class="collision-panel">
                <strong>Cushion collisions</strong>

                <div class="physics-row">
                    <span>Rail e</span>
                    <output id="rail-restitution">—</output>
                </div>

                <div class="physics-row">
                    <span>Rail μt</span>
                    <output id="rail-friction">—</output>
                </div>

                <div class="physics-row">
                    <span>Total rail impacts</span>
                    <output id="rail-total">0</output>
                </div>

                <div class="physics-row">
                    <span>Last rail</span>
                    <output id="rail-last">—</output>
                </div>

                <div class="physics-row">
                    <span>Last ball</span>
                    <output id="rail-ball">—</output>
                </div>

                <div class="physics-row">
                    <span>Normal Jn</span>
                    <output id="rail-normal-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Tangent Jt</span>
                    <output id="rail-tangent-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Tangent speed</span>
                    <output id="rail-tangent-speed">—</output>
                </div>

                <div class="physics-row">
                    <span>ωy after</span>
                    <output id="rail-omega-y">—</output>
                </div>

                <div class="milestone-note">
                    Normal restitution controls the bounce. Tangential cushion friction
                    couples side spin to motion along the rail, so left/right english can
                    now change the rebound angle.
                </div>
            </div>

            <div class="collision-panel">
                <strong>Pockets</strong>

                <div class="physics-row">
                    <span>Total entries</span>
                    <output id="pocket-entries">0</output>
                </div>

                <div class="physics-row">
                    <span>Total pocketed</span>
                    <output id="pocket-total">0</output>
                </div>

                <div class="physics-row">
                    <span>Last pocket</span>
                    <output id="pocket-last">—</output>
                </div>

                <div class="physics-row">
                    <span>Last ball</span>
                    <output id="pocket-ball">—</output>
                </div>

                <div class="physics-row">
                    <span>Cue pocket</span>
                    <output id="cue-pocket">—</output>
                </div>

                <div class="milestone-note">
                    Pocket identity now comes from contact with the real Pocket_* wall
                    mesh (with a center-drop hull fallback). After commit, the hidden
                    return is intentionally simplified to nearest-opening transport.
                </div>
            </div>

            <div class="collision-panel">
                <strong>Real Pocket_* walls</strong>

                <div class="physics-row">
                    <span>Pocket walls</span>
                    <output id="capture-throats">6</output>
                </div>

                <div class="physics-row">
                    <span>Captures</span>
                    <output id="capture-impacts">0</output>
                </div>

                <div class="physics-row">
                    <span>Last ball</span>
                    <output id="capture-ball">—</output>
                </div>

                <div class="physics-row">
                    <span>Last pocket</span>
                    <output id="capture-pocket">—</output>
                </div>

                <div class="milestone-note">
                    No generated throat exists anymore. The six real Pocket_* mesh
                    assets are swept-tested as the physical catch walls. On contact,
                    horizontal motion/spin stops and gravity drops the ball vertically.
                </div>
            </div>

            <label class="debug-check">
                <input
                id="show-pocket-capture"
                type="checkbox"
                />

                <span>
                    Show real Pocket_* walls
                </span>
            </label>

            <div class="collision-panel">
                <strong>Simple ball return</strong>

                <div class="physics-row">
                    <span>Return targets</span>
                    <output id="return-triangles">916</output>
                </div>

                <div class="physics-row">
                    <span>Collected</span>
                    <output id="return-impacts">0</output>
                </div>

                <div class="physics-row">
                    <span>Last ball</span>
                    <output id="return-ball">—</output>
                </div>

                <div class="physics-row">
                    <span>Return floor</span>
                    <output id="return-normal-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Stop reason</span>
                    <output id="return-tangent-impulse">—</output>
                </div>

                <div class="physics-row">
                    <span>Nearest hole</span>
                    <output id="return-guide-target">—</output>
                </div>

                <div class="physics-row">
                    <span>Guide accel</span>
                    <output id="return-guide-accel">—</output>
                </div>

                <div class="milestone-note">
                    After BALL_POCKETED the ball chooses the geometrically nearest of
                    the TWO return mouths. Targets are placed at the two ends of the
                    asset's LONG axis and centered on the SHORT axis.
                </div>

                <div class="milestone-note">
                    Return path is axis-aligned: LONG side first while preserving the
                    entry-side corridor coordinate, then SHORT side toward the mouth.
                    It stops at 8 mm from target or against another pocketed ball.
                </div>
            </div>

            <label class="debug-check">
                <input
                id="show-ball-return"
                type="checkbox"
                />

                <span>
                Show two return targets
                </span>
            </label>

            <label class="debug-check">
                <input
                id="show-pocket-mouths"
                type="checkbox"
                />

                <span>
                Show pocket mouths
                </span>
            </label>

            <label class="debug-check">
                <input
                id="show-colliders"
                type="checkbox"
                />

                <span>
                Show physical rail profiles
                </span>
            </label>

            <div class="shortcut-help">
                <strong>Keyboard</strong>
                <span>A / D — yaw</span>
                <span>W / S — elevation</span>
                <span>Space — shoot</span>
            </div>

            <details>
                <summary>Physics model</summary>
                <pre>r = real 3D hitPoint - center
                J = |J| * real 3D cue direction
                ΔL = r × J
                Δω = I⁻¹ ΔL

                elevation α:
                |Jh| = |J| cos α
                |Jy| = |J| sin α (downward)
                Table normal:
                Jn = -(1+e_table) v_y / m⁻¹
                e_table = 0 below threshold
                e_table > 0 above threshold
                launch vy > 0 → AIRBORNE

                conservative swerve:
                v_contact = v + ω × (0,-R,0)
                J_friction ∥ -v_contact(horizontal)
                lateral slip → lateral Δv
                rolling capture at 0.006 m/s
                (no extra curve force)

                ball-ball:
                Jn = -(1+e)(vrel·n)/(mA⁻¹+mB⁻¹)
                |Jt| ≤ μbb |Jn|
                ΔLA = rA × (-Jt)
                ΔLB = rB × (+Jt)

                cushion:
                Jn = -(1+e)(vc·n)/m⁻¹
                |Jt| ≤ μt |Jn|
                ΔL = r × Jt

                pocket:
                real Pocket_* mouth opens rail endpoint
                no PlayingSurface support → gravity
                FALLING → FALLEN</pre>
            </details>
        `;
        document.body.appendChild(this.root);
        this.yawInput = this.root.querySelector("#yaw");
        this.elevationInput = this.root.querySelector("#elevation");
        this.powerInput = this.root.querySelector("#power");
        this.yawOutput = this.root.querySelector("#yaw-output");
        this.elevationOutput = this.root.querySelector("#elevation-output");
        this.powerOutput = this.root.querySelector("#power-output");
        this.clearanceStatus = this.root.querySelector("#clearance-status");
        this.shootButton = this.root.querySelector("#shoot");
        this.trajectoryCheckbox = this.root.querySelector("#show-trajectory");
        this.matchPhase = this.root.querySelector("#match-phase");
        this.matchShotNumber = this.root.querySelector("#match-shot-number");
        this.matchShotLogState = this.root.querySelector("#match-shot-log-state");
        this.matchFirstObject = this.root.querySelector("#match-first-object");
        this.matchPocketed = this.root.querySelector("#match-pocketed");
        this.matchScratch = this.root.querySelector("#match-scratch");
        this.matchRailAfterHit = this.root.querySelector("#match-rail-after-hit");
        this.matchEventLog = this.root.querySelector("#match-event-log");
        this.rulesMode = this.root.querySelector("#rules-mode");
        this.rulesCurrentPlayer = this.root.querySelector("#rules-current-player");
        this.rulesTableState = this.root.querySelector("#rules-table-state");
        this.rulesPlayer1 = this.root.querySelector("#rules-player-1");
        this.rulesPlayer2 = this.root.querySelector("#rules-player-2");
        this.rulesLastRuling = this.root.querySelector("#rules-last-ruling");
        this.eightCallPanel = this.root.querySelector("#eight-call-panel");
        this.eightPocketSelect = this.root.querySelector("#eight-pocket-select");
        this.cpuFlow = this.root.querySelector("#cpu-flow");
        this.botStatus = this.root.querySelector("#bot-status");
        this.botDifficulty = this.root.querySelector("#bot-difficulty");
        this.botProgress = this.root.querySelector("#bot-progress");
        this.botTarget = this.root.querySelector("#bot-target");
        this.botPocket = this.root.querySelector("#bot-pocket");
        this.botScore = this.root.querySelector("#bot-score");
        this.botRank = this.root.querySelector("#bot-rank");
        this.botExecutionError = this.root.querySelector("#bot-execution-error");
        this.botFirstObject = this.root.querySelector("#bot-first-object");
        this.botPocketed = this.root.querySelector("#bot-pocketed");
        this.botScratch = this.root.querySelector("#bot-scratch");
        this.botMessage = this.root.querySelector("#bot-message");
        this.botPlanButton = this.root.querySelector("#bot-plan");
        this.botApplyButton = this.root.querySelector("#bot-apply");
        this.ballInHandPanel = this.root.querySelector("#ball-in-hand-panel");
        this.ballInHandValid = this.root.querySelector("#ball-in-hand-valid");
        this.ballInHandPosition = this.root.querySelector("#ball-in-hand-position");
        this.ballInHandMessage = this.root.querySelector("#ball-in-hand-message");
        this.confirmBallInHandButton = this.root.querySelector("#confirm-ball-in-hand");
        this.trajectoryLength = this.root.querySelector("#trajectory-length");
        this.trajectoryLateral = this.root.querySelector("#trajectory-lateral");
        this.trajectoryTime = this.root.querySelector("#trajectory-time");
        this.trajectoryEndState = this.root.querySelector("#trajectory-end-state");
        this.trajectoryPocket = this.root.querySelector("#trajectory-pocket");
        this.trajectoryImpacts = this.root.querySelector("#trajectory-impacts");
        this.debugCheckbox = this.root.querySelector("#show-colliders");
        this.physicsState = this.root.querySelector("#physics-state");
        this.frictionRegime = this.root.querySelector("#friction-regime");
        this.ballMass = this.root.querySelector("#ball-mass");
        this.rollingMu = this.root.querySelector("#rolling-mu");
        this.rollingStopDistance = this.root.querySelector("#rolling-stop-distance");
        this.physicsPosition = this.root.querySelector("#physics-position");
        this.physicsVelocity = this.root.querySelector("#physics-velocity");
        this.physicsSpeed = this.root.querySelector("#physics-speed");
        this.physicsAngular = this.root.querySelector("#physics-angular");
        this.physicsSlip = this.root.querySelector("#physics-slip");
        this.rollingRatio = this.root.querySelector("#rolling-ratio");
        this.targetSpeed = this.root.querySelector("#target-speed");
        this.horizontalTargetSpeed = this.root.querySelector("#horizontal-target-speed");
        this.downwardTargetSpeed = this.root.querySelector("#downward-target-speed");
        this.horizontalImpulseOutput = this.root.querySelector("#horizontal-impulse");
        this.downwardImpulseOutput = this.root.querySelector("#downward-impulse");
        this.impulseOutput = this.root.querySelector("#impulse");
        this.angularImpulseOutput = this.root.querySelector("#angular-impulse");
        this.angularImpulseVector = this.root.querySelector("#angular-impulse-vector");
        this.impactDirection = this.root.querySelector("#impact-direction");
        this.contactVectorOutput = this.root.querySelector("#contact-vector");
        this.strokeBackswing = this.root.querySelector("#stroke-backswing");
        this.strokePullbackTime = this.root.querySelector("#stroke-pullback-time");
        this.strokeForwardTime = this.root.querySelector("#stroke-forward-time");
        this.strokeSpeed = this.root.querySelector("#stroke-speed");
        this.dropButton = this.root.querySelector("#drop-test");
        this.resetButton = this.root.querySelector("#reset-ball");
        this.tableRestitution = this.root.querySelector("#table-restitution");
        this.tableBounceThreshold = this.root.querySelector("#table-bounce-threshold");
        this.tableImpactTotal = this.root.querySelector("#table-impact-total");
        this.tableImpactBall = this.root.querySelector("#table-impact-ball");
        this.tableClosingSpeed = this.root.querySelector("#table-closing-speed");
        this.tableNormalImpulse = this.root.querySelector("#table-normal-impulse");
        this.tableLaunchSpeed = this.root.querySelector("#table-launch-speed");
        this.tableBallisticRise = this.root.querySelector("#table-ballistic-rise");
        this.objectBallCount = this.root.querySelector("#object-ball-count");
        this.movingBallCount = this.root.querySelector("#moving-ball-count");
        this.collisionTotal = this.root.querySelector("#collision-total");
        this.collisionPair = this.root.querySelector("#collision-pair");
        this.collisionImpulse = this.root.querySelector("#collision-impulse");
        this.collisionSpeed = this.root.querySelector("#collision-speed");
        this.ballFriction = this.root.querySelector("#ball-friction");
        this.collisionTangentImpulse = this.root.querySelector("#collision-tangent-impulse");
        this.collisionTangentSpeed = this.root.querySelector("#collision-tangent-speed");
        this.collisionSpinTransfer = this.root.querySelector("#collision-spin-transfer");
        this.railRestitution = this.root.querySelector("#rail-restitution");
        this.railFriction = this.root.querySelector("#rail-friction");
        this.railTotal = this.root.querySelector("#rail-total");
        this.railLast = this.root.querySelector("#rail-last");
        this.railBall = this.root.querySelector("#rail-ball");
        this.railNormalImpulse = this.root.querySelector("#rail-normal-impulse");
        this.railTangentImpulse = this.root.querySelector("#rail-tangent-impulse");
        this.railTangentSpeed = this.root.querySelector("#rail-tangent-speed");
        this.railOmegaY = this.root.querySelector("#rail-omega-y");
        this.captureThroats = this.root.querySelector("#capture-throats");
        this.captureImpacts = this.root.querySelector("#capture-impacts");
        this.captureBall = this.root.querySelector("#capture-ball");
        this.capturePocket = this.root.querySelector("#capture-pocket");
        this.captureDebugCheckbox = this.root.querySelector("#show-pocket-capture");
        this.returnTriangles = this.root.querySelector("#return-triangles");
        this.returnImpacts = this.root.querySelector("#return-impacts");
        this.returnBall = this.root.querySelector("#return-ball");
        this.returnNormalImpulse = this.root.querySelector("#return-normal-impulse");
        this.returnTangentImpulse = this.root.querySelector("#return-tangent-impulse");
        this.returnGuideTarget = this.root.querySelector("#return-guide-target");
        this.returnGuideAccel = this.root.querySelector("#return-guide-accel");
        this.returnDebugCheckbox = this.root.querySelector("#show-ball-return");
        this.pocketEntries = this.root.querySelector("#pocket-entries");
        this.pocketTotal = this.root.querySelector("#pocket-total");
        this.pocketLast = this.root.querySelector("#pocket-last");
        this.pocketBall = this.root.querySelector("#pocket-ball");
        this.cuePocket = this.root.querySelector("#cue-pocket");
        this.pocketDebugCheckbox = this.root.querySelector("#show-pocket-mouths");
        this.impactSelector = this.root.querySelector("#impact-selector");
        this.impactMarker = this.root.querySelector("#impact-marker");
        this.hitUOutput = this.root.querySelector("#hit-u");
        this.hitVOutput = this.root.querySelector("#hit-v");
        this.spinHint = this.root.querySelector("#spin-hint");
        this.centerHitButton = this.root.querySelector("#center-hit");
        this.draggingHitPoint = false;
        this.yawInput.addEventListener("input", () => {
            this.cueRig.setYawDeg(Number(this.yawInput.value));
            this.clearanceSystem.update(true);
            this.sync();
        });
        this.elevationInput.addEventListener("input", () => {
            this.cueRig.setElevationDeg(Number(this.elevationInput.value));
            this.clearanceSystem.update(true);
            this.sync();
        });
        this.powerInput.addEventListener("input", () => {
            this.shotSystem.setPower(Number(this.powerInput.value));
            this.sync();
        });
        this.shootButton.addEventListener("click", () => {
            if (this.cpuPlayerController.isHumanTurn() && this.matchController.canStartShot()) {
                this.shotSystem.requestShot();
            }
            this.sync();
        });
        this.botDifficulty.addEventListener("change", () => {
            this.botPlanner.setDifficulty(this.botDifficulty.value);
            this.sync();
        });
        this.botPlanButton.addEventListener("click", async () => {
            await this.botPlanner.plan();
            this.sync();
        });
        this.botApplyButton.addEventListener("click", () => {
            this.botPlanner.applyBestPlan();
            this.sync();
        });
        this.confirmBallInHandButton.addEventListener("click", () => {
            this.confirmBallInHand();
            this.sync();
        });
        this.eightPocketSelect.addEventListener("change", () => {
            this.matchController.callEightPocket(this.eightPocketSelect.value);
            this.sync();
        });
        window.addEventListener("keydown", event => {
            if (event.key !== "Enter" || event.repeat || !this.ballInHandSystem.isActive()) {
                return;
            }
            const target = event.target;
            if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && (target.type === "text" || target.type === "number")) || target?.isContentEditable) {
                return;
            }
            if (this.confirmBallInHand("keyboard")) {
                event.preventDefault();
                this.sync();
            }
        });
        this.trajectoryCheckbox.addEventListener("change", () => {
            this.trajectoryPreviewSystem.setEnabled(this.trajectoryCheckbox.checked);
            this.sync();
        });
        this.dropButton.addEventListener("click", () => {
            this.dropTest();
        });
        this.resetButton.addEventListener("click", () => {
            this.resetTable();
        });
        this.centerHitButton.addEventListener("click", () => {
            this.shotSystem.resetHitOffset();
            this.sync();
        });
        this.debugCheckbox.addEventListener("change", () => {
            this.railCollisionSystem.setDebugVisible(this.scene, this.debugCheckbox.checked);
        });
        this.pocketDebugCheckbox.addEventListener("change", () => {
            this.pocketSystem.setDebugVisible(this.scene, this.pocketDebugCheckbox.checked);
        });
        this.captureDebugCheckbox.addEventListener("change", () => {
            this.pocketCaptureSystem.setDebugVisible(this.scene, this.captureDebugCheckbox.checked);
        });
        this.returnDebugCheckbox.addEventListener("change", () => {
            this.ballReturnCollisionSystem.setDebugVisible(this.scene, this.returnDebugCheckbox.checked);
        });
        this.impactSelector.addEventListener("pointerdown", event => {
            if (this.#aimingLocked()) {
                return;
            }
            this.draggingHitPoint = true;
            this.impactSelector.setPointerCapture(event.pointerId);
            this.#setHitPointFromPointer(event);
        });
        this.impactSelector.addEventListener("pointermove", event => {
            if (!this.draggingHitPoint || this.#aimingLocked()) {
                return;
            }
            this.#setHitPointFromPointer(event);
        });
        const endDrag = () => {
            this.draggingHitPoint = false;
        };
        this.impactSelector.addEventListener("pointerup", endDrag);
        this.impactSelector.addEventListener("pointercancel", endDrag);
        this.sync();
    }
    #aimingLocked() {
        return (this.ballInHandSystem.isActive() || this.cpuPlayerController?.isCpuTurn() || this.botPlanner?.isPlanning() || this.shotSystem.strokeStarted || this.shotSystem.hasCommittedShot());
    }
    #setHitPointFromPointer(event) {
        const rect = this.impactSelector.getBoundingClientRect();
        const radius = Math.min(rect.width, rect.height) / 2;
        let u = (event.clientX - (rect.left + rect.width / 2)) / radius;
        let v = -(event.clientY - (rect.top + rect.height / 2)) / radius;
        const length = Math.hypot(u, v);
        const limit = SHOT.MAX_NORMALIZED_HIT_RADIUS;
        if (length > limit && length > 1e-10) {
            const scale = limit / length;
            u *= scale;
            v *= scale;
        }
        this.shotSystem.setHitOffset(u, v);
        this.sync();
    }
    #updateHitMarker() {
        const hit = this.shotSystem.getHitOffset();
        this.impactMarker.style.left = `${50 + hit.u * 50}%`;
        this.impactMarker.style.top = `${50 - hit.v * 50}%`;
        this.hitUOutput.value = hit.u.toFixed(2);
        this.hitVOutput.value = hit.v.toFixed(2);
        const absU = Math.abs(hit.u);
        const absV = Math.abs(hit.v);
        if (absU < 0.08 && absV < 0.08) {
            this.spinHint.textContent = "Center hit";
        }
        else {
            const parts = [];
            if (hit.v > 0.08) {
                parts.push("topspin");
            }
            else if (hit.v < -0.08) {
                parts.push("draw / backspin");
            }
            if (hit.u > 0.08) {
                parts.push("right sidespin");
            }
            else if (hit.u < -0.08) {
                parts.push("left sidespin");
            }
            this.spinHint.textContent = parts.join(" + ");
        }
    }
    setVisible(visible) {
        this.root.hidden = !visible;
    }
    sync() {
        if (this.root.hidden) {
            return;
        }
        const aimingLocked = this.#aimingLocked();
        const matchState = this.matchController.getDebugState({
            maxEventLines: 10
        });
        this.matchPhase.value = matchState.phase;
        this.matchShotNumber.value = String(matchState.shotNumber);
        this.matchShotLogState.value = matchState.showing === "NONE" ? "—" : `${matchState.showing} · ${matchState.eventCount} events`;
        this.matchFirstObject.value = matchState.firstObjectContact ?? "—";
        this.matchPocketed.value = matchState.pocketedBalls.length > 0 ? matchState.pocketedBalls.join(", ") : "—";
        this.matchScratch.value = matchState.scratch ? "YES" : "no";
        this.matchRailAfterHit.value = matchState.railAfterFirstObjectContact ? "yes" : "no";
        this.matchEventLog.textContent = matchState.eventLines.length > 0 ? matchState.eventLines.join("\n") : "No shot recorded yet.";
        const ruleState = this.matchController.getRuleState();
        this.rulesMode.value = ruleState.solo ? "SOLO RUNOUT" : "TWO PLAYER";
        this.rulesCurrentPlayer.value = ruleState.currentPlayerName;
        this.rulesTableState.value = ruleState.tableState;
        const formatPlayer = player => {
            if (!player.group) {
                return "OPEN";
            }
            return player.remaining.length > 0 ? `${player.group} · ${player.remaining.length} left` : `${player.group} · ON 8`;
        };
        this.rulesPlayer1.value = formatPlayer(ruleState.players[0]);
        this.rulesPlayer2.value = ruleState.solo ? "— not active" : formatPlayer(ruleState.players[1]);
        this.rulesLastRuling.value = ruleState.gameOverReason ? `GAME OVER · ${ruleState.gameOverReason}` : (ruleState.lastRuling?.message ?? "—");
        const cpuTurn = this.cpuPlayerController.isCpuTurn();
        this.eightCallPanel.hidden = !ruleState.mustCallEightPocket || cpuTurn;
        if (ruleState.mustCallEightPocket) {
            this.eightPocketSelect.value = ruleState.calledEightPocket ?? "";
        }
        else {
            this.eightPocketSelect.value = "";
        }
        const cpuState = this.cpuPlayerController.getState();
        this.cpuFlow.value = cpuState.state;
        const botState = this.botPlanner.getState();
        this.botStatus.value = botState.status;
        this.botDifficulty.value = botState.difficulty;
        this.botDifficulty.disabled = this.botPlanner.isPlanning() || cpuTurn;
        this.botProgress.value = `${botState.tested} / ${botState.total}`;
        this.botTarget.value = botState.best ? (botState.best.candidate.targetLabel ?? "—") : "—";
        this.botPocket.value = botState.best?.candidate?.pocketName ?? "—";
        this.botScore.value = botState.best ? botState.best.score.toFixed(1) : "—";
        this.botRank.value = botState.selectedRank ? `#${botState.selectedRank}` : "—";
        this.botExecutionError.value = botState.execution ? (`yaw ${botState.execution.error.yawDeg >= 0 ? "+" : ""}${botState.execution.error.yawDeg.toFixed(2)}° · ` + `power ${botState.execution.error.powerRelative >= 0 ? "+" : ""}${(botState.execution.error.powerRelative * 100).toFixed(1)}%`) : "—";
        this.botFirstObject.value = botState.best?.firstObjectContact ?? "—";
        this.botPocketed.value = botState.best && botState.best.pocketed.length > 0 ? botState.best.pocketed.join(", ") : "—";
        this.botScratch.value = botState.best ? (botState.best.scratch ? "YES" : "no") : "—";
        this.botMessage.textContent = cpuTurn ? cpuState.message : `CPU difficulty: ${botState.difficultyLabel}.`;
        this.botPlanButton.disabled = true;
        this.botApplyButton.disabled = true;
        const ballInHandState = this.ballInHandSystem.getState();
        this.ballInHandPanel.hidden = !ballInHandState.active;
        this.ballInHandValid.value = ballInHandState.active ? (ballInHandState.valid ? "VALID" : "INVALID") : "—";
        this.ballInHandPosition.value = ballInHandState.active ? `(${ballInHandState.position.x.toFixed(3)}, ${ballInHandState.position.z.toFixed(3)})` : "—";
        this.ballInHandMessage.textContent = ballInHandState.reason;
        this.confirmBallInHandButton.disabled = !this.ballInHandSystem.canConfirm();
        const yaw = this.cueRig.getYawDeg();
        const elevation = this.cueRig.getElevationDeg();
        const minimum = this.clearanceSystem.getMinimumElevationDeg();
        const blocked = this.clearanceSystem.isDirectionBlocked();
        const power = this.shotSystem.getPower();
        this.yawInput.value = String(yaw);
        this.elevationInput.min = String(minimum);
        this.elevationInput.value = String(elevation);
        this.powerInput.value = String(power);
        this.yawInput.disabled = aimingLocked;
        this.elevationInput.disabled = aimingLocked;
        this.powerInput.disabled = aimingLocked;
        this.centerHitButton.disabled = aimingLocked;
        this.impactSelector.classList.toggle("locked", aimingLocked);
        this.yawOutput.value = `${yaw.toFixed(0)}°`;
        this.elevationOutput.value = `${elevation.toFixed(1)}°`;
        this.powerOutput.value = `${Math.round(power * 100)}%`;
        this.trajectoryCheckbox.checked = this.trajectoryPreviewSystem.isEnabled();
        const trajectoryStats = this.trajectoryPreviewSystem.getStats();
        if (trajectoryStats.visible) {
            this.trajectoryLength.value = `${trajectoryStats.pathLength.toFixed(2)} m`;
            const signedLateral = trajectoryStats.signedMaxLateralDeviation ?? 0;
            this.trajectoryLateral.value = `${(signedLateral * 100).toFixed(2)} cm`;
            this.trajectoryTime.value = `${trajectoryStats.simulatedTime.toFixed(2)} s`;
            this.trajectoryEndState.value = trajectoryStats.finalState;
            this.trajectoryPocket.value = trajectoryStats.finalPocket ?? "—";
            this.trajectoryImpacts.value = `${trajectoryStats.ballCollisionCount} ball / ${trajectoryStats.railCollisionCount} rail / ${trajectoryStats.pocketEntryCount ?? 0} pocket`;
        }
        else {
            this.trajectoryLength.value = "—";
            this.trajectoryLateral.value = "—";
            this.trajectoryTime.value = "—";
            this.trajectoryEndState.value = "—";
            this.trajectoryPocket.value = "—";
            this.trajectoryImpacts.value = "—";
        }
        this.#updateHitMarker();
        if (blocked) {
            this.clearanceStatus.textContent = "Direction blocked — no legal cue pose.";
            this.clearanceStatus.classList.add("blocked");
        }
        else if (minimum > CUE_RIG.MIN_ELEVATION_DEG + 0.01) {
            this.clearanceStatus.textContent = `Rail clearance: elevation ≥ ${minimum.toFixed(1)}°`;
            this.clearanceStatus.classList.remove("blocked");
        }
        else {
            this.clearanceStatus.textContent = "Rail clearance: free at 0°";
            this.clearanceStatus.classList.remove("blocked");
        }
        this.shootButton.disabled = cpuTurn || this.botPlanner?.isPlanning() || !this.shotSystem.canShoot() || !this.matchController.canStartShot();
        const p = this.cueBallBody.position;
        const vel = this.cueBallBody.velocity;
        this.physicsState.value = this.cueBallBody.state;
        this.frictionRegime.value = this.cueBallBody.frictionRegime ?? "NONE";
        this.ballMass.value = `${this.cueBallBody.mass.toFixed(3)} kg`;
        this.rollingMu.value = CLOTH.ROLLING_RESISTANCE_COEFFICIENT.toFixed(3);
        const horizontalSpeedForStop = Math.hypot(this.cueBallBody.velocity.x, this.cueBallBody.velocity.z);
        const rollingDeceleration = CLOTH.ROLLING_RESISTANCE_COEFFICIENT * PHYSICS.GRAVITY;
        const estimatedStopDistance = rollingDeceleration > 0 ? (horizontalSpeedForStop * horizontalSpeedForStop / (2 * rollingDeceleration)) : Number.POSITIVE_INFINITY;
        this.rollingStopDistance.value = this.cueBallBody.frictionRegime === "ROLLING" ? `${estimatedStopDistance.toFixed(2)} m` : "—";
        this.physicsPosition.value = `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
        this.physicsVelocity.value = `(${vel.x.toFixed(3)}, ${vel.y.toFixed(3)}, ${vel.z.toFixed(3)})`;
        this.physicsSpeed.value = `${vel.length().toFixed(3)} m/s`;
        const w = this.cueBallBody.angularVelocity;
        this.physicsAngular.value = `(${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)}) rad/s`;
        this.physicsSlip.value = `${this.cueBallBody.contactSlipSpeed.toFixed(3)} m/s`;
        const horizontalSpeed = Math.hypot(vel.x, vel.z);
        const horizontalOmega = Math.hypot(w.x, w.z);
        const ratio = horizontalSpeed > 1e-6 ? (horizontalOmega * this.cueBallBody.radius / horizontalSpeed) : 0;
        this.rollingRatio.value = ratio.toFixed(3);
        const strokeInfo = this.cueRig.getStrokeDebugInfo();
        this.strokeBackswing.value = `${(strokeInfo.backswing * 100).toFixed(1)} cm`;
        this.strokePullbackTime.value = `${Math.round(strokeInfo.chargeDuration * 1000)} ms`;
        this.strokeForwardTime.value = `${Math.round(strokeInfo.forwardDuration * 1000)} ms`;
        this.strokeSpeed.value = `${strokeInfo.strikeSpeed.toFixed(2)} m/s`;
        const allBodies = [
            this.cueBallBody,
            ...this.objectBallBodies
        ];
        const movingCount = allBodies.reduce((count, body) => count + (body.velocity.lengthSq() > 0.0001 || body.angularVelocity.lengthSq() > 0.01 ? 1 : 0), 0);
        this.objectBallCount.value = String(this.objectBallBodies.length);
        this.movingBallCount.value = String(movingCount);
        this.tableRestitution.value = TABLE_CONTACT.RESTITUTION.toFixed(2);
        this.tableBounceThreshold.value = `${TABLE_CONTACT.RESTITUTION_SPEED_THRESHOLD.toFixed(2)} m/s`;
        const tableStats = this.physicsWorld.getTableContactStats();
        this.tableImpactTotal.value = String(tableStats.total);
        if (tableStats.last) {
            this.tableImpactBall.value = tableStats.last.ball;
            this.tableClosingSpeed.value = `${tableStats.last.closingSpeed.toFixed(3)} m/s`;
            this.tableNormalImpulse.value = `${tableStats.last.normalImpulseMagnitude.toFixed(4)} N·s`;
            this.tableLaunchSpeed.value = `${tableStats.last.launchSpeed.toFixed(3)} m/s`;
            this.tableBallisticRise.value = `${(tableStats.last.ballisticRise * 100).toFixed(1)} cm`;
        }
        else {
            this.tableImpactBall.value = "—";
            this.tableClosingSpeed.value = "—";
            this.tableNormalImpulse.value = "—";
            this.tableLaunchSpeed.value = "—";
            this.tableBallisticRise.value = "—";
        }
        const collisionStats = this.physicsWorld.getCollisionStats();
        this.ballFriction.value = BALL_COLLISION.TANGENTIAL_FRICTION_COEFFICIENT.toFixed(3);
        this.collisionTotal.value = String(collisionStats.total);
        if (collisionStats.last) {
            this.collisionPair.value = `${collisionStats.last.a} ↔ ${collisionStats.last.b}`;
            this.collisionImpulse.value = `${collisionStats.last.impulseMagnitude.toFixed(4)} N·s`;
            this.collisionTangentImpulse.value = `${collisionStats.last.tangentImpulseMagnitude.toFixed(4)} N·s`;
            this.collisionSpeed.value = `${collisionStats.last.closingSpeed.toFixed(3)} m/s`;
            this.collisionTangentSpeed.value = `${collisionStats.last.tangentSpeed.toFixed(3)} m/s`;
            this.collisionSpinTransfer.value = `${collisionStats.last.omegaYA.toFixed(2)} / ${collisionStats.last.omegaYB.toFixed(2)} rad/s`;
        }
        else {
            this.collisionPair.value = "—";
            this.collisionImpulse.value = "—";
            this.collisionTangentImpulse.value = "—";
            this.collisionSpeed.value = "—";
            this.collisionTangentSpeed.value = "—";
            this.collisionSpinTransfer.value = "—";
        }
        this.railRestitution.value = CUSHION.RESTITUTION.toFixed(2);
        this.railFriction.value = CUSHION.TANGENTIAL_FRICTION_COEFFICIENT.toFixed(2);
        const railStats = this.physicsWorld.getRailCollisionStats();
        this.railTotal.value = String(railStats.total);
        if (railStats.last) {
            this.railLast.value = railStats.last.rail;
            this.railBall.value = railStats.last.ball;
            this.railNormalImpulse.value = `${railStats.last.normalImpulse.toFixed(4)} N·s`;
            this.railTangentImpulse.value = `${railStats.last.tangentImpulse.toFixed(4)} N·s`;
            this.railTangentSpeed.value = `${railStats.last.tangentSpeed.toFixed(3)} m/s`;
            this.railOmegaY.value = `${railStats.last.omegaYAfter.toFixed(2)} rad/s`;
        }
        else {
            this.railLast.value = "—";
            this.railBall.value = "—";
            this.railNormalImpulse.value = "—";
            this.railTangentImpulse.value = "—";
            this.railTangentSpeed.value = "—";
            this.railOmegaY.value = "—";
        }
        const captureStats = this.physicsWorld.getPocketCaptureStats();
        this.captureThroats.value = String(captureStats.throatCount);
        this.captureImpacts.value = String(captureStats.totalImpacts);
        if (captureStats.last) {
            this.captureBall.value = captureStats.last.ball;
            this.capturePocket.value = captureStats.last.pocket;
        }
        else {
            this.captureBall.value = "—";
            this.capturePocket.value = "—";
        }
        const returnStats = this.physicsWorld.getBallReturnStats();
        this.returnTriangles.value = String(returnStats.triangleCount);
        this.returnImpacts.value = String(returnStats.totalImpacts);
        if (returnStats.last) {
            this.returnBall.value = returnStats.last.ball;
            this.returnNormalImpulse.value = Number.isFinite(returnStats.last.floorY) ? `${returnStats.last.floorY.toFixed(3)} m` : "—";
            this.returnTangentImpulse.value = returnStats.last.reason ?? "—";
        }
        else {
            this.returnBall.value = "—";
            this.returnNormalImpulse.value = "—";
            this.returnTangentImpulse.value = "—";
        }
        if (returnStats.lastGuide) {
            this.returnGuideTarget.value = `${returnStats.lastGuide.side} · ${returnStats.lastGuide.stage ?? "DIRECT"} · ${returnStats.lastGuide.distance.toFixed(2)} m`;
            this.returnGuideAccel.value = `${returnStats.lastGuide.acceleration.toFixed(3)} m/s²`;
        }
        else {
            this.returnGuideTarget.value = "—";
            this.returnGuideAccel.value = "—";
        }
        const pocketStats = this.physicsWorld.getPocketStats();
        this.pocketEntries.value = String(pocketStats.totalEntries);
        this.pocketTotal.value = String(pocketStats.totalPocketed);
        if (pocketStats.lastPocketed) {
            this.pocketLast.value = pocketStats.lastPocketed.pocket;
            this.pocketBall.value = pocketStats.lastPocketed.ball;
        }
        else if (pocketStats.lastEntry) {
            this.pocketLast.value = `${pocketStats.lastEntry.pocket} (entering)`;
            this.pocketBall.value = pocketStats.lastEntry.ball;
        }
        else {
            this.pocketLast.value = "—";
            this.pocketBall.value = "—";
        }
        this.cuePocket.value = this.cueBallBody.pocketName ?? "—";
        const impact = this.shotSystem.getLastImpact();
        if (impact) {
            this.targetSpeed.value = `${impact.targetSpeed.toFixed(3)} m/s`;
            this.horizontalTargetSpeed.value = `${impact.horizontalTargetSpeed.toFixed(3)} m/s`;
            this.downwardTargetSpeed.value = `${impact.downwardTargetSpeed.toFixed(3)} m/s`;
            this.impulseOutput.value = `${impact.impulseMagnitude.toFixed(4)} N·s`;
            this.horizontalImpulseOutput.value = `${impact.horizontalImpulseMagnitude.toFixed(4)} N·s`;
            this.downwardImpulseOutput.value = `${impact.downwardImpulseMagnitude.toFixed(4)} N·s`;
            const angularMagnitude = impact.angularImpulse.length();
            this.angularImpulseOutput.value = `${angularMagnitude.toExponential(3)} N·m·s`;
            const dL = impact.angularImpulse;
            this.angularImpulseVector.value = `(${dL.x.toExponential(2)}, ${dL.y.toExponential(2)}, ${dL.z.toExponential(2)})`;
            const d = impact.direction;
            this.impactDirection.value = `(${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)})`;
            const r = impact.contactVector;
            this.contactVectorOutput.value = `(${r.x.toFixed(3)}, ${r.y.toFixed(3)}, ${r.z.toFixed(3)}) m`;
        }
        else {
            const freeTargetSpeed = SHOT.MAX_BALL_SPEED * power;
            const elevationRad = this.cueRig.getElevationDeg() * Math.PI / 180;
            const horizontalFactor = Math.cos(elevationRad);
            const downwardFactor = Math.max(0, Math.sin(elevationRad));
            const impulseMagnitude = this.cueBallBody.mass * freeTargetSpeed;
            this.targetSpeed.value = `${freeTargetSpeed.toFixed(3)} m/s`;
            this.horizontalTargetSpeed.value = `${(freeTargetSpeed * horizontalFactor).toFixed(3)} m/s`;
            this.downwardTargetSpeed.value = `${(freeTargetSpeed * downwardFactor).toFixed(3)} m/s`;
            this.impulseOutput.value = `${impulseMagnitude.toFixed(4)} N·s`;
            this.horizontalImpulseOutput.value = `${(impulseMagnitude * horizontalFactor).toFixed(4)} N·s`;
            this.downwardImpulseOutput.value = `${(impulseMagnitude * downwardFactor).toFixed(4)} N·s`;
            this.angularImpulseOutput.value = "on impact";
            this.angularImpulseVector.value = "on impact";
            this.impactDirection.value = "on impact";
            this.contactVectorOutput.value = "on impact";
        }
    }
}

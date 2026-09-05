//Encodes the authoritative 8-ball and Solo Runout rules used by both player and bot turns.

//RULE STATE
export const EightBallTableState = Object.freeze({
    BREAK_SETUP: "BREAK_SETUP",
    BREAK: "BREAK",
    OPEN: "OPEN",
    ASSIGNED: "ASSIGNED",
    GAME_OVER: "GAME_OVER"
});
export const PlayerGroup = Object.freeze({
    SOLIDS: "SOLIDS",
    STRIPES: "STRIPES"
});
export const PlacementMode = Object.freeze({
    KITCHEN: "KITCHEN",
    ANYWHERE: "ANYWHERE"
});
export const RuleMode = Object.freeze({
    SOLO_RUNOUT: "SOLO_RUNOUT",
    TWO_PLAYER: "TWO_PLAYER"
});

//HELPERS
function parseBallNumber(label) {
    if (typeof label !== "string") {
        return null;
    }
    const match = /^Ball\s+(\d+)$/.exec(label.trim());
    if (!match) {
        return null;
    }
    const number = Number(match[1]);
    return Number.isInteger(number) ? number : null;
}
function groupForBall(number) {
    if (number >= 1 && number <= 7) {
        return PlayerGroup.SOLIDS;
    }
    if (number >= 9 && number <= 15) {
        return PlayerGroup.STRIPES;
    }
    return null;
}
function oppositeGroup(group) {
    return group === PlayerGroup.SOLIDS ? PlayerGroup.STRIPES : PlayerGroup.SOLIDS;
}
function ballsForGroup(group) {
    if (group === PlayerGroup.SOLIDS) {
        return [1, 2, 3, 4, 5, 6, 7];
    }
    if (group === PlayerGroup.STRIPES) {
        return [9, 10, 11, 12, 13, 14, 15];
    }
    return [];
}
function uniqueNumbers(values) {
    return [
        ...new Set(values.filter(value => Number.isInteger(value)))
    ];
}

//RULE ENGINE
export class RuleSet8Ball {

    //INITIALIZATION
    constructor({ mode = RuleMode.SOLO_RUNOUT, playerNames = null } = {}) {
        this.mode = mode;
        this.playerNames = Array.isArray(playerNames) ? [
            playerNames[0] || null,
            playerNames[1] || null
        ] : [
            null,
            null
        ];
        this.reset();
    }
    isSolo() {
        return (this.mode === RuleMode.SOLO_RUNOUT);
    }

    //MATCH STATE
    reset() {
        this.tableState = EightBallTableState.BREAK_SETUP;
        this.currentPlayer = 0;
        this.players = [
            {
                id: 0,
                name: this.playerNames[0] ?? (this.isSolo() ? "Solo" : "Player 1"),
                group: null
            },
            {
                id: 1,
                name: this.playerNames[1] ?? (this.isSolo() ? "—" : "Player 2"),
                group: null
            }
        ];
        this.removedBalls = new Set();
        this.placementMode = PlacementMode.KITCHEN;
        this.calledEightPocket = null;
        this.winner = null;
        this.loser = null;
        this.gameOverReason = null;
        this.lastRuling = {
            legal: true,
            foul: false,
            foulReasons: [],
            message: this.isSolo() ? "Solo runout: place the cue ball in the kitchen for the opening break." : "Place the cue ball in the kitchen for the opening break.",
            turnContinues: false,
            switchedPlayer: false,
            ballInHand: true,
            placementMode: PlacementMode.KITCHEN,
            actions: []
        };
    }
    completePlacement() {
        if (this.placementMode === null) {
            return false;
        }
        const wasBreakSetup = this.tableState === EightBallTableState.BREAK_SETUP;
        this.placementMode = null;
        if (wasBreakSetup) {
            this.tableState = EightBallTableState.BREAK;
            this.lastRuling = {
                ...this.lastRuling,
                message: "Opening break ready.",
                ballInHand: false,
                placementMode: null
            };
        }
        return true;
    }
    isBreakShot() {
        return (this.tableState === EightBallTableState.BREAK);
    }
    isGameOver() {
        return (this.tableState === EightBallTableState.GAME_OVER);
    }
    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }
    getOpponentPlayer() {
        return this.players[1 - this.currentPlayer];
    }
    getPlayerGroup(index) {
        return (this.players[index]?.group ?? null);
    }
    getRemainingBallsForPlayer(index) {
        const group = this.getPlayerGroup(index);
        if (!group) {
            return [];
        }
        return ballsForGroup(group).filter(number => !this.removedBalls.has(number));
    }
    isPlayerOnEight(index) {
        const group = this.getPlayerGroup(index);
        return Boolean(group) && this.getRemainingBallsForPlayer(index).length === 0;
    }
    requiresEightPocketCall() {
        return (!this.isGameOver() && this.placementMode === null && this.tableState !== EightBallTableState.BREAK && this.isPlayerOnEight(this.currentPlayer));
    }
    callEightPocket(pocketName) {
        if (!this.requiresEightPocketCall()) {
            return false;
        }
        this.calledEightPocket = pocketName || null;
        return Boolean(this.calledEightPocket);
    }
    clearEightPocketCall() {
        this.calledEightPocket = null;
    }

    //SHOT VALIDATION
    canStartShot() {
        if (this.isGameOver() || this.placementMode !== null || this.tableState === EightBallTableState.BREAK_SETUP) {
            return false;
        }
        if (this.requiresEightPocketCall() && !this.calledEightPocket) {
            return false;
        }
        return true;
    }
    getShotLockReason() {
        if (this.isGameOver()) {
            return "Game over.";
        }
        if (this.placementMode !== null) {
            return this.placementMode === PlacementMode.KITCHEN ? "Place the cue ball in the kitchen first." : "Place the cue ball before shooting.";
        }
        if (this.requiresEightPocketCall() && !this.calledEightPocket) {
            return "Call a pocket for the 8-ball before shooting.";
        }
        return null;
    }

    //SHOT RULING
    //Resolve one completed shot into rule actions; physics never decides ownership, fouls or match results.
    evaluateShot(shot) {
        if (!shot) {
            return null;
        }
        const shooter = this.currentPlayer;
        const opponent = this.isSolo() ? shooter : 1 - shooter;
        const wasBreak = this.tableState === EightBallTableState.BREAK;
        const groupBefore = this.players[shooter].group;
        const onEightBefore = this.isPlayerOnEight(shooter);
        const calledPocket = this.calledEightPocket;
        const summary = shot.summary ?? {};
        const firstNumber = parseBallNumber(summary.firstObjectContact);
        const pocketedEvents = (summary.pocketedEvents ?? []).map(event => ({
            ...event,
            number: parseBallNumber(event.ball)
        })).filter(event => Number.isInteger(event.number));
        const pocketedNumbers = uniqueNumbers(pocketedEvents.map(event => event.number));
        const offTableNumbers = uniqueNumbers((shot.endSnapshot ?? []).filter(ball => ball.state === "FALLEN").map(ball => parseBallNumber(ball.label)).filter(number => Number.isInteger(number) && !this.removedBalls.has(number)));
        const eightPocketEvent = pocketedEvents.find(event => event.number === 8) ?? null;
        const eightOffTable = offTableNumbers.includes(8);
        const objectPocketedAfterHit = Boolean(summary.pocketAfterFirstObjectContact);
        const railAfterHit = Boolean(summary.railAfterFirstObjectContact);
        const foulReasons = [];
        let breakLegal = true;
        if (wasBreak) {
            const breakPocketedObject = pocketedNumbers.length > 0;
            breakLegal = breakPocketedObject || (summary.uniqueObjectRailBallCount ?? 0) >= 4;
            if (!breakLegal) {
                foulReasons.push("ILLEGAL_BREAK");
            }
            if (summary.scratch) {
                foulReasons.push("SCRATCH");
            }
            if (offTableNumbers.some(number => number !== 8)) {
                foulReasons.push("OBJECT_BALL_OFF_TABLE");
            }
        }
        else {
            if (firstNumber === null) {
                foulReasons.push("NO_OBJECT_CONTACT");
            }
            else if (groupBefore === null) {
                if (firstNumber === 8) {
                    foulReasons.push("EIGHT_BALL_FIRST_ON_OPEN_TABLE");
                }
            }
            else if (onEightBefore) {
                if (firstNumber !== 8) {
                    foulReasons.push("WRONG_BALL_FIRST");
                }
            }
            else {
                const firstGroup = groupForBall(firstNumber);
                if (firstGroup !== groupBefore) {
                    foulReasons.push("WRONG_BALL_FIRST");
                }
            }
            if (firstNumber !== null && !railAfterHit && !objectPocketedAfterHit) {
                foulReasons.push("NO_RAIL_OR_POCKET_AFTER_CONTACT");
            }
            if (summary.scratch) {
                foulReasons.push("SCRATCH");
            }
            if (offTableNumbers.some(number => number !== 8)) {
                foulReasons.push("OBJECT_BALL_OFF_TABLE");
            }
        }
        const foul = foulReasons.length > 0;
        const actions = [];
        if (wasBreak && !breakLegal) {
            actions.push({
                type: "RESET_RACK_FOR_REBREAK"
            });
            this.removedBalls.clear();
            for (const player of this.players) {
                player.group = null;
            }
            this.currentPlayer = this.isSolo() ? shooter : opponent;
            this.tableState = EightBallTableState.BREAK_SETUP;
            this.placementMode = PlacementMode.KITCHEN;
            this.calledEightPocket = null;
            const extraReasons = foulReasons.filter(reason => reason !== "ILLEGAL_BREAK");
            const reasonSuffix = extraReasons.length > 0 ? ` (${extraReasons.join(", ")})` : "";
            const decision = {
                legal: false,
                foul: true,
                foulReasons,
                message: this.isSolo() ? `Illegal break${reasonSuffix}. Rack reset: place the cue ball in the kitchen and break again.` : `Illegal break${reasonSuffix}. Rack reset: ${this.players[this.currentPlayer].name} gets the break from the kitchen.`,
                turnContinues: false,
                switchedPlayer: !this.isSolo(),
                currentPlayer: this.currentPlayer,
                ballInHand: true,
                placementMode: PlacementMode.KITCHEN,
                assignedGroup: null,
                calledEightPocket: null,
                pocketedNumbers,
                offTableNumbers,
                actions,
                gameOver: false,
                winner: null,
                loser: null,
                gameOverReason: null
            };
            this.lastRuling = decision;
            return decision;
        }
        if (!wasBreak && (eightPocketEvent || eightOffTable)) {
            let playerWins = false;
            let lossReason = null;
            if (!onEightBefore) {
                lossReason = "EIGHT_BALL_EARLY";
            }
            else if (eightOffTable) {
                lossReason = "EIGHT_BALL_OFF_TABLE";
            }
            else if (summary.scratch) {
                lossReason = "SCRATCH_ON_EIGHT";
            }
            else if (foul) {
                lossReason = "FOUL_ON_EIGHT";
            }
            else if (!calledPocket || eightPocketEvent.pocket !== calledPocket) {
                lossReason = "EIGHT_BALL_WRONG_POCKET";
            }
            else {
                playerWins = true;
            }
            this.#commitRemovedBalls({
                pocketedNumbers,
                offTableNumbers,
                keepEight: false
            });
            this.calledEightPocket = null;
            if (playerWins) {
                this.#finishGame(shooter, this.isSolo() ? null : opponent, "LEGAL_EIGHT_BALL");
            }
            else {
                this.#finishGame(this.isSolo() ? null : opponent, shooter, lossReason);
            }
            const decision = {
                legal: playerWins,
                foul,
                foulReasons,
                message: playerWins ? `${this.players[shooter].name} wins: legal 8-ball.` : `${this.players[shooter].name} loses: ${lossReason}.`,
                turnContinues: false,
                switchedPlayer: false,
                currentPlayer: this.currentPlayer,
                ballInHand: false,
                placementMode: null,
                calledEightPocket: calledPocket,
                pocketedNumbers,
                offTableNumbers,
                actions,
                gameOver: true,
                winner: this.winner,
                loser: this.loser,
                gameOverReason: this.gameOverReason
            };
            this.lastRuling = decision;
            return decision;
        }
        if (wasBreak && (eightPocketEvent || eightOffTable)) {
            actions.push({
                type: "RESPOT_EIGHT"
            });
        }
        this.#commitRemovedBalls({
            pocketedNumbers,
            offTableNumbers,
            keepEight: wasBreak && (Boolean(eightPocketEvent) || eightOffTable)
        });
        let assignedGroup = null;
        if (!wasBreak && !foul && this.players[shooter].group === null) {
            const firstEligiblePocket = pocketedEvents.find(event => groupForBall(event.number) !== null);
            if (firstEligiblePocket) {
                assignedGroup = groupForBall(firstEligiblePocket.number);
                this.players[shooter].group = assignedGroup;
                if (!this.isSolo()) {
                    this.players[opponent].group = oppositeGroup(assignedGroup);
                }
                this.tableState = EightBallTableState.ASSIGNED;
            }
        }
        if (wasBreak) {
            this.tableState = EightBallTableState.OPEN;
        }
        else if (this.players[0].group === null) {
            this.tableState = EightBallTableState.OPEN;
        }
        else {
            this.tableState = EightBallTableState.ASSIGNED;
        }
        let turnContinues = false;
        let switchedPlayer = false;
        let ballInHand = false;
        let placementMode = null;
        if (foul) {
            this.currentPlayer = opponent;
            switchedPlayer = !this.isSolo();
            ballInHand = true;
            placementMode = wasBreak ? PlacementMode.KITCHEN : PlacementMode.ANYWHERE;
            this.placementMode = placementMode;
        }
        else if (wasBreak) {
            const legallyPocketedForContinuation = pocketedNumbers.some(number => number !== 8) || Boolean(eightPocketEvent);
            turnContinues = legallyPocketedForContinuation;
            if (!turnContinues && !this.isSolo()) {
                this.currentPlayer = opponent;
                switchedPlayer = true;
            }
            if (this.isSolo()) {
                turnContinues = true;
            }
            this.placementMode = null;
        }
        else {
            const shooterGroup = this.players[shooter].group;
            if (shooterGroup === null) {
                turnContinues = pocketedEvents.some(event => groupForBall(event.number) !== null);
            }
            else if (onEightBefore) {
                turnContinues = false;
            }
            else {
                turnContinues = pocketedEvents.some(event => groupForBall(event.number) === shooterGroup);
            }
            if (!turnContinues && !this.isSolo()) {
                this.currentPlayer = opponent;
                switchedPlayer = true;
            }
            if (this.isSolo()) {
                turnContinues = true;
            }
            this.placementMode = null;
        }
        this.calledEightPocket = null;
        const decision = {
            legal: !foul,
            foul,
            foulReasons,
            message: this.#buildRulingMessage({
                shooter,
                foul,
                foulReasons,
                wasBreak,
                breakLegal,
                assignedGroup,
                turnContinues,
                ballInHand,
                placementMode
            }),
            turnContinues,
            switchedPlayer,
            currentPlayer: this.currentPlayer,
            ballInHand,
            placementMode,
            assignedGroup,
            calledEightPocket: calledPocket,
            pocketedNumbers,
            offTableNumbers,
            actions,
            gameOver: false,
            winner: null,
            loser: null,
            gameOverReason: null
        };
        this.lastRuling = decision;
        return decision;
    }
    forceSoloLoss(reason = "SOLO_MOVE_LIMIT") {
        if (!this.isSolo() || this.isGameOver()) {
            return null;
        }
        this.#finishGame(null, 0, reason);
        const decision = {
            legal: false,
            foul: false,
            foulReasons: [],
            message: "KILL's limit has been reached. Marzius is not deemed worthy.",
            turnContinues: false,
            switchedPlayer: false,
            currentPlayer: this.currentPlayer,
            ballInHand: false,
            placementMode: null,
            assignedGroup: null,
            calledEightPocket: null,
            pocketedNumbers: [],
            offTableNumbers: [],
            actions: [],
            gameOver: true,
            winner: null,
            loser: 0,
            gameOverReason: reason
        };
        this.lastRuling = decision;
        return decision;
    }

    //PUBLIC STATE
    getState() {
        return {
            mode: this.mode,
            solo: this.isSolo(),
            tableState: this.tableState,
            currentPlayer: this.currentPlayer,
            currentPlayerName: this.players[this.currentPlayer].name,
            players: this.players.map(player => ({
                ...player,
                remaining: this.getRemainingBallsForPlayer(player.id)
            })),
            placementMode: this.placementMode,
            calledEightPocket: this.calledEightPocket,
            mustCallEightPocket: this.requiresEightPocketCall(),
            currentPlayerOnEight: this.isPlayerOnEight(this.currentPlayer),
            canStartShot: this.canStartShot(),
            shotLockReason: this.getShotLockReason(),
            winner: this.winner,
            loser: this.loser,
            gameOverReason: this.gameOverReason,
            lastRuling: this.lastRuling ? {
                ...this.lastRuling,
                foulReasons: [
                    ...(this.lastRuling.foulReasons ?? [])
                ],
                actions: [
                    ...(this.lastRuling.actions ?? [])
                ]
            } : null
        };
    }

    //INTERNAL STATE
    #commitRemovedBalls({ pocketedNumbers, offTableNumbers, keepEight }) {
        for (const number of [
            ...pocketedNumbers,
            ...offTableNumbers
        ]) {
            if (number === 8 && keepEight) {
                continue;
            }
            this.removedBalls.add(number);
        }
        if (keepEight) {
            this.removedBalls.delete(8);
        }
    }
    #finishGame(winner, loser, reason) {
        this.winner = winner;
        this.loser = loser;
        this.gameOverReason = reason;
        if (Number.isInteger(winner)) {
            this.currentPlayer = winner;
        }
        this.placementMode = null;
        this.calledEightPocket = null;
        this.tableState = EightBallTableState.GAME_OVER;
    }
    #buildRulingMessage({ shooter, foul, foulReasons, wasBreak, assignedGroup, turnContinues, ballInHand, placementMode }) {
        const name = this.players[shooter].name;
        if (foul) {
            const bih = ballInHand ? (this.isSolo() ? (placementMode === PlacementMode.KITCHEN ? " Ball-in-hand in the kitchen; continue the solo runout." : " Ball-in-hand anywhere; continue the solo runout.") : (placementMode === PlacementMode.KITCHEN ? " Opponent: ball-in-hand in the kitchen." : " Opponent: ball-in-hand anywhere.")) : "";
            return `${name}: foul (${foulReasons.join(", ")}).${bih}`;
        }
        const fragments = [];
        if (wasBreak) {
            fragments.push("Legal break.");
        }
        if (assignedGroup) {
            fragments.push(`${name} = ${assignedGroup}.`);
        }
        fragments.push(this.isSolo() ? "Solo runout continues." : (turnContinues ? `${name} continues.` : `Turn passes to ${this.players[this.currentPlayer].name}.`));
        return fragments.join(" ");
    }
}

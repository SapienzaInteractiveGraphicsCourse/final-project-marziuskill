//SOLO LIMITS
const DIFFICULTY = Object.freeze({
    EASY: Object.freeze({
        moveLimit: 42,
        foulExtraMoves: 2,
        wrongBallExtraMoves: 1
    }),
    MEDIUM: Object.freeze({
        moveLimit: 32,
        foulExtraMoves: 2,
        wrongBallExtraMoves: 1
    }),
    HARD: Object.freeze({
        moveLimit: 24,
        foulExtraMoves: 2,
        wrongBallExtraMoves: 1
    })
});

//HELPERS
function groupForNumber(number) {
    if (number >= 1 && number <= 7) {
        return "SOLIDS";
    }
    if (number >= 9 && number <= 15) {
        return "STRIPES";
    }
    return null;
}

//SOLO CHALLENGE
export class SoloChallenge {
    constructor(difficulty = "MEDIUM") {
        this.setDifficulty(difficulty);
        this.reset();
    }
    setDifficulty(difficulty) {
        this.difficulty = DIFFICULTY[difficulty] ? difficulty : "MEDIUM";
        this.profile = DIFFICULTY[this.difficulty];
    }
    reset() {
        this.movesUsed = 0;
        this.lastCost = 0;
        this.lastPenalty = 0;
        this.lastWrongBalls = [];
    }
    recordShot({ ruling, ruleStateBefore, ruleStateAfter }) {
        const wasBreak = ruleStateBefore?.tableState === "BREAK";
        const playerGroup = ruleStateAfter?.players?.[0]?.group ?? null;
        const pocketed = ruling?.pocketedNumbers ?? [];
        const wrongBalls = !wasBreak && playerGroup ? pocketed.filter(number => {
            const group = groupForNumber(number);
            return Boolean(group) && group !== playerGroup;
        }) : [];
        const foulPenalty = ruling?.foul ? this.profile.foulExtraMoves : 0;
        const wrongBallPenalty = wrongBalls.length * this.profile.wrongBallExtraMoves;
        const penalty = foulPenalty + wrongBallPenalty;
        const cost = 1 + penalty;
        this.movesUsed += cost;
        this.lastCost = cost;
        this.lastPenalty = penalty;
        this.lastWrongBalls = [
            ...wrongBalls
        ];
        return this.getState();
    }
    isLimitReached() {
        return (this.movesUsed >= this.profile.moveLimit);
    }
    getState() {
        return {
            difficulty: this.difficulty,
            moveLimit: this.profile.moveLimit,
            movesUsed: this.movesUsed,
            movesRemaining: Math.max(0, this.profile.moveLimit - this.movesUsed),
            lastCost: this.lastCost,
            lastPenalty: this.lastPenalty,
            lastWrongBalls: [...this.lastWrongBalls]
        };
    }
}

//DIFFICULTY PROFILES
export const BotDifficulty = Object.freeze({
    EASY: "EASY",
    MEDIUM: "MEDIUM",
    HARD: "HARD"
});
export const BOT_DIFFICULTY_PROFILES = Object.freeze({
    [BotDifficulty.EASY]: Object.freeze({
        id: BotDifficulty.EASY,
        label: "Easy",
        maxGeometricRoutes: 2,
        maxFallbackTargets: 2,
        aimOffsetsDeg: [-0.90, 0, 0.90],
        powerFactors: [0.92, 1.08],
        breakAimOffsetsDeg: [-1.5, 0, 1.5],
        breakPowers: [0.82, 0.96],
        topResultsToKeep: 4,
        choiceTopK: 3,
        choiceScoreWindow: 220,
        maxYawErrorDeg: 0.90,
        maxPowerRelativeError: 0.08
    }),
    [BotDifficulty.MEDIUM]: Object.freeze({
        id: BotDifficulty.MEDIUM,
        label: "Medium",
        maxGeometricRoutes: 5,
        maxFallbackTargets: 4,
        aimOffsetsDeg: [-0.45, 0, 0.45],
        powerFactors: [0.90, 1.06],
        breakAimOffsetsDeg: [-1.5, -0.75, 0, 0.75, 1.5],
        breakPowers: [0.78, 0.90, 1.00],
        topResultsToKeep: 5,
        choiceTopK: 1,
        choiceScoreWindow: 0,
        maxYawErrorDeg: 0.25,
        maxPowerRelativeError: 0.025
    }),
    [BotDifficulty.HARD]: Object.freeze({
        id: BotDifficulty.HARD,
        label: "Hard",
        maxGeometricRoutes: 7,
        maxFallbackTargets: 6,
        aimOffsetsDeg: [-0.45, -0.225, 0, 0.225, 0.45],
        powerFactors: [0.90, 0.98, 1.06],
        breakAimOffsetsDeg: [-1.5, -0.75, 0, 0.75, 1.5],
        breakPowers: [0.84, 0.92, 1.00],
        topResultsToKeep: 7,
        choiceTopK: 1,
        choiceScoreWindow: 0,
        maxYawErrorDeg: 0,
        maxPowerRelativeError: 0
    })
});
export function getBotDifficultyProfile(difficulty) {
    return (BOT_DIFFICULTY_PROFILES[difficulty] ?? BOT_DIFFICULTY_PROFILES[BotDifficulty.MEDIUM]);
}
export function getBotDifficultyOptions() {
    return [
        BotDifficulty.EASY,
        BotDifficulty.MEDIUM,
        BotDifficulty.HARD
    ].map(id => ({
        id,
        label: BOT_DIFFICULTY_PROFILES[id].label
    }));
}

//DETERMINISTIC VARIATION
function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function deterministicUnit(seed) {
    let x = hashString(seed);
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967295;
}
function deterministicSigned(seed) {
    return deterministicUnit(seed) * 2 - 1;
}
export function chooseDifficultyResult({ results, tableSignature, difficulty }) {
    if (!Array.isArray(results) || results.length === 0) {
        return { result: null, rank: null };
    }
    const profile = getBotDifficultyProfile(difficulty);
    if (profile.choiceTopK <= 1) {
        return { result: results[0], rank: 1 };
    }
    const bestScore = results[0].score;
    const eligible = results.slice(0, profile.choiceTopK).filter(entry => bestScore - entry.score <= profile.choiceScoreWindow);
    if (eligible.length <= 1) {
        return { result: results[0], rank: 1 };
    }
    const unit = deterministicUnit(`${tableSignature}|${difficulty}|choice`);
    const index = Math.min(eligible.length - 1, Math.floor(unit * eligible.length));
    const result = eligible[index];
    return {
        result,
        rank: results.indexOf(result) + 1
    };
}
function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
export function buildDifficultyExecution({ candidate, tableSignature, difficulty, minPower, maxPower }) {
    if (!candidate) {
        return null;
    }
    const profile = getBotDifficultyProfile(difficulty);
    const yawErrorDeg = deterministicSigned(`${tableSignature}|${difficulty}|yaw`) * profile.maxYawErrorDeg;
    const powerRelativeError = deterministicSigned(`${tableSignature}|${difficulty}|power`) * profile.maxPowerRelativeError;
    const appliedPower = clamp(candidate.power * (1 + powerRelativeError), minPower, maxPower);
    return {
        candidate: {
            ...candidate,
            yawDeg: candidate.yawDeg + yawErrorDeg,
            power: appliedPower
        },
        error: {
            yawDeg: yawErrorDeg,
            powerRelative: powerRelativeError,
            powerAbsolute: appliedPower - candidate.power
        }
    };
}

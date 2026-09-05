//BALL MAPPING
export const BALL_ASSET_TO_NUMBER = Object.freeze({
    Ball_00_Cue: 0,
    Ball_01: 1,
    Ball_02: 7,
    Ball_03: 13,
    Ball_04: 14,
    Ball_05: 8,
    Ball_06: 2,
    Ball_07: 6,
    Ball_08: 9,
    Ball_09: 4,
    Ball_10: 15,
    Ball_11: 10,
    Ball_12: 5,
    Ball_13: 12,
    Ball_14: 3,
    Ball_15: 11
});
export const BALL_NUMBER_TO_ASSET = Object.freeze(Object.fromEntries(Object.entries(BALL_ASSET_TO_NUMBER).map(([assetName, number]) => [
    number,
    assetName
])));

//LOOKUPS
export function getBallNumberForAsset(assetName) {
    const number = BALL_ASSET_TO_NUMBER[assetName];
    return Number.isInteger(number) ? number : null;
}
export function getBallAssetForNumber(number) {
    return (BALL_NUMBER_TO_ASSET[number] ?? null);
}
export function makeLogicalBallLabel(number) {
    if (number === 0) {
        return "Cue ball";
    }
    return `Ball ${String(number).padStart(2, "0")}`;
}

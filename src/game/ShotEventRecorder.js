//DEPENDENCIES
import { EventType } from "../events/EventTypes.js";

//HELPERS
function clonePlain(value) {
    if (value === null || value === undefined || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(clonePlain);
    }
    const result = {};
    for (const [key, child] of Object.entries(value)) {
        if (typeof child !== "function") {
            result[key] = clonePlain(child);
        }
    }
    return result;
}
function isCueBall(label) {
    return label === "Cue ball";
}
function summarize(events) {
    let firstObjectContact = null;
    let firstObjectContactSequence = null;
    let ballContactCount = 0;
    let railContactCount = 0;
    let scratch = false;
    const pocketedBalls = [];
    const pocketedEvents = [];
    const uniqueRailBalls = new Set();
    const uniqueObjectRailBalls = new Set();
    for (const event of events) {
        if (event.type === EventType.BALL_CONTACT) {
            ballContactCount += 1;
            if (firstObjectContact === null) {
                let other = null;
                if (isCueBall(event.a)) {
                    other = event.b;
                }
                else if (isCueBall(event.b)) {
                    other = event.a;
                }
                if (other) {
                    firstObjectContact = other;
                    firstObjectContactSequence = event.sequence;
                }
            }
        }
        else if (event.type === EventType.RAIL_CONTACT) {
            railContactCount += 1;
            if (event.ball) {
                uniqueRailBalls.add(event.ball);
                if (!isCueBall(event.ball)) {
                    uniqueObjectRailBalls.add(event.ball);
                }
            }
        }
        else if (event.type === EventType.BALL_POCKETED) {
            pocketedBalls.push(event.ball);
            pocketedEvents.push({
                ball: event.ball,
                pocket: event.pocket,
                sequence: event.sequence
            });
            if (isCueBall(event.ball)) {
                scratch = true;
            }
        }
    }
    const railAfterFirstObjectContact = firstObjectContactSequence !== null && events.some(event => event.type === EventType.RAIL_CONTACT && event.sequence > firstObjectContactSequence);
    const pocketAfterFirstObjectContact = firstObjectContactSequence !== null && pocketedEvents.some(event => event.sequence > firstObjectContactSequence);
    return {
        firstObjectContact,
        firstObjectContactSequence,
        ballContactCount,
        railContactCount,
        uniqueRailBalls: [...uniqueRailBalls],
        uniqueObjectRailBalls: [...uniqueObjectRailBalls],
        uniqueObjectRailBallCount: uniqueObjectRailBalls.size,
        railAfterFirstObjectContact,
        pocketAfterFirstObjectContact,
        pocketedBalls,
        pocketedEvents,
        pocketCount: pocketedBalls.length,
        scratch
    };
}
function formatTime(time, startTime) {
    if (!Number.isFinite(time) || !Number.isFinite(startTime)) {
        return "?.???";
    }
    return Math.max(0, time - startTime).toFixed(3);
}
function formatEvent(event, startTime) {
    const t = formatTime(event.simulationTime, startTime);
    switch (event.type) {
        case EventType.SHOT_STARTED: return `${t}  SHOT_STARTED`;
        case EventType.BALL_CONTACT: return `${t}  BALL   ${event.a} ↔ ${event.b}`;
        case EventType.RAIL_CONTACT: return `${t}  RAIL   ${event.ball} → ${event.rail}`;
        case EventType.POCKET_ENTRY: return `${t}  ENTRY  ${event.ball} → ${event.pocket}`;
        case EventType.BALL_POCKETED: return `${t}  POCKET ${event.ball} → ${event.pocket}`;
        case EventType.SHOT_ENDED: return `${t}  SHOT_ENDED`;
        default: return `${t}  ${event.type}`;
    }
}

//SHOT RECORDER
export class ShotEventRecorder {
    constructor({ maxHistory = 64 } = {}) {
        this.maxHistory = maxHistory;
        this.currentShot = null;
        this.lastShot = null;
        this.history = [];
    }
    reset() {
        this.currentShot = null;
        this.lastShot = null;
        this.history = [];
    }
    hasActiveShot() {
        return this.currentShot !== null;
    }
    beginShot({ shotNumber, simulationTime, impact = null }) {
        if (this.currentShot) {
            throw new Error("Cannot begin a new shot while another shot is active.");
        }
        this.currentShot = {
            shotNumber,
            startTime: simulationTime,
            endTime: null,
            impact: clonePlain(impact),
            events: [],
            endSnapshot: null
        };
        this.#append({
            type: EventType.SHOT_STARTED,
            simulationTime,
            impact: clonePlain(impact)
        });
        return this.getCurrentView();
    }
    record(event) {
        if (!this.currentShot || !event || !event.type) {
            return false;
        }
        if (event.type === EventType.SHOT_STARTED || event.type === EventType.SHOT_ENDED) {
            return false;
        }
        this.#append(clonePlain(event));
        return true;
    }
    endShot({ simulationTime, balls = [] }) {
        if (!this.currentShot) {
            return null;
        }
        this.#append({
            type: EventType.SHOT_ENDED,
            simulationTime
        });
        this.currentShot.endTime = simulationTime;
        this.currentShot.endSnapshot = balls.map(ball => ({
            label: ball.label,
            state: ball.state,
            pocket: ball.pocketName ?? null,
            pocketCommitted: Boolean(ball.pocketCommitted),
            position: {
                x: ball.position.x,
                y: ball.position.y,
                z: ball.position.z
            }
        }));
        const completed = this.#view(this.currentShot);
        this.lastShot = this.currentShot;
        this.history.push(this.currentShot);
        if (this.history.length > this.maxHistory) {
            this.history.splice(0, this.history.length - this.maxHistory);
        }
        this.currentShot = null;
        return completed;
    }
    getCurrentView() {
        return this.currentShot ? this.#view(this.currentShot) : null;
    }
    getLastView() {
        return this.lastShot ? this.#view(this.lastShot) : null;
    }
    getHistory() {
        return this.history.map(shot => this.#view(shot));
    }
    #append(event) {
        const sequence = this.currentShot.events.length;
        this.currentShot.events.push({
            ...event,
            sequence
        });
    }
    #view(shot) {
        const events = shot.events.map(clonePlain);
        return {
            shotNumber: shot.shotNumber,
            startTime: shot.startTime,
            endTime: shot.endTime,
            duration: shot.endTime === null ? null : Math.max(0, shot.endTime - shot.startTime),
            impact: clonePlain(shot.impact),
            events,
            eventCount: events.length,
            eventLines: events.map(event => formatEvent(event, shot.startTime)),
            summary: summarize(events),
            endSnapshot: clonePlain(shot.endSnapshot)
        };
    }
}

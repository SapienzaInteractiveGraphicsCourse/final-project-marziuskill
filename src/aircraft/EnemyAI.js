import * as THREE from "three";

export class EnemyAI {
    constructor(enemyAircraft, machineGun, playerObject, playerTarget, homeBase, homeRunway, island, {
        oceanHeight = 0,
        detectionRange = 500,
        disengageRange = 700,
        attackRange = 190,
        fireRange = 165
    } = {}) {
        this.enemy = enemyAircraft;
        this.model = enemyAircraft.getModel();
        this.stats = enemyAircraft.getStats();
        this.root = enemyAircraft.getObject3D();

        this.machineGun = machineGun;
        this.player = playerObject;
        this.playerTarget = playerTarget;
        this.homeBase = homeBase;
        this.homeRunway = homeRunway;
        this.island = island;
        this.oceanHeight = oceanHeight;

        this.state = "PATROL";

        this.detectionRange = detectionRange;
        this.disengageRange = disengageRange;
        this.attackRange = attackRange;
        this.fireRange = fireRange;
        this.breakDistance = 45;

        this.minSpeed = 7;
        this.cruiseSpeed = 14;
        this.attackSpeed = 18;
        this.returnSpeed = 16;
        this.maxSpeed = 20;
        this.acceleration = 5;

        this.speed = this.cruiseSpeed;
        this.turnRate = THREE.MathUtils.degToRad(38);
        this.maxBank = THREE.MathUtils.degToRad(35);

        this.returnFuelRatio = 0.25;
        this.returnAmmoRatio = 0.10;

        // Landing / ground operations
        this.runwayHeading = 0;
        this.runwayLength = 220;

        this.approachDistance = 180;
        this.approachAltitude = 55;
        this.finalAltitude = 16;

        this.approachSpeed = 12;
        this.landingSpeed = 8;
        this.groundRollDeceleration = 5;
        this.takeoffAcceleration = 5;
        this.takeoffSpeed = 8;

        this.takeoffDuration = 1.0;
        this.takeoffElapsed = 0;
        this.takeoffLift = 3;

        this.serviceDuration = 2.0;
        this.serviceElapsed = 0;

        this.enemyGroundPitch = THREE.MathUtils.degToRad(12);
        this.enemyGroundSpeed = 0;
        this.minTerrainClearance = 30;

        this.projectileSpeed = 170;
        this.leadFactor = 0.65;

        this.patrolRadius = 180;
        this.patrolAltitude = 150;
        this.patrolPoints = [];
        this.patrolIndex = 0;

        this.forward = new THREE.Vector3();
        this.desiredDirection = new THREE.Vector3();
        this.localDirection = new THREE.Vector3();
        this.playerPosition = new THREE.Vector3();
        this.previousPlayerPosition = new THREE.Vector3();
        this.playerVelocity = new THREE.Vector3();
        this.aimPoint = new THREE.Vector3();
        this.navigationTarget = new THREE.Vector3();
        this.breakTarget = new THREE.Vector3();
        this.basePosition = new THREE.Vector3();
        this.lookAheadPosition = new THREE.Vector3();

        this.worldUp = new THREE.Vector3(0, 1, 0);
        this.rightAxis = new THREE.Vector3();
        this.upAxis = new THREE.Vector3();
        this.backAxis = new THREE.Vector3();
        this.localZAxis = new THREE.Vector3(0, 0, 1);

        this.inverseQuaternion = new THREE.Quaternion();
        this.desiredQuaternion = new THREE.Quaternion();
        this.bankQuaternion = new THREE.Quaternion();
        this.rotationMatrix = new THREE.Matrix4();

        this.runwayCenter = new THREE.Vector3();
        this.runwayForward = new THREE.Vector3();
        this.approachPoint = new THREE.Vector3();
        this.finalPoint = new THREE.Vector3();
        this.touchdownPoint = new THREE.Vector3();

        this.groundQuaternion = new THREE.Quaternion();
        this.groundPitchQuaternion = new THREE.Quaternion();

        this.takeoffStartPosition = new THREE.Vector3();
        this.takeoffStartQuaternion = new THREE.Quaternion();

        this.player.getWorldPosition(this.previousPlayerPosition);
        this._createPatrolPoints();

        console.log("Enemy AI initialized: PATROL");
    }

    _setState(state) {
        if (this.state === state) return;
        console.log(`ENEMY AI: ${this.state} -> ${state}`);
        this.state = state;
    }

    _createPatrolPoints() {
        this.homeBase.getObject3D().getWorldPosition(this.basePosition);

        const x = this.basePosition.x;
        const z = this.basePosition.z;
        const r = this.patrolRadius;

        const positions = [
            [x + r, z],
            [x, z - r],
            [x - r, z],
            [x, z + r]
        ];

        this.patrolPoints = positions.map(([px, pz]) => {
            const terrain = Math.max(this.island.getHeightAt(px, pz), this.oceanHeight);
            const y = Math.max(terrain + this.minTerrainClearance, this.patrolAltitude);
            return new THREE.Vector3(px, y, pz);
        });
    }

    _updatePlayerVelocity(deltaTime) {
        this.player.getWorldPosition(this.playerPosition);

        if (deltaTime > 0) {
            this.playerVelocity
                .copy(this.playerPosition)
                .sub(this.previousPlayerPosition)
                .divideScalar(deltaTime);
        }

        this.previousPlayerPosition.copy(this.playerPosition);
    }

    _updateRunwayGeometry() {
        this.homeRunway.getObject3D().getWorldPosition(this.runwayCenter);

        this.runwayForward.set(
            Math.sin(this.runwayHeading),
            0,
            -Math.cos(this.runwayHeading)
        ).normalize();

        // Long final approach, behind the near runway threshold
        this.approachPoint
            .copy(this.runwayCenter)
            .addScaledVector(this.runwayForward, -(this.runwayLength * 0.5 + this.approachDistance));

        this.approachPoint.y = this.homeRunway.getSurfaceHeight() + this.approachAltitude;

        // Short final
        this.finalPoint
            .copy(this.runwayCenter)
            .addScaledVector(this.runwayForward, -this.runwayLength * 0.55);

        this.finalPoint.y = this.homeRunway.getSurfaceHeight() + this.finalAltitude;

        // Touchdown a little after the beginning of the runway
        this.touchdownPoint
            .copy(this.runwayCenter)
            .addScaledVector(this.runwayForward, -this.runwayLength * 0.32);

        this.touchdownPoint.y = this.homeRunway.getSurfaceHeight();
    }

    _updateApproach(deltaTime) {
        if (this.homeBase.isDestroyed()) {
            this.model.setLandingGearDown(false);
            this._setState("PATROL");
            return;
        }

        this._updateRunwayGeometry();

        this._updateSpeed(this.approachSpeed, deltaTime);
        this._steerToward(this.finalPoint, deltaTime);
        this._move(deltaTime);

        if (this.root.position.distanceTo(this.finalPoint) <= 25) {
            this._setState("LANDING");
        }
    }

    _updateLanding(deltaTime) {
        this._updateRunwayGeometry();

        this._updateSpeed(this.landingSpeed, deltaTime);

        this.desiredDirection
            .copy(this.touchdownPoint)
            .sub(this.root.position)
            .normalize();

        this._steerToward(this.touchdownPoint, deltaTime);
        this._move(deltaTime);

        const runwayHeight = this.homeRunway.getSurfaceHeight();
        const horizontalDistance = Math.hypot(
            this.root.position.x - this.touchdownPoint.x,
            this.root.position.z - this.touchdownPoint.z
        );

        if (horizontalDistance <= 10 && this.root.position.y <= runwayHeight + 3) {
            this.root.position.y = runwayHeight;

            this.enemyGroundSpeed = this.landingSpeed;
            this._alignToRunway();

            this.model.setGroundMotion({
                active: true,
                speed: this.enemyGroundSpeed,
                steering: 0
            });

            console.log("ENEMY TOUCHDOWN");
            this._setState("GROUND_ROLL");
        }
    }

    _alignToRunway() {
        this.groundQuaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, -1),
            this.runwayForward
        );

        this.groundPitchQuaternion.setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            this.enemyGroundPitch
        );

        this.groundQuaternion.multiply(this.groundPitchQuaternion);
        this.root.quaternion.copy(this.groundQuaternion);
    }

    _updateGroundRoll(deltaTime) {
        this.enemyGroundSpeed = Math.max(
            0,
            this.enemyGroundSpeed - this.groundRollDeceleration * deltaTime
        );

        this._alignToRunway();

        this.root.position.addScaledVector(
            this.runwayForward,
            this.enemyGroundSpeed * deltaTime
        );

        this.root.position.y = this.homeRunway.getSurfaceHeight();

        this.model.setGroundMotion({
            active: true,
            speed: this.enemyGroundSpeed,
            steering: 0
        });

        this.model.setControls({
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: this.enemyGroundSpeed / this.maxSpeed,
            enginePowered: this.stats.hasFuel()
        });

        if (this.enemyGroundSpeed <= 0.1) {
            this.enemyGroundSpeed = 0;
            this.serviceElapsed = 0;

            console.log("ENEMY STOPPED FOR SERVICE");
            this._setState("SERVICE");
        }
    }

    _getPlayerDistance() {
        return this.root.position.distanceTo(this.playerPosition);
    }

    _shouldReturnToBase() {
        if (!this.homeBase || this.homeBase.isDestroyed()) return false;

        const fuelRatio = this.stats.fuel / this.stats.maxFuel;
        const innerRatio = this.stats.innerAmmo / this.stats.maxInnerAmmo;
        const outerRatio = this.stats.outerAmmo / this.stats.maxOuterAmmo;

        return fuelRatio <= this.returnFuelRatio ||
            (innerRatio <= this.returnAmmoRatio && outerRatio <= this.returnAmmoRatio);
    }

    _updateState(distance) {
        if (this.state !== "RETURN_TO_BASE" && this._shouldReturnToBase()) {
            this._setState("RETURN_TO_BASE");
            return;
        }

        if (this.state === "RETURN_TO_BASE") {
            if (this.homeBase.isDestroyed()) {
                this.model.setLandingGearDown(false);
                this._setState(distance <= this.detectionRange ? "INTERCEPT" : "PATROL");
                return;
            }

            this._updateRunwayGeometry();

            if (this.root.position.distanceTo(this.approachPoint) <= 35) {
                this.model.setLandingGearDown(true);
                this._setState("APPROACH");
            }

            return;
        }

        if (
            this.state === "APPROACH" ||
            this.state === "LANDING" ||
            this.state === "GROUND_ROLL" ||
            this.state === "SERVICE" ||
            this.state === "TAKEOFF_ROLL" ||
            this.state === "TAKEOFF"
        ) {
            return;
        }

        if (this.playerTarget.isDestroyed()) {
            this._setState("PATROL");
            return;
        }

        if (this.state === "PATROL") {
            if (distance <= this.detectionRange) this._setState("INTERCEPT");
            return;
        }

        if (this.state === "INTERCEPT") {
            if (distance > this.disengageRange) {
                this._setState("PATROL");
            } else if (distance <= this.attackRange) {
                this._setState("ATTACK");
            }
            return;
        }

        if (this.state === "ATTACK") {
            if (distance > this.attackRange * 1.3) {
                this._setState("INTERCEPT");
            }
        }
    }

    _getPatrolTarget() {
        const target = this.patrolPoints[this.patrolIndex];

        if (this.root.position.distanceTo(target) <= 30) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        }

        return this.patrolPoints[this.patrolIndex];
    }

    _getInterceptTarget() {
        return this.playerPosition;
    }

    _getAttackTarget(distance) {
        if (distance <= this.breakDistance) {
            this.forward.set(0, 0, -1).applyQuaternion(this.root.quaternion).normalize();

            this.breakTarget
                .copy(this.root.position)
                .sub(this.playerPosition)
                .normalize()
                .multiplyScalar(120)
                .add(this.root.position);

            this.breakTarget.y += 35;
            return this.breakTarget;
        }

        const leadTime = THREE.MathUtils.clamp(distance / this.projectileSpeed, 0, 1.2) * this.leadFactor;

        this.aimPoint
            .copy(this.playerPosition)
            .addScaledVector(this.playerVelocity, leadTime);

        return this.aimPoint;
    }

    _getReturnTarget() {
        this._updateRunwayGeometry();
        return this.approachPoint;
    }

    _applyTerrainAvoidance(target) {
        this.forward.set(0, 0, -1).applyQuaternion(this.root.quaternion).normalize();

        this.lookAheadPosition
            .copy(this.root.position)
            .addScaledVector(this.forward, 60);

        const currentTerrain = Math.max(
            this.island.getHeightAt(this.root.position.x, this.root.position.z),
            this.oceanHeight
        );

        const aheadTerrain = Math.max(
            this.island.getHeightAt(this.lookAheadPosition.x, this.lookAheadPosition.z),
            this.oceanHeight
        );

        const safeY = Math.max(currentTerrain, aheadTerrain) + this.minTerrainClearance;

        if (target.y < safeY) target.y = safeY;
    }

    _steerToward(target, deltaTime) {
        this.desiredDirection.copy(target).sub(this.root.position);

        if (this.desiredDirection.lengthSq() < 0.0001) return;

        this.desiredDirection.normalize();

        this.inverseQuaternion.copy(this.root.quaternion).invert();
        this.localDirection.copy(this.desiredDirection).applyQuaternion(this.inverseQuaternion);

        const yawInput = THREE.MathUtils.clamp(this.localDirection.x * 2.5, -1, 1);
        const pitchInput = THREE.MathUtils.clamp(this.localDirection.y * 2.5, -1, 1);
        const rollInput = THREE.MathUtils.clamp(-yawInput, -1, 1);

        this.backAxis.copy(this.desiredDirection).multiplyScalar(-1);
        this.rightAxis.crossVectors(this.worldUp, this.backAxis);

        if (this.rightAxis.lengthSq() < 0.001) {
            this.rightAxis.set(1, 0, 0).applyQuaternion(this.root.quaternion);
        }

        this.rightAxis.normalize();
        this.upAxis.crossVectors(this.backAxis, this.rightAxis).normalize();

        this.rotationMatrix.makeBasis(this.rightAxis, this.upAxis, this.backAxis);
        this.desiredQuaternion.setFromRotationMatrix(this.rotationMatrix);

        const bankAngle = -yawInput * this.maxBank;
        this.bankQuaternion.setFromAxisAngle(this.localZAxis, bankAngle);
        this.desiredQuaternion.multiply(this.bankQuaternion);

        this.root.quaternion.rotateTowards(this.desiredQuaternion, this.turnRate * deltaTime);

        const throttle = THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0, 1);

        this.model.setControls({
            pitch: pitchInput,
            roll: rollInput,
            yaw: yawInput,
            throttle,
            enginePowered: this.stats.hasFuel()
        });
    }

    _updateSpeed(targetSpeed, deltaTime) {
        const step = this.acceleration * deltaTime;

        if (this.speed < targetSpeed) {
            this.speed = Math.min(this.speed + step, targetSpeed);
        } else {
            this.speed = Math.max(this.speed - step, targetSpeed);
        }
    }

    _move(deltaTime) {
        this.forward.set(0, 0, -1).applyQuaternion(this.root.quaternion).normalize();
        this.root.position.addScaledVector(this.forward, this.speed * deltaTime);
    }

    _updateFuel(deltaTime) {
        const throttle = THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0, 1);
        this.stats.updateFuel(deltaTime, throttle);
    }

    _updateService(deltaTime) {
        this.model.setGroundMotion({
            active: true,
            speed: 0,
            steering: 0
        });

        this.model.setControls({
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: 0,
            enginePowered: true
        });

        if (this.homeBase.isDestroyed()) {
            console.log("ENEMY SERVICE ABORTED: BASE DESTROYED");
            this._beginTakeoffRoll();
            return;
        }

        this.serviceElapsed += deltaTime;

        if (this.serviceElapsed < this.serviceDuration) return;

        this.stats.refuel();
        this.stats.rearm();

        console.log("ENEMY BASE SERVICE COMPLETE");

        this._beginTakeoffRoll();
    }

    _beginTakeoffRoll() {
        this.enemyGroundSpeed = 0;
        this.model.setLandingGearDown(true);

        console.log("ENEMY TAKEOFF ROLL");
        this._setState("TAKEOFF_ROLL");
    }

    _updateTakeoffRoll(deltaTime) {
        this.enemyGroundSpeed = Math.min(
            this.takeoffSpeed,
            this.enemyGroundSpeed + this.takeoffAcceleration * deltaTime
        );

        this._alignToRunway();

        this.root.position.addScaledVector(
            this.runwayForward,
            this.enemyGroundSpeed * deltaTime
        );

        this.root.position.y = this.homeRunway.getSurfaceHeight();

        this.model.setGroundMotion({
            active: true,
            speed: this.enemyGroundSpeed,
            steering: 0
        });

        this.model.setControls({
            pitch: 1,
            roll: 0,
            yaw: 0,
            throttle: 1,
            enginePowered: true
        });

        if (this.enemyGroundSpeed >= this.takeoffSpeed) {
            this.takeoffElapsed = 0;
            this.takeoffStartPosition.copy(this.root.position);
            this.takeoffStartQuaternion.copy(this.root.quaternion);

            console.log("ENEMY ROTATE");
            this._setState("TAKEOFF");
        }
    }

    _updateTakeoff(deltaTime) {
        this.takeoffElapsed += deltaTime;

        const rawT = THREE.MathUtils.clamp(
            this.takeoffElapsed / this.takeoffDuration,
            0,
            1
        );

        const t = THREE.MathUtils.smoothstep(rawT, 0, 1);

        this.root.position.addScaledVector(
            this.runwayForward,
            this.takeoffSpeed * deltaTime
        );

        this.root.position.y = THREE.MathUtils.lerp(
            this.homeRunway.getSurfaceHeight(),
            this.homeRunway.getSurfaceHeight() + this.takeoffLift,
            t
        );

        this.model.setGroundMotion({
            active: true,
            speed: this.takeoffSpeed,
            steering: 0
        });

        this.model.setControls({
            pitch: 1,
            roll: 0,
            yaw: 0,
            throttle: 1,
            enginePowered: true
        });

        if (rawT >= 1) {
            this.speed = this.takeoffSpeed;

            this.model.setGroundMotion({
                active: false,
                speed: 0,
                steering: 0
            });

            this.model.setLandingGearDown(false);

            this.patrolIndex = 0;

            console.log("ENEMY AIRBORNE");
            this._setState("PATROL");
        }
    }

    _updateWeapons(distance) {
        if (this.state !== "ATTACK" || this.playerTarget.isDestroyed() || distance <= this.breakDistance) {
            this.machineGun.update(this.deltaTime, false, false);
            return;
        }

        this.forward.set(0, 0, -1).applyQuaternion(this.root.quaternion).normalize();
        this.desiredDirection.copy(this.aimPoint).sub(this.root.position).normalize();

        const angle = this.forward.angleTo(this.desiredDirection);

        const fireInner =
            distance <= this.fireRange &&
            angle <= THREE.MathUtils.degToRad(7);

        const fireOuter =
            distance <= 120 &&
            angle <= THREE.MathUtils.degToRad(4);

        this.machineGun.update(this.deltaTime, fireInner, fireOuter);
    }

    _updateUnpowered(deltaTime) {
        this.model.setControls({
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: 0,
            enginePowered: false
        });

        this._updateSpeed(this.minSpeed, deltaTime);

        this.forward.set(0, 0, -1).applyQuaternion(this.root.quaternion).normalize();
        this.root.position.addScaledVector(this.forward, this.speed * deltaTime);
        this.root.position.y -= 2.2 * deltaTime;

        this.machineGun.update(deltaTime, false, false);
    }

    _checkGroundImpact() {
        const terrain = Math.max(
            this.island.getHeightAt(this.root.position.x, this.root.position.z),
            this.oceanHeight
        );

        if (this.root.position.y > terrain + 1.5) return;

        console.log("ENEMY AIRCRAFT CRASHED");
        this.enemy.destroy();
    }

    update(deltaTime) {
        this.deltaTime = deltaTime;

        if (this.enemy.isDestroyed()) {
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        this._updatePlayerVelocity(deltaTime);
        const distance = this._getPlayerDistance();

        if (!this.stats.hasFuel()) {
            this._updateUnpowered(deltaTime);
            this._checkGroundImpact();
            return;
        }

        if (this.state === "APPROACH") {
            this._updateApproach(deltaTime);
            this._updateFuel(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        if (this.state === "LANDING") {
            this._updateLanding(deltaTime);
            this._updateFuel(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        if (this.state === "GROUND_ROLL") {
            this._updateGroundRoll(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        if (this.state === "SERVICE") {
            this._updateService(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        if (this.state === "TAKEOFF_ROLL") {
            this._updateTakeoffRoll(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        if (this.state === "TAKEOFF") {
            this._updateTakeoff(deltaTime);
            this.machineGun.update(deltaTime, false, false);
            return;
        }

        this._updateState(distance);

        let target;
        let targetSpeed;

        if (this.state === "PATROL") {
            target = this._getPatrolTarget();
            targetSpeed = this.cruiseSpeed;
        } else if (this.state === "INTERCEPT") {
            target = this._getInterceptTarget();
            targetSpeed = this.attackSpeed;
        } else if (this.state === "ATTACK") {
            target = this._getAttackTarget(distance);
            targetSpeed = this.attackSpeed;
        } else {
            target = this._getReturnTarget();
            targetSpeed = this.returnSpeed;
        }

        this.navigationTarget.copy(target);
        this._applyTerrainAvoidance(this.navigationTarget);

        this._updateSpeed(targetSpeed, deltaTime);
        this._steerToward(this.navigationTarget, deltaTime);
        this._move(deltaTime);
        this._updateFuel(deltaTime);
        this._updateWeapons(distance);

        this._checkGroundImpact();
    }

    getState() {
        return this.state;
    }

    getSpeed() {
        return this.speed;
    }
}
import * as THREE from "three";

export class FlightController {
    constructor(aircraftModel) {
        this.aircraftModel = aircraftModel;
        this.aircraft = aircraftModel.getObject3D();

        this.input = {
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttleUp: false,
            throttleDown: false,
            groundForward: false,
            groundBackward: false,
            groundLeft: false,
            groundRight: false
        };

        // Flight parameters
        this.minSpeed = 5;
        this.maxSpeed = 20;
        this.acceleration = 6;

        this.pitchRate = THREE.MathUtils.degToRad(16);
        this.rollRate = THREE.MathUtils.degToRad(30);
        this.yawRate = THREE.MathUtils.degToRad(10);
        this.throttleRate = 0.35;

        // Glide
        this.minGlideSinkRate = 0.8;
        this.maxGlideSinkRate = 2.5;

        // Ground movement
        this.groundMaxSpeed = 10;
        this.groundReverseSpeed = 3;
        this.groundAcceleration = 6;
        this.groundBrake = 7;
        this.groundDrag = 1.0;
        this.groundYawRate = THREE.MathUtils.degToRad(22);

        // Takeoff
        this.takeoffSpeed = 8;
        this.takeoffDuration = 0.9;
        this.takeoffPitch = THREE.MathUtils.degToRad(4);
        this.takeoffLift = 2.0;

        // Landing
        this.landingDuration = 1.25;
        this.landingSpeedRetention = 0.9;

        // State
        this.state = "airborne";

        this.throttle = 0.6;
        this.currentSpeed = THREE.MathUtils.lerp(this.minSpeed, this.maxSpeed, this.throttle);
        this.groundSpeed = 0;
        this.enginePowered = true;

        this.groundSurfaceHeight = 0;
        this.groundClearance = 0.00;
        this.groundNormal = new THREE.Vector3(0, 1, 0);
        this.groundPitch = THREE.MathUtils.degToRad(12);

        this.forward = new THREE.Vector3();
        this.right = new THREE.Vector3();
        this.back = new THREE.Vector3();

        this.groundMatrix = new THREE.Matrix4();
        this.groundQuaternion = new THREE.Quaternion();

        this.transitionElapsed = 0;
        this.transitionStartY = 0;
        this.transitionStartQuaternion = new THREE.Quaternion();
        this.transitionStartSpeed = 0;

        this.rotationOffset = new THREE.Quaternion();
        this.localXAxis = new THREE.Vector3(1, 0, 0);

        this.startPosition = new THREE.Vector3(0, 180, 650);

        this.reset();
    }

    setInput({
        pitch = 0,
        roll = 0,
        yaw = 0,
        throttleUp = false,
        throttleDown = false,
        groundForward = false,
        groundBackward = false,
        groundLeft = false,
        groundRight = false
    }) {
        this.input.pitch = THREE.MathUtils.clamp(pitch, -1, 1);
        this.input.roll = THREE.MathUtils.clamp(roll, -1, 1);
        this.input.yaw = THREE.MathUtils.clamp(yaw, -1, 1);

        this.input.throttleUp = throttleUp;
        this.input.throttleDown = throttleDown;

        this.input.groundForward = groundForward;
        this.input.groundBackward = groundBackward;
        this.input.groundLeft = groundLeft;
        this.input.groundRight = groundRight;
    }

    // AIR FLIGHT
    _updateThrottle(deltaTime) {
        if (this.input.throttleUp) {
            this.throttle += this.throttleRate * deltaTime;
        }

        if (this.input.throttleDown) {
            this.throttle -= this.throttleRate * deltaTime;
        }

        this.throttle = THREE.MathUtils.clamp(this.throttle, 0, 1);
    }

    _updateAirSpeed(deltaTime) {
        const effectiveThrottle = this.enginePowered ? this.throttle : 0;
        const targetSpeed = THREE.MathUtils.lerp(this.minSpeed, this.maxSpeed, effectiveThrottle);

        const difference = targetSpeed - this.currentSpeed;
        const maximumChange = this.acceleration * deltaTime;

        this.currentSpeed += THREE.MathUtils.clamp(difference, -maximumChange, maximumChange);
    }

    _updateAirRotation(deltaTime) {
        const pitchDelta = this.input.pitch * this.pitchRate * deltaTime;
        const rollDelta = this.input.roll * this.rollRate * deltaTime;
        const yawDelta = this.input.yaw * this.yawRate * deltaTime;

        this.aircraft.rotateX(pitchDelta);
        this.aircraft.rotateZ(-rollDelta);
        this.aircraft.rotateY(-yawDelta);
    }

    _updateAirMovement(deltaTime) {
        this.forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion).normalize();
        this.aircraft.position.addScaledVector(this.forward, this.currentSpeed * deltaTime);

        if (!this.enginePowered) {
            const speedRatio = THREE.MathUtils.clamp(
                (this.currentSpeed - this.minSpeed) / (this.maxSpeed - this.minSpeed),
                0,
                1
            );

            const sinkRate = THREE.MathUtils.lerp(
                this.maxGlideSinkRate,
                this.minGlideSinkRate,
                speedRatio
            );

            // Prevent an unpowered aircraft from gaining altitude indefinitely
            const upwardMovement = Math.max(0, this.forward.y * this.currentSpeed);

            this.aircraft.position.y -= (sinkRate + upwardMovement) * deltaTime;
        }
    }

    // GROUND
    _getGroundSteering() {
        let steering = 0;

        if (this.input.groundLeft) steering -= 1;
        if (this.input.groundRight) steering += 1;

        return steering;
    }

    _updateGroundSpeed(deltaTime) {
        let targetSpeed = 0;
        let changeRate = this.groundDrag;

        if (this.enginePowered && this.input.groundForward) {
            targetSpeed = this.groundMaxSpeed;
            changeRate = this.groundSpeed < 0 ? this.groundBrake : this.groundAcceleration;
        } else if (this.enginePowered && this.input.groundBackward) {
            targetSpeed = -this.groundReverseSpeed;
            changeRate = this.groundSpeed > 0 ? this.groundBrake : this.groundAcceleration;
        }

        const difference = targetSpeed - this.groundSpeed;
        const maximumChange = changeRate * deltaTime;

        this.groundSpeed += THREE.MathUtils.clamp(difference, -maximumChange, maximumChange);

        if (Math.abs(this.groundSpeed) < 0.01) {
            this.groundSpeed = 0;
        }
    }

    _updateGroundSteering(deltaTime) {
        const steering = this._getGroundSteering();

        if (steering === 0 || Math.abs(this.groundSpeed) < 0.1) return;

        const speedFactor = THREE.MathUtils.clamp(
            Math.abs(this.groundSpeed) / this.groundMaxSpeed,
            0.2,
            1
        );

        const movementDirection = this.groundSpeed >= 0 ? 1 : -1;
        const yawDelta = steering * this.groundYawRate * speedFactor * movementDirection * deltaTime;

        this.aircraft.rotateOnWorldAxis(this.groundNormal, -yawDelta);
    }

    _computeGroundQuaternion() {
        this.forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion);
        this.forward.projectOnPlane(this.groundNormal);

        if (this.forward.lengthSq() < 0.0001) {
            this.forward.set(0, 0, -1);
        }

        this.forward.normalize();

        this.right.crossVectors(this.forward, this.groundNormal).normalize();
        this.back.copy(this.forward).negate();

        this.groundMatrix.makeBasis( this.right, this.groundNormal, this.back);

        this.groundQuaternion.setFromRotationMatrix(this.groundMatrix);
        this.rotationOffset.setFromAxisAngle(this.localXAxis, this.groundPitch);
        this.groundQuaternion.multiply(this.rotationOffset);

        return this.groundQuaternion;
    }

    _alignToGround(deltaTime) {
        const target = this._computeGroundQuaternion();
        const response = 1 - Math.exp(-10 * deltaTime);

        this.aircraft.quaternion.slerp(target, response);
    }

    _updateGroundMovement(deltaTime) {
        this._updateGroundSpeed(deltaTime);
        this._updateGroundSteering(deltaTime);

        this.forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion);
        this.forward.projectOnPlane(this.groundNormal).normalize();

        this.aircraft.position.addScaledVector( this.forward, this.groundSpeed * deltaTime);

        this.aircraft.position.y = this.groundSurfaceHeight + this.groundClearance;

        this._alignToGround(deltaTime);

        if (this.groundSpeed >= this.takeoffSpeed && this.input.pitch > 0.35 && this.enginePowered) {
            this.beginTakeoff();
        }
    }

    // LANDING TRANSITION
    beginLanding(surfaceHeight, surfaceNormal) {
        if (this.state !== "airborne") return;

        this.state = "landing";

        this.groundSurfaceHeight = surfaceHeight;
        this.groundNormal.copy(surfaceNormal);

        this.transitionElapsed = 0;
        this.transitionStartY = this.aircraft.position.y;
        this.transitionStartQuaternion.copy(this.aircraft.quaternion);
        this.transitionStartSpeed = this.currentSpeed;

        console.log("LANDING");
    }

    _updateLanding(deltaTime) {
        this.transitionElapsed += deltaTime;

        const rawT = THREE.MathUtils.clamp(this.transitionElapsed / this.landingDuration, 0, 1);

        const t = THREE.MathUtils.smoothstep(rawT, 0, 1);

        this.forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion);
        this.forward.projectOnPlane(this.groundNormal).normalize();

        const landingSpeed = THREE.MathUtils.lerp(this.transitionStartSpeed, this.transitionStartSpeed * this.landingSpeedRetention, t);
        this.aircraft.position.addScaledVector(this.forward, landingSpeed * deltaTime);

        const targetY = this.groundSurfaceHeight + this.groundClearance;

        this.aircraft.position.y = THREE.MathUtils.lerp(this.transitionStartY, targetY, t);

        const groundQuaternion = this._computeGroundQuaternion();

        this.aircraft.quaternion.slerpQuaternions(this.transitionStartQuaternion, groundQuaternion, t);

        if (rawT >= 1) {
            this.state = "grounded";
            this.groundSpeed = Math.min(this.transitionStartSpeed * this.landingSpeedRetention, this.groundMaxSpeed);

            this.aircraft.position.y = targetY;

            console.log("GROUND ROLL");
        }
    }

    // TAKEOFF TRANSITION
    beginTakeoff() {
        if (this.state !== "grounded") {
            return;
        }

        this.state = "takeoff";

        this.transitionElapsed = 0;
        this.transitionStartY = this.aircraft.position.y;
        this.transitionStartQuaternion.copy(this.aircraft.quaternion);

        this.currentSpeed = Math.max(this.groundSpeed, this.takeoffSpeed);

        this.throttle = Math.max(this.throttle, 0.7);

        console.log("TAKEOFF");
    }

    _updateTakeoff(deltaTime) {
        this.transitionElapsed += deltaTime;

        const rawT = THREE.MathUtils.clamp(this.transitionElapsed / this.takeoffDuration, 0, 1);

        const t = THREE.MathUtils.smoothstep(rawT, 0, 1);

        this.forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion).normalize();

        this.aircraft.position.addScaledVector(this.forward, this.currentSpeed * deltaTime);

        const targetY =this.groundSurfaceHeight + this.groundClearance + this.takeoffLift;

        this.aircraft.position.y = THREE.MathUtils.lerp(this.transitionStartY, targetY, t);

        this.rotationOffset.setFromAxisAngle(this.localXAxis, this.takeoffPitch);

        const targetQuaternion = this._computeGroundQuaternion().clone().multiply(this.rotationOffset);

        this.aircraft.quaternion.slerpQuaternions(this.transitionStartQuaternion, targetQuaternion, t);

        if (rawT >= 1) {
            this.state = "airborne";
            this.groundSpeed = 0;

            console.log("AIRBORNE");
        }
    }

    update(deltaTime) {
        if (this.state === "airborne") {
            this._updateThrottle(deltaTime);
            this._updateAirSpeed(deltaTime);
            this._updateAirRotation(deltaTime);
            this._updateAirMovement(deltaTime);
        } else if (this.state === "landing") {
            this._updateLanding(deltaTime);
        } else if (this.state === "grounded") {
            this._updateGroundMovement(deltaTime);
        } else if (this.state === "takeoff") {
            this._updateTakeoff(deltaTime);
        }

        const visualThrottle = this.state === "grounded" ? THREE.MathUtils.clamp(Math.abs(this.groundSpeed) / this.groundMaxSpeed, 0, 1) : this.throttle;

        const flightControlsActive = this.state === "airborne" || this.state === "takeoff";

        this.aircraftModel.setControls({
            pitch: flightControlsActive ? this.input.pitch : 0,
            roll: flightControlsActive ? this.input.roll : 0,
            yaw: flightControlsActive ? this.input.yaw : 0,
            throttle: visualThrottle,
            enginePowered: this.enginePowered
        });

        this.aircraftModel.setGroundMotion({
            active: this.state !== "airborne",
            speed: this.state === "grounded" ? this.groundSpeed : this.currentSpeed,
            steering: this.state === "grounded" ? this._getGroundSteering() : 0
        });
    }

    setGroundSurface(height, normal = null) {
        this.groundSurfaceHeight = height;

        if (normal) {
            this.groundNormal.copy(normal);
        }

        if (this.state === "grounded") {
            this.aircraft.position.y = this.groundSurfaceHeight + this.groundClearance;
        }
    }

    reset() {
        this.aircraft.position.copy(this.startPosition);
        this.aircraft.quaternion.identity();

        this.throttle = 0.6;
        this.currentSpeed = THREE.MathUtils.lerp(this.minSpeed, this.maxSpeed, this.throttle);

        this.groundSpeed = 0;
        this.enginePowered = true;
        this.state = "airborne";
    }

    stop() {
        this.currentSpeed = 0;
        this.groundSpeed = 0;
    }

    getSpeed() {
        return this.state === "grounded" ? Math.abs(this.groundSpeed) : this.currentSpeed;
    }

    getGroundSpeed() {
        return this.groundSpeed;
    }

    getThrottle() {
        return this.throttle;
    }

    getEngineLoad() {
        if (this.state === "grounded") {
            return THREE.MathUtils.clamp(Math.abs(this.groundSpeed) / this.groundMaxSpeed, 0, 1);
        }

        if (this.state === "takeoff") {
            return 1;
        }

        return this.throttle;
    }

    setEnginePowered(powered) {
        this.enginePowered = powered;
    }

    isEnginePowered() {
        return this.enginePowered;
    }

    isGrounded() {
        return this.state === "grounded";
    }

    isLanding() {
        return this.state === "landing";
    }

    isTakingOff() {
        return this.state === "takeoff";
    }

    isAirborne() {
        return this.state === "airborne";
    }
}
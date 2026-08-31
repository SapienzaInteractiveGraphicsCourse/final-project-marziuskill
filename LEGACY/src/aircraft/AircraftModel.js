import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class AircraftModel {
    constructor({faction = "player"} = {}) {
        // Aircraft faction: player or enemy
        this.faction = faction;
        // Root used by flight controller
        this.root = new THREE.Group();
        this.root.name = "AircraftRoot";
        /*
         * Imported model lives inside visualRoot.
         *
         * FlightController moves/rotates AircraftRoot.
         * Any eventual orientation/scale correction of the
         * imported asset is applied only to visualRoot.
         */
        this.visualRoot = new THREE.Group();
        this.visualRoot.name = "AircraftVisualRoot";
        this.root.add(this.visualRoot);
        this.visualRoot.rotation.y = Math.PI; // Rotate model 180 degrees around Y to face forward
        // State
        this.loaded = false;
        this.controls = {
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: 0.6,
            enginePowered: true
        };
        this.visualControls = {
            pitch: 0,
            roll: 0,
            yaw: 0
        };
        this.propellerSpeed = 0;
        this.gear = {
            down: true,
            progress: 0,
            target: 0,
            speed: 0.8
        };
        this.groundMotion = {
            active: false,
            speed: 0,
            steering: 0
        };
        this.wheelSpin = 0;
        this.wheelSteering = 0;
        // Bones
        this.propeller = null;
        this.rollLeft = null;
        this.rollRight = null;
        this.pitchLeft = null;
        this.pitchRight = null;
        this.rudder = null;
        this.gearLeft = null;
        this.gearRight = null;
        this.muzzles = [];
        this.wheelLeft = null;
        this.wheelRight = null;
        this.tailWheel = null;


        // Rest-pose quaternions
        this.baseQuaternions = {};
        this.rotationOffset = new THREE.Quaternion(); // Temporary quaternion reused evevry frame
        this.localYAxis = new THREE.Vector3(0, 1, 0);
        this.localXAxis = new THREE.Vector3(1, 0, 0);
        this.frontWheelSpinOffset = new THREE.Quaternion();
        this.tailWheelSpinOffset = new THREE.Quaternion();
        this.wheelSteerOffset = new THREE.Quaternion();

        // Collision bounds
        this.boundsReady = false;
        this.boundsBox = new THREE.Box3();
        this.boundsSize = new THREE.Vector3();
        this.boundsCenter = new THREE.Vector3();

        this.localHitSpheres = [];
        this.worldHitSpheres = [];

        this.hitboxDebugObjects = [];
        this.hitboxDebugVisible = false;
        this.hitboxWorldScale = new THREE.Vector3();
        // Load model
        this._loadModel();
    }

    // MODEL LOADING
    _loadModel() {
        const loader = new GLTFLoader();
        loader.load("./assets/models/aircraft/fighter.glb",
            (gltf) => {
                const model = gltf.scene;
                model.name = "FighterModel";
                // Debug: Print the scene graph to the console to inspect the hierarchy and names
                console.log("=== FIGHTER SCENE GRAPH ===");
                model.traverse((child) => {
                    if (child.isBone) {
                        console.log(`Bone: ${child.name}`);
                    } else if (child.isMesh) {
                        console.log(`Mesh: ${child.name}`);
                    }
                });
                console.log("=== END OF SCENE GRAPH ===");
                // Apply PBR materials
                this._applyMaterials(model);
                // Shadows
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                // Find bones
                this.propeller = model.getObjectByName("Propeller");
                this.rollLeft = model.getObjectByName("RollL");
                this.rollRight = model.getObjectByName("RollR");
                this.pitchLeft = model.getObjectByName("PitchL");
                this.pitchRight = model.getObjectByName("PitchR");
                this.rudder = model.getObjectByName("Bone006");
                this.gearLeft = model.getObjectByName("LegL");
                this.gearRight = model.getObjectByName("LegR");
                this.muzzles = [
                    model.getObjectByName("Muzzle_L1"),
                    model.getObjectByName("Muzzle_L2"),
                    model.getObjectByName("Muzzle_R1"),
                    model.getObjectByName("Muzzle_R2")

                ];
                this.wheelLeft = model.getObjectByName("WheelL");
                this.wheelRight = model.getObjectByName("WheelR");
                this.tailWheel = model.getObjectByName("Wheel");

                // Validation
                const bonesValid = this._validateBones();
                if (!bonesValid) {
                    console.error("Aircraft model is missing some bones. Animation may not work correctly.");
                    return;
                }
                // Save rest-pose
                this._saveBaseQuaternions();
                // Model transform
                this.visualRoot.add(model);
                this.visualRoot.scale.setScalar(0.30);
                this._computeCollisionBounds();
                this.loaded = true;
                console.log("Fighter aircraft loaded successfully.");
            },
            undefined,
            (error) => {
                console.error("Error loading fighter aircraft model:", error);
            }
        );
    }

    // BONE VALIDATION
    _validateBones() {
        const bones = {
            "Propeller": this.propeller,
            "RollL": this.rollLeft,
            "RollR": this.rollRight,
            "PitchL": this.pitchLeft,
            "PitchR": this.pitchRight,
            "Bone006 / Rudder": this.rudder,
            "LegL / GearLeft": this.gearLeft,
            "LegR / GearRight": this.gearRight,
            "Muzzle_L1": this.muzzles[0],
            "Muzzle_L2": this.muzzles[1],
            "Muzzle_R1": this.muzzles[2],
            "Muzzle_R2": this.muzzles[3],
            "WheelL": this.wheelLeft,
            "WheelR": this.wheelRight,
            "Wheel / TailWheel": this.tailWheel
        };
        let allFound = true;
        for (const [name, bone] of Object.entries(bones)) {
            if (!bone) {
                console.error(`Aircraft bone "${name}" not found.`);
                allFound = false;
            } else {
                console.log(`Aircraft bone "${name}" found.`);
            }
        }
        return allFound;
    }

    // SAVE REST POSE
    _saveBaseQuaternions() {
        this.baseQuaternions = {
            propeller: this.propeller.quaternion.clone(),
            rollLeft: this.rollLeft.quaternion.clone(),
            rollRight: this.rollRight.quaternion.clone(),
            pitchLeft: this.pitchLeft.quaternion.clone(),
            pitchRight: this.pitchRight.quaternion.clone(),
            rudder: this.rudder.quaternion.clone(),
            gearLeft: this.gearLeft.quaternion.clone(),
            gearRight: this.gearRight.quaternion.clone(),
            wheelLeft: this.wheelLeft.quaternion.clone(),
            wheelRight: this.wheelRight.quaternion.clone(),
            tailWheel: this.tailWheel.quaternion.clone()
        };
    }

    // LOAD PBR TEXTURE SET
    _loadTextureSet(type) {
        const loader = new THREE.TextureLoader();
        const basePath = "./assets/models/aircraft/textures/";
        const map = loader.load(`${basePath}02_${type}_t.png`);
        const metalnessMap = loader.load(`${basePath}02_${type}.001_m.png`);
        const roughnessMap = loader.load(`${basePath}02_${type}_r.png`);
        const normalMap = loader.load(`${basePath}02_${type}_n.png`);
        map.colorSpace = THREE.SRGBColorSpace;
        metalnessMap.colorSpace = THREE.NoColorSpace;
        roughnessMap.colorSpace = THREE.NoColorSpace;
        normalMap.colorSpace = THREE.NoColorSpace;
        // Required when assigning textures manually to a glTF model.
        map.flipY = false;
        metalnessMap.flipY = false;
        roughnessMap.flipY = false;
        normalMap.flipY = false;

        return {map, metalnessMap, roughnessMap, normalMap};
    }

    // CREATE PBR MATERIAL
    _createPBRMaterial(textureSet, {
        color = 0xffffff,
        emissive = 0x000000,
        emissiveIntensity = 0
    } = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            emissive,
            emissiveIntensity,
            map: textureSet.map,
            metalnessMap: textureSet.metalnessMap,
            roughnessMap: textureSet.roughnessMap,
            normalMap: textureSet.normalMap,
            metalness: 1,
            roughness: 1,
            normalScale: new THREE.Vector2(1, 1)
        });
    }

    // APPLY AIRCRAFT MATERIALS
    _applyMaterials(model) {
        const enemy = this.faction === "enemy";

        const hullStyle = enemy ? {
            color: 0x87a8b5,
            emissive: 0x102a35,
            emissiveIntensity: 0.25
        } : {};

        const detailsStyle = enemy ? {
            color: 0x6b8794,
            emissive: 0x0b2029,
            emissiveIntensity: 0.2
        } : {};

        const hullMaterial = this._createPBRMaterial(this._loadTextureSet("Hull"), hullStyle);
        const hull = model.getObjectByName("Fighter_Hull");

        if (hull) {
            hull.material = hullMaterial;
        } else {
            console.warn("Fighter Hull mesh not found.");
        }

        const detailsMaterial = this._createPBRMaterial(this._loadTextureSet("Details"), detailsStyle);
        const details = model.getObjectByName("Fighter_Details");

        if (details) {
            details.material = detailsMaterial;
        } else {
            console.warn("Fighter Details mesh not found.");
        }
    }

    // MUZZLES
    getMuzzles() {
        return this.muzzles.filter((muzzle) => muzzle !== null);
    }

    // WHEELS
    setGroundMotion({active = false, speed = 0, steering = 0}) {
        this.groundMotion.active = active;
        this.groundMotion.speed = speed;
        this.groundMotion.steering = steering;
    }

    _updateWheels(deltaTime) {
        if (!this.wheelLeft || !this.wheelRight || !this.tailWheel) return;

        if (this.groundMotion.active) {
            const visualWheelRadius = 0.42;
            this.wheelSpin += (this.groundMotion.speed / visualWheelRadius) * deltaTime;
        }

        const targetSteering = this.groundMotion.active
            ? THREE.MathUtils.degToRad(22) * this.groundMotion.steering
            : 0;

        const response = 1 - Math.exp(-10 * deltaTime);
        this.wheelSteering = THREE.MathUtils.lerp(this.wheelSteering, targetSteering, response);

        // Main wheels: local Y
        this.frontWheelSpinOffset.setFromAxisAngle(this.localYAxis, -this.wheelSpin);

        // Tail wheel: local X
        this.tailWheelSpinOffset.setFromAxisAngle(this.localXAxis, -this.wheelSpin);

        // Tail-wheel steering: for now local Y
        this.wheelSteerOffset.setFromAxisAngle(this.localYAxis, this.wheelSteering);

        this.wheelLeft.quaternion
            .copy(this.baseQuaternions.wheelLeft)
            .multiply(this.frontWheelSpinOffset);

        this.wheelRight.quaternion
            .copy(this.baseQuaternions.wheelRight)
            .multiply(this.frontWheelSpinOffset);

        this.tailWheel.quaternion
            .copy(this.baseQuaternions.tailWheel)
            .multiply(this.wheelSteerOffset)
            .multiply(this.tailWheelSpinOffset);
    }

    // CONTROL INPUT
    setControls({pitch = 0, roll = 0, yaw = 0, throttle = this.controls.throttle, enginePowered = this.controls.enginePowered}) {
        this.controls.pitch = THREE.MathUtils.clamp(pitch, -1, 1);
        this.controls.roll = THREE.MathUtils.clamp(roll, -1, 1);
        this.controls.yaw = THREE.MathUtils.clamp(yaw, -1, 1);
        this.controls.throttle = THREE.MathUtils.clamp(throttle, 0, 1);
        this.controls.enginePowered = enginePowered;
    }

    // LOCAL ROTATION
    _setLocalYRotation(bone, baseQuaternion, angle) {
        this.rotationOffset.setFromAxisAngle(this.localYAxis, angle);
        bone.quaternion.copy(baseQuaternion).multiply(this.rotationOffset);
    }

    _setLocalXRotation(bone, baseQuaternion, angle) {
        this.rotationOffset.setFromAxisAngle(this.localXAxis, angle);
        bone.quaternion.copy(baseQuaternion).multiply(this.rotationOffset);
    }

    // LANDING GEAR
    toggleLandingGear() {
        this.setLandingGearDown(!this.gear.down);
    }
    
    setLandingGearDown(down) {
        if (this.gear.down === down) return;

        this.gear.down = down;
        this.gear.target = down ? 0 : 1;
    }

    _updateLandingGear(deltaTime) {
        if (!this.gearLeft || !this.gearRight) {
            return;
        }
        const direction = Math.sign(this.gear.target - this.gear.progress);
        const step = this.gear.speed * deltaTime;
        if (Math.abs(this.gear.target - this.gear.progress) <= step) {
            this.gear.progress = this.gear.target;
        } else {
            this.gear.progress += direction * step;
        }
        const t = THREE.MathUtils.smoothstep(this.gear.progress, 0, 1);
        const gearAngle = THREE.MathUtils.degToRad(95) * t;
        this._setLocalXRotation(this.gearLeft, this.baseQuaternions.gearLeft, gearAngle);
        this._setLocalXRotation(this.gearRight, this.baseQuaternions.gearRight, gearAngle);
    }

    // UPDATE ANIMATION
    update(deltaTime) {
        if (!this.loaded) {
            return;
        }
        const response = 1 - Math.exp(-7 * deltaTime);
        this.visualControls.pitch = THREE.MathUtils.lerp(this.visualControls.pitch, this.controls.pitch, response);
        this.visualControls.roll = THREE.MathUtils.lerp(this.visualControls.roll, this.controls.roll, response);
        this.visualControls.yaw = THREE.MathUtils.lerp(this.visualControls.yaw, this.controls.yaw, response);
        // Propeller
        const targetPropellerSpeed = this.controls.enginePowered ? THREE.MathUtils.lerp(8, 40, this.controls.throttle) : 0;
        const propellerResponse = 1 - Math.exp(-4 * deltaTime);
        this.propellerSpeed = THREE.MathUtils.lerp(this.propellerSpeed, targetPropellerSpeed, propellerResponse);
        this.propeller.rotateY(this.propellerSpeed * deltaTime);
        // Ailerons (roll)
        const aileronAngle = THREE.MathUtils.degToRad(18);
        this._setLocalYRotation(this.rollLeft, this.baseQuaternions.rollLeft, -aileronAngle * this.visualControls.roll);
        this._setLocalYRotation(this.rollRight, this.baseQuaternions.rollRight, -aileronAngle * this.visualControls.roll);
        // Elevators (pitch)
        const elevatorAngle = THREE.MathUtils.degToRad(20);
        this._setLocalYRotation(this.pitchLeft, this.baseQuaternions.pitchLeft, elevatorAngle * this.visualControls.pitch);
        this._setLocalYRotation(this.pitchRight, this.baseQuaternions.pitchRight, -elevatorAngle * this.visualControls.pitch);
        // Rudder (yaw)
        const rudderAngle = THREE.MathUtils.degToRad(22);
        this._setLocalYRotation(this.rudder, this.baseQuaternions.rudder, rudderAngle * this.visualControls.yaw);
        // Landing gear
        this._updateLandingGear(deltaTime);
        // Wheels
        this._updateWheels(deltaTime);
    }

    // COLLISION BOUNDS
    _computeCollisionBounds() {
        const savedPosition = this.root.position.clone();
        const savedQuaternion = this.root.quaternion.clone();
        const savedScale = this.root.scale.clone();

        this.root.position.set(0, 0, 0);
        this.root.quaternion.identity();
        this.root.scale.set(1, 1, 1);
        this.root.updateMatrixWorld(true);

        this.boundsBox.setFromObject(this.root, true);
        this.boundsBox.getSize(this.boundsSize);
        this.boundsBox.getCenter(this.boundsCenter);

        this.root.position.copy(savedPosition);
        this.root.quaternion.copy(savedQuaternion);
        this.root.scale.copy(savedScale);
        this.root.updateMatrixWorld(true);

        this._createHitSpheres();
        this.boundsReady = true;

        console.log(
            `Aircraft bounds size=(${this.boundsSize.x.toFixed(2)}, ${this.boundsSize.y.toFixed(2)}, ${this.boundsSize.z.toFixed(2)})`
        );
    }

    _createHitSpheres() {
        const min = this.boundsBox.min;
        const size = this.boundsSize;

        const centerX = this.boundsCenter.x;
        const centerY = this.boundsCenter.y;

        const fuselageRadius = Math.min(size.y * 0.55, size.z * 0.14);
        const wingRadius = size.x * 0.115;
        const tailRadius = Math.min(fuselageRadius * 0.8, size.x * 0.08);

        const zAt = (t) => min.z + size.z * t;

        this.localHitSpheres = [
            // Fuselage
            new THREE.Sphere(new THREE.Vector3(centerX, centerY, zAt(0.16)), fuselageRadius * 0.85),
            new THREE.Sphere(new THREE.Vector3(centerX, centerY, zAt(0.38)), fuselageRadius),
            new THREE.Sphere(new THREE.Vector3(centerX, centerY, zAt(0.61)), fuselageRadius),
            new THREE.Sphere(new THREE.Vector3(centerX, centerY, zAt(0.83)), tailRadius),

            // Left wing
            new THREE.Sphere(new THREE.Vector3(centerX - size.x * 0.20, centerY, zAt(0.38)), wingRadius),
            new THREE.Sphere(new THREE.Vector3(centerX - size.x * 0.38, centerY, zAt(0.38)), wingRadius * 0.85),

            // Right wing
            new THREE.Sphere(new THREE.Vector3(centerX + size.x * 0.20, centerY, zAt(0.38)), wingRadius),
            new THREE.Sphere(new THREE.Vector3(centerX + size.x * 0.38, centerY, zAt(0.38)), wingRadius * 0.85)
        ];

        this.worldHitSpheres = this.localHitSpheres.map(() => new THREE.Sphere());
        this._createHitboxDebug();
    }

    getHitSpheres() {
        if (!this.boundsReady) return [];

        this.root.updateWorldMatrix(true, false);
        this.root.getWorldScale(this.hitboxWorldScale);

        const maxScale = Math.max(
            this.hitboxWorldScale.x,
            this.hitboxWorldScale.y,
            this.hitboxWorldScale.z
        );

        for (let i = 0; i < this.localHitSpheres.length; i++) {
            const local = this.localHitSpheres[i];
            const world = this.worldHitSpheres[i];

            world.center.copy(local.center).applyMatrix4(this.root.matrixWorld);
            world.radius = local.radius * maxScale;
        }

        return this.worldHitSpheres;
    }

    _createHitboxDebug() {
        const material = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            wireframe: true,
            transparent: true,
            opacity: 0.45,
            depthTest: false
        });

        for (const sphere of this.localHitSpheres) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(sphere.radius, 12, 8),
                material
            );

            mesh.position.copy(sphere.center);
            mesh.visible = this.hitboxDebugVisible;
            mesh.renderOrder = 100;

            this.root.add(mesh);
            this.hitboxDebugObjects.push(mesh);
        }
    }

    toggleHitboxDebug() {
        this.hitboxDebugVisible = !this.hitboxDebugVisible;

        for (const object of this.hitboxDebugObjects) {
            object.visible = this.hitboxDebugVisible;
        }

        return this.hitboxDebugVisible;
    }

    // PUBLIC API
    isLandingGearDown() {
        return this.gear.down && this.gear.progress <= 0.05;
    }

    getLandingGearProgress() {
        return this.gear.progress;
    }

    getObject3D() {
        return this.root;
    }
}
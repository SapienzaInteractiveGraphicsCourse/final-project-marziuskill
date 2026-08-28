import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {AircraftModel} from "./aircraft/AircraftModel.js";
import {FlightController} from "./aircraft/FlightController.js";
import {AircraftStats} from "./aircraft/AircraftStats.js";
import {MachineGun} from "./combat/MachineGun.js";
import {AircraftCollision} from "./collision/AircraftCollision.js";
import {Ocean} from "./world/Ocean.js";
import {Island} from "./world/Island.js";
import {RunwayZone} from "./world/RunwayZone.js";
import {HUD} from "./ui/HUD.js";
import {Minimap} from "./ui/Minimap.js";
import {ArtificialHorizon} from "./ui/ArtificialHorizon.js";
import {AlliedOutpost} from "./world/poi/AlliedOutpost.js";
import {EnemyBase} from "./world/poi/EnemyBase.js";
import {SupplySystem} from "./gameplay/SupplySystem.js";
import {EnemyAircraft} from "./aircraft/EnemyAircraft.js";
import {EnemyAI} from "./aircraft/EnemyAI.js";
import {Hangar} from "./world/assets/Hangar.js";

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9d6);
scene.fog = new THREE.Fog(0x87b9d6, 500, 2400);

// CAMERA
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3500);
camera.position.set(6, 4, 7);

// RENDERER
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// AIRCRAFT
const aircraft = new AircraftModel();
scene.add(aircraft.getObject3D());

const flightController = new FlightController(aircraft);
const aircraftStats = new AircraftStats();

// Uncomment only to test fuel depletion quickly
// aircraftStats.fuel = 2;

// UI
const hud = new HUD(aircraftStats, flightController);

const instrumentsColumn = document.createElement("div");
instrumentsColumn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    pointer-events: none;
    z-index: 10;
`;
document.body.appendChild(instrumentsColumn);
const minimap = new Minimap(aircraft.getObject3D(), {
    size: 150,
    range: 450,
    parent: instrumentsColumn
});
const artificialHorizon = new ArtificialHorizon(aircraft.getObject3D(), {
    size: 80,
    parent: instrumentsColumn
});
let enemyAircraftMarkerRemoved = false;
let enemyBaseMarkerRemoved = false;
function updateDestroyedMarkers() {
    if (!enemyAircraftMarkerRemoved && enemyAircraft.isDestroyed()) {
        minimap.removeMarker("enemy-fighter-1");
        enemyAircraftMarkerRemoved = true;
    }

    if (!enemyBaseMarkerRemoved && enemyBase.isDestroyed()) {
        minimap.removeMarker("enemy-base-red");
        enemyBaseMarkerRemoved = true;
    }
}

// WEAPONS
const machineGun = new MachineGun(scene, aircraft, aircraftStats);

// DEBUG FREE CAMERA
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.minDistance = 5;
orbitControls.maxDistance = 80;
orbitControls.enableDamping = true;
orbitControls.enabled = false;

let debugFreeCamera = false;

const lastFreeCameraAircraftPosition = new THREE.Vector3();
const freeCameraDisplacement = new THREE.Vector3();

function updateFreeCamera() {
    const aircraftPosition = aircraft.getObject3D().position;

    freeCameraDisplacement.copy(aircraftPosition).sub(lastFreeCameraAircraftPosition);
    camera.position.add(freeCameraDisplacement);
    orbitControls.target.add(freeCameraDisplacement);

    lastFreeCameraAircraftPosition.copy(aircraftPosition);
    orbitControls.update();
}

// CHASE CAMERA
const cameraOffset = new THREE.Vector3(0, 15, 24);
const cameraTargetOffset = new THREE.Vector3(0, 1.5, -14);
const localCameraUp = new THREE.Vector3(0, 1, 0);

const desiredCameraUp = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const desiredCameraTarget = new THREE.Vector3();

function updateDebugChaseCamera(deltaTime) {
    const aircraftObject = aircraft.getObject3D();

    desiredCameraPosition.copy(cameraOffset).applyQuaternion(aircraftObject.quaternion).add(aircraftObject.position);
    desiredCameraTarget.copy(cameraTargetOffset).applyQuaternion(aircraftObject.quaternion).add(aircraftObject.position);
    desiredCameraUp.copy(localCameraUp).applyQuaternion(aircraftObject.quaternion);

    const smoothing = 1 - Math.exp(-6 * deltaTime);

    camera.position.lerp(desiredCameraPosition, smoothing);
    camera.up.lerp(desiredCameraUp, smoothing).normalize();
    camera.lookAt(desiredCameraTarget);
}

// LIGHTS
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x445566, 2);
scene.add(hemisphereLight);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 10, 5);
sun.castShadow = true;

sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 1000;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.04;

scene.add(sun);

const sunVisual = new THREE.Mesh(
    new THREE.SphereGeometry(15, 24, 16),
    new THREE.MeshBasicMaterial({
        color: 0xfff3c4,
        fog: false,
        depthWrite: false
    })
);

scene.add(sunVisual);

const sunOffset = new THREE.Vector3(300, 500, 250);
const sunDirection = sunOffset.clone().normalize();

sun.target = new THREE.Object3D();
scene.add(sun.target);

const shadowCameraHelper = new THREE.CameraHelper(sun.shadow.camera);
shadowCameraHelper.visible = false;
scene.add(shadowCameraHelper);

function updateSun() {
    const aircraftPosition = aircraft.getObject3D().position;

    sun.target.position.copy(aircraftPosition);
    sun.position.copy(aircraftPosition).add(sunOffset);
    sun.target.updateMatrixWorld();

    sunVisual.position.copy(aircraftPosition).addScaledVector(sunDirection, 1200);
}

// WORLD
const ocean = new Ocean(5000);
scene.add(ocean.getObject3D());

const island = new Island({
    size: 1200,
    segments: 180,
    maxHeight: 120,
    seed: 42
});
scene.add(island.getObject3D());

function getTerrainPosition(x, z, offset = 0) {
    const y = Math.max(island.getHeightAt(x, z), 0) + offset;
    return new THREE.Vector3(x, y, z);
}

const alliedOutpost1 = new AlliedOutpost(scene, {
    name: "Allied Outpost Alpha",
    position: getTerrainPosition(-230, 80)
});
minimap.addMarker({
    id: "allied-alpha",
    object: alliedOutpost1.getObject3D(),
    type: "ally",
    label: "ALPHA"
});

const alliedOutpost2 = new AlliedOutpost(scene, {
    name: "Allied Outpost Bravo",
    position: getTerrainPosition(250, -80)
});

minimap.addMarker({
    id: "allied-bravo",
    object: alliedOutpost2.getObject3D(),
    type: "ally",
    label: "BRAVO"
});

const enemyBase = new EnemyBase(scene, {
    name: "Enemy Base Red",
    position: getTerrainPosition(0, -300),
    maxHealth: 240
});
minimap.addMarker({
    id: "enemy-base-red",
    object: enemyBase.getObject3D(),
    type: "enemy",
    label: "RED"
});
const enemyRunwayX = 70;
const enemyRunwayZ = -300;
const enemyRunwayHeight = Math.max(island.getHeightAt(enemyRunwayX, enemyRunwayZ), 0) + 0.5;
const enemyRunway = new RunwayZone({
    x: enemyRunwayX,
    z: enemyRunwayZ,
    height: enemyRunwayHeight,
    width: 35,
    length: 220,
    heading: 0
});
scene.add(enemyRunway.getObject3D());

const runwayX = 0;
const runwayZ = 450;
const runwayHeight = Math.max(island.getHeightAt(runwayX, runwayZ), 0) + 0.5;
const homeRunway = new RunwayZone({
    x: runwayX,
    z: runwayZ,
    height: runwayHeight,
    width: 35,
    length: 220,
    heading: 0
});
scene.add(homeRunway.getObject3D());
minimap.addMarker({
    id: "home",
    object: homeRunway.getObject3D(),
    type: homeRunway,
    label: "HOME"
});

const testHangar = new Hangar(scene, {
    position: new THREE.Vector3(0, runwayHeight + 0.05, 328),
    heading: 0,
    scale: 1,
    textureRepeat: 2,
    debug: true
});

// SUPPLY SYSTEM
const supplySystem = new SupplySystem(
    scene,
    aircraft.getObject3D(),
    aircraftStats,
    flightController,
    island,
    {
        oceanHeight: 0,
        crateModelPath: null
    }
);
supplySystem.addOutpost(alliedOutpost1);
supplySystem.addOutpost(alliedOutpost2);
machineGun.addTarget(enemyBase);

// RECHARGE AT BASE
let baseServiceCompleted = false;

function updateBaseService() {
    const position = aircraft.getObject3D().position;
    const insideHomeRunway = homeRunway.containsPoint(position.x, position.z);
    const stopped = Math.abs(flightController.getGroundSpeed()) <= 0.1;
    const canService = flightController.isGrounded() && insideHomeRunway && stopped;

    if (canService && !baseServiceCompleted) {
        aircraftStats.refuel();
        aircraftStats.rearm();
        aircraftStats.reloadSupplies();

        baseServiceCompleted = true;

        console.log("BASE SERVICE COMPLETE");
    }

    if (!canService) {
        baseServiceCompleted = false;
    }
}

// AIRCRAFT COLLISIONS
const aircraftCollision = new AircraftCollision(
    aircraft,
    flightController,
    aircraftStats,
    island,
    0
);
aircraftCollision.addRunway(homeRunway);
aircraftCollision.addTarget(enemyBase);
aircraftCollision.addTarget(alliedOutpost1);
aircraftCollision.addTarget(alliedOutpost2);
aircraftCollision.addRunway(enemyRunway);

// ENEMY AIRCRAFT
const enemyAircraft = new EnemyAircraft(scene, {
    position: new THREE.Vector3(0, 180, 350)
});

enemyAircraft.getObject3D().rotation.y = Math.PI;

machineGun.addTarget(enemyAircraft);
aircraftCollision.addTarget(enemyAircraft);

const enemyMachineGun = new MachineGun(
    scene,
    enemyAircraft.getModel(),
    enemyAircraft.getStats()
);

enemyMachineGun.addTarget(aircraftCollision);

const enemyAI = new EnemyAI(
    enemyAircraft,
    enemyMachineGun,
    aircraft.getObject3D(),
    aircraftCollision,
    enemyBase,
    enemyRunway,
    island,
    {oceanHeight: 0}
);

minimap.addMarker({
    id: "enemy-fighter-1",
    object: enemyAircraft.getObject3D(),
    type: "enemyAircraft",
    label: "FIGHTER"
});
enemyAircraft.getStats().fuel = 20;

// INPUT
const keys = {};

window.addEventListener("keydown", (event) => {
    if (event.key.startsWith("Arrow")) {
        event.preventDefault();
    }
    const key = event.key.toLowerCase();
    keys[key] = true;

    // Reset aircraft
    if (key === "r") {
        flightController.reset();
    }

    // Toggle debug free camera
    if (key === "v" && !event.repeat) {
        debugFreeCamera = !debugFreeCamera;
        orbitControls.enabled = debugFreeCamera;

        if (debugFreeCamera) {
            camera.up.set(0, 1, 0);

            const aircraftPosition = aircraft.getObject3D().position;
            orbitControls.target.copy(aircraftPosition);
            lastFreeCameraAircraftPosition.copy(aircraftPosition);

            console.log("FREE LOOK");
        } else {
            console.log("CHASE CAMERA");
        }
    }

    // Toggle shadow camera helper
    if (key === "b" && !event.repeat) {
        shadowCameraHelper.visible = !shadowCameraHelper.visible;
    }

    // Landing gear
    if (key === "g" && !event.repeat) {
        aircraft.toggleLandingGear();
    }

    // Debug aircraft statistics
    if (key === "p" && !event.repeat) {
        console.log(`HP: ${aircraftStats.health}/${aircraftStats.maxHealth}`);
        console.log(`Throttle: ${(flightController.getThrottle() * 100).toFixed(0)}%`);
        console.log(`Speed: ${flightController.getSpeed().toFixed(2)}`);
        console.log(`Fuel: ${aircraftStats.fuel.toFixed(2)}/${aircraftStats.maxFuel}`);
        console.log(`Fuel consumption: ${aircraftStats.getFuelConsumptionRate(flightController.getThrottle()).toFixed(3)}/s`);
        console.log(`Inner ammo: ${aircraftStats.innerAmmo}/${aircraftStats.maxInnerAmmo}`);
        console.log(`Outer ammo: ${aircraftStats.outerAmmo}/${aircraftStats.maxOuterAmmo}`);
        console.log(`Supplies: ${aircraftStats.supplies}/${aircraftStats.maxSupplies}`);
        const enemyStats = enemyAircraft.getStats();
        console.log("--- ENEMY ---");
        console.log(`HP: ${enemyStats.health}/${enemyStats.maxHealth}`);
        console.log(`Inner ammo: ${enemyStats.innerAmmo}/${enemyStats.maxInnerAmmo}`);
        console.log(`Outer ammo: ${enemyStats.outerAmmo}/${enemyStats.maxOuterAmmo}`);
        console.log(`Fuel: ${enemyStats.fuel.toFixed(2)}/${enemyStats.maxFuel}`);
        console.log(`Enemy AI state: ${enemyAI.getState()}`);
        console.log(`Enemy speed: ${enemyAI.getSpeed().toFixed(2)}`);
    }

    // Supply drop
    if (key === "f" && !event.repeat) {
        supplySystem.tryDropSupply();
    }

    // hitbox
    if (key === "h" && !event.repeat) {
        const visible = aircraft.toggleHitboxDebug();
        enemyAircraft.toggleHitboxDebug();
        console.log(`HITBOX DEBUG: ${visible ? "ON" : "OFF"}`);
    }
});

window.addEventListener("keyup", (event) => {
    if (event.key.startsWith("Arrow")) {
        event.preventDefault();
    }
    keys[event.key.toLowerCase()] = false;
});

// FLIGHT INPUT
function updateAircraftControls() {
    let pitch = 0;
    let roll = 0;
    let yaw = 0;

    // W/S = pitch
    if (keys["w"]) pitch = 1;
    if (keys["s"]) pitch = -1;

    // A/D = roll
    if (keys["a"]) roll = -1;
    if (keys["d"]) roll = 1;

    // Q/E = yaw
    if (keys["q"]) yaw = -1;
    if (keys["e"]) yaw = 1;

    flightController.setInput({
        pitch,
        roll,
        yaw,
        throttleUp: keys["shift"] === true,
        throttleDown: keys["control"] === true,
        groundForward: keys["arrowup"] === true,
        groundBackward: keys["arrowdown"] === true,
        groundLeft: keys["arrowleft"] === true,
        groundRight: keys["arrowright"] === true
    });
}

// WINDOW RESIZE
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// CLOCK
let previousTime = performance.now();

// MAIN LOOP
function animate(currentTime) {
    requestAnimationFrame(animate);

    const deltaTime = Math.min((currentTime - previousTime) / 1000, 0.05);
    previousTime = currentTime;

    // PLAYER
    if (!aircraftCollision.isCrashed()) {
        updateAircraftControls();

        aircraftStats.updateFuel(deltaTime, flightController.getEngineLoad());
        flightController.setEnginePowered(aircraftStats.hasFuel());

        flightController.update(deltaTime);
    }

    // AIRCRAFT VISUALS
    aircraft.update(deltaTime);

    // COLLISIONS / GROUND
    aircraftCollision.update(deltaTime);

    // SUPPLY SYSTEM
    supplySystem.update(deltaTime);

    // BASE
    updateBaseService();

    // WEAPONS
    machineGun.update(deltaTime, keys["j"] === true, keys["k"] === true);

    // ENEMY
    enemyAI.update(deltaTime);
    enemyAircraft.update(deltaTime);

    // CAMERA
    if (debugFreeCamera) {
        updateFreeCamera();
    } else {
        updateDebugChaseCamera(deltaTime);
    }

    // LIGHTING
    updateSun();

    // UI
    hud.update();
    updateDestroyedMarkers();
    minimap.update();
    artificialHorizon.update();

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);
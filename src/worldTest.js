import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {Hangar} from "./world/assets/Hangar.js";
import {AircraftModel} from "./aircraft/AircraftModel.js";
import {MilitaryBuilding} from "./world/assets/MilitaryBuilding.js";
import {WatchTower} from "./world/assets/WatchTower.js";
import {RadioTower} from "./world/assets/RadioTower.js";
import {MilitaryTent} from "./world/assets/MilitaryTent.js";

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9d6);

// RENDERER
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// CAMERA
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
);

camera.position.set(30, 22, 30);
camera.lookAt(0, 2, 0);

// INSPECTION CAMERA
const cameraPivotDistance = 12;
const cameraMoveSpeed = 2.5;

const cameraForward = new THREE.Vector3();
const cameraPivot = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.08;

// OrbitControls zoom is replaced by our forward movement
controls.enableZoom = false;

controls.enablePan = true;
controls.enableRotate = true;

controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;

// Put the initial pivot in front of the camera
camera.getWorldDirection(cameraForward);

cameraPivot
    .copy(camera.position)
    .addScaledVector(cameraForward, cameraPivotDistance);

controls.target.copy(cameraPivot);
controls.update();

renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();

    camera.getWorldDirection(cameraForward);

    const direction = event.deltaY < 0 ? 1 : -1;
    const movement = direction * cameraMoveSpeed;

    camera.position.addScaledVector(cameraForward, movement);
    controls.target.addScaledVector(cameraForward, movement);

    controls.update();
}, {passive: false});

// LIGHTING
const hemisphereLight = new THREE.HemisphereLight(
    0xffffff,
    0x445566,
    1.5
);

scene.add(hemisphereLight);

const sun = new THREE.DirectionalLight(0xffffff, 3);

sun.position.set(40, 60, 30);
sun.castShadow = true;

sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;

sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;

sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;

scene.add(sun);

sun.target.position.set(0, 0, 0);
scene.add(sun.target);

// TEST GROUND
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.9,
        metalness: 0
    })
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;

ground.receiveShadow = true;

scene.add(ground);

// DEBUG HELPERS
const grid = new THREE.GridHelper(200, 100);
grid.position.y = 0.01;
scene.add(grid);

const axes = new THREE.AxesHelper(10);
axes.position.y = 0.02;
scene.add(axes);

let helpersVisible = true;

// WORLD OBJECTS
const hangar = new Hangar(scene, {
    position: new THREE.Vector3(0, 0, 0),
    heading: 0,
    scale: 1,
    textureRepeat: 2,
    debug: true
});

const militaryBuilding = new MilitaryBuilding(scene, {
    position: new THREE.Vector3(35, 0, 0),
    heading: 0,
    scale: 0.74,
    doorOpenAngle: 100,
    doorDirection: 1
});

const watchTower = new WatchTower(scene, {
    position: new THREE.Vector3(-25, 0, 0),
    heading: 0,
    scale: 1,
    debug: false
});

const radioTower = new RadioTower(scene, {
    position: new THREE.Vector3(-45, 0, 0),
    heading: 0,
    scale: 1,
    debug: false
});

const militaryTent = new MilitaryTent(scene, {
    position: new THREE.Vector3(20, 0, -25),
    heading: 0,
    scale: 1,
    debug: false
});

// OPTIONAL AIRCRAFT FOR SCALE TESTING

const aircraft = new AircraftModel();
const aircraftObject = aircraft.getObject3D();
scene.add(aircraftObject);

const aircraftGroundPitch = THREE.MathUtils.degToRad(12);
const locatorPosition = new THREE.Vector3();

function placeAircraftAtEntrance() {
    const position = hangar.getEntranceWorldPosition(locatorPosition);
    if (!position) return;

    aircraftObject.position.copy(position);
    aircraftObject.rotation.set(aircraftGroundPitch, hangar.getObject3D().rotation.y, 0);

    console.log("Aircraft placed at HangarEntrance.");
}

function placeAircraftAtService() {
    const position = hangar.getServiceWorldPosition(locatorPosition);
    if (!position) return;

    aircraftObject.position.copy(position);
    aircraftObject.rotation.set(aircraftGroundPitch, hangar.getObject3D().rotation.y, 0);

    console.log("Aircraft placed at HangarService.");
}


// CAMERA PRESETS
function setCamera(position, lookAt) {
    camera.position.copy(position);
    camera.lookAt(lookAt);

    camera.getWorldDirection(cameraForward);

    controls.target
        .copy(camera.position)
        .addScaledVector(cameraForward, cameraPivotDistance);

    controls.update();
}

function setPerspectiveView() {
    setCamera(
        new THREE.Vector3(30, 22, 30),
        new THREE.Vector3(0, 2, 0)
    );
}

function setTopView() {
    setCamera(
        new THREE.Vector3(0, 50, 0.01),
        new THREE.Vector3(0, 0, 0)
    );
}

function setFrontView() {
    setCamera(
        new THREE.Vector3(0, 6, 35),
        new THREE.Vector3(0, 2, 0)
    );
}

function setSideView() {
    setCamera(
        new THREE.Vector3(35, 6, 0),
        new THREE.Vector3(0, 2, 0)
    );
}

const cameraKeys = {};

window.addEventListener("keydown", (event) => {
    cameraKeys[event.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (event) => {
    cameraKeys[event.key.toLowerCase()] = false;
});

const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3(0, 1, 0);

function updateInspectionCamera(deltaTime) {
    const speed = 15 * deltaTime;

    camera.getWorldDirection(cameraForward);
    cameraRight.crossVectors(cameraForward, cameraUp).normalize();

    const movement = new THREE.Vector3();

    if (cameraKeys["q"]) movement.addScaledVector(cameraForward, speed);
    if (cameraKeys["e"]) movement.addScaledVector(cameraForward, -speed);
    if (cameraKeys["a"]) movement.addScaledVector(cameraRight, -speed);
    if (cameraKeys["d"]) movement.addScaledVector(cameraRight, speed);
    if (cameraKeys["w"]) movement.y += speed;
    if (cameraKeys["s"]) movement.y -= speed;

    camera.position.add(movement);
    controls.target.add(movement);
}

// INPUT
window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "h" && !event.repeat) {
        const visible = hangar.toggleDebug();
        militaryBuilding.setDebugVisible?.(visible);
        watchTower.setDebugVisible(visible);
        radioTower.setDebugVisible(visible);
        militaryTent.setDebugVisible(visible);

        console.log(`WORLD DEBUG: ${visible ? "ON" : "OFF"}`);
    }

    if (key === "g" && !event.repeat) {
        helpersVisible = !helpersVisible;

        grid.visible = helpersVisible;
        axes.visible = helpersVisible;

        console.log(`WORLD HELPERS: ${helpersVisible ? "ON" : "OFF"}`);
    }

    if (key === "1") {
        setPerspectiveView();
    }

    if (key === "2") {
        setTopView();
    }

    if (key === "3") {
        setFrontView();
    }

    if (key === "4") {
        setSideView();
    }

    if (key === "5" && !event.repeat) {
        placeAircraftAtEntrance();
    }

    if (key === "6" && !event.repeat) {
        placeAircraftAtService();
    }

    if (key === "o" && !event.repeat) {
        militaryBuilding.toggleDoor();
    }
});

// RESIZE
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});

// SIZE CHECK
let sizeChecked = false;
const aircraftBox = new THREE.Box3();
const aircraftSize = new THREE.Vector3();

function checkSizes() {
    if (sizeChecked || !aircraft.loaded || !hangar.isLoaded()) return;

    aircraftBox.setFromObject(aircraftObject, true);
    aircraftBox.getSize(aircraftSize);

    console.log(
        `Fighter size: X=${aircraftSize.x.toFixed(2)}, Y=${aircraftSize.y.toFixed(2)}, Z=${aircraftSize.z.toFixed(2)}`
    );

    console.log(
        `Hangar size: X=${hangar.boundsSize.x.toFixed(2)}, Y=${hangar.boundsSize.y.toFixed(2)}, Z=${hangar.boundsSize.z.toFixed(2)}`
    );

    sizeChecked = true;
}

// LOOP
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(clock.getDelta(), 0.05);

    updateInspectionCamera(deltaTime);

    militaryBuilding.update(deltaTime);
    aircraft.update(deltaTime);

    controls.update();
    renderer.render(scene, camera);
}

animate();
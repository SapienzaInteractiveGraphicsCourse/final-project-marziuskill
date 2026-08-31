import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

import {Hangar} from "./world/assets/Hangar.js";
import {MilitaryBuilding} from "./world/assets/MilitaryBuilding.js";
import {WatchTower} from "./world/assets/WatchTower.js";
import {RadioTower} from "./world/assets/RadioTower.js";
import {MilitaryTent} from "./world/assets/MilitaryTent.js";
import {BattlefieldProps} from "./world/assets/BattlefieldProps.js";
import {Flak18} from "./world/assets/Flak18.js";
import {CratesAndBarrels} from "./world/assets/CratesAndBarrels.js";

import {WORLD_LAYOUT} from "./world/WorldLayout.js";
import {TerrainIsland} from "./world/TerrainIsland.js";
import {Runway} from "./world/Runway.js";
import {AirfieldSurface} from "./world/AirfieldSurface.js";
import {Ocean} from "./world/Ocean.js";
import {VegetationPopulator} from "./world/VegetationPopulator.js";
import {VEGETATION_PROFILES} from "./world/VegetationProfiles.js";

// -----------------------------------------------------------------------------
// SCENE
// -----------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9d6);

// -----------------------------------------------------------------------------
// RENDERER
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// CAMERA + ORBIT CONTROLS
// -----------------------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
);

const cameraPivotDistance = 6;
const cameraWheelStep = 4;
const cameraKeyboardSpeed = 60;

const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3(0, 1, 0);
const cameraPivot = new THREE.Vector3();

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.08;

controls.enableZoom = false;
controls.enablePan = true;
controls.enableRotate = true;

controls.rotateSpeed = 0.35;
controls.panSpeed = 0.50;

controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;

function setCamera(position, lookAt) {
    camera.position.copy(position);
    camera.lookAt(lookAt);

    camera.getWorldDirection(cameraForward);

    cameraPivot
        .copy(camera.position)
        .addScaledVector(cameraForward, cameraPivotDistance);

    controls.target.copy(cameraPivot);
    controls.update();
}

setCamera(
    new THREE.Vector3(205, 75, -815),
    new THREE.Vector3(135, 6.5, -900)
);

renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();

    camera.getWorldDirection(cameraForward);

    const direction = event.deltaY < 0 ? 1 : -1;
    const movement = direction * cameraWheelStep;

    camera.position.addScaledVector(cameraForward, movement);
    controls.target.addScaledVector(cameraForward, movement);

    controls.update();
}, {passive: false});

// -----------------------------------------------------------------------------
// LIGHTING
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// WORLD
// -----------------------------------------------------------------------------

const ocean = new Ocean(scene, {
    size: WORLD_LAYOUT.worldSize,
    seaLevel: WORLD_LAYOUT.seaLevel,
    segments: 220
});

const terrainIslands = WORLD_LAYOUT.islands.map(config =>
    new TerrainIsland(scene, config, {
        seaLevel: WORLD_LAYOUT.seaLevel,
        cellSize: WORLD_LAYOUT.terrainCellSize
    })
);

//const homeRunway = new Runway(scene, WORLD_LAYOUT.runways.home);
const enemyRunway = new Runway(scene, WORLD_LAYOUT.runways.enemy);

//const homeAirfield = new AirfieldSurface(scene, WORLD_LAYOUT.airfields.home);
const enemyAirfield = new AirfieldSurface(scene, WORLD_LAYOUT.airfields.enemy);

//const homeIsland = terrainIslands.find(island => island.id === "home");
//const alliedWestIsland = terrainIslands.find(island => island.id === "alliedWest");
//const alliedEastIsland = terrainIslands.find(island => island.id === "alliedEast");
//const enemyFortIsland = terrainIslands.find(island => island.id === "enemyFort");
const enemyAirbaseIsland = terrainIslands.find(island => island.id === "enemyAirbase");

window.terrainIslands = terrainIslands;

// -----------------------------------------------------------------------------
// GENERIC HELPERS
// -----------------------------------------------------------------------------

function terrainPosition(layout, terrain, yOffset = 0) {
    return new THREE.Vector3(
        layout.position.x,
        terrain.getHeightAt(
            layout.position.x,
            layout.position.z
        ) + yOffset,
        layout.position.z
    );
}

function populateIslandVegetation(terrain, profile, exclusions = []) {
    const vegetation = new VegetationPopulator(scene, terrain, {
        ...profile,
        exclusions
    });

    vegetation.populate();
    return vegetation;
}

function fortObjectLayout(item, fortLayout) {
    const level = fortLayout.terraces[item.level];

    const localX = item.offset?.x ?? 0;
    const localZ = item.offset?.z ?? 0;

    const cos = Math.cos(level.heading);
    const sin = Math.sin(level.heading);

    return {
        position: {
            x: level.center.x + cos * localX + sin * localZ,
            z: level.center.z - sin * localX + cos * localZ
        },
        heading: level.heading + (item.headingOffset ?? 0),
        rotationX: item.rotationX ?? 0,
        rotationZ: item.rotationZ ?? 0,
        scale: item.scale ?? 1
    };
}

// -----------------------------------------------------------------------------
// TERRAIN PICKER - SHIFT + CLICK ON ENEMY FORT
// -----------------------------------------------------------------------------

const terrainPickerRaycaster = new THREE.Raycaster();
const terrainPickerMouse = new THREE.Vector2();

const terrainPickerMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshBasicMaterial({color: 0xff0000})
);

terrainPickerMarker.visible = false;
scene.add(terrainPickerMarker);

function pickTerrainPoint(event) {
    const rect = renderer.domElement.getBoundingClientRect();

    terrainPickerMouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    terrainPickerMouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    terrainPickerRaycaster.setFromCamera(
        terrainPickerMouse,
        camera
    );

    const terrainMeshes = terrainIslands.map(island => island.mesh);

    const hits = terrainPickerRaycaster.intersectObjects(
        terrainMeshes,
        false
    );

    if (hits.length === 0) return null;

    const hit = hits[0];

    const terrain = terrainIslands.find(
        island => island.mesh === hit.object
    );

    if (!terrain) return null;

    return {
        point: hit.point.clone(),
        terrain
    };
}

renderer.domElement.addEventListener("click", (event) => {
    if (!event.shiftKey) return;

    const result = pickTerrainPoint(event);

    if (!result) {
        console.log("No terrain selected.");
        return;
    }

    const {point, terrain} = result;

    terrainPickerMarker.position.copy(point);
    terrainPickerMarker.position.y += 1.5;
    terrainPickerMarker.visible = true;

    console.log(
        `${terrain.name ?? terrain.id} point: ` +
        `x=${point.x.toFixed(2)}, ` +
        `y=${point.y.toFixed(2)}, ` +
        `z=${point.z.toFixed(2)}`
    );

    console.log(
        `position: {x: ${point.x.toFixed(2)}, z: ${point.z.toFixed(2)}}`
    );
});

// -----------------------------------------------------------------------------
// HOME BASE
// -----------------------------------------------------------------------------
/*
const homeRunwayLayout = WORLD_LAYOUT.runways.home;
const homeAirfieldLayout = WORLD_LAYOUT.airfields.home;
const homeBaseLayout = WORLD_LAYOUT.homeBase;

const homeVegetationExclusions = [
    {
        center: {...homeRunwayLayout.center},
        width: homeRunwayLayout.width + 40,
        length: homeRunwayLayout.length + 80,
        heading: homeRunwayLayout.heading
    },
    {
        center: {...homeAirfieldLayout.apron.center},
        width: homeAirfieldLayout.apron.width + 30,
        length: homeAirfieldLayout.apron.length + 30,
        heading: homeAirfieldLayout.apron.heading
    }
];

const hangar = new Hangar(scene, {
    position: terrainPosition(
        homeBaseLayout.hangar,
        homeIsland
    ),
    heading: homeBaseLayout.hangar.heading,
    scale: homeBaseLayout.hangar.scale
});

hangar.ready.then(() => {
    console.log(
        "Hangar entrance:",
        hangar.getEntranceWorldPosition()
    );

    console.log(
        "Hangar service:",
        hangar.getServiceWorldPosition()
    );
});

const commandBuilding = new MilitaryBuilding(scene, {
    position: terrainPosition(
        homeBaseLayout.commandBuilding,
        homeIsland
    ),
    heading: homeBaseLayout.commandBuilding.heading,
    scale: homeBaseLayout.commandBuilding.scale,
    doorDirection: 1
});

const watchTower = new WatchTower(scene, {
    position: terrainPosition(
        homeBaseLayout.watchTower,
        homeIsland
    ),
    heading: homeBaseLayout.watchTower.heading,
    scale: homeBaseLayout.watchTower.scale
});

const radioTower = new RadioTower(scene, {
    position: terrainPosition(
        homeBaseLayout.radioTower,
        homeIsland
    ),
    heading: homeBaseLayout.radioTower.heading,
    scale: homeBaseLayout.radioTower.scale
});

const serviceLayout = homeBaseLayout.serviceArea;

const tentLayouts = [
    serviceLayout.tent,
    ...(serviceLayout.extraTents ?? [])
];

const militaryTents = tentLayouts.map(layout =>
    new MilitaryTent(scene, {
        position: terrainPosition(layout, homeIsland),
        heading: layout.heading,
        scale: layout.scale
    })
);
*/
const storageTypeMap = {
    crate: CratesAndBarrels.TYPES.CRATE,
    barrelA: CratesAndBarrels.TYPES.BARREL_A,
    barrelB: CratesAndBarrels.TYPES.BARREL_B,
    barrelC: CratesAndBarrels.TYPES.BARREL_C,
    coveredCrates: CratesAndBarrels.TYPES.COVERED_CRATES,
    coveredBarrels: CratesAndBarrels.TYPES.COVERED_BARRELS
};
/*
const homeStorage = new CratesAndBarrels(scene);

homeStorage.ready.then(() => {
    for (const item of serviceLayout.storage) {
        const type = storageTypeMap[item.kind];

        if (!type) {
            console.warn(`Unknown storage type: ${item.kind}`);
            continue;
        }

        homeStorage.create(type, {
            position: terrainPosition(item, homeIsland),
            heading: item.heading ?? 0
        });
    }
});

const homeFlak = new Flak18(scene, {
    position: terrainPosition(
        serviceLayout.flak18,
        homeIsland
    ),
    heading: serviceLayout.flak18.heading,
    scale: serviceLayout.flak18.scale
});

// -----------------------------------------------------------------------------
// VEGETATION - HOME / ALLIED
// -----------------------------------------------------------------------------

const homeVegetation = populateIslandVegetation(
    homeIsland,
    VEGETATION_PROFILES.home,
    homeVegetationExclusions
);

const alliedWestVegetation = populateIslandVegetation(
    alliedWestIsland,
    VEGETATION_PROFILES.alliedWest
);

const alliedEastVegetation = populateIslandVegetation(
    alliedEastIsland,
    VEGETATION_PROFILES.alliedEast
);

// -----------------------------------------------------------------------------
// ENEMY FORT
// -----------------------------------------------------------------------------

const enemyFortLayout = WORLD_LAYOUT.enemyFortBase;
*/

const battlefieldTypeMap = {
    bunker: BattlefieldProps.TYPES.BUNKER,
    hesco: BattlefieldProps.TYPES.HESCO,
    sandbagsA: BattlefieldProps.TYPES.SANDBAGS_A,
    sandbagsB: BattlefieldProps.TYPES.SANDBAGS_B,
    sandbagsStack: BattlefieldProps.TYPES.SANDBAGS_STACK,
    barbedWire: BattlefieldProps.TYPES.BARBED_WIRE,
    metalHedgehog: BattlefieldProps.TYPES.METAL_HEDGEHOG,
    woodenHedgehogA: BattlefieldProps.TYPES.WOODEN_HEDGEHOG_A
};
/*
const enemyBattlefield = new BattlefieldProps(scene);

function createEnemyBattlefieldItem(item, typeOverride = null) {
    const layout = fortObjectLayout(
        item,
        enemyFortLayout
    );

    const type = typeOverride ?? battlefieldTypeMap[item.kind];

    if (!type) {
        console.warn(`Unknown enemy battlefield type: ${item.kind}`);
        return null;
    }

    const instance = enemyBattlefield.create(type, {
        position: terrainPosition(
            layout,
            enemyFortIsland
        ),
        heading: layout.heading,
        scale: layout.scale
    });

    if (instance) {
        instance.rotation.x = layout.rotationX;
        instance.rotation.z = layout.rotationZ;
    }

    return instance;
}

enemyBattlefield.ready.then(() => {
    for (const item of enemyFortLayout.battlefield) {
        createEnemyBattlefieldItem(item);
    }

    createEnemyBattlefieldItem(
        enemyFortLayout.bunker,
        BattlefieldProps.TYPES.BUNKER
    );
});

const enemyFortTentLayout = fortObjectLayout(
    enemyFortLayout.tent,
    enemyFortLayout
);

const enemyFortTent = new MilitaryTent(scene, {
    position: terrainPosition(
        enemyFortTentLayout,
        enemyFortIsland
    ),
    heading: enemyFortTentLayout.heading,
    scale: enemyFortTentLayout.scale
});

const enemyFortFlakLayout = fortObjectLayout(
    enemyFortLayout.flak18,
    enemyFortLayout
);

const enemyFortFlak = new Flak18(scene, {
    position: terrainPosition(
        enemyFortFlakLayout,
        enemyFortIsland
    ),
    heading: enemyFortFlakLayout.heading,
    scale: enemyFortFlakLayout.scale
});

const enemyFortStorage = new CratesAndBarrels(scene);

enemyFortStorage.ready.then(() => {
    for (const item of enemyFortLayout.storage) {
        const type = storageTypeMap[item.kind];

        if (!type) {
            console.warn(`Unknown enemy storage type: ${item.kind}`);
            continue;
        }

        const layout = fortObjectLayout(
            item,
            enemyFortLayout
        );

        enemyFortStorage.create(type, {
            position: terrainPosition(
                layout,
                enemyFortIsland
            ),
            heading: layout.heading
        });
    }
});

const enemyFortVegetationExclusions =
    Object.values(enemyFortLayout.terraces).map(level => ({
        center: {...level.center},
        width: level.width + 6,
        length: level.length + 6,
        heading: level.heading
    }));

const enemyFortVegetation = populateIslandVegetation(
    enemyFortIsland,
    VEGETATION_PROFILES.enemyFort,
    enemyFortVegetationExclusions
);
*/
// -----------------------------------------------------------------------------
// ENEMY AIRBASE
// -----------------------------------------------------------------------------

const enemyAirbaseLayout = WORLD_LAYOUT.enemyAirbaseBase;

const enemyRunwayLayout = WORLD_LAYOUT.runways.enemy;
const enemyAirfieldLayout = WORLD_LAYOUT.airfields.enemy;

const enemyHangar = new Hangar(scene, {
    position: terrainPosition(
        enemyAirbaseLayout.hangar,
        enemyAirbaseIsland
    ),
    heading: enemyAirbaseLayout.hangar.heading,
    scale: enemyAirbaseLayout.hangar.scale
});

const enemyCommandBuilding = new MilitaryBuilding(scene, {
    position: terrainPosition(
        enemyAirbaseLayout.commandBuilding,
        enemyAirbaseIsland
    ),
    heading: enemyAirbaseLayout.commandBuilding.heading,
    scale: enemyAirbaseLayout.commandBuilding.scale,
    doorDirection: 1
});

const enemyWatchTower = new WatchTower(scene, {
    position: terrainPosition(
        enemyAirbaseLayout.watchTower,
        enemyAirbaseIsland
    ),
    heading: enemyAirbaseLayout.watchTower.heading,
    scale: enemyAirbaseLayout.watchTower.scale
});

const enemyRadioTower = new RadioTower(scene, {
    position: terrainPosition(
        enemyAirbaseLayout.radioTower,
        enemyAirbaseIsland
    ),
    heading: enemyAirbaseLayout.radioTower.heading,
    scale: enemyAirbaseLayout.radioTower.scale
});

const enemyAirbaseStorage = new CratesAndBarrels(scene);

enemyAirbaseStorage.ready.then(() => {
    for (const item of enemyAirbaseLayout.storage) {
        const type = storageTypeMap[item.kind];

        if (!type) {
            console.warn(`Unknown enemy airbase storage type: ${item.kind}`);
            continue;
        }

        enemyAirbaseStorage.create(type, {
            position: terrainPosition(
                item,
                enemyAirbaseIsland
            ),
            heading: item.heading ?? 0
        });
    }
});

const enemyAirbaseFlaks = enemyAirbaseLayout.flak18.map(layout =>
    new Flak18(scene, {
        position: terrainPosition(
            layout,
            enemyAirbaseIsland
        ),
        heading: layout.heading,
        scale: layout.scale
    })
);

const enemyAirbaseBattlefield = new BattlefieldProps(scene);

enemyAirbaseBattlefield.ready.then(() => {
    for (const item of enemyAirbaseLayout.battlefield) {
        const type = battlefieldTypeMap[item.kind];

        if (!type) {
            console.warn(`Unknown enemy airbase battlefield type: ${item.kind}`);
            continue;
        }

        enemyAirbaseBattlefield.create(type, {
            position: terrainPosition(item, enemyAirbaseIsland),
            heading: item.heading ?? 0,
            scale: item.scale ?? 1
        });
    }
});

const enemyAirbaseVegetationExclusions = [
    {
        center: {...enemyRunwayLayout.center},
        width: enemyRunwayLayout.width + 36,
        length: enemyRunwayLayout.length + 50,
        heading: enemyRunwayLayout.heading
    },

    {
        center: {...enemyAirfieldLayout.apron.center},
        width: enemyAirfieldLayout.apron.width + 30,
        length: enemyAirfieldLayout.apron.length + 30,
        heading: enemyAirfieldLayout.apron.heading
    },

    {
        center: {...enemyAirfieldLayout.taxiway.center},
        width: enemyAirfieldLayout.taxiway.width + 12,
        length: enemyAirfieldLayout.taxiway.length + 12,
        heading: enemyAirfieldLayout.taxiway.heading
    }
];

const enemyAirbaseVegetation = populateIslandVegetation(
    enemyAirbaseIsland,
    VEGETATION_PROFILES.enemyAirbase,
    enemyAirbaseVegetationExclusions
);

// -----------------------------------------------------------------------------
// CAMERA INPUT
// -----------------------------------------------------------------------------

const cameraKeys = {};

window.addEventListener("keydown", (event) => {
    cameraKeys[event.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (event) => {
    cameraKeys[event.key.toLowerCase()] = false;
});

function updateInspectionCamera(deltaTime) {
    const speed = cameraKeyboardSpeed * deltaTime;

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

// -----------------------------------------------------------------------------
// CAMERA PRESETS
// -----------------------------------------------------------------------------

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

function setEnemyAirbaseView() {
    setCamera(
        new THREE.Vector3(330, 115, -690),
        new THREE.Vector3(140, 8, -900)
    );
}

window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "1") setPerspectiveView();
    if (key === "2") setTopView();
    if (key === "3") setFrontView();
    if (key === "4") setSideView();
    if (key === "5") setEnemyAirbaseView();
});

// -----------------------------------------------------------------------------
// RESIZE
// -----------------------------------------------------------------------------

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});

// -----------------------------------------------------------------------------
// LOOP
// -----------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(
        clock.getDelta(),
        0.05
    );

    updateInspectionCamera(deltaTime);

    ocean.update(deltaTime);
    controls.update();

    renderer.render(scene, camera);
}

animate();
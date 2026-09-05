//DEPENDENCIES
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSETS, BALL, PUB_ENVIRONMENT } from "../config/constants.js";

//ASSET MAP
export const RAIL_NAMES = [
    "Rail_Left_Near",
    "Rail_Left_Far",
    "Rail_Right_Near",
    "Rail_Right_Far",
    "Rail_Near",
    "Rail_Far"
];
export const POCKET_NAMES = [
    "Pocket_Left_Near",
    "Pocket_Left_Middle",
    "Pocket_Left_Far",
    "Pocket_Right_Near",
    "Pocket_Right_Middle",
    "Pocket_Right_Far"
];
export const BALL_ASSET_NAMES = [
    "Ball_00_Cue",
    "Ball_01",
    "Ball_02",
    "Ball_03",
    "Ball_04",
    "Ball_05",
    "Ball_06",
    "Ball_07",
    "Ball_08",
    "Ball_09",
    "Ball_10",
    "Ball_11",
    "Ball_12",
    "Ball_13",
    "Ball_14",
    "Ball_15"
];
const REQUIRED_OBJECTS = [
    "PoolTable",
    "PlayingSurface",
    "BallReturn",
    ...RAIL_NAMES,
    ...POCKET_NAMES,
    ...BALL_ASSET_NAMES,
    "Cue",
    "Rack",
    "Rubber"
];

//ASSET LOADER
export class BilliardsAssets {

    //INITIALIZATION
    constructor(renderer) {
        this.renderer = renderer;
        this.root = null;
        this.objects = {};
        this.material = null;
        this.metrics = null;
    }

    //LOADING
    async load() {
        const [gltf, material] = await Promise.all([
            this.#loadModel(),
            this.#createPBRMaterial()
        ]);
        this.root = gltf.scene;
        this.root.name = "BilliardsAssetPack";
        this.#resolveObjects();
        this.#applyMaterial(material);
        this.#restoreVisibleTableApron();
        this.#configureBallReturnVisibleRender();
        this.#enableShadows();
        const scale = this.#calibrateFromBall();
        this.root.scale.setScalar(scale);
        this.root.updateMatrixWorld(true);
        this.#orientLongAxisToZ();
        this.#placeTableOnFloor();
        this.root.position.z += PUB_ENVIRONMENT.MAIN_TABLE_Z;
        this.root.updateMatrixWorld(true);
        this.metrics = this.#measureScene(scale);
        for (const name of BALL_ASSET_NAMES) {
            this.objects[name].visible = false;
        }
        this.objects.Cue.visible = false;
        this.objects.Rack.visible = false;
        this.objects.Rubber.visible = false;
        this.objects.PoolTable.visible = true;
        this.objects.BallReturn.visible = true;
        if (this.objects.PoolTableApron) {
            this.objects.PoolTableApron.visible = false;
        }
        this.#verifyTableShadowState();
        return this;
    }

    //ACCESSORS
    get(name) {
        return this.objects[name] ?? null;
    }
    getRails() {
        return RAIL_NAMES.map(name => this.objects[name]);
    }
    getPockets() {
        return POCKET_NAMES.map(name => this.objects[name]);
    }
    getBallReturn() {
        return this.objects.BallReturn;
    }
    getBallAssets() {
        return BALL_ASSET_NAMES.map(name => this.objects[name]);
    }
    getBallStartPositions() {
        this.root.updateMatrixWorld(true);
        return BALL_ASSET_NAMES.map(name => {
            const position = new THREE.Vector3();
            this.objects[name].getWorldPosition(position);
            return position;
        });
    }
    clonePrototype(name) {
        const object = this.get(name);
        if (!object) {
            throw new Error(`Unknown billiards prototype: ${name}`);
        }
        const clone = object.clone(true);
        clone.visible = true;
        clone.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        return clone;
    }

    //RESOURCE LOADING
    #loadModel() {
        return new Promise((resolve, reject) => {
            new GLTFLoader().load(ASSETS.MODEL, resolve, undefined, error => {
                reject(new Error(`Could not load ${ASSETS.MODEL}. ` + `Copy the updated billiards_assets.glb to public/models/. ` + `Original error: ${error?.message ?? error}`));
            });
        });
    }
    #loadTexture(url, colorSpace) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, texture => {
                texture.flipY = false;
                texture.colorSpace = colorSpace;
                texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
                resolve(texture);
            }, undefined, reject);
        });
    }
    async #createPBRMaterial() {
        const [baseColor, normal, roughness, metallic] = await Promise.all([
            this.#loadTexture(ASSETS.BASE_COLOR, THREE.SRGBColorSpace),
            this.#loadTexture(ASSETS.NORMAL, THREE.NoColorSpace),
            this.#loadTexture(ASSETS.ROUGHNESS, THREE.NoColorSpace),
            this.#loadTexture(ASSETS.METALLIC, THREE.NoColorSpace)
        ]);
        this.material = new THREE.MeshStandardMaterial({
            name: "PoolTable_PBR",
            map: baseColor,
            normalMap: normal,
            roughnessMap: roughness,
            metalnessMap: metallic,
            roughness: 1.0,
            metalness: 1.0
        });
        return this.material;
    }

    //SCENE RESOLUTION
    #resolveObjects() {
        for (const name of REQUIRED_OBJECTS) {
            const object = this.root.getObjectByName(name);
            if (!object) {
                throw new Error(`The GLB does not contain "${name}". Expected objects: ` + REQUIRED_OBJECTS.join(", "));
            }
            this.objects[name] = object;
        }
    }
    #applyMaterial(material) {
        for (const object of Object.values(this.objects)) {
            object.traverse(child => {
                if (child.isMesh) {
                    child.material = material;
                }
            });
        }
    }
    #restoreVisibleTableApron() {
        const source = this.objects.BallReturn;
        if (!source?.isMesh || !source.geometry?.getAttribute("position")) {
            console.warn("Could not rebuild visual table apron from BallReturn.");
            return;
        }
        const expanded = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
        expanded.computeBoundingBox();
        const box = expanded.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        const positions = expanded.getAttribute("position");
        const selectedVertices = [];
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const ab = new THREE.Vector3();
        const ac = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const centroid = new THREE.Vector3();
        const edgeBand = Math.min(size.x, size.z) * 0.045;
        const topCut = box.max.y - size.y * 0.01;
        for (let i = 0; i < positions.count; i += 3) {
            a.fromBufferAttribute(positions, i);
            b.fromBufferAttribute(positions, i + 1);
            c.fromBufferAttribute(positions, i + 2);
            ab.subVectors(b, a);
            ac.subVectors(c, a);
            normal.crossVectors(ab, ac).normalize();
            centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
            const nearOuterEdge = Math.min(Math.abs(centroid.x - box.min.x), Math.abs(centroid.x - box.max.x), Math.abs(centroid.z - box.min.z), Math.abs(centroid.z - box.max.z)) <= edgeBand;
            const mostlyVertical = Math.abs(normal.y) < 0.35;
            if (nearOuterEdge && mostlyVertical && centroid.y < topCut) {
                selectedVertices.push(i, i + 1, i + 2);
            }
        }
        if (selectedVertices.length === 0) {
            console.warn("BallReturn apron extraction selected no triangles.");
            return;
        }
        const geometry = new THREE.BufferGeometry();
        for (const attributeName of [
            "position",
            "normal",
            "uv"
        ]) {
            const sourceAttribute = expanded.getAttribute(attributeName);
            if (!sourceAttribute) {
                continue;
            }
            const values = [];
            for (const vertexIndex of selectedVertices) {
                const offset = vertexIndex * sourceAttribute.itemSize;
                for (let component = 0; component < sourceAttribute.itemSize; component += 1) {
                    values.push(sourceAttribute.array[offset + component]);
                }
            }
            geometry.setAttribute(attributeName, new THREE.Float32BufferAttribute(values, sourceAttribute.itemSize));
        }
        if (!geometry.getAttribute("normal")) {
            geometry.computeVertexNormals();
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const material = this.material.clone();
        material.name = "PoolTable_Apron_PBR";
        material.side = THREE.DoubleSide;
        const apron = new THREE.Mesh(geometry, material);
        apron.name = "PoolTable_ApronVisual";
        apron.position.copy(source.position);
        apron.quaternion.copy(source.quaternion);
        apron.scale.copy(source.scale);
        apron.castShadow = true;
        apron.receiveShadow = true;
        apron.userData.visualOnly = true;
        source.parent?.add(apron);
        this.objects.PoolTableApron = apron;
        expanded.dispose();
    }
    #configureBallReturnVisibleRender() {
        const source = this.objects.BallReturn;
        if (!source?.isMesh || !source.geometry) {
            throw new Error("BallReturn must be a mesh to participate in the visible table render.");
        }
        const material = this.material.clone();
        material.name = "BallReturn_Visible_PBR";
        material.side = THREE.DoubleSide;
        source.material = material;
        source.customDepthMaterial = undefined;
        source.visible = true;
        source.castShadow = true;
        source.receiveShadow = true;
        source.userData.shadowOnly = false;
        source.userData.visibleBallReturn = true;
    }
    #verifyTableShadowState() {
        const tableParts = [
            "PoolTable",
            "PlayingSurface",
            ...RAIL_NAMES,
            ...POCKET_NAMES,
            "BallReturn"
        ];
        if (this.objects.PoolTableApron) {
            tableParts.push("PoolTableApron");
        }
        const report = [];
        for (const name of tableParts) {
            const object = this.objects[name];
            if (!object) {
                continue;
            }
            object.traverse(child => {
                if (!child.isMesh) {
                    return;
                }
                child.castShadow = true;
                child.receiveShadow = true;
                report.push({
                    object: name,
                    mesh: child.name,
                    visible: child.visible,
                    castShadow: child.castShadow,
                    receiveShadow: child.receiveShadow,
                    colorWrite: child.material?.colorWrite,
                    depthWrite: child.material?.depthWrite,
                    shadowOnly: child.userData?.shadowOnly ?? object.userData?.shadowOnly ?? false
                });
            });
        }
        console.info("Table render audit:", report);
    }
    #enableShadows() {
        this.root.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }

    //CALIBRATION
    #calibrateFromBall() {
        const box = new THREE.Box3().setFromObject(this.objects.Ball_00_Cue);
        const size = new THREE.Vector3();
        box.getSize(size);
        const sourceDiameter = Math.max(size.x, size.y, size.z);
        if (!(sourceDiameter > 0)) {
            throw new Error("Ball_00_Cue has an invalid bounding box.");
        }
        return BALL.DIAMETER / sourceDiameter;
    }
    #orientLongAxisToZ() {
        this.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.objects.PoolTable);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x > size.z) {
            this.root.rotation.y += Math.PI / 2;
            this.root.updateMatrixWorld(true);
        }
    }
    #placeTableOnFloor() {
        this.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.objects.PoolTable);
        const center = new THREE.Vector3();
        box.getCenter(center);
        this.root.position.x -= center.x;
        this.root.position.z -= center.z;
        this.root.position.y -= box.min.y;
        this.root.updateMatrixWorld(true);
    }
    #measureScene(scale) {
        const tableBox = new THREE.Box3().setFromObject(this.objects.PoolTable);
        const tableSize = new THREE.Vector3();
        tableBox.getSize(tableSize);
        const surfaceBox = new THREE.Box3().setFromObject(this.objects.PlayingSurface);
        const surfaceSize = new THREE.Vector3();
        surfaceBox.getSize(surfaceSize);
        const clothY = surfaceBox.max.y;
        return {
            scale,
            clothY,
            tableSize,
            tableBox,
            surfaceBox,
            surfaceSize
        };
    }
}

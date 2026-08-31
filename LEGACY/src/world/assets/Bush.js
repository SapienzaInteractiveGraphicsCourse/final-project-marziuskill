import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export class Bush {
    constructor(scene) {
        this.scene = scene;
        this.loaded = false;

        this.geometry = null;
        this.material = null;

        this.instances = [];
        this.instancedMeshes = [];

        this.textureLoader = new THREE.TextureLoader();

        this.ready = this._load();
    }

    _loadTexture(filename) {
        const texture = this.textureLoader.load(
            `./assets/models/environment/bush/textures/${filename}`
        );

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = true;

        return texture;
    }

    _createMaterial() {
        return new THREE.MeshStandardMaterial({
            map: this._loadTexture("bush_basecolor.png"),
            roughness: 0.9,
            metalness: 0,
            alphaTest: 0.4,
            side: THREE.DoubleSide
        });
    }

    _load() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            loader.load(
                "./assets/models/environment/bush/bush.glb",

                (gltf) => {
                    let sourceMesh = null;

                    gltf.scene.traverse((child) => {
                        if (child.isMesh && !sourceMesh) sourceMesh = child;
                    });

                    if (!sourceMesh) {
                        reject(new Error("Bush: no mesh found in bush.glb"));
                        return;
                    }

                    this.geometry = sourceMesh.geometry;
                    this.material = this._createMaterial();

                    this.geometry.computeBoundingBox();
                    this.geometry.computeBoundingSphere();

                    const size = new THREE.Vector3();
                    this.geometry.boundingBox.getSize(size);

                    this.loaded = true;

                    console.log(
                        `Bush loaded: size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`
                    );

                    resolve(this);
                },

                undefined,

                (error) => {
                    console.error("Error loading Bush:", error);
                    reject(error);
                }
            );
        });
    }

    create({
        position = new THREE.Vector3(),
        heading = 0,
        scale = 1,
        tiltX = 0,
        tiltZ = 0,
        parent = this.scene,
        name = "Bush_Instance"
    } = {}) {
        if (!this.loaded) {
            console.warn("Bush.create() called before asset finished loading.");
            return null;
        }

        const mesh = new THREE.Mesh(this.geometry, this.material);

        mesh.name = name;
        mesh.position.copy(position);
        mesh.rotation.set(tiltX, heading, tiltZ);

        if (typeof scale === "number") {
            mesh.scale.setScalar(scale);
        } else {
            mesh.scale.copy(scale);
        }

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        parent.add(mesh);
        this.instances.push(mesh);

        return mesh;
    }

    createInstanced(placements, {
        parent = this.scene,
        name = "Bush_Instanced"
    } = {}) {
        if (!this.loaded) {
            console.warn("Bush.createInstanced() called before asset finished loading.");
            return null;
        }

        if (!placements || placements.length === 0) {
            console.warn("Bush.createInstanced(): no placements supplied.");
            return null;
        }

        const mesh = new THREE.InstancedMesh(
            this.geometry,
            this.material,
            placements.length
        );

        mesh.name = name;
        mesh.castShadow = false;
        mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();

        placements.forEach((placement, index) => {
            const {
                position = new THREE.Vector3(),
                heading = 0,
                scale = 1,
                tiltX = 0,
                tiltZ = 0
            } = placement;

            dummy.position.copy(position);
            dummy.rotation.set(tiltX, heading, tiltZ);

            if (typeof scale === "number") {
                dummy.scale.setScalar(scale);
            } else {
                dummy.scale.copy(scale);
            }

            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;

        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();

        parent.add(mesh);
        this.instancedMeshes.push(mesh);

        return mesh;
    }

    remove(instance) {
        if (!instance) return;

        instance.removeFromParent();

        let index = this.instances.indexOf(instance);

        if (index !== -1) {
            this.instances.splice(index, 1);
        }

        index = this.instancedMeshes.indexOf(instance);

        if (index !== -1) {
            this.instancedMeshes.splice(index, 1);
        }
    }

    clear() {
        for (const instance of [
            ...this.instances,
            ...this.instancedMeshes
        ]) {
            instance.removeFromParent();
        }

        this.instances.length = 0;
        this.instancedMeshes.length = 0;
    }

    isLoaded() {
        return this.loaded;
    }
}
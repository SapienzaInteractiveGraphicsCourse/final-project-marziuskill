import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CAMERA } from "../config/constants.js";

//SCENE MANAGER
export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x090b0a);
        this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, CAMERA.NEAR, CAMERA.FAR);
        this.camera.position.set(3.3, 2.7, 3.8);
        this.scene.add(this.camera);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.minDistance = 0.6;
        this.controls.maxDistance = 10;
        this.controls.maxPolarAngle = Math.PI * 0.49;
        this._onResize = this.#onResize.bind(this);
        window.addEventListener("resize", this._onResize);
    }
    frameObject(object, targetY = 0.8) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxSize = Math.max(size.x, size.y, size.z);
        const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
        const distance = (maxSize * 0.5) / Math.tan(halfFov) * 1.55;
        const direction = new THREE.Vector3(1.15, 0.85, 1.25).normalize();
        this.controls.target.set(center.x, targetY, center.z);
        this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
        this.camera.near = Math.max(0.005, distance / 500);
        this.camera.far = Math.max(100, distance * 20);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }
    #onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    render() {
        if (this.controls.enabled) {
            this.controls.update();
        }
        this.renderer.render(this.scene, this.camera);
    }
    dispose() {
        window.removeEventListener("resize", this._onResize);
        this.controls.dispose();
        this.renderer.dispose();
    }
}

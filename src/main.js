import * as THREE from "three";

import { SceneManager } from "./graphics/SceneManager.js";
import { LightingSystem } from "./graphics/LightingSystem.js";
import { PoolTable } from "./objects/PoolTable.js";

import "./style.css";

const container = document.querySelector("#app");

const sceneManager = new SceneManager(container);

new LightingSystem(sceneManager.scene);

const table = new PoolTable();
sceneManager.scene.add(table);

// Small axes helper during development.
// X = red, Y = green, Z = blue.
const axes = new THREE.AxesHelper(0.45);
axes.position.set(0, 0.02, 0);
sceneManager.scene.add(axes);

function animate() {
  requestAnimationFrame(animate);
  sceneManager.render();
}

animate();

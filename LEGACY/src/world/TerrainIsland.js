import * as THREE from "three";
import {getTerrainMaterial, bindTerrainMaterial} from "./TerrainMaterial.js";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};

export class TerrainIsland {
    constructor(scene, config, {
        seaLevel = 0,
        cellSize = 4
    } = {}) {
        this.scene = scene;
        this.config = config;

        this.id = config.id;
        this.name = config.name ?? config.id;
        this.center = new THREE.Vector2(config.center.x, config.center.z);

        this.sizeX = config.size.x;
        this.sizeZ = config.size.z;

        this.radiusX = this.sizeX * 0.5;
        this.radiusZ = this.sizeZ * 0.5;

        this.maxHeight = config.maxHeight ?? 15;
        this.seed = config.seed ?? 1;
        this.coastVariation = config.coastVariation ?? 0.14;
        this.noiseScale = config.noiseScale ?? 80;
        this.shoreSlope = config.shoreSlope ?? 4;
        this.mountainStrength = config.mountainStrength ?? 0.5;
        this.mountainSharpness = config.mountainSharpness ?? 3;
        this.mountainScale = config.mountainScale ?? 0.55;
        this.meshMargin = config.meshMargin ?? 1.2;
        this.flattenZones = config.flattenZones ?? [];

        this.seaLevel = seaLevel;
        this.cellSize = cellSize;
        this.underwaterSlope = config.underwaterSlope ?? 28;
        this.seabedMin = seaLevel - (config.seabedDepth ?? 12);
        this.renderUnderwaterDepth = config.renderUnderwaterDepth ?? 0.75;

        this.meshWidth = this.sizeX * this.meshMargin;
        this.meshDepth = this.sizeZ * this.meshMargin;

        this.segmentsX = Math.max(32, Math.ceil(this.meshWidth / cellSize));
        this.segmentsZ = Math.max(32, Math.ceil(this.meshDepth / cellSize));

        this.mesh = this._buildMesh();
        this.mesh.name = `Terrain_${this.id}`;

        this.scene.add(this.mesh);
        const bounds = this.mesh.geometry.boundingBox;

        console.log(
            `TerrainIsland ${this.id}: ` +
            `size=(${this.sizeX}, ${this.sizeZ}), ` +
            `height=${bounds.min.y.toFixed(2)} -> ${bounds.max.y.toFixed(2)}, ` +
            `segments=(${this.segmentsX}, ${this.segmentsZ})`
        );
    }

    _hash(ix, iz) {
        let h =
            Math.imul(ix, 374761393) ^
            Math.imul(iz, 668265263) ^
            Math.imul(this.seed, 1442695041);

        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;

        return (h >>> 0) / 4294967295;
    }

    _noise2(x, z) {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);

        const fx = x - x0;
        const fz = z - z0;

        const sx = fx * fx * (3 - 2 * fx);
        const sz = fz * fz * (3 - 2 * fz);

        const n00 = this._hash(x0, z0);
        const n10 = this._hash(x0 + 1, z0);
        const n01 = this._hash(x0, z0 + 1);
        const n11 = this._hash(x0 + 1, z0 + 1);

        const nx0 = lerp(n00, n10, sx);
        const nx1 = lerp(n01, n11, sx);

        return lerp(nx0, nx1, sz);
    }

    _fbm(x, z, octaves = 5) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let totalAmplitude = 0;

        for (let i = 0; i < octaves; i++) {
            value += this._noise2(x * frequency, z * frequency) * amplitude;
            totalAmplitude += amplitude;

            frequency *= 2;
            amplitude *= 0.5;
        }

        return value / totalAmplitude;
    }

    _normalizedRadius(localX, localZ) {
        const nx = localX / this.radiusX;
        const nz = localZ / this.radiusZ;

        const radius = Math.hypot(nx, nz);

        if (radius < 0.000001) return 0;

        const angle = Math.atan2(nz, nx);

        const coastNoise = this._fbm(
            Math.cos(angle) * 1.8 + 31.7,
            Math.sin(angle) * 1.8 - 19.3,
            4
        );

        const boundary =
            1 +
            (coastNoise - 0.5) *
            2 *
            this.coastVariation;

        return radius / boundary;
    }

    _flattenWeight(localX, localZ, zone) {
        if (zone.type !== "rectangle") return 0;

        const centerX = zone.center.x - this.center.x;
        const centerZ = zone.center.z - this.center.y;

        const dx = localX - centerX;
        const dz = localZ - centerZ;

        const heading = zone.heading ?? 0;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);

        const zoneX = cos * dx - sin * dz;
        const zoneZ = sin * dx + cos * dz;

        const halfWidth = zone.width * 0.5;
        const halfLength = zone.length * 0.5;

        const outsideX = Math.max(Math.abs(zoneX) - halfWidth, 0);
        const outsideZ = Math.max(Math.abs(zoneZ) - halfLength, 0);

        const outsideDistance = Math.hypot(outsideX, outsideZ);

        if (outsideDistance <= 0) return 1;

        const falloff = zone.falloff ?? 0;
        if (falloff <= 0 || outsideDistance >= falloff) return 0;

        return 1 - smoothstep(0, falloff, outsideDistance);
    }

    _applyFlattenZones(localX, localZ, naturalHeight) {
        let height = naturalHeight;

        for (const zone of this.flattenZones) {
            const weight = this._flattenWeight(localX, localZ, zone);
            if (weight <= 0) continue;

            height = lerp(
                height,
                zone.targetHeight,
                weight
            );
        }

        return height;
    }

    _heightLocal(localX, localZ) {
        const radius = this._normalizedRadius(localX, localZ);
        const signedDistance = 1 - radius;

        const shoreHeight = signedDistance * this.shoreSlope;

        if (signedDistance <= 0) {
            const outside = -signedDistance;

            return Math.max(
                this.seabedMin,
                this.seaLevel - outside * this.underwaterSlope
            );
        }

        const inlandMask = smoothstep(
            0,
            0.78,
            signedDistance
        );

        const n1 = this._fbm(
            localX / this.noiseScale + 7.3,
            localZ / this.noiseScale - 11.8,
            5
        );

        const n2 = this._fbm(
            localX / (this.noiseScale * 0.43) - 23.1,
            localZ / (this.noiseScale * 0.43) + 14.6,
            4
        );

        const baseNoise = clamp(
            n1 * 0.72 + n2 * 0.28,
            0,
            1
        );

        const ridgeNoise = this._fbm(
            localX / (this.noiseScale * this.mountainScale) + 41.7,
            localZ / (this.noiseScale * this.mountainScale) - 28.4,
            5
        );

        const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
        const sharpRidge = Math.pow(ridge, this.mountainSharpness);

        const baseHeight =
            this.maxHeight *
            (0.12 + baseNoise * 0.34) *
            Math.pow(inlandMask, 1.2);

        const mountainHeight =
            this.maxHeight *
            this.mountainStrength *
            sharpRidge *
            Math.pow(inlandMask, 0.8);

        const terrainHeight = Math.min(
            this.maxHeight,
            baseHeight + mountainHeight
        );

        const naturalHeight =
            this.seaLevel +
            shoreHeight +
            terrainHeight;

        return this._applyFlattenZones(
            localX,
            localZ,
            naturalHeight
        );
    }

    getHeightAt(worldX, worldZ) {
        const localX = worldX - this.center.x;
        const localZ = worldZ - this.center.y;

        return this._heightLocal(localX, localZ);
    }

    getNormalAt(worldX, worldZ, epsilon = 1.5) {
        const hL = this.getHeightAt(worldX - epsilon, worldZ);
        const hR = this.getHeightAt(worldX + epsilon, worldZ);
        const hD = this.getHeightAt(worldX, worldZ - epsilon);
        const hU = this.getHeightAt(worldX, worldZ + epsilon);

        return new THREE.Vector3(
            hL - hR,
            epsilon * 2,
            hD - hU
        ).normalize();
    }

    contains(worldX, worldZ, minHeight = 0.05) {
        return this.getHeightAt(worldX, worldZ) >
            this.seaLevel + minHeight;
    }

    _buildMesh() {
        const geometry = new THREE.BufferGeometry();

        const positions = [];
        const uvs = [];
        const indices = [];

        for (let z = 0; z <= this.segmentsZ; z++) {
            const tz = z / this.segmentsZ;
            const localZ = (tz - 0.5) * this.meshDepth;

            for (let x = 0; x <= this.segmentsX; x++) {
                const tx = x / this.segmentsX;
                const localX = (tx - 0.5) * this.meshWidth;

                const worldX = this.center.x + localX;
                const worldZ = this.center.y + localZ;

                const height = this.getHeightAt(worldX, worldZ);

                positions.push(localX, height, localZ);
                uvs.push(tx, tz);
            }
        }

        const row = this.segmentsX + 1;
        const renderCutoff = this.seaLevel - this.renderUnderwaterDepth;

        const getHeight = (index) => positions[index * 3 + 1];

        const shouldRenderTriangle = (a, b, c) => {
            return (
                getHeight(a) >= renderCutoff ||
                getHeight(b) >= renderCutoff ||
                getHeight(c) >= renderCutoff
            );
        };

        for (let z = 0; z < this.segmentsZ; z++) {
            for (let x = 0; x < this.segmentsX; x++) {
                const a = z * row + x;
                const b = a + 1;
                const c = a + row;
                const d = c + 1;

                if (shouldRenderTriangle(a, c, b)) {
                    indices.push(a, c, b);
                }

                if (shouldRenderTriangle(b, c, d)) {
                    indices.push(b, c, d);
                }
            }
        }

        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3)
        );

        geometry.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute(uvs, 2)
        );

        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, getTerrainMaterial());

        mesh.position.set(
            this.center.x,
            0,
            this.center.y
        );

        mesh.receiveShadow = true;
        mesh.castShadow = false;
        bindTerrainMaterial(mesh, this);

        return mesh;
    }

    setVisible(visible) {
        this.mesh.visible = visible;
    }

    setWireframe(enabled) {
        getTerrainMaterial().wireframe = enabled;
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
    }
}
import * as THREE from "three";

export class Island {
    constructor({size = 260, segments = 100, maxHeight = 28, seed = 1234} = {}) {
        this.size = size;
        this.maxHeight = maxHeight;
        this.seed = seed;
        // Geometry
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        // Plane Geometry is initially on XYZ: rotate it so that Y becomes vertical and terrain lies on XZ.
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        // height generation
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const z = position.getZ(i);
            position.setY(i, this.getHeightAt(x, z));
        }
        // Calculate normals after deforming terrain
        geometry.computeVertexNormals();
        // Vertex colors
        const normal = geometry.attributes.normal;
        const colors = [];
        for (let i = 0; i < position.count; i++) {
            const height = position.getY(i);
            const normalY = normal.getY(i);
            const color = this._getTerrainColor(height, normalY);
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        // Material
        const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9, metalness: 0});
        // Mesh
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = "Island";
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
    }

    // TERRAIN COLOR FUNCTION
    _getTerrainColor(height, normalY) {
        const normalizedHeight = height / this.maxHeight; // Normalize height to [0, 1]
        const beach = new THREE.Color(0xd8c38a);
        const grass = new THREE.Color(0x4f8a3f);
        const darkGrass = new THREE.Color(0x356332);
        const rock = new THREE.Color(0x686b60);
        const peak = new THREE.Color(0xb7b7ad);
        // Beach
        if (normalizedHeight < 0.025) {
            return beach;
        }
        // Steep slope --> rock
        // normalY close to 1 = horizontal; normalY lower = steep slope
        if (normalY < 0.68 && normalizedHeight > 0.18) {
            return rock;
        }
        // Grass lowland
        if (normalizedHeight < 0.30) {
            const t = THREE.MathUtils.smoothstep(normalizedHeight, 0.025, 0.22);
            return beach.clone().lerp(grass, t);
        }
        // High grass
        if (normalizedHeight < 0.55) {
            const t = THREE.MathUtils.smoothstep(normalizedHeight, 0.30, 0.55);
            return grass.clone().lerp(darkGrass, t);
        }
        // Mountain
        if (normalizedHeight < 0.82) {
            const t = THREE.MathUtils.smoothstep(normalizedHeight, 0.55, 0.82);
            return darkGrass.clone().lerp(rock, t);
        }
        // Peak
        const t = THREE.MathUtils.smoothstep(normalizedHeight, 0.82, 1.10);
        return rock.clone().lerp(peak, t);
    }

    // GAUSSIAN-LIKE HILL
    _hill(x, z, centerX, centerZ, radius, height) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distanceSquared = dx * dx + dz * dz;
        return (height * Math.exp(-distanceSquared / (radius * radius)));
    }

    // SEEDED RANDOM VALUE
    _seededValue(index) {
        const value = Math.sin(this.seed * 12.9898 + index * 78.233) * 43758.5453;
        return (value - Math.floor(value));
    }

    // Hash
    _hash2D(x, z, offset = 0) {
        const value = Math.sin(x * 127.1 + z * 311.7 + this.seed * 74.7 + offset * 53.1) * 43758.5453123;
        return (value - Math.floor(value));
    }

    // SMOOTH VALUE NOISE
    _valueNoise2D(x, z, offset = 0) {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        const tx = x - x0;
        const tz = z - z0;
        // Smoothstep interpolation
        const sx = tx * tx * (3 - 2 * tx);
        const sz = tz * tz * (3 - 2 * tz);
        const n00 = this._hash2D(x0, z0, offset);
        const n10 = this._hash2D(x1, z0, offset);
        const n01 = this._hash2D(x0, z1, offset);
        const n11 = this._hash2D(x1, z1, offset);
        const nx0 = THREE.MathUtils.lerp(n00, n10, sx);
        const nx1 = THREE.MathUtils.lerp(n01, n11, sx);
        const value = THREE.MathUtils.lerp(nx0, nx1, sz);
        // Convert [0, 1] to [-1, 1]
        return (value * 2 - 1);
    }

    // MOUNTAIN REGION MASK
    _regionMask(x, z, centerX, centerZ, radius) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const normalized = THREE.MathUtils.clamp( distance / radius, 0, 1);
        const t = 1 - normalized; // 1 at center, 0 at radius
        return t * t * (3 - 2 * t); // Smoothstep
    }

    // HEIGHT FUNCTION
    getHeightAt(x, z) {
        // Distance from center, normalized to [0, 1] approximately
        const baseRadius = this.size * 0.46;
        const distance = Math.sqrt(x * x + z * z);
        const angle = Math.atan2(z, x);
        // Irregular coast
        const phase1 = this._seededValue(1) * Math.PI * 2;
        const phase2 = this._seededValue(2) * Math.PI * 2;
        const phase3 = this._seededValue(3) * Math.PI * 2;
        const coastlineVariation = Math.sin(angle * 3 + phase1) * 0.10 + Math.sin(angle * 5 + phase2) * 0.055 + Math.sin(angle * 7 + phase3) * 0.025;
        const localRadius = baseRadius * (1 + coastlineVariation);
        const normalizedDistance = distance / localRadius;
        // Outside island
        if (normalizedDistance >= 1) {
            return ((-3 - normalizedDistance * 2) * this.maxHeight * 0.35);
        }
        const islandMask = 1 - normalizedDistance; // 1 at center, 0 at coast
        const shapedMask = Math.pow(islandMask, 1.35); // Non-linear falloff gives wider lowland/coastal area rather than simple cone.
        // Mountain regions
        const mountainRegion1 = this._regionMask(x, z, -this.size * 0.12, -this.size * 0.06, this.size * 0.30);
        const mountainRegion2 = this._regionMask(x, z, this.size * 0.17, this.size * 0.12, this.size * 0.20);
        const mountainRegion = Math.max(mountainRegion1, mountainRegion2);
        const mountainMask = mountainRegion * Math.pow(islandMask, 1.4); // Concentrate mountains ridges away from immediate coastline
        // Main land mass
        let height = this.maxHeight * shapedMask * 0.22;
        const largeNoise = this._valueNoise2D(x / (this.size * 0.28), z / (this.size * 0.28)); // Large-scale noise
        height += largeNoise * this.maxHeight * 0.13 * shapedMask;
        const mediumNoise = this._valueNoise2D(x / (this.size * 0.10), z / (this.size * 0.10)); // Medium-scale noise
        height += mediumNoise * this.maxHeight * 0.04 * shapedMask;
        const smallNoise = this._valueNoise2D(x / (this.size * 0.035), z / (this.size * 0.035)); // Small terrain details
        height += smallNoise * this.maxHeight * 0.006 * shapedMask;
        const ridgeNoise = this._valueNoise2D(x / (this.size * 0.13), z / (this.size * 0.13), 71); // Ridged mountains
        const ridge = 1 - Math.abs(ridgeNoise); // Convert smooth noise into ridges
        height += ridge * ridge * this.maxHeight * 0.14 * mountainMask; // Add ridged mountains
        // Distinct mountain masses
        height += this._hill(x, z, -this.size * 0.18, -this.size * 0.08, this.size * 0.16, this.maxHeight * 0.40) * mountainMask;
        height += this._hill(x, z, this.size * 0.16, this.size * 0.10, this.size * 0.13, this.maxHeight * 0.34) * mountainMask;
        height += this._hill(x, z, this.size * 0.04, -this.size * 0.22, this.size * 0.10, this.maxHeight * 0.25) * mountainMask;
        return Math.max(height, -3);
    }

    // PUBLIC OBJECT
    getObject3D() {
        return this.mesh;
    }
}
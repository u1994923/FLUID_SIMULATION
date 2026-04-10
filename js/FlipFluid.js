/**
 * FLIP Fluid Physics Engine
 * Implements the Fluid-Implicit-Particle method for realistic fluid simulation
 * 
 * @module FlipFluid
 * @author FluidPendant Project
 * @version 2.0
 */

// Cell type constants
export const FLUID_CELL = 0;
export const AIR_CELL = 1;
export const SOLID_CELL = 2;

/**
 * Clamp a value between min and max
 * @param {number} x - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(x, min, max) {
    if (x < min) return min;
    else if (x > max) return max;
    else return x;
}

/**
 * FLIP Fluid simulation class
 * Combines Lagrangian particles with Eulerian grid for realistic fluid behavior
 */
export class FlipFluid {
    /**
     * Create a new FLIP fluid simulation
     * @param {number} density - Fluid density in kg/m³
     * @param {number} width - Simulation width
     * @param {number} height - Simulation height
     * @param {number} spacing - Grid cell spacing
     * @param {number} particleRadius - Radius of particles
     * @param {number} maxParticles - Maximum number of particles
     */
    constructor(density, width, height, spacing, particleRadius, maxParticles) {
        // Fluid grid
        this.density = density;
        this.fNumX = Math.floor(width / spacing) + 1;
        this.fNumY = Math.floor(height / spacing) + 1;
        this.h = Math.max(width / this.fNumX, height / this.fNumY);
        this.fInvSpacing = 1.0 / this.h;
        this.fNumCells = this.fNumX * this.fNumY;

        // Velocity fields (staggered grid)
        this.u = new Float32Array(this.fNumCells);
        this.v = new Float32Array(this.fNumCells);
        this.du = new Float32Array(this.fNumCells);
        this.dv = new Float32Array(this.fNumCells);
        this.prevU = new Float32Array(this.fNumCells);
        this.prevV = new Float32Array(this.fNumCells);
        
        // Pressure and cell data
        this.p = new Float32Array(this.fNumCells);
        this.s = new Float32Array(this.fNumCells);
        this.cellType = new Int32Array(this.fNumCells);

        // Particles
        this.maxParticles = maxParticles;
        this.particlePos = new Float32Array(2 * this.maxParticles);
        this.particleVel = new Float32Array(2 * this.maxParticles);
        this.particleDensity = new Float32Array(this.fNumCells);
        this.particleRestDensity = 0.0;

        this.particleRadius = particleRadius;
        this.pInvSpacing = 1.0 / (2.2 * particleRadius);
        this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
        this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
        this.pNumCells = this.pNumX * this.pNumY;

        // Particle spatial hashing
        this.numCellParticles = new Int32Array(this.pNumCells);
        this.firstCellParticle = new Int32Array(this.pNumCells + 1);
        this.cellParticleIds = new Int32Array(maxParticles);

        this.numParticles = 0;
    }

    /**
     * Integrate particle positions with gravity
     * @param {number} dt - Time step
     * @param {number} gravityX - Gravity X component
     * @param {number} gravityY - Gravity Y component
     * @param {number} viscosity - Fluid viscosity (damping)
     */
    integrateParticles(dt, gravityX, gravityY, viscosity = 0) {
        for (let i = 0; i < this.numParticles; i++) {
            this.particleVel[2 * i] += dt * gravityX;
            this.particleVel[2 * i + 1] += dt * gravityY;

            // Apply viscosity by damping velocity
            const viscosityDamping = Math.max(0.0, 1.0 - (viscosity * dt));
            this.particleVel[2 * i] *= viscosityDamping;
            this.particleVel[2 * i + 1] *= viscosityDamping;

            this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
            this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
        }
    }

    /**
     * Push overlapping particles apart
     * @param {number} numIters - Number of separation iterations
     */
    pushParticlesApart(numIters) {
        // Count particles per cell
        this.numCellParticles.fill(0);

        for (let i = 0; i < this.numParticles; i++) {
            const x = this.particlePos[2 * i];
            const y = this.particlePos[2 * i + 1];
            const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
            const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
            const cellNr = xi * this.pNumY + yi;
            this.numCellParticles[cellNr]++;
        }

        // Compute prefix sums
        let first = 0;
        for (let i = 0; i < this.pNumCells; i++) {
            this.firstCellParticle[i] = first;
            first += this.numCellParticles[i];
        }
        this.firstCellParticle[this.pNumCells] = first;

        // Fill particle IDs into cells
        this.numCellParticles.fill(0);
        for (let i = 0; i < this.numParticles; i++) {
            const x = this.particlePos[2 * i];
            const y = this.particlePos[2 * i + 1];
            const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
            const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
            const cellNr = xi * this.pNumY + yi;
            this.cellParticleIds[this.firstCellParticle[cellNr] + this.numCellParticles[cellNr]] = i;
            this.numCellParticles[cellNr]++;
        }

        // Separate particles
        const minDist = 2.0 * this.particleRadius;
        const minDist2 = minDist * minDist;

        for (let iter = 0; iter < numIters; iter++) {
            for (let i = 0; i < this.numParticles; i++) {
                const px = this.particlePos[2 * i];
                const py = this.particlePos[2 * i + 1];

                const pxi = Math.floor(px * this.pInvSpacing);
                const pyi = Math.floor(py * this.pInvSpacing);
                const x0 = Math.max(pxi - 1, 0);
                const y0 = Math.max(pyi - 1, 0);
                const x1 = Math.min(pxi + 1, this.pNumX - 1);
                const y1 = Math.min(pyi + 1, this.pNumY - 1);

                for (let xi = x0; xi <= x1; xi++) {
                    for (let yi = y0; yi <= y1; yi++) {
                        const cellNr = xi * this.pNumY + yi;
                        const first = this.firstCellParticle[cellNr];
                        const last = first + this.numCellParticles[cellNr];

                        for (let j = first; j < last; j++) {
                            const id = this.cellParticleIds[j];
                            if (id === i) continue;

                            const qx = this.particlePos[2 * id];
                            const qy = this.particlePos[2 * id + 1];

                            let dx = qx - px;
                            let dy = qy - py;
                            const d2 = dx * dx + dy * dy;

                            if (d2 > minDist2 || d2 === 0.0) continue;

                            const d = Math.sqrt(d2);
                            const s = 0.5 * (minDist - d) / d;
                            dx *= s;
                            dy *= s;
                            this.particlePos[2 * i] -= dx;
                            this.particlePos[2 * i + 1] -= dy;
                            this.particlePos[2 * id] += dx;
                            this.particlePos[2 * id + 1] += dy;
                        }
                    }
                }
            }
        }
    }

    /**
     * Handle particle collisions with obstacles and container
     * @param {number} obstacleX - Obstacle X position
     * @param {number} obstacleY - Obstacle Y position  
     * @param {number} obstacleRadius - Obstacle radius
     * @param {boolean} gravityMode - Whether in gravity mode (no obstacle)
     * @param {Function} isValidPosition - Function to check if position is valid
     */
    handleParticleCollisions(obstacleX, obstacleY, obstacleRadius, gravityMode, isValidPosition) {
        const h = 1.0 / this.fInvSpacing;
        const r = this.particleRadius;
        const minDist = obstacleRadius + r;
        const minDist2 = minDist * minDist;

        for (let i = 0; i < this.numParticles; i++) {
            let x = this.particlePos[2 * i];
            let y = this.particlePos[2 * i + 1];

            // Only apply obstacle collision if not in gravity mode
            if (!gravityMode) {
                const dx = x - obstacleX;
                const dy = y - obstacleY;
                const d2 = dx * dx + dy * dy;

                if (d2 < minDist2) {
                    const d = Math.sqrt(d2);
                    const s = (minDist - d) / d;
                    this.particlePos[2 * i] = obstacleX + dx * (1.0 + s);
                    this.particlePos[2 * i + 1] = obstacleY + dy * (1.0 + s);
                }
            }

            // Container wall collisions
            if (isValidPosition && !isValidPosition(x, y, this)) {
                let attempts = 0;
                while (!isValidPosition(x, y, this) && attempts < 10) {
                    const centerX = this.fNumX * h * 0.5;
                    const centerY = this.fNumY * h * 0.5;
                    let dirX = centerX - x;
                    let dirY = centerY - y;
                    const len = Math.sqrt(dirX * dirX + dirY * dirY);
                    if (len > 0) {
                        dirX /= len;
                        dirY /= len;
                        x += dirX * h * 0.1;
                        y += dirY * h * 0.1;
                    }
                    attempts++;
                }
                this.particlePos[2 * i] = x;
                this.particlePos[2 * i + 1] = y;
                this.particleVel[2 * i] *= 0.5;
                this.particleVel[2 * i + 1] *= 0.5;
            }
        }
    }

    /**
     * Update particle density field
     */
    updateParticleDensity() {
        const n = this.fNumY;
        const h = this.h;
        const h1 = this.fInvSpacing;
        const h2 = 0.5 * h;

        this.particleDensity.fill(0.0);

        for (let i = 0; i < this.numParticles; i++) {
            let x = this.particlePos[2 * i];
            let y = this.particlePos[2 * i + 1];

            x = clamp(x, h, (this.fNumX - 1) * h);
            y = clamp(y, h, (this.fNumY - 1) * h);

            const x0 = Math.floor((x - h2) * h1);
            const tx = ((x - h2) - x0 * h) * h1;
            const x1 = Math.min(x0 + 1, this.fNumX - 2);

            const y0 = Math.floor((y - h2) * h1);
            const ty = ((y - h2) - y0 * h) * h1;
            const y1 = Math.min(y0 + 1, this.fNumY - 2);

            const sx = 1.0 - tx;
            const sy = 1.0 - ty;

            if (x0 < this.fNumX && y0 < this.fNumY) this.particleDensity[x0 * n + y0] += sx * sy;
            if (x1 < this.fNumX && y0 < this.fNumY) this.particleDensity[x1 * n + y0] += tx * sy;
            if (x1 < this.fNumX && y1 < this.fNumY) this.particleDensity[x1 * n + y1] += tx * ty;
            if (x0 < this.fNumX && y1 < this.fNumY) this.particleDensity[x0 * n + y1] += sx * ty;
        }

        if (this.particleRestDensity === 0.0) {
            let sum = 0.0;
            let numFluidCells = 0;

            for (let i = 0; i < this.fNumCells; i++) {
                if (this.cellType[i] === FLUID_CELL) {
                    sum += this.particleDensity[i];
                    numFluidCells++;
                }
            }

            if (numFluidCells > 0)
                this.particleRestDensity = sum / numFluidCells;
        }
    }

    /**
     * Transfer velocities between particles and grid
     * @param {boolean} toGrid - True to transfer from particles to grid
     * @param {number} flipRatio - PIC/FLIP mixing ratio
     */
    transferVelocities(toGrid, flipRatio = 0.9) {
        const n = this.fNumY;
        const h = this.h;
        const h1 = this.fInvSpacing;
        const h2 = 0.5 * h;

        if (toGrid) {
            this.prevU.set(this.u);
            this.prevV.set(this.v);

            this.du.fill(0.0);
            this.dv.fill(0.0);
            this.u.fill(0.0);
            this.v.fill(0.0);

            for (let i = 0; i < this.fNumCells; i++) {
                this.cellType[i] = this.s[i] === 0.0 ? SOLID_CELL : AIR_CELL;
            }

            for (let i = 0; i < this.numParticles; i++) {
                const x = this.particlePos[2 * i];
                const y = this.particlePos[2 * i + 1];
                const xi = clamp(Math.floor(x * h1), 0, this.fNumX - 1);
                const yi = clamp(Math.floor(y * h1), 0, this.fNumY - 1);
                const cellNr = xi * n + yi;

                if (this.cellType[cellNr] === AIR_CELL)
                    this.cellType[cellNr] = FLUID_CELL;
            }
        }

        for (let component = 0; component < 2; component++) {
            const dx = component === 0 ? 0.0 : h2;
            const dy = component === 0 ? h2 : 0.0;

            const f = component === 0 ? this.u : this.v;
            const prevF = component === 0 ? this.prevU : this.prevV;
            const d = component === 0 ? this.du : this.dv;

            for (let i = 0; i < this.numParticles; i++) {
                let x = this.particlePos[2 * i];
                let y = this.particlePos[2 * i + 1];

                x = clamp(x, h, (this.fNumX - 1) * h);
                y = clamp(y, h, (this.fNumY - 1) * h);

                const x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2);
                const tx = ((x - dx) - x0 * h) * h1;
                const x1 = Math.min(x0 + 1, this.fNumX - 2);

                const y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2);
                const ty = ((y - dy) - y0 * h) * h1;
                const y1 = Math.min(y0 + 1, this.fNumY - 2);

                const sx = 1.0 - tx;
                const sy = 1.0 - ty;

                const d0 = sx * sy;
                const d1 = tx * sy;
                const d2 = tx * ty;
                const d3 = sx * ty;

                const nr0 = x0 * n + y0;
                const nr1 = x1 * n + y0;
                const nr2 = x1 * n + y1;
                const nr3 = x0 * n + y1;

                if (toGrid) {
                    const pv = this.particleVel[2 * i + component];
                    f[nr0] += pv * d0; d[nr0] += d0;
                    f[nr1] += pv * d1; d[nr1] += d1;
                    f[nr2] += pv * d2; d[nr2] += d2;
                    f[nr3] += pv * d3; d[nr3] += d3;
                } else {
                    const offset = component === 0 ? n : 1;
                    const valid0 = this.cellType[nr0] !== AIR_CELL || this.cellType[nr0 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid1 = this.cellType[nr1] !== AIR_CELL || this.cellType[nr1 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid2 = this.cellType[nr2] !== AIR_CELL || this.cellType[nr2 - offset] !== AIR_CELL ? 1.0 : 0.0;
                    const valid3 = this.cellType[nr3] !== AIR_CELL || this.cellType[nr3 - offset] !== AIR_CELL ? 1.0 : 0.0;

                    const v = this.particleVel[2 * i + component];
                    const dTotal = valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;

                    if (dTotal > 0.0) {
                        const picV = (valid0 * d0 * f[nr0] + valid1 * d1 * f[nr1] + valid2 * d2 * f[nr2] + valid3 * d3 * f[nr3]) / dTotal;
                        const corr = (valid0 * d0 * (f[nr0] - prevF[nr0]) + valid1 * d1 * (f[nr1] - prevF[nr1]) +
                            valid2 * d2 * (f[nr2] - prevF[nr2]) + valid3 * d3 * (f[nr3] - prevF[nr3])) / dTotal;
                        const flipV = v + corr;

                        this.particleVel[2 * i + component] = (1.0 - flipRatio) * picV + flipRatio * flipV;
                    }
                }
            }

            if (toGrid) {
                for (let i = 0; i < this.fNumCells; i++) {
                    if (d[i] > 0.0)
                        f[i] /= d[i];
                }
            }
        }
    }

    /**
     * Solve pressure to enforce incompressibility
     * @param {number} numIters - Number of solver iterations
     * @param {number} dt - Time step
     * @param {number} overRelaxation - SOR parameter
     * @param {boolean} compensateDrift - Whether to correct for density drift
     */
    solveIncompressibility(numIters, dt, overRelaxation, compensateDrift = true) {
        this.p.fill(0.0);
        this.prevU.set(this.u);
        this.prevV.set(this.v);

        const n = this.fNumY;
        const cp = this.density * this.h / dt;

        for (let iter = 0; iter < numIters; iter++) {
            for (let i = 1; i < this.fNumX - 1; i++) {
                for (let j = 1; j < this.fNumY - 1; j++) {
                    if (this.cellType[i * n + j] !== FLUID_CELL)
                        continue;

                    const center = i * n + j;
                    const left = (i - 1) * n + j;
                    const right = (i + 1) * n + j;
                    const bottom = i * n + j - 1;
                    const top = i * n + j + 1;

                    const sx0 = this.s[left];
                    const sx1 = this.s[right];
                    const sy0 = this.s[bottom];
                    const sy1 = this.s[top];
                    const s = sx0 + sx1 + sy0 + sy1;
                    if (s === 0.0)
                        continue;

                    let div = this.u[right] - this.u[center] + this.v[top] - this.v[center];

                    if (this.particleRestDensity > 0.0 && compensateDrift) {
                        const k = 1.0;
                        const compression = this.particleDensity[center] - this.particleRestDensity;
                        if (compression > 0.0)
                            div = div - k * compression;
                    }

                    let p = -div / s;
                    p *= overRelaxation;
                    this.p[center] += cp * p;

                    this.u[center] -= sx0 * p;
                    this.u[right] += sx1 * p;
                    this.v[center] -= sy0 * p;
                    this.v[top] += sy1 * p;
                }
            }
        }
    }

    /**
     * Run one full simulation step
     * @param {Object} params - Simulation parameters
     */
    simulate(params) {
        const {
            dt,
            gravityX,
            gravityY,
            flipRatio,
            numPressureIters,
            numParticleIters,
            overRelaxation,
            compensateDrift,
            separateParticles,
            obstacleX,
            obstacleY,
            obstacleRadius,
            gravityMode,
            viscosity,
            isValidPosition
        } = params;

        const numSubSteps = 1;
        const sdt = dt / numSubSteps;

        for (let step = 0; step < numSubSteps; step++) {
            this.integrateParticles(sdt, gravityX, gravityY, viscosity);
            if (separateParticles)
                this.pushParticlesApart(numParticleIters);
            this.handleParticleCollisions(obstacleX, obstacleY, obstacleRadius, gravityMode, isValidPosition);
            this.transferVelocities(true);
            this.updateParticleDensity();
            this.solveIncompressibility(numPressureIters, sdt, overRelaxation, compensateDrift);
            this.transferVelocities(false, flipRatio);
        }
    }
}

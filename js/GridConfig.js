/**
 * Grid Configuration Module
 * Handles grid setup, sizing calculations, and particle distribution
 * 
 * @module GridConfig
 */

/**
 * Grid configuration class
 * Centralizes all grid and simulation sizing logic
 */
export class GridConfig {
    /**
     * Create grid configuration
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Grid resolution (number of cells)
        this.resolution = options.resolution || 50;

        // Tank dimensions (simulation units)
        this.tankWidth = options.tankWidth || 1.0;
        this.tankHeight = options.tankHeight || 1.0;

        // Fluid properties
        this.density = options.density || 1000;

        // Particle settings
        this.particleRadiusFactor = options.particleRadiusFactor || 0.3;

        // Initial water distribution (0.0 - 1.0)
        this.waterHeight = options.waterHeight || 0.7;
        this.waterWidth = options.waterWidth || 0.5;

        // Custom LED dimensions (optional)
        this.ledWidth = options.ledWidth || null;
        this.ledHeight = options.ledHeight || null;

        // Calculate derived values
        this.calculate();
    }

    /**
     * Calculate all derived grid values
     */
    calculate() {
        // Cell size (spacing between grid points)
        this.cellSize = this.tankHeight / this.resolution;
        this.h = this.cellSize;

        // Grid dimensions in cells
        if (this.ledWidth && this.ledHeight) {
            this.numCellsX = this.ledWidth + 2;
            this.numCellsY = this.ledHeight + 2;
            this.h = this.tankWidth / this.numCellsX; // Re-calculate h based on width
        } else {
            this.numCellsX = Math.floor(this.tankWidth / this.h) + 1;
            this.numCellsY = Math.floor(this.tankHeight / this.h) + 1;
        }
        this.totalCells = this.numCellsX * this.numCellsY;

        // Particle radius based on cell size
        this.particleRadius = this.particleRadiusFactor * this.h;

        // Particle spacing (hexagonal packing)
        this.particleSpacingX = 2.0 * this.particleRadius;
        this.particleSpacingY = Math.sqrt(3.0) / 2.0 * this.particleSpacingX;

        // Calculate how many particles fit in water region
        this.calculateParticleCount();
    }

    /**
     * Calculate maximum particles based on water region
     */
    calculateParticleCount() {
        const waterWidth = this.waterWidth * this.tankWidth;
        const waterHeight = this.waterHeight * this.tankHeight;

        // Available space (excluding borders)
        const margin = 2.0 * this.h + 2.0 * this.particleRadius;
        const availableWidth = waterWidth - margin;
        const availableHeight = waterHeight - margin;

        // Particles per axis
        this.particlesPerRow = Math.max(1, Math.floor(availableWidth / this.particleSpacingX));
        this.particlesPerCol = Math.max(1, Math.floor(availableHeight / this.particleSpacingY));

        // Total particles
        this.maxParticles = Math.max(4, this.particlesPerRow * this.particlesPerCol);

        // Minimum particles for low resolutions
        if (this.resolution < 20) {
            this.maxParticles = Math.max(10, this.maxParticles);
        }
    }

    /**
     * Update resolution and recalculate
     * @param {number} resolution - New grid resolution
     */
    setResolution(resolution) {
        this.resolution = Math.max(5, Math.min(200, resolution));
        this.calculate();
    }

    /**
     * Update tank dimensions
     * @param {number} width - Tank width
     * @param {number} height - Tank height
     */
    setTankSize(width, height) {
        this.tankWidth = width;
        this.tankHeight = height;
        this.calculate();
    }

    /**
     * Update water distribution
     * @param {number} width - Water width factor (0-1)
     * @param {number} height - Water height factor (0-1)
     */
    setWaterDistribution(width, height) {
        this.waterWidth = Math.max(0.1, Math.min(1.0, width));
        this.waterHeight = Math.max(0.1, Math.min(1.0, height));
        this.calculateParticleCount();
    }

    /**
     * Get particle initial positions using hexagonal packing
     * @param {Function} isValidPosition - Validation function for container shape
     * @returns {Float32Array} Array of [x, y, x, y, ...] positions
     */
    getParticlePositions(isValidPosition) {
        const positions = new Float32Array(2 * this.maxParticles);
        let count = 0;

        const h = this.h;
        const r = this.particleRadius;
        const dx = this.particleSpacingX;
        const dy = this.particleSpacingY;

        // Special case for very low resolution
        if (this.resolution <= 10) {
            return this.getLowResPositions(isValidPosition);
        }

        // Hexagonal grid packing
        for (let i = 0; i < this.particlesPerRow && count < this.maxParticles; i++) {
            for (let j = 0; j < this.particlesPerCol && count < this.maxParticles; j++) {
                // Offset every other row for hexagonal packing
                const offset = (j % 2 === 0) ? 0.0 : r;
                const x = h + r + dx * i + offset;
                const y = h + r + dy * j;

                // Skip if position is invalid (outside container)
                if (isValidPosition && !isValidPosition(x, y)) {
                    continue;
                }

                positions[2 * count] = x;
                positions[2 * count + 1] = y;
                count++;
            }
        }

        return { positions, count };
    }

    /**
     * Get positions for very low resolution grids
     * @param {Function} isValidPosition - Validation function
     * @returns {Object} Positions array and count
     */
    getLowResPositions(isValidPosition) {
        const positions = new Float32Array(2 * this.maxParticles);
        let count = 0;

        const centerX = this.tankWidth * 0.5;
        const centerY = this.tankHeight * 0.3;
        const spacing = Math.max(this.particleSpacingX, this.particleSpacingY);

        // Fixed pattern for low resolution
        const pattern = [
            [centerX, centerY],
            [centerX - spacing, centerY],
            [centerX + spacing, centerY],
            [centerX, centerY + spacing],
            [centerX - spacing * 0.5, centerY + spacing],
            [centerX + spacing * 0.5, centerY + spacing]
        ];

        for (const [x, y] of pattern) {
            if (count >= this.maxParticles) break;

            if (!isValidPosition || isValidPosition(x, y)) {
                positions[2 * count] = x;
                positions[2 * count + 1] = y;
                count++;
            }
        }

        return { positions, count };
    }

    getSummary() {
        const gridInfo = this.ledWidth && this.ledHeight
            ? `${this.ledWidth} × ${this.ledHeight} LEDs (+ border)`
            : `${this.numCellsX} × ${this.numCellsY} cells`;

        return {
            resolution: this.resolution,
            cellSize: this.h.toFixed(4),
            gridCells: gridInfo,
            totalCells: this.totalCells,
            particleRadius: this.particleRadius.toFixed(4),
            maxParticles: this.maxParticles,
            waterRegion: `${(this.waterWidth * 100).toFixed(0)}% × ${(this.waterHeight * 100).toFixed(0)}%`
        };
    }

    /**
     * Clone configuration
     * @returns {GridConfig} New instance with same values
     */
    clone() {
        return new GridConfig({
            resolution: this.resolution,
            tankWidth: this.tankWidth,
            tankHeight: this.tankHeight,
            density: this.density,
            particleRadiusFactor: this.particleRadiusFactor,
            waterHeight: this.waterHeight,
            waterWidth: this.waterWidth,
            ledWidth: this.ledWidth,
            ledHeight: this.ledHeight
        });
    }
}

/**
 * Create grid configuration from advanced settings
 * @param {Object} advancedSettings - Advanced settings object
 * @param {number} simWidth - Simulation width
 * @param {number} simHeight - Simulation height
 * @param {number} resolution - Grid resolution
 * @returns {GridConfig} Configured grid
 */
export function createGridFromSettings(advancedSettings, simWidth, simHeight, resolution) {
    return new GridConfig({
        resolution,
        tankWidth: simWidth,
        tankHeight: simHeight,
        density: advancedSettings.density,
        particleRadiusFactor: advancedSettings.particleRadiusFactor,
        waterHeight: advancedSettings.waterHeight,
        waterWidth: advancedSettings.waterWidth
    });
}

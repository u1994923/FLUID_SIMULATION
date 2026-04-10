/**
 * Fluid Pendant - Main Application
 * Entry point for the fluid simulation
 * 
 * @module App
 */

import { FlipFluid, FLUID_CELL, SOLID_CELL, AIR_CELL } from './FlipFluid.js';
import { CONTAINER_SHAPES, setupContainer, isValidParticlePosition } from './ContainerShapes.js';
import { FluidRenderer } from './Renderer.js';
import { SettingsManager, createDefaultAdvancedSettings, createDefaultScene } from './Settings.js';
import { InputHandler, AccelerometerHandler } from './InputHandler.js';
import { RamMonitor } from './RamMonitor.js';
import { GridConfig, createGridFromSettings } from './GridConfig.js';

/**
 * Main Fluid Pendant Application class
 */
export class FluidPendantApp {
    constructor() {
        // Canvas and WebGL
        this.canvas = document.getElementById('myCanvas');
        this.gl = this.canvas.getContext('webgl');

        // Calculate canvas size based on available space
        this.calculateCanvasSize();
        this.canvas.focus();

        // Simulation dimensions
        this.simHeight = 3.0;
        this.cScale = this.canvas.height / this.simHeight;
        this.simWidth = this.canvas.width / this.cScale;

        // Settings
        this.advancedSettings = createDefaultAdvancedSettings();
        this.scene = createDefaultScene();

        // Managers
        this.settingsManager = new SettingsManager(this.advancedSettings, this.scene);
        this.renderer = new FluidRenderer(this.gl, this.canvas, this.simWidth, this.simHeight);
        this.inputHandler = new InputHandler(
            this.canvas, this.scene, this.cScale, this.simWidth, this.simHeight
        );
        this.accelerometer = new AccelerometerHandler(this.scene);

        // RAM Monitor
        this.ramMonitor = null;

        // FPS counter
        this.fpsFrameCount = 0;
        this.fpsLastTime = performance.now();
        this.currentFPS = 0;

        // Bind callbacks
        this.inputHandler.onPause = () => this.togglePause();
        this.inputHandler.onReset = () => this.resetSimulation();
    }

    /**
     * Calculate and set canvas size based on container and window
     */
    calculateCanvasSize() {
        const wrapper = document.querySelector('.main-wrapper');
        const controls = document.querySelector('.controls');

        // Get available dimensions
        const padding = 32; // var(--spacing-md) * 2
        const maxWidth = Math.min(1400, window.innerWidth - padding);
        const controlsHeight = controls ? controls.offsetHeight : 100;
        const availableHeight = window.innerHeight - controlsHeight - 120; // Increased margin for better vertical centering

        // Calculate aspect ratio based on shape
        let targetAspect = 4 / 3; // Default ratio

        const shape = document.getElementById('containerShape')?.value || (this.scene ? this.scene.containerShape : 'rectangular');

        if (shape === 'rectangular') {
            const widthInput = document.getElementById('ledWidth');
            const heightInput = document.getElementById('ledHeight');
            const lw = widthInput ? parseInt(widthInput.value) : (this.scene ? this.scene.ledWidth : 100);
            const lh = heightInput ? parseInt(heightInput.value) : (this.scene ? this.scene.ledHeight : 60);
            if (lw && lh) {
                targetAspect = lw / lh;
            }
        } else if (shape === 'square') {
            targetAspect = 1.0;
        }

        let canvasWidth = maxWidth;
        let canvasHeight = canvasWidth / targetAspect;

        // If too tall, constrain by height
        if (canvasHeight > availableHeight) {
            canvasHeight = availableHeight;
            canvasWidth = canvasHeight * targetAspect;
        }

        // Minimum dimensions
        canvasWidth = Math.max(280, canvasWidth);
        canvasHeight = Math.max(200, canvasHeight);

        this.canvas.width = Math.floor(canvasWidth);
        this.canvas.height = Math.floor(canvasHeight);

        // Update simulation dimensions to match canvas
        this.simHeight = 3.0; // Fixed base height
        this.cScale = this.canvas.height / this.simHeight;
        this.simWidth = this.canvas.width / this.cScale;

        // Update renderer if it exists
        if (this.renderer) {
            this.renderer.resize(this.simWidth, this.simHeight);
        }
    }

    /**
     * Initialize the application
     */
    init() {
        // Load saved settings
        const settingsLoaded = this.settingsManager.load();

        // Update grid size slider if settings were loaded
        if (settingsLoaded && this.scene.gridResolution) {
            const gridSlider = document.getElementById('gridSize');
            const gridValue = document.getElementById('gridSizeValue');
            if (gridSlider) gridSlider.value = this.scene.gridResolution;
            if (gridValue) gridValue.textContent = this.scene.gridResolution;
        }

        // Setup scene
        this.setupScene(this.scene.gridResolution || 50);

        // Sync UI controls
        this.syncControlsWithScene();

        // Initialize accelerometer if available
        if (typeof DeviceMotionEvent !== 'undefined') {
            const accelCheckbox = document.getElementById('accelerometerMode');
            if (accelCheckbox) {
                accelCheckbox.style.display = 'inline';
                accelCheckbox.parentElement.style.display = 'inline-block';
            }
        }

        // Initialize RAM monitor
        const controlsContainer = document.querySelector('.controls');
        if (controlsContainer) {
            this.ramMonitor = new RamMonitor(controlsContainer);
            // Initial RAM update
            setTimeout(() => this.updateRamDisplay(), 100);
        }

        // Start main loop
        this.update();
    }

    /**
     * Update RAM display
     */
    updateRamDisplay() {
        if (this.ramMonitor && this.scene.fluid) {
            this.ramMonitor.update(this.scene.fluid);
        }
    }

    /**
     * Setup the simulation scene
     * @param {number} gridRes - Grid resolution
     */
    setupScene(gridRes = 50) {
        // Check if using LED dimensions for rectangular
        let ledWidth = null;
        let ledHeight = null;

        if (this.scene.containerShape === 'rectangular') {
            const widthInput = document.getElementById('ledWidth');
            const heightInput = document.getElementById('ledHeight');
            if (widthInput && heightInput) {
                ledWidth = parseInt(widthInput.value) || 100;
                ledHeight = parseInt(heightInput.value) || 60;
                // Use LED dimensions for grid resolution
                gridRes = Math.max(ledWidth, ledHeight);
            }
        }

        // Store grid resolution
        this.scene.gridResolution = gridRes;
        this.scene.ledWidth = ledWidth;
        this.scene.ledHeight = ledHeight;

        // Sync scene with advanced settings
        this.syncSceneSettings();

        // Create grid configuration
        if (ledWidth && ledHeight) {
            // Custom LED dimensions
            this.gridConfig = this.createLedGridConfig(ledWidth, ledHeight);
        } else {
            this.gridConfig = createGridFromSettings(
                this.advancedSettings,
                this.simWidth,
                this.simHeight,
                gridRes
            );
        }

        // Create fluid simulation
        this.scene.fluid = this.createFluid(this.gridConfig);

        // Initialize particles
        this.initializeParticles(this.gridConfig, this.scene.fluid);

        // Setup container shape
        this.scene.originalContainer = setupContainer(
            this.scene.fluid,
            this.scene.containerShape,
            gridRes,
            this.advancedSettings.squareSizeFactor
        );

        // Set initial obstacle position
        this.scene.obstacleX = 3.0;
        this.scene.obstacleY = 2.0;

        // Log grid info
        console.log('Grid created:', this.gridConfig.getSummary());
    }

    /**
     * Sync scene settings with advanced settings
     */
    syncSceneSettings() {
        this.scene.obstacleRadius = 0.15;
        this.scene.overRelaxation = this.advancedSettings.overRelaxation;
        this.scene.numParticleIters = 2;
        this.scene.compensateDrift = this.advancedSettings.compensateDrift;
        this.scene.separateParticles = this.advancedSettings.separateParticles;
        this.scene.numPressureIters = this.advancedSettings.pressureIterations;
        this.scene.dt = this.advancedSettings.timeStep;
    }

    /**
     * Create grid configuration for LED matrix
     * @param {number} width - Number of LEDs in width
     * @param {number} height - Number of LEDs in height
     * @returns {GridConfig} Grid configuration
     */
    createLedGridConfig(width, height) {
        // Calculate aspect ratio and tank dimensions
        const aspectRatio = width / height;
        let tankWidth, tankHeight;

        if (aspectRatio >= 1) {
            // Wider than tall
            tankWidth = this.simHeight * aspectRatio;
            tankHeight = this.simHeight;
        } else {
            // Taller than wide
            tankWidth = this.simWidth;
            tankHeight = this.simWidth / aspectRatio;
        }

        // Create config with exact LED dimensions using GridConfig support
        console.log(`Creating LED Grid: ${width}×${height} LEDs`);

        return new GridConfig({
            resolution: Math.max(width, height),
            tankWidth: tankWidth,
            tankHeight: tankHeight,
            density: this.advancedSettings.density,
            particleRadiusFactor: this.advancedSettings.particleRadiusFactor,
            waterHeight: this.advancedSettings.waterHeight,
            waterWidth: this.advancedSettings.waterWidth,
            ledWidth: width,
            ledHeight: height
        });
    }

    /**
     * Create fluid simulation from grid config
     * @param {GridConfig} config - Grid configuration
     * @returns {FlipFluid} Fluid simulation instance
     */
    createFluid(config) {
        return new FlipFluid(
            config.density,
            config.tankWidth,
            config.tankHeight,
            config.h,
            config.particleRadius,
            config.maxParticles
        );
    }

    /**
     * Initialize particle positions
     * @param {GridConfig} config - Grid configuration
     * @param {FlipFluid} fluid - Fluid simulation
     */
    initializeParticles(config, fluid) {
        // Validation function for container shape
        const isValid = (x, y) => this.isValidPosition(x, y, fluid);

        // Get particle positions from grid config
        const { positions, count } = config.getParticlePositions(isValid);

        // Copy positions to fluid
        for (let i = 0; i < count; i++) {
            fluid.particlePos[2 * i] = positions[2 * i];
            fluid.particlePos[2 * i + 1] = positions[2 * i + 1];
        }

        fluid.numParticles = Math.max(1, count);
    }

    /**
     * Check if particle position is valid
     */
    isValidPosition(x, y, fluid) {
        return isValidParticlePosition(
            x, y, fluid,
            this.scene.containerShape,
            this.scene.gridResolution,
            this.advancedSettings.squareSizeFactor
        );
    }

    /**
     * Apply obstacle to grid
     */
    applyObstacle() {
        const f = this.scene.fluid;
        const n = f.fNumY;

        // Restore original container
        if (this.scene.originalContainer) {
            f.s.set(this.scene.originalContainer);
        }

        // Apply obstacle if visible and not in gravity mode
        if (this.scene.showObstacle && !this.scene.gravityMode) {
            const r = this.scene.obstacleRadius;
            const x = this.scene.obstacleX;
            const y = this.scene.obstacleY;
            const vx = this.scene.obstacleVelX;
            const vy = this.scene.obstacleVelY;

            for (let i = 1; i < f.fNumX - 2; i++) {
                for (let j = 1; j < f.fNumY - 2; j++) {
                    if (this.scene.originalContainer[i * n + j] > 0.0) {
                        const dx = (i + 0.5) * f.h - x;
                        const dy = (j + 0.5) * f.h - y;

                        if (dx * dx + dy * dy < r * r) {
                            f.s[i * n + j] = 0.0;
                            f.u[i * n + j] = vx;
                            f.u[(i + 1) * n + j] = vx;
                            f.v[i * n + j] = vy;
                            f.v[i * n + j + 1] = vy;
                        }
                    }
                }
            }
        }
    }

    /**
     * Run simulation step
     */
    simulate() {
        if (this.scene.paused) return;

        this.applyObstacle();

        this.scene.fluid.simulate({
            dt: this.scene.dt,
            gravityX: this.scene.gravityX,
            gravityY: this.scene.gravityY,
            flipRatio: this.scene.flipRatio,
            numPressureIters: this.scene.numPressureIters,
            numParticleIters: this.scene.numParticleIters,
            overRelaxation: this.scene.overRelaxation,
            compensateDrift: this.scene.compensateDrift,
            separateParticles: this.scene.separateParticles,
            obstacleX: this.scene.obstacleX,
            obstacleY: this.scene.obstacleY,
            obstacleRadius: this.scene.obstacleRadius,
            gravityMode: this.scene.gravityMode,
            viscosity: this.scene.viscosity,
            isValidPosition: (x, y, f) => this.isValidPosition(x, y, f)
        });
    }

    /**
     * Draw frame
     */
    draw() {
        this.renderer.draw({
            fluid: this.scene.fluid,
            showGrid: this.scene.showGrid,
            showParticles: this.scene.showParticles,
            displayMode: this.scene.displayMode,
            showObstacle: this.scene.showObstacle,
            gravityMode: this.scene.gravityMode,
            obstacleX: this.scene.obstacleX,
            obstacleY: this.scene.obstacleY,
            obstacleRadius: this.scene.obstacleRadius,
            gravityX: this.scene.gravityX,
            gravityY: this.scene.gravityY,
            gridVisualSize: this.advancedSettings.gridVisualSize,
            particleVisualSize: this.advancedSettings.particleVisualSize
        });
    }

    /**
     * Update FPS counter
     */
    updateFPS() {
        this.fpsFrameCount++;
        const now = performance.now();

        if (now - this.fpsLastTime >= 1000) {
            this.currentFPS = this.fpsFrameCount;
            this.fpsFrameCount = 0;
            this.fpsLastTime = now;

            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) {
                fpsDisplay.textContent = this.currentFPS + ' FPS';

                if (this.currentFPS >= 55) {
                    fpsDisplay.style.color = '#00ff88';
                } else if (this.currentFPS >= 30) {
                    fpsDisplay.style.color = '#ffaa00';
                } else {
                    fpsDisplay.style.color = '#ff4444';
                }
            }
        }
    }

    /**
     * Main update loop
     */
    update() {
        this.updateFPS();
        this.simulate();
        this.draw();
        requestAnimationFrame(() => this.update());
    }

    /**
     * Toggle pause state
     */
    togglePause() {
        this.scene.paused = !this.scene.paused;
        this.updatePauseButton();
    }

    /**
     * Update pause button appearance
     */
    updatePauseButton() {
        const buttons = document.querySelectorAll('button');
        let pauseButton = null;

        buttons.forEach(btn => {
            if (btn.textContent.includes('Pause') || btn.textContent.includes('Resume')) {
                pauseButton = btn;
            }
        });

        if (pauseButton) {
            if (this.scene.paused) {
                pauseButton.textContent = '▶️ Resume';
                pauseButton.style.backgroundColor = '#ff9800';
            } else {
                pauseButton.textContent = '⏸️ Pause';
                pauseButton.style.backgroundColor = '#4CAF50';
            }
        }
    }

    /**
     * Reset simulation
     */
    resetSimulation() {
        this.scene.paused = false;
        this.renderer.clearBuffers();
        this.scene.frameNr = 0;

        // Recalculate canvas size in case aspect ratio changed
        this.calculateCanvasSize();

        const gridSize = parseInt(document.getElementById('gridSize')?.value || 50);
        this.setupScene(gridSize);
        this.syncControlsWithScene();

        // Update RAM display after reset
        setTimeout(() => this.updateRamDisplay(), 100);
    }

    /**
     * Sync UI controls with scene state
     */
    syncControlsWithScene() {
        const elements = {
            gridSize: this.scene.gridResolution,
            displayMode: this.scene.displayMode,
            containerShape: this.scene.containerShape,
            separateParticles: this.scene.separateParticles,
            gravityMode: this.scene.gravityMode,
            accelerometerMode: this.scene.accelerometerMode,
            ledWidth: this.scene.ledWidth || 100,
            ledHeight: this.scene.ledHeight || 60
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = value;
                } else {
                    el.value = value;
                }
            }
        });

        const gridValue = document.getElementById('gridSizeValue');
        if (gridValue) gridValue.textContent = this.scene.gridResolution;

        // Handle LED controls visibility
        const isRect = this.scene.containerShape === 'rectangular';
        const gridControl = document.getElementById('gridSizeControl');
        const ledControl = document.getElementById('ledDimensionsControl');

        if (gridControl) gridControl.style.display = isRect ? 'none' : 'flex';
        if (ledControl) ledControl.style.display = isRect ? 'flex' : 'none';

        // Update total display (check index.html scope)
        const totalDisplay = document.getElementById('ledTotalDisplay');
        if (totalDisplay) {
            const total = (this.scene.ledWidth || 100) * (this.scene.ledHeight || 60);
            totalDisplay.textContent = `(${total} LEDs)`;
        }

        this.updatePauseButton();
    }

    /**
     * Change container shape
     * @param {string} shape - New shape
     */
    changeContainerShape(shape) {
        this.scene.containerShape = shape;
        this.resetSimulation();
        this.settingsManager.autoSave();
    }

    /**
     * Change display mode
     * @param {string} mode - New mode
     */
    changeDisplayMode(mode) {
        this.scene.displayMode = mode;

        switch (mode) {
            case 'particles':
                this.scene.showParticles = true;
                this.scene.showGrid = false;
                break;
            case 'grid':
                this.scene.showParticles = false;
                this.scene.showGrid = true;
                break;
            case 'both':
                this.scene.showParticles = true;
                this.scene.showGrid = true;
                break;
        }

        this.settingsManager.autoSave();
    }

    /**
     * Toggle gravity mode
     */
    toggleGravityMode(enabled) {
        this.scene.gravityMode = enabled;

        if (enabled) {
            if (this.scene.originalContainer && this.scene.fluid) {
                this.scene.fluid.s.set(this.scene.originalContainer);
                this.scene.fluid.u.fill(0.0);
                this.scene.fluid.v.fill(0.0);
            }
        } else {
            this.scene.gravityX = 0.0;
            this.scene.gravityY = -6;
        }
    }

    /**
     * Toggle accelerometer mode
     */
    async toggleAccelerometer(enabled) {
        this.scene.accelerometerMode = enabled;

        if (enabled) {
            this.scene.gravityMode = true;
            document.getElementById('gravityMode').checked = true;

            if (!this.accelerometer.supported) {
                const granted = await this.accelerometer.init();
                if (!granted) {
                    this.scene.accelerometerMode = false;
                    const accelCheckbox = document.getElementById('accelerometerMode');
                    if (accelCheckbox) accelCheckbox.checked = false;
                    this.scene.gravityX = 0.0;
                    this.scene.gravityY = -6;
                }
            }
        } else {
            if (this.accelerometer.active) {
                this.accelerometer.stop();
            }
            this.scene.gravityX = 0.0;
            this.scene.gravityY = -6;
        }
    }
}

// Create and export app instance
let app = null;

/**
 * Initialize the application
 */
export function initApp() {
    app = new FluidPendantApp();
    app.init();
    return app;
}

/**
 * Get the app instance
 */
export function getApp() {
    return app;
}

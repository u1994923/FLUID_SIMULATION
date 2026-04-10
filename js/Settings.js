/**
 * Settings Manager Module
 * Handles configuration persistence with LocalStorage
 * 
 * @module Settings
 */

/**
 * Default advanced settings
 */
export const DEFAULT_SETTINGS = {
    particleRadiusFactor: 0.3,
    timeStep: 1.0 / 60.0,
    pressureIterations: 50,
    density: 1000.0,
    flipRatio: 0.9,
    viscosity: 0.0,
    overRelaxation: 1.9,
    compensateDrift: true,
    separateParticles: true,
    squareSizeFactor: 0.8,
    waterHeight: 0.7,
    waterWidth: 0.5,
    gridVisualSize: 0.85,
    particleVisualSize: 2.0
};

/**
 * Default scene settings
 */
export const DEFAULT_SCENE = {
    gravity: -3,
    gravityX: 0.0,
    gravityY: -3,
    gravityMode: true,
    accelerometerMode: false,
    accelerometerSupported: false,
    dt: 1.0 / 60.0,
    flipRatio: 0.9,
    viscosity: 0.0,
    numPressureIters: 100,
    numParticleIters: 2,
    frameNr: 0,
    overRelaxation: 1.9,
    compensateDrift: true,
    separateParticles: true,
    obstacleX: 0.0,
    obstacleY: 0.0,
    obstacleRadius: 0.15,
    paused: false,
    showObstacle: true,
    obstacleVelX: 0.0,
    obstacleVelY: 0.0,
    showParticles: false,
    showGrid: true,
    displayMode: 'grid',
    containerShape: 'rectangular',
    gridResolution: 50,
    ledWidth: 100,
    ledHeight: 60
};

const STORAGE_KEY = 'fluidPendantSettings';

/**
 * Settings Manager class
 */
export class SettingsManager {
    /**
     * Create settings manager
     * @param {Object} advancedSettings - Reference to advanced settings object
     * @param {Object} scene - Reference to scene object
     */
    constructor(advancedSettings, scene) {
        this.advancedSettings = advancedSettings;
        this.scene = scene;
        this.autoSaveTimeout = null;
    }

    /**
     * Save current settings to LocalStorage
     */
    save() {
        const settings = {
            advancedSettings: { ...this.advancedSettings },
            containerShape: this.scene.containerShape,
            displayMode: this.scene.displayMode,
            gridResolution: this.scene.gridResolution,
            gravityMode: this.scene.gravityMode,
            separateParticles: this.scene.separateParticles
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            console.log('💾 Settings saved to LocalStorage');
            return true;
        } catch (e) {
            console.warn('Could not save settings:', e);
            return false;
        }
    }

    /**
     * Load settings from LocalStorage
     * @returns {boolean} True if settings were loaded
     */
    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const settings = JSON.parse(saved);

                // Restore advanced settings
                if (settings.advancedSettings) {
                    Object.assign(this.advancedSettings, settings.advancedSettings);
                }

                // Restore scene settings
                if (settings.containerShape) this.scene.containerShape = settings.containerShape;
                if (settings.displayMode) this.scene.displayMode = settings.displayMode;
                if (settings.gridResolution) this.scene.gridResolution = settings.gridResolution;
                if (settings.gravityMode !== undefined) this.scene.gravityMode = settings.gravityMode;
                if (settings.separateParticles !== undefined) this.scene.separateParticles = settings.separateParticles;

                console.log('📂 Settings loaded from LocalStorage');
                return true;
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }
        return false;
    }

    /**
     * Clear saved settings
     */
    clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('🗑️ Saved settings cleared');
        } catch (e) {
            console.warn('Could not clear settings:', e);
        }
    }

    /**
     * Reset to default values
     */
    reset() {
        Object.assign(this.advancedSettings, DEFAULT_SETTINGS);
        this.clear();
    }

    /**
     * Auto-save with debouncing
     * @param {number} delay - Delay in milliseconds
     */
    autoSave(delay = 1000) {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.autoSaveTimeout = setTimeout(() => this.save(), delay);
    }
}

/**
 * Create default advanced settings object
 * @returns {Object} Copy of default settings
 */
export function createDefaultAdvancedSettings() {
    return { ...DEFAULT_SETTINGS };
}

/**
 * Create default scene object
 * @returns {Object} Copy of default scene
 */
export function createDefaultScene() {
    return { ...DEFAULT_SCENE, fluid: null, originalContainer: null };
}

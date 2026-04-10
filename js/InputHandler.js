/**
 * Input Handler Module
 * Handles mouse, touch, keyboard, and accelerometer input
 * 
 * @module InputHandler
 */

/**
 * Input Handler class
 */
export class InputHandler {
    /**
     * Create input handler
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} scene - Scene configuration
     * @param {number} cScale - Canvas scale factor
     * @param {number} simWidth - Simulation width
     * @param {number} simHeight - Simulation height
     */
    constructor(canvas, scene, cScale, simWidth, simHeight) {
        this.canvas = canvas;
        this.scene = scene;
        this.cScale = cScale;
        this.simWidth = simWidth;
        this.simHeight = simHeight;
        this.mouseDown = false;

        this.setupEventListeners();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Mouse events (Must start on canvas)
        this.canvas.addEventListener('mousedown', (e) => this.onStartDrag(e.clientX, e.clientY));

        // Window listeners for move/up to allow dragging everywhere
        window.addEventListener('mousemove', (e) => {
            if (this.mouseDown) this.onDrag(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', () => {
            if (this.mouseDown) this.onEndDrag();
        });

        // Touch events (Must start on canvas)
        this.canvas.addEventListener('touchstart', (e) => {
            this.onStartDrag(e.touches[0].clientX, e.touches[0].clientY);
        });

        window.addEventListener('touchmove', (e) => {
            if (this.mouseDown && e.touches.length > 0) {
                // Prevent scrolling while interacting
                e.preventDefault();
                this.onDrag(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            if (this.mouseDown) this.onEndDrag();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    /**
     * Convert screen coordinates to simulation coordinates
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     * @returns {Object} Simulation coordinates {x, y}
     */
    screenToSim(screenX, screenY) {
        const bounds = this.canvas.getBoundingClientRect();
        const mx = screenX - bounds.left - this.canvas.clientLeft;
        const my = screenY - bounds.top - this.canvas.clientTop;

        return {
            x: mx / this.cScale,
            y: (this.canvas.height - my) / this.cScale
        };
    }

    /**
     * Handle drag start
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     */
    onStartDrag(screenX, screenY) {
        this.mouseDown = true;
        const { x, y } = this.screenToSim(screenX, screenY);

        if (this.scene.gravityMode && !this.scene.accelerometerMode) {
            this.setGravityDirection(x, y);
        } else if (!this.scene.gravityMode) {
            this.setObstacle(x, y, true);
            this.scene.paused = false;
        }
    }

    /**
     * Handle dragging
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     */
    onDrag(screenX, screenY) {
        if (!this.mouseDown) return;

        const { x, y } = this.screenToSim(screenX, screenY);

        if (this.scene.gravityMode && !this.scene.accelerometerMode) {
            this.setGravityDirection(x, y);
        } else if (!this.scene.gravityMode) {
            this.setObstacle(x, y, false);
        }
    }

    /**
     * Handle drag end
     */
    onEndDrag() {
        this.mouseDown = false;
        this.scene.obstacleVelX = 0.0;
        this.scene.obstacleVelY = 0.0;

        // Reset gravity to default when releasing
        if (this.scene.gravityMode && !this.scene.accelerometerMode) {
            this.scene.gravityX = 0.0;
            this.scene.gravityY = -6;
        }
    }

    /**
     * Handle keyboard input
     * @param {KeyboardEvent} event - Keyboard event
     */
    onKeyDown(event) {
        if (this.onPause && event.key === ' ') {
            this.onPause();
        }
        if (this.onReset && (event.key === 'r' || event.key === 'R')) {
            this.onReset();
        }
    }

    /**
     * Set gravity direction based on click position
     * @param {number} clickX - Click X in simulation coordinates
     * @param {number} clickY - Click Y in simulation coordinates
     */
    setGravityDirection(clickX, clickY) {
        const centerX = this.simWidth * 0.5;
        const centerY = this.simHeight * 0.5;

        const dirX = clickX - centerX;
        const dirY = clickY - centerY;

        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        const maxDistance = Math.sqrt(this.simWidth * this.simWidth + this.simHeight * this.simHeight) * 0.5;

        if (distance < 0.1) {
            this.scene.gravityX = 0.0;
            this.scene.gravityY = -1.0;
        } else {
            this.scene.gravityX = dirX / maxDistance * 10.0;
            this.scene.gravityY = dirY / maxDistance * 10.0;
        }
    }

    /**
     * Set obstacle position
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {boolean} reset - Whether to reset velocity
     */
    setObstacle(x, y, reset) {
        if (!reset) {
            this.scene.obstacleVelX = (x - this.scene.obstacleX) / this.scene.dt;
            this.scene.obstacleVelY = (y - this.scene.obstacleY) / this.scene.dt;
        } else {
            this.scene.obstacleVelX = 0.0;
            this.scene.obstacleVelY = 0.0;
        }

        this.scene.obstacleX = x;
        this.scene.obstacleY = y;
        this.scene.showObstacle = true;
    }

    // Callbacks (to be set by app)
    onPause = null;
    onReset = null;
}

/**
 * Accelerometer Handler class
 */
export class AccelerometerHandler {
    /**
     * Create accelerometer handler
     * @param {Object} scene - Scene configuration
     */
    constructor(scene) {
        this.scene = scene;
        this.supported = false;
        this.active = false;
        this.motionHandler = this.handleMotion.bind(this);
    }

    /**
     * Initialize accelerometer support
     * @returns {Promise<boolean>} Whether accelerometer is supported
     */
    async init() {
        if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') {
            console.log('Accelerometer not supported');
            return false;
        }

        if (!window.isSecureContext) {
            console.warn('Accelerometer requires a secure context (HTTPS or localhost)');
            return false;
        }

        // iOS 13+ requires permission
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response === 'granted') {
                    this.supported = true;
                    this.start();
                    return true;
                } else {
                    console.log('Accelerometer permission denied');
                    return false;
                }
            } catch (e) {
                console.error('Accelerometer permission error:', e);
                return false;
            }
        } else {
            this.supported = true;
            this.start();
            return true;
        }
    }

    /**
     * Start listening to accelerometer
     */
    start() {
        if (this.active) return;
        window.addEventListener('devicemotion', this.motionHandler, true);
        this.active = true;
    }

    /**
     * Stop listening to accelerometer
     */
    stop() {
        if (!this.active) return;
        window.removeEventListener('devicemotion', this.motionHandler, true);
        this.active = false;
    }

    /**
     * Handle device motion event
     * @param {DeviceMotionEvent} event - Motion event
     */
    handleMotion(event) {
        if (!this.scene.accelerometerMode) return;

        const acceleration = event.accelerationIncludingGravity;

        if (acceleration && acceleration.x !== null && acceleration.y !== null) {
            const scale = 1.0;
            this.scene.gravityX = -acceleration.x * scale;
            this.scene.gravityY = -acceleration.y * scale;

            // Limit magnitude
            const maxGravity = 20.0;
            const magnitude = Math.sqrt(
                this.scene.gravityX * this.scene.gravityX +
                this.scene.gravityY * this.scene.gravityY
            );

            if (magnitude > maxGravity) {
                this.scene.gravityX = (this.scene.gravityX / magnitude) * maxGravity;
                this.scene.gravityY = (this.scene.gravityY / magnitude) * maxGravity;
            }
        }
    }
}

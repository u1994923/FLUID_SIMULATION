/**
 * WebGL Renderer Module
 * Handles all WebGL rendering for the fluid simulation
 * 
 * @module Renderer
 */

import { FLUID_CELL, SOLID_CELL, AIR_CELL } from './FlipFluid.js';

// Shader source code
const pointVertexShader = `
    attribute vec2 attrPosition;
    uniform vec2 domainSize;
    uniform float pointSize;

    void main() {
        vec4 screenTransform = vec4(2.0 / domainSize.x, 2.0 / domainSize.y, -1.0, -1.0);
        gl_Position = vec4(attrPosition * screenTransform.xy + screenTransform.zw, 0.0, 1.0);
        gl_PointSize = pointSize;
    }
`;

const pointFragmentShader = `
    precision mediump float;
    uniform vec3 color;
    uniform float drawSquare;

    void main() {
        if (drawSquare > 0.5) {
            gl_FragColor = vec4(color, 1.0);
        } else {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            gl_FragColor = vec4(color, 1.0);
        }
    }
`;

const meshVertexShader = `
    attribute vec2 attrPosition;
    uniform vec2 domainSize;
    uniform vec3 color;
    uniform vec2 translation;
    uniform float scale;

    varying vec3 fragColor;

    void main() {
        vec2 v = translation + attrPosition * scale;
        vec4 screenTransform = vec4(2.0 / domainSize.x, 2.0 / domainSize.y, -1.0, -1.0);
        gl_Position = vec4(v * screenTransform.xy + screenTransform.zw, 0.0, 1.0);
        fragColor = color;
    }
`;

const meshFragmentShader = `
    precision mediump float;
    varying vec3 fragColor;

    void main() {
        gl_FragColor = vec4(fragColor, 1.0);
    }
`;

/**
 * WebGL Fluid Renderer class
 */
export class FluidRenderer {
    /**
     * Create a new fluid renderer
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {number} simWidth - Simulation width
     * @param {number} simHeight - Simulation height
     */
    constructor(gl, canvas, simWidth, simHeight) {
        this.gl = gl;
        this.canvas = canvas;
        this.simWidth = simWidth;
        this.simHeight = simHeight;

        // Shaders
        this.pointShader = null;
        this.meshShader = null;

        // Buffers
        this.particleBuffer = null;
        this.gridVertBuffer = null;
        this.gridColorBuffer = null;
        this.diskVertBuffer = null;
        this.diskIdBuffer = null;
        this.cellTypeBuffers = [null, null, null];
    }

    /**
     * Update renderer dimensions
     * @param {number} simWidth - New simulation width
     * @param {number} simHeight - New simulation height
     */
    resize(simWidth, simHeight) {
        this.simWidth = simWidth;
        this.simHeight = simHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Create a shader program
     * @param {string} vsSource - Vertex shader source
     * @param {string} fsSource - Fragment shader source
     * @returns {WebGLProgram} Compiled shader program
     */
    createShader(vsSource, fsSource) {
        const gl = this.gl;

        const vsShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsShader, vsSource);
        gl.compileShader(vsShader);
        if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS))
            console.error("Vertex shader compile error:", gl.getShaderInfoLog(vsShader));

        const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsShader, fsSource);
        gl.compileShader(fsShader);
        if (!gl.getShaderParameter(fsShader, gl.COMPILE_STATUS))
            console.error("Fragment shader compile error:", gl.getShaderInfoLog(fsShader));

        const shader = gl.createProgram();
        gl.attachShader(shader, vsShader);
        gl.attachShader(shader, fsShader);
        gl.linkProgram(shader);

        return shader;
    }

    /**
     * Initialize shaders
     */
    initShaders() {
        if (!this.pointShader) {
            this.pointShader = this.createShader(pointVertexShader, pointFragmentShader);
        }
        if (!this.meshShader) {
            this.meshShader = this.createShader(meshVertexShader, meshFragmentShader);
        }
    }

    /**
     * Clear all buffers
     */
    clearBuffers() {
        const gl = this.gl;

        if (this.particleBuffer) { gl.deleteBuffer(this.particleBuffer); this.particleBuffer = null; }
        if (this.gridVertBuffer) { gl.deleteBuffer(this.gridVertBuffer); this.gridVertBuffer = null; }
        if (this.gridColorBuffer) { gl.deleteBuffer(this.gridColorBuffer); this.gridColorBuffer = null; }
        if (this.diskVertBuffer) { gl.deleteBuffer(this.diskVertBuffer); this.diskVertBuffer = null; }
        if (this.diskIdBuffer) { gl.deleteBuffer(this.diskIdBuffer); this.diskIdBuffer = null; }

        for (let i = 0; i < this.cellTypeBuffers.length; i++) {
            if (this.cellTypeBuffers[i]) {
                gl.deleteBuffer(this.cellTypeBuffers[i]);
                this.cellTypeBuffers[i] = null;
            }
        }

        this.pointShader = null;
        this.meshShader = null;
    }

    /**
     * Draw the fluid simulation
     * @param {Object} params - Drawing parameters
     */
    draw(params) {
        const {
            fluid,
            showGrid,
            showParticles,
            displayMode,
            showObstacle,
            gravityMode,
            obstacleX,
            obstacleY,
            obstacleRadius,
            gravityX,
            gravityY,
            gridVisualSize,
            particleVisualSize
        } = params;

        const gl = this.gl;

        gl.clearColor(0.9, 0.9, 0.9, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        this.initShaders();

        // Draw grid cells
        if (showGrid || displayMode === 'grid' || displayMode === 'both') {
            this.drawGrid(fluid, displayMode, gridVisualSize);
        }

        // Draw particles
        if (showParticles && (displayMode === 'particles' || displayMode === 'both')) {
            this.drawParticles(fluid, particleVisualSize);
        }

        // Draw obstacle
        if (showObstacle && !gravityMode) {
            this.drawObstacle(obstacleX, obstacleY, obstacleRadius);
        }

        // Draw gravity indicator
        if (gravityMode) {
            this.drawGravityIndicator(gravityX, gravityY);
        }
    }

    /**
     * Draw grid cells
     */
    drawGrid(fluid, displayMode, gridVisualSize) {
        const gl = this.gl;

        if (!this.gridVertBuffer) {
            this.gridVertBuffer = gl.createBuffer();
            const cellCenters = new Float32Array(2 * fluid.fNumCells);
            let p = 0;

            for (let i = 0; i < fluid.fNumX; i++) {
                for (let j = 0; j < fluid.fNumY; j++) {
                    cellCenters[2 * p] = (i + 0.5) * fluid.h;
                    cellCenters[2 * p + 1] = (j + 0.5) * fluid.h;
                    p++;
                }
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVertBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, cellCenters, gl.STATIC_DRAW);
        }

        const pointSize = gridVisualSize * fluid.h / this.simWidth * this.canvas.width;

        gl.useProgram(this.pointShader);
        gl.uniform2f(gl.getUniformLocation(this.pointShader, 'domainSize'), this.simWidth, this.simHeight);
        gl.uniform1f(gl.getUniformLocation(this.pointShader, 'pointSize'), pointSize);
        gl.uniform1f(gl.getUniformLocation(this.pointShader, 'drawSquare'), 1.0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVertBuffer);
        const posLoc = gl.getAttribLocation(this.pointShader, 'attrPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw each cell type
        for (let cellType = 0; cellType < 3; cellType++) {
            let color = [0.92, 0.94, 0.96]; // default air color

            if (cellType === FLUID_CELL) {
                color = [0.0, 0.35, 0.85]; // blue for fluid
            } else if (cellType === SOLID_CELL) {
                color = [0.15, 0.15, 0.18];
                if (displayMode === 'grid') continue;
            }

            gl.uniform3f(gl.getUniformLocation(this.pointShader, 'color'), color[0], color[1], color[2]);

            const cellsOfType = [];
            for (let i = 0; i < fluid.fNumCells; i++) {
                if (displayMode === 'grid' && fluid.cellType[i] === SOLID_CELL) continue;
                if (fluid.cellType[i] === cellType) {
                    cellsOfType.push(i);
                }
            }

            if (cellsOfType.length > 0) {
                const typeVertices = new Float32Array(2 * cellsOfType.length);
                for (let k = 0; k < cellsOfType.length; k++) {
                    const cellIdx = cellsOfType[k];
                    const i = Math.floor(cellIdx / fluid.fNumY);
                    const j = cellIdx % fluid.fNumY;
                    typeVertices[2 * k] = (i + 0.5) * fluid.h;
                    typeVertices[2 * k + 1] = (j + 0.5) * fluid.h;
                }

                if (!this.cellTypeBuffers[cellType]) {
                    this.cellTypeBuffers[cellType] = gl.createBuffer();
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, this.cellTypeBuffers[cellType]);
                gl.bufferData(gl.ARRAY_BUFFER, typeVertices, gl.DYNAMIC_DRAW);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.POINTS, 0, cellsOfType.length);
            }
        }

        gl.disableVertexAttribArray(posLoc);
    }

    /**
     * Draw particles
     */
    drawParticles(fluid, particleVisualSize) {
        const gl = this.gl;

        if (!this.particleBuffer) {
            this.particleBuffer = gl.createBuffer();
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, fluid.particlePos, gl.DYNAMIC_DRAW);

        const pointSize = particleVisualSize * fluid.particleRadius / this.simWidth * this.canvas.width;

        gl.useProgram(this.pointShader);
        gl.uniform2f(gl.getUniformLocation(this.pointShader, 'domainSize'), this.simWidth, this.simHeight);
        gl.uniform1f(gl.getUniformLocation(this.pointShader, 'pointSize'), pointSize);
        gl.uniform1f(gl.getUniformLocation(this.pointShader, 'drawSquare'), 0.0);
        gl.uniform3f(gl.getUniformLocation(this.pointShader, 'color'), 0.0, 0.5, 1.0);

        const posLoc = gl.getAttribLocation(this.pointShader, 'attrPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.POINTS, 0, fluid.numParticles);
        gl.disableVertexAttribArray(posLoc);
    }

    /**
     * Draw obstacle disc
     */
    drawObstacle(x, y, radius) {
        const gl = this.gl;
        const numSegs = 50;

        if (!this.diskVertBuffer) {
            const diskVerts = new Float32Array(2 * (numSegs + 1));
            diskVerts[0] = 0.0;
            diskVerts[1] = 0.0;
            for (let i = 0; i < numSegs; i++) {
                const alpha = 2.0 * Math.PI * i / numSegs;
                diskVerts[2 * (i + 1)] = Math.cos(alpha);
                diskVerts[2 * (i + 1) + 1] = Math.sin(alpha);
            }

            this.diskVertBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.diskVertBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, diskVerts, gl.STATIC_DRAW);

            const diskIds = new Uint16Array(3 * numSegs);
            for (let i = 0; i < numSegs; i++) {
                diskIds[3 * i] = 0;
                diskIds[3 * i + 1] = i + 1;
                diskIds[3 * i + 2] = (i + 1) % numSegs + 1;
            }

            this.diskIdBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.diskIdBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, diskIds, gl.STATIC_DRAW);
        }

        gl.useProgram(this.meshShader);
        gl.uniform2f(gl.getUniformLocation(this.meshShader, 'domainSize'), this.simWidth, this.simHeight);
        gl.uniform3f(gl.getUniformLocation(this.meshShader, 'color'), 1.0, 0.0, 0.0);
        gl.uniform2f(gl.getUniformLocation(this.meshShader, 'translation'), x, y);
        gl.uniform1f(gl.getUniformLocation(this.meshShader, 'scale'), radius);

        const posLoc = gl.getAttribLocation(this.meshShader, 'attrPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.diskVertBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.diskIdBuffer);
        gl.drawElements(gl.TRIANGLES, 3 * numSegs, gl.UNSIGNED_SHORT, 0);

        gl.disableVertexAttribArray(posLoc);
    }

    /**
     * Draw gravity direction indicator
     */
    drawGravityIndicator(gravityX, gravityY) {
        const gl = this.gl;
        const arrowLength = 30;
        const arrowX = 50;
        const arrowY = 50;

        const gravityMagnitude = Math.sqrt(gravityX * gravityX + gravityY * gravityY);
        if (gravityMagnitude === 0) return;

        const scaledLength = Math.min(arrowLength + (gravityMagnitude / 20.0) * 50, 80);
        const dirX = gravityX / gravityMagnitude;
        const dirY = -gravityY / gravityMagnitude;

        const arrowVerts = new Float32Array([
            arrowX / this.canvas.width * this.simWidth,
            (this.canvas.height - arrowY) / this.canvas.height * this.simHeight,
            (arrowX + dirX * scaledLength) / this.canvas.width * this.simWidth,
            (this.canvas.height - (arrowY + dirY * scaledLength)) / this.canvas.height * this.simHeight,
            (arrowX + dirX * scaledLength) / this.canvas.width * this.simWidth,
            (this.canvas.height - (arrowY + dirY * scaledLength)) / this.canvas.height * this.simHeight,
            (arrowX + dirX * (scaledLength - 10) - dirY * 5) / this.canvas.width * this.simWidth,
            (this.canvas.height - (arrowY + dirY * (scaledLength - 10) + dirX * 5)) / this.canvas.height * this.simHeight,
            (arrowX + dirX * (scaledLength - 10) + dirY * 5) / this.canvas.width * this.simWidth,
            (this.canvas.height - (arrowY + dirY * (scaledLength - 10) - dirX * 5)) / this.canvas.height * this.simHeight
        ]);

        gl.useProgram(this.meshShader);
        gl.uniform2f(gl.getUniformLocation(this.meshShader, 'domainSize'), this.simWidth, this.simHeight);

        const intensity = Math.min(gravityMagnitude / 20.0, 1.0);
        gl.uniform3f(gl.getUniformLocation(this.meshShader, 'color'), intensity, 0.0, 1.0 - intensity);
        gl.uniform2f(gl.getUniformLocation(this.meshShader, 'translation'), 0.0, 0.0);
        gl.uniform1f(gl.getUniformLocation(this.meshShader, 'scale'), 1.0);

        const arrowBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, arrowBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arrowVerts, gl.DYNAMIC_DRAW);

        const posLoc = gl.getAttribLocation(this.meshShader, 'attrPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.LINES, 0, 2);
        gl.drawArrays(gl.TRIANGLES, 2, 3);

        gl.disableVertexAttribArray(posLoc);
        gl.deleteBuffer(arrowBuffer);
    }
}

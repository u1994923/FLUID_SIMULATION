/**
 * RAM Monitor Module
 * Measures and displays memory usage of the fluid simulation
 * 
 * @module RamMonitor
 */

/**
 * RAM Monitor class
 */
export class RamMonitor {
    /**
     * Create RAM monitor
     * @param {HTMLElement} container - Container element for the display
     */
    constructor(container) {
        this.container = container;
        this.displayElement = null;
    }

    /**
     * Measure memory usage of a typed array
     * @param {TypedArray} array - Array to measure
     * @param {string} name - Name of the array
     * @returns {Object} Measurement info
     */
    measureArrayMemory(array, name) {
        if (!array) return { name, size: 0, type: 'null' };

        let elementSize = 4; // Default for Float32Array/Int32Array
        if (array instanceof Uint8Array) elementSize = 1;
        if (array instanceof Int16Array || array instanceof Uint16Array) elementSize = 2;

        return {
            name,
            elements: array.length,
            elementSize,
            totalBytes: array.length * elementSize,
            totalKB: (array.length * elementSize / 1024).toFixed(2),
            type: array.constructor.name
        };
    }

    /**
     * Update RAM usage display
     * @param {Object} fluid - Fluid simulation object
     */
    update(fluid) {
        if (!fluid) return;

        const measurements = [];

        // Grid arrays
        measurements.push(this.measureArrayMemory(fluid.u, 'Velocity U'));
        measurements.push(this.measureArrayMemory(fluid.v, 'Velocity V'));
        measurements.push(this.measureArrayMemory(fluid.du, 'Delta U'));
        measurements.push(this.measureArrayMemory(fluid.dv, 'Delta V'));
        measurements.push(this.measureArrayMemory(fluid.prevU, 'Previous U'));
        measurements.push(this.measureArrayMemory(fluid.prevV, 'Previous V'));
        measurements.push(this.measureArrayMemory(fluid.p, 'Pressure'));
        measurements.push(this.measureArrayMemory(fluid.s, 'Solid/Fluid'));
        measurements.push(this.measureArrayMemory(fluid.cellType, 'Cell Types'));

        // Particle arrays
        measurements.push(this.measureArrayMemory(fluid.particlePos, 'Particle Positions'));
        measurements.push(this.measureArrayMemory(fluid.particleVel, 'Particle Velocities'));
        measurements.push(this.measureArrayMemory(fluid.particleDensity, 'Particle Density'));

        // Tracking arrays
        measurements.push(this.measureArrayMemory(fluid.numCellParticles, 'Particles per Cell'));
        measurements.push(this.measureArrayMemory(fluid.firstCellParticle, 'First Cell Particle'));
        measurements.push(this.measureArrayMemory(fluid.cellParticleIds, 'Particle IDs'));

        // Calculate totals
        const totalBytes = measurements.reduce((sum, m) => sum + m.totalBytes, 0);
        const totalKB = totalBytes / 1024;

        // Browser memory (Chrome only)
        let browserMemory = '';
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize / 1024 / 1024;
            const total = performance.memory.totalJSHeapSize / 1024 / 1024;
            const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
            browserMemory = `
                <strong>Browser Memory (Chrome only):</strong><br>
                • Used: ${used.toFixed(1)} MB | Total: ${total.toFixed(1)} MB | Limit: ${limit.toFixed(1)} MB<br>
            `;
        }

        // Detailed breakdown
        const detailedBreakdown = measurements
            .filter(m => m.totalBytes > 0)
            .sort((a, b) => b.totalBytes - a.totalBytes)
            .map(m => `• ${m.name}: ${m.elements} × ${m.elementSize}B = ${m.totalKB}KB (${m.type})`)
            .join('<br>');

        // Create or update display element
        this.render(fluid, totalKB, detailedBreakdown, browserMemory);
    }

    /**
     * Render the RAM display
     */
    render(fluid, totalKB, detailedBreakdown, browserMemory) {
        if (!this.displayElement) {
            this.displayElement = document.createElement('div');
            this.displayElement.id = 'realRamInfo';
            this.displayElement.style.cssText = `
                margin-top: 10px;
                padding: 10px;
                background: linear-gradient(135deg, #e8f5e8, #d4edda);
                border-radius: 8px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 13px;
                border-left: 4px solid #28a745;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transition: all 0.3s ease;
            `;
            this.displayElement.title = 'Click to expand/collapse details';
            this.container.appendChild(this.displayElement);

            // Add hover effect
            this.displayElement.addEventListener('mouseenter', () => {
                this.displayElement.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
            });
            this.displayElement.addEventListener('mouseleave', () => {
                this.displayElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            });
        }

        // Main HTML (always visible)
        const mainHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>
                    <strong>🔍 RAM Usage: ${totalKB.toFixed(2)} KB</strong>
                    <span style="font-size: 11px; color: #666; margin-left: 10px;">
                        [Grid: ${fluid.fNumX}×${fluid.fNumY}, Particles: ${fluid.numParticles}]
                    </span>
                </span>
                <span id="expandToggle" style="font-size: 12px; color: #28a745; font-weight: bold;">
                    ▼ Details
                </span>
            </div>
        `;

        // Detailed HTML (expandable)
        const detailsHTML = `
            <div id="ramDetails" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #c3e6cb; font-size: 11px; line-height: 1.6;">
                <strong style="color: #155724;">📊 Array Memory Breakdown:</strong><br>
                <div style="padding-left: 10px; margin-top: 5px;">
                    ${detailedBreakdown}
                </div>
                <br>
                <strong style="color: #155724;">📐 Grid Info:</strong><br>
                <div style="padding-left: 10px; margin-top: 5px;">
                    • Main Grid: ${fluid.fNumX}×${fluid.fNumY} (${fluid.fNumCells} cells)<br>
                    • Particle Grid: ${fluid.pNumX}×${fluid.pNumY} (${fluid.pNumCells} cells)<br>
                    • Active Particles: ${fluid.numParticles}/${fluid.maxParticles}
                </div>
                <br>
                ${browserMemory}
            </div>
        `;

        this.displayElement.innerHTML = mainHTML + detailsHTML;

        // Add toggle functionality
        this.displayElement.onclick = (e) => {
            e.stopPropagation();
            const details = document.getElementById('ramDetails');
            const toggle = document.getElementById('expandToggle');

            if (details.style.display === 'none') {
                details.style.display = 'block';
                toggle.textContent = '▲ Hide';
                toggle.style.color = '#dc3545';
            } else {
                details.style.display = 'none';
                toggle.textContent = '▼ Details';
                toggle.style.color = '#28a745';
            }
        };
    }

    /**
     * Get memory summary as object
     * @param {Object} fluid - Fluid simulation object
     * @returns {Object} Memory summary
     */
    getSummary(fluid) {
        if (!fluid) return null;

        const measurements = [
            this.measureArrayMemory(fluid.u, 'u'),
            this.measureArrayMemory(fluid.v, 'v'),
            this.measureArrayMemory(fluid.du, 'du'),
            this.measureArrayMemory(fluid.dv, 'dv'),
            this.measureArrayMemory(fluid.prevU, 'prevU'),
            this.measureArrayMemory(fluid.prevV, 'prevV'),
            this.measureArrayMemory(fluid.p, 'p'),
            this.measureArrayMemory(fluid.s, 's'),
            this.measureArrayMemory(fluid.cellType, 'cellType'),
            this.measureArrayMemory(fluid.particlePos, 'particlePos'),
            this.measureArrayMemory(fluid.particleVel, 'particleVel'),
            this.measureArrayMemory(fluid.particleDensity, 'particleDensity'),
            this.measureArrayMemory(fluid.numCellParticles, 'numCellParticles'),
            this.measureArrayMemory(fluid.firstCellParticle, 'firstCellParticle'),
            this.measureArrayMemory(fluid.cellParticleIds, 'cellParticleIds')
        ];

        const totalBytes = measurements.reduce((sum, m) => sum + m.totalBytes, 0);

        return {
            totalBytes,
            totalKB: totalBytes / 1024,
            totalMB: totalBytes / 1024 / 1024,
            gridCells: fluid.fNumCells,
            particles: fluid.numParticles,
            gridDimensions: { x: fluid.fNumX, y: fluid.fNumY },
            arrays: measurements
        };
    }
}

/**
 * Create and initialize RAM monitor
 * @param {string} containerId - ID of container element
 * @returns {RamMonitor} Monitor instance
 */
export function createRamMonitor(containerId = 'controls') {
    const container = document.querySelector(`.${containerId}`) || document.getElementById(containerId);
    if (!container) {
        console.warn(`RamMonitor: Container "${containerId}" not found`);
        return null;
    }
    return new RamMonitor(container);
}

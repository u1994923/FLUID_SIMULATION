/**
 * Container Shapes Module
 * Defines different container shapes for the fluid simulation
 * 
 * @module ContainerShapes
 */

/**
 * Available container shapes
 */
export const CONTAINER_SHAPES = {
    RECTANGULAR: 'rectangular',
    SQUARE: 'square',
    CIRCULAR: 'circular',
    HEART: 'heart',
    STAR: 'star',
    DIAMOND: 'diamond'
};

/**
 * Check if a grid cell should be solid based on container shape
 * @param {number} i - Grid X index
 * @param {number} j - Grid Y index
 * @param {number} fNumX - Total grid cells in X
 * @param {number} fNumY - Total grid cells in Y
 * @param {string} shape - Container shape type
 * @param {number} gridResolution - Grid resolution setting
 * @param {number} squareSizeFactor - Size factor for square container
 * @returns {boolean} True if cell should be solid
 */
export function isCellSolid(i, j, fNumX, fNumY, shape, gridResolution, squareSizeFactor = 0.8) {
    const centerX = Math.floor(fNumX / 2);
    const centerY = Math.floor(fNumY / 2);
    const x = i - centerX;
    const y = j - centerY;
    const radiusInCells = Math.floor(Math.min(fNumX, fNumY) * 0.45);

    switch (shape) {
        case CONTAINER_SHAPES.RECTANGULAR:
            return i === 0 || i === fNumX - 1 || j === 0 || j === fNumY - 1;

        case CONTAINER_SHAPES.SQUARE: {
            let targetSquareSize = Math.floor(gridResolution * squareSizeFactor);
            const maxSquareSize = Math.min(fNumX - 2, fNumY - 2);
            let squareSizeInCells = Math.min(targetSquareSize, maxSquareSize);
            if (squareSizeInCells % 2 !== (fNumX % 2)) squareSizeInCells--;

            const startX = Math.floor((fNumX - squareSizeInCells) / 2);
            const endX = startX + squareSizeInCells - 1;
            const startY = Math.floor((fNumY - squareSizeInCells) / 2);
            const endY = startY + squareSizeInCells - 1;
            return i < startX || i > endX || j < startY || j > endY;
        }

        case CONTAINER_SHAPES.CIRCULAR: {
            const distInCells = Math.sqrt(x * x + y * y);
            return distInCells > radiusInCells || j === 0;
        }

        case CONTAINER_SHAPES.HEART: {
            const scale = radiusInCells * 0.6;
            const heartX = x / scale;
            const heartY = (y + radiusInCells * 0.3) / scale;
            const heartEq = Math.pow(heartX * heartX + heartY * heartY - 1, 3) - heartX * heartX * heartY * heartY * heartY;
            return heartEq > 0 || j === 0;
        }

        case CONTAINER_SHAPES.STAR: {
            const angle = Math.atan2(y, x);
            const distInCells = Math.sqrt(x * x + y * y);
            const starRadiusInCells = radiusInCells * (0.6 + 0.4 * Math.cos(5 * angle));
            return distInCells > starRadiusInCells || j === 0;
        }

        case CONTAINER_SHAPES.DIAMOND: {
            const diamondDist = Math.abs(x) / (radiusInCells * 0.7) + Math.abs(y) / (radiusInCells * 0.7);
            return diamondDist > 1.0 || j === 0;
        }

        default:
            return i === 0 || i === fNumX - 1 || j === 0 || j === fNumY - 1;
    }
}

/**
 * Check if a particle position is valid within the container
 * @param {number} x - Physical X coordinate
 * @param {number} y - Physical Y coordinate
 * @param {Object} fluid - Fluid simulation object
 * @param {string} shape - Container shape type
 * @param {number} gridResolution - Grid resolution setting
 * @param {number} squareSizeFactor - Size factor for square container
 * @returns {boolean} True if position is valid (inside container)
 */
export function isValidParticlePosition(x, y, fluid, shape, gridResolution, squareSizeFactor = 0.8) {
    const i = Math.floor(x / fluid.h);
    const j = Math.floor(y / fluid.h);

    if (i < 0 || i >= fluid.fNumX || j < 0 || j >= fluid.fNumY) return false;

    const centerX = Math.floor(fluid.fNumX / 2);
    const centerY = Math.floor(fluid.fNumY / 2);
    const gridX = i - centerX;
    const gridY = j - centerY;
    const radiusInCells = Math.floor(Math.min(fluid.fNumX, fluid.fNumY) * 0.45);

    switch (shape) {
        case CONTAINER_SHAPES.RECTANGULAR:
            return i > 0 && i < fluid.fNumX - 1 && j > 0 && j < fluid.fNumY - 1;

        case CONTAINER_SHAPES.SQUARE: {
            let targetSquareSize = Math.floor(gridResolution * squareSizeFactor);
            const maxSquareSize = Math.min(fluid.fNumX - 2, fluid.fNumY - 2);
            let squareSizeInCells = Math.min(targetSquareSize, maxSquareSize);
            if (squareSizeInCells % 2 !== (fluid.fNumX % 2)) squareSizeInCells--;
            const startX = Math.floor((fluid.fNumX - squareSizeInCells) / 2);
            const endX = startX + squareSizeInCells - 1;
            const startY = Math.floor((fluid.fNumY - squareSizeInCells) / 2);
            const endY = startY + squareSizeInCells - 1;
            return i >= startX && i <= endX && j >= startY && j <= endY;
        }

        case CONTAINER_SHAPES.CIRCULAR: {
            const distInCells = Math.sqrt(gridX * gridX + gridY * gridY);
            return distInCells <= radiusInCells && j > 0;
        }

        case CONTAINER_SHAPES.HEART: {
            const scale = radiusInCells * 0.6;
            const heartX = gridX / scale;
            const heartY = (gridY + radiusInCells * 0.3) / scale;
            const heartEq = Math.pow(heartX * heartX + heartY * heartY - 1, 3) - heartX * heartX * heartY * heartY * heartY;
            return heartEq <= 0 && j > 0;
        }

        case CONTAINER_SHAPES.STAR: {
            const angle = Math.atan2(gridY, gridX);
            const distInCells = Math.sqrt(gridX * gridX + gridY * gridY);
            const starRadiusInCells = radiusInCells * (0.6 + 0.4 * Math.cos(5 * angle));
            return distInCells <= starRadiusInCells && j > 0;
        }

        case CONTAINER_SHAPES.DIAMOND: {
            const diamondDist = Math.abs(gridX) / (radiusInCells * 0.7) + Math.abs(gridY) / (radiusInCells * 0.7);
            return diamondDist <= 1.0 && j > 0;
        }

        default:
            return false;
    }
}

/**
 * Setup container boundaries in the fluid grid
 * @param {Object} fluid - Fluid simulation object
 * @param {string} shape - Container shape type
 * @param {number} gridResolution - Grid resolution setting
 * @param {number} squareSizeFactor - Size factor for square container
 * @returns {Float32Array} Copy of the original container configuration
 */
export function setupContainer(fluid, shape, gridResolution, squareSizeFactor = 0.8) {
    const n = fluid.fNumY;

    for (let i = 0; i < fluid.fNumX; i++) {
        for (let j = 0; j < fluid.fNumY; j++) {
            const solid = isCellSolid(i, j, fluid.fNumX, fluid.fNumY, shape, gridResolution, squareSizeFactor);
            fluid.s[i * n + j] = solid ? 0.0 : 1.0;
        }
    }

    // Return copy of original container configuration
    return new Float32Array(fluid.s);
}

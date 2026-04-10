# FLIP Fluid Pendant

A modular, interactive fluid simulation using the **FLIP (Fluid-Implicit-Particle)** method. Perfect for creating realistic water effects in pendants, jewelry, or any container shape.

![Fluid Pendant Demo](docs/demo.png)

## 📁 Project Structure

```
FLUIDPENDANT/
├── index.html              # Main entry point
├── css/
│   └── styles.css          # Simple, functional styles
├── js/
│   ├── App.js              # Main application class
│   ├── FlipFluid.js        # Physics engine (FLIP solver)
│   ├── GridConfig.js       # Grid configuration & sizing
│   ├── ContainerShapes.js  # Shape definitions (circle, heart, star, etc.)
│   ├── Renderer.js         # WebGL rendering
│   ├── Settings.js         # Configuration & LocalStorage
│   ├── InputHandler.js     # Mouse, touch, keyboard, accelerometer
│   └── RamMonitor.js       # Memory usage display
└── README.md               # This file
```

## 🚀 Quick Start

1. Open `index.html` in a modern browser
2. Click and drag on the canvas to control gravity direction
3. Use the controls to adjust settings

**Note:** Since ES6 modules are used, you need to serve the files through a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using VS Code
# Install "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8000` in your browser.

## 📦 Modules

### FlipFluid.js
The core physics engine implementing the FLIP method.

```javascript
import { FlipFluid, FLUID_CELL, SOLID_CELL, AIR_CELL, clamp } from './FlipFluid.js';

// Create a new fluid simulation
const fluid = new FlipFluid(density, width, height, spacing, particleRadius, maxParticles);

// Run simulation step
fluid.simulate({
    dt: 0.016,
    gravityX: 0,
    gravityY: -9.8,
    flipRatio: 0.9,
    numPressureIters: 50,
    // ... more options
});
```

### ContainerShapes.js
Define custom container shapes for your pendant.

```javascript
import { CONTAINER_SHAPES, setupContainer, isValidParticlePosition } from './ContainerShapes.js';

// Available shapes
CONTAINER_SHAPES.CIRCULAR   // ⭕ Circle
CONTAINER_SHAPES.HEART      // ❤️ Heart
CONTAINER_SHAPES.STAR       // ⭐ Star
CONTAINER_SHAPES.DIAMOND    // 💎 Diamond
CONTAINER_SHAPES.SQUARE     // ⬜ Square
CONTAINER_SHAPES.RECTANGULAR

// Setup container boundaries
const originalContainer = setupContainer(fluid, 'heart', gridResolution, squareSizeFactor);
```

### Renderer.js
WebGL-based rendering for particles and grid.

```javascript
import { FluidRenderer } from './Renderer.js';

const renderer = new FluidRenderer(gl, canvas, simWidth, simHeight);

renderer.draw({
    fluid: fluidObject,
    showGrid: true,
    showParticles: false,
    displayMode: 'grid',
    // ... more options
});
```

### Settings.js
Manage configuration and persistence.

```javascript
import { SettingsManager, createDefaultAdvancedSettings, createDefaultScene } from './Settings.js';

const settings = createDefaultAdvancedSettings();
const scene = createDefaultScene();

const manager = new SettingsManager(settings, scene);
manager.load();  // Load from LocalStorage
manager.save();  // Save to LocalStorage
manager.autoSave(); // Debounced auto-save
```

### InputHandler.js
Handle user input from multiple sources.

```javascript
import { InputHandler, AccelerometerHandler } from './InputHandler.js';

const input = new InputHandler(canvas, scene, cScale, simWidth, simHeight);
input.onPause = () => togglePause();
input.onReset = () => resetSimulation();

const accelerometer = new AccelerometerHandler(scene);
await accelerometer.init(); // Request permission on iOS
```

## 🎨 Creating Custom Shapes

To add a new container shape, edit `ContainerShapes.js`:

```javascript
// Add to CONTAINER_SHAPES
export const CONTAINER_SHAPES = {
    // ... existing shapes
    CUSTOM: 'custom'
};

// Add case to isCellSolid()
case CONTAINER_SHAPES.CUSTOM: {
    // Your shape logic here
    // Return true if cell should be solid (wall)
    // Return false if cell should be fluid space
    const myCustomShape = /* your math here */;
    return myCustomShape > someThreshold || j === 0; // j === 0 keeps bottom wall
}

// Add same case to isValidParticlePosition()
```

## ⚙️ Configuration Options

### Advanced Settings
| Setting | Description | Range |
|---------|-------------|-------|
| `particleRadiusFactor` | Particle size relative to grid | 0.1 - 0.8 |
| `timeStep` | Physics dt | 0.008 - 0.05 |
| `pressureIterations` | Solver accuracy | 10 - 200 |
| `density` | Fluid density (kg/m³) | 100 - 2000 |
| `flipRatio` | PIC/FLIP mix (0=stable, 1=energetic) | 0.0 - 1.0 |
| `viscosity` | Flow resistance | 0 - 20 |
| `overRelaxation` | SOR parameter | 1.0 - 2.0 |

## 🔧 Reusing for Real Pendant

For a physical pendant device:

1. **Extract physics**: Use `FlipFluid.js` standalone
2. **Custom shape**: Create your pendant outline in `ContainerShapes.js`
3. **Accelerometer**: The `AccelerometerHandler` already supports real device orientation
4. **Render backend**: Replace WebGL with your display technology

Example for embedded use:

```javascript
import { FlipFluid } from './FlipFluid.js';
import { setupContainer, isValidParticlePosition } from './ContainerShapes.js';

// Minimal setup for embedded pendant
const fluid = new FlipFluid(1000, width, height, h, r, maxParticles);
setupContainer(fluid, 'heart', 30, 0.8);

// In your main loop
function tick(accelX, accelY) {
    fluid.simulate({
        dt: 0.016,
        gravityX: accelX,
        gravityY: accelY,
        // ... minimal options
    });
    
    // Read particle positions for your display
    for (let i = 0; i < fluid.numParticles; i++) {
        const x = fluid.particlePos[2 * i];
        const y = fluid.particlePos[2 * i + 1];
        // Render to your display
    }
}
```

## 📱 Mobile Support

- Touch events fully supported
- Accelerometer/gyroscope for gravity control
- iOS 13+ permission handling included
- Responsive CSS for all screen sizes


## 🙏 Credits

Based on the FLIP fluid simulation method by Zhu & Bridson (2005).

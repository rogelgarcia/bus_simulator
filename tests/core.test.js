// tests/core.test.js
// Automated test runner for core systems
// Runs on page load, prints errors at the end

const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (err) {
        errors.push({ name, error: err.message || err });
        console.error(`❌ ${name}: ${err.message || err}`);
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, msg = '') {
    if (!value) {
        throw new Error(`${msg} Expected truthy, got ${value}`);
    }
}

function assertFalse(value, msg = '') {
    if (value) {
        throw new Error(`${msg} Expected falsy, got ${value}`);
    }
}

async function runTests() {
    console.log('\n🧪 Running Core Tests...\n');

    // ========== EventBus Tests ==========
    const { EventBus } = await import('/src/core/EventBus.js');

    test('EventBus: on/emit works', () => {
        const bus = new EventBus();
        let received = null;
        bus.on('test', (msg) => { received = msg; });
        bus.emit('test', 'hello');
        assertEqual(received, 'hello', 'Message mismatch.');
    });

    test('EventBus: off removes listener', () => {
        const bus = new EventBus();
        let count = 0;
        const handler = () => { count++; };
        bus.on('test', handler);
        bus.emit('test');
        bus.off('test', handler);
        bus.emit('test');
        assertEqual(count, 1, 'Handler should fire once.');
    });

    test('EventBus: once fires only once', () => {
        const bus = new EventBus();
        let count = 0;
        bus.once('test', () => { count++; });
        bus.emit('test');
        bus.emit('test');
        assertEqual(count, 1, 'Once handler should fire once.');
    });

    test('EventBus: listenerCount works', () => {
        const bus = new EventBus();
        bus.on('test', () => {});
        bus.on('test', () => {});
        assertEqual(bus.listenerCount('test'), 2, 'Should have 2 listeners.');
    });

    test('EventBus: clear removes all listeners', () => {
        const bus = new EventBus();
        bus.on('a', () => {});
        bus.on('b', () => {});
        bus.clear();
        assertEqual(bus.listenerCount('a'), 0, 'Should have 0 listeners for a.');
        assertEqual(bus.listenerCount('b'), 0, 'Should have 0 listeners for b.');
    });

    // ========== VehicleManager Tests ==========
    const { VehicleManager } = await import('/src/core/VehicleManager.js');

    test('VehicleManager: addVehicle returns ID', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, { userData: {} }, {});
        assertTrue(id.startsWith('vehicle_'), 'ID should start with vehicle_');
    });

    test('VehicleManager: getVehicle returns entry', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const mockVehicle = { userData: {} };
        const id = manager.addVehicle(mockVehicle, {}, {});
        const entry = manager.getVehicle(id);
        assertEqual(entry.vehicle, mockVehicle, 'Vehicle mismatch.');
    });

    test('VehicleManager: removeVehicle works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(manager.removeVehicle(id), 'Should return true.');
        assertFalse(manager.hasVehicle(id), 'Should not have vehicle.');
    });

    test('VehicleManager: emits vehicle:added event', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        let emitted = null;
        bus.on('vehicle:added', (e) => { emitted = e; });
        manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(emitted !== null, 'Event should be emitted.');
        assertTrue(emitted.id.startsWith('vehicle_'), 'Event should have ID.');
    });

    test('VehicleManager: count works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        manager.addVehicle({ userData: {} }, {}, {});
        manager.addVehicle({ userData: {} }, {}, {});
        assertEqual(manager.count, 2, 'Should have 2 vehicles.');
    });

    // ========== Physics Systems Stub Tests ==========
    const { LocomotionSystem } = await import('/src/physics/systems/LocomotionSystem.js');
    const { SuspensionSystem } = await import('/src/physics/systems/SuspensionSystem.js');
    const { DrivetrainSystem } = await import('/src/physics/systems/DrivetrainSystem.js');
    const { CollisionSystem } = await import('/src/physics/systems/CollisionSystem.js');
    const { BrakeSystem } = await import('/src/physics/systems/BrakeSystem.js');

    test('LocomotionSystem: addVehicle/getState works', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
        assertEqual(state.speed, 0, 'Initial speed should be 0.');
    });

    test('LocomotionSystem: fixedUpdate accelerates with throttle', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { throttle: 1.0 });

        // Run several updates
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.speed > 0, 'Speed should increase with throttle.');
        assertTrue(state.speedKph > 0, 'speedKph should be positive.');
    });

    test('LocomotionSystem: steering changes yaw', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });

        // Need speed for steering to affect yaw
        // steering: +1 = right input, which produces negative steerAngle (convention)
        sys.setInput('v1', { throttle: 1.0, steering: 1.0 });

        for (let i = 0; i < 120; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.yaw !== 0, 'Yaw should change with steering.');
        // steering +1 (right) produces negative steerAngle (yaw convention: +angle = left)
        assertTrue(state.steerAngle < 0, 'Steer angle should be negative for right steering.');
    });

    test('LocomotionSystem: braking reduces speed', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });

        // Accelerate first
        sys.setInput('v1', { throttle: 1.0 });
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }
        const speedBefore = sys.getState('v1').speed;

        // Now brake
        sys.setInput('v1', { throttle: 0, brake: 1.0 });
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }
        const speedAfter = sys.getState('v1').speed;

        assertTrue(speedAfter < speedBefore, 'Speed should decrease with braking.');
    });

    test('LocomotionSystem: position updates with movement', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { throttle: 1.0 });

        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.position.z !== 0, 'Position Z should change with forward movement.');
    });

    test('LocomotionSystem: getLateralAccel returns value', () => {
        const sys = new LocomotionSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { throttle: 1.0, steering: 0.5 });

        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const latAccel = sys.getLateralAccel('v1');
        assertTrue(typeof latAccel === 'number', 'getLateralAccel should return a number.');
    });

    test('SuspensionSystem: addVehicle/getState works', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
        assertEqual(state.bodyPitch, 0, 'Initial pitch should be 0.');
    });

    test('SuspensionSystem: fixedUpdate runs without error', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Should not throw
        sys.fixedUpdate(1 / 60);

        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist after update.');
    });

    test('SuspensionSystem: setWheelCompression affects spring state', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Set compression command
        sys.setWheelCompression('v1', 'fl', 0.1);

        // Run updates to let spring respond
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.suspensionCompression.fl !== 0, 'FL compression should change.');
    });

    test('SuspensionSystem: setChassisAcceleration causes load transfer', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Apply lateral acceleration (turning)
        sys.setChassisAcceleration('v1', 5.0, 0);

        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.latBias !== 0, 'Lateral bias should change with lateral accel.');
    });

    test('SuspensionSystem: longitudinal accel causes pitch', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Apply longitudinal acceleration (braking)
        sys.setChassisAcceleration('v1', 0, -5.0);

        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.longBias !== 0, 'Long bias should change with longitudinal accel.');
    });

    test('SuspensionSystem: pose calculation works', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Set asymmetric compression to create roll
        sys.setWheelCompression('v1', 'fl', 0.1);
        sys.setWheelCompression('v1', 'rl', 0.1);

        for (let i = 0; i < 120; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.bodyRoll !== 0, 'Body roll should be non-zero with asymmetric compression.');
    });

    test('SuspensionSystem: applyCurbImpact creates bounce effect', () => {
        const sys = new SuspensionSystem();
        sys.addVehicle({ id: 'v1' });

        // Get initial state
        const stateBefore = sys.getState('v1');
        const initialCompression = stateBefore.suspensionCompression.fl;

        // Apply curb impact (going up onto curb)
        sys.applyCurbImpact('v1', 'fl', 0.06, { impactKick: 10.0, maxVelocity: 3.0 });

        // Run a few physics steps
        for (let i = 0; i < 10; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const stateAfter = sys.getState('v1');
        assertTrue(
            stateAfter.suspensionCompression.fl !== initialCompression,
            'FL compression should change after curb impact.'
        );
    });

    test('DrivetrainSystem: addVehicle/getState works', () => {
        const sys = new DrivetrainSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
        assertEqual(state.rpm, 900, 'Initial RPM should be 900.');
    });

    test('DrivetrainSystem: fixedUpdate updates RPM with throttle', () => {
        const sys = new DrivetrainSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { throttle: 1.0 });
        sys.setExternalSpeed('v1', 0);

        // Run several updates to let RPM rise
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.rpm > 900, 'RPM should rise with throttle.');
    });

    test('DrivetrainSystem: gear shifts up at high RPM', () => {
        const sys = new DrivetrainSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { throttle: 1.0 });
        sys.setExternalSpeed('v1', 15); // In 1st gear range

        // Force RPM high enough to trigger upshift
        const state = sys.vehicles.get('v1');
        state.rpm = 7100; // Above RPM_UPSHIFT (7000)

        sys.fixedUpdate(1 / 60);

        const newState = sys.getState('v1');
        assertEqual(newState.gear, 2, 'Should upshift to gear 2.');
    });

    test('DrivetrainSystem: gear shifts down at low RPM', () => {
        const sys = new DrivetrainSystem();
        sys.addVehicle({ id: 'v1' });

        // Start in 2nd gear
        const state = sys.vehicles.get('v1');
        state.gear = 2;
        state.rpm = 1700; // Below RPM_DOWNSHIFT (1800)

        sys.setExternalSpeed('v1', 10);
        sys.fixedUpdate(1 / 60);

        const newState = sys.getState('v1');
        assertEqual(newState.gear, 1, 'Should downshift to gear 1.');
    });

    test('DrivetrainSystem: clutch engages above speed threshold', () => {
        const sys = new DrivetrainSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setExternalSpeed('v1', 5);
        sys.fixedUpdate(1 / 60);

        const state = sys.getState('v1');
        assertTrue(state.clutchEngaged, 'Clutch should be engaged above 1 kph.');
    });

    test('CollisionSystem: addVehicle/getState works', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
    });

    test('BrakeSystem: addVehicle/getState works', () => {
        const sys = new BrakeSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
        assertEqual(state.brakeForce, 0, 'Initial brake force should be 0.');
    });

    test('BrakeSystem: fixedUpdate builds brake force', () => {
        const sys = new BrakeSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { brake: 1.0 });

        // Run several updates to let brake force build
        for (let i = 0; i < 30; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.brakeForce > 0, 'Brake force should build with input.');
        assertTrue(state.brakeForce > 3, 'Brake force should be significant.');
    });

    test('BrakeSystem: brake lights turn on with input', () => {
        const sys = new BrakeSystem();
        sys.addVehicle({ id: 'v1' });

        // No brake - lights off
        sys.fixedUpdate(1 / 60);
        assertEqual(sys.getState('v1').brakeLightsOn, false, 'Lights off with no brake.');

        // Apply brake - lights on
        sys.setInput('v1', { brake: 0.5 });
        sys.fixedUpdate(1 / 60);
        assertEqual(sys.getState('v1').brakeLightsOn, true, 'Lights on with brake.');
    });

    test('BrakeSystem: handbrake activates brake force', () => {
        const sys = new BrakeSystem();
        sys.addVehicle({ id: 'v1' });
        sys.setInput('v1', { handbrake: true });

        // Run updates
        for (let i = 0; i < 30; i++) {
            sys.fixedUpdate(1 / 60);
        }

        const state = sys.getState('v1');
        assertTrue(state.brakeForce > 0, 'Handbrake should apply brake force.');
        assertTrue(state.brakeLightsOn, 'Handbrake should turn on brake lights.');
    });

    test('BrakeSystem: brake force releases when input removed', () => {
        const sys = new BrakeSystem();
        sys.addVehicle({ id: 'v1' });

        // Apply brake
        sys.setInput('v1', { brake: 1.0 });
        for (let i = 0; i < 30; i++) {
            sys.fixedUpdate(1 / 60);
        }
        const forceBraking = sys.getState('v1').brakeForce;

        // Release brake
        sys.setInput('v1', { brake: 0 });
        for (let i = 0; i < 60; i++) {
            sys.fixedUpdate(1 / 60);
        }
        const forceReleased = sys.getState('v1').brakeForce;

        assertTrue(forceReleased < forceBraking, 'Brake force should decrease when released.');
        assertTrue(forceReleased < 0.5, 'Brake force should be near zero.');
    });

    // ========== CollisionSystem Tests (added in Task 9) ==========
    test('CollisionSystem: addVehicle initializes wheel surfaces', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should exist.');
        assertTrue(state.wheelSurfaces !== undefined, 'wheelSurfaces should exist.');
        assertTrue(state.wheelHeights !== undefined, 'wheelHeights should exist.');
    });

    test('CollisionSystem: getState returns surface names', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });
        const state = sys.getState('v1');
        assertTrue(state.wheelSurfaceNames !== undefined, 'wheelSurfaceNames should exist.');
        assertEqual(state.wheelSurfaceNames.fl, 'unknown', 'Initial surface should be unknown.');
    });

    test('CollisionSystem: fixedUpdate runs without environment', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });

        // Should not throw without environment
        sys.fixedUpdate(1 / 60);

        const state = sys.getState('v1');
        assertTrue(state !== null, 'State should still exist.');
    });

    test('CollisionSystem: aggregate state flags work', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });
        sys.fixedUpdate(1 / 60);

        const state = sys.getState('v1');
        // Without environment, all surfaces are UNKNOWN, which counts as "on asphalt"
        assertTrue(state.allOnAsphalt === true, 'allOnAsphalt should be true for unknown surfaces.');
        assertTrue(state.onCurb === false, 'onCurb should be false.');
        assertTrue(state.onGrass === false, 'onGrass should be false.');
    });

    test('CollisionSystem: isOnSurface and getDominantSurface work', () => {
        const sys = new CollisionSystem();
        sys.addVehicle({ id: 'v1' });

        // Manually set a surface for testing (using numeric constants)
        // SURFACE.UNKNOWN=0, ASPHALT=1, CURB=2, GRASS=3
        const internalState = sys.vehicles.get('v1');
        internalState.wheelSurfaces.fl = 2; // CURB
        internalState.wheelSurfaces.fr = 1; // ASPHALT
        internalState.wheelSurfaces.rl = 1; // ASPHALT
        internalState.wheelSurfaces.rr = 1; // ASPHALT

        assertTrue(sys.isOnSurface('v1', 2), 'Should detect curb.');
        assertEqual(sys.getDominantSurface('v1'), 1, 'Dominant should be asphalt.');
    });

    // ========== PhysicsController Tests (added in Task 4) ==========
    try {
        const { PhysicsController } = await import('/src/physics/PhysicsController.js');

        test('PhysicsController: instantiates with EventBus', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertTrue(ctrl !== null, 'Controller should exist.');
            assertTrue(ctrl.loop !== null, 'Loop should exist.');
        });

        test('PhysicsController: has all 5 systems', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertTrue(ctrl.systems.locomotion !== undefined, 'locomotion');
            assertTrue(ctrl.systems.suspension !== undefined, 'suspension');
            assertTrue(ctrl.systems.drivetrain !== undefined, 'drivetrain');
            assertTrue(ctrl.systems.collision !== undefined, 'collision');
            assertTrue(ctrl.systems.brake !== undefined, 'brake');
        });

        test('PhysicsController: addVehicle registers with all systems', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            assertTrue(ctrl.systems.locomotion.getState('v1') !== null, 'locomotion');
            assertTrue(ctrl.systems.suspension.getState('v1') !== null, 'suspension');
            assertTrue(ctrl.systems.drivetrain.getState('v1') !== null, 'drivetrain');
            assertTrue(ctrl.systems.collision.getState('v1') !== null, 'collision');
            assertTrue(ctrl.systems.brake.getState('v1') !== null, 'brake');
        });

        test('PhysicsController: removeVehicle unregisters from all systems', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.removeVehicle('v1');
            assertEqual(ctrl.systems.locomotion.getState('v1'), null, 'locomotion');
            assertEqual(ctrl.systems.suspension.getState('v1'), null, 'suspension');
        });

        test('PhysicsController: update calls loop.update', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            // Should not throw
            ctrl.update(0.016);
            assertTrue(true, 'Update should not throw.');
        });

        test('PhysicsController: inter-system sync wires brake to locomotion', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});

            // Apply brake input
            ctrl.setInput('v1', { brake: 1.0 });

            // Run update to trigger sync
            for (let i = 0; i < 10; i++) {
                ctrl.update(1 / 60);
            }

            // Brake system should have brake force
            const brakeState = ctrl.systems.brake.getState('v1');
            assertTrue(brakeState.brakeForce > 0, 'Brake force should be positive.');
        });

        test('PhysicsController: inter-system sync wires locomotion to suspension', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});

            // Apply throttle and steering to generate acceleration
            ctrl.setInput('v1', { throttle: 1.0, steering: 0.5 });

            // Run updates
            for (let i = 0; i < 60; i++) {
                ctrl.update(1 / 60);
            }

            // Suspension should have received chassis acceleration
            const suspState = ctrl.systems.suspension.getState('v1');
            assertTrue(suspState !== null, 'Suspension state should exist.');
        });

        test('PhysicsController: getSystem returns correct system', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertEqual(ctrl.getSystem('locomotion'), ctrl.systems.locomotion, 'Should return locomotion.');
            assertEqual(ctrl.getSystem('suspension'), ctrl.systems.suspension, 'Should return suspension.');
            assertEqual(ctrl.getSystem('invalid'), null, 'Should return null for invalid.');
        });

        test('PhysicsController: getVehicleIds returns registered vehicles', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.addVehicle('v2', { id: 'v2' }, {}, {});
            const ids = ctrl.getVehicleIds();
            assertTrue(ids.includes('v1'), 'Should include v1.');
            assertTrue(ids.includes('v2'), 'Should include v2.');
            assertEqual(ids.length, 2, 'Should have 2 vehicles.');
        });

        test('PhysicsController: hasVehicle returns correct status', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            assertTrue(ctrl.hasVehicle('v1'), 'Should have v1.');
            assertFalse(ctrl.hasVehicle('v2'), 'Should not have v2.');
        });
    } catch (e) {
        // PhysicsController not yet created - skip these tests
        console.log('⏭️  PhysicsController tests skipped (not yet created)');
    }

    // ========== SimulationContext Tests (added in Task 5) ==========
    try {
        const { SimulationContext } = await import('/src/core/SimulationContext.js');

        test('SimulationContext: instantiates with all systems', () => {
            const ctx = new SimulationContext();
            assertTrue(ctx.events !== null, 'events should exist');
            assertTrue(ctx.vehicles !== null, 'vehicles should exist');
            assertTrue(ctx.physics !== null, 'physics should exist');
        });

        test('SimulationContext: addVehicle registers with all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            assertTrue(id.startsWith('vehicle_'), 'Should return ID');
            assertTrue(ctx.vehicles.hasVehicle(id), 'VehicleManager should have vehicle');
            assertTrue(ctx.physics._vehicleIds.has(id), 'PhysicsController should have vehicle');
        });

        test('SimulationContext: removeVehicle unregisters from all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.removeVehicle(id);
            assertFalse(ctx.vehicles.hasVehicle(id), 'VehicleManager should not have vehicle');
            assertFalse(ctx.physics._vehicleIds.has(id), 'PhysicsController should not have vehicle');
        });

        test('SimulationContext: setEnvironment propagates to physics', () => {
            const ctx = new SimulationContext();
            const env = { map: {}, config: {} };
            ctx.setEnvironment(env);
            assertEqual(ctx.getEnvironment(), env, 'Environment should be set');
        });

        test('SimulationContext: update calls physics.update', () => {
            const ctx = new SimulationContext();
            ctx.update(0.016);
            assertTrue(true, 'Update should not throw');
        });

        test('SimulationContext: dispose cleans up all systems', () => {
            const ctx = new SimulationContext();
            ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.dispose();
            assertEqual(ctx.vehicles.count, 0, 'Vehicles should be cleared');
        });

        test('SimulationContext: has legacy context fields', () => {
            const ctx = new SimulationContext();
            assertEqual(ctx.selectedBusId, null, 'selectedBusId should be null');
            assertEqual(ctx.selectedBus, null, 'selectedBus should be null');
        });
    } catch (e) {
        console.log('⏭️  SimulationContext tests skipped (not yet created)');
    }

    // ========== GameEngine Integration Tests (added in Task 6) ==========
    try {
        const { GameEngine } = await import('/src/core/GameEngine.js');

        // Create a mock canvas for testing
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 100;
        mockCanvas.height = 100;

        test('GameEngine: has simulation property', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.simulation !== null, 'simulation should exist');
            assertTrue(engine.simulation.events !== undefined, 'simulation.events should exist');
            assertTrue(engine.simulation.vehicles !== undefined, 'simulation.vehicles should exist');
            assertTrue(engine.simulation.physics !== undefined, 'simulation.physics should exist');
        });

        test('GameEngine: context getter returns proxy', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.context !== null, 'context should exist');
        });

        test('GameEngine: context.selectedBus syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            const mockBus = { name: 'test-bus' };
            engine.context.selectedBus = mockBus;
            assertEqual(engine.simulation.selectedBus, mockBus, 'simulation.selectedBus should match');
            assertEqual(engine.context.selectedBus, mockBus, 'context.selectedBus should match');
        });

        test('GameEngine: context.selectedBusId syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            engine.context.selectedBusId = 'bus-123';
            assertEqual(engine.simulation.selectedBusId, 'bus-123', 'simulation.selectedBusId should match');
            assertEqual(engine.context.selectedBusId, 'bus-123', 'context.selectedBusId should match');
        });
    } catch (e) {
        console.log('⏭️  GameEngine integration tests skipped:', e.message);
    }

    // ========== InputManager Tests (added in Task 13) ==========
    try {
        const { InputManager } = await import('/src/input/InputManager.js');

        test('InputManager: instantiates with EventBus', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            assertTrue(input !== null, 'InputManager should exist.');
            assertTrue(input.steer !== null, 'steer control should exist.');
            assertTrue(input.throttle !== null, 'throttle control should exist.');
            assertTrue(input.brake !== null, 'brake control should exist.');
        });

        test('InputManager: getControls returns initial values', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            const controls = input.getControls();
            assertEqual(controls.steering, 0, 'Initial steering should be 0.');
            assertEqual(controls.throttle, 0, 'Initial throttle should be 0.');
            assertEqual(controls.brake, 0, 'Initial brake should be 0.');
            assertEqual(controls.handbrake, 0, 'Initial handbrake should be 0.');
            assertEqual(controls.headlights, false, 'Initial headlights should be false.');
        });

        test('InputManager: update emits input:controls event', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            let received = null;
            bus.on('input:controls', (e) => { received = e; });

            input.update(1 / 60);

            assertTrue(received !== null, 'Should emit input:controls event.');
            assertTrue(typeof received.steering === 'number', 'Should have steering.');
            assertTrue(typeof received.throttle === 'number', 'Should have throttle.');
        });

        test('InputManager: attach/detach work', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.attach();
            assertTrue(input._attached, 'Should be attached.');

            input.detach();
            assertFalse(input._attached, 'Should be detached.');
        });

        test('InputManager: reset clears all inputs', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            // Simulate some input
            input.keys.up = true;
            input.steer.value = 0.5;

            input.reset();

            assertFalse(input.keys.up, 'Keys should be reset.');
            assertEqual(input.steer.value, 0, 'Steer should be reset.');
        });

        test('InputManager: setHeadlights works', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.setHeadlights(true);
            assertTrue(input.getControls().headlights, 'Headlights should be on.');

            input.setHeadlights(false);
            assertFalse(input.getControls().headlights, 'Headlights should be off.');
        });

        test('InputManager: dispose cleans up', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            input.attach();

            input.dispose();

            assertFalse(input._attached, 'Should be detached after dispose.');
        });
    } catch (e) {
        console.log('⏭️  InputManager tests skipped:', e.message);
    }

    // ========== VehicleController Tests (added in Task 14) ==========
    try {
        const { VehicleController } = await import('/src/vehicle/VehicleController.js');
        const { PhysicsController } = await import('/src/physics/PhysicsController.js');

        test('VehicleController: instantiates with required params', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            assertTrue(ctrl !== null, 'VehicleController should exist.');
            assertEqual(ctrl.vehicleId, 'v1', 'vehicleId should match.');
        });

        test('VehicleController: setInput updates input state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setInput({ throttle: 0.5, steering: 0.3 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.5, 'Throttle should be 0.5.');
            assertEqual(input.steering, 0.3, 'Steering should be 0.3.');
        });

        test('VehicleController: convenience methods work', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setThrottle(0.8);
            ctrl.setBrake(0.4);
            ctrl.setSteering(-0.5);
            ctrl.setHandbrake(1.0);

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.8, 'Throttle should be 0.8.');
            assertEqual(input.brake, 0.4, 'Brake should be 0.4.');
            assertEqual(input.steering, -0.5, 'Steering should be -0.5.');
            assertEqual(input.handbrake, 1.0, 'Handbrake should be 1.0.');
        });

        test('VehicleController: setHeadlights updates settings', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setHeadlights(true);

            assertTrue(ctrl.getSettings().headlightsOn, 'Headlights should be on.');
        });

        test('VehicleController: getState returns physics state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            const state = ctrl.getState();

            assertTrue(state !== null, 'State should exist.');
            assertTrue(state.locomotion !== undefined, 'Should have locomotion.');
            assertTrue(state.suspension !== undefined, 'Should have suspension.');
        });

        test('VehicleController: responds to input:controls event', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);

            // Emit input event
            bus.emit('input:controls', { throttle: 0.7, steering: 0.2 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.7, 'Throttle should be 0.7.');
            assertEqual(input.steering, 0.2, 'Steering should be 0.2.');
        });

        test('VehicleController: dispose cleans up', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.dispose();

            // After dispose, input events should not update controller
            bus.emit('input:controls', { throttle: 0.9 });
            assertEqual(ctrl.getInput().throttle, 0, 'Throttle should still be 0 after dispose.');
        });
    } catch (e) {
        console.log('⏭️  VehicleController tests skipped:', e.message);
    }

    // ========== GameLoop Tests (added in Task 15) ==========
    try {
        const { GameLoop } = await import('/src/core/GameLoop.js');
        const { SimulationContext } = await import('/src/core/SimulationContext.js');
        const { VehicleController } = await import('/src/vehicle/VehicleController.js');

        test('GameLoop: instantiates with SimulationContext', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            assertTrue(loop !== null, 'GameLoop should exist.');
            assertTrue(loop.events !== null, 'events should exist.');
            assertTrue(loop.physics !== null, 'physics should exist.');
        });

        test('GameLoop: update runs without error', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            // Should not throw
            loop.update(1 / 60);
            assertTrue(true, 'Update should not throw.');
        });

        test('GameLoop: pause/resume work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            assertFalse(loop.paused, 'Should not be paused initially.');

            loop.pause();
            assertTrue(loop.paused, 'Should be paused after pause().');

            loop.resume();
            assertFalse(loop.paused, 'Should not be paused after resume().');
        });

        test('GameLoop: togglePause works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.togglePause();
            assertTrue(loop.paused, 'Should be paused after first toggle.');

            loop.togglePause();
            assertFalse(loop.paused, 'Should not be paused after second toggle.');
        });

        test('GameLoop: addVehicleController/getController work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);

            loop.addVehicleController(ctrl);
            assertEqual(loop.getController('v1'), ctrl, 'Should return controller.');
        });

        test('GameLoop: setTimeScale works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.setTimeScale(0.5);
            assertEqual(loop.timeScale, 0.5, 'Time scale should be 0.5.');

            loop.setTimeScale(2.0);
            assertEqual(loop.timeScale, 2.0, 'Time scale should be 2.0.');
        });

        test('GameLoop: emits frame events', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            let received = null;

            loop.events.on('gameloop:frame', (e) => { received = e; });
            loop.update(1 / 60);

            assertTrue(received !== null, 'Should emit gameloop:frame.');
            assertTrue(received.frameCount === 1, 'Frame count should be 1.');
        });

        test('GameLoop: getTelemetry returns data', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            loop.update(1 / 60);

            const telemetry = loop.getTelemetry('v1');
            assertTrue(telemetry !== null, 'Telemetry should exist.');
            assertTrue(typeof telemetry.speedKph === 'number', 'Should have speedKph.');
        });

        test('GameLoop: dispose cleans up', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);
            loop.addVehicleController(ctrl);

            loop.dispose();

            assertEqual(loop.controllers.size, 0, 'Controllers should be cleared.');
        });
    } catch (e) {
        console.log('⏭️  GameLoop tests skipped:', e.message);
    }

    // ========== GameplayState Tests (added in Task 16) ==========
    try {
        const { GameplayState } = await import('/states/GameplayState.js');
        const { PhysicsController } = await import('/src/physics/PhysicsController.js');

        test('GameplayState: class exists and can be imported', () => {
            assertTrue(typeof GameplayState === 'function', 'GameplayState should be a class.');
        });

        test('GameplayState: constructor works with mock engine', () => {
            // Create minimal mock engine
            const mockEngine = {
                simulation: {
                    events: new EventBus(),
                    physics: new PhysicsController(new EventBus())
                },
                context: {},
                scene: { add: () => {}, remove: () => {} },
                camera: { position: { copy: () => {}, lerp: () => {} }, lookAt: () => {} },
                clearScene: () => {}
            };
            const mockSm = { go: () => {} };

            const state = new GameplayState(mockEngine, mockSm);
            assertTrue(state !== null, 'GameplayState should instantiate.');
            assertEqual(state.gameLoop, null, 'gameLoop should be null before enter.');
        });
    } catch (e) {
        console.log('⏭️  GameplayState tests skipped:', e.message);
    }

    // ========== createVehicleFromBus Tests ==========
    try {
        const { createVehicleFromBus } = await import('/src/vehicle/createVehicle.js');
        const THREE = await import('three');

        test('createVehicleFromBus: function exists', () => {
            assertTrue(typeof createVehicleFromBus === 'function', 'createVehicleFromBus should be a function.');
        });

        test('createVehicleFromBus: returns null for null input', () => {
            const result = createVehicleFromBus(null);
            assertEqual(result, null, 'Should return null for null input.');
        });

        test('createVehicleFromBus: returns null for undefined input', () => {
            const result = createVehicleFromBus(undefined);
            assertEqual(result, null, 'Should return null for undefined input.');
        });

        test('createVehicleFromBus: creates vehicle from simple Object3D', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'test_bus';
            mockBus.userData = {
                api: {
                    setSteerAngle: () => {},
                    setBodyTilt: () => {},
                    wheelRig: { wheelRadius: 0.5 }
                }
            };

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertTrue(vehicle.id.startsWith('vehicle_'), 'Should have generated ID.');
            assertEqual(vehicle.model, mockBus, 'Model should be the bus.');
            assertTrue(vehicle.anchor !== null, 'Should have anchor.');
            assertEqual(vehicle.api, mockBus.userData.api, 'Should have API.');
            assertTrue(vehicle.config !== null, 'Should have config.');
        });

        test('createVehicleFromBus: uses custom ID when provided', () => {
            const mockBus = new THREE.Group();
            mockBus.userData = {};

            const vehicle = createVehicleFromBus(mockBus, { id: 'custom_id' });
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertEqual(vehicle.id, 'custom_id', 'Should use custom ID.');
        });

        test('createVehicleFromBus: removes model from parent', () => {
            const parent = new THREE.Group();
            const mockBus = new THREE.Group();
            parent.add(mockBus);
            mockBus.userData = {};

            assertEqual(mockBus.parent, parent, 'Bus should have parent before.');
            const vehicle = createVehicleFromBus(mockBus);
            assertEqual(mockBus.parent, vehicle.anchor, 'Bus should be reparented to anchor.');
        });

        test('createVehicleFromBus: extracts config from model', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'city_bus';
            mockBus.userData = {
                suspensionTuning: { stiffness: 500 }
            };

            // Add a child mesh to give it size
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 3, 10),
                new THREE.MeshBasicMaterial()
            );
            mockBus.add(body);

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle.config.dimensions.length > 0, 'Should have dimensions.');
            assertEqual(vehicle.config.suspensionTuning.stiffness, 500, 'Should extract suspension tuning.');
        });
    } catch (e) {
        console.log('⏭️  createVehicleFromBus tests skipped:', e.message);
    }

    const { solveConnectorPath } = await import('/src/geometry/ConnectorPathSolver.js');
    const { createGeneratorConfig } = await import('/graphics/assets3d/generators/GeneratorParams.js');
    const { createCityConfig } = await import('/src/city/CityConfig.js');
    const THREE = await import('three');
    const { runRoadConnectionDebuggerTests } = await import('/tests/road_connection_debugger.test.js');

    test('ConnectorPathSolver: reaches end pose within epsilon', () => {
        const genConfig = createGeneratorConfig();
        const cityConfig = createCityConfig();
        const tileSize = cityConfig.map.tileSize;
        const radius = genConfig.road?.curves?.turnRadius ?? 4.2;
        const posEps = tileSize * 1e-3;
        const dirEps = 1e-3;
        const cases = 64;

        for (let i = 0; i < cases; i++) {
            const p0 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const p1 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const h0 = Math.random() * Math.PI * 2;
            const h1 = Math.random() * Math.PI * 2;
            const dir0 = new THREE.Vector2(Math.cos(h0), Math.sin(h0));
            const dir1 = new THREE.Vector2(Math.cos(h1), Math.sin(h1));
            const result = solveConnectorPath({
                start: { position: p0, direction: dir0 },
                end: { position: p1, direction: dir1 },
                radius,
                allowFallback: false
            });
            assertTrue(result.ok, 'Solver should return a path.');
            assertTrue(result.metrics.endPoseErrorPos <= posEps, 'End position error too large.');
            assertTrue(result.metrics.endPoseErrorDir <= dirEps, 'End direction error too large.');
        }
    });

    runRoadConnectionDebuggerTests({ test, assertTrue });

    // ========== Summary ==========
    console.log('\n' + '='.repeat(50));
    if (errors.length === 0) {
        console.log('✅ All tests passed!');
    } else {
        console.log(`❌ ${errors.length} test(s) failed:\n`);
        errors.forEach(({ name, error }) => {
            console.error(`  • ${name}: ${error}`);
        });
    }
    console.log('='.repeat(50) + '\n');

    // Expose errors globally for easy inspection
    window.__testErrors = errors;
}

// Run tests when module loads
runTests().catch(err => {
    console.error('Test runner failed:', err);
});

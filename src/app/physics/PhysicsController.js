// src/app/physics/PhysicsController.js
// Facade over RapierVehicleSim; does not implement physics itself.
import { RapierVehicleSim } from './simulations/RapierVehicleSim.js';

export class PhysicsController extends RapierVehicleSim {}

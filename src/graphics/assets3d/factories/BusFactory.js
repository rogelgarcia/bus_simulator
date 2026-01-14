// src/graphics/assets3d/factories/BusFactory.js
// Creates bus models from catalog specs and ensures they expose a BusRig API.
import { createCityBus } from '../models/buses/CityBus.js';
import { createCoachBus } from '../models/buses/CoachBus.js';
import { createDoubleDeckerBus } from '../models/buses/DoubleDeckerBus.js';

import { attachBusRig } from '../../../app/rigs/buses/BusRig.js';

export function createBus(spec) {
    let bus;

    switch (spec.variant) {
        case 'city':
            bus = createCityBus(spec);
            break;
        case 'coach':
            bus = createCoachBus(spec);
            break;
        case 'double':
            bus = createDoubleDeckerBus(spec);
            break;
        default:
            bus = createCityBus(spec);
            break;
    }

    if (bus?.userData) {
        bus.userData.spec = spec;
    }

    if (!bus.userData?.bus) {
        attachBusRig(bus, {
            wheelRig: bus.userData?.wheelRig ?? null,
            parts: bus.userData?.parts ?? null
        });
    }

    return bus;
}

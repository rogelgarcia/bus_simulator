// src/graphics/assets3d/models/buses/components/WheelRig.js
export class WheelRig {
    constructor({ wheelRadius = 0.55 } = {}) {
        this.wheelRadius = wheelRadius;

        this.front = []; // { rollPivot, steerPivot, spinSign }
        this.rear  = []; // { rollPivot, spinSign }

        this._steerAngle = 0;
        this._steerAngleLeft = 0;
        this._steerAngleRight = 0;
        this._spinAngle = 0;

        // Global steering invert (applies to BOTH wheels)
        this.STEER_GLOBAL_SIGN = 1;
    }

    _getWheelRoot(rollPivot, steerPivot) {
        // createBusWheel(): root -> steerPivot -> rollPivot
        return steerPivot?.parent ?? rollPivot?.parent?.parent ?? null;
    }

    _isYawFlipped(wheelRoot) {
        if (!wheelRoot) return false;

        const y = wheelRoot.rotation?.y ?? 0;
        const twoPi = Math.PI * 2;
        const a = ((y % twoPi) + twoPi) % twoPi; // [0, 2π)
        const eps = 1e-2; // ~0.57°

        // Left wheels in this repo typically do: root.rotation.y = Math.PI
        if (Math.abs(a - Math.PI) < eps) return true;

        // Defensive: treat mirrored X as flipped too (rare)
        if (wheelRoot.scale && wheelRoot.scale.x < 0) return true;

        return false;
    }

    _inferSpinSign(rollPivot, steerPivot) {
        const wheelRoot = this._getWheelRoot(rollPivot, steerPivot);
        // If the wheel root is yaw-flipped, local +X axle becomes world -X,
        // so spin must invert to keep forward motion looking correct.
        return this._isYawFlipped(wheelRoot) ? -1 : 1;
    }

    addWheel({ rollPivot, steerPivot = null, isFront = false }) {
        const wheelRoot = this._getWheelRoot(rollPivot, steerPivot);
        const isLeft = this._isYawFlipped(wheelRoot);
        const spinSign = this._inferSpinSign(rollPivot, steerPivot);

        if (isFront) {
            const w = {
                rollPivot,
                steerPivot: steerPivot ?? null,
                spinSign,
                isLeft
            };
            this.front.push(w);

            // Apply current state to newly-added wheel
            if (w.steerPivot) {
                const steer = w.isLeft ? this._steerAngleLeft : this._steerAngleRight;
                w.steerPivot.rotation.y = steer * this.STEER_GLOBAL_SIGN;
            }
            w.rollPivot.rotation.x = this._spinAngle * w.spinSign;
            return;
        }

        const w = { rollPivot, spinSign };
        this.rear.push(w);

        // Apply current spin state
        w.rollPivot.rotation.x = this._spinAngle * w.spinSign;
    }

    setSteerAngle(rad) {
        this._steerAngle = rad ?? 0;
        this._steerAngleLeft = this._steerAngle;
        this._steerAngleRight = this._steerAngle;

        // ✅ Steering is the same sign for both sides.
        // Per-side steering inversion causes wheels to toe opposite directions.
        for (const w of this.front) {
            if (w.steerPivot) {
                w.steerPivot.rotation.y = this._steerAngle * this.STEER_GLOBAL_SIGN;
            }
        }
    }

    setSteerAngles(leftRad, rightRad) {
        this._steerAngleLeft = leftRad ?? 0;
        this._steerAngleRight = rightRad ?? 0;
        this._steerAngle = (this._steerAngleLeft + this._steerAngleRight) * 0.5;

        for (const w of this.front) {
            if (!w.steerPivot) continue;
            const steer = w.isLeft ? this._steerAngleLeft : this._steerAngleRight;
            w.steerPivot.rotation.y = steer * this.STEER_GLOBAL_SIGN;
        }
    }

    setSpinAngle(rad) {
        this._spinAngle = rad ?? 0;

        for (const w of this.front) w.rollPivot.rotation.x = this._spinAngle * w.spinSign;
        for (const w of this.rear)  w.rollPivot.rotation.x = this._spinAngle * w.spinSign;
    }

    addSpin(deltaRad) {
        this.setSpinAngle(this._spinAngle + (deltaRad ?? 0));
    }

    get steerAngle() { return this._steerAngle; }
    get spinAngle() { return this._spinAngle; }
}

// src/app/geometry/dubins/DubinsCurves.js
const EDUBOK = 0;
const EDUBCOCONFIGS = 1;
const EDUBPARAM = 2;
const EDUBBADRHO = 3;
const EDUBNOPATH = 4;

const EPSILON = 1e-9;

const SegmentType = Object.freeze({
  L_SEG: "L_SEG",
  S_SEG: "S_SEG",
  R_SEG: "R_SEG",
});

const DubinsPathType = Object.freeze({
  LSL: "LSL",
  LSR: "LSR",
  RSL: "RSL",
  RSR: "RSR",
  RLR: "RLR",
  LRL: "LRL",
});

const PATH_SEGMENTS = Object.freeze({
  [DubinsPathType.LSL]: [SegmentType.L_SEG, SegmentType.S_SEG, SegmentType.L_SEG],
  [DubinsPathType.LSR]: [SegmentType.L_SEG, SegmentType.S_SEG, SegmentType.R_SEG],
  [DubinsPathType.RSL]: [SegmentType.R_SEG, SegmentType.S_SEG, SegmentType.L_SEG],
  [DubinsPathType.RSR]: [SegmentType.R_SEG, SegmentType.S_SEG, SegmentType.R_SEG],
  [DubinsPathType.RLR]: [SegmentType.R_SEG, SegmentType.L_SEG, SegmentType.R_SEG],
  [DubinsPathType.LRL]: [SegmentType.L_SEG, SegmentType.R_SEG, SegmentType.L_SEG],
});

class DubinsPath {
  constructor(configStart, configEnd, rho, pathType) {
    this.configStart = [0, 0, 0];
    this.segmentLengths = [0, 0, 0];
    this.rho = 0;
    this.type = null;

    if (!configStart || !configEnd || rho === undefined) {
      return;
    }

    if (pathType) {
      dubinsPath(this, configStart, configEnd, rho, pathType);
    } else {
      dubinsShortestPath(this, configStart, configEnd, rho);
    }
  }

  getLength() {
    return dubinsPathLength(this);
  }

  getSegmentLength(segment) {
    return dubinsSegmentLength(this, segment);
  }

  getNormalisedSegmentLength(segment) {
    return dubinsSegmentLengthNormalized(this, segment);
  }

  getPathType() {
    return this.type;
  }

  sample(t) {
    const q = [0, 0, 0];
    dubinsPathSample(this, t, q);
    return q;
  }

  sampleMany(stepSize, callback) {
    return dubinsPathSampleMany(this, stepSize, callback);
  }

  getEndpoint() {
    const endpoint = [0, 0, 0];
    dubinsPathEndpoint(this, endpoint);
    return endpoint;
  }

  extractSubpath(t) {
    const extract = new DubinsPath();
    dubinsExtractSubpath(this, t, extract);
    return extract;
  }
}

function createIntermediateResults() {
  return {
    alpha: 0,
    beta: 0,
    d: 0,
    sa: 0,
    sb: 0,
    ca: 0,
    cb: 0,
    c_ab: 0,
    d_sq: 0,
  };
}

function dubinsShortestPath(path, q0, q1, rho) {
  const intermediate = createIntermediateResults();
  const params = [0, 0, 0];
  let bestWord = null;
  let errcode = dubinsIntermediateResults(intermediate, q0, q1, rho);
  if (errcode !== EDUBOK) {
    if (errcode === EDUBBADRHO) {
      path.type = null;
    }
    return errcode;
  }

  path.configStart[0] = q0[0];
  path.configStart[1] = q0[1];
  path.configStart[2] = q0[2];
  path.rho = rho;

  let bestCost = Number.POSITIVE_INFINITY;
  for (const pathType of Object.values(DubinsPathType)) {
    errcode = dubinsWord(intermediate, pathType, params);
    if (errcode === EDUBOK) {
      const cost = params[0] + params[1] + params[2];
      if (cost < bestCost) {
        bestWord = pathType;
        bestCost = cost;
        path.segmentLengths[0] = params[0];
        path.segmentLengths[1] = params[1];
        path.segmentLengths[2] = params[2];
        path.type = pathType;
      }
    }
  }
  if (!bestWord) {
    path.type = null;
    return EDUBNOPATH;
  }
  return EDUBOK;
}

function dubinsPath(path, q0, q1, rho, pathType) {
  const intermediate = createIntermediateResults();
  let errcode = dubinsIntermediateResults(intermediate, q0, q1, rho);
  if (errcode === EDUBOK) {
    const params = [0, 0, 0];
    errcode = dubinsWord(intermediate, pathType, params);
    if (errcode === EDUBOK) {
      path.segmentLengths[0] = params[0];
      path.segmentLengths[1] = params[1];
      path.segmentLengths[2] = params[2];
      path.configStart[0] = q0[0];
      path.configStart[1] = q0[1];
      path.configStart[2] = q0[2];
      path.rho = rho;
      path.type = pathType;
    } else {
      path.type = null;
    }
  } else {
    path.type = null;
  }
  return errcode;
}

function dubinsPathLength(path) {
  if (!path.type) {
    return 0;
  }
  let length = 0;
  length += path.segmentLengths[0];
  length += path.segmentLengths[1];
  length += path.segmentLengths[2];
  return length * path.rho;
}

function dubinsSegmentLength(path, index) {
  if (!path.type || index < 0 || index > 2) {
    return Number.MAX_VALUE;
  }
  return path.segmentLengths[index] * path.rho;
}

function dubinsSegmentLengthNormalized(path, index) {
  if (!path.type || index < 0 || index > 2) {
    return Number.MAX_VALUE;
  }
  return path.segmentLengths[index];
}

function dubinsPathSample(path, t, q) {
  if (!path.type) {
    if (q.length >= 3) {
      q[0] = path.configStart[0];
      q[1] = path.configStart[1];
      q[2] = path.configStart[2];
    }
    return EDUBNOPATH;
  }

  const pathLength = dubinsPathLength(path);
  if (t < -EPSILON || t > pathLength + EPSILON) {
    return EDUBPARAM;
  }
  t = Math.max(0, Math.min(t, pathLength));
  const tprime = t / path.rho;

  const qi = [0, 0, path.configStart[2]];
  const q1 = [0, 0, 0];
  const q2 = [0, 0, 0];
  const types = PATH_SEGMENTS[path.type];
  const p1 = path.segmentLengths[0];
  const p2 = path.segmentLengths[1];

  dubinsSegment(p1, qi, q1, types[0]);
  dubinsSegment(p2, q1, q2, types[1]);

  if (tprime < p1) {
    dubinsSegment(tprime, qi, q, types[0]);
  } else if (tprime < p1 + p2) {
    dubinsSegment(tprime - p1, q1, q, types[1]);
  } else {
    dubinsSegment(tprime - p1 - p2, q2, q, types[2]);
  }

  q[0] = q[0] * path.rho + path.configStart[0];
  q[1] = q[1] * path.rho + path.configStart[1];
  q[2] = mod2pi(q[2]);

  return EDUBOK;
}

function dubinsPathSampleMany(path, stepSize, callback) {
  if (!path.type) {
    return EDUBNOPATH;
  }
  if (stepSize <= 0) {
    return EDUBPARAM;
  }

  const q = [0, 0, 0];
  let x = 0;
  const length = dubinsPathLength(path);
  while (x <= length) {
    dubinsPathSample(path, x, q);
    const retcode = callback(q, x);
    if (retcode !== 0) {
      return retcode;
    }
    x += stepSize;
    if (x > length && x - stepSize < length - EPSILON) {
      dubinsPathSample(path, length, q);
      const finalRet = callback(q, length);
      if (finalRet !== 0) {
        return finalRet;
      }
    }
  }
  return 0;
}

function dubinsPathEndpoint(path, q) {
  if (!path.type) {
    if (q.length >= 3) {
      q[0] = path.configStart[0];
      q[1] = path.configStart[1];
      q[2] = path.configStart[2];
    }
    return EDUBNOPATH;
  }
  return dubinsPathSample(path, dubinsPathLength(path), q);
}

function dubinsExtractSubpath(path, t, newPath) {
  if (!path.type) {
    newPath.type = null;
    newPath.rho = path.rho;
    newPath.configStart[0] = path.configStart[0];
    newPath.configStart[1] = path.configStart[1];
    newPath.configStart[2] = path.configStart[2];
    newPath.segmentLengths[0] = 0;
    newPath.segmentLengths[1] = 0;
    newPath.segmentLengths[2] = 0;
    return EDUBNOPATH;
  }

  const pathLength = dubinsPathLength(path);
  if (t < -EPSILON || t > pathLength + EPSILON) {
    return EDUBPARAM;
  }
  t = Math.max(0, Math.min(t, pathLength));
  const tprime = t / path.rho;

  newPath.configStart[0] = path.configStart[0];
  newPath.configStart[1] = path.configStart[1];
  newPath.configStart[2] = path.configStart[2];
  newPath.rho = path.rho;
  newPath.type = path.type;

  newPath.segmentLengths[0] = Math.min(path.segmentLengths[0], tprime);
  newPath.segmentLengths[1] = Math.min(path.segmentLengths[1], tprime - newPath.segmentLengths[0]);
  newPath.segmentLengths[1] = Math.max(0, newPath.segmentLengths[1]);
  newPath.segmentLengths[2] = Math.min(
    path.segmentLengths[2],
    tprime - newPath.segmentLengths[0] - newPath.segmentLengths[1],
  );
  newPath.segmentLengths[2] = Math.max(0, newPath.segmentLengths[2]);

  return EDUBOK;
}

function dubinsIntermediateResults(intermediate, q0, q1, rho) {
  if (rho <= 0) {
    return EDUBBADRHO;
  }

  const dx = q1[0] - q0[0];
  const dy = q1[1] - q0[1];
  const D = Math.sqrt(dx * dx + dy * dy);
  const d = D / rho;

  let theta = 0;
  if (d > EPSILON) {
    theta = mod2pi(Math.atan2(dy, dx));
  }
  const alpha = mod2pi(q0[2] - theta);
  const beta = mod2pi(q1[2] - theta);

  intermediate.alpha = alpha;
  intermediate.beta = beta;
  intermediate.d = d;
  intermediate.sa = Math.sin(alpha);
  intermediate.sb = Math.sin(beta);
  intermediate.ca = Math.cos(alpha);
  intermediate.cb = Math.cos(beta);
  intermediate.c_ab = Math.cos(alpha - beta);
  intermediate.d_sq = d * d;

  return EDUBOK;
}

function dubinsWord(intermediate, pathType, out) {
  switch (pathType) {
    case DubinsPathType.LSL:
      return dubinsLSL(intermediate, out);
    case DubinsPathType.RSL:
      return dubinsRSL(intermediate, out);
    case DubinsPathType.LSR:
      return dubinsLSR(intermediate, out);
    case DubinsPathType.RSR:
      return dubinsRSR(intermediate, out);
    case DubinsPathType.LRL:
      return dubinsLRL(intermediate, out);
    case DubinsPathType.RLR:
      return dubinsRLR(intermediate, out);
    default:
      return EDUBNOPATH;
  }
}

function dubinsSegment(t, qi, qt, type) {
  const sinQi2 = Math.sin(qi[2]);
  const cosQi2 = Math.cos(qi[2]);
  if (type === SegmentType.L_SEG) {
    qt[0] = Math.sin(qi[2] + t) - sinQi2;
    qt[1] = -Math.cos(qi[2] + t) + cosQi2;
    qt[2] = t;
  } else if (type === SegmentType.R_SEG) {
    qt[0] = -Math.sin(qi[2] - t) + sinQi2;
    qt[1] = Math.cos(qi[2] - t) - cosQi2;
    qt[2] = -t;
  } else if (type === SegmentType.S_SEG) {
    qt[0] = cosQi2 * t;
    qt[1] = sinQi2 * t;
    qt[2] = 0;
  }
  qt[0] += qi[0];
  qt[1] += qi[1];
  qt[2] += qi[2];
}

function dubinsLSL(intermediate, out) {
  const tmp0 = intermediate.d + intermediate.sa - intermediate.sb;
  const p_sq =
    2 +
    intermediate.d_sq -
    2 * intermediate.c_ab +
    2 * intermediate.d * (intermediate.sa - intermediate.sb);

  if (p_sq >= 0) {
    const tmp1 = Math.atan2(intermediate.cb - intermediate.ca, tmp0);
    out[0] = mod2pi(tmp1 - intermediate.alpha);
    out[1] = Math.sqrt(p_sq);
    out[2] = mod2pi(intermediate.beta - tmp1);
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function dubinsRSR(intermediate, out) {
  const tmp0 = intermediate.d - intermediate.sa + intermediate.sb;
  const p_sq =
    2 +
    intermediate.d_sq -
    2 * intermediate.c_ab +
    2 * intermediate.d * (intermediate.sb - intermediate.sa);

  if (p_sq >= 0) {
    const tmp1 = Math.atan2(intermediate.ca - intermediate.cb, tmp0);
    out[0] = mod2pi(intermediate.alpha - tmp1);
    out[1] = Math.sqrt(p_sq);
    out[2] = mod2pi(tmp1 - intermediate.beta);
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function dubinsLSR(intermediate, out) {
  const p_sq =
    -2 +
    intermediate.d_sq +
    2 * intermediate.c_ab +
    2 * intermediate.d * (intermediate.sa + intermediate.sb);

  if (p_sq >= 0) {
    const p = Math.sqrt(p_sq);
    const tmp0 =
      Math.atan2(-intermediate.ca - intermediate.cb, intermediate.d + intermediate.sa + intermediate.sb) -
      Math.atan2(-2, p);
    out[0] = mod2pi(tmp0 - intermediate.alpha);
    out[1] = p;
    out[2] = mod2pi(tmp0 - mod2pi(intermediate.beta));
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function dubinsRSL(intermediate, out) {
  const p_sq =
    -2 +
    intermediate.d_sq +
    2 * intermediate.c_ab -
    2 * intermediate.d * (intermediate.sa + intermediate.sb);

  if (p_sq >= 0) {
    const p = Math.sqrt(p_sq);
    const tmp0 =
      Math.atan2(intermediate.ca + intermediate.cb, intermediate.d - intermediate.sa - intermediate.sb) -
      Math.atan2(2, p);
    out[0] = mod2pi(intermediate.alpha - tmp0);
    out[1] = p;
    out[2] = mod2pi(intermediate.beta - tmp0);
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function dubinsRLR(intermediate, out) {
  const tmp0 =
    (6 - intermediate.d_sq + 2 * intermediate.c_ab + 2 * intermediate.d * (intermediate.sa - intermediate.sb)) / 8;
  const phi = Math.atan2(intermediate.ca - intermediate.cb, intermediate.d - intermediate.sa + intermediate.sb);
  if (Math.abs(tmp0) <= 1) {
    const p = mod2pi(2 * Math.PI - Math.acos(tmp0));
    const t = mod2pi(intermediate.alpha - phi + mod2pi(p / 2));
    out[0] = t;
    out[1] = p;
    out[2] = mod2pi(intermediate.alpha - intermediate.beta - t + mod2pi(p));
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function dubinsLRL(intermediate, out) {
  const tmp0 =
    (6 - intermediate.d_sq + 2 * intermediate.c_ab + 2 * intermediate.d * (intermediate.sb - intermediate.sa)) / 8;
  const phi = Math.atan2(intermediate.ca - intermediate.cb, intermediate.d + intermediate.sa - intermediate.sb);
  if (Math.abs(tmp0) <= 1) {
    const p = mod2pi(2 * Math.PI - Math.acos(tmp0));
    const t = mod2pi(-intermediate.alpha - phi + p / 2);
    out[0] = t;
    out[1] = p;
    out[2] = mod2pi(mod2pi(intermediate.beta) - intermediate.alpha - t + mod2pi(p));
    return EDUBOK;
  }
  return EDUBNOPATH;
}

function floorMod(x, y) {
  let r = x % y;
  if (r < 0) {
    r += y;
  }
  return r;
}

function mod2pi(theta) {
  return floorMod(theta, 2 * Math.PI);
}

export { DubinsPath, DubinsPathType, SegmentType };

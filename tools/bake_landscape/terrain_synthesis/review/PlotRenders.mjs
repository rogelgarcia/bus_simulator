// Renders profile and histogram plots and composes labeled review sheets with the deterministic raster toolkit.
// @ts-check
// Plots use "nice" 1/2/5 tick steps, the embedded bitmap font and a fixed series palette; a profile plot with a declared vertical
// exaggeration derives its plot height from the data ranges (vertical pixels per meter = exaggeration x horizontal pixels per meter)
// so the stated exaggeration is exact, otherwise it fits the requested height. composeSheet lays images into a grid with one label per
// cell, which is how [reference | before | after] composites and multi-map sheets are produced.
import { blit, createCanvas, drawLine, drawText, fillRect, niceStep, rgbOf, strokeRect, textHeight, textWidth, tickLabel } from './RasterCanvas.mjs';

export const SERIES_COLORS = Object.freeze(['#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b', '#17becf', '#7f7f7f'].map(rgbOf));
const INK = rgbOf('#202020'), GRID_LINE = rgbOf('#dcdcd4'), AXIS = rgbOf('#404040'), SEA = rgbOf('#3b7dd8'), PAPER = rgbOf('#ffffff'), SHEET = rgbOf('#ecece6');
const MARGIN = Object.freeze({ left: 78, right: 24, top: 44, bottom: 56 });

function axes(canvas, plot, xRange, yRange, labels) {
    const { left, top, width, height } = plot, xScale = width / (xRange.max - xRange.min), yScale = height / (yRange.max - yRange.min);
    const toX = value => left + (value - xRange.min) * xScale, toY = value => top + height - (value - yRange.min) * yScale;
    const xStep = niceStep(xRange.max - xRange.min, Math.max(2, Math.floor(width / 120))), yStep = niceStep(yRange.max - yRange.min, Math.max(2, Math.floor(height / 60)));
    for (let value = Math.ceil(xRange.min / xStep) * xStep; value <= xRange.max + 1e-9; value += xStep) {
        const x = Math.round(toX(value)), label = tickLabel(value, xStep);
        drawLine(canvas, x, top, x, top + height, GRID_LINE); drawLine(canvas, x, top + height, x, top + height + 5, AXIS);
        drawText(canvas, x - textWidth(label, 2) / 2, top + height + 9, label, INK, 2);
    }
    for (let value = Math.ceil(yRange.min / yStep) * yStep; value <= yRange.max + 1e-9; value += yStep) {
        const y = Math.round(toY(value)), label = tickLabel(value, yStep);
        drawLine(canvas, left, y, left + width, y, GRID_LINE); drawLine(canvas, left - 5, y, left, y, AXIS);
        drawText(canvas, left - 9 - textWidth(label, 2), y - textHeight(2) / 2, label, INK, 2);
    }
    strokeRect(canvas, left, top, width, height, AXIS);
    if (labels.x) drawText(canvas, left + width / 2 - textWidth(labels.x, 2) / 2, top + height + 30, labels.x, INK, 2);
    if (labels.title) drawText(canvas, 8, 8, labels.title, INK, 2);
    if (labels.y) drawText(canvas, 8, top - 18, labels.y, INK, 2);
    return { toX, toY };
}

const legendWidth = entries => entries.reduce((sum, entry) => sum + 24 + textWidth(entry.label, 2) + 20, 0);

function legendBox(canvas, x, y, entries) {
    let cursor = x;
    for (const { label, color } of entries) {
        fillRect(canvas, cursor, y + 3, 18, 8, color);
        cursor += 24;
        cursor += drawText(canvas, cursor, y, label, INK, 2) + 20;
    }
}

/**
 * @param {{series:{label:string,distance:ArrayLike<number>,height:ArrayLike<number>,color?:string}[],verticalExaggeration?:number|null,title?:string,width?:number,height?:number,seaLevel?:number|null,xLabel?:string,yLabel?:string,markers?:{distance:number,label:string}[],yRange?:{min:number,max:number}}} options
 */
export function renderProfilePlot({ series, verticalExaggeration = null, title = '', width = 1600, height = 520, seaLevel = 0, xLabel = 'distance (m)', yLabel = 'height (m)', markers = [], yRange }) {
    if (!Array.isArray(series) || !series.length) throw new Error('[SynthesisReview] renderProfilePlot needs at least one series');
    let xMin = 0, xMax = 0, yMin = Infinity, yMax = -Infinity;
    for (const entry of series) {
        if (!entry.distance?.length || entry.distance.length !== entry.height.length) throw new Error(`[SynthesisReview] Series ${entry.label} needs matching distance/height arrays`);
        for (let i = 0; i < entry.distance.length; i++) { xMin = Math.min(xMin, entry.distance[i]); xMax = Math.max(xMax, entry.distance[i]); yMin = Math.min(yMin, entry.height[i]); yMax = Math.max(yMax, entry.height[i]); }
    }
    if (seaLevel !== null) { yMin = Math.min(yMin, seaLevel); yMax = Math.max(yMax, seaLevel); }
    const range = yRange ?? { min: Math.floor(yMin - 1), max: Math.ceil(yMax + 1) }, plotWidth = width - MARGIN.left - MARGIN.right, span = xMax - xMin;
    if (!(span > 0)) throw new Error('[SynthesisReview] Profile distances must span a positive range');
    let plotHeight = height - MARGIN.top - MARGIN.bottom;
    if (verticalExaggeration !== null) {
        if (!(verticalExaggeration > 0)) throw new Error('[SynthesisReview] verticalExaggeration must be positive or null');
        plotHeight = Math.min(4000, Math.max(80, Math.round((range.max - range.min) * verticalExaggeration * plotWidth / span)));
    }
    const canvas = createCanvas(width, plotHeight + MARGIN.top + MARGIN.bottom, PAPER), plot = { left: MARGIN.left, top: MARGIN.top, width: plotWidth, height: plotHeight };
    const { toX, toY } = axes(canvas, plot, { min: xMin, max: xMax }, range, { x: xLabel, y: yLabel, title: verticalExaggeration !== null ? `${title}  (vertical exaggeration ${verticalExaggeration}x)` : title });
    if (seaLevel !== null) drawLine(canvas, toX(xMin), toY(seaLevel), toX(xMax), toY(seaLevel), SEA);
    markers.forEach((marker, index) => {
        const x = Math.round(toX(marker.distance));
        drawLine(canvas, x, plot.top, x, plot.top + plot.height, rgbOf('#a0a0a0'));
        drawText(canvas, x + 3, plot.top + 4 + (index % 2) * 10, marker.label, INK, 1);
    });
    series.forEach((entry, index) => {
        const color = entry.color ? rgbOf(entry.color) : SERIES_COLORS[index % SERIES_COLORS.length];
        for (let i = 1; i < entry.distance.length; i++) drawLine(canvas, toX(entry.distance[i - 1]), toY(entry.height[i - 1]), toX(entry.distance[i]), toY(entry.height[i]), color, 2);
    });
    const entries = series.map((entry, index) => ({ label: entry.label, color: entry.color ? rgbOf(entry.color) : SERIES_COLORS[index % SERIES_COLORS.length] }));
    legendBox(canvas, Math.max(plot.left + 10, plot.left + plot.width - legendWidth(entries) - 10), plot.top + 6, entries);
    return canvas;
}

/**
 * Grouped bar chart; values are fractions (0..1) when `percent` is true, otherwise counts.
 * @param {{bins:string[],series:{label:string,values:ArrayLike<number>,color?:string}[],title?:string,width?:number,height?:number,percent?:boolean,yLabel?:string}} options
 */
export function renderHistogramPlot({ bins, series, title = '', width = 1200, height = 520, percent = true, yLabel }) {
    if (!Array.isArray(bins) || !bins.length || !Array.isArray(series) || !series.length) throw new Error('[SynthesisReview] renderHistogramPlot needs bins and series');
    let yMax = 0;
    for (const entry of series) { if (entry.values.length !== bins.length) throw new Error(`[SynthesisReview] Series ${entry.label} must hold one value per bin`); for (const value of entry.values) yMax = Math.max(yMax, percent ? value * 100 : value); }
    const canvas = createCanvas(width, height, PAPER), plot = { left: MARGIN.left, top: MARGIN.top, width: width - MARGIN.left - MARGIN.right, height: height - MARGIN.top - MARGIN.bottom };
    const top = yMax > 0 ? niceStep(yMax, 5) * Math.ceil(yMax / niceStep(yMax, 5)) : 1;
    const yScale = plot.height / top, toY = value => plot.top + plot.height - value * yScale, yStep = niceStep(top, 5);
    for (let value = 0; value <= top + 1e-9; value += yStep) {
        const y = Math.round(toY(value)), label = tickLabel(value, yStep) + (percent ? '%' : '');
        drawLine(canvas, plot.left, y, plot.left + plot.width, y, GRID_LINE); drawText(canvas, plot.left - 9 - textWidth(label, 2), y - textHeight(2) / 2, label, INK, 2);
    }
    const group = plot.width / bins.length, bar = Math.max(2, Math.floor((group * .8) / series.length));
    bins.forEach((bin, b) => {
        series.forEach((entry, s) => {
            const value = percent ? entry.values[b] * 100 : entry.values[b], x = Math.round(plot.left + b * group + group * .1 + s * bar), y = Math.round(toY(value));
            fillRect(canvas, x, y, bar - 1, plot.top + plot.height - y, entry.color ? rgbOf(entry.color) : SERIES_COLORS[s % SERIES_COLORS.length]);
            const label = percent ? `${value.toFixed(value >= 10 ? 0 : 1)}` : String(value);
            drawText(canvas, x + bar / 2 - textWidth(label, 1) / 2, y - 10, label, INK, 1);
        });
        drawText(canvas, plot.left + b * group + group / 2 - textWidth(bin, 2) / 2, plot.top + plot.height + 9, bin, INK, 2);
    });
    strokeRect(canvas, plot.left, plot.top, plot.width, plot.height, AXIS);
    drawText(canvas, 8, 8, title, INK, 2);
    drawText(canvas, 8, plot.top - 18, yLabel ?? (percent ? 'share of samples' : 'samples'), INK, 2);
    const entries = series.map((entry, s) => ({ label: entry.label, color: entry.color ? rgbOf(entry.color) : SERIES_COLORS[s % SERIES_COLORS.length] }));
    legendBox(canvas, Math.max(plot.left + 10, plot.left + plot.width - legendWidth(entries) - 10), plot.top + 8, entries);
    return canvas;
}

/**
 * @param {{image:import('./RasterCanvas.mjs').ReviewImage,label:string}[]} entries
 * @param {{columns?:number,gap?:number,labelHeight?:number,textScale?:number}} [options]
 */
export function composeSheet(entries, { columns = entries.length, gap = 16, labelHeight = 28, textScale = 2 } = {}) {
    if (!Array.isArray(entries) || !entries.length || entries.some(entry => !entry.image || typeof entry.label !== 'string')) throw new Error('[SynthesisReview] composeSheet needs {image, label} entries');
    if (!Number.isInteger(columns) || columns < 1) throw new Error('[SynthesisReview] columns must be a positive integer');
    const cellWidth = Math.max(...entries.map(entry => entry.image.width)), cellHeight = Math.max(...entries.map(entry => entry.image.height)), rows = Math.ceil(entries.length / columns);
    const canvas = createCanvas(gap + columns * (cellWidth + gap), gap + rows * (cellHeight + labelHeight + gap), SHEET);
    entries.forEach((entry, index) => {
        const column = index % columns, row = Math.floor(index / columns), x = gap + column * (cellWidth + gap), y = gap + row * (cellHeight + labelHeight + gap);
        drawText(canvas, x, y + Math.max(0, (labelHeight - textHeight(textScale)) / 2), entry.label, INK, textScale);
        blit(canvas, entry.image, x, y + labelHeight);
    });
    return canvas;
}

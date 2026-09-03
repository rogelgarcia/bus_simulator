// Pure single-range parser shared by the headless repository server tests.

/**
 * @param {string | string[] | undefined} header
 * @param {number} size
 * @returns {null | Readonly<{satisfiable: false}> | Readonly<{
 *   satisfiable: true,
 *   start: number,
 *   end: number,
 *   length: number
 * }>}
 */
export function parseSingleByteRange(header, size) {
    if (header === undefined) return null;
    if (!Number.isSafeInteger(size) || size < 0 || Array.isArray(header)) {
        return Object.freeze({satisfiable: false});
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!match || (match[1] === '' && match[2] === '') || size === 0) {
        return Object.freeze({satisfiable: false});
    }

    let start;
    let end;
    if (match[1] === '') {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return Object.freeze({satisfiable: false});
        }
        start = Math.max(0, size - suffixLength);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? size - 1 : Number(match[2]);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
            || start < 0 || end < start || start >= size) {
            return Object.freeze({satisfiable: false});
        }
        end = Math.min(end, size - 1);
    }
    return Object.freeze({
        satisfiable: true,
        start,
        end,
        length: end - start + 1
    });
}

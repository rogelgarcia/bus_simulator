// src/app/buildings/BeltCourseColor.js
export const BELT_COURSE_COLOR = Object.freeze({
    OFFWHITE: 'offwhite',
    BEIGE: 'beige',
    ORANGE: 'orange',
    BROWN: 'brown',
    GREEN_TINT: 'green_tint',
    BLUE_TINT: 'blue_tint'
});

export function isBeltCourseColor(value) {
    if (typeof value !== 'string') return false;
    return value === BELT_COURSE_COLOR.OFFWHITE
        || value === BELT_COURSE_COLOR.BEIGE
        || value === BELT_COURSE_COLOR.ORANGE
        || value === BELT_COURSE_COLOR.BROWN
        || value === BELT_COURSE_COLOR.GREEN_TINT
        || value === BELT_COURSE_COLOR.BLUE_TINT;
}

export function resolveBeltCourseColorLabel(colorId) {
    const id = isBeltCourseColor(colorId) ? colorId : BELT_COURSE_COLOR.OFFWHITE;
    if (id === BELT_COURSE_COLOR.OFFWHITE) return 'Off-white';
    if (id === BELT_COURSE_COLOR.BEIGE) return 'Beige';
    if (id === BELT_COURSE_COLOR.ORANGE) return 'Orange';
    if (id === BELT_COURSE_COLOR.BROWN) return 'Brown';
    if (id === BELT_COURSE_COLOR.GREEN_TINT) return 'Green tint';
    if (id === BELT_COURSE_COLOR.BLUE_TINT) return 'Blue tint';
    return 'Off-white';
}

export function resolveBeltCourseColorHex(colorId) {
    const id = isBeltCourseColor(colorId) ? colorId : BELT_COURSE_COLOR.OFFWHITE;
    if (id === BELT_COURSE_COLOR.OFFWHITE) return 0xf2f2f2;
    if (id === BELT_COURSE_COLOR.BEIGE) return 0xe7d8bf;
    if (id === BELT_COURSE_COLOR.ORANGE) return 0xd58a3a;
    if (id === BELT_COURSE_COLOR.BROWN) return 0x8b5a3c;
    if (id === BELT_COURSE_COLOR.GREEN_TINT) return 0xa8c8b0;
    if (id === BELT_COURSE_COLOR.BLUE_TINT) return 0xa6bed6;
    return 0xf2f2f2;
}

export function getBeltCourseColorOptions() {
    const ids = [
        BELT_COURSE_COLOR.OFFWHITE,
        BELT_COURSE_COLOR.BEIGE,
        BELT_COURSE_COLOR.ORANGE,
        BELT_COURSE_COLOR.BROWN,
        BELT_COURSE_COLOR.GREEN_TINT,
        BELT_COURSE_COLOR.BLUE_TINT
    ];
    return ids.map((id) => ({
        id,
        label: resolveBeltCourseColorLabel(id),
        hex: resolveBeltCourseColorHex(id)
    }));
}

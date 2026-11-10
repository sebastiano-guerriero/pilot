/** Preact 11 no longer appends `px` to numeric style values: always pass strings. */
export const px = (n: number): string => `${n}px`;

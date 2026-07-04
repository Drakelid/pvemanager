// @fontsource-variable/* packages ship CSS with no type declarations, so a
// bare side-effect import isn't matched by Vite's `*.css` module glob. Declare
// them as typeless modules to satisfy `tsc` (see main.tsx font imports).
declare module '@fontsource-variable/dm-sans';
declare module '@fontsource-variable/jetbrains-mono';

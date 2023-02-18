const typescript =require( '@rollup/plugin-typescript');
const commonjs =require( '@rollup/plugin-commonjs');
const json =require( '@rollup/plugin-json');
const excludeDependenciesFromBundle = require( "rollup-plugin-exclude-dependencies-from-bundle");

module.exports = {
    input: 'src/app.ts',
    output: {
        dir: 'dist',
        format: 'cjs'
    },
    plugins: [
        typescript(),
        commonjs({
            requireReturnsDefault: 'auto',
        }),
        json(),
        excludeDependenciesFromBundle()
    ]
};
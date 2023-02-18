import {cosmiconfig, cosmiconfigSync} from 'cosmiconfig';

const explorerSync = cosmiconfigSync('deadliner');
export const config = explorerSync.search();

if (config === null) {
    console.error('Config load failed')
    process.exit(1)
}
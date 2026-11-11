import {configDefaults,defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{exclude:[...configDefaults.exclude,'.paper/**','output/**','.wrangler/**']}});

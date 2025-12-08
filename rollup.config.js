/**
 * Copyright IBM Corp. 2021, 2025
 * SPDX-License-Identifier: MPL-2.0
 */

// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'

const config = {
  input: 'src/index.js',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [commonjs(), nodeResolve({ preferBuiltins: true }), json()]
}

export default config

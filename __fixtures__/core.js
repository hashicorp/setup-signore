/**
 * This file is used to mock the `@actions/core` module in tests.
 */
import { jest } from '@jest/globals'
import * as core from '@actions/core'

export const debug = core.debug
export const error = core.error
export const info = core.info
export const getInput = jest.fn()
export const setOutput = jest.fn()
export const setFailed = jest.fn()
export const warning = jest.fn()
export const addPath = jest.fn()

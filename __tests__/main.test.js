/**
 * Copyright IBM Corp. 2021, 2025
 * SPDX-License-Identifier: MPL-2.0
 */

/**
 * Unit tests for the action's main functionality, src/main.js
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

const { run } = await import('../src/main.js')

import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path, { dirname } from 'node:path'

const relativeConfigPath = '.signore/config.yaml'
const mockRelease = {
  assets: [
    {
      id: 1,
      name: 'signore_0.1.3_darwin_x86_64.tar.gz',
      url: 'https://api.github.com/repos/hashicorp/signore/releases/assets/1'
    },
    {
      id: 2,
      name: 'signore_0.1.3_linux_x86_64.tar.gz',
      url: 'https://api.github.com/repos/hashicorp/signore/releases/assets/2'
    },
    {
      id: 3,
      name: 'signore_0.1.3_windows_x86_64.zip',
      url: 'https://api.github.com/repos/hashicorp/signore/releases/assets/3'
    }
  ],
  id: '1',
  name: 'v0.1.3',
  tag_name: 'v0.1.3'
}

import nock from 'nock'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

beforeAll(() => {
  nock.disableNetConnect()
})

beforeEach(() => {
  const spyOsArch = jest.spyOn(os, 'arch')
  spyOsArch.mockReturnValue('x64')
  const spyOsPlatform = jest.spyOn(os, 'platform')
  spyOsPlatform.mockReturnValue('win32')
})

afterEach(() => {
  jest.resetAllMocks()
  nock.cleanAll()
})

describe('main.js', () => {
  test('installs latest version', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('latest')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/latest')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })
    const spyCoreAddPath = jest.spyOn(core, 'addPath')
    const spyCoreSetOutput = jest.spyOn(core, 'setOutput')

    fs.mkdtemp(
      path.join(os.tmpdir(), 'setup-signore-'),
      async (err, directory) => {
        if (err) throw err

        process.env.RUNNER_TEMP = directory
        const spyOsHomedir = jest.spyOn(os, 'homedir')
        spyOsHomedir.mockReturnValue(directory)
      }
    )

    const { run } = await import('../src/main.js')
    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()
      expect(spyCoreAddPath).toHaveBeenCalled()
      expect(spyCoreSetOutput).toHaveBeenCalledWith('version', 'v0.1.3')
    })
  })

  test('installs configured version', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('v0.1.3')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })
    const spyCoreAddPath = jest.spyOn(core, 'addPath')
    const spyCoreSetOutput = jest.spyOn(core, 'setOutput')

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-signore-'))
    process.env.RUNNER_TEMP = directory
    const spyOsHomedir = jest.spyOn(os, 'homedir')
    spyOsHomedir.mockReturnValue(directory)

    const { run } = await import('../src/main.js')
    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()
      expect(spyCoreAddPath).toHaveBeenCalled()
      expect(spyCoreSetOutput).toHaveBeenCalledWith('version', 'v0.1.3')
    })
  })

  test('configures signer', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('testsigner')
      .mockReturnValueOnce('v0.1.3')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-signore-'))
    process.env.RUNNER_TEMP = directory
    const spyOsHomedir = jest.spyOn(os, 'homedir')
    spyOsHomedir.mockReturnValue(directory)

    const { run } = await import('../src/main.js')
    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()

      const config = fs.readFileSync(
        path.resolve(directory, relativeConfigPath),
        { encoding: 'utf8' }
      )
      expect(config).toEqual('signer: testsigner\n')
    })
  })

  test('retries transient errors', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('v0.1.3')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(500, 'expected transient error')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-signore-'))
    process.env.RUNNER_TEMP = directory
    const spyOsHomedir = jest.spyOn(os, 'homedir')
    spyOsHomedir.mockReturnValue(directory)

    const { run } = await import('../src/main.js')
    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()
    })
  })

  test('retries secondary rate limit errors', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('v0.1.3')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(
        403,
        {
          message:
            'You have exceeded a secondary rate limit and have been temporarily blocked from content creation. Please retry your request again later.',
          documentation_url:
            'https://docs.github.com/rest/overview/resources-in-the-rest-api#abuse-rate-limits'
        },
        { 'Retry-After': '1' }
      )
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-signore-'))
    process.env.RUNNER_TEMP = directory
    const spyOsHomedir = jest.spyOn(os, 'homedir')
    spyOsHomedir.mockReturnValue(directory)

    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()
    })
  })

  test('retries rate limit errors', async () => {
    core.getInput
      .mockReturnValueOnce(
        '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'
      )
      .mockReturnValueOnce('testtoken')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('v0.1.3')

    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(429, 'expected rate limit error', {
        'Retry-After': '1'
      })
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), {
        'content-type': 'application/octet-stream'
      })

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-signore-'))
    process.env.RUNNER_TEMP = directory
    const spyOsHomedir = jest.spyOn(os, 'homedir')
    spyOsHomedir.mockReturnValue(directory)

    const { run } = await import('../src/main.js')
    return run().then(() => {
      expect(scope.isDone()).toBeTruthy()
    })
  })
})

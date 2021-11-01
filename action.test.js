const fs = require('fs')
const nock = require('nock')
const path = require('path')
const os = require('os')

const core = require('@actions/core')

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

beforeAll(() => {
  nock.disableNetConnect()
})

beforeEach(() => {
  process.env['INPUT_GITHUB-TOKEN'] = 'testtoken'
  delete process.env.INPUT_SIGNER
  process.env.INPUT_VERSION = 'latest'
  process.env['INPUT_VERSION-CHECKSUM'] = '5663389ef1a8ec48af6ca622e66bf0f54ba8f22c127f14cb8a3f429e40868582'

  const spyOsArch = jest.spyOn(os, 'arch')
  spyOsArch.mockReturnValue('x64')
  const spyOsPlatform = jest.spyOn(os, 'platform')
  spyOsPlatform.mockReturnValue('win32')
})

describe('action', () => {
  test('installs latest version', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/latest')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })
    const spyCoreAddPath = jest.spyOn(core, 'addPath')
    const spyCoreSetOutput = jest.spyOn(core, 'setOutput')

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()
      expect(spyCoreAddPath).toHaveBeenCalled()
      expect(spyCoreSetOutput).toHaveBeenCalledWith('version', 'v0.1.3')
      done()
    })
  })

  test('installs configured version', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })
    const spyCoreAddPath = jest.spyOn(core, 'addPath')
    const spyCoreSetOutput = jest.spyOn(core, 'setOutput')

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.INPUT_VERSION = 'v0.1.3'
      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()
      expect(spyCoreAddPath).toHaveBeenCalled()
      expect(spyCoreSetOutput).toHaveBeenCalledWith('version', 'v0.1.3')
      done()
    })
  })

  test('configures signer', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.INPUT_SIGNER = 'testsigner'
      process.env.INPUT_VERSION = 'v0.1.3'
      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()

      const config = fs.readFileSync(path.resolve(directory, relativeConfigPath), { encoding: 'utf8' })
      expect(config).toEqual('signer: testsigner\n')
      done()
    })
  })

  test('retries transient errors', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(500, 'expected transient error')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.INPUT_VERSION = 'v0.1.3'
      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()
      done()
    })
  })

  test('retries abuse limit errors', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(403, {
        message: 'You have triggered an abuse detection mechanism and have been temporarily blocked from content creation. Please retry your request again later.',
        documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#abuse-rate-limits'
      })
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.INPUT_VERSION = 'v0.1.3'
      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()
      done()
    })
  })

  test('retries rate limit errors', (done) => {
    const scope = nock('https://api.github.com')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(429, 'expected rate limit error')
      .get('/repos/hashicorp/signore/releases/tags/v0.1.3')
      .reply(200, mockRelease)
      .get('/repos/hashicorp/signore/releases/assets/3')
      .replyWithFile(200, path.resolve(__dirname, 'test.zip'), { 'content-type': 'application/octet-stream' })

    fs.mkdtemp(path.join(os.tmpdir(), 'setup-signore-'), async (err, directory) => {
      if (err) throw err

      process.env.INPUT_VERSION = 'v0.1.3'
      process.env.RUNNER_TEMP = directory

      const spyOsHomedir = jest.spyOn(os, 'homedir')
      spyOsHomedir.mockReturnValue(directory)

      const action = require('./action')
      await expect(await action()).resolves
      expect(scope.isDone()).toBeTruthy()
      done()
    })
  })
})

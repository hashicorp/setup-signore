'use strict'

const fs = require('fs').promises
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const compareVersions = require('compare-versions')

const core = require('@actions/core')
const tc = require('@actions/tool-cache')
const github = require('@actions/github')

const owner = 'hashicorp'
const repo = 'signore'

// copied from setup-terraform
// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [x86_64, 386, arm]
function mapArch (arch) {
  const mappings = {
    x32: '386',
    x64: 'x86_64'
  }
  return mappings[arch] || arch
}

// copied from setup-terraform
// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS (os) {
  const mappings = {
    win32: 'windows'
  }
  return mappings[os] || os
}

async function run () {
  try {
    const githubToken = core.getInput('github_token')
    const clientID = core.getInput('client_id')
    const clientSecret = core.getInput('client_secret')
    const version = core.getInput('version')
    const expectedArchiveChecksum = core.getInput('archive_checksum')

    const platform = mapOS(os.platform())
    const arch = mapArch(os.arch())

    // windows binaries are zipped
    const archiveSuffix = platform === 'windows' ? '.zip' : '.tar.gz'

    const octokit = github.getOctokit(githubToken || process.env.GITHUB_TOKEN)

    // get all releases
    const releases = await octokit.paginate(octokit.rest.repos.listReleases, { owner, repo })

    // if we don't have a specific version, sort releases by
    let releaseToDownload
    if (version === 'latest' || !version) {
      releases.sort((a, b) => compareVersions(a.tag_name, b.tag_name))
      releaseToDownload = releases[releases.length - 1]
    } else {
      releaseToDownload = releases.filter(release => release.tag_name === version)[0]
    }
    const versionToDownload = releaseToDownload.tag_name

    // i.e. signore_0.1.2_darwin_x86_64.tar.gz
    const expectedAssetName = repo + '_' + versionToDownload.replace('v', '') + '_' + platform + '_' + arch + archiveSuffix
    const assetToDownload = releaseToDownload.assets.filter(asset => asset.name === expectedAssetName)[0]
    core.setOutput('version', versionToDownload)

    const url = assetToDownload.url
    const auth = 'token ' + (githubToken || process.env.GITHUB_TOKEN)

    core.debug(`Downloading ${repo} release from ${url}`)
    const downloadedTar = await tc.downloadTool(url, undefined, auth, { accept: 'application/octet-stream' })

    if (expectedArchiveChecksum !== '') {
      const downloadedArchiveChecksum = crypto.createHash('sha256').update(await fs.readFile(downloadedTar)).digest('hex')
      if (expectedArchiveChecksum !== downloadedArchiveChecksum) {
        throw new Error(`Checksum mismatch: ${downloadedArchiveChecksum} does not match expected checksum ${expectedArchiveChecksum}`)
      }
    }

    core.debug(`Extracting ${repo} release`)
    const pathToCLI = await tc.extractTar(downloadedTar)
    core.debug(`${repo} CLI path is ${pathToCLI}.`)

    if (!downloadedTar || !pathToCLI) {
      throw new Error(`Unable to download ${repo} from ${url}`)
    }

    core.addPath(pathToCLI)

    if (clientID || clientSecret) {
      core.debug('writing signore config file')
      let configContent = ''
      configContent += clientID ? `clientID: ${clientID}\n` : ''
      configContent += clientSecret ? `clientSecret: ${clientSecret}\n` : ''
      fs.writeFile(path.join(os.homedir(), '.signore', 'config.yaml'), configContent)
    }

    core.debug('success: signore has been set up!')
  } catch (error) {
    core.setFailed(error.message)
  }
}

(async () => {
  await run()
})()

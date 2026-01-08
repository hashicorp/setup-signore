/**
 * Copyright IBM Corp. 2021, 2025
 * SPDX-License-Identifier: MPL-2.0
 */

'use strict'

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

import * as core from '@actions/core'
import tc from '@actions/tool-cache'

import octokit from './octokit.js'

const owner = 'hashicorp'
const repo = 'signore'

// adapted from setup-terraform
// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [x86_64, 386, arm]
function mapArch(arch) {
  const mappings = {
    x32: '386',
    x64: 'x86_64'
  }
  return mappings[arch] || arch
}

// adapted from setup-terraform
// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS(os) {
  const mappings = {
    win32: 'windows'
  }
  return mappings[os] || os
}

export async function run() {
  try {
    const expectedArchiveChecksum = core.getInput('archive-checksum')
    const githubToken = core.getInput('github-token')
    const signer = core.getInput('signer')
    const version = core.getInput('version')

    const platform = mapOS(os.platform())
    const arch = mapArch(os.arch())

    // windows binaries are zipped
    const archiveSuffix = platform === 'windows' ? '.zip' : '.tar.gz'

    const client = await octokit(githubToken || process.env.GITHUB_TOKEN)

    // if we don't have specific version, get latest release
    let releaseToDownload
    if (version === 'latest' || !version) {
      releaseToDownload = (
        await client.rest.repos.getLatestRelease({ owner, repo })
      ).data
    } else {
      releaseToDownload = (
        await client.rest.repos.getReleaseByTag({ owner, repo, tag: version })
      ).data
    }
    const tag = releaseToDownload.tag_name
    core.setOutput('version', tag)

    // i.e. signore_0.1.2_darwin_x86_64.tar.gz
    const expectedAssetName = `${repo}_${tag.replace('v', '')}_${platform}_${arch}${archiveSuffix}`
    const assetToDownload = releaseToDownload.assets.find(
      (asset) => asset.name === expectedAssetName
    )
    if (assetToDownload === undefined) {
      throw new Error(
        `Unable to find asset matching ${expectedAssetName} in the ${tag} release`
      )
    }

    const url = assetToDownload.url
    const auth = 'token ' + (githubToken || process.env.GITHUB_TOKEN)

    core.debug(`Downloading ${repo} release from ${url}`)
    const downloadedArchive = await tc.downloadTool(url, undefined, auth, {
      accept: 'application/octet-stream'
    })

    if (expectedArchiveChecksum !== '') {
      const downloadedArchiveChecksum = crypto
        .createHash('sha256')
        .update(await fs.readFile(downloadedArchive))
        .digest('hex')
      if (expectedArchiveChecksum !== downloadedArchiveChecksum) {
        core.error(
          `Checksum mismatch: ${downloadedArchiveChecksum} does not match expected checksum ${expectedArchiveChecksum}`
        )
        throw new Error(
          `Checksum mismatch: ${downloadedArchiveChecksum} does not match expected checksum ${expectedArchiveChecksum}`
        )
      }
    }

    core.debug(`Extracting ${repo} release`)
    let pathToCLI
    if (archiveSuffix === '.tar.gz') {
      pathToCLI = await tc.extractTar(downloadedArchive)
    } else {
      pathToCLI = await tc.extractZip(downloadedArchive)
    }
    core.debug(`${repo} CLI path is ${pathToCLI}.`)

    if (!downloadedArchive || !pathToCLI) {
      throw new Error(`Unable to download ${repo} from ${url}`)
    }

    core.addPath(pathToCLI)

    if (signer) {
      core.debug('writing signore config file')
      let configContent = ''
      configContent += signer ? `signer: ${signer}\n` : ''
      await fs.mkdir(path.join(os.homedir(), '.signore'))
      await fs.writeFile(
        path.join(os.homedir(), '.signore', 'config.yaml'),
        configContent
      )
    }

    core.debug('success: signore has been set up!')
  } catch (error) {
    core.error(error.message)
    core.setFailed(error.message)
  }
}

'use strict';

const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const github = require('@actions/github');

const owner = 'hashicorp'
const repo = 'signore'

// copied from setup-terraform
// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [x86_64, 386, arm]
function mapArch (arch) {
    const mappings = {
        x32: '386',
        x64: 'x86_64',
    };
    return mappings[arch] || arch;
}

// copied from setup-terraform
// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS (os) {
    const mappings = {
        win32: 'windows',
    };
    return mappings[os] || os;
}

async function run() {
    try {
        const github_token = core.getInput('github_token');
        const client_id = core.getInput('client_id');
        const client_secret = core.getInput('client_secret');
        const version = core.getInput('version');
        const version_checksum = core.getInput('version_checksum')

        const platform = mapOS(os.platform());
        const arch = mapArch(os.arch());

        const archiveSuffix = platform === 'windows' ? '.zip' : '.tar.gz'

        const octokit = github.getOctokit(github_token)
        // const octokit = github.getOctokit(process.env.GITHUB_TOKEN)

        const releases = await octokit.paginate(octokit.rest.repos.listReleases, {owner, repo});

        var releaseToDownload = undefined
        if (version === 'latest' || !version) {
            releases.sort((a, b) => (a.published_at < b.published_at) ? 1 : -1)
            releaseToDownload = releases[0]
        } else {
            releaseToDownload = releases.filter(release => release.tag_name === version)[0]
        }
        const versionToDownload = releaseToDownload.tag_name

        // i.e. signore_0.1.2_darwin_x86_64.tar.gz
        const expectedAssetName = repo+'_'+versionToDownload.replace('v', '')+'_'+platform+'_'+arch+archiveSuffix
        const assetToDownload = releaseToDownload.assets.filter(asset => asset.name === expectedAssetName)[0]

        url = assetToDownload.browser_download_url
        auth = 'token ' + github_token

        core.debug(`Downloading ${repo} release from ${url}`);
        const downloadedTar = await tc.downloadTool(url, undefined, auth);

        core.debug(`Extracting ${repo} release`);
        const pathToCLI = await tc.extractTar(downloadedTar);
        core.debug(`${repo} CLI path is ${pathToCLI}.`);

        if (!downloadedTar || !pathToCLI) {
          throw new Error(`Unable to download ${repo} from ${url}`);
        }

        core.addPath(pathToCLI);

        core.debug(`success!`)
    } catch (error) {
        core.setFailed(error.message);
    }
}

(async () => {
    await run();
})();
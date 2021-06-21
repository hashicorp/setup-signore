const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const github = require('@actions/github');

async function run() {
    const github_token = core.getInput('github_token');
    const client_id = core.getInput('client_id');
    const client_secret = core.getInput('client_secret');
    const version = core.getInput('version');
    const version_checksum = core.getInput('version_checksum')

    try {
        const pathToCLI = await downloadCLI("https://github.com/hashicorp/signore/releases/download/v0.1.2/signore_0.1.2_linux_x86_64.tar.gz")
        console.log(pathToCLI)
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function downloadCLI(url) {
    core.debug(`Downloading signore tar from ${url}`);
    const downloadedTar = await tc.downloadTool(url);

    core.debug('Extracting signore tar');
    const pathToCLI = await tc.extractTar(downloadedTar);
    core.debug(`signore CLI path is ${pathToCLI}.`);

    if (!downloadedTar || !pathToCLI) {
      throw new Error(`Unable to download signore from ${url}`);
    }

    // const cachedPath = await tc.cacheFile(pathToCLI, 'myExeName', '1.1.0');

    return pathToCLI;
}
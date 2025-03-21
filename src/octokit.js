/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import * as core from '@actions/core'
import { GitHub, getOctokitOptions } from '@actions/github/lib/utils'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'

const rateLimitRetries = 5
const secondaryRateLimitRetries = 5

function client(token) {
  const Octokit = GitHub.plugin(throttling, retry)
  const options = getOctokitOptions(token)

  options.log = {
    debug: core.debug,
    info: core.info,
    warning: core.warning,
    error: core.error
  }

  options.throttle = {
    onRateLimit(retryAfter, options) {
      core.info(
        `Rate limit triggered for request ${options.method} ${options.url} (attempt ${options.request.retryCount}/${rateLimitRetries})`
      )

      if (options.request.retryCount < rateLimitRetries) {
        core.info(`Retrying after ${retryAfter} seconds`)
        return true
      }

      core.warning(
        `Exhausted rate limit retry count (${rateLimitRetries}) for ${options.method} ${options.url}`
      )
    },
    onSecondaryRateLimit(retryAfter, options) {
      core.info(
        `Secondary rate limit triggered for request ${options.method} ${options.url} (attempt ${options.request.retryCount}/${secondaryRateLimitRetries})`
      )

      if (options.request.retryCount < secondaryRateLimitRetries) {
        core.info(`Retrying after ${retryAfter} seconds`)
        return true
      }

      core.warning(
        `Exhausted secondary rate limit retry count (${secondaryRateLimitRetries}) for ${options.method} ${options.url}`
      )
    }
  }

  return new Octokit(options)
}
export default client

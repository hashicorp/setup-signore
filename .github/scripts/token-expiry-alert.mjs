import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const DAY = 24 * 60 * 60 * 1000
const FEED_CHANNEL = '#feed-selfmanaged-releng-alerts'
const URGENT_CHANNEL = '#team-selfmanaged-releng'
const SLACK_MANAGER_ID = 'U09DES9DUGH'
const SLACK_ONCALL_GROUP_ID = 'S09KC1UH2QL'

export function parseExpiration(value) {
  const match =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|GMT|[+-]\d{4})$/.exec(value)
  if (!match) {
    throw new Error('GitHub returned an unrecognized token expiration header.')
  }

  const [, date, time, zone] = match
  const offset =
    zone === 'UTC' || zone === 'GMT'
      ? 'Z'
      : `${zone.slice(0, 3)}:${zone.slice(3)}`
  const timestamp = Date.parse(`${date}T${time}${offset}`)
  const calendarTime = Date.parse(`${date}T${time}Z`)

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(calendarTime) ||
    new Date(calendarTime).toISOString().slice(0, 19) !== `${date}T${time}`
  ) {
    throw new Error('GitHub returned an invalid token expiration date.')
  }

  return timestamp
}

export async function checkToken(
  env,
  {
    fetch: request = globalThis.fetch,
    now = Date.now(),
    pause = sleep,
    log = console.log
  } = {}
) {
  for (const name of [
    'SIGNORE_REPO_GITHUB_TOKEN',
    'SLACK_BOT_TOKEN',
    'GITHUB_REPOSITORY',
    'WORKFLOW_RUN_URL'
  ]) {
    if (!env[name]?.trim()) {
      throw new Error(`Required GitHub Actions secret ${name} is missing.`)
    }
  }

  async function send(url, options, provider) {
    try {
      return await request(url, {
        ...options,
        signal: AbortSignal.timeout(30000)
      })
    } catch {
      throw new Error(
        `${provider} request failed or timed out; check connectivity and rerun.`
      )
    }
  }

  const response = await send(
    'https://api.github.com/user',
    {
      headers: {
        Authorization: `Bearer ${env.SIGNORE_REPO_GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      redirect: 'error'
    },
    'GitHub'
  )

  const subject = `GitHub Actions secret SIGNORE_REPO_GITHUB_TOKEN in ${env.GITHUB_REPOSITORY} (signore private repository access)`
  const invalid = response.status === 401
  let remaining
  let status

  if (invalid) {
    remaining = 0
    status = 'was rejected by GitHub (HTTP 401): expired, revoked, or invalid'
  } else {
    if (response.status !== 200) {
      throw new Error(`GitHub token check failed (HTTP ${response.status}).`)
    }

    const header = response.headers.get(
      'github-authentication-token-expiration'
    )
    if (!header) {
      log(
        'WARNING: GitHub returned no expiration header for SIGNORE_REPO_GITHUB_TOKEN; expiry cannot be determined. Confirm the token expiration policy in GitHub.'
      )
      return
    }

    const expiry = parseExpiration(header)
    remaining = expiry - now
    status =
      remaining <= 0
        ? `expired at ${new Date(expiry).toISOString()}`
        : `expires in ${Math.ceil(remaining / DAY)} day(s), at ${new Date(expiry).toISOString()}`
  }

  if (remaining > 30 * DAY) {
    log(
      'SIGNORE_REPO_GITHUB_TOKEN expires in more than 30 days; no alert needed.'
    )
    return
  }

  const text = `GitHub token-expiry alert: ${subject} ${status}. Rotate the token and update the GitHub Actions secret and any other consumers. Workflow: ${env.WORKFLOW_RUN_URL}`
  const alerts = [{ channel: FEED_CHANNEL, text }]

  if (remaining <= 7 * DAY) {
    alerts.push({
      channel: URGENT_CHANNEL,
      text: `<!subteam^${SLACK_ONCALL_GROUP_ID}> <@${SLACK_MANAGER_ID}> URGENT: ${text}`
    })
  }

  const failures = []
  for (const alert of alerts) {
    try {
      await pause(1000)
      const slack = await send(
        'https://slack.com/api/chat.postMessage',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: JSON.stringify({
            ...alert,
            unfurl_links: false,
            unfurl_media: false
          }),
          redirect: 'error'
        },
        'Slack'
      )

      if (!slack.ok) {
        throw new Error(
          `Slack delivery to ${alert.channel} failed (HTTP ${slack.status}).`
        )
      }

      let result
      try {
        result = await slack.json()
      } catch {
        throw new Error(`Slack returned invalid JSON for ${alert.channel}.`)
      }
      if (result?.ok !== true) {
        throw new Error(
          `Slack rejected delivery to ${alert.channel}; check the bot token, chat:write scope, and channel membership.`
        )
      }
      log(`Sent token-expiry alert to ${alert.channel}.`)
    } catch (error) {
      failures.push(error.message)
    }
  }

  if (invalid) {
    failures.push(
      'SIGNORE_REPO_GITHUB_TOKEN was rejected by GitHub; rotate or repair the token.'
    )
  }
  if (failures.length) {
    throw new Error(failures.join('\n'))
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkToken(process.env).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

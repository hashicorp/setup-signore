import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkToken, parseExpiration } from './token-expiry-alert.mjs'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-30T00:00:00Z')
const ENV = {
  SIGNORE_REPO_GITHUB_TOKEN: 'fake-github-token',
  SLACK_BOT_TOKEN: 'fake-slack-token',
  GITHUB_REPOSITORY: 'hashicorp/setup-signore',
  WORKFLOW_RUN_URL:
    'https://github.com/hashicorp/setup-signore/actions/runs/123'
}

function fixture(
  remaining,
  { githubStatus = 200, header, slackResults = [] } = {}
) {
  const posts = []
  const logs = []
  const pauses = []
  let requestCount = 0
  const expiry =
    header ??
    new Date(NOW + remaining)
      .toISOString()
      .replace('T', ' ')
      .replace('.000Z', ' UTC')

  return {
    posts,
    logs,
    pauses,
    run: (env = ENV) =>
      checkToken(env, {
        now: NOW,
        log: (message) => logs.push(message),
        pause: async (ms) => pauses.push(ms),
        fetch: async (url, options) => {
          requestCount += 1
          assert.ok(options.signal instanceof AbortSignal)
          assert.equal(options.redirect, 'error')
          if (url === 'https://api.github.com/user') {
            assert.equal(requestCount, 1)
            assert.equal(
              options.headers.Authorization,
              `Bearer ${ENV.SIGNORE_REPO_GITHUB_TOKEN}`
            )
            return new Response(null, {
              status: githubStatus,
              headers: expiry
                ? { 'GitHub-Authentication-Token-Expiration': expiry }
                : {}
            })
          }

          assert.equal(url, 'https://slack.com/api/chat.postMessage')
          assert.equal(
            options.headers.Authorization,
            `Bearer ${ENV.SLACK_BOT_TOKEN}`
          )
          const payload = JSON.parse(options.body)
          posts.push(payload)
          assert.equal(payload.unfurl_links, false)
          assert.equal(payload.unfurl_media, false)
          assert.ok(!options.body.includes(ENV.SIGNORE_REPO_GITHUB_TOKEN))
          assert.ok(!options.body.includes(ENV.SLACK_BOT_TOKEN))

          const result = slackResults[posts.length - 1]
          if (result instanceof Error) {
            throw result
          }
          return result ?? Response.json({ ok: true })
        }
      })
  }
}

for (const [label, remaining, count] of [
  ['over 30 days', 30 * DAY + 1000, 0],
  ['exactly 30 days', 30 * DAY, 1],
  ['over 7 days', 7 * DAY + 1000, 1],
  ['exactly 7 days', 7 * DAY, 2],
  ['one second remaining', 1000, 2],
  ['expiry now', 0, 2],
  ['already expired', -DAY, 2]
]) {
  test(label, async () => {
    const f = fixture(remaining)
    await f.run()
    assert.equal(f.posts.length, count)
    assert.deepEqual(f.pauses, Array(count).fill(1000))
    if (count) {
      assert.equal(f.posts[0].channel, '#feed-selfmanaged-releng-alerts')
      assert.match(
        f.posts[0].text,
        /SIGNORE_REPO_GITHUB_TOKEN.*hashicorp\/setup-signore.*signore private repository access/
      )
      assert.ok(f.posts[0].text.includes(ENV.WORKFLOW_RUN_URL))
      if (remaining <= 0) {
        assert.match(f.posts[0].text, /expired/i)
      }
      if (remaining === 1000) {
        assert.match(f.posts[0].text, /expires in 1 day\(s\)/)
      }
    }
    if (count === 2) {
      assert.equal(f.posts[1].channel, '#team-selfmanaged-releng')
      assert.match(f.posts[1].text, /<!subteam\^S09KC1UH2QL> <@U09DES9DUGH>/)
    }
  })
}

test('401 alerts both channels and fails the check', async () => {
  const f = fixture(0, { githubStatus: 401, header: '' })
  await assert.rejects(f.run(), /rejected by GitHub/)
  assert.equal(f.posts.length, 2)
  assert.match(f.posts[0].text, /expired, revoked, or invalid/)
})

for (const status of [403, 429, 500]) {
  test(`HTTP ${status} fails without sending alerts`, async () => {
    const f = fixture(0, { githubStatus: status })
    await assert.rejects(f.run(), new RegExp(`HTTP ${status}`))
    assert.equal(f.posts.length, 0)
  })
}

test('missing expiration header reports that expiry cannot be determined', async () => {
  const f = fixture(0, { header: '' })
  await f.run()
  assert.equal(f.posts.length, 0)
  assert.match(f.logs[0], /WARNING.*expiry cannot be determined/)
})

for (const header of [
  'invalid',
  '2026-02-30 00:00:00 UTC',
  '2026-11-01 00:00:00 +2500'
]) {
  test(`invalid expiry fails: ${header}`, async () => {
    const f = fixture(0, { header })
    await assert.rejects(f.run(), /expiration/i)
    assert.equal(f.posts.length, 0)
  })
}

test('expiration parser handles UTC, GMT, and signed offsets', () => {
  assert.equal(parseExpiration('2026-10-30 00:00:00 UTC'), NOW)
  assert.equal(parseExpiration('2026-10-30 00:00:00 GMT'), NOW)
  assert.equal(parseExpiration('2026-10-30 05:30:00 +0530'), NOW)
  assert.equal(parseExpiration('2026-10-29 17:00:00 -0700'), NOW)
})

for (const [label, result] of [
  ['HTTP failure', new Response(null, { status: 429 })],
  ['API rejection', Response.json({ ok: false, error: 'invalid_auth' })],
  ['missing ok', Response.json({})],
  ['invalid JSON', new Response('not JSON')],
  ['network failure', new Error(`transport contains ${ENV.SLACK_BOT_TOKEN}`)]
]) {
  test(`Slack ${label} fails but still attempts urgent delivery`, async () => {
    const f = fixture(0, { slackResults: [result] })
    await assert.rejects(f.run(), (error) => {
      assert.match(error.message, /Slack/)
      assert.ok(!error.message.includes(ENV.SLACK_BOT_TOKEN))
      return true
    })
    assert.equal(f.posts.length, 2)
    assert.match(f.logs[0], /Sent.*#team-selfmanaged-releng/)
  })
}

test('GitHub network failure is explicit without exposing credentials', async () => {
  await assert.rejects(
    checkToken(ENV, {
      fetch: async () => {
        throw new Error(ENV.SIGNORE_REPO_GITHUB_TOKEN)
      }
    }),
    (error) => {
      assert.match(error.message, /GitHub request failed/)
      assert.ok(!error.message.includes(ENV.SIGNORE_REPO_GITHUB_TOKEN))
      return true
    }
  )
})

for (const name of Object.keys(ENV)) {
  test(`missing ${name} fails before making requests`, async () => {
    await assert.rejects(
      checkToken(
        { ...ENV, [name]: '' },
        {
          fetch: async () => assert.fail('must not make requests')
        }
      ),
      new RegExp(name)
    )
  })
}

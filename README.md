# setup-signore

[![GitHub Super-Linter](https://github.com/hashicorp/setup-signore/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/hashicorp/setup-signore/action/actions/workflows/ci.yml/badge.svg)

Download and configure the [signore](https://github.com/hashicorp/signore)
signing service.

Originally based off of
[setup-terraform](https://github.com/hashicorp/setup-terraform).

This version of the `setup-signore` Action requires a GitHub personal access
token to access GitHub's Releases API and has cross-platform support.

If you only need to install Signore on Linux GitHub Runners, consider using the
[setup-signore-package](https://github.com/hashicorp/setup-signore-package)
Action, which does not require any authentication for repositories and Actions
in HashiCorp enterprise GitHub organizations.

## Usage

Note: see [action.yml](action.yml) for detailed information about configuration
and defaults.

### Install the latest signore client release

```yaml
- name: Install signore
  uses: hashicorp/setup-signore@v2
  with:
    github-token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
```

### Install a specific signore client release, verifying its archive checksum

```yaml
- name: Install signore v0.1.2 and verify checksum
  uses: hashicorp/setup-signore@v2
  with:
    github-token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
    version: v0.1.2
    # https://github.com/hashicorp/signore/releases/download/v0.1.2/signore_0.1.2_darwin_x86_64.tar.gz sha256 hash
    archive-checksum: 6b58be415b3e9b2f77d74f2cf70857819d15df512626658223b2d4a4f3adc404
```

### Install a specific signore client release and configure signer

```yaml
- name: Install signore v0.1.2 with client config
  uses: hashicorp/setup-signore@v2
  with:
    github-token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
    version: v0.1.2
    signer: ${{secrets.SIGNORE_SIGNER}}
```

## Token expiry alerts

The [Token Expiry Alerts workflow](.github/workflows/token-expiry-alert.yml)
checks the GitHub Actions secret `SIGNORE_REPO_GITHUB_TOKEN` daily and can also
be run manually with `workflow_dispatch`. It reads this secret and the Slack bot
token directly from GitHub Actions secrets; it does not use Vault.

Add these repository secrets:

- `SIGNORE_REPO_GITHUB_TOKEN`: the GitHub token used to access the private
  Signore repository.
- `slack_token`: a Slack bot token with `chat:write` permission and access to
  `#feed-selfmanaged-releng-alerts` and `#team-selfmanaged-releng`.

The workflow posts an alert to `#feed-selfmanaged-releng-alerts` when the token
expires within 30 days and escalates to `#team-selfmanaged-releng` when it
expires within 7 days. An expired or rejected token triggers alerts to both
channels and fails the workflow. If GitHub does not return an expiration header,
the workflow warns that it cannot determine expiry. Scheduling begins after the
workflow is present on the default branch.

### FAQ

- What GitHub token do we need?
  - We need to download a signore release from GitHub, and because the
    repository is private we need a token that allows access.
- What checksum are we verifying?
  - After downloading the os/arch specific `tar` or `zip` archive that contains
    the signore binary, we compare its SHA256 hash against the user supplied
    `archive-checksum`
- How do I get a GitHub token with access to the signore repository?
  - TBD
- How do I get access to the signore signing service?
  - For now... talk to `team-selfmanaged-releng`.

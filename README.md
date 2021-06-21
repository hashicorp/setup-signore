## setup-signore

Download and configure the [signore](https://github.com/hashicorp/signore) signing service.

Originally based off of [setup-terraform](https://github.com/hashicorp/setup-terraform).

### Usage

Note: see [action.yml](action.yml) for detailed information about configuration and defaults.

#### Install the latest signore client release

```
- name: Install signore
  uses: hashicorp/setup-signore@v1
  with:
    github_token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
```

#### Install a specific signore client release, verifying its archive checksum

```
- name: Install signore v0.1.2 and verify checksum
  uses: hashicorp/setup-signore@v1
  with:
    github_token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
    version: v0.1.2
    # https://github.com/hashicorp/signore/releases/download/v0.1.2/signore_0.1.2_darwin_x86_64.tar.gz sha256 hash
    archive_checksum: 6b58be415b3e9b2f77d74f2cf70857819d15df512626658223b2d4a4f3adc404
```

#### Install a specific signore client release and configure client_id and client_secret

```
- name: Install signore v0.1.2 with client config
  uses: hashicorp/setup-signore@v1
  with:
    github_token: ${{secrets.GITHUB_TOKEN_WITH_SIGNORE_REPO_ACCESS}}
    version: v0.1.2
    client_id: ${{secrets.SIGNORE_CLIENT_ID}}
    client_secret: ${{secrets.SIGNORE_CLIENT_SECRET}}
```

### FAQ

- What Github token do we need?
  - We need to download a signore release from Github, and because the repository is private we need a token that allows access.
- What checksum are we verifying?
  - After downloading the os/arch specific `tar` or `zip` archive that contains the signore binary, we compare its SHA256 hash against the user supplied `archive_checksum`
- How do I get a Github token with access to the signore repo?
  - TBD
- How do I get access to the signore signing service?
  - For now... talk to [Miles](mcrabill@hashicorp.com)
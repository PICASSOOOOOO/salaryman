# Meshy repository bank for SALARYMAN game art

Reviewed October 5, 2026. This is an internal developer and agent reference for SALARYMAN game-art direction and asset workflows. These repositories are not SALARYMAN marketplace apps: the free My Apps marketplace is for features created specifically within SALARYMAN.

## Highest-fit references

| Repository | What it provides | SALARYMAN fit | License/status |
| --- | --- | --- | --- |
| [meshy-cli](https://github.com/meshy-dev/meshy-cli) | Agent-friendly CLI for Meshy text/image-to-3D, animation, rigging, conversion, and other API tasks. | Strongest direct reference for generating and managing game assets. Requires a Meshy account and API authorization; it is a local CLI, not browser code. | MIT |
| [meshy-mcp-server](https://github.com/meshy-dev/meshy-mcp-server) | MCP server exposing Meshy generation, post-processing, task, and download tools to agents. | Candidate for a deliberately reviewed internal Pablo/game-creation tool connection. | MIT |
| [meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent) | Agent skills and instructions that drive the Meshy CLI; no bundled runtime scripts. | Useful reference for repeatable prompts and asset-generation workflows for creative users and developers. | MIT |
| [game-asset-pipeline](https://github.com/meshy-dev/game-asset-pipeline) | Meshy game-asset workflow examples for Unity, Unreal, Godot, and the REST API. | Directly relevant workflow reference; validate current API behavior and export guidance against Meshy's official docs before relying on details. | MIT |

## Engine and staging bridges

| Repository | What it provides | SALARYMAN fit | License/status |
| --- | --- | --- | --- |
| [meshy-omniverse-bridge](https://github.com/meshy-dev/meshy-omniverse-bridge) | NVIDIA Omniverse / Isaac Sim extension that imports Meshy assets into a local USD stage and can add physics properties. | Could support 3D staging or visual exploration; it is a local editor bridge, not a hosted SALARYMAN API. | MIT |
| [meshy-unity-plugin](https://github.com/meshy-dev/meshy-unity-plugin) | Unity Editor bridge that imports Meshy models into a local Unity project. | Engine-specific reference only; SALARYMAN's desktop game uses a different engine, so this is not a drop-in integration. | The README says GPL-3.0; GitHub metadata reports `NOASSERTION`. Verify the license text before reuse or bundling. |

## Not game-art integrations

| Repository | What it provides | Assessment | License |
| --- | --- | --- | --- |
| [ultar](https://github.com/meshy-dev/ultar) | Zig-based random-access tar / WebDataset indexer and data loader. | Not a Meshy API, game-art tool, or art-direction resource. Keep listed because it was included in the requested set; no current integration need identified. | MIT |
| [overmind](https://github.com/meshy-dev/overmind) | Python/PyTorch shared-memory cache for speeding up model loading. | Not a Meshy asset-generation or game-design tool. Could only be relevant to a separate PyTorch inference workload. | Apache-2.0 |

## Use and integration guardrails

- Treat the CLI and MCP server as candidates, not installed dependencies. Review the exact API operations, authentication, credit costs, and user-consent flow before connecting them to SALARYMAN.
- Never commit Meshy API keys or expose them in browser code. Use the approved secret/connection flow for any later integration.
- A repository's code license does not establish the rights or terms for Meshy-generated models, textures, or animations. Check Meshy's current official terms before shipping generated assets.
- Do not copy or bundle the Unity plugin unless its license has been verified and the engine choice justifies it.
- Keep this developer reference separate from user-created SALARYMAN marketplace features; do not run arbitrary repository code as an installed My Apps feature.
